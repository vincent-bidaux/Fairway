// Programme testeurs : retours (un fil par joueur), réponses de l'admin, e-mails, tableau de bord « Tests ».
import { Hono } from 'hono';
import type { FeedbackKind, FeedbackMessage, FeedbackThread, FunnelStep, TestsDashboard, TesterScore } from '../../shared/feedback';
import { FEEDBACK_KIND_IDS, FEEDBACK_KINDS, FEEDBACK_MAX } from '../../shared/feedback';
import { DEMO_USER_ID } from '../demo';
import type { Env } from '../env';
import { adminEmails, DEVICE_HEADER, ensureActivitySchema } from '../lib/activity';
import { sendMail } from '../mail';
import { adminIds, notAdmin, ph, sinceIso, usageBy } from './adminPeople';

const APP_URL = 'https://fairway.abpq.cc';
type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? 0 : Number(v) || 0);
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

// ---------------------------------------------------------------- schéma

let ready = false;
/** Table feedback et colonnes d'identité, si la migration 0007 n'a pas été appliquée (une fois par isolat). */
export async function ensureFeedbackSchema(env: Env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        author TEXT NOT NULL CHECK (author IN ('user','admin')), kind TEXT CHECK (kind IN ('question','like','use','dislike','unused','bug','idea')),
        body TEXT NOT NULL, context TEXT, created_at TEXT NOT NULL, read_at TEXT)`,
    ),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS feedback_user ON feedback(user_id, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS feedback_unread ON feedback(author, read_at)`),
  ]);
  const cols = await env.DB.prepare(`SELECT name FROM pragma_table_info('player_profiles')`).all<{ name: string }>();
  const have = new Set(cols.results.map((c) => c.name));
  for (const c of ['first_name', 'last_name']) if (!have.has(c)) await env.DB.prepare(`ALTER TABLE player_profiles ADD COLUMN ${c} TEXT`).run();
  ready = true;
}

function toMessage(r: Row, withContext: boolean): FeedbackMessage {
  let context: FeedbackMessage['context'] = null;
  if (withContext && r.context) {
    try {
      context = JSON.parse(String(r.context));
    } catch {
      context = null;
    }
  }
  return {
    id: num(r.id),
    author: r.author === 'admin' ? 'admin' : 'user',
    kind: (str(r.kind) as FeedbackKind | null) ?? null,
    body: String(r.body ?? ''),
    createdAt: String(r.created_at),
    readAt: str(r.read_at),
    ...(withContext ? { context } : {}),
  };
}

export async function threadOf(env: Env, userId: string, withContext: boolean): Promise<FeedbackMessage[]> {
  await ensureFeedbackSchema(env);
  const { results } = await env.DB.prepare(`SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at, id`).bind(userId).all<Row>();
  return results.map((r) => toMessage(r, withContext));
}

