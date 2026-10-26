// API « Mes parties » : tout est rattaché au joueur connecté (cookie de session Better Auth).
import { Hono } from 'hono';
import { CLUB_BY_ID, highlightKind, MAX_CLUBS, normalizeBag, type Drill, type Highlight, type HoleEntry, type PlaySession, type Shot, type StatsPeriod, type StatsResponse } from '../../shared/practice';
import { createAuth } from '../auth';
import type { Env } from '../env';
import { clubStats, rangeStats, roundStats, wellbeingStats, type RangeRow, type RoundRow } from '../lib/stats';
import { ensureDemo, isDemo } from '../demo';

type Vars = { userId: string; userName: string };
export const meApi = new Hono<{ Bindings: Env; Variables: Vars }>();

const UUID_RE = /^[0-9a-f-]{8,40}$/i;
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

meApi.use('*', async (c, next) => {
  const auth = await createAuth(c.env, new URL(c.req.url).origin, c.executionCtx);
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s) return c.json({ error: 'Connexion requise' }, 401);
  c.set('userId', s.user.id);
  c.set('userName', s.user.name);
  await next();
});

// ---------------------------------------------------------------- profil
meApi.get('/', async (c) => {
  const uid = c.get('userId');
  const u = await c.env.DB.prepare(`SELECT id, name, email, username, displayUsername, createdAt FROM "user" WHERE id = ?`).bind(uid).first();
  const n = await c.env.DB.prepare(`SELECT kind, COUNT(*) AS n FROM play_sessions WHERE user_id = ? AND deleted_at IS NULL GROUP BY kind`)
    .bind(uid)
    .all<{ kind: string; n: number }>();
  const counts = Object.fromEntries(n.results.map((r) => [r.kind, r.n]));
  return c.json({ user: u, demo: isDemo(uid), rounds: counts.round ?? 0, ranges: counts.range ?? 0 });
});

// ---------------------------------------------------------------- séances
const SESSION_COLS = `s.id, s.kind, s.golf_id, g.name AS golf_name, g.city AS golf_city, s.course, s.place, s.played_at, s.holes,
  s.start_hole, s.tee, s.duration_min, s.balls, s.focus, s.feeling, s.event_id, s.event_title, s.mood, s.body, s.weather, s.notes, s.updated_at`;

meApi.get('/sessions', async (c) => {
  const uid = c.get('userId');
  const kind = c.req.query('kind');
  const where = ['s.user_id = ?', 's.deleted_at IS NULL'];
  const params: unknown[] = [uid];
  if (kind === 'round' || kind === 'range') {
    where.push('s.kind = ?');
    params.push(kind);
  }
  const rows = await c.env.DB.prepare(
    `SELECT ${SESSION_COLS},
       (SELECT SUM(strokes) FROM round_holes h WHERE h.session_id = s.id) AS sum_strokes,
       (SELECT SUM(CASE WHEN strokes IS NOT NULL THEN par END) FROM round_holes h WHERE h.session_id = s.id) AS sum_par,
       (SELECT COUNT(strokes) FROM round_holes h WHERE h.session_id = s.id) AS played,
       (SELECT SUM(putts) FROM round_holes h WHERE h.session_id = s.id) AS sum_putts
     FROM play_sessions s LEFT JOIN golfs g ON g.id = s.golf_id
     WHERE ${where.join(' AND ')} ORDER BY s.played_at DESC LIMIT 500`,
  )
    .bind(...params)
    .all<PlaySession & { sum_strokes: number | null; sum_par: number | null; played: number; sum_putts: number | null }>();
  return c.json(
    rows.results.map(({ sum_strokes, sum_par, played, sum_putts, ...s }) => ({
      ...s,
      summary: s.kind === 'round' ? { strokes: sum_strokes ?? 0, par: sum_par ?? 0, played, putts: sum_putts } : undefined,
    })),
  );
});

