// Client « Mes parties » : comptes (Better Auth) et données du joueur. Cookie de session même origine.
import type { PlaySession, StatsPeriod, StatsResponse } from '../../shared/practice';
import { ApiError } from '../api';
import { trackHeaders } from '../track';

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...trackHeaders(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* vide */
  }
  if (!res.ok) {
    const d = data as { error?: string; message?: string; code?: string } | null;
    throw new ApiError(res.status, authMessage(d?.code) ?? d?.error ?? d?.message ?? `Erreur ${res.status}`);
  }
  return data as T;
}

function authMessage(code?: string): string | null {
  switch (code) {
    case 'INVALID_OTP':
      return 'Code incorrect.';
    case 'OTP_EXPIRED':
      return 'Ce code a expiré. Demandez-en un nouveau.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Trop d’essais. Demandez un nouveau code.';
    case 'INVALID_USERNAME_OR_PASSWORD':
      return 'Identifiant ou mot de passe incorrect.';
    case 'INVALID_EMAIL':
      return 'Adresse e-mail invalide.';
    default:
      return code === undefined ? null : null;
  }
}

// ---------------------------------------------------------------- comptes
export const sendCode = (email: string) => call<{ success: boolean }>('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' });
export const verifyCode = (email: string, otp: string) => call('/api/auth/sign-in/email-otp', 'POST', { email, otp });
export const signInDemo = () => call('/api/auth/sign-in/username', 'POST', { username: 'Demo', password: 'Demo' });
export const signInPassword = (username: string, password: string) => call('/api/auth/sign-in/username', 'POST', { username, password });
export const signOut = () => call('/api/auth/sign-out', 'POST', {});

// ---------------------------------------------------------------- joueur
export interface Me {
  user: { id: string; name: string; email: string; username: string | null; displayUsername: string | null; createdAt: string };
  demo: boolean;
  /** Compte administrateur : lien « Administration » dans les Réglages. */
  admin?: boolean;
  rounds: number;
  ranges: number;
}
export const getMe = () => call<Me>('/api/me');
export const deleteAccount = () => call('/api/me', 'DELETE');
export const resetDemo = () => call('/api/me/demo/reset', 'POST');
export const exportUrl = '/api/me/export';

export interface Profile {
  display_name: string | null;
  photo: string | null;
  home_golf_id: number | null;
  home_golf_name?: string | null;
  home_golf_city?: string | null;
  city: string | null;
  birth_year: number | null;
  handedness: 'right' | 'left' | null;
  licence: string | null;
  started_year: number | null;
  /** Clubs du sac (identifiants de CLUBS), null tant que le joueur ne l'a pas déclaré. */
  bag?: string[] | null;
  index_history: Array<{ as_of: string; hcp_index: number }>;
}
export const getProfile = () => call<Profile>('/api/me/profile');
export const saveProfile = (p: Omit<Profile, 'index_history' | 'home_golf_name' | 'home_golf_city' | 'bag'>) => call('/api/me/profile', 'PUT', p);
export const saveBag = (bag: string[]) => call<{ bag: string[] }>('/api/me/bag', 'PUT', { bag });
export const putIndex = (asOf: string, hcp_index: number) => call(`/api/me/index/${asOf}`, 'PUT', { hcp_index });
export const deleteIndex = (asOf: string) => call(`/api/me/index/${asOf}`, 'DELETE');

// ---------------------------------------------------------------- séances
export const listSessions = (kind?: 'round' | 'range') => call<PlaySession[]>(`/api/me/sessions${kind ? `?kind=${kind}` : ''}`);
export const getSession = (id: string) => call<PlaySession>(`/api/me/sessions/${id}`);
export const saveSession = (s: PlaySession) => call<PlaySession>(`/api/me/sessions/${s.id}`, 'PUT', s);
export const deleteSession = (id: string) => call(`/api/me/sessions/${id}`, 'DELETE');
export const restoreSession = (id: string) => call(`/api/me/sessions/${id}/restore`, 'POST');
export const recentGolfs = () => call<number[]>('/api/me/golfs/recent');
export const getStats = (period: StatsPeriod) => call<StatsResponse>(`/api/me/stats?period=${period}`);

export interface GolfHole {
  course: string;
  hole: number;
  par: number;
  stroke_index: number | null;
  source: string;
  votes: number;
}
export const golfHoles = (golfId: number) => call<GolfHole[]>(`/api/golfs/${golfId}/holes`);

export const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

/** Date-heure locale « YYYY-MM-DDTHH:mm » (valeur d'un input datetime-local). */
export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
