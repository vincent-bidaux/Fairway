import golfsSeed from '../db/seed/golfs.json';
import sourcesSeed from '../db/seed/sources.json';
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
}

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
          `INSERT INTO golfs (slug, name, department, city, postcode, lat, lng, holes, website, phone, ffgolf_id, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(slug) DO UPDATE SET name=excluded.name, department=excluded.department, city=excluded.city,
             postcode=excluded.postcode, lat=excluded.lat, lng=excluded.lng, holes=excluded.holes, website=excluded.website,
             phone=excluded.phone, ffgolf_id=COALESCE(excluded.ffgolf_id, golfs.ffgolf_id), updated_at=datetime('now')`,
        )
        .bind(slug, g.name, g.department, g.city, g.postcode, g.lat, g.lng, g.holes, g.website, g.phone, g.ffgolf_id, g.notes),
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
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  const count = await db.prepare(`SELECT (SELECT COUNT(*) FROM golfs) AS golfs, (SELECT COUNT(*) FROM sources) AS sources`).first<{
    golfs: number;
    sources: number;
  }>();
  return count;
}

export async function seedIfEmpty(env: Env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM golfs`).first<{ n: number }>();
  if ((row?.n ?? 0) > 0) return null;
  return applySeed(env);
}
