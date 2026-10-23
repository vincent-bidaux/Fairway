import { Hono } from 'hono';
import type { Env } from './env';
import { adminApi } from './routes/admin';
import { publicApi } from './routes/public';
import { runCrawl } from './crawl/runner';

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
      runCrawl(env, { trigger: 'cron' }).then((run) =>
        console.log(`crawl #${run.id}: ok=${run.sourcesOk} unchanged=${run.sourcesUnchanged} failed=${run.sourcesFailed} new=${run.eventsNew} remaining=${run.remaining}`),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
