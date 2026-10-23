// Contract shared by the Worker API (worker/) and the React app (src/).

export type DepartmentCode =
  | '16' | '17' | '19' | '23' | '24' | '33' | '40' | '47' | '64' | '79' | '86' | '87';

export interface Department {
  code: DepartmentCode;
  name: string;
  region: string;
  golfCount: number;
}

export interface Golf {
  id: number;
  slug: string;
  name: string;
  department: DepartmentCode;
  city: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  holes: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  /** Street address line (without postcode/city). */
  address: string | null;
  /** ffgolf directory photo. May fail to load (hotlink protection): always provide a fallback. */
  photoUrl: string | null;
  /** Distance in km from the search centre, only when a centre was given. */
  distanceKm?: number;
  /** Number of upcoming visible events. */
  upcomingCount?: number;
}

export type EventType =
  | 'club'          // compétition de club / dimanche
  | 'grand_prix'    // Grand Prix ffgolf
  | 'championnat'   // championnat départemental, régional, club
  | 'senior'
  | 'dames'
  | 'jeunes'
  | 'scramble'
  | 'sponsor'       // trophée / compétition sponsorisée
  | 'open'
  | 'autre';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  club: 'Club',
  grand_prix: 'Grand Prix',
  championnat: 'Championnat',
  senior: 'Seniors',
  dames: 'Dames',
  jeunes: 'Jeunes',
  scramble: 'Scramble',
  sponsor: 'Trophée',
  open: 'Open',
  autre: 'Autre',
};

export interface GolfEvent {
  id: number;
  golfId: number;
  golfName: string;
  golfCity: string;
  department: DepartmentCode;
  lat: number | null;
  lng: number | null;
  title: string;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  endDate: string | null;
  /** "08:30" when known */
  startTime: string | null;
  type: EventType;
  /** e.g. "Stableford", "Strokeplay", "Scramble à 2" */
  format: string | null;
  /** e.g. "Ouverte à tous", "Membres", "Index ≤ 36" */
  eligibility: string | null;
  price: string | null;
  registrationUrl: string | null;
  infoUrl: string | null;
  description: string | null;
  status: 'scheduled' | 'cancelled' | 'full';
  distanceKm?: number;
  updatedAt: string;
}

export interface EventsQuery {
  lat?: number;
  lng?: number;
  /** km */
  radius?: number;
  /** comma-separated department codes */
  depts?: string;
  from?: string;
  to?: string;
  types?: string;
  golfId?: number;
  q?: string;
  limit?: number;
}

export interface Commune {
  name: string;
  code: string;
  postcode: string | null;
  department: string;
  lat: number;
  lng: number;
}

export interface SourceRow {
  id: number;
  golfId: number | null;
  golfName: string | null;
  kind: 'club_page' | 'ffgolf' | 'ligue' | 'comite' | 'platform';
  parser: 'llm' | 'ical';
  label: string;
  url: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'unchanged' | 'error' | null;
  lastError: string | null;
  eventCount: number;
}

export interface CrawlRun {
  id: number;
  trigger: 'cron' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  sourcesOk: number;
  sourcesUnchanged: number;
  sourcesFailed: number;
  eventsNew: number;
  eventsUpdated: number;
  remaining: number;
}

export interface ApiList<T> {
  items: T[];
  total: number;
}
