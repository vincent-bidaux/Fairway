import { Hono } from 'hono';
import type { CrawlRun, SourceRow } from '../../shared/types';
import type { Env } from '../env';
import { runCrawl } from '../crawl/runner';
import { discoverSources } from '../crawl/discover';
import { applySeed } from '../seed';
import { todayParis } from '../lib/dates';
import { ensurePlansTable, refreshPlans } from '../plans/osm';
import { isAdminEmail, sessionUser } from '../lib/activity';
import { adminPeopleApi } from './adminPeople';
import { adminFeedbackApi } from './feedback';

export const adminApi = new Hono<{ Bindings: Env }>();

// Accès : compte admin connecté (cookie de session), ou code admin (en-tête Authorization) comme avant.
adminApi.use('*', async (c, next) => {
  const expected = c.env.ADMIN_TOKEN;
  const got = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (expected && got && (await safeEqual(got, expected))) return next();
  const user = await sessionUser(c.env, c.req.raw, c.executionCtx);
  if (user && isAdminEmail(c.env, user.email)) return next();
  if (user) return c.json({ error: 'Réservé à l’administrateur' }, 403);
  return c.json({ error: got ? 'Code admin invalide' : 'Connexion admin requise' }, 401);
});

adminApi.route('/', adminPeopleApi);
adminApi.route('/', adminFeedbackApi);

