/**
 * Plan de parcours tiré d'OpenStreetMap (GET /api/plans/:slug).
 * Coordonnées en mètres entiers autour du point de référence `origin` : x vers l'est, y vers le sud.
 * Un anneau est un tableau plat [x0, y0, x1, y1, …]. Conversions GPS : voir geoToPlan / planToGeo.
 */
export type Ring = number[];
/** Une surface : anneau extérieur puis trous éventuels (fill-rule evenodd). */
export type Shape = Ring[];

export type PlanLayer = 'rough' | 'scrub' | 'wood' | 'water' | 'fairway' | 'driving_range' | 'tee' | 'bunker' | 'green';

export interface PlanHole {
  ref: number | null;
  par: number | null;
  /** Index du trou (handicap), 1 = le plus difficile. */
  hcp: number | null;
  /** Longueur du tracé OSM en mètres. */
  len: number;
  /** Boucle (0 = parcours principal, -1 = trou sans numéro). */
  loop: number;
  /** Ligne départ → green. */
  line: Ring;
}

export interface PlanLoop {
  holes: number;
  par: number | null;
  len: number;
}

export type PlanLevel = 'complet' | 'partiel' | 'inexistant';

export interface PlanQuality {
  level: PlanLevel;
  /** Nombre de trous attendu selon le référentiel. */
  expected: number | null;
  holes: number;
  pars: number;
  hcp: number;
  fairways: number;
  greens: number;
  tees: number;
  bunkers: number;
  water: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Mètres par degré de latitude (et de longitude à l'équateur), comme à l'extraction. */
export const METERS_PER_DEGREE = 111_320;

/** Position GPS → coordonnées du plan (mètres, x vers l'est, y vers le sud). */
export function geoToPlan(origin: GeoPoint, p: GeoPoint): [number, number] {
  const k = Math.cos((origin.lat * Math.PI) / 180);
  return [(p.lon - origin.lon) * k * METERS_PER_DEGREE, -(p.lat - origin.lat) * METERS_PER_DEGREE];
}

/** Coordonnées du plan → position GPS. */
export function planToGeo(origin: GeoPoint, x: number, y: number): GeoPoint {
  const k = Math.cos((origin.lat * Math.PI) / 180);
  return { lat: origin.lat - y / METERS_PER_DEGREE, lon: origin.lon + x / (k * METERS_PER_DEGREE) };
}

export interface CoursePlan {
  v: 1;
  /** Point GPS correspondant à (0, 0). Absent sur les plans extraits avant le 26/10/2026 (rattrapé par le cron). */
  origin?: GeoPoint;
  slug: string;
  name: string;
  /** Éléments OSM d'origine, ex. « way/80747240 ». */
  osm: string[];
  updated: string;
  outline: Shape[];
  layers: Partial<Record<PlanLayer, Shape[]>>;
  holes: PlanHole[];
  loops: PlanLoop[];
  quality: PlanQuality;
}
