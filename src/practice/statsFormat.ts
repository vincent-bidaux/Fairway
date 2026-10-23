// Formats français partagés par le tableau de bord, les détails et les listes.
import type { PlaySession } from '../../shared/practice';

const MINUS = '−';

/** Nombre au format français (virgule), signe moins typographique. */
export function nf(n: number, digits = 1): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', MINUS).replace(/ /g, ' ');
}

/** Nombre signé : « +19,7 », « −1,3 », « 0 ». */
export function rel(n: number, digits = 1): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  if (r === 0) return '0';
  return (r > 0 ? '+' : '') + nf(r, digits);
}

export const pctText = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)} %`);

export function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const dFull = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dShortYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const dMonthLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

export const parseLocal = (s: string) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s);
  if (!m) return new Date(s);
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
};

export const fmtDateFull = (s: string) => dFull.format(parseLocal(s));
export const fmtDateShort = (s: string) => dShort.format(parseLocal(s));
export const fmtDateShortYear = (s: string) => dShortYear.format(parseLocal(s));
export const fmtMonthShort = (t: number) => dMonth.format(new Date(t));
export const fmtDayShort = (t: number) => dShort.format(new Date(t));
export const monthLabel = (s: string) => dMonthLong.format(parseLocal(s));

/** « Golf de la Pree - la Rochelle » → « Golf de la Pree » ; MAJUSCULES → casse normale. */
export function golfLabel(name: string | null | undefined, fallback = 'Autre lieu'): string {
  if (!name) return fallback;
  let n = name.split(' - ')[0].trim();
  if (n === n.toUpperCase() && /[A-Z]{3}/.test(n)) {
    const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'sous', 'en', 'au', 'aux', 'd', 'l']);
    n = n
      .toLowerCase()
      .split(/(\s+|['’-])/)
      .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join('');
  }
  return n;
}

export function sessionPlace(s: PlaySession): string {
  return golfLabel(s.golf_name, s.place?.trim() || 'Autre lieu');
}

/** Score relatif d'une partie ramené à 18 trous, pour choisir une couleur. */
export function relClass(relative: number, played: number): string {
  const r18 = played ? (relative * 18) / played : 0;
  if (r18 <= 0) return 'is-great';
  if (r18 <= 12) return 'is-good';
  if (r18 <= 24) return 'is-mid';
  return 'is-high';
}

export const ageFrom = (birthYear: number | null | undefined) => (birthYear ? new Date().getFullYear() - birthYear : null);

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '⛳';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const PERIODS = [
  { value: '1m', label: '1 M' },
  { value: '3m', label: '3 M' },
  { value: '6m', label: '6 M' },
  { value: '1y', label: '1 A' },
  { value: 'all', label: 'Tout' },
] as const;

export const PERIOD_KEY = 'fairway:practice:period';

export function readPeriod(): (typeof PERIODS)[number]['value'] {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (PERIODS.some((p) => p.value === v)) return v as (typeof PERIODS)[number]['value'];
  } catch {
    /* stockage indisponible */
  }
  return '6m';
}

export function writePeriod(v: string) {
  try {
    localStorage.setItem(PERIOD_KEY, v);
  } catch {
    /* ignoré */
  }
}
