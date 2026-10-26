// Coups synthétiques du compte de démo : déterministes (PRNG semé par séance + trou), pour que les stats
// « Distances par club » racontent la même histoire à chaque rechargement. Quand le golf a un plan OSM
// (avec point de référence), les coups sont aussi posés sur la carte du trou : trajets, cartes « Coups de maître ».
import { planToGeo, type CoursePlan } from '../shared/plan';
import type { Fairway, Shot } from '../shared/practice';

/** Distance typique (carry + roulé, en m) et écart-type par club, pour un joueur autour de 18 d'index. */
const TYPICAL: Array<[string, number, number]> = [
  ['D', 205, 18], ['3W', 186, 14], ['5W', 172, 12], ['4H', 160, 11], ['5i', 150, 10], ['6i', 141, 9], ['7i', 131, 9],
  ['8i', 121, 8], ['9i', 110, 8], ['PW', 98, 7], ['GW', 84, 7], ['SW', 68, 8], ['LW', 48, 8],
];
const SD = Object.fromEntries(TYPICAL.map(([c, , sd]) => [c, sd]));
const AVG = Object.fromEntries(TYPICAL.map(([c, d]) => [c, d]));

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Club (hors putter) dont la distance typique est la plus proche de `target`. */
function closest(target: number, allowD: boolean): string {
  let best = '', gap = Infinity;
  for (const [c, d] of TYPICAL) {
    if (c === 'D' && !allowD) continue;
    const g = Math.abs(d - target);
    if (g < gap) { gap = g; best = c; }
  }
  return best;
}

/**
 * Coups d'un trou, un élément par coup joué (pénalités ignorées : elles ne figurent pas sur la carte,
 * donc nombre de coups = strokes − penalties, au minimum 1). Renvoie [] si strokes est vide.
 */
export function demoShots(sessionId: string, hole: number, par: number, strokes: number | null | undefined, putts: number | null | undefined, penalties: number | null | undefined): Shot[] {
  if (!strokes || strokes < 1) return [];
  const rnd = mulberry32(hash(`${sessionId}:${hole}`));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const normal = (m: number, sd: number) => m + sd * gauss();
  const uni = (a: number, b: number) => a + (b - a) * rnd();

  const total = Math.max(1, strokes - Math.max(0, penalties ?? 0));
  let nPutts = total === 1 ? 0 : Math.max(1, putts ?? 2);
  if (total - nPutts < 1) nPutts = total - 1;
  const nFull = total - nPutts;

  let remaining = par >= 5 ? normal(455, 30) : par === 4 ? normal(335, 30) : normal(150, 18);
  remaining = Math.max(60, remaining);
  const shots: Shot[] = [];

  for (let k = 0; k < nFull; k++) {
    let club: string, dist: number;
    const mishit = () => (rnd() < 0.08 ? uni(0.55, 0.75) : 1);
    if (k === 0 && par >= 4) {
      club = rnd() < 0.15 ? '3W' : 'D';
      dist = normal(AVG[club], SD[club]) * mishit();
    } else if (k === nFull - 1) {
      club = closest(remaining, false);
      // Plafonné à la portée raisonnable du club : un 3W ne fait pas 280 m.
      dist = Math.max(5, Math.min(remaining - uni(0, 8), AVG[club] + 1.5 * SD[club]));
    } else {
      // Même près du drapeau on joue encore (70-130 m visés au minimum) un vrai coup ; la distance reste naturelle (pas de coups de 5 m).
      club = closest(Math.max(uni(70, 130), Math.min(remaining - 30, 190)), false);
      dist = normal(AVG[club], SD[club]) * (rnd() < 0.06 ? uni(0.55, 0.75) : 1);
    }
    dist = Math.max(5, dist);
    // Les coups « en trop » partent de côté ou reculent : la balle ne se rapproche pas du drapeau au-delà de ~30 m.
    const advance = k === nFull - 1 ? dist : Math.min(dist, Math.max(0, remaining - 30));
    shots.push({ lat: null, lon: null, club, dist: Math.round(dist) });
    remaining = Math.max(3, remaining - advance);
  }

  for (let i = 0; i < nPutts; i++) {
    const d = i === 0 ? uni(2, 14) : uni(0.5, i === 1 ? 2 : 1.5);
    shots.push({ lat: null, lon: null, club: 'P', dist: Math.max(1, Math.round(d)) });
  }
  return shots;
}