async function loadSession(env: Env, uid: string, id: string): Promise<PlaySession | null> {
  const s = await env.DB.prepare(`SELECT ${SESSION_COLS} FROM play_sessions s LEFT JOIN golfs g ON g.id = s.golf_id WHERE s.id = ? AND s.user_id = ? AND s.deleted_at IS NULL`)
    .bind(id, uid)
    .first<PlaySession>();
  if (!s) return null;
  if (s.kind === 'round') {
    const h = await env.DB.prepare(`SELECT hole, par, strokes, putts, fairway, gir, penalties, up_down, sand, shots FROM round_holes WHERE session_id = ? ORDER BY hole`)
      .bind(id)
      .all<HoleEntry & { shots: string | null }>();
    s.hole_entries = h.results.map((r) => ({ ...r, shots: parseShots(r.shots) }));
  } else {
    const d = await env.DB.prepare(`SELECT position, category, label, distance_m, attempts, successes FROM range_drills WHERE session_id = ? ORDER BY position`).bind(id).all<Drill>();
    s.drills = d.results;
  }
  return s;
}

meApi.get('/sessions/:id', async (c) => {
  const s = await loadSession(c.env, c.get('userId'), c.req.param('id'));
  return s ? c.json(s) : c.json({ error: 'Séance introuvable' }, 404);
});

const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const bit = (v: unknown): 0 | 1 | null => (v === 1 || v === true ? 1 : v === 0 || v === false ? 0 : null);

/** Coups d'un trou : positions GPS plausibles (France métropolitaine et DOM larges) et clubs du catalogue, 20 au plus. */
function cleanShots(v: unknown): string | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out: Shot[] = v.slice(0, 20).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const lat = typeof o.lat === 'number' && Math.abs(o.lat) <= 90 ? Math.round(o.lat * 1e6) / 1e6 : null;
    const lon = typeof o.lon === 'number' && Math.abs(o.lon) <= 180 ? Math.round(o.lon * 1e6) / 1e6 : null;
    const club = typeof o.club === 'string' && o.club in CLUB_BY_ID ? o.club : null;
    const dist = typeof o.dist === 'number' && o.dist >= 0 && o.dist <= 700 ? Math.round(o.dist) : null;
    return { lat: lat != null && lon != null ? lat : null, lon: lat != null && lon != null ? lon : null, club, dist };
  });
  return out.some((x) => x.lat != null || x.club) ? JSON.stringify(out) : null;
}

export function parseShots(v: string | null | undefined): Shot[] | null {
  if (!v) return null;
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? (a as Shot[]) : null;
  } catch {
    return null;
  }
}

