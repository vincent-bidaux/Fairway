// Types et calculs partagés entre le worker et l'app pour « Mes parties ».

export type SessionKind = 'round' | 'range';
export type Fairway = 'hit' | 'left' | 'right' | 'short';
export type DrillCategory = 'long' | 'approach' | 'chip' | 'bunker' | 'putting';
export type StatsPeriod = '1m' | '3m' | '6m' | '1y' | 'all';

/** Un coup : position de la balle avant le coup (GPS) et club utilisé. Le 1er coup part du départ. */
export interface Shot {
  lat: number | null;
  lon: number | null;
  club: string | null;
  /** Distance parcourue par ce coup en mètres (jusqu'au coup suivant, ou jusqu'au drapeau pour le dernier), si connue. */
  dist?: number | null;
}

export interface HoleEntry {
  hole: number;
  par: number;
  strokes: number | null;
  putts: number | null;
  fairway: Fairway | null;
  gir: 0 | 1 | null;
  penalties: number;
  up_down: 0 | 1 | null;
  sand: 0 | 1 | null;
  /** Coups placés sur la carte du trou (facultatif). */
  shots?: Shot[] | null;
}

// ---------------------------------------------------------------- clubs
export type ClubKind = 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';
export interface Club {
  id: string;
  label: string;
  /** Libellé court pour les pastilles (« 7 », « PW »…). */
  short: string;
  kind: ClubKind;
}

/** Catalogue des clubs, du plus long au plus court. */
export const CLUBS: Club[] = [
  { id: 'D', label: 'Driver', short: 'Dr', kind: 'wood' },
  { id: '3W', label: 'Bois 3', short: 'B3', kind: 'wood' },
  { id: '5W', label: 'Bois 5', short: 'B5', kind: 'wood' },
  { id: '7W', label: 'Bois 7', short: 'B7', kind: 'wood' },
  { id: '2H', label: 'Hybride 2', short: 'H2', kind: 'hybrid' },
  { id: '3H', label: 'Hybride 3', short: 'H3', kind: 'hybrid' },
  { id: '4H', label: 'Hybride 4', short: 'H4', kind: 'hybrid' },
  { id: '5H', label: 'Hybride 5', short: 'H5', kind: 'hybrid' },
  { id: '3i', label: 'Fer 3', short: 'F3', kind: 'iron' },
  { id: '4i', label: 'Fer 4', short: 'F4', kind: 'iron' },
  { id: '5i', label: 'Fer 5', short: 'F5', kind: 'iron' },
  { id: '6i', label: 'Fer 6', short: 'F6', kind: 'iron' },
  { id: '7i', label: 'Fer 7', short: 'F7', kind: 'iron' },
  { id: '8i', label: 'Fer 8', short: 'F8', kind: 'iron' },
  { id: '9i', label: 'Fer 9', short: 'F9', kind: 'iron' },
  { id: 'PW', label: 'Pitching wedge', short: 'PW', kind: 'wedge' },
  { id: 'GW', label: 'Gap wedge', short: 'GW', kind: 'wedge' },
  { id: 'SW', label: 'Sand wedge', short: 'SW', kind: 'wedge' },
  { id: 'LW', label: 'Lob wedge', short: 'LW', kind: 'wedge' },
  { id: 'P', label: 'Putter', short: 'Pt', kind: 'putter' },
];
export const CLUB_BY_ID: Record<string, Club> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
/** Sac proposé tant que le joueur n'a pas déclaré le sien. */
export const DEFAULT_BAG = ['D', '3W', '5W', '4H', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'P'];
/** Règle de golf : 14 clubs au maximum dans le sac. */
export const MAX_CLUBS = 14;

/** Trie et nettoie une liste d'identifiants de clubs (ordre du catalogue, sans doublon ni inconnu). */
export function normalizeBag(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const set = new Set(ids.filter((x): x is string => typeof x === 'string' && x in CLUB_BY_ID));
  return CLUBS.filter((c) => set.has(c.id)).map((c) => c.id);
}

/** Distance en mètres entre deux positions GPS (formule de haversine). */
export function geoDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Drill {
  position: number;
  category: DrillCategory;
  label: string;
  distance_m: number | null;
  attempts: number | null;
  successes: number | null;
}

export interface PlaySession {
  id: string;
  kind: SessionKind;
  golf_id: number | null;
  golf_name?: string | null;
  golf_city?: string | null;
  course: string;
  place: string | null;
  played_at: string; // YYYY-MM-DDTHH:mm:ss, heure locale
  /** Nombre de trous joués (9 ou 18, ou celui d'une boucle du plan : 4, 6, 7…). */
  holes: number | null;
  start_hole: number;
  tee: string | null;
  duration_min: number | null;
  balls: number | null;
  focus: string | null;
  feeling: number | null;
  /** Compétition de l'agenda Fairway jouée ce jour-là (le titre devient celui de la séance). */
  event_id: number | null;
  event_title: string | null;
  /** Échelles 1–5, 3 = normal / OK. Humeur, forme physique, météo. */
  mood: number | null;
  body: number | null;
  weather: number | null;
  notes: string | null;
  updated_at?: string;
  hole_entries?: HoleEntry[];
  drills?: Drill[];
  /** Résumé calculé (liste) */
  summary?: { strokes: number; par: number; played: number; putts: number | null };
}

