// Types et calculs partagés entre le worker et l'app pour « Mes parties ».

export type SessionKind = 'round' | 'range';
export type Fairway = 'hit' | 'left' | 'right' | 'short';
export type DrillCategory = 'long' | 'approach' | 'chip' | 'bunker' | 'putting';
export type StatsPeriod = '1m' | '3m' | '6m' | '1y' | 'all';

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
  holes: 9 | 18 | null;
  start_hole: number;
  tee: string | null;
  duration_min: number | null;
  balls: number | null;
  focus: string | null;
  feeling: number | null;
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
  series: Array<{ id: string; date: string; rel18: number; strokes: number; holes: number }>;
  dist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number }; // nombres de trous
  byPar: { 3: number | null; 4: number | null; 5: number | null }; // coups moyens relatifs au par
  fairways: { n: number; hit: number; left: number; right: number; short: number; pct: number | null };
  gir: { n: number; hit: number; pct: number | null };
  putts: { per18: number | null; threePuttPct: number | null; perGir: number | null; n: number };
  upDown: { n: number; made: number; pct: number | null };
  penalties: { per18: number | null };
}

export interface RangeStats {
  count: number;
  minutes: number;
  balls: number;
  weekly: Array<{ week: string; minutes: number; balls: number }>;
  drills: Array<{ label: string; category: DrillCategory; distance_m: number | null; points: Array<{ date: string; rate: number; attempts: number }> }>;
}

export interface StatsResponse {
  period: StatsPeriod;
  from: string | null;
  to: string;
  rounds: RoundStats;
  prevRounds: RoundStats | null;
  range: RangeStats;
  prevRange: RangeStats | null;
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