/** Créer ou remplacer une séance (l'id vient du téléphone : idempotent, rejouable hors ligne). */
meApi.put('/sessions/:id', async (c) => {
  const uid = c.get('userId');
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'Identifiant invalide' }, 400);
  const b = await c.req.json<Partial<PlaySession>>().catch(() => null);
  if (!b || (b.kind !== 'round' && b.kind !== 'range')) return c.json({ error: 'Type de séance invalide' }, 400);
  if (!b.played_at || !DT_RE.test(b.played_at)) return c.json({ error: 'Date invalide' }, 400);

  const owner = await c.env.DB.prepare(`SELECT user_id FROM play_sessions WHERE id = ?`).bind(id).first<{ user_id: string }>();
  if (owner && owner.user_id !== uid) return c.json({ error: 'Séance introuvable' }, 404);

  const golfId = int(b.golf_id, 1, 1e9);
  const course = str(b.course, 60) ?? '';
  const holes = b.kind === 'round' ? (int(b.holes, 1, 18) ?? 18) : null;
  const db = c.env.DB;
  // Compétition liée : on vérifie qu'elle existe et on recopie son titre.
  let eventId = int(b.event_id, 1, 1e9);
  let eventTitle: string | null = null;
  if (eventId) {
    const ev = await db.prepare(`SELECT title FROM events WHERE id = ?`).bind(eventId).first<{ title: string }>();
    if (ev) eventTitle = ev.title;
    else eventId = null;
  }
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO play_sessions (id, user_id, kind, golf_id, course, place, played_at, holes, start_hole, tee, duration_min, balls, focus, feeling, notes,
           event_id, event_title, mood, body, weather)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, golf_id=excluded.golf_id, course=excluded.course, place=excluded.place,
           played_at=excluded.played_at, holes=excluded.holes, start_hole=excluded.start_hole, tee=excluded.tee,
           duration_min=excluded.duration_min, balls=excluded.balls, focus=excluded.focus, feeling=excluded.feeling,
           notes=excluded.notes, event_id=excluded.event_id, event_title=excluded.event_title, mood=excluded.mood, body=excluded.body,
           weather=excluded.weather, deleted_at=NULL, updated_at=datetime('now')`,
      )
      .bind(
        id, uid, b.kind, golfId, course, str(b.place, 120), b.played_at.length === 16 ? `${b.played_at}:00` : b.played_at, holes,
        int(b.start_hole, 1, 18) ?? 1, str(b.tee, 20), int(b.duration_min, 1, 600), int(b.balls, 1, 2000), str(b.focus, 120),
        int(b.feeling, 1, 5), str(b.notes, 2000),
        eventId, eventId ? eventTitle : str(b.event_title, 160), int(b.mood, 1, 5), int(b.body, 1, 5), int(b.weather, 1, 5),
      ),
    db.prepare(`DELETE FROM round_holes WHERE session_id = ?`).bind(id),
    db.prepare(`DELETE FROM range_drills WHERE session_id = ?`).bind(id),
  ];

  const parVotes: Array<{ hole: number; par: number }> = [];
  if (b.kind === 'round') {
    for (const h of (b.hole_entries ?? []).slice(0, 18)) {
      const hole = int(h.hole, 1, 18);
      const par = int(h.par, 3, 6);
      if (!hole || !par) continue;
      const fairway = par >= 4 && ['hit', 'left', 'right', 'short'].includes(h.fairway as string) ? h.fairway : null;
      stmts.push(
        db
          .prepare(`INSERT INTO round_holes (session_id, hole, par, strokes, putts, fairway, gir, penalties, up_down, sand, shots) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, hole, par, int(h.strokes, 1, 20), int(h.putts, 0, 10), fairway, bit(h.gir), int(h.penalties, 0, 10) ?? 0, bit(h.up_down), bit(h.sand), cleanShots(h.shots)),
      );
      parVotes.push({ hole, par });
    }
  } else {
    (b.drills ?? []).slice(0, 30).forEach((d, i) => {
      const label = str(d.label, 80);
      if (!label || !['long', 'approach', 'chip', 'bunker', 'putting'].includes(d.category)) return;
      stmts.push(
        db
          .prepare(`INSERT INTO range_drills (session_id, position, category, label, distance_m, attempts, successes) VALUES (?,?,?,?,?,?,?)`)
          .bind(id, i + 1, d.category, label, int(d.distance_m, 0, 400), int(d.attempts, 0, 1000), int(d.successes, 0, 1000)),
      );
    });
  }

  // Chaque par saisi est un vote : la base des pars s'améliore avec les parties de tous (sauf le compte de démo).
  if (golfId && !isDemo(uid)) {
    for (const v of parVotes) {
      stmts.push(
        db
          .prepare(`INSERT INTO par_votes (user_id, golf_id, course, hole, par) VALUES (?,?,?,?,?)
                    ON CONFLICT(user_id, golf_id, course, hole) DO UPDATE SET par = excluded.par, voted_at = datetime('now')`)
          .bind(uid, golfId, course, v.hole, v.par),
      );
    }
    if (parVotes.length) stmts.push(...consensusStatements(db, golfId, course));
  }

  await db.batch(stmts);
  return c.json(await loadSession(c.env, uid, id));
});

/** Recalcule le par retenu : la valeur la plus votée gagne si elle a au moins 2 votes de plus que la source actuelle. */
function consensusStatements(db: D1Database, golfId: number, course: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO golf_holes (golf_id, course, hole, par, source, votes)
         SELECT golf_id, course, hole, par, 'players', n FROM (
           SELECT golf_id, course, hole, par, COUNT(*) AS n,
                  ROW_NUMBER() OVER (PARTITION BY hole ORDER BY COUNT(*) DESC, MAX(voted_at) DESC) AS rk
           FROM par_votes WHERE golf_id = ? AND course = ? GROUP BY hole, par
         ) WHERE rk = 1
         ON CONFLICT(golf_id, course, hole) DO UPDATE SET
           par = CASE WHEN golf_holes.source = 'players' OR excluded.par = golf_holes.par OR excluded.votes >= 2 THEN excluded.par ELSE golf_holes.par END,
           source = CASE WHEN golf_holes.source <> 'players' AND excluded.par <> golf_holes.par AND excluded.votes >= 2 THEN 'players' ELSE golf_holes.source END,
           votes = excluded.votes, updated_at = datetime('now')`,
      )
      .bind(golfId, course),
  ];
}

meApi.delete('/sessions/:id', async (c) => {
  const r = await c.env.DB.prepare(`UPDATE play_sessions SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(c.req.param('id'), c.get('userId'))
    .run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'Séance introuvable' }, 404);
});

