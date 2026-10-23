// Comptes joueurs (onglet « Mes parties » uniquement).
// - Vrais joueurs : code à 6 chiffres reçu par e-mail (pas de mot de passe, pas de lien magique :
//   sur iPhone le lien s'ouvrirait dans Safari, hors de l'app installée).
// - Compte de démo : identifiant « Demo », mot de passe « Demo » (seul compte avec mot de passe).
import { betterAuth } from 'better-auth';
import { emailOTP, username } from 'better-auth/plugins';
import type { Env } from './env';
import { sendMail, otpMail } from './mail';

export const DEMO_USERNAME = 'demo';
export const DEMO_PASSWORD = 'Demo';
export const DEMO_EMAIL = 'demo@fairway.abpq.cc';

const YEAR = 60 * 60 * 24 * 365;

/** Secret de signature : variable BETTER_AUTH_SECRET si présente, sinon généré une fois et gardé en base. */
async function authSecret(env: Env): Promise<string> {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  const row = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'auth_secret'`).first<{ value: string }>();
  if (row) return row.value;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('auth_secret', ?)`).bind(secret).run();
  const again = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'auth_secret'`).first<{ value: string }>();
  return again!.value;
}

export async function createAuth(env: Env, origin: string, ctx?: { waitUntil(p: Promise<unknown>): void }) {
  return betterAuth({
    appName: 'Fairway',
    baseURL: origin,
    basePath: '/api/auth',
    secret: await authSecret(env),
    database: env.DB,
    trustedOrigins: ['https://fairway.abpq.cc', 'https://fairway.abpq.workers.dev', 'http://localhost:5173', 'http://localhost:8787'],
    session: {
      expiresIn: YEAR, // une connexion par an au plus
      updateAge: 60 * 60 * 24, // prolongée chaque jour d'utilisation
    },
    emailAndPassword: {
      enabled: true, // uniquement pour le compte de démo
      disableSignUp: true,
      minPasswordLength: 4,
    },
    user: {
      deleteUser: { enabled: true },
    },
    plugins: [
      username({ minUsernameLength: 3 }),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp }) {
          const send = sendMail(env, { to: email, ...otpMail(otp) }).catch((e) => console.error('otp mail', e));
          if (ctx) ctx.waitUntil(send);
          else await send;
        },
      }),
    ],
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/email-otp/send-verification-otp': { window: 600, max: 4 },
        '/sign-in/email-otp': { window: 600, max: 10 },
        '/sign-in/username': { window: 60, max: 10 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      defaultCookieAttributes: { sameSite: 'lax', secure: origin.startsWith('https'), httpOnly: true },
    },
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
