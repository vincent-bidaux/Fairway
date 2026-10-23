import type { CrawlRun } from '../../shared/types';
import type { Env } from '../env';
import { todayParis } from '../lib/dates';
import { extractIcal } from './extract-ical';
import { extractWithLlm } from './extract-llm';
import { fetchPage } from './fetch-page';
import type { ExtractedEvent, SourceDb } from './types';

const SOURCE_SELECT = `
  SELECT s.id, s.golf_id, s.kind, s.parser, s.label, s.url, s.last_hash, g.name AS golf_name, g.city AS golf_city
  FROM sources s LEFT JOIN golfs g ON g.id = s.golf_id`;

interface Options {
  trigger: 'cron' | 'manual';
  sourceId?: number;
  /** Re-run the LLM even when the page did not change. */
  force?: boolean;
}

interface SourceResult {
  sourceId: number;
  status: 'ok' | 'unchanged' | 'error';
  newCount: number;
  updatedCount: number;
  message?: string;
}

export async function runCrawl(env: Env, opts: Options): Promise<CrawlRun> {
  const db = env.DB;
  const batch = Math.max(1, Number(env.CRAWL_BATCH_SIZE) || 8);
  const minHours = Math.max(1, Number(env.CRAWL_MIN_INTERVAL_HOURS) || 20);

  const run = await db
    .prepare(`INSERT INTO crawl_runs (trigger) VALUES (?) RETURNING id, started_at`)
    .bind(opts.trigger)
    .first<{ id: number; started_at: string }>();

  const sources = opts.sourceId
    ? (await db.prepare(`${SOURCE_SELECT} WHERE s.id = ?`).bind(opts.sourceId).all<SourceDb>()).results
    : (
        await db
          .prepare(
            `${SOURCE_SELECT} WHERE s.enabled = 1
               AND (s.last_run_at IS NULL OR s.last_run_at < datetime('now', ?))
             ORDER BY s.last_run_at IS NOT NULL, s.last_run_at LIMIT ?`,
          )
          .bind(`-${minHours} hours`, batch)
          .all<SourceDb>()
      ).results;

  let golfRefs: { id: number; name: string; city: string }[] | null = null;
  const results: SourceResult[] = [];

  for (const source of sources) {
    try {
      const page = await fetchPage(source.url);
      if (page.hash === source.last_hash && !opts.force && !opts.sourceId) {
        await db
          .prepare(`UPDATE sources SET last_run_at = datetime('now'), last_status = 'unchanged', last_error = NULL WHERE id = ?`)
          .bind(source.id)
          .run();
        results.push({ sourceId: source.id, status: 'unchanged', newCount: 0, updatedCount: 0 });
        continue;
      }

      let events: ExtractedEvent[];
      if (page.kind === 'ical') {
        events = extractIcal(page.raw, source);
      } else {
        if (!source.golf_id && !golfRefs) {
          golfRefs = (
            await db.prepare(`SELECT id, name, city FROM golfs WHERE active = 1 ORDER BY name`).all<{ id: number; name: string; city: string }>()
          ).results;
        }
        events = await extractWithLlm(env, source, page, golfRefs ?? []);
      }

      const { newCount, updatedCount } = await saveEvents(db, source.id, events);
      const total = await db
        .prepare(`SELECT COUNT(*) AS n FROM events WHERE source_id = ? AND status != 'removed' AND start_date >= ?`)
        .bind(source.id, todayParis())
        .first<{ n: number }>();
      await db
        .prepare(
          `UPDATE sources SET last_run_at = datetime('now'), last_status = 'ok', last_error = NULL, last_hash = ?, event_count = ? WHERE id = ?`,
        )
        .bind(page.hash, total?.n ?? 0, source.id)
        .run();
      results.push({ sourceId: source.id, status: 'ok', newCount, updatedCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .prepare(`UPDATE sources SET last_run_at = datetime('now'), last_status = 'error', last_error = ? WHERE id = ?`)
        .bind(message.slice(0, 500), source.id)
        .run();
      results.push({ sourceId: source.id, status: 'error', newCount: 0, updatedCount: 0, message });
    }
  }

  const remaining = opts.sourceId
    ? 0
    : ((
        await db
          .prepare(`SELECT COUNT(*) AS n FROM sources WHERE enabled = 1 AND (last_run_at IS NULL OR last_run_at < datetime('now', ?))`)
          .bind(`-${minHours} hours`)
          .first<{ n: number }>()
      )?.n ?? 0);

  const sum = (k: 'newCount' | 'updatedCount') => results.reduce((a, r) => a + r[k], 0);
  const count = (s: SourceResult['status']) => results.filter((r) => r.status === s).length;
  const finished = await db
    .prepare(
      `UPDATE crawl_runs SET finished_at = datetime('now'), sources_ok = ?, sources_unchanged = ?, sources_failed = ?,
         events_new = ?, events_updated = ?, log = ? WHERE id = ? RETURNING finished_at`,
    )
    .bind(count('ok'), count('unchanged'), count('error'), sum('newCount'), sum('updatedCount'), JSON.stringify(results).slice(0, 20000), run!.id)
    .first<{ finished_at: string }>();

  return {
    id: run!.id,
    trigger: opts.trigger,
    startedAt: run!.started_at,
    finishedAt: finished?.finished_at ?? null,
    sourcesOk: count('ok'),
    sourcesUnchanged: count('unchanged'),
    sourcesFailed: count('error'),
    eventsNew: sum('newCount'),
    eventsUpdated: sum('updatedCount'),
    remaining,
  };
}

export function fingerprint(e: Pick<ExtractedEvent, 'golfId' | 'startDate' | 'title'>) {
  const t = e.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(20\d{2})\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 60);
  return `${e.golfId}|${e.startDate}|${t}`;
}

async function saveEvents(db: D1Database, sourceId: number, events: ExtractedEvent[]) {
  // Deduplicate inside the batch (same competition listed twice on a page).
  const byFp = new Map<string, ExtractedEvent>();
  for (const e of events) byFp.set(fingerprint(e), e);
  const fps = [...byFp.keys()];

  const existing = new Set<string>();
  for (let i = 0; i < fps.length; i += 90) {
    const chunk = fps.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT fingerprint FROM events WHERE fingerprint IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ fingerprint: string }>();
    results.forEach((r) => existing.add(r.fingerprint));
  }

  const stmts: D1PreparedStatement[] = [];
  for (const [fp, e] of byFp) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO events (golf_id, source_id, fingerprint, title, start_date, end_date, start_time, type, format,
             eligibility, price, registration_url, info_url, description, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(fingerprint) DO UPDATE SET
             source_id = excluded.source_id, title = excluded.title, end_date = excluded.end_date,
             start_time = COALESCE(excluded.start_time, events.start_time), type = excluded.type,
             format = COALESCE(excluded.format, events.format), eligibility = COALESCE(excluded.eligibility, events.eligibility),
             price = COALESCE(excluded.price, events.price), registration_url = COALESCE(excluded.registration_url, events.registration_url),
             info_url = COALESCE(excluded.info_url, events.info_url), description = COALESCE(excluded.description, events.description),
             status = excluded.status, last_seen_at = datetime('now'), updated_at = datetime('now')`,
        )
        .bind(
          e.golfId, sourceId, fp, e.title, e.startDate, e.endDate, e.startTime, e.type, e.format,
          e.eligibility, e.price, e.registrationUrl, e.infoUrl, e.description, e.status,
        ),
    );
  }

  // Upcoming events this source published before but no longer lists are hidden.
  // Skipped when nothing was extracted, so a broken page never wipes the agenda.
  if (fps.length > 0) {
    const placeholders = fps.map(() => '?').join(',');
    if (fps.length <= 90) {
      stmts.push(
        db
          .prepare(
            `UPDATE events SET status = 'removed', updated_at = datetime('now')
             WHERE source_id = ? AND start_date >= ? AND status != 'removed' AND fingerprint NOT IN (${placeholders})`,
          )
          .bind(sourceId, todayParis(), ...fps),
      );
    }
  }

  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  const newCount = fps.filter((f) => !existing.has(f)).length;
  return { newCount, updatedCount: fps.length - newCount };
}