meApi.post('/sessions/:id/restore', async (c) => {
  await c.env.DB.prepare(`UPDATE play_sessions SET deleted_at = NULL WHERE id = ? AND user_id = ?`).bind(c.req.param('id'), c.get('userId')).run();
  return c.json({ ok: true });
});

meApi.get('/golfs/recent', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT golf_id, MAX(played_at) AS last FROM play_sessions WHERE user_id = ? AND deleted_at IS NULL AND golf_id IS NOT NULL
     GROUP BY golf_id ORDER BY last DESC LIMIT 5`,
  )
    .bind(c.get('userId'))
    .all<{ golf_id: number }>();
  return c.json(rows.results.map((r) => r.golf_id));
});

// ---------------------------------------------------------------- stats
const PERIOD_MONTHS: Record<StatsPeriod, number | null> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, all: null };

function shiftMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

async function loadForStats(env: Env, uid: string, from: string | null, to: string) {
  const where = `user_id = ? AND deleted_at IS NULL AND played_at < ?${from ? ' AND played_at >= ?' : ''}`;
  const params = from ? [uid, `${to}T99`, from] : [uid, `${to}T99`];
  const sessions = await env.DB.prepare(
    `SELECT s.id, s.kind, s.played_at, s.duration_min, s.balls, s.mood, s.body, s.weather, g.name AS golf_name FROM play_sessions s LEFT JOIN golfs g ON g.id = s.golf_id WHERE ${where.replace(/user_id|deleted_at|played_at/g, (m) => `s.${m}`)}`,
  )
    .bind(...params)
    .all<{ id: string; kind: string; played_at: string; duration_min: number | null; balls: number | null; golf_name: string | null; mood: number | null; body: number | null; weather: number | null }>();
  const ids = sessions.results.map((s) => s.id);
  const holes = new Map<string, HoleEntry[]>();
  const drills = new Map<string, RangeRow['drills']>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const q = chunk.map(() => '?').join(',');
    const [h, d] = await env.DB.batch([
      env.DB.prepare(`SELECT session_id, hole, par, strokes, putts, fairway, gir, penalties, up_down, sand, shots FROM round_holes WHERE session_id IN (${q})`).bind(...chunk),
      env.DB.prepare(`SELECT session_id, category, label, distance_m, attempts, successes FROM range_drills WHERE session_id IN (${q})`).bind(...chunk),
    ]);
    for (const row of h.results as Array<Omit<HoleEntry, 'shots'> & { session_id: string; shots: string | null }>) {
      const list = holes.get(row.session_id) ?? [];
      list.push({ ...row, shots: parseShots(row.shots) });
      holes.set(row.session_id, list);
    }
    for (const row of d.results as Array<RangeRow['drills'][number] & { session_id: string }>) {
      const list = drills.get(row.session_id) ?? [];
      list.push(row);
      drills.set(row.session_id, list);
    }
  }
  const rounds: RoundRow[] = [];
  const ranges: RangeRow[] = [];
  // Humeur, forme et météo de toutes les séances (parties et practice), saisies ou non.
  const wellbeing: Array<{ played_at: string; kind: 'round' | 'range'; mood: number | null; body: number | null; weather: number | null }> = [];
  for (const s of sessions.results) {
    wellbeing.push({ played_at: s.played_at, kind: s.kind === 'round' ? 'round' : 'range', mood: s.mood, body: s.body, weather: s.weather });
    if (s.kind === 'round') rounds.push({ id: s.id, played_at: s.played_at, golf_name: s.golf_name, mood: s.mood, body: s.body, weather: s.weather, holes: holes.get(s.id) ?? [] });
    else ranges.push({ id: s.id, played_at: s.played_at, duration_min: s.duration_min, balls: s.balls, drills: drills.get(s.id) ?? [] });
  }
  return { rounds, ranges, wellbeing };
}

meApi.get('/stats', async (c) => {
  const uid = c.get('userId');
  const period = (c.req.query('period') ?? '6m') as StatsPeriod;
  const months = PERIOD_MONTHS[period] === undefined ? 6 : PERIOD_MONTHS[period];
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const from = months ? shiftMonths(today, months) : null;
  const cur = await loadForStats(c.env, uid, from, today);
  let prev: Awaited<ReturnType<typeof loadForStats>> | null = null;
  if (months && from) {
    const prevFrom = shiftMonths(from, months);
    const dayBefore = new Date(`${from}T12:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    prev = await loadForStats(c.env, uid, prevFrom, dayBefore.toISOString().slice(0, 10));
  }
  const body: StatsResponse = {
    period,
    from,
    to: today,
    rounds: roundStats(cur.rounds),
    prevRounds: prev ? roundStats(prev.rounds) : null,
    range: rangeStats(cur.ranges),
    prevRange: prev ? rangeStats(prev.ranges) : null,
    clubs: clubStats(cur.rounds),
    wellbeing: wellbeingStats(cur.wellbeing),
    prevWellbeing: prev ? wellbeingStats(prev.wellbeing) : null,
  };
  return c.json(body);
});

