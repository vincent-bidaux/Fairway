// Fiche d'une séance : partie (carte de score, stats, comparaison à la moyenne) ou practice (exercices).
import { useEffect, useMemo, useState } from 'react';
import type { HoleEntry, PlaySession, RoundStats } from '../../../shared/practice';
import { girOf } from '../../../shared/practice';
import { Group, Row, Spinner } from '../../components/Controls';
import { CourseWidget, type PlayedRound } from '../../components/CourseWidget';
import { Icon } from '../../components/Icon';
import { BackButton, Screen } from '../../components/Screen';
import { ErrorState } from '../../components/States';
import { useUi } from '../../ui';
import { useDataVersion, touchData } from '../account';
import { deleteSession, getSession, getStats } from '../api';
import { ConfirmSheet } from '../ConfirmSheet';
import { useGolfPlan } from '../holePlan';
import { fmtDuration, focusLabel } from '../PracticeForm';
import { fmtRel, Scorecard, summarize } from '../scorecard';
import { loopOfCourse } from '../shotGeo';
import { sessionTitle, teeLabel } from '../SessionInfo';
import { ContextBadge } from '../contextIcons';
import '../session.css';

const nf = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

interface RoundNumbers {
  fw: { n: number; hit: number } | null;
  gir: { n: number; hit: number } | null;
  putts: { sum: number; holes: number; per18: number; three: number } | null;
  pen: { sum: number; per18: number } | null;
  ud: { n: number; made: number } | null;
}

function numbers(entries: HoleEntry[]): RoundNumbers {
  const played = entries.filter((e) => e.strokes != null);
  const fwHoles = played.filter((e) => e.par >= 4 && e.fairway != null);
  const girHoles = played.map((e) => girOf(e)).filter((g) => g != null) as number[];
  const puttHoles = played.filter((e) => e.putts != null);
  const udHoles = played.filter((e) => girOf(e) === 0 && e.up_down != null);
  const pSum = played.reduce((a, e) => a + (e.penalties ?? 0), 0);
  return {
    fw: fwHoles.length ? { n: fwHoles.length, hit: fwHoles.filter((e) => e.fairway === 'hit').length } : null,
    gir: girHoles.length ? { n: girHoles.length, hit: girHoles.filter((g) => g === 1).length } : null,
    putts: puttHoles.length
      ? {
          sum: puttHoles.reduce((a, e) => a + e.putts!, 0),
          holes: puttHoles.length,
          per18: (puttHoles.reduce((a, e) => a + e.putts!, 0) * 18) / puttHoles.length,
          three: puttHoles.filter((e) => e.putts! >= 3).length,
        }
      : null,
    pen: played.length ? { sum: pSum, per18: (pSum * 18) / played.length } : null,
    ud: udHoles.length ? { n: udHoles.length, made: udHoles.filter((e) => e.up_down === 1).length } : null,
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1).replace(' à ', ' · ').replace(',', '');
}

function Delta({ diff, unit, lowerIsBetter }: { diff: number; unit: string; lowerIsBetter?: boolean }) {
  if (Math.abs(diff) < 0.05) return <span className="delta delta--flat">= moyenne</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={`delta ${good ? 'delta--good' : 'delta--bad'}`}>
      {diff > 0 ? '▲' : '▼'} {nf(Math.abs(diff), unit === '%' ? 0 : 1)}
      {unit === '%' ? ' pts' : ''}
    </span>
  );
}

