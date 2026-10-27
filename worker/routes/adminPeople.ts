// Zone admin « testeurs » : comptes, appareils, usage, volume saisi, journal d'activité.
// Monté sous /api/admin (protégé par le middleware de routes/admin.ts).
import { Hono } from 'hono';
import type {
  ActivityItem,
  AdminOverview,
  AdminPeople,
  AuthSessionRow,
  DayPoint,
  DeviceDetail,
  DeviceRow,
  PersonDetail,
  PersonRow,
  PlayRow,
  Ranked,
  Usage,
  Volume,
} from '../../shared/admin';
import { DEMO_USER_ID, isDemo } from '../demo';
import type { Env } from '../env';
import { ensureActivitySchema, isAdminEmail } from '../lib/activity';
import { ensureFeedbackSchema, threadOf } from './feedback';

export const adminPeopleApi = new Hono<{ Bindings: Env }>();

adminPeopleApi.use('*', async (c, next) => {
  await ensureActivitySchema(c.env);
  await ensureFeedbackSchema(c.env);
  await next();
});

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? 0 : Number(v) || 0);
const str = (v: unknown) => (v == null ? null : String(v));

/** Décalage Europe/Paris pour regrouper par jour en SQL (« +1 hours » ou « +2 hours »). */
export function parisOffset(at = new Date()): string {
  const p = new Date(at.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const u = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return `+${Math.round((p.getTime() - u.getTime()) / 36e5)} hours`;
}

export const sinceIso = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
export const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');

/** Libellés lisibles des écrans regroupés par famille (vue d'ensemble). */
const FAMILY_LABEL: Record<string, string> = {
  event: 'Fiches compétition',
  golf: 'Fiches golf',
  session: 'Fiches séance',
  sessions: 'Liste des séances',
  'session-editor': 'Saisie de séance',
  stat: 'Détails des stats',
  'admin-person': 'Admin · fiche testeur',
  'admin-device': 'Admin · fiche appareil',
};
const FAMILY_SQL = `CASE WHEN screen LIKE 'tab/%' OR screen LIKE 'sheet/%' OR instr(screen, '/') = 0 THEN screen
  ELSE substr(screen, 1, instr(screen, '/') - 1) END`;

export async function adminIds(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT id, email FROM "user"`).all<{ id: string; email: string }>();
  return results.filter((u) => isAdminEmail(env, u.email)).map((u) => u.id);
}

/** Clause qui écarte l'activité des comptes admin (et de leurs appareils, même avant connexion). */
export function notAdmin(ids: string[], alias = 'a'): { sql: string; params: string[] } {
  if (!ids.length) return { sql: '1 = 1', params: [] };
  return {
    sql: `(${alias}.user_id IS NULL OR ${alias}.user_id NOT IN (${ph(ids.length)}))
      AND ${alias}.device_id NOT IN (SELECT device_id FROM devices WHERE user_id IN (${ph(ids.length)}))`,
    params: [...ids, ...ids],
  };
}

// ---------------------------------------------------------------- briques communes

function usageOf(r: Row | undefined): Usage {
  return {
    visits: num(r?.visits),
    activeDays: num(r?.days),
    timeMs: num(r?.time),
    taps: num(r?.taps),
    firstSeen: str(r?.first_seen),
    lastSeen: str(r?.last_seen),
    lastScreen: str(r?.last_screen),
  };
}

/** Usage groupé par `col` (user_id ou device_id), pour les clés données (toutes si null). */
export async function usageBy(env: Env, col: 'user_id' | 'device_id', keys: string[] | null): Promise<Map<string, Usage>> {
  const off = parisOffset();
  const where = keys ? `a.${col} IN (${ph(keys.length)})` : `a.${col} IS NOT NULL`;
  if (keys && !keys.length) return new Map();
  const { results } = await env.DB.prepare(
    `SELECT a.${col} AS k, COUNT(DISTINCT a.visit_id) AS visits, COUNT(DISTINCT date(a.ts, ?)) AS days,
       SUM(CASE WHEN a.type = 'view' THEN a.duration_ms ELSE 0 END) AS time, SUM(a.type = 'tap') AS taps,
       MIN(a.ts) AS first_seen, MAX(a.ts) AS last_seen,
       (SELECT a2.screen FROM activity a2 WHERE a2.${col} = a.${col} AND a2.type = 'view' ORDER BY a2.ts DESC LIMIT 1) AS last_screen
     FROM activity a WHERE ${where} GROUP BY a.${col}`,
  )
    .bind(off, ...(keys ?? []))
    .all<Row>();
  return new Map(results.map((r) => [String(r.k), usageOf(r)]));
}

const emptyVolume = (): Volume => ({ rounds: 0, ranges: 0, holes: 0, shots: 0, drills: 0, parVotes: 0, indexEntries: 0, deleted: 0 });
const SHOTS_SQL = `CASE WHEN h.shots IS NOT NULL AND json_valid(h.shots) THEN json_array_length(h.shots) ELSE 0 END`;

/** Volume saisi par compte (ou total si `userId` absent et `total` vrai). */
async function volumes(env: Env, userId?: string, exclude: string[] = []): Promise<Map<string, Volume>> {
  const db = env.DB;
  const f = userId ? 'WHERE s.user_id = ?' : exclude.length ? `WHERE s.user_id NOT IN (${ph(exclude.length)})` : '';
  const f2 = userId ? 'WHERE user_id = ?' : exclude.length ? `WHERE user_id NOT IN (${ph(exclude.length)})` : '';
  const p = userId ? [userId] : exclude;
  const [plays, holes, drills, votes, idx] = await db.batch([
    db.prepare(
      `SELECT s.user_id AS u, SUM(s.kind = 'round' AND s.deleted_at IS NULL) AS rounds, SUM(s.kind = 'range' AND s.deleted_at IS NULL) AS ranges,
         SUM(s.deleted_at IS NOT NULL) AS deleted FROM play_sessions s ${f} GROUP BY s.user_id`,
    ).bind(...p),
    db.prepare(
      `SELECT s.user_id AS u, COUNT(h.strokes) AS holes, SUM(${SHOTS_SQL}) AS shots
       FROM round_holes h JOIN play_sessions s ON s.id = h.session_id ${f ? f + ' AND' : 'WHERE'} s.deleted_at IS NULL GROUP BY s.user_id`,
    ).bind(...p),
    db.prepare(
      `SELECT s.user_id AS u, COUNT(*) AS drills FROM range_drills d JOIN play_sessions s ON s.id = d.session_id
       ${f ? f + ' AND' : 'WHERE'} s.deleted_at IS NULL GROUP BY s.user_id`,
    ).bind(...p),
    db.prepare(`SELECT user_id AS u, COUNT(*) AS n FROM par_votes ${f2} GROUP BY user_id`).bind(...p),
    db.prepare(`SELECT user_id AS u, COUNT(*) AS n FROM index_history ${f2} GROUP BY user_id`).bind(...p),
  ]);
  const out = new Map<string, Volume>();
  const get = (u: unknown) => {
    const k = String(u);
    if (!out.has(k)) out.set(k, emptyVolume());
    return out.get(k)!;
  };
  for (const r of plays.results as Row[]) Object.assign(get(r.u), { rounds: num(r.rounds), ranges: num(r.ranges), deleted: num(r.deleted) });
  for (const r of holes.results as Row[]) Object.assign(get(r.u), { holes: num(r.holes), shots: num(r.shots) });
  for (const r of drills.results as Row[]) get(r.u).drills = num(r.drills);
  for (const r of votes.results as Row[]) get(r.u).parVotes = num(r.n);
  for (const r of idx.results as Row[]) get(r.u).indexEntries = num(r.n);
  return out;
}

function sumVolumes(list: Iterable<Volume>): Volume {
  const t = emptyVolume();
  for (const v of list) for (const k of Object.keys(t) as (keyof Volume)[]) t[k] += v[k];
  return t;
}

/** Série jour par jour, jours vides compris ; regroupée par semaine au-delà de 92 jours. */
async function daily(env: Env, days: number, filter: { sql: string; params: unknown[] }): Promise<DayPoint[]> {
  const off = parisOffset();
  const { results } = await env.DB.prepare(
    `SELECT date(a.ts, ?) AS day, COUNT(DISTINCT a.user_id) AS people, COUNT(DISTINCT a.device_id) AS devices,
       SUM(CASE WHEN a.type = 'view' THEN a.duration_ms ELSE 0 END) AS time
     FROM activity a WHERE a.ts >= ? AND ${filter.sql} GROUP BY day`,
  )
    .bind(off, sinceIso(days), ...filter.params)
    .all<Row>();
  const byDay = new Map(results.map((r) => [String(r.day), r]));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  const pts: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = fmt.format(new Date(Date.now() - i * 864e5));
    const r = byDay.get(day);
    pts.push({ day, people: num(r?.people), devices: num(r?.devices), timeMs: num(r?.time) });
  }
  if (days <= 92) return pts;
  const weeks: DayPoint[] = [];
  for (let i = 0; i < pts.length; i += 7) {
    const w = pts.slice(i, i + 7);
    weeks.push({
      day: w[0].day,
      people: Math.max(...w.map((p) => p.people)),
      devices: Math.max(...w.map((p) => p.devices)),
      timeMs: w.reduce((s, p) => s + p.timeMs, 0),
    });
  }
  return weeks;
}


/** Noms des golfs et compétitions derrière les clés d'écran golf/12, event/345. */
async function screenNames(env: Env, keys: (string | null)[]): Promise<Map<string, string>> {
  const golf = new Set<number>();
  const event = new Set<number>();
  for (const k of keys) {
    const m = k && /^(golf|event)\/(\d+)$/.exec(k);
    if (m) (m[1] === 'golf' ? golf : event).add(Number(m[2]));
  }
  const out = new Map<string, string>();
  const g = [...golf].slice(0, 90);
  const e = [...event].slice(0, 90);
  if (g.length) {
    const { results } = await env.DB.prepare(`SELECT id, name FROM golfs WHERE id IN (${ph(g.length)})`).bind(...g).all<Row>();
    for (const r of results) out.set(`golf/${r.id}`, String(r.name));
  }
  if (e.length) {
    const { results } = await env.DB.prepare(
      `SELECT e.id, e.title, g.name AS golf FROM events e LEFT JOIN golfs g ON g.id = e.golf_id WHERE e.id IN (${ph(e.length)})`,
    )
      .bind(...e)
      .all<Row>();
    for (const r of results) out.set(`event/${r.id}`, r.golf ? `${r.title} · ${r.golf}` : String(r.title));
  }
  return out;
}

async function ranked(env: Env, kind: 'screens' | 'screens-family' | 'taps' | 'inputs', filter: { sql: string; params: unknown[] }, limit: number): Promise<Ranked[]> {
  let sql: string;
  if (kind === 'screens' || kind === 'screens-family') {
    const key = kind === 'screens' ? 'a.screen' : FAMILY_SQL.replaceAll('screen', 'a.screen');
    sql = `SELECT ${key} AS k, MAX(json_extract(a.detail, '$.label')) AS label, SUM(json_extract(a.detail, '$.cont') IS NULL) AS n, SUM(a.duration_ms) AS t
      FROM activity a WHERE a.type = 'view' AND a.screen IS NOT NULL AND ${filter.sql} GROUP BY k ORDER BY t DESC LIMIT ?`;
  } else if (kind === 'taps') {
    sql = `SELECT a.target AS k, NULL AS label, COUNT(*) AS n, NULL AS t
      FROM activity a WHERE a.type = 'tap' AND a.target IS NOT NULL AND ${filter.sql} GROUP BY k ORDER BY n DESC LIMIT ?`;
  } else {
    sql = `SELECT json_extract(a.detail, '$.value') AS k, a.target AS label, COUNT(*) AS n, NULL AS t
      FROM activity a WHERE a.type = 'input' AND ${filter.sql} GROUP BY a.target, k ORDER BY n DESC, MAX(a.ts) DESC LIMIT ?`;
  }
  const { results } = await env.DB.prepare(sql).bind(...filter.params, limit).all<Row>();
  const names = kind === 'screens' ? await screenNames(env, results.map((r) => str(r.k))) : new Map<string, string>();
  return results
    .filter((r) => r.k != null && r.k !== '')
    .map((r) => {
      const key = String(r.k);
      const label = kind === 'screens-family' ? (FAMILY_LABEL[key] ?? str(r.label)) : (names.get(key) ?? str(r.label));
      return { key, label, count: num(r.n), ...(r.t != null ? { timeMs: num(r.t) } : {}) };
    });
}

async function activityList(env: Env, filter: { sql: string; params: unknown[] }, limit: number, withUser = false): Promise<ActivityItem[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.*, ${withUser ? `COALESCE(p.display_name, u.name, u.email)` : 'NULL'} AS user_label
     FROM activity a ${withUser ? `LEFT JOIN "user" u ON u.id = a.user_id LEFT JOIN player_profiles p ON p.user_id = a.user_id` : ''}
     WHERE ${filter.sql} ORDER BY a.ts DESC, a.id DESC LIMIT ?`,
  )
    .bind(...filter.params, limit)
    .all<Row>();
  const names = await screenNames(env, results.filter((r) => r.type === 'view').map((r) => str(r.screen)));
  return results.map((r) => ({
    id: num(r.id),
    ts: String(r.ts),
    type: r.type as ActivityItem['type'],
    screen: str(r.screen),
    target: str(r.target),
    detail: withName(r.detail ? safeJson(String(r.detail)) : null, names.get(String(r.screen))),
    durationMs: r.duration_ms == null ? null : num(r.duration_ms),
    deviceId: String(r.device_id),
    visitId: String(r.visit_id),
    userId: str(r.user_id),
    ...(withUser ? { userLabel: str(r.user_label) } : {}),
  }));
}

