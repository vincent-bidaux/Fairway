import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CoursePlan, PlanHole, PlanLayer, PlanLevel, Ring, Shape } from '../../shared/plan';
import { CLUB_BY_ID, type Shot } from '../../shared/practice';
import { dist, greenBox, holeGreen, holePin, holeTee, shotPoints } from '../practice/shotGeo';
import { HoleGrid } from './HoleGrid';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const ORDER: PlanLayer[] = ['rough', 'scrub', 'wood', 'water', 'fairway', 'driving_range', 'tee', 'bunker', 'green'];
const MAX_ZOOM = 14;
/** Stage shape, shared by the course view and the hole view so the widget never changes size. */
const MIN_ASPECT = 0.78;
const MAX_ASPECT = 1.2;

export type Box = { x: number; y: number; w: number; h: number };
export type Pt = [number, number];

export const ringD = (r: Ring, close = true) => {
  let d = '';
  for (let i = 0; i + 1 < r.length; i += 2) d += (i ? 'L' : 'M') + r[i] + ' ' + r[i + 1];
  return close ? d + 'Z' : d;
};
const shapeD = (s: Shape) => s.map((r) => ringD(r)).join('');
export const pts = (r: Ring): Pt[] => {
  const o: Pt[] = [];
  for (let i = 0; i + 1 < r.length; i += 2) o.push([r[i], r[i + 1]]);
  return o;
};
const lineLen = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const km = (m: number) => (m / 1000).toFixed(1).replace('.', ',') + ' km';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const LEVEL_LABEL: Record<PlanLevel, string> = {
  complet: 'Plan complet',
  partiel: 'Plan partiel',
  inexistant: 'Trous non tracés',
};

function loopLabel(l: { holes: number; par: number | null }) {
  return `${l.holes} trou${l.holes > 1 ? 's' : ''}${l.par ? ` · par ${l.par}` : ''}`;
}

/** Fond du plan (contour + surfaces), en mètres. Mémorisé : ne se redessine pas pendant un zoom. */
export const PlanBase = memo(function PlanBase({ plan }: { plan: CoursePlan }) {
  return (
    <>
      {plan.outline.map((s, i) => (
        <path key={`o${i}`} className="cw-course" fillRule="evenodd" d={shapeD(s)} />
      ))}
      {ORDER.map((k) =>
        (plan.layers[k] ?? []).map((s, i) => <path key={`${k}${i}`} className={`cw-${k}`} fillRule="evenodd" d={shapeD(s)} />),
      )}
    </>
  );
});

/** Rotation qui met le départ en bas et le green en haut. */
export function holeFrame(h: PlanHole, aspect: number) {
  const p = pts(h.line);
  const t = p[0], e = p[p.length - 1];
  const theta = -Math.PI / 2 - Math.atan2(e[1] - t[1], e[0] - t[0]);
  const c = Math.cos(theta), s = Math.sin(theta);
  const R = (q: Pt): Pt => [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
  const rp = p.map(R);
  const xs = rp.map((q) => q[0]), ys = rp.map((q) => q[1]);
  const minY = Math.min(...ys) - 45, maxY = Math.max(...ys) + 30;
  const h0 = maxY - minY;
  // same shape as the course view: widen around the line, or add room above and below
  const w0 = Math.max(Math.max(...xs) - Math.min(...xs) + 90, h0 * aspect);
  const hh = Math.max(h0, w0 / aspect);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const box: Box = { x: cx - w0 / 2, y: minY - (hh - h0) / 2, w: w0, h: hh };
  // distance marks from the green, measured back along the line
  const total = lineLen(p);
  const marks: Array<{ m: number; at: Pt }> = [];
  for (const m of [100, 150, 200]) {
    if (m > total - 40) continue;
    let rem = total - m, acc = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + seg >= rem) {
        const f = (rem - acc) / seg;
        marks.push({ m, at: R([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]) });
        break;
      }
      acc += seg;
    }
  }
  return { deg: (theta * 180) / Math.PI, box, tee: R(t), pin: R(e), marks };
}

