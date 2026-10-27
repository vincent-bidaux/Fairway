// Contrat de la zone admin « testeurs » (worker/routes/adminPeople.ts ↔ src/admin/*).

export type ActivityType = 'open' | 'view' | 'tap' | 'input' | 'api' | 'error';

/** Événement envoyé par l'app (src/track.ts → POST /api/t). */
export interface TrackEvent {
  t: number; // epoch ms (début)
  type: ActivityType;
  screen?: string;
  target?: string;
  detail?: Record<string, unknown>;
  dur?: number; // ms
}

export interface TrackBatch {
  device: string;
  visit: string;
  info?: { standalone?: boolean; screen?: string; lang?: string };
  events: TrackEvent[];
}

export interface Volume {
  rounds: number;
  ranges: number;
  holes: number; // trous saisis (avec un score)
  shots: number; // coups posés sur les cartes
  drills: number;
  parVotes: number;
  indexEntries: number;
  deleted: number; // séances à la corbeille
}

export interface Usage {
  visits: number;
  activeDays: number;
  timeMs: number;
  taps: number;
  firstSeen: string | null;
  lastSeen: string | null;
  lastScreen: string | null;
}

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  createdAt: string;
  emailVerified: boolean;
  demo: boolean;
  admin: boolean;
  displayName: string | null;
  city: string | null;
  hasPhoto: boolean;
  devices: number;
  logins: number;
  usage: Usage;
  volume: Volume;
}

export interface DeviceRow {
  deviceId: string;
  userId: string | null;
  firstSeen: string;
  lastSeen: string;
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  standalone: boolean | null;
  screen: string | null;
  lang: string | null;
  usage: Usage;
}

export interface Ranked {
  key: string; // écran ou libellé
  /** Libellé lisible quand il existe : nom du golf, titre de la compétition, champ saisi (inputs)… */
  label?: string | null;
  count: number;
  timeMs?: number;
}

export interface DayPoint {
  day: string; // YYYY-MM-DD (Paris)
  people: number; // comptes actifs
  devices: number; // appareils actifs (y compris anonymes)
  timeMs: number;
}

export interface AdminOverview {
  days: number;
  people: { total: number; newInPeriod: number; activeInPeriod: number };
  anonymous: { activeInPeriod: number; total: number };
  visits: number;
  timeMs: number;
  taps: number;
  volume: Volume;
  daily: DayPoint[];
  topScreens: Ranked[];
  topTaps: Ranked[];
  topInputs: Ranked[];
  recent: ActivityItem[];
}

export interface AdminPeople {
  people: PersonRow[];
  anonymous: DeviceRow[];
}

export interface ActivityItem {
  id: number;
  ts: string;
  type: ActivityType;
  screen: string | null;
  target: string | null;
  detail: Record<string, unknown> | null;
  durationMs: number | null;
  deviceId: string;
  visitId: string;
  userId: string | null;
  userLabel?: string | null; // nom ou e-mail (vue d'ensemble)
}

export interface AuthSessionRow {
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  active: boolean;
}

export interface PlayRow {
  id: string;
  kind: 'round' | 'range';
  playedAt: string;
  golfName: string | null;
  place: string | null;
  holes: number | null;
  played: number; // trous saisis
  strokes: number | null;
  par: number | null;
  shots: number;
  drills: number;
  durationMin: number | null;
  balls: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PersonDetail {
  person: PersonRow;
  profile: Record<string, unknown> | null; // player_profiles complet (photo en data URL, sac…)
  indexHistory: { asOf: string; index: number }[];
  providers: string[]; // email-otp, credential…
  authSessions: AuthSessionRow[];
  devices: DeviceRow[];
  daily: DayPoint[]; // 60 derniers jours
  screens: Ranked[];
  taps: Ranked[];
  inputs: Ranked[];
  plays: PlayRow[];
  activity: ActivityItem[]; // 400 derniers, du plus récent au plus ancien
}

export interface DeviceDetail {
  device: DeviceRow;
  personName: string | null;
  daily: DayPoint[];
  screens: Ranked[];
  taps: Ranked[];
  inputs: Ranked[];
  activity: ActivityItem[];
}
