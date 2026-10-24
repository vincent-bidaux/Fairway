// Cartes de statistiques façon Apple Santé. Utilisé avec de vraies données ou avec l'aperçu fictif grisé.
import type { ReactNode } from 'react';
import type { RangeStats, RoundStats, StatsResponse } from '../../shared/practice';
import { Icon } from '../components/Icon';
import type { StatMetric } from '../ui';
import { ContextBars, contextInsight, hasContext } from './ContextCard';
import type { Profile } from './api';
import { BarChart, DotRange, Legend, Ring, Sparkline, StackedBar, type Segment } from './charts';
import { birdieCaption, duration, fmtDateShort, nf, pctText, plural, practiceBuckets, rel } from './statsFormat';
import './practice.css';

export const MIN_ROUNDS = 3;
const MINUS = '−';
export type DashMetric = StatMetric | 'context';

/** Écart avec la période précédente. better = sens qui est une amélioration. */
export function Delta({ cur, prev, better, digits = 1, unit = '', label = 'vs période précédente' }: { cur: number | null; prev: number | null | undefined; better: 'up' | 'down'; digits?: number; unit?: string; label?: string }) {
  if (cur == null || prev == null) return <span className="pdelta pdelta--none">{label === '' ? '' : 'Pas de période précédente'}</span>;
  const d = Math.round((cur - prev) * 10 ** digits) / 10 ** digits;
  if (d === 0) return <span className="pdelta pdelta--flat">Stable {label}</span>;
  const good = (d > 0) === (better === 'up');
  return (
    <span className={`pdelta ${good ? 'pdelta--good' : 'pdelta--bad'}`}>
      <span aria-hidden="true">{d > 0 ? '↑' : '↓'}</span> {d > 0 ? '+' : MINUS}
      {nf(Math.abs(d), digits)}
      {unit} <span className="pdelta-label">{label}</span>
    </span>
  );
}

function Tile({
  title,
  color,
  metric,
  wide,
  onOpen,
  children,
  hint,
}: {
  title: string;
  color: string;
  metric: DashMetric;
  wide?: boolean;
  onOpen: (m: DashMetric) => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button type="button" className={`tile${wide ? ' tile--wide' : ''}`} onClick={() => onOpen(metric)} aria-label={`${title}, voir le détail`}>
      <span className="tile-head">
        <span className="tile-title" style={{ color }}>
          {title}
        </span>
        <Icon name="chevron" size={12} strokeWidth={3} className="tile-chev" />
      </span>
      {children}
      {hint && <span className="tile-hint">{hint}</span>}
    </button>
  );
}

const Value = ({ children, unit, dim }: { children: ReactNode; unit?: string; dim?: boolean }) => (
  <span className={`tile-value${dim ? ' is-dim' : ''}`}>
    {children}
    {unit && <small>{unit}</small>}
  </span>
);

export const distSegments = (d: RoundStats['dist']): Segment[] => [
  { key: 'birdie', label: 'Birdie+', value: d.eagle + d.birdie, color: 'var(--blue)' },
  { key: 'par', label: 'Par', value: d.par, color: 'var(--tint)' },
  { key: 'bogey', label: 'Bogey', value: d.bogey, color: 'var(--orange)' },
  { key: 'double', label: 'Double', value: d.double, color: 'var(--red)' },
  { key: 'triple', label: 'Triple+', value: d.triple, color: 'var(--purple)' },
];

export const fairwaySegments = (f: RoundStats['fairways']): Segment[] => [
  { key: 'left', label: 'À gauche', value: f.left, color: 'var(--orange)' },
  { key: 'hit', label: 'Touchés', value: f.hit, color: 'var(--tint)' },
  { key: 'right', label: 'À droite', value: f.right, color: 'var(--indigo)' },
  { key: 'short', label: 'Courts', value: f.short, color: 'var(--gray)' },
];

/** Semaines continues (lundi) sur les `n` dernières, complétées par des zéros. */
export function lastWeeks(range: RangeStats, n = 12): Array<{ week: string; minutes: number; balls: number }> {
  const map = new Map(range.weekly.map((w) => [w.week, w]));
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const out: Array<{ week: string; minutes: number; balls: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i * 7);
    const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    out.push(map.get(key) ?? { week: key, minutes: 0, balls: 0 });
  }
  return out;
}

