// Graphiques SVG maison, sans dépendance. Couleurs en variables CSS (mode sombre automatique).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fmtDayShort, fmtMonthShort } from './statsFormat';
import './charts.css';

/** Largeur observée d'un conteneur (graphes fluides). */
export function useWidth<T extends HTMLElement>(initial = 320): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width) || initial);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || initial));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref as React.RefObject<T>, w];
}

type Pt = [number, number];

/** Courbe lissée (Catmull-Rom → Bézier) qui ne dépasse pas les points. */
function smooth(pts: Pt[]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    // on borne les poignées verticales pour éviter les débordements
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1y = Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) * t));
    const c2y = Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) * t));
    d += `C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${c1y.toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/* ------------------------------------------------------------------ Sparkline */

export function Sparkline({
  values,
  width = 96,
  height = 32,
  color = 'var(--tint)',
  fill = true,
  dot = true,
  strokeWidth = 2,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  dot?: boolean;
  strokeWidth?: number;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  if (values.length === 0) return null;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts: Pt[] = values.map((v, i) => [
    values.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (values.length - 1),
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  return (
    <svg className={`spark ${className ?? ''}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && pts.length > 1 && <path d={`${line}L${last[0]},${height}L${pts[0][0]},${height}Z`} fill={`url(#${gid})`} />}
      <path className="spark-line" d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      {dot && <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.8} fill={color} />}
    </svg>
  );
}

/* ------------------------------------------------------------------ Readout */

function Readout({ children, placeholder }: { children: ReactNode; placeholder: ReactNode }) {
  return (
    <div className="chart-readout" aria-live="off">
      {children ?? placeholder}
    </div>
  );
}

/* ------------------------------------------------------------------ LineChart */

export interface LinePoint {
  t: number; // timestamp ms
  y: number;
  label?: string; // description détaillée (lecture au toucher)
}

