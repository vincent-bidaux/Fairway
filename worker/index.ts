import { Hono } from 'hono';
import type { Env } from './env';
import { adminApi } from './routes/admin';
import { publicApi } from './routes/public';
import { runCrawl } from './crawl/runner';
import { discoverSources } from './crawl/discover';
import { seedIfOutdated } from './seed';

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Erreur serveur' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/admin', adminApi);
app.route('/api', publicApi);
app.all('/api/*', (c) => c.json({ error: 'Route inconnue' }, 404));

// Everything else is the SPA (served by the assets binding).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        // Fresh database or updated seed file: (re)load the bundled golf list and sources.
        const seeded = await seedIfOutdated(env);
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
