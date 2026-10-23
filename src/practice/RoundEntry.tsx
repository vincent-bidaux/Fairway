// Saisie d'une partie, trou par trou : bandeau de progression, panneaux glissants, règle des scores, puces, carte.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Fairway, HoleEntry, PlaySession } from '../../shared/practice';
import { girOf } from '../../shared/practice';
import type { Golf } from '../../shared/types';
import { Group, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { useUi } from '../ui';
import { golfHoles } from './api';
import { PlaceDate, RoundOptions } from './SessionInfo';
import { ScoreRuler } from './ScoreRuler';
import { ariaScore, fmtRel, resKey, Scorecard, summarize } from './scorecard';
import './session.css';

const buzz = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* rien */
  }
};
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ puces
interface Opt<T> {
  value: T;
  label: ReactNode;
  aria?: string;
}
export function ChipRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  match,
}: {
  label: string;
  options: Array<Opt<T>>;
  value: T | null;
  onChange: (v: T | null) => void;
  match?: (opt: T, value: T) => boolean;
}) {
  const eq = match ?? ((a, b) => a === b);
  return (
    <div className="cr">
      <div className="cr-label" id={`cr-${label}`}>
        {label}
      </div>
      <div className="cr-chips" role="radiogroup" aria-labelledby={`cr-${label}`}>
        {options.map((o) => {
          const on = value != null && eq(o.value, value);
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.aria}
              className={`cr-chip${on ? ' is-active' : ''}`}
              onClick={() => {
                buzz(5);
                onChange(on ? null : o.value);
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ un trou
interface HoleViewProps {
  e: HoleEntry;
  locked: boolean;
  penTouched: boolean;
  onScore: (n: number) => void;
  onPar: (p: number) => void;
  onUnlock: () => void;
  onPatch: (p: Partial<HoleEntry>, penTouched?: boolean) => void;
  onChipTouch: () => void;
}

const HoleView = memo(function HoleView({ e, locked, penTouched, onScore, onPar, onUnlock, onPatch, onChipTouch }: HoleViewProps) {
  const gir = girOf(e);
  const patch = (p: Partial<HoleEntry>, pen?: boolean) => {
    onChipTouch();
    onPatch(p, pen);
  };
  const girState = e.gir != null ? 'Saisi' : gir != null ? 'Déduit de votre score et de vos putts' : 'Indiquez les putts pour le déduire';
  return (
    <div className="hv">
      <div className="hv-head">
        <h2>Trou {e.hole}</h2>
        <span className="hv-par">Par {e.par}</span>
      </div>
      <ScoreRuler key={`${e.hole}`} par={e.par} value={e.strokes} onSelect={onScore} parLocked={locked} onParChange={onPar} onUnlock={onUnlock} />
      <div className="hv-chips">
        <ChipRow<number>
          label="Putts"
          value={e.putts}
          match={(o, v) => (o === 4 ? v >= 4 : o === v)}
          onChange={(v) => patch({ putts: v })}
          options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n), aria: `${n === 4 ? '4 putts ou plus' : `${n} putt${n > 1 ? 's' : ''}`}` }))}
        />
        {e.par >= 4 && (
          <ChipRow<Fairway>
            label="Fairway"
            value={e.fairway}
            onChange={(v) => patch({ fairway: v })}
            options={[
              { value: 'left', label: '← Gauche', aria: 'Fairway manqué à gauche' },
              { value: 'hit', label: 'Touché', aria: 'Fairway touché' },
              { value: 'right', label: 'Droite →', aria: 'Fairway manqué à droite' },
              { value: 'short', label: 'Court', aria: 'Départ court' },
            ]}
          />
        )}
        <div className="cr">
          <div className="gir-row">
            <div className="gir-text">
              <span className="gir-title">Green en régulation</span>
              <span className="gir-sub">{girState}</span>
            </div>
            {e.gir != null && e.putts != null && e.strokes != null && (
              <button type="button" className="text-btn gir-reset" onClick={() => patch({ gir: null })}>
                Auto
              </button>
            )}
            <Switch
              checked={gir === 1}
              label="Green en régulation"
              onChange={(v) => patch({ gir: v ? 1 : 0, up_down: v ? null : e.up_down })}
            />
          </div>
        </div>
        <ChipRow<number>
          label="Pénalités"
          value={e.penalties > 0 ? e.penalties : penTouched ? 0 : null}
          match={(o, v) => (o === 2 ? v >= 2 : o === v)}
          onChange={(v) => patch({ penalties: v ?? 0 }, v != null)}
          options={[0, 1, 2].map((n) => ({ value: n, label: n === 2 ? '2+' : String(n), aria: `${n === 2 ? '2 pénalités ou plus' : `${n} pénalité${n > 1 ? 's' : ''}`}` }))}
        />
        {gir === 0 && (
          <ChipRow<number>
            label="Up & down"
            value={e.up_down}
            onChange={(v) => patch({ up_down: v as 0 | 1 | null })}
            options={[
              { value: 1, label: 'Oui', aria: 'Up and down réussi' },
              { value: 0, label: 'Non', aria: 'Up and down manqué' },
            ]}
          />
        )}
      </div>
    </div>
  );
});

// ------------------------------------------------------------------ bandeau
function HoleStrip({ entries, cur, onGo }: { entries: HoleEntry[]; cur: number; onGo: (i: number) => void }) {
  return (
    <div className={`hs${entries.length > 9 ? ' hs--many' : ''}`} role="tablist" aria-label="Trous" style={{ gridTemplateColumns: `repeat(${entries.length}, 1fr)` }}>
      {entries.map((e, i) => {
        const k = e.strokes != null ? resKey(e.strokes - e.par) : null;
        return (
          <button
            key={e.hole}
            type="button"
            role="tab"
            aria-selected={i === cur}
            aria-label={`Trou ${e.hole}${e.strokes != null ? `, ${ariaScore(e.strokes, e.par)}` : ', non saisi'}`}
            className={`hs-btn${i === cur ? ' is-cur' : ''}`}
            onClick={() => onGo(i)}
          >
            <span className={`hs-dot${k ? ` res-${k}` : ''}`}>{e.hole}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ écran
export interface RoundEntryProps {
  s: PlaySession;
  update: (fn: (s: PlaySession) => PlaySession) => void;
  penTouched: number[];
  setPenTouched: (fn: (p: number[]) => number[]) => void;
  golfN: number | null;
  setGolfN: (n: number | null) => void;
  sync: 'ok' | 'pending' | 'error';
  busy: boolean;
  onFinish: () => void;
  onBack: () => void;
  isNew: boolean;
}

export function RoundEntry({ s, update, penTouched, setPenTouched, golfN, setGolfN, sync, busy, onFinish, onBack, isNew }: RoundEntryProps) {
  const ui = useUi();
  const entries = s.hole_entries ?? [];
  const n = entries.length;
  const panesRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(() => {
    const first = entries.findIndex((e) => e.strokes == null);
    return isNew || first < 0 ? 0 : first;
  });
  const curRef = useRef(cur);
  curRef.current = cur;
  const navLock = useRef(0);
  const [known, setKnown] = useState<Record<number, number>>({});
  const [unlocked, setUnlocked] = useState<number[]>([]);
  const parTouched = useRef(new Set<number>());
  const [card, setCard] = useState(false);
  const [arming, setArming] = useState<number | null>(null);
  const advTimer = useRef<number | undefined>(undefined);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Placement initial du panneau.
  useLayoutEffect(() => {
    const el = panesRef.current;
    if (el) el.scrollLeft = cur * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pars connus de la base pour ce golf.
  useEffect(() => {
    if (s.golf_id == null) {
      setKnown({});
      return;
    }
    let alive = true;
    golfHoles(s.golf_id)
      .then((rows) => {
        if (!alive) return;
        const m: Record<number, number> = {};
        for (const r of rows) if (r.course === '') m[r.hole] = r.par;
        setKnown(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [s.golf_id]);

  // Applique les pars connus aux trous pas encore joués ni corrigés.
  useEffect(() => {
    const need = entriesRef.current.some((e) => known[e.hole] != null && e.strokes == null && !parTouched.current.has(e.hole) && e.par !== known[e.hole]);
    if (!need) return;
    update((p) => ({
      ...p,
      hole_entries: (p.hole_entries ?? []).map((e) =>
        known[e.hole] != null && e.strokes == null && !parTouched.current.has(e.hole) ? { ...e, par: known[e.hole] } : e,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);

  useEffect(() => () => window.clearTimeout(advTimer.current), []);

  const goTo = useCallback((i: number) => {
    const el = panesRef.current;
    if (!el) return;
    const t = Math.max(0, Math.min(entriesRef.current.length - 1, i));
    navLock.current = Date.now() + 450;
    setCur(t);
    el.scrollTo({ left: t * el.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
  }, []);

  const onScroll = () => {
    const el = panesRef.current;
    if (!el || Date.now() < navLock.current) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== curRef.current && i >= 0 && i < entriesRef.current.length) {
      window.clearTimeout(advTimer.current);
      setArming(null);
      setCur(i);
    }
  };

  const patchEntry = useCallback(
    (i: number, p: Partial<HoleEntry>) =>
      update((x) => ({ ...x, hole_entries: (x.hole_entries ?? []).map((e, j) => (j === i ? { ...e, ...p } : e)) })),
    [update],
  );

  const cancelAdvance = useCallback(() => {
    window.clearTimeout(advTimer.current);
    setArming(null);
  }, []);

  const onScore = (i: number, v: number) => {
    const e = entriesRef.current[i];
    const first = e.strokes == null;
    patchEntry(i, { strokes: v });
    window.clearTimeout(advTimer.current);
    if (first && i < entriesRef.current.length - 1) {
      setArming(i);
      advTimer.current = window.setTimeout(() => {
        setArming(null);
        if (curRef.current === i) goTo(i + 1);
      }, 900);
    } else setArming(null);
  };

  const onPar = (i: number, p: number) => {
    const e = entriesRef.current[i];
    parTouched.current.add(e.hole);
    patchEntry(i, { par: p, ...(p === 3 ? { fairway: null } : {}) });
  };

  const tot = summarize(entries);
  const last = cur >= n - 1;
  const gotoLabel = entries[cur] ? `Trou ${entries[cur].hole}` : '';

  const dateLabel = (() => {
    const d = new Date(s.played_at);
    return isNaN(d.getTime())
      ? ''
      : new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', '');
  })();

  return (
    <Screen
      title={s.golf_name ?? 'Partie'}
      large={false}
      fill
      left={<BackButton onClick={onBack} label="Quitter" />}
      right={
        <button type="button" className="text-btn re-finish" onClick={onFinish} disabled={busy}>
          {busy ? 'Envoi…' : 'Terminer'}
        </button>
      }
    >
      <div className="re">
        <div className="re-top">
          <HoleStrip entries={entries} cur={cur} onGo={goTo} />
          <div className="re-sub">
            <button type="button" className="re-info" onClick={() => setCard(true)} aria-label="Modifier le golf, la date et la carte">
              <span>
                {s.golf_name ?? 'Partie'} · {dateLabel}
              </span>
              <Icon name="chevron" size={11} strokeWidth={3} />
            </button>
            <span className="re-total" aria-label={`Score actuel ${tot.strokes}, ${fmtRel(tot.rel)}`}>
              {tot.played > 0 && (
                <>
                  <strong>{tot.strokes}</strong> <em>{fmtRel(tot.rel)}</em>
                </>
              )}
            </span>
            {sync !== 'ok' && (
              <span className={`re-sync re-sync--${sync}`} role="status">
                {sync === 'error' ? 'Non synchronisé' : 'Enregistrement…'}
              </span>
            )}
          </div>
        </div>

        <div className="re-panes" ref={panesRef} onScroll={onScroll} role="group" aria-label={gotoLabel} aria-roledescription="carrousel">
          {entries.map((e, i) => (
            <div className="re-pane" key={e.hole} aria-hidden={i !== cur} {...(i !== cur ? { inert: '' as unknown as boolean } : {})}>
              {Math.abs(i - cur) <= 2 && (
                <HoleView
                  e={e}
                  locked={known[e.hole] != null && !unlocked.includes(e.hole)}
                  penTouched={penTouched.includes(e.hole)}
                  onScore={(v) => onScore(i, v)}
                  onPar={(p) => onPar(i, p)}
                  onUnlock={() => setUnlocked((u) => [...u, e.hole])}
                  onChipTouch={cancelAdvance}
                  onPatch={(p, pen) => {
                    patchEntry(i, p);
                    if (pen !== undefined) setPenTouched((t) => (pen ? (t.includes(e.hole) ? t : [...t, e.hole]) : t.filter((h) => h !== e.hole)));
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="re-bar">
          <button type="button" className="re-nav" onClick={() => goTo(cur - 1)} disabled={cur === 0} aria-label="Trou précédent">
            <Icon name="chevron-left" size={22} strokeWidth={2.6} />
          </button>
          <button type="button" className="re-card-btn" onClick={() => setCard(true)}>
            <Icon name="list" size={18} />
            Carte
          </button>
          {last ? (
            <button type="button" className="btn re-next" onClick={onFinish} disabled={busy}>
              Terminer
            </button>
          ) : (
            <button
              type="button"
              className={`btn re-next${entries[cur]?.strokes == null ? ' btn--secondary' : ''}${arming === cur ? ' is-arming' : ''}`}
              onClick={() => {
                cancelAdvance();
                goTo(cur + 1);
              }}
            >
              Trou suivant
              <Icon name="chevron" size={14} strokeWidth={2.8} />
            </button>
          )}
        </div>
      </div>

      <Sheet open={card} onClose={() => setCard(false)} title="Carte de score">
        <div className="card-pad">
          <Scorecard
            entries={entries}
            current={cur}
            onPick={(i) => {
              setCard(false);
              setTimeout(() => goTo(i), 320);
            }}
          />
        </div>
        <Group title="Note" footer="Visible dans la fiche de la partie.">
          <div className="row row--block">
            <textarea
              className="notes-input"
              rows={3}
              maxLength={2000}
              placeholder="Conditions, sensations, anecdotes…"
              value={s.notes ?? ''}
              onChange={(e) => update((x) => ({ ...x, notes: e.target.value || null }))}
              aria-label="Note de la partie"
            />
          </div>
        </Group>
        <h3 className="sheet-section">Informations</h3>
        <PlaceDate
          s={s}
          onChange={(p, g?: Golf | null) => {
            if (g !== undefined) setGolfN(g?.holes ?? null);
            update((x) => ({ ...x, ...p }));
          }}
        />
        <RoundOptions
          s={s}
          golfHoles={golfN}
          showStart={false}
          onChange={(p) => {
            // Changer le nombre de trous en cours de route : on garde les trous déjà saisis.
            if (p.holes && p.holes !== s.holes) {
              update((x) => {
                const holes = p.holes!;
                const start = x.start_hole;
                const keep = x.hole_entries ?? [];
                const out: HoleEntry[] = [];
                for (let k = 0; k < holes; k++) {
                  const hole = ((start - 1 + k) % 18) + 1;
                  out.push(
                    keep.find((e) => e.hole === hole) ?? { hole, par: known[hole] ?? 4, strokes: null, putts: null, fairway: null, gir: null, penalties: 0, up_down: null, sand: null },
                  );
                }
                return { ...x, ...p, hole_entries: out };
              });
              setCur(0);
              ui.toast(`${p.holes} trous`);
            } else update((x) => ({ ...x, ...p }));
          }}
        />
      </Sheet>
    </Screen>
  );
}
