// Détail plein écran d'une stat : grand graphe, choix de la période, explication.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlaySession, StatsPeriod, StatsResponse } from '../../../shared/practice';
import { Group, Row, Segmented, Spinner } from '../../components/Controls';
import { BackButton, Screen } from '../../components/Screen';
import { ErrorState } from '../../components/States';
import type { StatMetric } from '../../ui';
import { useUi } from '../../ui';
import { useDataVersion } from '../account';
import { getProfile, getStats, listSessions, type Profile } from '../api';
import { BarChart, DotRange, Legend, LineChart, Ring, StackedBar, type LinePoint } from '../charts';
import { Delta, MIN_ROUNDS, distSegments, fairwaySegments, lastWeeks } from '../Dashboard';
import { PERIODS, duration, fmtDateFull, fmtDateShort, fmtDateShortYear, nf, parseLocal, pctText, readPeriod, rel, writePeriod } from '../statsFormat';
import '../practice.css';

interface Meta {
  title: string;
  color: string;
  explain: string[];
}

const META: Record<StatMetric, Meta> = {
  score: {
    title: 'Score moyen',
    color: 'var(--tint)',
    explain: [
      'Nombre moyen de coups au-dessus du par (+) ou en dessous (−), ramené à 18 trous : une partie de 9 trous est doublée pour rester comparable.',
      'Plus la courbe descend, mieux vous jouez. La ligne épaisse lisse vos 5 dernières parties pour dégager la tendance.',
    ],
  },
  distribution: {
    title: 'Répartition des scores',
    color: 'var(--blue)',
    explain: [
      'Part de vos trous terminés en birdie ou mieux (1 coup sous le par), en par, en bogey (1 coup au-dessus), en double bogey (2 coups) et en triple bogey ou plus.',
      'Éviter les doubles et les triples fait souvent gagner plus de coups que chercher des birdies.',
    ],
  },
  byPar: {
    title: 'Score par type de trou',
    color: 'var(--teal)',
    explain: [
      'Nombre moyen de coups au-dessus du par selon la longueur du trou. Un écart plus fort sur les par 3 pointe vos approches au fer ; sur les par 5, plutôt votre jeu long.',
    ],
  },
  fairways: {
    title: 'Fairways',
    color: 'var(--teal)',
    explain: [
      'Un fairway est touché quand votre balle de départ s’arrête sur la partie tondue du trou. Seuls les par 4 et les par 5 comptent.',
      'La répartition gauche / droite révèle votre tendance de jeu (slice, hook) et ce qu’il faut travailler au practice.',
    ],
  },
  gir: {
    title: 'Greens en régulation',
    color: 'var(--tint)',
    explain: [
      'Un green est « en régulation » (GIR) quand la balle est dessus en par − 2 coups ou moins : en 2 coups sur un par 4, en 1 sur un par 3, en 3 sur un par 5.',
      'C’est l’un des indicateurs les plus liés à l’index : plus vous touchez de greens, moins vous avez à sauver le par.',
    ],
  },
  putts: {
    title: 'Putts',
    color: 'var(--purple)',
    explain: [
      'Nombre moyen de putts, ramené à 18 trous. Un 3-putt, c’est trois putts ou plus sur le même green.',
      'Les putts par green en régulation mesurent votre putting indépendamment de votre jeu long.',
    ],
  },
  upDown: {
    title: 'Up & down',
    color: 'var(--orange)',
    explain: [
      'Un up & down consiste à rentrer la balle en deux coups (approche, puis putt) depuis l’extérieur du green, bunker compris.',
      'C’est le reflet de votre petit jeu : chip, pitch et sorties de bunker.',
    ],
  },
  penalties: {
    title: 'Pénalités',
    color: 'var(--red)',
    explain: [
      'Coups de pénalité (balle perdue ou hors limites, eau, balle injouable) ramenés à 18 trous.',
      'Chaque pénalité coûte au moins un coup : les éviter est souvent le moyen le plus rapide de baisser son score.',
    ],
  },
  index: {
    title: 'Index',
    color: 'var(--indigo)',
    explain: [
      'L’index est votre niveau officiel de joueur : plus il est bas, meilleur est le joueur. Il est calculé par la fédération à partir de vos résultats en compétition.',
      'Ajoutez-le depuis votre carte joueur à chaque mise à jour pour suivre son évolution.',
    ],
  },
  practice: {
    title: 'Practice',
    color: 'var(--blue)',
    explain: ['Temps passé et balles frappées lors de vos séances de practice, semaine par semaine (du lundi au dimanche).'],
  },
  drills: {
    title: 'Exercices',
    color: 'var(--pink)',
    explain: ['Taux de réussite de vos exercices au fil des séances, par exemple 7 putts rentrés sur 10 à 2 mètres.'],
  },
};

