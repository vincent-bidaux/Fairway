// Appels de la zone admin « testeurs » (auth par cookie de session).
import type { AdminOverview, AdminPeople, DeviceDetail, PersonDetail } from '../../shared/admin';
import { ApiError } from '../api';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' }, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide ou non JSON */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Erreur ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function getOverview(days: number, signal?: AbortSignal): Promise<AdminOverview> {
  return get<AdminOverview>(`/api/admin/overview?days=${days}`, signal);
}

export function getPeople(signal?: AbortSignal): Promise<AdminPeople> {
  return get<AdminPeople>('/api/admin/people', signal);
}

export function getPerson(id: string, signal?: AbortSignal): Promise<PersonDetail> {
  return get<PersonDetail>(`/api/admin/people/${encodeURIComponent(id)}`, signal);
}

export function getDevice(id: string, signal?: AbortSignal): Promise<DeviceDetail> {
  return get<DeviceDetail>(`/api/admin/devices/${encodeURIComponent(id)}`, signal);
}

/** 401 / 403 : le compte n'est pas administrateur (ou n'est pas connecté). */
export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}
