import type {
  ApiList,
  Commune,
  CrawlRun,
  Department,
  EventsQuery,
  Golf,
  GolfEvent,
  SourceRow,
} from '../shared/types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | undefined | null>;

function qs(params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

interface ReqOpts {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
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

let deptCache: Promise<Department[]> | null = null;
export function getDepartments(): Promise<Department[]> {
  if (!deptCache) {
    deptCache = request<Department[]>('/api/departments').catch((e) => {
      deptCache = null;
      throw e;
    });
  }
  return deptCache;
}

export const getEvents = (q: EventsQuery, signal?: AbortSignal) =>
  request<ApiList<GolfEvent>>(`/api/events${qs({ ...q })}`, { signal });

export const getEvent = (id: number, signal?: AbortSignal) =>
  request<GolfEvent>(`/api/events/${id}`, { signal });

export interface GolfsQuery {
  lat?: number;
  lng?: number;
  radius?: number;
  depts?: string;
  q?: string;
  limit?: number;
}

export const getGolfs = (q: GolfsQuery, signal?: AbortSignal) =>
  request<ApiList<Golf>>(`/api/golfs${qs({ ...q })}`, { signal });

export type GolfDetailData = Golf & { events: GolfEvent[] };
export const getGolf = (id: number, signal?: AbortSignal) =>
  request<GolfDetailData>(`/api/golfs/${id}`, { signal });

export const getCommunes = (q: string, signal?: AbortSignal) =>
  request<Commune[]>(`/api/communes${qs({ q })}`, { signal });

// --- Administration ---------------------------------------------------------

export interface AdminStatus {
  lastRuns: CrawlRun[];
  sources: { total: number; ok: number; unchanged: number; error: number; never: number };
  events: { upcoming: number; total: number };
  golfs: number;
}

export const adminStatus = (token: string, signal?: AbortSignal) =>
  request<AdminStatus>('/api/admin/status', { token, signal });

export const adminSources = (token: string, signal?: AbortSignal) =>
  request<SourceRow[]>('/api/admin/sources', { token, signal });

export const adminCrawl = (token: string, body: { sourceId?: number } = {}) =>
  request<CrawlRun>('/api/admin/crawl', { method: 'POST', body, token });

export const adminPatchSource = (token: string, id: number, body: { enabled: boolean }) =>
  request<unknown>(`/api/admin/sources/${id}`, { method: 'PATCH', body, token });

export interface NewSource {
  golfId: number | null;
  url: string;
  label: string;
  kind: SourceRow['kind'];
  parser: SourceRow['parser'];
}

export const adminAddSource = (token: string, body: NewSource) =>
  request<unknown>('/api/admin/sources', { method: 'POST', body, token });