// ---------------------------------------------------------------- RGPD
meApi.get('/export', async (c) => {
  const uid = c.get('userId');
  const user = await c.env.DB.prepare(`SELECT id, name, email, username, createdAt FROM "user" WHERE id = ?`).bind(uid).first();
  const list = await c.env.DB.prepare(`SELECT id FROM play_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY played_at`).bind(uid).all<{ id: string }>();
  const sessions = [];
  for (const { id } of list.results) sessions.push(await loadSession(c.env, uid, id));
  c.header('Content-Disposition', `attachment; filename="fairway-mes-parties.json"`);
  return c.json({ exported_at: new Date().toISOString(), user, sessions });
});

meApi.delete('/', async (c) => {
  const uid = c.get('userId');
  if (isDemo(uid)) return c.json({ error: 'Le compte de démo ne peut pas être supprimé' }, 403);
  // Les séances, votes de par, sessions et comptes liés partent en cascade.
  await c.env.DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(uid).run();
  return c.json({ ok: true });
});

// Réinitialiser le compte de démo à la demande (pratique pour les présentations).
meApi.post('/demo/reset', async (c) => {
  if (!isDemo(c.get('userId'))) return c.json({ error: 'Réservé au compte de démo' }, 403);
  return c.json(await ensureDemo(c.env, new URL(c.req.url).origin, { reset: true }));
});

// ---------------------------------------------------------------- profil joueur (carte)
meApi.get('/profile', async (c) => {
  const uid = c.get('userId');
  const p = await c.env.DB.prepare(
    `SELECT p.display_name, p.photo, p.home_golf_id, g.name AS home_golf_name, g.city AS home_golf_city, p.city, p.birth_year,
            p.handedness, p.licence, p.started_year, p.bag
     FROM player_profiles p LEFT JOIN golfs g ON g.id = p.home_golf_id WHERE p.user_id = ?`,
  )
    .bind(uid)
    .first();
  const idx = await c.env.DB.prepare(`SELECT as_of, hcp_index FROM index_history WHERE user_id = ? ORDER BY as_of`).bind(uid).all<{ as_of: string; hcp_index: number }>();
  const { bag, ...rest } = (p ?? { display_name: c.get('userName') }) as Record<string, unknown> & { bag?: string | null };
  let clubs: string[] | null = null;
  try {
    clubs = bag ? normalizeBag(JSON.parse(bag)) : null;
  } catch {
    clubs = null;
  }
  return c.json({ ...rest, bag: clubs, index_history: idx.results });
});