function withName(d: Record<string, unknown> | null, name: string | undefined) {
  return name && !d?.label ? { ...(d ?? {}), label: name } : d;
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return { raw: s };
  }
}

function deviceOf(r: Row, usage?: Usage): DeviceRow {
  return {
    deviceId: String(r.device_id),
    userId: str(r.user_id),
    firstSeen: String(r.first_seen),
    lastSeen: String(r.last_seen),
    userAgent: str(r.user_agent),
    ip: str(r.ip),
    city: str(r.city),
    region: str(r.region),
    country: str(r.country),
    standalone: r.standalone == null ? null : r.standalone === 1,
    screen: str(r.screen),
    lang: str(r.lang),
    usage: usage ?? usageOf(undefined),
  };
}

async function peopleRows(env: Env, onlyId?: string): Promise<PersonRow[]> {
  const db = env.DB;
  const where = onlyId ? 'WHERE u.id = ?' : '';
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.username, u.createdAt, u.emailVerified, p.display_name, p.city, p.photo IS NOT NULL AS has_photo,
         (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS devices,
         (SELECT COUNT(*) FROM "session" s WHERE s.userId = u.id) AS logins,
         (SELECT MAX(s.updatedAt) FROM "session" s WHERE s.userId = u.id) AS session_seen
       FROM "user" u LEFT JOIN player_profiles p ON p.user_id = u.id ${where}`,
    )
    .bind(...(onlyId ? [onlyId] : []))
    .all<Row>();
  const ids = results.map((r) => String(r.id));
  const [usage, vols] = await Promise.all([usageBy(env, 'user_id', ids), volumes(env, onlyId)]);
  const rows = results.map((r): PersonRow => {
    const id = String(r.id);
    const u = usage.get(id) ?? usageOf(undefined);
    // Avant le suivi d'activité, la dernière activité connue est celle de la session de connexion.
    if (!u.lastSeen && r.session_seen) u.lastSeen = String(r.session_seen);
    return {
      id,
      name: String(r.name ?? ''),
      email: String(r.email ?? ''),
      username: str(r.username),
      createdAt: String(r.createdAt),
      emailVerified: num(r.emailVerified) === 1,
      demo: isDemo(id),
      admin: isAdminEmail(env, str(r.email)),
      displayName: str(r.display_name),
      city: str(r.city),
      hasPhoto: num(r.has_photo) === 1,
      devices: num(r.devices),
      logins: num(r.logins),
      usage: u,
      volume: vols.get(id) ?? emptyVolume(),
    };
  });
  return rows.sort((a, b) => (b.usage.lastSeen ?? '').localeCompare(a.usage.lastSeen ?? ''));
}

// ---------------------------------------------------------------- routes

adminPeopleApi.get('/overview', async (c) => {
  const env = c.env;
  const days = Math.min(365, Math.max(1, Number(c.req.query('days')) || 30));
  const since = sinceIso(days);
  const admins = await adminIds(env);
  const na = notAdmin(admins);
  const inPeriod = { sql: `a.ts >= ? AND ${na.sql}`, params: [since, ...na.params] };
  const db = env.DB;
  const [people, totals, anon] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total, SUM(createdAt >= ?) AS fresh FROM "user"`).bind(since),
    db
      .prepare(
        `SELECT COUNT(DISTINCT a.user_id) AS people, COUNT(DISTINCT a.visit_id) AS visits,
           SUM(CASE WHEN a.type = 'view' THEN a.duration_ms ELSE 0 END) AS time, SUM(a.type = 'tap') AS taps
         FROM activity a WHERE ${inPeriod.sql}`,
      )
      .bind(...inPeriod.params),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM devices WHERE user_id IS NULL) AS total,
           (SELECT COUNT(DISTINCT a.device_id) FROM activity a JOIN devices d ON d.device_id = a.device_id
             WHERE d.user_id IS NULL AND a.ts >= ?) AS active`,
      )
      .bind(since),
  ]);
  const p = (people.results[0] ?? {}) as Row;
  const t = (totals.results[0] ?? {}) as Row;
  const an = (anon.results[0] ?? {}) as Row;
  const [vols, dailyPts, topScreens, topTaps, topInputs, recent] = await Promise.all([
    volumes(env, undefined, [...admins, DEMO_USER_ID]),
    daily(env, days, na),
    ranked(env, 'screens-family', inPeriod, 15),
    ranked(env, 'taps', inPeriod, 20),
    ranked(env, 'inputs', inPeriod, 20),
    activityList(env, { sql: `${na.sql} AND a.type != 'view'`, params: na.params }, 60, true),
  ]);
  const body: AdminOverview = {
    days,
    people: { total: num(p.total), newInPeriod: num(p.fresh), activeInPeriod: num(t.people) },
    anonymous: { activeInPeriod: num(an.active), total: num(an.total) },
    visits: num(t.visits),
    timeMs: num(t.time),
    taps: num(t.taps),
    volume: sumVolumes(vols.values()),
    daily: dailyPts,
    topScreens,
    topTaps,
    topInputs,
    recent,
  };
  return c.json(body);
});

adminPeopleApi.get('/people', async (c) => {
  const env = c.env;
  const people = await peopleRows(env);
  const { results } = await env.DB.prepare(`SELECT * FROM devices WHERE user_id IS NULL ORDER BY last_seen DESC LIMIT 300`).all<Row>();
  const usage = await usageBy(env, 'device_id', results.map((r) => String(r.device_id)));
  const body: AdminPeople = {
    people,
    anonymous: results.map((r) => deviceOf(r, usage.get(String(r.device_id)))),
  };
  return c.json(body);
});

adminPeopleApi.get('/people/:id', async (c) => {
  const env = c.env;
  const db = env.DB;
  const id = c.req.param('id');
  const [person] = await peopleRows(env, id);
  if (!person) return c.json({ error: 'Compte introuvable' }, 404);
  const [profile, idx, providers, sessions, devices] = await db.batch([
    db.prepare(`SELECT p.*, g.name AS home_golf_name FROM player_profiles p LEFT JOIN golfs g ON g.id = p.home_golf_id WHERE p.user_id = ?`).bind(id),
    db.prepare(`SELECT as_of, hcp_index FROM index_history WHERE user_id = ? ORDER BY as_of`).bind(id),
    db.prepare(`SELECT DISTINCT providerId FROM account WHERE userId = ?`).bind(id),
    db.prepare(`SELECT createdAt, updatedAt, expiresAt, ipAddress, userAgent FROM "session" WHERE userId = ? ORDER BY createdAt DESC`).bind(id),
    db
      .prepare(
        `SELECT * FROM devices WHERE user_id = ? OR device_id IN (SELECT DISTINCT device_id FROM activity WHERE user_id = ?) ORDER BY last_seen DESC`,
      )
      .bind(id, id),
  ]);
  const devRows = devices.results as Row[];
  const devUsage = await usageBy(env, 'device_id', devRows.map((r) => String(r.device_id)));
  const mine = { sql: 'a.user_id = ?', params: [id] };
  const now = new Date().toISOString();
  const [feedback, dailyPts, screens, taps, inputs, plays, activity] = await Promise.all([
    threadOf(env, id, true),
    daily(env, 60, mine),
    ranked(env, 'screens', mine, 40),
    ranked(env, 'taps', mine, 40),
    ranked(env, 'inputs', mine, 40),
    playRows(env, id),
    activityList(env, mine, Math.min(2000, Number(c.req.query('limit')) || 400)),
  ]);
  const body: PersonDetail = {
    person,
    feedback,
    profile: (profile.results[0] as Row | undefined) ?? null,
    indexHistory: (idx.results as Row[]).map((r) => ({ asOf: String(r.as_of), index: num(r.hcp_index) })),
    providers: (providers.results as Row[]).map((r) => String(r.providerId)),
    authSessions: (sessions.results as Row[]).map(
      (r): AuthSessionRow => ({
        createdAt: String(r.createdAt),
        updatedAt: String(r.updatedAt),
        expiresAt: String(r.expiresAt),
        ipAddress: str(r.ipAddress),
        userAgent: str(r.userAgent),
        active: String(r.expiresAt) > now,
      }),
    ),
    devices: devRows.map((r) => deviceOf(r, devUsage.get(String(r.device_id)))),
    daily: dailyPts,
    screens,
    taps,
    inputs,
    plays,
    activity,
  };
  return c.json(body);
});

async function playRows(env: Env, userId: string): Promise<PlayRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.kind, s.played_at, g.name AS golf_name, s.place, s.holes, s.duration_min, s.balls, s.created_at, s.updated_at, s.deleted_at,
       (SELECT COUNT(h.strokes) FROM round_holes h WHERE h.session_id = s.id) AS played,
       (SELECT SUM(h.strokes) FROM round_holes h WHERE h.session_id = s.id) AS strokes,
       (SELECT SUM(CASE WHEN h.strokes IS NOT NULL THEN h.par END) FROM round_holes h WHERE h.session_id = s.id) AS par,
       (SELECT SUM(${SHOTS_SQL}) FROM round_holes h WHERE h.session_id = s.id) AS shots,
       (SELECT COUNT(*) FROM range_drills d WHERE d.session_id = s.id) AS drills
     FROM play_sessions s LEFT JOIN golfs g ON g.id = s.golf_id WHERE s.user_id = ? ORDER BY s.played_at DESC LIMIT 500`,
  )
    .bind(userId)
    .all<Row>();
  return results.map((r) => ({
    id: String(r.id),
    kind: r.kind as PlayRow['kind'],
    playedAt: String(r.played_at),
    golfName: str(r.golf_name),
    place: str(r.place),
    holes: r.holes == null ? null : num(r.holes),
    played: num(r.played),
    strokes: r.strokes == null ? null : num(r.strokes),
    par: r.par == null ? null : num(r.par),
    shots: num(r.shots),
    drills: num(r.drills),
    durationMin: r.duration_min == null ? null : num(r.duration_min),
    balls: r.balls == null ? null : num(r.balls),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: str(r.deleted_at),
  }));
}

