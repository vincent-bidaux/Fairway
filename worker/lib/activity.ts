// Suivi de l'activité des testeurs : stockage, identification du compte et des admins.
import type { ActivityType, TrackBatch } from '../../shared/admin';
import { createAuth } from '../auth';
import type { Env } from '../env';

/** Comptes admin (en plus de la variable ADMIN_EMAILS, séparée par des virgules). */
export const ADMIN_EMAILS = ['vincent.bidaux@gmail.com'];

/** Adresses des admins (notifications de nouveaux retours). */
export function adminEmails(env: Env): string[] {
  return [...new Set([...ADMIN_EMAILS, ...(env.ADMIN_EMAILS ?? '').split(',')].map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export function isAdminEmail(env: Env, email: string | null | undefined): boolean {
  if (!email) return false;
  const list = [...ADMIN_EMAILS, ...(env.ADMIN_EMAILS ?? '').split(',')].map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export const DEVICE_HEADER = 'x-fairway-device';
export const VISIT_HEADER = 'x-fairway-visit';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, user_id TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, user_agent TEXT, ip TEXT, country TEXT, region TEXT, city TEXT, standalone INTEGER, screen TEXT, lang TEXT)`,
  `CREATE INDEX IF NOT EXISTS devices_user ON devices(user_id)`,
  `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, device_id TEXT NOT NULL, visit_id TEXT NOT NULL, user_id TEXT, type TEXT NOT NULL, screen TEXT, target TEXT, detail TEXT, duration_ms INTEGER)`,
  `CREATE INDEX IF NOT EXISTS activity_user_ts ON activity(user_id, ts)`,
  `CREATE INDEX IF NOT EXISTS activity_device_ts ON activity(device_id, ts)`,
  `CREATE INDEX IF NOT EXISTS activity_ts ON activity(ts)`,
];

let schemaReady = false;
/** Crée les tables si la migration 0006 n'a pas été appliquée (une fois par isolat). */
export async function ensureActivitySchema(env: Env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

/** Compte connecté d'après le cookie de session (null si anonyme). */
export async function sessionUser(env: Env, req: Request, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<{ id: string; email: string; name: string } | null> {
  if (!/session_token/.test(req.headers.get('cookie') ?? '')) return null;
  try {
    const auth = await createAuth(env, new URL(req.url).origin, ctx);
    const s = await auth.api.getSession({ headers: req.headers });
    return s ? { id: s.user.id, email: s.user.email, name: s.user.name } : null;
  } catch {
    return null;
  }
}

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const TYPES: ActivityType[] = ['open', 'view', 'tap', 'input', 'api', 'error'];
const cut = (v: unknown, n: number): string | null => (typeof v === 'string' && v ? v.slice(0, n) : null);

/** Infos réseau de la requête (Cloudflare). */
function netInfo(req: Request) {
  const cf = (req as Request & { cf?: Record<string, unknown> }).cf ?? {};
  return {
    ip: req.headers.get('cf-connecting-ip'),
    ua: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    country: cut(cf.country, 8),
    region: cut(cf.region, 80),
    city: cut(cf.city, 80),
  };
}

/** Enregistre un lot d'événements envoyé par l'app. Retourne le nombre retenu. */
export async function ingest(env: Env, req: Request, batch: TrackBatch, userId: string | null): Promise<number> {
  if (!batch || !ID_RE.test(batch.device ?? '') || !ID_RE.test(batch.visit ?? '')) return 0;
  await ensureActivitySchema(env);
  const now = Date.now();
  const net = netInfo(req);
  const nowIso = new Date(now).toISOString();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO devices (device_id, user_id, first_seen, last_seen, user_agent, ip, country, region, city, standalone, screen, lang)
       VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(device_id) DO UPDATE SET
         user_id = COALESCE(?2, devices.user_id), last_seen = ?3, user_agent = ?4, ip = ?5,
         country = COALESCE(?6, devices.country), region = COALESCE(?7, devices.region), city = COALESCE(?8, devices.city),
         standalone = COALESCE(?9, devices.standalone), screen = COALESCE(?10, devices.screen), lang = COALESCE(?11, devices.lang)`,
    ).bind(
      batch.device,
      userId,
      nowIso,
      net.ua,
      net.ip,
      net.country,
      net.region,
      net.city,
      typeof batch.info?.standalone === 'boolean' ? (batch.info.standalone ? 1 : 0) : null,
      cut(batch.info?.screen, 40),
      cut(batch.info?.lang, 20),
    ),
  ];
  let n = 0;
  for (const e of (Array.isArray(batch.events) ? batch.events : []).slice(0, 300)) {
    if (!e || !TYPES.includes(e.type) || e.type === 'api') continue;
    // Horloge du téléphone : acceptée sur 7 jours en arrière (envois différés hors ligne), jamais dans le futur.
    const t = typeof e.t === 'number' && e.t > now - 7 * 864e5 && e.t <= now + 60e3 ? Math.min(e.t, now) : now;
    let detail: string | null = null;
    if (e.detail && typeof e.detail === 'object') {
      detail = JSON.stringify(e.detail);
      if (detail.length > 1500) detail = detail.slice(0, 1500);
    }
    const dur = typeof e.dur === 'number' && e.dur >= 0 ? Math.min(Math.round(e.dur), 6 * 3600e3) : null;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO activity (ts, device_id, visit_id, user_id, type, screen, target, detail, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
      ).bind(new Date(t).toISOString(), batch.device, batch.visit, userId, e.type, cut(e.screen, 120), cut(e.target, 200), detail, dur),
    );
    n++;
  }
  await env.DB.batch(stmts);
  return n;
}

/** Écriture faite via l'API « Mes parties » (séance enregistrée, profil modifié…), vue côté serveur. */
export async function recordApi(env: Env, req: Request, userId: string, status: number) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/me/, '') || '/';
  // Les identifiants sont gardés dans detail, la cible reste groupable.
  const target = `${req.method} ${path.replace(/\/[0-9a-f-]{8,40}(?=\/|$)/gi, '/:id').replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/, '/:date')}`;
  const device = req.headers.get(DEVICE_HEADER);
  const visit = req.headers.get(VISIT_HEADER);
  await ensureActivitySchema(env);
  await env.DB.prepare(
    `INSERT INTO activity (ts, device_id, visit_id, user_id, type, screen, target, detail) VALUES (?,?,?,?, 'api', NULL, ?, ?)`,
  )
    .bind(
      new Date().toISOString(),
      device && ID_RE.test(device) ? device : 'serveur',
      visit && ID_RE.test(visit) ? visit : 'serveur',
      userId,
      target.slice(0, 200),
      JSON.stringify({ path, status }),
    )
    .run();
}