/** Sac du joueur : liste d'identifiants de clubs (14 au plus). */
meApi.put('/bag', async (c) => {
  const uid = c.get('userId');
  const b = await c.req.json<{ bag?: unknown }>().catch(() => ({}) as { bag?: unknown });
  const bag = normalizeBag(b.bag).slice(0, MAX_CLUBS);
  await c.env.DB.prepare(
    `INSERT INTO player_profiles (user_id, bag) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET bag = excluded.bag, updated_at = datetime('now')`,
  )
    .bind(uid, JSON.stringify(bag))
    .run();
  return c.json({ bag });
});

meApi.put('/profile', async (c) => {
  const uid = c.get('userId');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const photo = typeof b.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 400_000 ? b.photo : null;
  const thisYear = new Date().getFullYear();
  await c.env.DB.prepare(
    `INSERT INTO player_profiles (user_id, display_name, photo, home_golf_id, city, birth_year, handedness, licence, started_year)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, photo=excluded.photo, home_golf_id=excluded.home_golf_id,
       city=excluded.city, birth_year=excluded.birth_year, handedness=excluded.handedness, licence=excluded.licence,
       started_year=excluded.started_year, updated_at=datetime('now')`,
  )
    .bind(
      uid, str(b.display_name, 60), photo, int(b.home_golf_id, 1, 1e9), str(b.city, 80), int(b.birth_year, 1900, thisYear),
      b.handedness === 'left' || b.handedness === 'right' ? b.handedness : null, str(b.licence, 20), int(b.started_year, 1900, thisYear),
    )
    .run();
  if (str(b.display_name, 60)) await c.env.DB.prepare(`UPDATE "user" SET name = ? WHERE id = ?`).bind(str(b.display_name, 60), uid).run();
  return c.json({ ok: true });
});

meApi.put('/index/:date', async (c) => {
  const date = c.req.param('date');
  const b = await c.req.json<{ hcp_index?: number }>().catch(() => ({}) as { hcp_index?: number });
  const v = Number(b.hcp_index);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(v) || v < -10 || v > 54) return c.json({ error: 'Index invalide' }, 400);
  await c.env.DB.prepare(`INSERT INTO index_history (user_id, as_of, hcp_index) VALUES (?,?,?) ON CONFLICT(user_id, as_of) DO UPDATE SET hcp_index = excluded.hcp_index`)
    .bind(c.get('userId'), date, Math.round(v * 10) / 10)
    .run();
  return c.json({ ok: true });
});

meApi.delete('/index/:date', async (c) => {
  await c.env.DB.prepare(`DELETE FROM index_history WHERE user_id = ? AND as_of = ?`).bind(c.get('userId'), c.req.param('date')).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- coups de maître
meApi.get('/highlights', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 500);
  const rows = await c.env.DB.prepare(
    `SELECT h.session_id, h.hole, h.par, h.strokes, h.putts, h.fairway, h.gir, h.shots, gh.stroke_index,
            s.played_at, s.golf_id, g.name AS golf_name, g.city AS golf_city, s.course, s.event_title, s.holes, s.weather,
            (SELECT SUM(x.strokes) FROM round_holes x WHERE x.session_id = s.id) AS round_strokes,
            (SELECT SUM(x.strokes - x.par) FROM round_holes x WHERE x.session_id = s.id AND x.strokes IS NOT NULL) AS round_rel
     FROM round_holes h
     JOIN play_sessions s ON s.id = h.session_id
     LEFT JOIN golfs g ON g.id = s.golf_id
     LEFT JOIN golf_holes gh ON gh.golf_id = s.golf_id AND gh.course = s.course AND gh.hole = h.hole
     WHERE s.user_id = ? AND s.deleted_at IS NULL AND h.strokes IS NOT NULL AND (h.strokes < h.par OR h.strokes = 1)
     ORDER BY s.played_at DESC, h.hole DESC LIMIT ${limit}`,
  )
    .bind(c.get('userId'))
    .all<Omit<Highlight, 'kind' | 'shots'> & { shots: string | null }>();
  return c.json(rows.results.map((r) => ({ ...r, shots: parseShots(r.shots), kind: highlightKind(r.par, r.strokes) })));
});