adminPeopleApi.get('/devices/:id', async (c) => {
  const env = c.env;
  const id = c.req.param('id');
  const dev = await env.DB.prepare(
    `SELECT d.*, COALESCE(p.display_name, u.name, u.email) AS person_name FROM devices d
     LEFT JOIN "user" u ON u.id = d.user_id LEFT JOIN player_profiles p ON p.user_id = d.user_id WHERE d.device_id = ?`,
  )
    .bind(id)
    .first<Row>();
  if (!dev) return c.json({ error: 'Appareil introuvable' }, 404);
  const usage = await usageBy(env, 'device_id', [id]);
  const mine = { sql: 'a.device_id = ?', params: [id] };
  const [dailyPts, screens, taps, inputs, activity] = await Promise.all([
    daily(env, 60, mine),
    ranked(env, 'screens', mine, 40),
    ranked(env, 'taps', mine, 40),
    ranked(env, 'inputs', mine, 40),
    activityList(env, mine, Math.min(2000, Number(c.req.query('limit')) || 400)),
  ]);
  const body: DeviceDetail = {
    device: deviceOf(dev, usage.get(id)),
    personName: str(dev.person_name),
    daily: dailyPts,
    screens,
    taps,
    inputs,
    activity,
  };
  return c.json(body);
});
