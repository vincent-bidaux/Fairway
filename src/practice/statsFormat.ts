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

/** Période mémorisée par compte : passer d'un compte à l'autre (ex. compte de démo) ne garde pas un filtre trop étroit. */
const periodKey = (account?: string) => (account ? `${PERIOD_KEY}:${account}` : PERIOD_KEY);

export function readPeriod(account?: string): (typeof PERIODS)[number]['value'] {
  try {
    const v = localStorage.getItem(periodKey(account));
    if (PERIODS.some((p) => p.value === v)) return v as (typeof PERIODS)[number]['value'];
  } catch {
    /* stockage indisponible */
  }
  return '6m';
}

const PERIOD_MONTHS: Record<string, number | null> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, all: null };

/** Nombre de parties (séances « round ») dans chaque période, à partir de la liste des séances. */
export function roundsByPeriod(sessions: Array<{ kind: string; played_at: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PERIODS) {
    const m = PERIOD_MONTHS[p.value];
    let from = '';
    if (m) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      from = d.toLocaleDateString('sv-SE');
    }
    out[p.value] = sessions.filter((s) => s.kind === 'round' && s.played_at.slice(0, 10) >= from).length;
  }
  return out;
}

export function writePeriod(v: string, account?: string) {
  try {
    localStorage.setItem(periodKey(account), v);
  } catch {
    /* ignoré */
  }
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

/** Détail de « Birdie+ » : eagles seuls (hors albatros et trous en un), albatros, trous en un. */
export function birdieExtras(d: { eagle: number; albatross: number; ace: number }): { eagles: number; albatross: number; ace: number } {
  const albatross = d.albatross ?? 0;
  const ace = d.ace ?? 0;
  return { eagles: Math.max(0, d.eagle - Math.max(albatross, ace)), albatross, ace };
}

/** « dont 2 eagles, 1 trou en un » (vide s'il n'y en a pas). */
export function birdieCaption(d: { eagle: number; albatross: number; ace: number }): string {
  const x = birdieExtras(d);
  const parts: string[] = [];
  if (x.eagles) parts.push(plural(x.eagles, 'eagle'));
  if (x.albatross) parts.push(plural(x.albatross, 'albatros', 'albatros'));
  if (x.ace) parts.push(plural(x.ace, 'trou en un', 'trous en un'));
  return parts.length ? `dont ${parts.join(', ')}` : '';
}

/** Barres de practice adaptées à la période : semaines (1 M, 3 M) ou mois (6 M, 1 A, Tout). */
export interface PracticeBucket {
  key: string;
  start: string;
  minutes: number;
  balls: number;
  label: string;
  long: string;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const monLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

export function practiceBuckets(
  weekly: Array<{ week: string; minutes: number; balls: number }>,
  period: string,
  from: string | null,
  to: string,
): { buckets: PracticeBucket[]; unit: 'week' | 'month' } {
  const end = parseLocal(to);
  if (period === '1m' || period === '3m') {
    const n = period === '1m' ? 5 : 13;
    const mon = new Date(end);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const map = new Map(weekly.map((w) => [w.week, w]));
    const buckets: PracticeBucket[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(mon);
      d.setDate(mon.getDate() - i * 7);
      const k = iso(d);
      const w = map.get(k);
      buckets.push({ key: k, start: k, minutes: w?.minutes ?? 0, balls: w?.balls ?? 0, label: i % (n > 6 ? 4 : 1) === 0 || i === n - 1 ? dShort.format(d) : '', long: `Semaine du ${dShort.format(d)}` });
    }
    return { buckets, unit: 'week' };
  }
  let start = from ? parseLocal(from) : null;
  if (!start) {
    const first = weekly[0]?.week;
    start = first ? parseLocal(first) : new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const minStart = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    if (start > minStart) start = minStart;
  }
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const buckets: PracticeBucket[] = [];
  const map = new Map<string, { minutes: number; balls: number }>();
  for (const w of weekly) {
    const d = parseLocal(w.week);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const e = map.get(k) ?? { minutes: 0, balls: 0 };
    e.minutes += w.minutes;
    e.balls += w.balls;
    map.set(k, e);
  }
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const spanMonths = (last.getFullYear() - cur.getFullYear()) * 12 + last.getMonth() - cur.getMonth() + 1;
  const every = spanMonths > 14 ? 3 : spanMonths > 8 ? 2 : 1;
  let i = 0;
  while (cur <= last) {
    const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    const v = map.get(k);
    buckets.push({ key: k, start: iso(cur), minutes: v?.minutes ?? 0, balls: v?.balls ?? 0, label: i % every === 0 ? monShort.format(cur).replace('.', '') : '', long: monLong.format(cur) });
    cur.setMonth(cur.getMonth() + 1);
    i++;
  }
  return { buckets, unit: 'month' };
}