adminApi.get('/status', async (c) => {
  const db = c.env.DB;
  const today = todayParis();
  const [runs, src, ev, golfs] = await db.batch([
    db.prepare(`SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 10`),
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(last_status = 'ok') AS ok, SUM(last_status = 'unchanged') AS unchanged,
              SUM(last_status = 'error') AS error, SUM(last_run_at IS NULL) AS never
       FROM sources WHERE enabled = 1`,
    ),
    db.prepare(`SELECT COUNT(*) AS total, SUM(start_date >= ? AND status != 'removed') AS upcoming FROM events`).bind(today),
    db.prepare(`SELECT COUNT(*) AS n FROM golfs WHERE active = 1`),
  ]);
  const s = (src.results[0] ?? {}) as Record<string, number | null>;
  const e = (ev.results[0] ?? {}) as Record<string, number | null>;
  return c.json({
    lastRuns: (runs.results as RunDb[]).map(toRun),
    sources: { total: s.total ?? 0, ok: s.ok ?? 0, unchanged: s.unchanged ?? 0, error: s.error ?? 0, never: s.never ?? 0 },
    events: { upcoming: e.upcoming ?? 0, total: e.total ?? 0 },
    golfs: (golfs.results[0] as { n: number }).n,
    llmConfigured: Boolean(c.env.ANTHROPIC_API_KEY),
  });
});

adminApi.get('/sources', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, g.name AS golf_name FROM sources s LEFT JOIN golfs g ON g.id = s.golf_id
     ORDER BY (s.last_status = 'error') DESC, g.name COLLATE NOCASE, s.label`,
  ).all<Record<string, unknown>>();
  const items: SourceRow[] = results.map((r) => ({
    id: r.id as number,
    golfId: (r.golf_id as number | null) ?? null,
    golfName: (r.golf_name as string | null) ?? null,
    kind: r.kind as SourceRow['kind'],
    parser: r.parser as SourceRow['parser'],
    label: r.label as string,
    url: r.url as string,
    enabled: r.enabled === 1,
    lastRunAt: (r.last_run_at as string | null) ?? null,
    lastStatus: (r.last_status as SourceRow['lastStatus']) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    eventCount: (r.event_count as number) ?? 0,
  }));
  return c.json(items);
});

adminApi.post('/sources', async (c) => {
  const b = await c.req.json<{ golfId?: number | null; url?: string; label?: string; kind?: string; parser?: string }>();
  if (!b.url || !/^https?:\/\//.test(b.url)) return c.json({ error: 'URL invalide' }, 400);
  const kind = ['club_page', 'ffgolf', 'ligue', 'comite', 'platform'].includes(b.kind ?? '') ? b.kind : 'club_page';
  const parser = b.parser === 'ical' ? 'ical' : 'llm';
  try {
    const row = await c.env.DB.prepare(
      `INSERT INTO sources (golf_id, kind, parser, label, url) VALUES (?,?,?,?,?) RETURNING id`,
    )
      .bind(b.golfId ?? null, kind, parser, (b.label || b.url).slice(0, 120), b.url)
      .first<{ id: number }>();
    return c.json({ id: row?.id }, 201);
  } catch (err) {
    return c.json({ error: String(err).includes('UNIQUE') ? 'Cette URL existe déjà' : 'Création impossible' }, 400);
  }
});

adminApi.patch('/sources/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ enabled?: boolean; url?: string; label?: string }>();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof b.enabled === 'boolean') { sets.push('enabled = ?'); params.push(b.enabled ? 1 : 0); }
  if (b.url && /^https?:\/\//.test(b.url)) { sets.push('url = ?, last_hash = NULL'); params.push(b.url); }
  if (b.label) { sets.push('label = ?'); params.push(b.label.slice(0, 120)); }
  if (!sets.length) return c.json({ error: 'Rien à modifier' }, 400);
  await c.env.DB.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
  return c.json({ ok: true });
});

adminApi.post('/crawl', async (c) => {
  const b = await c.req.json<{ sourceId?: number; force?: boolean }>().catch(() => ({}) as { sourceId?: number; force?: boolean });
  const run = await runCrawl(c.env, { trigger: 'manual', sourceId: b.sourceId, force: b.force });
  return c.json(run);
});

adminApi.post('/seed', async (c) => c.json(await applySeed(c.env)));

adminApi.post('/discover', async (c) => {
  const report = await discoverSources(c.env, 10);
  return c.json(report);
});

interface RunDb {
  id: number;
  trigger: 'cron' | 'manual';
  started_at: string;
  finished_at: string | null;
  sources_ok: number;
  sources_unchanged: number;
  sources_failed: number;
  events_new: number;
  events_updated: number;
}

function toRun(r: RunDb): CrawlRun {
  return {
    id: r.id,
    trigger: r.trigger,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    sourcesOk: r.sources_ok,
    sourcesUnchanged: r.sources_unchanged,
    sourcesFailed: r.sources_failed,
    eventsNew: r.events_new,
    eventsUpdated: r.events_updated,
    remaining: 0,
  };
}

async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ---------------------------------------------------------------- Plans de parcours (OpenStreetMap)

/** État des plans : nombre de golfs par niveau, erreurs récentes. */
adminApi.get('/plans', async (c) => {
  await ensurePlansTable(c.env);
  const db = c.env.DB;
  const [levels, pending, errors] = await db.batch([
    db.prepare(`SELECT level, COUNT(*) AS n FROM course_plans GROUP BY level`),
    db.prepare(`SELECT COUNT(*) AS n FROM golfs g WHERE g.active = 1 AND NOT EXISTS (SELECT 1 FROM course_plans p WHERE p.golf_id = g.id)`),
    db.prepare(`SELECT g.slug, p.error, p.checked_at FROM course_plans p JOIN golfs g ON g.id = p.golf_id WHERE p.error IS NOT NULL ORDER BY p.checked_at DESC LIMIT 20`),
  ]);
  return c.json({
    levels: Object.fromEntries((levels.results as Array<{ level: string; n: number }>).map((r) => [r.level, r.n])),
    pending: (pending.results[0] as { n: number }).n,
    errors: errors.results,
  });
});

/** Lance l'extraction tout de suite : ?limit=3 (golfs dus), ou ?slug=a,b pour des golfs précis, &force=1 pour tout revérifier. */
adminApi.post('/plans/refresh', async (c) => {
  const slug = c.req.query('slug');
  const results = await refreshPlans(c.env, {
    limit: Math.min(Number(c.req.query('limit') ?? 3) || 3, 10),
    slugs: slug ? slug.split(',') : undefined,
    force: c.req.query('force') === '1',
  });
  return c.json({ results });
});
