// Compte de démo partagé : identifiant « Demo », mot de passe « Demo ».
// Ses 30 séances (db/seed/demo-sessions.json) sont rechargées chaque nuit, décalées pour que la plus
// récente date de la semaine écoulée : les filtres « 1 M » / « 3 M » restent toujours parlants.
import demoSessions from '../db/seed/demo-sessions.json';
import demoProfile from '../db/seed/demo-profile.json';
import type { Drill, HoleEntry } from '../shared/practice';
import { createAuth, DEMO_EMAIL, DEMO_PASSWORD, DEMO_USERNAME } from './auth';
import type { Env } from './env';
import { demoShots, placeDemoShots } from './demoShots';
import type { CoursePlan } from '../shared/plan';

export const DEMO_USER_ID = 'demo-user';
export const isDemo = (uid: string) => uid === DEMO_USER_ID;

interface DemoSession {
  id: string;
  kind: 'round' | 'range';
  golf_slug: string;
  course: string;
  played_at: string;
  holes?: number;
  start_hole?: number;
  tee?: string;
  duration_min?: number;
  balls?: number;
  focus?: string;
  feeling?: number;
  mood?: number;
  body?: number;
  weather?: number;
  event_title?: string | null;
  notes: string | null;
  holes_data?: Array<Omit<HoleEntry, 'sand'> & { sand?: 0 | 1 | null }>;
  drills?: Drill[];
}

const DAY = 86_400_000;
/** Sac du compte de démo : 14 clubs. */
const DEMO_BAG = ['D', '3W', '5W', '4H', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'P'];

/** Décalage en semaines entières (les jours de la semaine restent les mêmes). */
function weekShiftDays(lastPlayed: string, todayIso: string): number {
  const gap = Math.floor((Date.parse(`${todayIso}T12:00:00Z`) - Date.parse(`${lastPlayed.slice(0, 10)}T12:00:00Z`)) / DAY);
  return Math.max(0, Math.floor((gap - 1) / 7) * 7);
}

function shift(dt: string, days: number): string {
  if (!days) return dt;
  const d = new Date(`${dt}Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 19);
}

export async function ensureDemo(env: Env, origin: string, opts: { reset?: boolean } = {}) {
  const db = env.DB;
  let created = false;
  const exists = await db.prepare(`SELECT id FROM "user" WHERE id = ?`).bind(DEMO_USER_ID).first();
  if (!exists) {
    const auth = await createAuth(env, origin);
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(DEMO_PASSWORD);
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(DEMO_USER_ID, 'Demo', DEMO_EMAIL, 1, now, now, DEMO_USERNAME, 'Demo'),
      db
        .prepare(`INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)`)
        .bind('demo-account', DEMO_USER_ID, 'credential', DEMO_USER_ID, hash, now, now),
    ]);
    created = true;
  }

  const count = await db.prepare(`SELECT COUNT(*) AS n FROM play_sessions WHERE user_id = ?`).bind(DEMO_USER_ID).first<{ n: number }>();
  if (!opts.reset && !created && (count?.n ?? 0) > 0) return { created, loaded: 0 };

  const golfs = await db.prepare(`SELECT id, slug FROM golfs`).all<{ id: number; slug: string }>();
  const golfId = new Map(golfs.results.map((g) => [g.slug, g.id]));
  // plans OSM des golfs de la démo, pour poser les coups sur la carte
  const plans = new Map<number, CoursePlan>();
  const planRows = await db.prepare(`SELECT golf_id, plan FROM course_plans WHERE plan IS NOT NULL`).all<{ golf_id: number; plan: string }>();
  for (const r of planRows.results) {
    try {
      plans.set(r.golf_id, JSON.parse(r.plan) as CoursePlan);
    } catch {
      /* plan illisible : coups sans position */
    }
  }
  const sessions = demoSessions as DemoSession[];
  const last = sessions.reduce((m, s) => (s.played_at > m ? s.played_at : m), '');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const days = weekShiftDays(last, today);

  const stmts: D1PreparedStatement[] = [db.prepare(`DELETE FROM play_sessions WHERE user_id = ?`).bind(DEMO_USER_ID)];
  for (const s of sessions) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO play_sessions (id, user_id, kind, golf_id, course, played_at, holes, start_hole, tee, duration_min, balls, focus, feeling, notes,
             event_title, mood, body, weather)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          s.id, DEMO_USER_ID, s.kind, golfId.get(s.golf_slug) ?? null, s.course ?? '', shift(s.played_at, days), s.holes ?? null,
          s.start_hole ?? 1, s.tee ?? null, s.duration_min ?? null, s.balls ?? null, s.focus ?? null, s.feeling ?? null, s.notes,
          s.event_title ?? null, s.mood ?? null, s.body ?? null, s.weather ?? null,
        ),
    );
    for (const h of s.holes_data ?? []) {
      const gid = golfId.get(s.golf_slug);
      const shots = placeDemoShots(demoShots(s.id, h.hole, h.par, h.strokes, h.putts, h.penalties), gid != null ? plans.get(gid) : null, s.id, h.hole, s.course, h.fairway);
      stmts.push(
        db
          .prepare(`INSERT INTO round_holes (session_id, hole, par, strokes, putts, fairway, gir, penalties, up_down, sand, shots) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(s.id, h.hole, h.par, h.strokes, h.putts, h.fairway, h.gir, h.penalties, h.up_down, h.sand ?? null, shots.length ? JSON.stringify(shots) : null),
      );
    }
    for (const d of s.drills ?? []) {
      stmts.push(
        db
          .prepare(`INSERT INTO range_drills (session_id, position, category, label, distance_m, attempts, successes) VALUES (?,?,?,?,?,?,?)`)
          .bind(s.id, d.position, d.category, d.label, d.distance_m, d.attempts, d.successes),
      );
    }
  }
  // Profil et historique d'index (dates décalées comme les séances)
  const p = demoProfile as { display_name: string; home_golf_slug: string; city: string; birth_year: number; handedness: string; licence: string | null; started_year: number; index_history: Array<[string, number]> };
  stmts.push(
    db
      .prepare(
        `INSERT INTO player_profiles (user_id, display_name, photo, home_golf_id, city, birth_year, handedness, licence, started_year)
         VALUES (?,?,NULL,?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, photo=NULL, home_golf_id=excluded.home_golf_id, city=excluded.city,
           birth_year=excluded.birth_year, handedness=excluded.handedness, licence=excluded.licence, started_year=excluded.started_year`,
      )
      .bind(DEMO_USER_ID, p.display_name, golfId.get(p.home_golf_slug) ?? null, p.city, p.birth_year, p.handedness, p.licence, p.started_year),
    db.prepare(`UPDATE player_profiles SET bag = ? WHERE user_id = ?`).bind(JSON.stringify(DEMO_BAG), DEMO_USER_ID),
    db.prepare(`DELETE FROM index_history WHERE user_id = ?`).bind(DEMO_USER_ID),
    db.prepare(`UPDATE "user" SET name = ? WHERE id = ?`).bind(p.display_name, DEMO_USER_ID),
  );
  for (const [d, v] of p.index_history) {
    stmts.push(db.prepare(`INSERT INTO index_history (user_id, as_of, hcp_index) VALUES (?,?,?)`).bind(DEMO_USER_ID, shift(`${d}T12:00:00`, days).slice(0, 10), v));
  }
  await db.batch(stmts);
  return { created, loaded: sessions.length, shiftedDays: days };
}
