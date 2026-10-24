/**
 * Plan de parcours tiré d'OpenStreetMap (fichier statique public/plans/<slug>.json).
 * Coordonnées en mètres entiers autour du centre du golf : x vers l'est, y vers le sud.
 * Un anneau est un tableau plat [x0, y0, x1, y1, …].
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

export interface CoursePlan {
  v: 1;
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