export interface RoundStats {
  count: number;
  holesPlayed: number;
  rel18: number | null; // score relatif moyen ramené à 18 trous
  best: { id: string; rel: number; strokes: number; holes: number; date: string; golf: string | null } | null;
  /** Une entrée par partie (ordre chronologique). Pourcentages null quand la donnée n'a pas été saisie. */
  series: Array<{
    id: string;
    date: string;
    rel18: number;
    strokes: number;
    holes: number;
    putts18: number | null;
    firPct: number | null;
    girPct: number | null;
    pen18: number;
    udPct: number | null;
  }>;
  /** Nombres de trous. eagle = eagle ou mieux ; albatross et ace sont des sous-ensembles signalés à part. */
  dist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; albatross: number; ace: number };
  byPar: { 3: number | null; 4: number | null; 5: number | null }; // coups moyens relatifs au par
  fairways: { n: number; hit: number; left: number; right: number; short: number; pct: number | null };
  gir: { n: number; hit: number; pct: number | null };
  putts: { per18: number | null; threePuttPct: number | null; perGir: number | null; n: number };
  upDown: { n: number; made: number; pct: number | null };
  penalties: { per18: number | null };
  /** Score moyen (relatif, ramené à 18 trous) selon l'humeur, la forme et la météo saisies (index 0 = niveau 1). */
  context: Record<'mood' | 'body' | 'weather', Array<{ level: number; rounds: number; rel18: number | null }>>;
}

export type HighlightKind = 'ace' | 'albatross' | 'eagle' | 'birdie';

/** « Coup de maître » : un trou joué sous le par (ou un trou en un). */
export interface Highlight {
  session_id: string;
  hole: number;
  par: number;
  strokes: number;
  putts: number | null;
  fairway: Fairway | null;
  gir: 0 | 1 | null;
  stroke_index: number | null;
  kind: HighlightKind;
  played_at: string;
  golf_id: number | null;
  golf_name: string | null;
  golf_city: string | null;
  course: string;
  event_title: string | null;
  holes: number | null;
  /** Score de la partie au moment du coup (cumul relatif) et total final, pour la phrase de récap. */
  round_strokes: number;
  round_rel: number;
  weather: number | null;
  /** Coups placés sur la carte pendant la saisie (null si non renseignés). */
  shots: Shot[] | null;
}

export function highlightKind(par: number, strokes: number): HighlightKind | null {
  if (strokes === 1) return 'ace';
  const d = strokes - par;
  if (d <= -3) return 'albatross';
  if (d === -2) return 'eagle';
  if (d === -1) return 'birdie';
  return null;
}

export const MOOD_LABELS = ['Très mauvaise', 'Mauvaise', 'Normale', 'Bonne', 'Excellente'] as const;
export const BODY_LABELS = ['Blessé', 'Fatigué', 'OK', 'En forme', 'Fantastique'] as const;
export const WEATHER_LABELS = ['Sale temps', 'Médiocre', 'OK', 'Beau', 'Fantastique'] as const;

export interface RangeStats {
  count: number;
  minutes: number;
  balls: number;
  weekly: Array<{ week: string; minutes: number; balls: number }>;
  drills: Array<{ label: string; category: DrillCategory; distance_m: number | null; points: Array<{ date: string; rate: number; attempts: number }> }>;
}

/** Humeur, forme ou météo elles-mêmes (et non leur effet sur le score), sur toutes les séances de la période. */
export interface WellbeingDim {
  /** Nombre de séances où le niveau est renseigné. */
  n: number;
  /** Niveau moyen (1–5), arrondi à 1 décimale. */
  avg: number | null;
  /** Nombre de séances par niveau (index 0 = niveau 1). */
  dist: [number, number, number, number, number];
  /** Niveau de chaque séance renseignée, ordre chronologique. */
  series: Array<{ date: string; level: number; kind: 'round' | 'range' }>;
}
export interface WellbeingStats {
  mood: WellbeingDim;
  body: WellbeingDim;
  weather: WellbeingDim;
}

/** Un coup remarquable (le plus long, le plus court d'un club). */
export interface ShotRecord {
  dist: number;
  date: string;
  golf: string | null;
  hole: number;
}

/** Distances et usage par club. */
export interface ClubStat {
  club: string;
  /** Coups joués avec ce club (distance connue ou non). */
  used: number;
  /** Coups mesurés (distance connue). */
  n: number;
  avg: number;
  min: number;
  max: number;
  /** Distance « habituelle » : médiane des coups. */
  median: number;
  /** Quartiles : la moitié des coups tombe entre p25 et p75. */
  p25: number;
  p75: number;
  /** Toutes les distances mesurées, triées (300 au plus). */
  dists: number[];
  longest: ShotRecord | null;
  shortest: ShotRecord | null;
}

export interface StatsResponse {
  period: StatsPeriod;
  from: string | null;
  to: string;
  rounds: RoundStats;
  prevRounds: RoundStats | null;
  range: RangeStats;
  prevRange: RangeStats | null;
  /** Distances par club sur la période (ordre du catalogue). */
  clubs: ClubStat[];
  /** Humeur, forme, météo sur toutes les séances (parties et practice). */
  wellbeing: WellbeingStats;
  prevWellbeing: WellbeingStats | null;
}

/** GIR saisi, sinon déduit : balle sur le green en (par − 2) coups ou moins. */
export function girOf(h: Pick<HoleEntry, 'gir' | 'strokes' | 'putts' | 'par'>): 0 | 1 | null {
  if (h.gir != null) return h.gir;
  if (h.strokes == null || h.putts == null) return null;
  return h.strokes - h.putts <= h.par - 2 ? 1 : 0;
}

export const SCORE_NAMES: Record<string, string> = {
  '-3': 'Albatros',
  '-2': 'Eagle',
  '-1': 'Birdie',
  '0': 'Par',
  '1': 'Bogey',
  '2': 'Double',
  '3': 'Triple',
};

export function scoreName(rel: number): string {
  if (rel <= -3) return 'Albatros';
  return SCORE_NAMES[String(rel)] ?? `+${rel}`;
}