export async function unreadReplies(env: Env, userId: string): Promise<number> {
  await ensureFeedbackSchema(env);
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND author = 'admin' AND read_at IS NULL`).bind(userId).first<Row>();
  return num(r?.n);
}

/** Nom affiché d'un joueur : pseudo, sinon prénom nom, sinon nom du compte, sinon e-mail. */
async function playerName(env: Env, userId: string): Promise<{ name: string; email: string } | null> {
  const r = await env.DB.prepare(
    `SELECT u.name, u.email, p.display_name, p.first_name, p.last_name FROM "user" u LEFT JOIN player_profiles p ON p.user_id = u.id WHERE u.id = ?`,
  )
    .bind(userId)
    .first<Row>();
  if (!r) return null;
  const full = [str(r.first_name), str(r.last_name)].filter(Boolean).join(' ');
  return { name: str(r.display_name) ?? (full || null) ?? str(r.name) ?? String(r.email), email: String(r.email) };
}

// ---------------------------------------------------------------- e-mails

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function mailHtml(eyebrow: string, title: string, quote: string, cta: string, foot: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:32px 16px;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1c1c1e">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:460px;background:#ffffff;border-radius:16px;padding:28px 24px" cellspacing="0" cellpadding="0"><tr><td>
<p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.08em;color:#1e8e3e">${esc(eyebrow)}</p>
<h1 style="margin:0 0 18px;font-size:21px;line-height:1.3">${esc(title)}</h1>
<div style="margin:0 0 22px;padding:14px 16px;background:#f2f2f7;border-radius:12px;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(quote)}</div>
<a href="${APP_URL}" style="display:inline-block;background:#1e8e3e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">${esc(cta)}</a>
<p style="margin:20px 0 0;font-size:13px;line-height:1.45;color:#8e8e93">${esc(foot)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

const kindLabel = (k: FeedbackKind | null) => FEEDBACK_KINDS.find((x) => x.id === k)?.label ?? 'Retour';

async function notifyAdmins(env: Env, from: { name: string; email: string }, kind: FeedbackKind, body: string) {
  const subject = `Retour testeur · ${kindLabel(kind)} · ${from.name}`;
  const text = `${from.name} (${from.email}) a envoyé un retour « ${kindLabel(kind)} » :\n\n${body}\n\nRépondre : ${APP_URL} (Réglages > Administration > Tests et retours)`;
  const html = mailHtml('FAIRWAY · RETOUR TESTEUR', `${from.name} · ${kindLabel(kind)}`, body, 'Répondre dans l’app', `${from.email} · Réglages > Administration > Tests et retours`);
  await Promise.all(adminEmails(env).map((to) => sendMail(env, { to, subject, text, html })));
}

async function notifyTester(env: Env, to: string, body: string) {
  const subject = 'Vincent vous a répondu sur Fairway';
  const text = `Vincent a répondu à votre retour :\n\n${body}\n\nPour lui répondre, ouvrez Fairway > Réglages > Retours : ${APP_URL}`;
  const html = mailHtml('FAIRWAY · PROGRAMME TESTEURS', 'Vincent vous a répondu', body, 'Ouvrir Fairway', 'Pour répondre, ouvrez Réglages > Retours dans l’app. Merci de tester Fairway !');
  await sendMail(env, { to, subject, text, html });
}

// ---------------------------------------------------------------- côté testeur (appelé depuis routes/me.ts)

export async function addUserFeedback(
  env: Env,
  req: Request,
  userId: string,
  b: { kind?: unknown; body?: unknown; screen?: unknown },
  waitUntil: (p: Promise<unknown>) => void,
): Promise<{ error: string; status: 400 | 403 | 429 } | FeedbackMessage> {
  await ensureFeedbackSchema(env);
  if (userId === DEMO_USER_ID) return { error: 'Le compte de démo est partagé : créez votre compte pour envoyer vos retours.', status: 403 };
  const kind = FEEDBACK_KIND_IDS.includes(b.kind as FeedbackKind) ? (b.kind as FeedbackKind) : null;
  const body = typeof b.body === 'string' ? b.body.trim().slice(0, FEEDBACK_MAX) : '';
  if (!kind) return { error: 'Choisissez une catégorie.', status: 400 };
  if (!body) return { error: 'Le message est vide.', status: 400 };
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND author = 'user' AND created_at > ?`)
    .bind(userId, new Date(Date.now() - 3600e3).toISOString())
    .first<Row>();
  if (num(recent?.n) >= 30) return { error: 'Beaucoup de retours en une heure : réessayez un peu plus tard.', status: 429 };
  const context = JSON.stringify({
    screen: typeof b.screen === 'string' ? b.screen.slice(0, 60) : undefined,
    device: req.headers.get(DEVICE_HEADER)?.slice(0, 64) ?? undefined,
    ua: req.headers.get('user-agent')?.slice(0, 200) ?? undefined,
  });
  const row = await env.DB.prepare(
    `INSERT INTO feedback (user_id, author, kind, body, context, created_at) VALUES (?, 'user', ?, ?, ?, ?) RETURNING *`,
  )
    .bind(userId, kind, body, context, new Date().toISOString())
    .first<Row>();
  const who = await playerName(env, userId);
  if (who) waitUntil(notifyAdmins(env, who, kind, body).catch((e) => console.error('feedback mail admin', e)));
  return toMessage(row!, false);
}