const PERIOD_WEEKS: Record<StatsPeriod, number | null> = { '1m': 5, '3m': 13, '6m': 26, '1y': 52, all: null };

function useStatsData(period: StatsPeriod) {
  const version = useDataVersion();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    Promise.all([getStats(period), getProfile().catch(() => null), listSessions('round').catch(() => [] as PlaySession[])])
      .then(([s, p, l]) => {
        if (n !== seq.current) return;
        setStats(s);
        setProfile(p);
        setSessions(l);
        setError(null);
      })
      .catch((e: Error) => n === seq.current && setError(e.message))
      .finally(() => n === seq.current && setBusy(false));
  }, [period, version, tick]);

  return { stats, profile, sessions, error, busy, retry: () => setTick((t) => t + 1) };
}

const ts = (iso: string) => parseLocal(iso).getTime();

export function StatDetail({ metric }: { metric: StatMetric }) {
  const ui = useUi();
  const meta = META[metric];
  const [period, setPeriod] = useState<StatsPeriod>(readPeriod);
  const { stats, profile, sessions, error, busy, retry } = useStatsData(period);
  const back = <BackButton onClick={ui.back} />;
  const onPeriod = (p: StatsPeriod) => {
    setPeriod(p);
    writePeriod(p);
  };

  if (!stats) {
    return (
      <Screen title={meta.title} left={back}>
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <div className="pr-center">
            <Spinner />
          </div>
        )}
      </Screen>
    );
  }

  return (
    <Screen title={meta.title} left={back}>
      <div className="pr-period">
        <Segmented value={period} options={[...PERIODS]} onChange={onPeriod} label="Période" />
      </div>
      <div className={busy ? 'pr-busy' : undefined} aria-busy={busy}>
        <Body metric={metric} stats={stats} profile={profile} sessions={sessions} period={period} />
      </div>
      <div className="sd-explain">
        <h3>À propos</h3>
        {meta.explain.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
    </Screen>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="sd-card">{children}</section>;
}

function Big({ value, unit, color }: { value: ReactNode; unit?: string; color?: string }) {
  return (
    <div className="sd-big">
      <b style={color ? { color } : undefined}>{value}</b>
      {unit && <span>{unit}</span>}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="sd-empty">{children}</p>;
}

function Body({ metric, stats, profile, sessions, period }: { metric: StatMetric; stats: StatsResponse; profile: Profile | null; sessions: PlaySession[]; period: StatsPeriod }) {
  const r = stats.rounds;
  const p = stats.prevRounds;
  const color = META[metric].color;
  const enough = r.count >= MIN_ROUNDS;
  const need = <Notice>Saisissez au moins {MIN_ROUNDS} parties sur la période pour voir cette statistique.</Notice>;
  const none = <Notice>Aucune partie sur cette période.</Notice>;

  // putts par partie (ramenés à 18 trous), pour la courbe
  const puttSeries: LinePoint[] = useMemo(
    () =>
      sessions
        .filter((s) => s.summary && s.summary.putts != null && s.summary.played >= 9 && (!stats.from || s.played_at.slice(0, 10) >= stats.from))
        .sort((a, b) => a.played_at.localeCompare(b.played_at))
        .map((s) => ({ t: ts(s.played_at), y: Math.round(((s.summary!.putts! * 18) / s.summary!.played) * 10) / 10, label: fmtDateFull(s.played_at) })),
    [sessions, stats.from],
  );

  switch (metric) {
    case 'score': {
      if (r.series.length === 0) return <Card>{none}</Card>;
      const data: LinePoint[] = r.series.map((s) => ({ t: ts(s.date), y: s.rel18, label: `${s.strokes} coups · ${s.holes} trous` }));
      return (
        <Card>
          <Big value={r.rel18 == null ? '—' : rel(r.rel18)} unit="sur 18 trous" color={color} />
          <Delta cur={r.rel18} prev={p?.rel18} better="down" />
          <LineChart
            data={data}
            color={color}
            rolling={5}
            zeroLine
            yFormat={(n) => rel(n, 0)}
            ariaLabel={`Score relatif au par sur ${r.series.length} parties, de ${rel(r.series[0].rel18)} à ${rel(r.series[r.series.length - 1].rel18)}`}
            placeholder="Touchez le graphe pour voir une partie"
            describe={(pt, avg) => (
              <>
                <span>{fmtDateShortYear(toIsoLocal(pt.t))}</span>
                <span>
                  <b>{rel(pt.y)}</b> · {pt.label}
                  {avg != null && <> · moy. {rel(avg)}</>}
                </span>
              </>
            )}
          />
          <dl className="sd-stat-row">
            <div>
              <dt>Parties</dt>
              <dd>{r.count}</dd>
            </div>
            <div>
              <dt>Meilleure</dt>
              <dd>{r.best ? `${r.best.strokes} (${rel(r.best.rel, 0)})` : '—'}</dd>
            </div>
            <div>
              <dt>Trous joués</dt>
              <dd>{r.holesPlayed}</dd>
            </div>
          </dl>
        </Card>
      );
    }

    case 'distribution': {
      const segs = distSegments(r.dist);
      const total = segs.reduce((a, s) => a + s.value, 0);
      if (!total) return <Card>{none}</Card>;
      const prevTotal = p ? Object.values(p.dist).reduce((a, b) => a + b, 0) : 0;
      return (
        <>
          <Card>
            <Big value={total} unit="trous joués" />
            <div style={{ marginTop: 14 }}>
              <StackedBar segments={segs} height={22} gap={3} />
            </div>
          </Card>
          <Group>
            {segs.map((s) => {
              const prevPct = p && prevTotal ? Math.round((100 * (s.key === 'birdie' ? p.dist.eagle + p.dist.birdie : p.dist[s.key as 'par' | 'bogey' | 'double' | 'triple'])) / prevTotal) : null;
              const pct = Math.round((100 * s.value) / total);
              return (
                <Row
                  key={s.key}
                  icon={<span className="sd-dot" style={{ background: s.color }} />}
                  label={s.key === 'birdie' ? 'Birdie ou mieux' : s.label.replace('+', ' ou plus')}
                  sub={prevPct != null ? `Période précédente : ${prevPct} %` : undefined}
                  value={
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <b style={{ color: 'var(--label)' }}>{pct}&nbsp;%</b> · {s.value}
                    </span>
                  }
                />
              );
            })}
          </Group>
        </>
      );
    }

    case 'byPar': {
      if (!r.holesPlayed) return <Card>{none}</Card>;
      return (
        <Group>
          {([3, 4, 5] as const).map((par) => {
            const v = r.byPar[par];
            return (
              <div className="row row--block" key={par}>
                <div className="row-between">
                  <span className="row-label">Par {par}</span>
                  <span className="bypar-val" style={{ color: v == null ? 'var(--label3)' : undefined }}>
                    {v == null ? '—' : rel(v, 2)}
                  </span>
                </div>
                {v != null && <DotRange value={v} min={-0.5} max={2.5} color={color} ariaLabel={`Par ${par} : ${rel(v, 2)} coups par trou`} />}
                <Delta cur={v} prev={p?.byPar[par]} better="down" digits={2} />
              </div>
            );
          })}
        </Group>
      );
    }

    case 'fairways': {
      const f = r.fairways;
      if (!enough) return <Card>{r.count === 0 ? none : need}</Card>;
      const segs = fairwaySegments(f);
      const miss = f.left + f.right;
      const tendency = miss >= 6 ? (f.right > f.left * 1.3 ? 'Vos départs partent plus souvent à droite.' : f.left > f.right * 1.3 ? 'Vos départs partent plus souvent à gauche.' : 'Vos écarts sont équilibrés entre gauche et droite.') : null;
      return (
        <Card>
          <Big value={pctText(f.pct)} unit={`${f.hit} sur ${f.n} fairways`} color={color} />
          <Delta cur={f.pct} prev={p?.fairways.pct} better="up" digits={0} unit=" pts" />
          <div style={{ marginTop: 16 }}>
            <StackedBar segments={segs} height={22} gap={3} />
          </div>
          <Legend segments={segs} columns={2} />
          {tendency && <p className="sd-note">{tendency}</p>}
        </Card>
      );
    }

    case 'gir':
      if (!enough) return <Card>{r.count === 0 ? none : need}</Card>;
      return (
        <Card>
          <div className="sd-ring">
            <Ring pct={r.gir.pct} size={148} stroke={16} color={color}>
              <span className="sd-ring-val">{pctText(r.gir.pct)}</span>
            </Ring>
            <div className="sd-ring-side">
              <Big value={r.gir.hit} unit={`greens sur ${r.gir.n} trous`} />
              <Delta cur={r.gir.pct} prev={p?.gir.pct} better="up" digits={0} unit=" pts" />
            </div>
          </div>
          <dl className="sd-stat-row">
            <div>
              <dt>Putts / GIR</dt>
              <dd>{r.putts.perGir == null ? '—' : nf(r.putts.perGir, 2)}</dd>
            </div>
            <div>
              <dt>Avant période</dt>
              <dd>{pctText(p?.gir.pct)}</dd>
            </div>
            <div>
              <dt>Trous</dt>
              <dd>{r.gir.n}</dd>
            </div>
          </dl>
        </Card>
      );

    case 'putts':
      if (!enough) return <Card>{r.count === 0 ? none : need}</Card>;
      return (
        <Card>
          <Big value={r.putts.per18 == null ? '—' : nf(r.putts.per18)} unit="putts sur 18 trous" color={color} />
          <Delta cur={r.putts.per18} prev={p?.putts.per18} better="down" />
          {puttSeries.length > 0 && (
            <LineChart
              data={puttSeries}
              color={color}
              rolling={puttSeries.length >= 5 ? 5 : undefined}
              yFormat={(n) => nf(n, 0)}
              ariaLabel={`Putts par partie (ramenés à 18 trous), ${puttSeries.length} parties`}
              placeholder="Touchez le graphe pour voir une partie"
              describe={(pt) => (
                <>
                  <span>{pt.label}</span>
                  <span>
                    <b>{nf(pt.y)}</b> putts / 18 trous
                  </span>
                </>
              )}
            />
          )}
          <dl className="sd-stat-row">
            <div>
              <dt>3-putts</dt>
              <dd>{pctText(r.putts.threePuttPct)}</dd>
            </div>
            <div>
              <dt>Putts / GIR</dt>
              <dd>{r.putts.perGir == null ? '—' : nf(r.putts.perGir, 2)}</dd>
            </div>
            <div>
              <dt>Trous</dt>
              <dd>{r.putts.n}</dd>
            </div>
          </dl>
        </Card>
      );

    case 'upDown':
      if (!enough) return <Card>{r.count === 0 ? none : need}</Card>;
      return (
        <Card>
          <div className="sd-ring">
            <Ring pct={r.upDown.pct} size={148} stroke={16} color={color}>
              <span className="sd-ring-val">{pctText(r.upDown.pct)}</span>
            </Ring>
            <div className="sd-ring-side">
              <Big value={r.upDown.made} unit={`réussis sur ${r.upDown.n}`} />
              <Delta cur={r.upDown.pct} prev={p?.upDown.pct} better="up" digits={0} unit=" pts" />
            </div>
          </div>
        </Card>
      );

    case 'penalties':
      if (!enough) return <Card>{r.count === 0 ? none : need}</Card>;
      return (
        <Card>
          <Big value={r.penalties.per18 == null ? '—' : nf(r.penalties.per18)} unit="pénalités sur 18 trous" color={color} />
          <Delta cur={r.penalties.per18} prev={p?.penalties.per18} better="down" />
          <dl className="sd-stat-row">
            <div>
              <dt>Période préc.</dt>
              <dd>{p?.penalties.per18 == null ? '—' : nf(p.penalties.per18)}</dd>
            </div>
            <div>
              <dt>Parties</dt>
              <dd>{r.count}</dd>
            </div>
            <div>
              <dt>Trous</dt>
              <dd>{r.holesPlayed}</dd>
            </div>
          </dl>
        </Card>
      );

    case 'index': {
      const all = profile?.index_history ?? [];
      if (!all.length) return <Card><Notice>Pas encore d’index. Ajoutez-le depuis votre carte joueur (Mes parties &gt; carte &gt; Mettre à jour mon index).</Notice></Card>;
      const inRange = stats.from ? all.filter((h) => h.as_of >= stats.from!) : all;
      const shown = inRange.length >= 2 ? inRange : all.slice(-2);
      const last = all[all.length - 1];
      const first = shown[0];
      const data: LinePoint[] = shown.map((h) => ({ t: ts(h.as_of), y: h.hcp_index, label: fmtDateShortYear(h.as_of) }));
      return (
        <Card>
          <Big value={nf(last.hcp_index)} unit={`au ${fmtDateShortYear(last.as_of)}`} color={color} />
          {shown.length > 1 && <Delta cur={last.hcp_index} prev={first.hcp_index} better="down" label={`depuis le ${fmtDateShort(first.as_of)}`} />}
          <LineChart
            data={data}
            color={color}
            yFormat={(n) => nf(n, 1)}
            ariaLabel={`Évolution de l’index : ${shown.map((h) => `${nf(h.hcp_index)} le ${fmtDateShortYear(h.as_of)}`).join(', ')}`}
            placeholder="Touchez le graphe pour voir une valeur"
            describe={(pt) => (
              <>
                <span>{pt.label}</span>
                <span>
                  <b>{nf(pt.y)}</b>
                </span>
              </>
            )}
          />
        </Card>
      );
    }

    case 'practice': {
      return <PracticeBody stats={stats} period={period} color={color} />;
    }

    case 'drills':
      return <DrillsBody stats={stats} color={color} />;
  }
}

const toIsoLocal = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function PracticeBody({ stats, period, color }: { stats: StatsResponse; period: StatsPeriod; color: string }) {
  const [what, setWhat] = useState<'minutes' | 'balls'>('minutes');
  const rg = stats.range;
  let n = PERIOD_WEEKS[period];
  if (n == null) {
    const first = rg.weekly[0]?.week;
    n = first ? Math.min(104, Math.max(12, Math.ceil((Date.now() - parseLocal(first).getTime()) / (7 * 86400000)) + 1)) : 12;
  }
  const weeks = lastWeeks(rg, n);
  const every = Math.max(1, Math.ceil(weeks.length / 5));
  const weekCount = weeks.length;
  if (rg.count === 0) return <Card><Notice>Aucune séance de practice sur cette période.</Notice></Card>;
  const val = (w: (typeof weeks)[number]) => (what === 'minutes' ? w.minutes : w.balls);
  return (
    <Card>
      <Big value={what === 'minutes' ? duration(rg.minutes) : rg.balls.toLocaleString('fr-FR')} unit={what === 'minutes' ? `en ${rg.count} séance${rg.count > 1 ? 's' : ''}` : 'balles frappées'} color={color} />
      <Delta cur={what === 'minutes' ? rg.minutes : rg.balls} prev={stats.prevRange ? (what === 'minutes' ? stats.prevRange.minutes : stats.prevRange.balls) : null} better="up" digits={0} />
      <div style={{ margin: '12px 0 4px' }}>
        <Segmented value={what} onChange={setWhat} label="Mesure" options={[{ value: 'minutes', label: 'Minutes' }, { value: 'balls', label: 'Balles' }]} />
      </div>
      <BarChart
        bars={weeks.map((w, i) => ({ key: w.week, value: val(w), axis: i % every === 0 ? fmtDateShort(w.week) : '' }))}
        height={200}
        color={color}
        minMax={what === 'minutes' ? 60 : 50}
        yFormat={(v) => `${v}`}
        ariaLabel={`${what === 'minutes' ? 'Minutes' : 'Balles'} de practice par semaine sur ${weekCount} semaines`}
        placeholder="Touchez une barre pour voir une semaine"
        describe={(b) => (
          <>
            <span>Semaine du {fmtDateShort(b.key)}</span>
            <span>
              <b>{what === 'minutes' ? duration(b.value) : `${b.value} balles`}</b>
            </span>
          </>
        )}
      />
      <dl className="sd-stat-row">
        <div>
          <dt>Séances</dt>
          <dd>{rg.count}</dd>
        </div>
        <div>
          <dt>Moy. / séance</dt>
          <dd>{what === 'minutes' ? duration(Math.round(rg.minutes / rg.count)) : Math.round(rg.balls / rg.count)}</dd>
        </div>
        <div>
          <dt>Balles</dt>
          <dd>{rg.balls.toLocaleString('fr-FR')}</dd>
        </div>
      </dl>
    </Card>
  );
}

function DrillsBody({ stats, color }: { stats: StatsResponse; color: string }) {
  const drills = stats.range.drills;
  const [sel, setSel] = useState(0);
  if (!drills.length) {
    return (
      <Card>
        <Notice>Aucun exercice sur cette période. Ajoutez des exercices (par exemple « 10 putts à 2 m ») à vos séances de practice.</Notice>
      </Card>
    );
  }
  const d = drills[Math.min(sel, drills.length - 1)];
  const first = d.points[0];
  const last = d.points[d.points.length - 1];
  const data: LinePoint[] = d.points.map((pt) => ({ t: ts(pt.date), y: pt.rate, label: `${pt.attempts} essais` }));
  return (
    <>
      <Card>
        <Big value={`${last.rate} %`} unit={d.label} color={color} />
        {d.points.length > 1 && (
          <span className={`pdelta ${last.rate >= first.rate ? 'pdelta--good' : 'pdelta--bad'}`}>
            {last.rate >= first.rate ? '↑ +' : '↓ −'}
            {Math.abs(last.rate - first.rate)} pts <span className="pdelta-label">depuis le {fmtDateShort(first.date)}</span>
          </span>
        )}
        <div className="sd-chips" role="tablist" aria-label="Exercice">
          {drills.map((x, i) => (
            <button key={x.label} type="button" role="tab" aria-selected={i === sel} className={`sd-chip${i === sel ? ' is-active' : ''}`} onClick={() => setSel(i)}>
              {x.distance_m != null && x.category === 'putting' ? `${x.distance_m} m` : x.label}
            </button>
          ))}
        </div>
        <LineChart
          data={data}
          color={color}
          domain={[0, 100]}
          yFormat={(n) => `${n}%`}
          ariaLabel={`Réussite à l’exercice « ${d.label} » : ${d.points.map((pt) => `${pt.rate} % le ${fmtDateShort(pt.date)}`).join(', ')}`}
          placeholder="Touchez un point pour voir une séance"
          describe={(pt) => (
            <>
              <span>{fmtDateShortYear(toIsoLocal(pt.t))}</span>
              <span>
                <b>{pt.y}&nbsp;%</b> · {pt.label}
              </span>
            </>
          )}
        />
      </Card>
      <Group title="Tous les exercices">
        {drills.map((x) => {
          const l = x.points[x.points.length - 1];
          return <Row key={x.label} label={x.label} sub={`${x.points.length} séance${x.points.length > 1 ? 's' : ''}`} value={`${l.rate} %`} />;
        })}
      </Group>
    </>
  );
}