type P = [number, number];

/** Point à `d` mètres le long d'une polyligne, et la direction locale (vecteur unitaire). */
function alongLine(line: P[], d: number): { p: P; dir: P } {
  let rest = Math.max(0, d);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dir: P = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    if (rest <= l || i === line.length - 1) {
      const k = Math.min(rest, l);
      return { p: [a[0] + dir[0] * k, a[1] + dir[1] * k], dir };
    }
    rest -= l;
  }
  return { p: line[0], dir: [0, -1] };
}

/** Boucle d'une séance : '' = parcours principal (0), « Boucle N » = N − 1. */
const loopOf = (course: string | null | undefined) => {
  const m = /(\d+)/.exec(course ?? '');
  return course && m ? Math.max(0, Number(m[1]) - 1) : 0;
};

/**
 * Pose les coups sur le plan du trou : les coups pleins avancent le long de la ligne du trou (à l'échelle de sa
 * longueur), avec un écart latéral (et le côté du fairway manqué pour le drive) ; le dernier finit sur le green
 * à la distance du premier putt, puis chaque putt rapproche la balle du drapeau. Sans plan exploitable : inchangé.
 */
export function placeDemoShots(shots: Shot[], plan: CoursePlan | null | undefined, sessionId: string, hole: number, par: number, course: string | null | undefined, fairway: Fairway | null | undefined): Shot[] {
  if (!shots.length || !plan?.origin) return shots;
  const ph = plan.holes.find((h) => h.ref === hole && h.loop === loopOf(course));
  if (!ph || ph.line.length < 4) return shots;
  const line: P[] = [];
  for (let i = 0; i + 1 < ph.line.length; i += 2) line.push([ph.line[i], ph.line[i + 1]]);
  let L = 0;
  for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  const pin = line[line.length - 1];
  const rnd = mulberry32(hash(`${sessionId}:${hole}:pos`));
  const uni = (a: number, b: number) => a + (b - a) * rnd();

  const nFull = shots.findIndex((s) => s.club === 'P');
  const full = nFull < 0 ? shots.length : nFull;
  const pts: P[] = [line[0]];
  // balle après les coups pleins : sur le green, à la distance du 1er putt (ou dans le trou)
  const firstPutt = nFull >= 0 ? shots[nFull].dist ?? 6 : 0;
  const cum: number[] = [];
  let acc = 0;
  for (let k = 0; k < full; k++) { acc += shots[k].dist ?? 0; cum.push(acc); }
  const scale = acc > 0 ? Math.max(0, L - firstPutt) / acc : 1;
  // trou de la démo trop différent du plan (par, longueur) : on ne dessine pas un trajet absurde
  if ((ph.par != null && ph.par !== par) || scale < 0.7 || scale > 1.4) return shots;
  for (let k = 0; k < full - 1; k++) {
    const { p, dir } = alongLine(line, cum[k] * scale);
    const left: P = [dir[1], -dir[0]];
    let off = uni(-9, 9);
    if (k === 0 && fairway === 'left') off = uni(18, 30);
    else if (k === 0 && fairway === 'right') off = -uni(18, 30);
    pts.push([p[0] + left[0] * off, p[1] + left[1] * off]);
  }
  // balles sur le green : de plus en plus près du drapeau
  if (nFull >= 0) {
    for (let i = nFull; i < shots.length; i++) {
      const r = shots[i].dist ?? 1;
      const a = uni(0, Math.PI * 2);
      pts.push([pin[0] + Math.cos(a) * r, pin[1] + Math.sin(a) * r]);
    }
  }
  return shots.map((s, i) => {
    const q = pts[i];
    if (!q) return s;
    const g = planToGeo(plan.origin!, q[0], q[1]);
    return { ...s, lat: Math.round(g.lat * 1e7) / 1e7, lon: Math.round(g.lon * 1e7) / 1e7 };
  });
}
