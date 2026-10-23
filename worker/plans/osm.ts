// Plans de parcours tirés d'OpenStreetMap (API Overpass), stockés dans D1 (table course_plans).
// Un golf est revérifié tous les 30 jours. Le cron en traite quelques-uns à chaque passage.
import type { CoursePlan, PlanHole, PlanLayer, PlanLevel, PlanLoop, PlanQuality, Ring, Shape } from '../../shared/plan';
import type { Env } from '../env';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'Fairway/1.0 (+https://fairway.abpq.cc)';
const REFRESH_DAYS = 30;
/** An OSM golf course belongs to the nearest Fairway golf, if it is within this distance (km). */
const MATCH_KM = 1.2;

type LatLon = { lat: number; lon: number };
interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: LatLon[];
  members?: Array<{ type: string; role: string; geometry?: LatLon[] }>;
}

async function overpass(query: string, start = 0): Promise<OsmElement[]> {
  let last = '';
  for (let i = 0; i < ENDPOINTS.length * 2; i++) {
    const url = ENDPOINTS[(start + i) % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return (JSON.parse(text) as { elements: OsmElement[] }).elements;
      last = `${new URL(url).host} ${res.status} ${text.slice(0, 80)}`;
    } catch (e) {
      last = `${new URL(url).host} ${(e as Error).message}`;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Overpass indisponible (${last})`);
}

// ---------------------------------------------------------------- géométrie

const same = (a: LatLon, b: LatLon) => a.lat === b.lat && a.lon === b.lon;

function joinRings(segs: LatLon[][]): LatLon[][] {
  const todo = segs.map((s) => s.slice());
  const out: LatLon[][] = [];
  while (todo.length) {
    let r = todo.shift()!;
    let grew = true;
    while (!same(r[0], r[r.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < todo.length; i++) {
        const s = todo[i];
        if (same(r[r.length - 1], s[0])) r = r.concat(s.slice(1));
        else if (same(r[r.length - 1], s[s.length - 1])) r = r.concat(s.slice().reverse().slice(1));
        else continue;
        todo.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(r);
  }
  return out;
}

function geomOf(e: OsmElement): LatLon[][] {
  if (e.type === 'way') return e.geometry ? [e.geometry] : [];
  return joinRings((e.members ?? []).filter((m) => m.geometry).map((m) => m.geometry!));
}

type XY = [number, number];

/** Douglas-Peucker simplification. */
function simplify(pts: XY[], eps: number): XY[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len < 1e-6 ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
}

const flat = (pts: XY[]): Ring => pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

function classify(t: Record<string, string>): PlanLayer | 'hole' | null {
  if (t.leisure === 'golf_course') return null;
  if (t.golf === 'hole') return 'hole';
  if (t.golf === 'water_hazard' || t.golf === 'lateral_water_hazard' || t.natural === 'water') return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub') return 'scrub';
  const g = t.golf as PlanLayer;
  if (['fairway', 'green', 'tee', 'bunker', 'rough', 'driving_range'].includes(g)) return g;
  return null;
}

/** Groups holes into loops (18 + 9, pitch & putt…) by following each green to the nearest next tee. */
function splitLoops(holes: PlanHole[]): PlanLoop[] {
  const numbered = holes.filter((h) => h.ref != null);
  const groups: PlanHole[][] = [];
  const refs = [...new Set(numbered.map((h) => h.ref!))].sort((a, b) => a - b);
  for (const ref of refs) {
    const cands = numbered.filter((h) => h.ref === ref);
    const open = groups.filter((g) => g[g.length - 1].ref === ref - 1);
    const pairs: Array<[number, number, number]> = [];
    open.forEach((g, gi) =>
      cands.forEach((h, hi) => {
        const a = g[g.length - 1].line;
        pairs.push([Math.hypot(a[a.length - 2] - h.line[0], a[a.length - 1] - h.line[1]), gi, hi]);
      }),
    );
    pairs.sort((x, y) => x[0] - y[0]);
    const usedG = new Set<number>(), usedH = new Set<number>();
    for (const [d, gi, hi] of pairs) {
      if (usedG.has(gi) || usedH.has(hi) || d > 450) continue;
      open[gi].push(cands[hi]);
      usedG.add(gi);
      usedH.add(hi);
    }
    cands.forEach((h, hi) => { if (!usedH.has(hi)) groups.push([h]); });
  }
  const total = (g: PlanHole[]) => g.reduce((s, h) => s + h.len, 0);
  groups.sort((a, b) => b.length - a.length || total(b) - total(a));
  groups.forEach((g, i) => g.forEach((h) => (h.loop = i)));
  return groups.map((g) => ({ holes: g.length, par: g.every((h) => h.par) ? g.reduce((s, h) => s + h.par!, 0) : null, len: total(g) }));
}

function quality(plan: Omit<CoursePlan, 'quality'>, expected: number | null): PlanQuality {
  const main = plan.holes.filter((h) => h.loop === 0);
  const n = main.length;
  const count = (k: PlanLayer) => (plan.layers[k] ?? []).length;
  const q: PlanQuality = {
    level: 'inexistant',
    expected,
    holes: n,
    pars: main.filter((h) => h.par).length,
    hcp: main.filter((h) => h.hcp).length,
    fairways: count('fairway'),
    greens: count('green'),
    tees: count('tee'),
    bunkers: count('bunker'),
    water: count('water'),
  };
  if (n >= 3) {
    const longHoles = main.filter((h) => (h.par ?? (h.len > 230 ? 4 : 3)) >= 4).length;
    const full = n >= Math.min(expected || 9, 18) && q.pars === n && q.greens >= 0.8 * n && (longHoles === 0 || q.fairways >= 0.5 * longHoles);
    q.level = full ? 'complet' : 'partiel';
  }
  return q;
}

const ref = (c: OsmElement) => `${c.type}/${c.id}`;

function buildPlan(golf: GolfRow, courses: OsmElement[], elements: OsmElement[]): CoursePlan | null {
  const outlines = elements.filter((e) => e.tags?.leisure === 'golf_course');
  const pts0 = outlines.flatMap(geomOf).flat();
  if (!pts0.length) return null;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of pts0) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const lat0 = (minLat + maxLat) / 2, lon0 = (minLon + maxLon) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180), M = 111_320;
  const P = (p: LatLon): XY => [(p.lon - lon0) * k * M, -(p.lat - lat0) * M];
  const enc = (ring: LatLon[], eps = 0.8) => flat(simplify(ring.map(P), eps));
  // forests and lakes much larger than the course are dropped (they would swamp the drawing)
  const padLat = (maxLat - minLat) * 0.3, padLon = (maxLon - minLon) * 0.3;
  const near = (rs: LatLon[][]) =>
    rs.every((r) => r.every((p) => p.lat >= minLat - padLat && p.lat <= maxLat + padLat && p.lon >= minLon - padLon && p.lon <= maxLon + padLon));

  const layers: CoursePlan['layers'] = {};
  const holes: PlanHole[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    if (e.type === 'node' || !e.tags || seen.has(ref(e))) continue;
    seen.add(ref(e));
    const c = classify(e.tags);
    if (!c) continue;
    if (c === 'hole') {
      if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
      const line = e.geometry.map(P);
      let len = 0;
      for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      const num = (v?: string) => {
        const n = parseInt(v ?? '', 10);
        return Number.isFinite(n) ? n : null;
      };
      holes.push({ ref: num(e.tags.ref), par: num(e.tags.par), hcp: num(e.tags.handicap), len: Math.round(len), loop: -1, line: flat(simplify(line, 0.5)) });
      continue;
    }
    const rings = geomOf(e);
    if (!rings.length) continue;
    if ((c === 'water' || c === 'wood' || c === 'scrub') && !e.tags.golf && !near(rings)) continue;
    const shape: Shape = rings.map((r) => enc(r)).filter((r) => r.length >= 6);
    if (shape.length) (layers[c] ??= []).push(shape);
  }
  holes.sort((a, b) => (a.ref ?? 99) - (b.ref ?? 99));
  const loops = splitLoops(holes);
  const base = {
    v: 1 as const,
    slug: golf.slug,
    name: golf.name,
    osm: courses.map(ref),
    updated: new Date().toISOString().slice(0, 10),
    outline: outlines.map((o) => geomOf(o).map((r) => enc(r, 1.5))),
    layers,
    holes,
    loops,
  };
  return { ...base, quality: quality(base, golf.holes) };
}

function distToBox(lat: number, lon: number, b: NonNullable<OsmElement['bounds']>) {
  const k = Math.cos((lat * Math.PI) / 180);
  const dy = lat < b.minlat ? b.minlat - lat : lat > b.maxlat ? lat - b.maxlat : 0;
  const dx = lon < b.minlon ? b.minlon - lon : lon > b.maxlon ? lon - b.maxlon : 0;
  return Math.hypot(dy * 111.32, dx * 111.32 * k);
}

// ---------------------------------------------------------------- collecte

interface GolfRow {
  id: number;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  holes: number | null;
}

export interface PlanResult {
  slug: string;
  level: PlanLevel | 'none' | 'error';
  detail: string;
}

export async function ensurePlansTable(env: Env) {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS course_plans (golf_id INTEGER PRIMARY KEY REFERENCES golfs(id) ON DELETE CASCADE, level TEXT NOT NULL CHECK (level IN ('complet','partiel','inexistant','none')), plan TEXT, osm TEXT, checked_at TEXT NOT NULL DEFAULT (datetime('now')), error TEXT)",
  );
}

/** Refreshes the plans of the golfs that are due (never checked, or older than 30 days). */
export async function refreshPlans(env: Env, opts: { limit?: number; slugs?: string[]; force?: boolean } = {}): Promise<PlanResult[]> {
  const db = env.DB;
  await ensurePlansTable(env);
  const all = (
    await db.prepare(`SELECT id, slug, name, lat, lng, holes FROM golfs WHERE active = 1 AND lat IS NOT NULL AND lng IS NOT NULL`).all<GolfRow>()
  ).results;
  let due: GolfRow[];
  if (opts.slugs?.length) {
    due = all.filter((g) => opts.slugs!.includes(g.slug));
  } else {
    const { results } = await db
      .prepare(
        `SELECT g.id FROM golfs g LEFT JOIN course_plans p ON p.golf_id = g.id
         WHERE g.active = 1 AND g.lat IS NOT NULL AND (p.golf_id IS NULL OR ? OR p.checked_at < datetime('now', ?))
         ORDER BY p.checked_at IS NOT NULL, p.checked_at, g.id LIMIT ?`,
      )
      .bind(opts.force ? 1 : 0, `-${REFRESH_DAYS} days`, opts.limit ?? 3)
      .all<{ id: number }>();
    const ids = new Set(results.map((r) => r.id));
    due = all.filter((g) => ids.has(g.id));
  }

  const out: PlanResult[] = [];
  for (const [i, golf] of due.entries()) {
    try {
      out.push(await refreshOne(env, golf, all, i));
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await db
        .prepare(
          `INSERT INTO course_plans (golf_id, level, error, checked_at) VALUES (?, 'none', ?, datetime('now', '-${REFRESH_DAYS - 1} days'))
           ON CONFLICT(golf_id) DO UPDATE SET error = excluded.error, checked_at = datetime('now', '-${REFRESH_DAYS - 1} days')`,
        )
        .bind(golf.id, msg)
        .run();
      out.push({ slug: golf.slug, level: 'error', detail: msg });
    }
  }
  return out;
}

async function refreshOne(env: Env, golf: GolfRow, all: GolfRow[], i: number): Promise<PlanResult> {
  const db = env.DB;
  const around = await overpass(`[out:json][timeout:50];nwr["leisure"="golf_course"](around:1600,${golf.lat},${golf.lng});out tags bb;`, i);
  // keep the OSM courses whose nearest Fairway golf is this one
  const mine = around.filter((c) => {
    if (!c.bounds) return false;
    const d = distToBox(golf.lat, golf.lng, c.bounds);
    if (d > MATCH_KM) return false;
    return all.every((o) => o.id === golf.id || distToBox(o.lat, o.lng, c.bounds!) >= d);
  });
  if (!mine.length) {
    await db
      .prepare(
        `INSERT INTO course_plans (golf_id, level, plan, osm, checked_at, error) VALUES (?, 'none', NULL, NULL, datetime('now'), NULL)
         ON CONFLICT(golf_id) DO UPDATE SET level = 'none', plan = NULL, osm = NULL, checked_at = datetime('now'), error = NULL`,
      )
      .bind(golf.id)
      .run();
    return { slug: golf.slug, level: 'none', detail: 'aucun tracé de golf dans OSM' };
  }

  const sel = mine.map((c) => `${c.type === 'relation' ? 'rel' : 'way'}(${c.id});`).join('');
  const elements = await overpass(
    `[out:json][timeout:90];(${sel})->.c;.c out geom;.c map_to_area->.a;(nwr(area.a)["golf"];nwr(area.a)["natural"~"^(water|wood|scrub)$"];nwr(area.a)["landuse"="forest"];);out geom;`,
    i,
  );
  const plan = buildPlan(golf, mine, elements);
  if (!plan) throw new Error('contour OSM vide');
  const level = plan.quality.level;
  await db
    .prepare(
      `INSERT INTO course_plans (golf_id, level, plan, osm, checked_at, error) VALUES (?, ?, ?, ?, datetime('now'), NULL)
       ON CONFLICT(golf_id) DO UPDATE SET level = excluded.level, plan = excluded.plan, osm = excluded.osm, checked_at = excluded.checked_at, error = NULL`,
    )
    .bind(golf.id, level, JSON.stringify(plan), plan.osm.join(' '))
    .run();

  // Pars of the main loop feed the shared par table, without overriding club, ffgolf or player data.
  const pars = plan.holes.filter((h) => h.loop === 0 && h.ref && h.ref >= 1 && h.ref <= 18 && h.par && h.par >= 3 && h.par <= 6);
  if (pars.length >= 9) {
    await db.batch(
      pars.map((h) =>
        db
          .prepare(
            `INSERT INTO golf_holes (golf_id, course, hole, par, stroke_index, source, source_url) VALUES (?, '', ?, ?, ?, 'osm', ?)
             ON CONFLICT(golf_id, course, hole) DO UPDATE SET par = excluded.par, stroke_index = excluded.stroke_index, updated_at = datetime('now')
             WHERE golf_holes.source = 'osm'`,
          )
          .bind(golf.id, h.ref, h.par, h.hcp && h.hcp <= 18 ? h.hcp : null, `https://www.openstreetmap.org/${plan.osm[0]}`),
      ),
    );
  }
  const q = plan.quality;
  return { slug: golf.slug, level, detail: `${q.holes}/${golf.holes ?? '?'} trous, ${q.pars} pars, ${q.fairways} fairways, ${q.greens} greens` };
}
