import golfsSeed from '../db/seed/golfs.json';
import sourcesSeed from '../db/seed/sources.json';
import holesSeed from '../db/seed/golf-holes.json';
import type { Env } from './env';

interface SeedGolf {
  name: string;
  department: string;
  city: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  holes: number | null;
  website: string | null;
  phone: string | null;
  ffgolf_id: string | null;
  competitions_url: string | null;
  notes: string | null;
  email?: string | null;
  address?: string | null;
  photo_url?: string | null;
}

/** Bump when db/seed/*.json changes: the next cron re-applies the seed (upsert, nothing is deleted). */
export const SEED_VERSION = '2026-10-24.1';

interface SeedSource {
  label: string;
  kind: string;
  parser: string;
  url: string;
  golf?: string;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Upserts the bundled reference data (golfs by slug, sources by URL). Safe to run repeatedly. */
export async function applySeed(env: Env) {
  const db = env.DB;
  const golfs = golfsSeed as SeedGolf[];
  const seen = new Set<string>();
  const stmts: D1PreparedStatement[] = [];

  for (const g of golfs) {
    let slug = slugify(`${g.name}-${g.city}`);
    while (seen.has(slug)) slug += '-2';
    seen.add(slug);
    stmts.push(
      db
        .prepare(
          `INSERT INTO golfs (slug, name, department, city, postcode, lat, lng, holes, website, phone, ffgolf_id, notes, email, address, photo_url)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(slug) DO UPDATE SET name=excluded.name, department=excluded.department, city=excluded.city,
             postcode=excluded.postcode, lat=excluded.lat, lng=excluded.lng, holes=excluded.holes, website=excluded.website,
             phone=excluded.phone, ffgolf_id=COALESCE(excluded.ffgolf_id, golfs.ffgolf_id), email=excluded.email,
             address=excluded.address, photo_url=excluded.photo_url, updated_at=datetime('now')`,
        )
        .bind(
          slug, g.name, g.department, g.city, g.postcode, g.lat, g.lng, g.holes, g.website, g.phone, g.ffgolf_id, g.notes,
          g.email ?? null, g.address ?? null, g.photo_url ?? null,
        ),
    );
    if (g.competitions_url) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO sources (golf_id, kind, parser, label, url)
             VALUES ((SELECT id FROM golfs WHERE slug = ?), 'club_page', ?, ?, ?) ON CONFLICT(url) DO NOTHING`,
          )
          .bind(slug, /\.ics($|\?)/i.test(g.competitions_url) ? 'ical' : 'llm', `${g.name} — calendrier`, g.competitions_url),
      );
    }
  }
  for (const s of sourcesSeed as SeedSource[]) {
    stmts.push(
      db
        .prepare(`INSERT INTO sources (golf_id, kind, parser, label, url) VALUES (NULL, ?, ?, ?, ?) ON CONFLICT(url) DO NOTHING`)
        .bind(s.kind, s.parser, s.label, s.url),
    );
  }
  // Pars officiels (cartes de score des clubs). Une correction votée par les joueurs n'est jamais écrasée.
  for (const [slug, h] of Object.entries(holesSeed as Record<string, { source?: string; source_url: string; pars: number[]; stroke_index: number[] | null }>)) {
    h.pars.forEach((par, i) => {
      stmts.push(
        db
          .prepare(
            `INSERT INTO golf_holes (golf_id, course, hole, par, stroke_index, source, source_url)
             SELECT id, '', ?, ?, ?, ?, ? FROM golfs WHERE slug = ?
             ON CONFLICT(golf_id, course, hole) DO UPDATE SET par = excluded.par, stroke_index = excluded.stroke_index,
               source = excluded.source, source_url = excluded.source_url, updated_at = datetime('now')
             WHERE golf_holes.source <> 'players'`,
          )
          .bind(i + 1, par, h.stroke_index?.[i] ?? null, h.source === 'osm' ? 'osm' : 'club', h.source_url, slug),
      );
    });
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  const count = await db.prepare(`SELECT (SELECT COUNT(*) FROM golfs) AS golfs, (SELECT COUNT(*) FROM sources) AS sources`).first<{
    golfs: number;
    sources: number;
  }>();
  return count;
}

/** Applies the bundled seed on a fresh database, or when SEED_VERSION changed since the last application. */
export async function seedIfOutdated(env: Env) {
  const row = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'seed_version'`).first<{ value: string }>();
  if (row?.value === SEED_VERSION) return null;
  const result = await applySeed(env);
  await env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(SEED_VERSION)
    .run();
  return result;
}
