// Trou stylisé vu de dessus, généré de façon déterministe (golf + numéro de trou), avec la trajectoire des coups du joueur.
import { useId } from 'react';
import type { Fairway } from '../../shared/practice';
import './highlights.css';

type P = [number, number];

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 320;
const H = 168;

/** Point à la fraction t (0–1) le long d'une polyligne. */
function along(pts: P[], t: number): P {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? d / lens[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

const smoothPath = (pts: P[]) => {
  if (pts.length < 3) return `M${pts[0]}L${pts[pts.length - 1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0]},${pts[i][1]} ${i === pts.length - 2 ? pts[i + 1][0] : mx},${i === pts.length - 2 ? pts[i + 1][1] : my}`;
  }
  return d;
};

export interface HoleDiagramProps {
  seed: number;
  par: number;
  strokes: number;
  putts: number | null;
  fairway: Fairway | null;
  ace?: boolean;
  label: string;
}

export function HoleDiagram({ seed, par, strokes, putts, fairway, ace, label }: HoleDiagramProps) {
  const uid = useId().replace(/:/g, '');
  const r = rng(seed * 7919 + par * 31 + 17);

  // ligne médiane du trou, du départ (gauche) au green (droite)
  const sgn = r() < 0.5 ? -1 : 1;
  const cy = H / 2;
  const tee: P = [30, cy + (par === 3 ? 0 : sgn * -6)];
  const greenC: P = [par === 3 ? 262 : 276, cy + (par === 3 ? (r() - 0.5) * 20 : sgn * (14 + r() * 16))];
  let mid: P[] = [];
  if (par === 4) {
    const dog = r() < 0.55;
    mid = [[dog ? 150 : 160, cy + (dog ? -sgn * (26 + r() * 20) : (r() - 0.5) * 16)]];
  } else if (par >= 5) {
    mid = [
      [110, cy - sgn * (22 + r() * 14)],
      [200, cy + sgn * (20 + r() * 14)],
    ];
  }
  const center: P[] = [tee, ...mid, greenC];
  const fwWidth = par === 3 ? 22 : par === 4 ? 36 : 40;

  // coups
  const noPutt = putts === 0;
  const approxPutts = putts ?? (strokes >= 3 ? 1 : 0);
  let nShots = ace ? 1 : Math.max(1, strokes - approxPutts);
  nShots = Math.min(nShots, 6);
  const hole: P = [greenC[0] + (r() - 0.5) * 8, greenC[1] + (r() - 0.5) * 6];
  const shots: P[] = [];
  if (ace) {
    shots.push(hole);
  } else {
    for (let i = 1; i <= nShots; i++) {
      if (i === nShots) {
        // dernier coup : sur le green (ou dans le trou si pas de putt)
        shots.push(noPutt ? hole : [greenC[0] - 20 + r() * 14, greenC[1] + (r() - 0.5) * 22]);
      } else {
        const t = (i / nShots) * 0.9;
        const p = along(center, t);
        let off = (r() - 0.5) * fwWidth * 0.5;
        if (i === 1 && par > 3 && fairway) {
          off = fairway === 'left' ? -(fwWidth / 2 + 8 + r() * 6) : fairway === 'right' ? fwWidth / 2 + 8 + r() * 6 : (r() - 0.5) * 8;
        }
        if (i === 1 && par > 3 && fairway === 'short') p[0] -= 14;
        shots.push([p[0], p[1] + off]);
      }
    }
  }
  const trail: P[] = [tee, ...shots];
  const nPutts = ace || noPutt ? 0 : Math.min(approxPutts, 4);
  const puttDots: P[] = [];
  if (nPutts > 0) {
    const from = shots[shots.length - 1];
    for (let i = 1; i <= nPutts; i++) {
      const k = i / nPutts;
      puttDots.push([from[0] + (hole[0] - from[0]) * k, from[1] + (hole[1] - from[1]) * k + (i < nPutts ? Math.sin(i * 2) * 3 : 0)]);
    }
  }

  // obstacles : bunkers et eau, choisis sans masquer le trajet
  const hazards: Array<{ kind: 'sand' | 'water'; c: P; rx: number; ry: number; rot: number }> = [];
  hazards.push({ kind: 'sand', c: [greenC[0] - 10 - r() * 8, greenC[1] + (r() < 0.5 ? -1 : 1) * (26 + r() * 6)], rx: 13 + r() * 5, ry: 7 + r() * 3, rot: r() * 40 - 20 });
  if (r() < 0.8) hazards.push({ kind: 'sand', c: [greenC[0] + 14, greenC[1] + (r() < 0.5 ? -1 : 1) * (22 + r() * 8)], rx: 8, ry: 6, rot: 20 });
  if (par > 3 && r() < 0.8) {
    const p = along(center, 0.45 + r() * 0.15);
    hazards.push({ kind: 'sand', c: [p[0], p[1] + sgn * (fwWidth / 2 + 14)], rx: 12, ry: 6, rot: -10 });
  }
  if (r() < 0.5) {
    const p = along(center, 0.55 + r() * 0.2);
    hazards.push({ kind: 'water', c: [p[0] + 8, p[1] + (r() < 0.5 ? -1 : 1) * (fwWidth / 2 + 28)], rx: 26 + r() * 10, ry: 12 + r() * 4, rot: r() * 30 - 15 });
  }

  const burst = ace
    ? Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return [hole[0] + Math.cos(a) * 9, hole[1] + Math.sin(a) * 9, hole[0] + Math.cos(a) * (i % 2 ? 15 : 19), hole[1] + Math.sin(a) * (i % 2 ? 15 : 19)] as const;
      })
    : [];

  const line = (pts: P[]) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`;
  const arc = (a: P, b: P, lift: number) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2 - lift;
    return `M${a[0].toFixed(1)},${a[1].toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  };

  return (
    <svg className="hole" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} focusable="false">
      <title>{label}</title>
      <defs>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c7a45" />
          <stop offset="1" stopColor="#1f6137" />
        </linearGradient>
        <radialGradient id={`${uid}g`} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#a8e6a1" />
          <stop offset="1" stopColor="#7acb7e" />
        </radialGradient>
        <pattern id={`${uid}s`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width="6" height="6" fill="#4ca85d" />
          <rect width="3" height="6" fill="#55b366" />
        </pattern>
        <clipPath id={`${uid}c`}>
          <rect width={W} height={H} rx="14" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <rect width={W} height={H} fill={`url(#${uid}r)`} />
        {/* quelques arbres, sans prétention de réalisme */}
        {Array.from({ length: 14 }, (_, i) => {
          const x = r() * W;
          const y = r() < 0.5 ? 4 + r() * 18 : H - 4 - r() * 18;
          return <circle key={i} cx={x} cy={y} r={5 + r() * 5} fill="#1a5230" opacity="0.7" />;
        })}
        {hazards
          .filter((h) => h.kind === 'water')
          .map((h, i) => (
            <ellipse key={`w${i}`} cx={h.c[0]} cy={h.c[1]} rx={h.rx} ry={h.ry} transform={`rotate(${h.rot} ${h.c[0]} ${h.c[1]})`} fill="#4aa3df" stroke="#8cc9ee" strokeWidth="1.5" />
          ))}
        {/* fairway */}
        <path d={smoothPath(center)} fill="none" stroke="#2f7f48" strokeWidth={fwWidth + 6} strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <path d={smoothPath(center)} fill="none" stroke={`url(#${uid}s)`} strokeWidth={fwWidth} strokeLinecap="round" strokeLinejoin="round" />
        {/* tee */}
        <rect x={tee[0] - 11} y={tee[1] - 8} width="22" height="16" rx="4" fill="#bfe8bd" stroke="#e8f6e6" strokeWidth="1" />
        <circle cx={tee[0] - 4} cy={tee[1]} r="1.6" fill="#fff" />
        <circle cx={tee[0] + 4} cy={tee[1]} r="1.6" fill="#fff" />
        {/* green */}
        <ellipse cx={greenC[0]} cy={greenC[1]} rx={par === 3 ? 28 : 24} ry={par === 3 ? 20 : 17} transform={`rotate(${sgn * 12} ${greenC[0]} ${greenC[1]})`} fill="#58b266" opacity="0.8" />
        <ellipse cx={greenC[0]} cy={greenC[1]} rx={par === 3 ? 24 : 20} ry={par === 3 ? 16 : 13} transform={`rotate(${sgn * 12} ${greenC[0]} ${greenC[1]})`} fill={`url(#${uid}g)`} />
        {hazards
          .filter((h) => h.kind === 'sand')
          .map((h, i) => (
            <ellipse key={`s${i}`} cx={h.c[0]} cy={h.c[1]} rx={h.rx} ry={h.ry} transform={`rotate(${h.rot} ${h.c[0]} ${h.c[1]})`} fill="#efe2b4" stroke="#fff6d6" strokeWidth="1" />
          ))}
        {/* trajectoire */}
        <g className="hole-trail" fill="none" strokeLinecap="round">
          {trail.slice(1).map((p, i) => (
            <path key={i} d={arc(trail[i], p, ace ? 22 : 14 + (i === 0 ? 8 : 0))} stroke="#0e3d22" strokeOpacity="0.35" strokeWidth="4.5" strokeDasharray="0.1 6.5" />
          ))}
          {trail.slice(1).map((p, i) => (
            <path key={`t${i}`} d={arc(trail[i], p, ace ? 22 : 14 + (i === 0 ? 8 : 0))} stroke="#fff" strokeWidth="3" strokeDasharray="0.1 6.5" />
          ))}
          {puttDots.length > 0 && <path d={line([shots[shots.length - 1], ...puttDots])} stroke="#fff" strokeWidth="2" strokeDasharray="0.1 4" />}
        </g>
        {/* trou et drapeau */}
        <circle cx={hole[0]} cy={hole[1]} r="3.4" fill="#0b2514" />
        <path d={`M${hole[0]},${hole[1]}V${hole[1] - 22}`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <path d={`M${hole[0]},${hole[1] - 22}l11,4.5l-11,4.5z`} fill="#ff453a" />
        {burst.map((b, i) => (
          <line key={i} className="hole-burst" x1={b[0]} y1={b[1]} x2={b[2]} y2={b[3]} stroke="#ffe27a" strokeWidth="2.2" strokeLinecap="round" />
        ))}
        {/* atterrissages */}
        {!ace &&
          shots.map((p, i) =>
            i === shots.length - 1 && noPutt ? null : (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r="7" fill="#fff" stroke="#0e3d22" strokeOpacity="0.35" strokeWidth="1" />
                <text x={p[0]} y={p[1]} dy="0.35em" textAnchor="middle" fontSize="9" fontWeight="700" fill="#14532d">
                  {i + 1}
                </text>
              </g>
            ),
          )}
        {puttDots.slice(0, -1).map((p, i) => (
          <circle key={`p${i}`} cx={p[0]} cy={p[1]} r="2.6" fill="#fff" stroke="#14532d" strokeWidth="1" />
        ))}
        {ace && <circle cx={tee[0]} cy={tee[1]} r="0" />}
      </g>
    </svg>
  );
}