export function LineChart({
  data,
  height = 220,
  color = 'var(--tint)',
  rolling,
  rollingLabel,
  yFormat = (n) => String(n),
  domain,
  ariaLabel,
  placeholder,
  describe,
  zeroLine,
  dots = true,
}: {
  data: LinePoint[];
  height?: number;
  color?: string;
  /** Fenêtre de la moyenne glissante (nombre de points). */
  rolling?: number;
  rollingLabel?: string;
  yFormat?: (n: number) => string;
  domain?: [number, number];
  ariaLabel: string;
  placeholder?: ReactNode;
  describe?: (p: LinePoint, avg: number | null) => ReactNode;
  zeroLine?: boolean;
  dots?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const L = 6;
  const R = 38;
  const T = 10;
  const B = 24;
  const innerW = Math.max(40, w - L - R);
  const innerH = height - T - B;

  const ys = data.map((d) => d.y);
  let lo = domain ? domain[0] : Math.min(...ys);
  let hi = domain ? domain[1] : Math.max(...ys);
  if (!domain) {
    const padY = (hi - lo || 2) * 0.15;
    lo -= padY;
    hi += padY;
  }
  const ticks = data.length ? niceTicks(lo, hi, 4) : [];
  if (!domain && ticks.length) {
    lo = Math.min(lo, ticks[0]);
    hi = Math.max(hi, ticks[ticks.length - 1]);
  }
  const t0 = data.length ? data[0].t : 0;
  const t1 = data.length ? data[data.length - 1].t : 1;
  const tSpan = t1 - t0 || 1;
  const xOf = (t: number) => (data.length < 2 ? L + innerW / 2 : L + 6 + ((t - t0) / tSpan) * (innerW - 12));
  const yOf = (v: number) => T + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

  const avgs: Array<number | null> = rolling
    ? data.map((_, i) => {
        if (i < Math.min(rolling, data.length) - 1 && i < 2) return null;
        const from = Math.max(0, i - rolling + 1);
        const slice = data.slice(from, i + 1);
        return slice.reduce((a, b) => a + b.y, 0) / slice.length;
      })
    : [];

  // graduations de l'axe des x : mois si la plage est longue, sinon jours
  const xTicks: Array<{ x: number; label: string }> = [];
  if (data.length) {
    const days = tSpan / 86400000;
    const n = Math.max(2, Math.min(5, Math.floor(innerW / 70)));
    if (data.length === 1) xTicks.push({ x: xOf(t0), label: fmtDayShort(t0) });
    else if (days > 100) {
      const d0 = new Date(t0);
      let cur = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
      const months: number[] = [];
      while (cur.getTime() <= t1) {
        months.push(cur.getTime());
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
      const every = Math.max(1, Math.ceil(months.length / n));
      months.forEach((m, i) => {
        if (i % every !== 0) return;
        const jan = new Date(m).getMonth() === 0;
        xTicks.push({ x: xOf(m), label: jan ? `${fmtMonthShort(m)} ${String(new Date(m).getFullYear()).slice(2)}` : fmtMonthShort(m) });
      });
    } else {
      for (let i = 0; i < n; i++) {
        const t = t0 + (tSpan * i) / (n - 1);
        xTicks.push({ x: xOf(t), label: fmtDayShort(t) });
      }
    }
  }

  const pick = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !data.length) return;
    const x = clientX - r.left;
    let best = 0;
    let bd = Infinity;
    data.forEach((d, i) => {
      const dd = Math.abs(xOf(d.t) - x);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setSel(best);
  };

  const pts: Pt[] = data.map((d) => [xOf(d.t), yOf(d.y)]);
  const avgPts: Pt[] = avgs.flatMap((a, i) => (a == null ? [] : [[xOf(data[i].t), yOf(a)] as Pt]));
  const selPt = sel != null ? data[sel] : null;

  return (
    <div className="chart" ref={ref}>
      <Readout placeholder={placeholder}>{selPt && describe ? describe(selPt, avgs[sel!] ?? null) : null}</Readout>
      <svg
        ref={svgRef}
        className="chart-svg"
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setSel(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <title>{ariaLabel}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={L} x2={L + innerW} y1={yOf(v)} y2={yOf(v)} />
            <text className="chart-axis" x={L + innerW + 6} y={yOf(v)} dy="0.34em">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {zeroLine && lo < 0 && hi > 0 && <line className="chart-zero" x1={L} x2={L + innerW} y1={yOf(0)} y2={yOf(0)} />}
        {xTicks.map((t, i) => (
          <text key={i} className="chart-axis chart-axis--x" x={t.x} y={height - 6} textAnchor={i === 0 && data.length > 1 && t.x < 30 ? 'start' : 'middle'}>
            {t.label}
          </text>
        ))}
        {selPt && <line className="chart-cursor" x1={xOf(selPt.t)} x2={xOf(selPt.t)} y1={T} y2={T + innerH} />}
        {pts.length > 1 && <path className="chart-line" d={smooth(pts)} fill="none" stroke={color} strokeWidth={rolling ? 1.5 : 2.5} strokeOpacity={rolling ? 0.45 : 1} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />}
        {rolling && avgPts.length > 1 && <path className="chart-line" d={smooth(avgPts)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />}
        {dots &&
          pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={sel === i ? 6 : rolling ? 3.5 : 4} className="chart-dot" fill={rolling ? color : 'var(--bg2)'} fillOpacity={rolling ? 0.7 : 1} stroke={color} strokeWidth={rolling ? 0 : 2.25} />
          ))}
        {selPt && <circle cx={xOf(selPt.t)} cy={yOf(selPt.y)} r={6.5} fill={color} stroke="var(--bg2)" strokeWidth={2} />}
      </svg>
      {rolling && (
        <div className="chart-legend">
          <span className="legend-item">
            <i className="legend-dot" style={{ background: color, opacity: 0.7 }} />
            Chaque partie
          </span>
          <span className="legend-item">
            <i className="legend-line" style={{ background: color }} />
            {rollingLabel ?? `Moyenne sur ${rolling} parties`}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ BarChart */

export interface BarDatum {
  key: string;
  value: number;
  axis?: string; // étiquette sous la barre
}

export function BarChart({
  bars,
  height = 160,
  color = 'var(--blue)',
  yFormat = (n) => String(n),
  ariaLabel,
  describe,
  placeholder,
  labelEvery = 1,
}: {
  bars: BarDatum[];
  height?: number;
  color?: string;
  yFormat?: (n: number) => string;
  ariaLabel: string;
  describe?: (b: BarDatum) => ReactNode;
  placeholder?: ReactNode;
  labelEvery?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const L = 4;
  const R = 36;
  const T = 8;
  const B = 22;
  const innerW = Math.max(40, w - L - R);
  const innerH = height - T - B;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max, 3);
  const top = Math.max(max, ticks[ticks.length - 1] ?? max);
  const slot = innerW / Math.max(1, bars.length);
  const bw = Math.max(3, Math.min(22, slot * 0.62));
  const yOf = (v: number) => T + innerH - (v / top) * innerH;

  return (
    <div className="chart" ref={ref}>
      <Readout placeholder={placeholder}>{sel != null && describe ? describe(bars[sel]) : null}</Readout>
      <svg className="chart-svg" width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={L} x2={L + innerW} y1={yOf(v)} y2={yOf(v)} />
            <text className="chart-axis" x={L + innerW + 6} y={yOf(v)} dy="0.34em">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = L + slot * i + (slot - bw) / 2;
          const h = b.value > 0 ? Math.max(3, innerH - (yOf(b.value) - T)) : 0;
          return (
            <g key={b.key} onPointerDown={() => setSel(i === sel ? null : i)} className="chart-bar-g">
              <rect x={L + slot * i} y={T} width={slot} height={innerH} fill="transparent" />
              {b.value > 0 ? (
                <rect className="chart-bar" x={x} y={T + innerH - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={color} opacity={sel == null || sel === i ? 1 : 0.4} style={{ animationDelay: `${i * 18}ms` }} />
              ) : (
                <rect x={x} y={T + innerH - 2} width={bw} height={2} rx={1} fill="var(--fill-strong)" />
              )}
              {b.axis && i % labelEvery === 0 && (
                <text className="chart-axis chart-axis--x" x={L + slot * i + slot / 2} y={height - 6} textAnchor="middle">
                  {b.axis}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ StackedBar */

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function StackedBar({ segments, height = 14, gap = 2, ariaLabel }: { segments: Segment[]; height?: number; gap?: number; ariaLabel?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const label = ariaLabel ?? segments.map((s) => `${s.label} ${total ? Math.round((100 * s.value) / total) : 0} %`).join(', ');
  return (
    <div className="stacked" role="img" aria-label={label} style={{ height, gap, borderRadius: height / 2 }}>
      {total === 0 ? (
        <span className="stacked-empty" />
      ) : (
        segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span key={s.key} className="stacked-seg" style={{ flexGrow: s.value, background: s.color }} />
          ))
      )}
    </div>
  );
}

export function Legend({ segments, showPct = true, columns }: { segments: Segment[]; showPct?: boolean; columns?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <ul className="legend" style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {segments.map((s) => (
        <li key={s.key} className="legend-item">
          <i className="legend-dot" style={{ background: s.color }} />
          <span className="legend-name">{s.label}</span>
          {showPct && <span className="legend-val">{total ? Math.round((100 * s.value) / total) : 0}&nbsp;%</span>}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Ring */

export function Ring({
  pct,
  size = 64,
  stroke = 8,
  color = 'var(--tint)',
  children,
  ariaLabel,
}: {
  pct: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={ariaLabel ?? (pct == null ? 'Pas de donnée' : `${Math.round(pct)} %`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity="0.18" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ ['--ring-len' as string]: c }}
        />
      </svg>
      {children && <div className="ring-center">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ DotRange (valeur sur une échelle) */

export function DotRange({ value, min, max, color = 'var(--tint)', ariaLabel }: { value: number; min: number; max: number; color?: string; ariaLabel: string }) {
  const p = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <div className="dotrange" role="img" aria-label={ariaLabel}>
      <span className="dotrange-track" />
      <span className="dotrange-dot" style={{ left: `${p}%`, background: color }} />
    </div>
  );
}