export function Dashboard({ stats, profile, onOpen, totalRanges = 0 }: { stats: StatsResponse; profile: Profile | null; onOpen: (m: DashMetric) => void; totalRanges?: number }) {
  const r = stats.rounds;
  const p = stats.prevRounds;
  const enough = r.count >= MIN_ROUNDS;
  const hint = enough ? undefined : `Saisissez au moins ${MIN_ROUNDS} parties`;
  const history = profile?.index_history ?? [];
  const lastIdx = history[history.length - 1];
  const prevIdx = history.length > 1 ? history[history.length - 2] : null;
  const { buckets, unit } = practiceBuckets(stats.range.weekly, stats.period, stats.from, stats.to);
  const drills = stats.range.drills
    .filter((d) => d.category === 'putting' && d.points.length > 0)
    .sort((a, b) => (a.distance_m ?? 99) - (b.distance_m ?? 99))
    .slice(0, 4);
  const fwN = r.fairways.hit + r.fairways.left + r.fairways.right + r.fairways.short;
  const fwPct = (v: number) => (fwN ? Math.round((100 * v) / fwN) : 0);

  return (
    <div className="tiles">
      <Tile title="Score moyen" color="var(--tint)" metric="score" wide onOpen={onOpen}>
        <span className="tile-row">
          <span className="tile-col">
            <Value unit="sur 18 trous" dim={r.rel18 == null}>
              {r.rel18 == null ? '—' : rel(r.rel18)}
            </Value>
            <span className="tile-sub">
              {r.count === 0 ? 'Aucune partie sur la période' : `${r.count} ${r.count > 1 ? 'parties' : 'partie'}`}{r.best ? ` · meilleure ${r.best.strokes} (${rel(r.best.rel, 0)})` : ''}
            </span>
          </span>
          {r.series.length > 1 && <Sparkline values={r.series.map((s) => s.rel18)} width={112} height={54} color="var(--tint)" />}
        </span>
        <Delta cur={r.rel18} prev={p?.rel18} better="down" />
      </Tile>

      <Tile title="Répartition des scores" color="var(--blue)" metric="distribution" wide onOpen={onOpen}>
        {(() => {
          const segs = distSegments(r.dist);
          const total = segs.reduce((a, s) => a + s.value, 0);
          return (
            <>
              <span className="tile-sub">{total ? `${total} trous joués` : 'Aucun trou saisi'}</span>
              <StackedBar segments={segs} height={16} />
              <Legend segments={segs} columns={3} />
              {birdieCaption(r.dist) && <span className="tile-sub tile-sub--extra">Birdie+ {birdieCaption(r.dist)}</span>}
            </>
          );
        })()}
      </Tile>

      <Tile title="Score par type de trou" color="var(--teal)" metric="byPar" wide onOpen={onOpen}>
        <span className="tile-sub">Coups au-dessus du par, en moyenne</span>
        <span className="bypar">
          {([3, 4, 5] as const).map((par) => {
            const v = r.byPar[par];
            return (
              <span key={par} className="bypar-col">
                <span className="bypar-par">Par {par}</span>
                <span className={`bypar-val${v == null ? ' is-dim' : ''}`}>{v == null ? '—' : rel(v, 2)}</span>
                {v != null ? <DotRange value={v} min={-0.5} max={2.5} color="var(--teal)" ariaLabel={`Par ${par} : ${rel(v, 2)}`} /> : <span style={{ height: 14 }} />}
              </span>
            );
          })}
        </span>
      </Tile>

      <Tile title="Fairways" color="var(--teal)" metric="fairways" onOpen={onOpen} hint={hint}>
        <Value dim={!enough || r.fairways.pct == null}>{enough ? pctText(r.fairways.pct) : '—'}</Value>
        {enough && fwN > 0 ? (
          <>
            <StackedBar segments={fairwaySegments(r.fairways).slice(0, 3)} height={8} gap={2} ariaLabel={`À gauche ${fwPct(r.fairways.left)} %, touchés ${fwPct(r.fairways.hit)} %, à droite ${fwPct(r.fairways.right)} %`} />
            <span className="mini-split" aria-hidden="true">
              <span>
                {'←'} {fwPct(r.fairways.left)}
              </span>
              <span className="is-hit">{fwPct(r.fairways.hit)}</span>
              <span>
                {fwPct(r.fairways.right)} {'→'}
              </span>
            </span>
            <Delta cur={r.fairways.pct} prev={p?.fairways.pct} better="up" digits={0} unit=" pts" label="" />
          </>
        ) : null}
      </Tile>

      <Tile title="Greens (GIR)" color="var(--tint)" metric="gir" onOpen={onOpen} hint={hint}>
        <span className="tile-row tile-row--center">
          <span className="tile-col">
            <Value dim={!enough || r.gir.pct == null}>{enough ? pctText(r.gir.pct) : '—'}</Value>
            {enough && <span className="tile-sub">{r.gir.hit} sur {r.gir.n}</span>}
          </span>
          {enough && r.gir.pct != null && <Ring pct={r.gir.pct} size={46} stroke={7} color="var(--tint)" />}
        </span>
        {enough && <Delta cur={r.gir.pct} prev={p?.gir.pct} better="up" digits={0} unit=" pts" label="" />}
      </Tile>

      <Tile title="Putts" color="var(--purple)" metric="putts" onOpen={onOpen} hint={hint}>
        <Value unit="/ 18 trous" dim={!enough || r.putts.per18 == null}>
          {enough && r.putts.per18 != null ? nf(r.putts.per18) : '—'}
        </Value>
        {enough && (
          <>
            <span className="tile-sub">3-putts : {pctText(r.putts.threePuttPct)}</span>
            <Delta cur={r.putts.per18} prev={p?.putts.per18} better="down" label="" />
          </>
        )}
      </Tile>

      <Tile title="Up & down" color="var(--orange)" metric="upDown" onOpen={onOpen} hint={hint}>
        <span className="tile-row tile-row--center">
          <span className="tile-col">
            <Value dim={!enough || r.upDown.pct == null}>{enough ? pctText(r.upDown.pct) : '—'}</Value>
            {enough && <span className="tile-sub">{r.upDown.made} sur {r.upDown.n}</span>}
          </span>
          {enough && r.upDown.pct != null && <Ring pct={r.upDown.pct} size={46} stroke={7} color="var(--orange)" />}
        </span>
        {enough && <Delta cur={r.upDown.pct} prev={p?.upDown.pct} better="up" digits={0} unit=" pts" label="" />}
      </Tile>

      <Tile title="Pénalités" color="var(--red)" metric="penalties" onOpen={onOpen} hint={hint}>
        <Value unit="/ 18 trous" dim={!enough || r.penalties.per18 == null}>
          {enough && r.penalties.per18 != null ? nf(r.penalties.per18) : '—'}
        </Value>
        {enough && (
          <>
            <span className="tile-sub">Coups de pénalité</span>
            <Delta cur={r.penalties.per18} prev={p?.penalties.per18} better="down" label="" />
          </>
        )}
      </Tile>

      <Tile title="Index" color="var(--indigo)" metric="index" onOpen={onOpen}>
        <Value dim={!lastIdx}>{lastIdx ? nf(lastIdx.hcp_index) : '—'}</Value>
        {history.length > 1 ? (
          <>
            <Sparkline values={history.map((h) => h.hcp_index)} width={130} height={30} color="var(--indigo)" />
            {prevIdx && <Delta cur={lastIdx.hcp_index} prev={prevIdx.hcp_index} better="down" label="" />}
          </>
        ) : (
          <span className="tile-sub">{lastIdx ? fmtDateShort(lastIdx.as_of) : 'Ajoutez votre index'}</span>
        )}
      </Tile>

      <Tile title="Practice" color="var(--blue)" metric="practice" wide onOpen={onOpen}>
        {stats.range.count === 0 ? (
          <span className="tile-col">
            <Value dim>{'\u2014'}</Value>
            <span className="tile-sub">
              Aucune séance de practice sur la période{totalRanges > 0 ? ` · ${plural(totalRanges, 'séance')} au total` : ''}
            </span>
          </span>
        ) : (
          <>
            <span className="tile-row">
              <span className="tile-col">
                <Value>{duration(stats.range.minutes)}</Value>
                <span className="tile-sub">
                  {plural(stats.range.count, 'séance')} · {plural(stats.range.balls, 'balle')}
                </span>
              </span>
            </span>
            <BarChart
              bars={buckets.map((w) => ({ key: w.key, value: w.minutes, axis: w.label }))}
              height={112}
              minMax={60}
              color="var(--blue)"
              yFormat={(n) => `${n}`}
              ariaLabel={`Minutes de practice par ${unit === 'week' ? 'semaine' : 'mois'} : ${stats.range.minutes} minutes au total`}
            />
          </>
        )}
      </Tile>

      {hasContext(r.context) && (
        <Tile title="Humeur, forme et météo" color="var(--pink)" metric="context" wide onOpen={onOpen}>
          <span className="tile-sub">Score moyen selon vos conditions de jeu</span>
          <ContextBars ctx={r.context} size={26} />
          {contextInsight(r.context) && <span className="ctx-insight">{contextInsight(r.context)}</span>}
        </Tile>
      )}

      <Tile title="Exercices de putting" color="var(--pink)" metric="drills" wide onOpen={onOpen}>
        {drills.length === 0 ? (
          <span className="tile-sub">Ajoutez des exercices (ex. 10 putts à 2 m) dans vos séances de practice pour suivre votre réussite.</span>
        ) : (
          <span className="drillrows">
            {drills.map((d) => {
              const first = d.points[0].rate;
              const last = d.points[d.points.length - 1].rate;
              const diff = last - first;
              return (
                <span key={d.label} className="drillrow">
                  <span className="drillrow-name">{d.distance_m != null ? `${d.distance_m} m` : d.label}</span>
                  <span className="drillrow-track">
                    <span className="drillrow-fill" style={{ width: `${last}%` }} />
                  </span>
                  <span className="drillrow-val">{last}&nbsp;%</span>
                  <span className={`drillrow-diff${d.points.length < 2 || diff === 0 ? '' : diff > 0 ? ' is-good' : ' is-bad'}`}>
                    {d.points.length < 2 || diff === 0 ? '' : `${diff > 0 ? '+' : MINUS}${Math.abs(diff)}`}
                  </span>
                </span>
              );
            })}
          </span>
        )}
      </Tile>
    </div>
  );
}
