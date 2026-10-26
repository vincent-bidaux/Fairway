// Géométrie des coups sur le plan d'un trou : positions, distances, green, putts. Repère du plan (mètres).
import { geoToPlan, type CoursePlan, type GeoPoint, type PlanHole, type Ring } from '../../shared/plan';
import type { Shot } from '../../shared/practice';

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

const pts = (r: Ring): Pt[] => {
  const o: Pt[] = [];
  for (let i = 0; i + 1 < r.length; i += 2) o.push([r[i], r[i + 1]]);
  return o;
};

export const holeTee = (h: PlanHole): Pt => [h.line[0], h.line[1]];
export const holePin = (h: PlanHole): Pt => [h.line[h.line.length - 2], h.line[h.line.length - 1]];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Positions des coups dans le repère du plan ; le 1er coup part du départ s'il n'a pas été placé. */
export function shotPoints(shots: Shot[], origin: GeoPoint | undefined, tee: Pt | null): Array<Pt | null> {
  return shots.map((s, i) => {
    if (origin && s.lat != null && s.lon != null) return geoToPlan(origin, { lat: s.lat, lon: s.lon });
    return i === 0 ? tee : null;
  });
}

/** Distance de chaque coup : jusqu'au coup suivant, ou jusqu'au drapeau pour le dernier coup d'un trou terminé. */
export function shotDistances(points: Array<Pt | null>, pin: Pt | null, holed: boolean): Array<number | null> {
  return points.map((p, i) => {
    if (!p) return null;
    const next = i + 1 < points.length ? points[i + 1] : holed ? pin : null;
    return next ? dist(p, next) : null;
  });
}

function inRing(p: Pt, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}

/** Contour du green de ce trou : celui qui contient le drapeau, sinon le plus proche à moins de 40 m. */
export function holeGreen(plan: CoursePlan, h: PlanHole): Pt[] | null {
  const pin = holePin(h);
  let best: { ring: Pt[]; d: number } | null = null;
  for (const shape of plan.layers.green ?? []) {
    const ring = pts(shape[0] ?? []);
    if (ring.length < 3) continue;
    if (inRing(pin, ring)) return ring;
    const d = Math.min(...ring.map((q) => dist(q, pin)));
    if (d < 40 && (!best || d < best.d)) best = { ring, d };
  }
  return best?.ring ?? null;
}

/**
 * Zone du green à cadrer. Green dessiné : son contour. Sinon un carré de 36 m centré sur le drapeau
 * (un green mesure en général 25 à 35 m de long pour 500 à 700 m²).
 */
export function greenBox(green: Pt[] | null, pin: Pt): Box {
  if (green) {
    const xs = green.map((p) => p[0]), ys = green.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }
  return { x: pin[0] - 18, y: pin[1] - 18, w: 36, h: 36 };
}

/** Une balle est sur le green si elle est dans son contour, ou à moins de 15 m du drapeau sans contour. */
export const onGreen = (p: Pt, green: Pt[] | null, pin: Pt) => (green ? inRing(p, green) : dist(p, pin) <= 15);

/** Putts déduits : coups joués depuis le green (seulement si tous les coups ont une position). */
export function puttsFrom(points: Array<Pt | null>, green: Pt[] | null, pin: Pt): number | null {
  if (!points.length || points.some((p) => !p)) return null;
  return points.filter((p) => onGreen(p!, green, pin)).length;
}

/** Boîte englobante (repère tourné ou non) avec une marge, au moins `min` mètres de côté. */
export function boxAround(points: Pt[], margin: number, min = 50): Box {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  let x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin;
  let y0 = Math.min(...ys) - margin, y1 = Math.max(...ys) + margin;
  if (x1 - x0 < min) { const c = (x0 + x1) / 2; x0 = c - min / 2; x1 = c + min / 2; }
  if (y1 - y0 < min) { const c = (y0 + y1) / 2; y0 = c - min / 2; y1 = c + min / 2; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- boucles
/** Champ `course` d'une séance : '' pour le parcours principal, « Boucle 2 », « Boucle 3 »… pour les autres. */
export const courseOfLoop = (loop: number) => (loop <= 0 ? '' : `Boucle ${loop + 1}`);
export function loopOfCourse(course: string | null | undefined): number {
  const m = /^Boucle (\d+)$/.exec(course ?? '');
  return m ? Math.max(0, +m[1] - 1) : 0;
}
