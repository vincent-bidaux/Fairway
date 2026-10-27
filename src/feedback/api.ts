// Client « Retours » : conversation testeur ↔ admin. Cookie de session même origine.
import type { FeedbackMessage, MyFeedback, NewFeedback } from '../../shared/feedback';
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
    /* corps vide ou non JSON */
  }
  if (!res.ok) {
    const d = data as { error?: string; message?: string } | null;
    throw new ApiError(res.status, d?.error ?? d?.message ?? `Erreur ${res.status}`);
  }
  return data as T;
}

// ---------------------------------------------------------------- côté testeur
export const getMyFeedback = () => call<MyFeedback>('/api/me/feedback');
export const sendFeedback = (f: NewFeedback) => call<FeedbackMessage>('/api/me/feedback', 'POST', f);
export const markMyFeedbackRead = () => call<{ ok: boolean }>('/api/me/feedback/read', 'POST', {});

// ---------------------------------------------------------------- côté admin
const person = (id: string) => `/api/admin/people/${encodeURIComponent(id)}/feedback`;
export const getPersonFeedback = (id: string) => call<FeedbackMessage[]>(person(id));
export const replyToPerson = (id: string, body: string) => call<FeedbackMessage>(person(id), 'POST', { body });
export const markPersonFeedbackRead = (id: string) => call<{ ok: boolean }>(`${person(id)}/read`, 'POST', {});
