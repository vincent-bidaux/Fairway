import { Hono } from 'hono';
import type { Commune, Department, GolfEvent } from '../../shared/types';
import type { Env } from '../env';
import { boundingBox, haversineKm, round1 } from '../lib/geo';
import { EVENT_SELECT, toEvent, toGolf, type EventRowDb, type GolfRowDb } from '../lib/mappers';
import { todayParis } from '../lib/dates';

export const publicApi = new Hono<{ Bindings: Env }>();

const DEPT_RE = /^\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Area {
  lat?: number;
  lng?: number;
  radius?: number;
  depts?: string[];
}

function parseArea(q: Record<string, string | undefined>): Area {
  const lat = q.lat !== undefined ? Number(q.lat) : undefined;
  const lng = q.lng !== undefined ? Number(q.lng) : undefined;
  const radius = Math.min(Math.max(Number(q.radius ?? 30) || 30, 1), 300);
  const depts = (q.depts ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => DEPT_RE.test(s));
  if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, radius, depts: depts.length ? depts : undefined };
  }
  return { depts: depts.length ? depts : undefined };
}

/** Adds department + bounding-box clauses for golfs aliased as `g`. */
function areaWhere(area: Area, where: string[], params: unknown[]) {
  if (area.depts) {
    where.push(`g.department IN (${area.depts.map(() => '?').join(',')})`);
    params.push(...area.depts);
  }
  if (area.lat !== undefined && area.lng !== undefined && area.radius) {
    const b = boundingBox(area.lat, area.lng, area.radius);
    where.push('g.lat BETWEEN ? AND ? AND g.lng BETWEEN ? AND ?');
    params.push(b.minLat, b.maxLat, b.minLng, b.maxLng);
  }
}

function withDistance<T extends { lat: number | null; lng: number | null }>(
  rows: T[],
  area: Area,
): (T & { distanceKm?: number })[] {
  if (area.lat === undefined || area.lng === undefined) return rows;
  const out: (T & { distanceKm?: number })[] = [];
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const d = haversineKm(area.lat, area.lng, r.lat, r.lng);
    if (d <= (area.radius ?? Infinity)) out.push({ ...r, distanceKm: round1(d) });
  }
  return out;
}

