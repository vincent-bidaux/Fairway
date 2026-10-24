import { Hono } from 'hono';
import type { Env } from './env';
import { adminApi } from './routes/admin';
import { publicApi } from './routes/public';
import { runCrawl } from './crawl/runner';
import { discoverSources } from './crawl/discover';
import { seedIfOutdated } from './seed';
import { createAuth } from './auth';
import { ensureDemo } from './demo';
import { meApi } from './routes/me';
import { refreshPlans } from './plans/osm';

/** Must match the second cron in wrangler.jsonc. */
const PLANS_CRON = '*/5 * * * *';

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Erreur serveur' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/admin', adminApi);

// Comptes joueurs (Better Auth) : code par e-mail, compte de démo.
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  const origin = new URL(c.req.url).origin;
  // Le compte de démo est créé (et rempli) au premier essai de connexion.
  if (c.req.path.endsWith('/sign-in/username')) await ensureDemo(c.env, origin);
  const auth = await createAuth(c.env, origin, c.executionCtx);
  return auth.handler(c.req.raw);
});
app.route('/api/me', meApi);
app.route('/api', publicApi);
app.all('/api/*', (c) => c.json({ error: 'Route inconnue' }, 404));

// Everything else is the SPA (served by the assets binding).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === PLANS_CRON) {
      // Plans de parcours OSM : quelques golfs à chaque passage (jamais vérifiés, puis tous les 30 jours).
      ctx.waitUntil(
        refreshPlans(env, { limit: 3 })
          .then((r) => r.length && console.log('plans', JSON.stringify(r)))
          .catch((e) => console.error('plans', e)),
      );
      return;
    }
    ctx.waitUntil(
      (async () => {
        // Fresh database or updated seed file: (re)load the bundled golf list and sources.
        const seeded = await seedIfOutdated(env);
        // Chaque nuit vers 3 h (heure de Paris), le compte de démo repart de ses 30 séances.
        const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
        if (hour === 3) console.log('demo reset', JSON.stringify(await ensureDemo(env, 'https://fairway.abpq.cc', { reset: true })));
        if (seeded) console.log('seeded', JSON.stringify(seeded));
        const run = await runCrawl(env, { trigger: 'cron' });
        console.log(`crawl #${run.id}: ok=${run.sourcesOk} unchanged=${run.sourcesUnchanged} failed=${run.sourcesFailed} new=${run.eventsNew} remaining=${run.remaining}`);
        // Find calendar pages for golfs that have none yet (a few per hour).
        const found = await discoverSources(env, 4);
        if (found.length) console.log('discover', JSON.stringify(found));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