function courseBox(plan: CoursePlan): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (r: Ring) => {
    for (let i = 0; i + 1 < r.length; i += 2) {
      x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]);
      y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]);
    }
  };
  plan.outline.forEach((s) => s.forEach(add));
  plan.holes.forEach((h) => add(h.line));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.04 + 12;
  let w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  // keep the stage between a slightly tall and a slightly wide shape (the hole view uses the same one)
  if (w / h < MIN_ASPECT) w = h * MIN_ASPECT;
  if (w / h > MAX_ASPECT) h = w / MAX_ASPECT;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

/** Zoom (pincement, double-tap, molette + Ctrl, boutons) et déplacement quand on est zoomé. */
export function useZoomPan(base: Box, onSwipe?: (dir: 1 | -1) => void) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({ k: 1, cx: base.x + base.w / 2, cy: base.y + base.h / 2 });
  const live = useRef({ view, size, base });
  live.current = { view, size, base };
  const ptrs = useRef(new Map<number, Pt>());
  const g = useRef<{ start?: Pt; c0?: Pt; d0?: number; k0?: number; mid0?: Pt; moved: boolean; multi: boolean }>({ moved: false, multi: false });
  const moved = useRef(false);

  useEffect(() => {
    setView({ k: 1, cx: base.x + base.w / 2, cy: base.y + base.h / 2 });
  }, [base]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const upd = () => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = useCallback((k: number, cx: number, cy: number) => {
    const { base: b, size: s } = live.current;
    const w = b.w / k, h = b.h / k;
    const x = clamp(cx - w / 2, b.x, b.x + b.w - w), y = clamp(cy - h / 2, b.y, b.y + b.h - h);
    const u = Math.max(w / s.w, h / s.h);
    return { vb: { x, y, w, h }, u, offX: (s.w - w / u) / 2, offY: (s.h - h / u) / 2 };
  }, []);

  const set = useCallback((k: number, cx: number, cy: number) => {
    const { base: b } = live.current;
    k = clamp(k, 1, MAX_ZOOM);
    const w = b.w / k, h = b.h / k;
    cx = clamp(cx, b.x + w / 2, b.x + b.w - w / 2);
    cy = clamp(cy, b.y + h / 2, b.y + b.h - h / 2);
    setView({ k, cx, cy });
  }, []);

  // Glissement animé vers une vue (zoom piloté par l'app : green, dernier coup…)
  const anim = useRef(0);
  const glide = useCallback(
    (k: number, cx: number, cy: number) => {
      cancelAnimationFrame(anim.current);
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const from = live.current.view;
      if (reduce) return set(k, cx, cy);
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 320);
        const e = 1 - (1 - p) ** 3;
        // interpolate the zoom geometrically so the motion feels even
        set(from.k * (k / from.k) ** e, from.cx + (cx - from.cx) * e, from.cy + (cy - from.cy) * e);
        if (p < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [set],
  );
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = stage.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const toWorld = (p: Pt) => {
    const { view: v } = live.current;
    const f = frame(v.k, v.cx, v.cy);
    return [f.vb.x + (p[0] - f.offX) * f.u, f.vb.y + (p[1] - f.offY) * f.u] as Pt;
  };
  /** Zoom to k keeping the world point under screen point p fixed. */
  const zoomAt = (k: number, p: Pt) => {
    const w = toWorld(p);
    const kk = clamp(k, 1, MAX_ZOOM);
    const f = frame(kk, 0, 0);
    const x = w[0] - (p[0] - f.offX) * f.u, y = w[1] - (p[1] - f.offY) * f.u;
    set(kk, x + f.vb.w / 2, y + f.vb.h / 2);
  };

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      ptrs.current.set(e.pointerId, local(e));
      const v = live.current.view;
      if (ptrs.current.size === 1) {
        g.current = { start: local(e), c0: [v.cx, v.cy], moved: false, multi: false };
        moved.current = false;
      } else if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()];
        g.current = { ...g.current, d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: v.k, mid0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], multi: true, moved: true };
        moved.current = true;
        try { stage.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    },
    onPointerMove(e: React.PointerEvent) {
      if (!ptrs.current.has(e.pointerId)) return;
      ptrs.current.set(e.pointerId, local(e));
      const st = g.current;
      if (ptrs.current.size >= 2 && st.d0 && st.k0) {
        const [a, b] = [...ptrs.current.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomAt(st.k0 * (d / st.d0), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        st.k0 = clamp(st.k0 * (d / st.d0), 1, MAX_ZOOM);
        st.d0 = d;
        return;
      }
      if (!st.start || st.multi) return;
      const p = local(e);
      const dx = p[0] - st.start[0], dy = p[1] - st.start[1];
      if (Math.hypot(dx, dy) > 6) { st.moved = true; moved.current = true; }
      const v = live.current.view;
      if (v.k > 1 && st.c0) {
        const f = frame(v.k, v.cx, v.cy);
        set(v.k, st.c0[0] - dx * f.u, st.c0[1] - dy * f.u);
      }
    },
    onPointerUp(e: React.PointerEvent) {
      const st = g.current;
      const p = local(e);
      ptrs.current.delete(e.pointerId);
      if (ptrs.current.size > 0) return;
      if (!st.multi && st.start && live.current.view.k <= 1.01 && onSwipe) {
        const dx = p[0] - st.start[0], dy = p[1] - st.start[1];
        if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
      }
      g.current = { moved: st.moved, multi: false };
    },
    onPointerCancel(e: React.PointerEvent) {
      ptrs.current.delete(e.pointerId);
      if (!ptrs.current.size) g.current = { moved: false, multi: false };
    },
    onDoubleClick(e: React.MouseEvent) {
      const v = live.current.view;
      if (v.k > 1.01) set(1, base.x + base.w / 2, base.y + base.h / 2);
      else zoomAt(2.5, local(e));
    },
  };

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(live.current.view.k * Math.exp(-e.deltaY * 0.01), local(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const f = frame(view.k, view.cx, view.cy);
  return {
    stage,
    handlers,
    viewBox: `${f.vb.x} ${f.vb.y} ${f.vb.w} ${f.vb.h}`,
    /** Mètres par pixel écran, pour garder pastilles et textes à taille constante. */
    u: f.u,
    zoomed: view.k > 1.01,
    zoomBy: (m: number) => zoomAt(view.k * m, [size.w / 2, size.h / 2]),
    /** Zoom autour d'un point du dessin, qui devient le centre de la vue. */
    zoomAround: (m: number, c: Pt) => glide(clamp(view.k * m, 1, MAX_ZOOM), c[0], c[1]),
    /** Cadre la vue sur une zone du dessin (animé). */
    zoomTo: (b: Box) => {
      const k = clamp(Math.min(base.w / b.w, base.h / b.h), 1, MAX_ZOOM);
      glide(k, b.x + b.w / 2, b.y + b.h / 2);
    },
    /** Facteur de zoom actuel (1 = vue entière). */
    k: view.k,
    reset: () => glide(1, base.x + base.w / 2, base.y + base.h / 2),
    wasDrag: () => moved.current,
    /** Point écran (clientX/clientY) → coordonnées du dessin (repère du viewBox). */
    toWorld: (clientX: number, clientY: number): Pt => {
      const r = stage.current!.getBoundingClientRect();
      return toWorld([clientX - r.left, clientY - r.top]);
    },
  };
}

// ---------------------------------------------------------------- partie jouée sur le plan
/** Ce qui a été joué : la boucle et, pour chaque trou, les coups (dans l'ordre de jeu). */
export interface PlayedRound {
  loop: number;
  holes: Array<{ ref: number; shots: Shot[]; holed: boolean }>;
}

/** Un coup entre deux positions, avec l'étiquette « 212 m Dr » (repère du plan). */
interface PlayedSeg {
  a: Pt;
  b: Pt;
  d: number;
  text: string;
}
interface PlayedHole {
  hole: PlanHole;
  holed: boolean;
  /** Positions des coups (plan). */
  spots: Pt[];
  /** Tracé de la balle : les positions, puis le drapeau si le trou est terminé. */
  path: Pt[];
  segs: PlayedSeg[];
}
interface Placed {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

/** Putts et petits coups : pas d'étiquette sous cette distance. */
const MIN_LABEL_M = 25;
/** Sur la vue d'ensemble, seuls les longs coups portent une étiquette. */
const COURSE_LABEL_M = 120;
const LAB_H = 20;
const labW = (text: string) => text.length * 7 + 12;

function playedHole(plan: CoursePlan, hole: PlanHole, shots: Shot[], holed: boolean): PlayedHole {
  const pin = holePin(hole);
  const pp = shotPoints(shots, plan.origin, holeTee(hole));
  const spots: Pt[] = [];
  const segs: PlayedSeg[] = [];
  pp.forEach((p, i) => {
    if (!p) return;
    spots.push(p);
    const next = i + 1 < pp.length ? pp[i + 1] : holed ? pin : null;
    if (!next) return;
    const d = Math.round(shots[i].dist ?? dist(p, next));
    const club = shots[i].club ? CLUB_BY_ID[shots[i].club!]?.short : null;
    segs.push({ a: p, b: next, d, text: `${d} m${club ? ` ${club}` : ''}` });
  });
  const path = holed && spots.length ? [...spots, pin] : spots;
  return { hole, holed, spots, path, segs };
}

const rotator = (deg: number) => {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return (q: Pt): Pt => [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
};

/**
 * Place les étiquettes de coups (coordonnées de la vue) : au milieu du segment, décalées perpendiculairement
 * pour ne pas masquer le trait. La taille est constante à l'écran (× u). On traite les plus longs coups d'abord
 * et on abandonne toute étiquette qui en chevaucherait une déjà retenue.
 */
function layoutLabels(segs: PlayedSeg[], u: number, min: number): Placed[] {
  const out: Placed[] = [];
  const pad = 2 * u;
  const cands = segs.filter((s) => s.d >= min).sort((a, b) => b.d - a.d);
  cands.forEach((s, i) => {
    const w = labW(s.text) * u, h = LAB_H * u;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    // le côté « haut » de l'écran ; trait vertical : côté droit
    if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) { nx = -nx; ny = -ny; }
    const off = (w / 2) * Math.abs(nx) + (h / 2) * Math.abs(ny) + 3 * u;
    const cx = (s.a[0] + s.b[0]) / 2 + nx * off, cy = (s.a[1] + s.b[1]) / 2 + ny * off;
    const x = cx - w / 2, y = cy - h / 2;
    const hit = out.some((o) => x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y);
    if (!hit) out.push({ key: `l${i}`, x, y, w, h, text: s.text });
  });
  return out;
}

function PlayedLabels({ labels, u }: { labels: Placed[]; u: number }) {
  return (
    <g className="cw-pl-labs">
      {labels.map((l) => (
        <g key={l.key}>
          <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={l.h / 2} />
          <text x={l.x + l.w / 2} y={l.y + l.h / 2} fontSize={12 * u}>
            {l.text}
          </text>
        </g>
      ))}
    </g>
  );
}

const pathD = (p: Pt[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join('');

interface Props {
  plan: CoursePlan;
  lat?: number | null;
  lng?: number | null;
  /** Partie jouée : verrouille la boucle, ne liste que les trous joués et dessine la trajectoire de la balle. */
  played?: PlayedRound;
}

/** Widget plan du parcours : vue d'ensemble cliquable, puis un écran par trou (départ en bas, drapeau en haut). */
export function CourseWidget({ plan, lat, lng, played }: Props) {
  const loops = plan.loops.length ? plan.loops : [];
  const [loopSel, setLoop] = useState(0);
  const loop = played ? played.loop : loopSel;
  const [hole, setHole] = useState<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // tous les trous de la boucle (vue d'ensemble)
  const loopAll = useMemo(
    () => plan.holes.filter((h) => h.loop === loop && h.ref != null).sort((a, b) => (a.ref ?? 0) - (b.ref ?? 0)),
    [plan, loop],
  );
  // trous jouables via la règle : tous, ou seulement ceux de la partie dans l'ordre de jeu
  const playedHoles = useMemo(() => {
    if (!played) return null;
    const out: PlayedHole[] = [];
    for (const ph of played.holes) {
      const h = loopAll.find((x) => x.ref === ph.ref);
      if (h) out.push(playedHole(plan, h, ph.shots, ph.holed));
    }
    return out;
  }, [played, plan, loopAll]);
  const loopHoles = useMemo(() => (playedHoles ? playedHoles.map((p) => p.hole) : loopAll), [playedHoles, loopAll]);
  const current = hole != null ? loopHoles[hole] : undefined;
  const curPlayed = playedHoles && hole != null ? playedHoles[hole] : undefined;
  const cBox = useMemo(() => courseBox(plan), [plan]);
  const hf = useMemo(() => (current ? holeFrame(current, cBox.w / cBox.h) : null), [current, cBox]);
  const base = hf ? hf.box : cBox;

  const step = useCallback(
    (d: 1 | -1) => {
      setHole((h) => {
        if (h == null) return d === 1 && loopHoles.length ? 0 : h;
        const n = h + d;
        return n < 0 ? null : n >= loopHoles.length ? h : n;
      });
    },
    [loopHoles.length],
  );
  const zp = useZoomPan(base, step);

  const level = plan.quality.level;
  const loopInfo = loops[loop];
  const title = current ? `Trou n° ${current.ref}` : played ? 'Votre partie' : 'Plan du parcours';
  const sub = current
    ? [current.par ? `Par ${current.par}` : null, current.hcp ? `Index ${current.hcp}` : null, `${current.len} m`].filter(Boolean).join(' · ')
    : loopInfo
      ? `${loopLabel(loopInfo)} · ${km(loopInfo.len)}`
      : 'Trous non tracés';
  const u = zp.u;
  // header + loop tabs + « Parcours » + rows of holes (9 per row): keeps the whole widget within the screen
  const chrome = 60 + (loops.length > 1 ? 46 : 0) + 16 + Math.max(1, Math.ceil(loopHoles.length / 9)) * 36;
  const aspect = `${cBox.w} / ${cBox.h}`;
  const others = played ? [] : plan.holes.filter((h) => h.loop !== loop);

  // --- partie jouée : tracés, étiquettes et boutons de zoom propres à la vue courante
  const rot = useMemo(() => rotator(hf ? hf.deg : 0), [hf]);
  const holeView = useMemo(() => {
    if (!curPlayed) return null;
    const spots = curPlayed.spots.map(rot);
    return {
      spots,
      path: curPlayed.path.map(rot),
      segs: curPlayed.segs.map((s) => ({ ...s, a: rot(s.a), b: rot(s.b) })),
      last: spots.length ? spots[spots.length - 1] : null,
    };
  }, [curPlayed, rot]);
  const courseSegs = useMemo(() => (playedHoles ?? []).flatMap((p) => p.segs), [playedHoles]);
  // dépend de u : les étiquettes se recalculent à chaque changement de zoom
  const labels = useMemo(
    () => (holeView ? layoutLabels(holeView.segs, u, MIN_LABEL_M) : playedHoles && !current ? layoutLabels(courseSegs, u, Math.max(MIN_LABEL_M, COURSE_LABEL_M)) : []),
    [holeView, playedHoles, current, courseSegs, u],
  );
  const plusZoom = () => (holeView?.last ? zp.zoomAround(1.6, holeView.last) : zp.zoomBy(1.6));
  const zoomGreen = () => {
    if (!current || !hf) return;
    const b = greenBox(holeGreen(plan, current), holePin(current));
    const m = 12;
    const cs = [rot([b.x - m, b.y - m]), rot([b.x + b.w + m, b.y - m]), rot([b.x - m, b.y + b.h + m]), rot([b.x + b.w + m, b.y + b.h + m])];
    const xs = cs.map((q) => q[0]), ys = cs.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    zp.zoomTo({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 });
  };

  const pick = (h: PlanHole) => {
    if (zp.wasDrag()) return;
    if (played) {
      const i = loopHoles.indexOf(h);
      if (i >= 0) setHole(i);
      return;
    }
    if (h.loop !== loop && h.loop >= 0) {
      const lh = plan.holes.filter((x) => x.loop === h.loop && x.ref != null).sort((a, b) => (a.ref ?? 0) - (b.ref ?? 0));
      setLoop(h.loop);
      setHole(lh.indexOf(h));
      return;
    }
    setHole(loopHoles.indexOf(h));
  };

  return (
    <section className={`cw${played ? ' cw--played' : ''}`} aria-label={played ? 'Votre partie sur le plan du parcours' : 'Plan du parcours'} style={{ '--cw-chrome': `${chrome}px` } as CSSProperties}>
      <header className={`cw-head${current ? ' has-back' : ''}`}>
        {current && (
          <button type="button" className="cw-back" aria-label="Retour au plan du parcours" onClick={() => setHole(null)}>
            <Icon name="chevron" size={20} strokeWidth={2.6} />
          </button>
        )}
        <div className="cw-titles">
          <h3 className="cw-title">{title}</h3>
          <p className="cw-sub">{sub}</p>
        </div>
        <button
          type="button"
          className={`cw-q cw-q--${level}`}
          aria-label={`${LEVEL_LABEL[level]} : en savoir plus`}
          onClick={() => setInfoOpen(true)}
        >
          <Icon name="info" size={24} strokeWidth={2} />
        </button>
      </header>

      {loops.length > 1 && !played && (
        <div className="cw-loops" role="group" aria-label="Boucles">
          {loops.map((l, i) => (
            <button
              key={i}
              type="button"
              className={`chip cw-loop${i === loop ? ' is-active' : ''}`}
              aria-pressed={i === loop}
              onClick={() => {
                setLoop(i);
                setHole(null);
              }}
            >
              {loopLabel(l)}
            </button>
          ))}
        </div>
      )}

      <div
        ref={zp.stage}
        className={`cw-stage${zp.zoomed ? ' is-zoomed' : ''}`}
        style={{ aspectRatio: aspect }}
        tabIndex={0}
        aria-label={current ? `Trou ${current.ref}, vu du départ` : 'Plan du parcours, touchez un numéro pour voir le trou'}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
          if (e.key === 'Escape') setHole(null);
        }}
        {...zp.handlers}
      >
        <svg className="cw-svg" viewBox={zp.viewBox} preserveAspectRatio="xMidYMid meet" role="img">
          {hf && current ? (
            <>
              <g transform={`rotate(${hf.deg})`}>
                <PlanBase plan={plan} />
                <path className="cw-line cw-line--sel" d={ringD(current.line, false)} vectorEffect="non-scaling-stroke" />
              </g>
              {hf.marks.map((mk) => (
                <g key={mk.m}>
                  <circle cx={mk.at[0]} cy={mk.at[1]} r={3.5 * u} className="cw-mark" />
                  <text x={mk.at[0] + 8 * u} y={mk.at[1]} fontSize={11 * u} className="cw-mark-t">
                    {mk.m}
                  </text>
                </g>
              ))}
              <circle cx={hf.tee[0]} cy={hf.tee[1]} r={6 * u} strokeWidth={2 * u} className="cw-teept" />
              <circle cx={hf.pin[0]} cy={hf.pin[1]} r={6 * u} strokeWidth={2 * u} className="cw-pin" />
              {holeView && holeView.path.length > 1 && (
                <>
                  <path className="cw-pl-under" d={pathD(holeView.path)} vectorEffect="non-scaling-stroke" />
                  <path className="cw-pl-path" d={pathD(holeView.path)} vectorEffect="non-scaling-stroke" />
                </>
              )}
              {holeView && <PlayedLabels labels={labels} u={u} />}
              {holeView?.spots.map((q, i) => (
                <g key={`s${i}`} className="cw-pl-mk">
                  <circle cx={q[0]} cy={q[1]} r={9 * u} strokeWidth={1.5 * u} />
                  <text x={q[0]} y={q[1]} fontSize={10.5 * u}>
                    {i + 1}
                  </text>
                </g>
              ))}
            </>
          ) : (
            <>
              <PlanBase plan={plan} />
              {others.length > 0 && (
                <path className="cw-line cw-line--other" d={others.map((h) => ringD(h.line, false)).join('')} vectorEffect="non-scaling-stroke" />
              )}
              <path className="cw-line" d={loopAll.map((h) => ringD(h.line, false)).join('')} vectorEffect="non-scaling-stroke" />
              {loopAll.map((h, i) => {
                const n = h.line.length;
                return <circle key={`p${i}`} cx={h.line[n - 2]} cy={h.line[n - 1]} r={3 * u} className="cw-pin cw-pin--small" />;
              })}
              {playedHoles && (
                <>
                  <path className="cw-pl-under" d={playedHoles.map((p) => (p.path.length > 1 ? pathD(p.path) : '')).join('')} vectorEffect="non-scaling-stroke" />
                  <path className="cw-pl-path" d={playedHoles.map((p) => (p.path.length > 1 ? pathD(p.path) : '')).join('')} vectorEffect="non-scaling-stroke" />
                  {playedHoles.map((p, i) =>
                    p.spots.map((q, j) => <circle key={`d${i}-${j}`} cx={q[0]} cy={q[1]} r={2.6 * u} strokeWidth={1 * u} className="cw-pl-dot" />),
                  )}
                  <PlayedLabels labels={labels} u={u} />
                </>
              )}
              {others
                .filter((h) => h.ref != null)
                .map((h, i) => (
                  <g key={`b${i}`} className="cw-num cw-num--other" onClick={() => pick(h)}>
                    <circle cx={h.line[0]} cy={h.line[1]} r={8 * u} />
                    <text x={h.line[0]} y={h.line[1]} fontSize={9 * u}>
                      {h.ref}
                    </text>
                  </g>
                ))}
              {loopAll.map((h, i) => (
                <g
                  key={`n${i}`}
                  className={`cw-num${played && !loopHoles.includes(h) ? ' cw-num--other' : ''}`}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Trou ${h.ref}`}
                  onClick={() => pick(h)}
                >
                  <circle cx={h.line[0]} cy={h.line[1]} r={13 * u} />
                  <text x={h.line[0]} y={h.line[1]} fontSize={13 * u}>
                    {h.ref}
                  </text>
                </g>
              ))}
            </>
          )}
        </svg>

        <div className="cw-zoom">
          <button type="button" aria-label="Zoomer" onClick={plusZoom}>
            <Icon name="plus" size={18} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Dézoomer" onClick={() => zp.zoomBy(1 / 1.6)} disabled={!zp.zoomed}>
            <span className="cw-minus" aria-hidden="true" />
          </button>
        </div>
        {played && current && (
          <button type="button" className="cw-green" aria-label="Zoomer sur le green" onClick={zoomGreen}>
            Green
          </button>
        )}
        {zp.zoomed && (
          <button type="button" className="cw-reset" onClick={zp.reset}>
            Recentrer
          </button>
        )}
        <a className="cw-attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap
        </a>
      </div>

      <div className="cw-holes">
        <HoleGrid
          lead={{ label: 'Parcours', aria: 'Plan du parcours', onPick: () => setHole(null) }}
          items={loopHoles.map((h, i) => ({ key: i, label: h.ref, aria: `Trou ${h.ref}${h.par ? `, par ${h.par}` : ''}` }))}
          current={hole}
          onPick={(i) => setHole(i)}
        />
      </div>

      <QualitySheet open={infoOpen} onClose={() => setInfoOpen(false)} plan={plan} lat={lat} lng={lng} />
    </section>
  );
}

function QualitySheet({ open, onClose, plan, lat, lng }: { open: boolean; onClose: () => void } & Props) {
  const q = plan.quality;
  const exp = q.expected ?? null;
  const missing: string[] = [];
  if (q.level !== 'inexistant') {
    if (exp && q.holes < Math.min(exp, 18)) missing.push(`${q.holes} trous tracés sur ${exp}`);
    if (q.pars < q.holes) missing.push(q.pars ? `par connu sur ${q.pars} trous seulement` : 'pars des trous absents');
    if (q.fairways === 0) missing.push('fairways non dessinés');
    if (q.greens < 0.8 * q.holes) missing.push(q.greens ? `${q.greens} greens dessinés seulement` : 'greens non dessinés');
  }
  const text: Record<PlanLevel, string> = {
    complet: 'Tous les trous sont tracés avec leur par, et les fairways et les greens sont dessinés. Le plan est fidèle au parcours.',
    partiel: `Les trous sont tracés, mais il manque des détails : ${missing.join(', ')}. Le plan reste utile pour s'orienter.`,
    inexistant: "OpenStreetMap contient le contour du golf, mais ses trous n'y sont pas encore tracés. Seul le contour est affiché.",
  };
  const rows: Array<[string, string]> = [
    ['Trous tracés', exp ? `${q.holes} / ${exp}` : String(q.holes)],
    ['Pars connus', `${q.pars} / ${q.holes}`],
    ['Index des trous', `${q.hcp} / ${q.holes}`],
    ['Fairways', String(q.fairways)],
    ['Greens', String(q.greens)],
    ['Départs', String(q.tees)],
    ['Bunkers', String(q.bunkers)],
    ["Pièces d'eau", String(q.water)],
  ];
  const edit = lat != null && lng != null ? `https://www.openstreetmap.org/edit#map=17/${lat}/${lng}` : 'https://www.openstreetmap.org';
  return (
    <Sheet open={open} onClose={onClose} title="Qualité du plan">
      <div className="cw-qsheet">
        <p className={`cw-qbadge cw-qbadge--${q.level}`}>
          <Icon name="info" size={18} strokeWidth={2.2} />
          {LEVEL_LABEL[q.level]}
        </p>
        <p className="cw-qtext">{text[q.level]}</p>
        <dl className="cw-qrows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="cw-qnote">
          Le plan est dessiné à partir d'OpenStreetMap, la carte libre et collaborative (mise à jour du {plan.updated.split('-').reverse().join('/')}).
          Les longueurs sont mesurées sur le tracé, pas sur la carte de score officielle. Tout le monde peut compléter le tracé du golf :{' '}
          <a href={edit} target="_blank" rel="noopener noreferrer">
            modifier sur OpenStreetMap
          </a>
          .
        </p>
      </div>
    </Sheet>
  );
}

/** Emplacement réservé pendant le chargement du plan. */
export function CourseWidgetSkeleton() {
  return (
    <section className="cw cw--loading" aria-hidden="true">
      <header className="cw-head">
        <div className="cw-titles">
          <h3 className="cw-title">Plan du parcours</h3>
          <p className="cw-sub">Chargement…</p>
        </div>
      </header>
      <div className="cw-stage" style={{ aspectRatio: '6 / 5' }} />
      <div className="cw-holes" />
    </section>
  );
}