publicApi.get('/departments', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.code, d.name, d.region, COUNT(g.id) AS golf_count
     FROM departments d LEFT JOIN golfs g ON g.department = d.code AND g.active = 1
     GROUP BY d.code ORDER BY d.name COLLATE NOCASE`,
  ).all<{ code: string; name: string; region: string; golf_count: number }>();
  const items: Department[] = results.map((r) => ({
    code: r.code as Department['code'],
    name: r.name,
    region: r.region,
    golfCount: r.golf_count,
  }));
  return c.json(items, 200, { 'Cache-Control': 'public, max-age=3600' });
});

publicApi.get('/events', async (c) => {
  const q = c.req.query();
  const area = parseArea(q);
  const where: string[] = [`e.status != 'removed'`, 'g.active = 1'];
  const params: unknown[] = [];

  const from = q.from && DATE_RE.test(q.from) ? q.from : todayParis();
  // Include multi-day events that started before `from` but are still running.
  where.push('(e.start_date >= ? OR (e.end_date IS NOT NULL AND e.end_date >= ?))');
  params.push(from, from);
  if (q.to && DATE_RE.test(q.to)) {
    where.push('e.start_date <= ?');
    params.push(q.to);
  }
  const types = (q.types ?? '').split(',').filter((t) => /^[a-z_]+$/.test(t));
  if (types.length) {
    where.push(`e.type IN (${types.map(() => '?').join(',')})`);
    params.push(...types);
  }
  if (q.golfId && /^\d+$/.test(q.golfId)) {
    where.push('e.golf_id = ?');
    params.push(Number(q.golfId));
  }
  if (q.q && q.q.trim()) {
    where.push('(e.title LIKE ? OR g.name LIKE ? OR g.city LIKE ?)');
    const like = `%${q.q.trim()}%`;
    params.push(like, like, like);
  }
  areaWhere(area, where, params);

  const limit = Math.min(Number(q.limit ?? 300) || 300, 1000);
  const { results } = await c.env.DB.prepare(
    `${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.start_date, e.start_time LIMIT ?`,
  )
    .bind(...params, limit * 3)
    .all<EventRowDb>();

  let items: GolfEvent[] = withDistance(results.map(toEvent), area);
  items.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0),
  );
  items = items.slice(0, limit);
  return c.json({ items, total: items.length }, 200, { 'Cache-Control': 'public, max-age=300' });
});

publicApi.get('/events/:id{[0-9]+}', async (c) => {
  const row = await c.env.DB.prepare(`${EVENT_SELECT} WHERE e.id = ? AND e.status != 'removed'`)
    .bind(Number(c.req.param('id')))
    .first<EventRowDb>();
  if (!row) return c.json({ error: 'Compétition introuvable' }, 404);
  return c.json(toEvent(row));
});

publicApi.get('/golfs', async (c) => {
  const q = c.req.query();
  const area = parseArea(q);
  const where: string[] = ['g.active = 1'];
  const params: unknown[] = [todayParis()];
  if (q.q && q.q.trim()) {
    where.push('(g.name LIKE ? OR g.city LIKE ?)');
    const like = `%${q.q.trim()}%`;
    params.push(like, like);
  }
  areaWhere(area, where, params);
  const limit = Math.min(Number(q.limit ?? 500) || 500, 1000);
  const { results } = await c.env.DB.prepare(
    `SELECT g.id, g.slug, g.name, g.department, g.city, g.postcode, g.lat, g.lng, g.holes, g.website, g.phone,
            (SELECT COUNT(*) FROM events e WHERE e.golf_id = g.id AND e.status != 'removed' AND e.start_date >= ?) AS upcoming_count
     FROM golfs g WHERE ${where.join(' AND ')} ORDER BY g.department, g.name COLLATE NOCASE LIMIT ${limit}`,
  )
    .bind(...params)
    .all<GolfRowDb>();
  const items = withDistance(results.map(toGolf), area);
  if (area.lat !== undefined) items.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return c.json({ items, total: items.length }, 200, { 'Cache-Control': 'public, max-age=600' });
});

publicApi.get('/golfs/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const golf = await c.env.DB.prepare(
    `SELECT id, slug, name, department, city, postcode, lat, lng, holes, website, phone FROM golfs WHERE id = ? AND active = 1`,
  )
    .bind(id)
    .first<GolfRowDb>();
  if (!golf) return c.json({ error: 'Golf introuvable' }, 404);
  const { results } = await c.env.DB.prepare(
    `${EVENT_SELECT} WHERE e.golf_id = ? AND e.status != 'removed' AND e.start_date >= ? ORDER BY e.start_date LIMIT 200`,
  )
    .bind(id, todayParis())
    .all<EventRowDb>();
  return c.json({ ...toGolf(golf), events: results.map(toEvent) });
});

/** City autocomplete, proxied from the French government geo API (free, no key). */
publicApi.get('/communes', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json([] as Commune[]);
  const isPostcode = /^\d{5}$/.test(q);
  const url = new URL('https://geo.api.gouv.fr/communes');
  url.searchParams.set(isPostcode ? 'codePostal' : 'nom', q);
  url.searchParams.set('fields', 'nom,code,codesPostaux,centre,codeDepartement');
  url.searchParams.set('boost', 'population');
  url.searchParams.set('limit', '10');
  const res = await fetch(url.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) return c.json({ error: 'Recherche de ville indisponible' }, 502);
  const data = (await res.json()) as {
    nom: string;
    code: string;
    codesPostaux?: string[];
    codeDepartement: string;
    centre?: { coordinates: [number, number] };
  }[];
  const items: Commune[] = data
    .filter((d) => d.centre)
    .map((d) => ({
      name: d.nom,
      code: d.code,
      postcode: d.codesPostaux?.[0] ?? null,
      department: d.codeDepartement,
      lng: d.centre!.coordinates[0],
      lat: d.centre!.coordinates[1],
    }));
  return c.json(items, 200, { 'Cache-Control': 'public, max-age=86400' });
});