export async function markRepliesRead(env: Env, userId: string) {
  await ensureFeedbackSchema(env);
  await env.DB.prepare(`UPDATE feedback SET read_at = ? WHERE user_id = ? AND author = 'admin' AND read_at IS NULL`)
    .bind(new Date().toISOString(), userId)
    .run();
}

// ---------------------------------------------------------------- côté admin (monté sous /api/admin)

export const adminFeedbackApi = new Hono<{ Bindings: Env }>();

adminFeedbackApi.use('*', async (c, next) => {
  await ensureFeedbackSchema(c.env);
  await ensureActivitySchema(c.env);
  await next();
});

adminFeedbackApi.get('/people/:id/feedback', async (c) => c.json(await threadOf(c.env, c.req.param('id'), true)));

adminFeedbackApi.post('/people/:id/feedback', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<{ body?: unknown }>().catch(() => ({}) as { body?: unknown });
  const body = typeof b.body === 'string' ? b.body.trim().slice(0, FEEDBACK_MAX) : '';
  if (!body) return c.json({ error: 'Le message est vide.' }, 400);
  const who = await playerName(c.env, id);
  if (!who) return c.json({ error: 'Compte introuvable' }, 404);
  const now = new Date().toISOString();
  // Répondre vaut lecture des retours en attente.
  await c.env.DB.prepare(`UPDATE feedback SET read_at = ? WHERE user_id = ? AND author = 'user' AND read_at IS NULL`).bind(now, id).run();
  const row = await c.env.DB.prepare(`INSERT INTO feedback (user_id, author, kind, body, created_at) VALUES (?, 'admin', NULL, ?, ?) RETURNING *`)
    .bind(id, body, now)
    .first<Row>();
  if (id !== DEMO_USER_ID) c.executionCtx.waitUntil(notifyTester(c.env, who.email, body).catch((e) => console.error('feedback mail tester', e)));
  return c.json(toMessage(row!, true), 201);
});