function StatLine({
  label,
  value,
  sub,
  avg,
}: {
  label: string;
  value: string;
  sub?: string;
  avg?: { text: string; diff: number; unit: string; lowerIsBetter?: boolean } | null;
}) {
  return (
    <div className="row stat-line">
      <span className="row-main">
        <span className="row-label">{label}</span>
        {(sub || avg) && (
          <span className="row-sub">
            {sub}
            {sub && avg ? ' · ' : ''}
            {avg ? `Moyenne ${avg.text}` : ''}
          </span>
        )}
      </span>
      {avg && <Delta diff={avg.diff} unit={avg.unit} lowerIsBetter={avg.lowerIsBetter} />}
      <span className="stat-val">{value}</span>
    </div>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const ui = useUi();
  const version = useDataVersion();
  const [s, setS] = useState<PlaySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avg, setAvg] = useState<RoundStats | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getSession(id)
      .then((r) => {
        if (alive) {
          setS(r);
          setError(null);
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id, version]);

  useEffect(() => {
    let alive = true;
    getStats('all')
      .then((r) => alive && setAvg(r.rounds))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [version]);

  const entries = useMemo(() => s?.hole_entries ?? [], [s]);
  const tot = useMemo(() => summarize(entries), [entries]);
  const nums = useMemo(() => numbers(entries), [entries]);
  const back = <BackButton onClick={ui.back} label="Retour" />;

  // plan du golf (parties seulement) et ce qui a été joué dessus
  const plan = useGolfPlan(s?.golf_id ?? null, s?.kind === 'round');
  const played = useMemo<PlayedRound | null>(() => {
    if (!s || s.kind !== 'round' || !plan) return null;
    const holes = entries
      .filter((e) => e.strokes != null || (e.shots?.length ?? 0) > 0)
      .map((e) => ({ ref: e.hole, shots: e.shots ?? [], holed: e.strokes != null }));
    return holes.length ? { loop: loopOfCourse(s.course), holes } : null;
  }, [s, plan, entries]);

  if (!s) {
    return (
      <Screen title="Séance" large={false} left={back}>
        {error ? (
          <ErrorState message={error} onRetry={() => setError(null)} />
        ) : (
          <div className="detail-loading">
            <Spinner />
          </div>
        )}
      </Screen>
    );
  }

  const isRound = s.kind === 'round';
  const place = s.golf_name ?? s.place ?? 'Autre lieu';
  const title = sessionTitle(s);
  const golfLine = s.event_title && (s.golf_name ?? s.place) ? [s.golf_name ?? s.place, s.golf_city].filter(Boolean).join(' · ') : null;

  const share = async () => {
    const lines: string[] = [];
    if (isRound) {
      lines.push(`${s.event_title ? `${s.event_title} (${place})` : `Partie à ${place}`} · ${fmtDate(s.played_at).split(' · ')[0]}`);
      lines.push(`${tot.strokes} (${fmtRel(tot.rel)}) · ${s.holes ?? entries.length} trous${tot.putts != null ? ` · ${tot.putts} putts` : ''}`);
      if (nums.fw) lines.push(`Fairways ${nums.fw.hit}/${nums.fw.n}`);
      if (nums.gir) lines.push(`Greens en régulation ${nums.gir.hit}/${nums.gir.n}`);
    } else {
      lines.push(`Practice à ${place} · ${fmtDate(s.played_at).split(' · ')[0]}`);
      lines.push([s.duration_min ? fmtDuration(s.duration_min) : null, s.balls ? `${s.balls} balles` : null].filter(Boolean).join(' · '));
      for (const d of s.drills ?? []) lines.push(`${d.label} : ${d.successes ?? 0}/${d.attempts ?? 0}`);
    }
    lines.push('Noté avec Fairway');
    const text = lines.filter(Boolean).join('\n');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('Résumé copié');
    } catch {
      ui.toast('Partage indisponible sur cet appareil');
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteSession(s.id);
      touchData();
      ui.back();
      ui.toast('Séance supprimée');
    } catch (e) {
      ui.toast((e as Error).message);
      setBusy(false);
    }
  };

  const right = (
    <>
      <button type="button" className="nav-btn nav-btn--icon" aria-label="Partager le résumé" onClick={share}>
        <Icon name="share" size={22} />
      </button>
      <button type="button" className="nav-btn nav-btn--icon" aria-label="Modifier la séance" onClick={() => ui.push({ type: 'session-editor', session: s })}>
        <Icon name="edit" size={22} />
      </button>
    </>
  );

  const rel = tot.rel;
  const a = avg && avg.count >= 2 ? avg : null;
  const puttsComplete = !!nums.putts && nums.putts.holes >= tot.played * 0.75;

  return (
    <Screen title={title} left={back} right={right}>
      {golfLine && <p className="detail-sub2">{golfLine}</p>}
      <p className="detail-when">
        {isRound ? '' : 'Practice · '}
        {fmtDate(s.played_at)}
        {isRound && teeLabel(s.tee) ? ` · Repère ${teeLabel(s.tee)!.toLowerCase()}` : ''}
      </p>

      {isRound ? (
        <>
          <div className="hero">
            <div className="hero-score">
              <span className="hero-num" aria-label={`Score ${tot.strokes}`}>
                {tot.played ? tot.strokes : '–'}
              </span>
              {tot.played > 0 && (
                <span className={`hero-rel${rel < 0 ? ' is-under' : rel === 0 ? ' is-even' : ''}`}>{fmtRel(rel)}</span>
              )}
            </div>
            <div className="hero-sub">
              {tot.played < (s.holes ?? 18) ? `${tot.played} trou${tot.played > 1 ? 's' : ''} saisi${tot.played > 1 ? 's' : ''} sur ${s.holes}` : `${s.holes} trous`}
              {tot.putts != null ? ` · ${tot.putts} putts` : ''}
            </div>
          </div>


      {(s.weather || s.body || s.mood) && (
        <div className="ctx-strip">
          {s.weather && <ContextBadge kind="weather" level={s.weather} size={40} label />}
          {s.body && <ContextBadge kind="body" level={s.body} size={40} label />}
          {s.mood && <ContextBadge kind="mood" level={s.mood} size={40} label />}
        </div>
      )}

          {plan && played && <CourseWidget plan={plan} lat={plan.origin?.lat} lng={plan.origin?.lon} played={played} />}

          <Group title="Carte de score">
            <div className="row row--block sc-wrap">
              <Scorecard entries={entries} />
            </div>
          </Group>

          {tot.played > 0 && (
            <Group
              title="Statistiques de la partie"
              footer={a ? `Comparé à votre moyenne sur ${a.count} parties (ramenée à 18 trous).` : 'Les comparaisons apparaissent à partir de 2 parties.'}
            >
              {nums.fw && (
                <StatLine
                  label="Fairways"
                  value={`${Math.round((100 * nums.fw.hit) / nums.fw.n)} %`}
                  sub={`${nums.fw.hit} sur ${nums.fw.n}`}
                  avg={a && a.fairways.pct != null ? { text: `${a.fairways.pct} %`, diff: (100 * nums.fw.hit) / nums.fw.n - a.fairways.pct, unit: '%' } : null}
                />
              )}
              {nums.gir && (
                <StatLine
                  label="Greens en régulation"
                  value={`${Math.round((100 * nums.gir.hit) / nums.gir.n)} %`}
                  sub={`${nums.gir.hit} sur ${nums.gir.n}`}
                  avg={a && a.gir.pct != null ? { text: `${a.gir.pct} %`, diff: (100 * nums.gir.hit) / nums.gir.n - a.gir.pct, unit: '%' } : null}
                />
              )}
              {nums.putts && (
                <>
                  <StatLine
                    label="Putts"
                    value={`${nums.putts.sum}`}
                    sub={puttsComplete ? `${nf(nums.putts.per18)} par 18 trous` : `saisis sur ${nums.putts.holes} trou${nums.putts.holes > 1 ? 's' : ''}`}
                    avg={puttsComplete && a && a.putts.per18 != null ? { text: nf(a.putts.per18), diff: nums.putts.per18 - a.putts.per18, unit: '', lowerIsBetter: true } : null}
                  />
                  <StatLine label="3 putts ou plus" value={`${nums.putts.three}`} sub={`sur ${nums.putts.holes} trou${nums.putts.holes > 1 ? 's' : ''} saisi${nums.putts.holes > 1 ? 's' : ''}`} />
                </>
              )}
              {nums.pen && (
                <StatLine
                  label="Pénalités"
                  value={`${nums.pen.sum}`}
                  avg={a && a.penalties.per18 != null ? { text: nf(a.penalties.per18), diff: nums.pen.per18 - a.penalties.per18, unit: '', lowerIsBetter: true } : null}
                />
              )}
              {nums.ud && (
                <StatLine
                  label="Up & down"
                  value={`${Math.round((100 * nums.ud.made) / nums.ud.n)} %`}
                  sub={`${nums.ud.made} sur ${nums.ud.n}`}
                  avg={a && a.upDown.pct != null ? { text: `${a.upDown.pct} %`, diff: (100 * nums.ud.made) / nums.ud.n - a.upDown.pct, unit: '%' } : null}
                />
              )}
              {!nums.fw && !nums.gir && !nums.putts && !nums.ud && (
                <div className="row row--muted">Ajoutez putts, fairways ou greens pour voir les statistiques.</div>
              )}
            </Group>
          )}
        </>
      ) : (
        <>
          <div className="hero hero--range">
            <div className="hero-grid">
              <div>
                <span className="hero-num hero-num--sm">{s.duration_min ? fmtDuration(s.duration_min) : '–'}</span>
                <span className="hero-lab">Durée</span>
              </div>
              <div>
                <span className="hero-num hero-num--sm">{s.balls ?? '–'}</span>
                <span className="hero-lab">Balles</span>
              </div>
              <div>
                <span className="hero-num hero-num--sm">{s.drills?.length ?? 0}</span>
                <span className="hero-lab">Exercices</span>
              </div>
            </div>
          </div>

      {(s.weather || s.body || s.mood) && (
        <div className="ctx-strip">
          {s.weather && <ContextBadge kind="weather" level={s.weather} size={40} label />}
          {s.body && <ContextBadge kind="body" level={s.body} size={40} label />}
          {s.mood && <ContextBadge kind="mood" level={s.mood} size={40} label />}
        </div>
      )}
          {!!s.focus && (
            <Group title="Travail">
              <div className="row row--block">
                <div className="pf-chips pf-chips--wrap">
                  {s.focus.split(',').filter(Boolean).map((k) => (
                    <span key={k} className="cr-chip cr-chip--auto is-active cr-chip--static">
                      {focusLabel(k)}
                    </span>
                  ))}
                </div>
              </div>
            </Group>
          )}
          {(s.drills ?? []).length > 0 && (
            <Group title="Exercices">
              {(s.drills ?? []).map((d, i) => {
                const att = d.attempts ?? 0;
                const ok = d.successes ?? 0;
                const pct = att ? Math.round((100 * ok) / att) : 0;
                return (
                  <div className="row drill drill--read" key={i}>
                    <div className="drill-head">
                      <span className="drill-name">{d.label}</span>
                      <span className="drill-score drill-score--sm">
                        <strong>{ok}</strong>
                        <span> / {att}</span>
                        <em>{pct} %</em>
                      </span>
                    </div>
                    <div className="bar" role="img" aria-label={`${pct} % de réussite`}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </Group>
          )}
        </>
      )}

      {s.notes && (
        <Group title="Note">
          <div className="row row--text row--pre">{s.notes}</div>
        </Group>
      )}

      <Group>
        <Row label="Supprimer la séance" destructive onClick={() => setConfirm(true)} disabled={busy} />
      </Group>

      <ConfirmSheet
        open={confirm}
        title="Supprimer cette séance ?"
        message="Elle sera retirée de vos statistiques."
        confirmLabel="Supprimer la séance"
        destructive
        onConfirm={() => void remove()}
        onClose={() => setConfirm(false)}
      />
    </Screen>
  );
}