adminFeedbackApi.post('/people/:id/feedback/read', async (c) => {
  await c.env.DB.prepare(`UPDATE feedback SET read_at = ? WHERE user_id = ? AND author = 'user' AND read_at IS NULL`)
    .bind(new Date().toISOString(), c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

const IDENTITY = ['display_name', 'first_name', 'last_name', 'licence', 'city', 'home_golf_id', 'photo'] as const;

adminFeedbackApi.get('/tests', async (c) => {
  const env = c.env;
  const db = env.DB;
  const days = Math.min(365, Math.max(1, Number(c.req.query('days')) || 30));
  const since = sinceIso(days);
  const admins = await adminIds(env);
  const excluded = [...admins, DEMO_USER_ID];

  // Testeurs = tous les comptes sauf démo et admins.
  const { results: users } = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.createdAt, p.display_name, p.first_name, p.last_name, p.licence, p.city, p.home_golf_id, p.photo IS NOT NULL AS has_photo,
         g.name AS home_golf,
         (SELECT COUNT(*) FROM play_sessions s WHERE s.user_id = u.id AND s.deleted_at IS NULL) AS sessions,
         (SELECT COUNT(*) FROM feedback f WHERE f.user_id = u.id AND f.author = 'user') AS feedbacks,
         (SELECT MAX(s.updatedAt) FROM "session" s WHERE s.userId = u.id) AS session_seen
       FROM "user" u LEFT JOIN player_profiles p ON p.user_id = u.id LEFT JOIN golfs g ON g.id = p.home_golf_id
       WHERE u.id NOT IN (${ph(excluded.length)})`,
    )
    .bind(...excluded)
    .all<Row>();
  const ids = users.map((u) => String(u.id));
  const usage = await usageBy(env, 'user_id', ids);
  const [act7, act30] = await db.batch([
    db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE ts >= ? AND user_id IN (${ph(Math.max(1, ids.length))})`).bind(sinceIso(7), ...(ids.length ? ids : [''])),
    db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE ts >= ? AND user_id IN (${ph(Math.max(1, ids.length))})`).bind(sinceIso(30), ...(ids.length ? ids : [''])),
  ]);

  const filled = (u: Row) =>
    IDENTITY.filter((k) => (k === 'photo' ? num(u.has_photo) === 1 : u[k] != null && String(u[k]).trim() !== '')).length;
  const list: TesterScore[] = users.map((u) => {
    const id = String(u.id);
    const us = usage.get(id);
    const full = [str(u.first_name), str(u.last_name)].filter(Boolean).join(' ');
    return {
      userId: id,
      name: str(u.display_name) ?? (full || null) ?? str(u.name) ?? String(u.email),
      email: String(u.email),
      firstName: str(u.first_name),
      lastName: str(u.last_name),
      pseudo: str(u.display_name),
      licence: str(u.licence),
      city: str(u.city),
      homeGolf: str(u.home_golf),
      hasPhoto: num(u.has_photo) === 1,
      profileFields: filled(u),
      joinedAt: String(u.createdAt),
      lastSeen: us?.lastSeen ?? str(u.session_seen),
      activeDays: us?.activeDays ?? 0,
      timeMs: us?.timeMs ?? 0,
      sessions: num(u.sessions),
      feedbacks: num(u.feedbacks),
    };
  });
  const score = (t: TesterScore) => t.activeDays * 2 + t.feedbacks * 3 + t.sessions + t.timeMs / 600e3;
  list.sort((a, b) => score(b) - score(a) || (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));

  // Retours
  const { results: fb } = await db
    // Tous les retours, y compris ceux des comptes admin (pour tester soi-même), sauf le compte Demo qui ne peut pas en envoyer.
    .prepare(`SELECT id, user_id, author, kind, body, created_at, read_at FROM feedback WHERE user_id != ? ORDER BY created_at, id LIMIT 20000`)
    .bind(DEMO_USER_ID)
    .all<Row>();
  const byKind = Object.fromEntries(FEEDBACK_KIND_IDS.map((k) => [k, 0])) as Record<FeedbackKind, number>;
  const byUser = new Map<string, Row[]>();
  let replyHours = 0;
  let replies = 0;
  for (const r of fb) {
    if (r.author === 'user' && typeof r.kind === 'string' && r.kind in byKind) byKind[r.kind as FeedbackKind]++;
    const k = String(r.user_id);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(r);
  }
  const names = new Map<string, { name: string; email: string; hasPhoto: boolean }>(list.map((t) => [t.userId, t]));
  // Auteurs hors testeurs (comptes admin) : nom et e-mail.
  const others = [...byUser.keys()].filter((u) => !names.has(u));
  if (others.length) {
    const { results } = await db
      .prepare(
        `SELECT u.id, u.email, COALESCE(NULLIF(p.display_name, ''), NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), NULLIF(u.name, ''), u.email) AS name,
           p.photo IS NOT NULL AS has_photo
         FROM "user" u LEFT JOIN player_profiles p ON p.user_id = u.id WHERE u.id IN (${ph(others.length)})`,
      )
      .bind(...others)
      .all<Row>();
    for (const r of results) names.set(String(r.id), { name: `${r.name} (admin)`, email: String(r.email), hasPhoto: num(r.has_photo) === 1 });
  }
  const threads: FeedbackThread[] = [];
  for (const [uid, msgs] of byUser) {
    // Délai de réponse : premier retour sans réponse → réponse suivante de l'admin.
    let pending: string | null = null;
    for (const m of msgs) {
      if (m.author === 'user' && !pending) pending = String(m.created_at);
      if (m.author === 'admin' && pending) {
        replyHours += (Date.parse(String(m.created_at)) - Date.parse(pending)) / 36e5;
        replies++;
        pending = null;
      }
    }
    const last = msgs[msgs.length - 1];
    const t = names.get(uid);
    threads.push({
      userId: uid,
      name: t?.name ?? uid,
      email: t?.email ?? '',
      hasPhoto: t?.hasPhoto ?? false,
      total: msgs.length,
      fromUser: msgs.filter((m) => m.author === 'user').length,
      unread: msgs.filter((m) => m.author === 'user' && !m.read_at).length,
      awaitingReply: last.author === 'user',
      lastAt: String(last.created_at),
      lastBody: String(last.body).slice(0, 200),
      lastAuthor: last.author === 'admin' ? 'admin' : 'user',
      lastKind: (str(last.kind) as FeedbackKind | null) ?? null,
    });
  }
  threads.sort((a, b) => Number(b.awaitingReply) - Number(a.awaitingReply) || b.lastAt.localeCompare(a.lastAt));

  // Parcours : appareils (hors admin) → démo → compte → profil complet → séance → retour
  const na = notAdmin(admins);
  const [devs, demoDevs, splashViews, splashTaps] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM devices a WHERE ${na.sql}`).bind(...na.params),
    db.prepare(`SELECT COUNT(DISTINCT a.device_id) AS n FROM activity a WHERE a.user_id = ? AND ${na.sql}`).bind(DEMO_USER_ID, ...na.params),
    db.prepare(`SELECT COUNT(DISTINCT a.visit_id) AS n FROM activity a WHERE a.type = 'view' AND a.screen = 'splash/guest' AND a.ts >= ? AND ${na.sql}`).bind(since, ...na.params),
    db
      .prepare(`SELECT a.target AS t, COUNT(*) AS n FROM activity a WHERE a.type = 'tap' AND a.target LIKE 'splash:%' AND a.ts >= ? AND ${na.sql} GROUP BY a.target`)
      .bind(since, ...na.params),
  ]);
  const taps = new Map((splashTaps.results as Row[]).map((r) => [String(r.t), num(r.n)]));
  const complete = list.filter((t) => t.profileFields === IDENTITY.length).length;
  const funnel: FunnelStep[] = [
    { id: 'devices', label: 'Ont ouvert l’app (appareils)', count: num((devs.results[0] as Row)?.n) },
    { id: 'demo', label: 'Ont utilisé le compte Demo', count: num((demoDevs.results[0] as Row)?.n) },
    { id: 'account', label: 'Ont créé leur compte', count: list.length },
    { id: 'profile', label: 'Ont complété leur profil', count: complete },
    { id: 'session', label: 'Ont saisi une séance', count: list.filter((t) => t.sessions > 0).length },
    { id: 'feedback', label: 'Ont envoyé un retour', count: list.filter((t) => t.feedbacks > 0).length },
  ];

  const body: TestsDashboard = {
    days,
    profileFieldsTotal: IDENTITY.length,
    testers: {
      total: list.length,
      newInPeriod: list.filter((t) => t.joinedAt >= since).length,
      active7: num((act7.results[0] as Row)?.n),
      active30: num((act30.results[0] as Row)?.n),
      profileComplete: complete,
      withSessions: list.filter((t) => t.sessions > 0).length,
      withFeedback: list.filter((t) => t.feedbacks > 0).length,
    },
    funnel,
    splash: {
      views: num((splashViews.results[0] as Row)?.n),
      login: taps.get('splash:login') ?? 0,
      signup: taps.get('splash:signup') ?? 0,
      later: taps.get('splash:later') ?? 0,
    },
    feedback: {
      total: fb.filter((r) => r.author === 'user').length,
      inPeriod: fb.filter((r) => r.author === 'user' && String(r.created_at) >= since).length,
      unread: fb.filter((r) => r.author === 'user' && !r.read_at).length,
      awaitingReply: threads.filter((t) => t.awaitingReply).length,
      byKind,
      avgReplyHours: replies ? Math.round((replyHours / replies) * 10) / 10 : null,
    },
    threads,
    testers_list: list,
  };
  return c.json(body);
});
