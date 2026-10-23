// La règle des scores : chiffres 1…12 en défilement aimanté + flèche du par glissable.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../components/Icon';
import { ariaScore, captionOf, resKey } from './scorecard';
import './session.css';

const CELL = 56;
const buzz = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* pas de haptique */
  }
};
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

interface Props {
  par: number;
  value: number | null;
  onSelect: (n: number) => void;
  parLocked: boolean;
  onParChange: (p: number) => void;
  onUnlock: () => void;
}

export function ScoreRuler({ par, value, onSelect, parLocked, onParChange, onUnlock }: Props) {
  const count = Math.max(12, value ?? 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Ouverture centrée sur par + 1 (le bogey), ou sur le score déjà saisi.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = value != null ? clamp(value, par - 2, par + 2) : par + 1;
    el.scrollLeft = (clamp(target, 1, count) - 1) * CELL;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: KeyboardEvent) => {
    const cur = value ?? par + 1;
    let next = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(count, cur + (value == null ? 0 : 1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, cur - 1);
    else return;
    e.preventDefault();
    onSelect(next);
    cellRefs.current[next - 1]?.focus();
  };

  // --- Flèche du par ---------------------------------------------------------
  const [drag, setDrag] = useState<{ center: number } | null>(null);
  const dragRef = useRef<{ startX: number; startCenter: number; moved: boolean; id: number } | null>(null);
  const holdRef = useRef<number | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const lastPar = useRef(par);
  lastPar.current = par;

  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  const centerOf = (p: number) => (p - 1) * CELL + CELL / 2;

  const down = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startCenter: centerOf(par), moved: false, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (parLocked) {
      setHolding(true);
      window.clearTimeout(holdRef.current);
      holdRef.current = window.setTimeout(() => {
        setHolding(false);
        dragRef.current = null;
        buzz(18);
        onUnlock();
      }, 500);
    }
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (parLocked) {
      if (Math.abs(dx) > 10) {
        window.clearTimeout(holdRef.current);
        setHolding(false);
      }
      return;
    }
    if (Math.abs(dx) > 3) d.moved = true;
    const center = clamp(d.startCenter + dx, centerOf(3), centerOf(6));
    setDrag({ center });
    const p = clamp(Math.round((center - CELL / 2) / CELL) + 1, 3, 6);
    if (p !== lastPar.current) {
      lastPar.current = p;
      buzz(6);
      onParChange(p);
    }
  };
  const up = () => {
    window.clearTimeout(holdRef.current);
    setHolding(false);
    dragRef.current = null;
    setDrag(null);
  };

  const onArrowKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (parLocked) {
        e.preventDefault();
        buzz(18);
        onUnlock();
      }
      return;
    }
    if (parLocked) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (par < 6) onParChange(par + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (par > 3) onParChange(par - 1);
    }
  };

  const arrowLeft = (drag ? drag.center : centerOf(par)) - CELL / 2;

  return (
    <div className="ruler">
      <div className="ruler-scroll" ref={scrollRef}>
        <div className="ruler-inner" ref={innerRef} style={{ width: count * CELL }}>
          <div className="ruler-cells" role="radiogroup" aria-label="Score du trou" onKeyDown={onKey}>
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
              const sel = value === n;
              const k = resKey(n - par);
              const tab = value != null ? sel : n === Math.min(count, par + 1);
              return (
                <button
                  key={n}
                  ref={(el) => {
                    cellRefs.current[n - 1] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  aria-label={ariaScore(n, par)}
                  tabIndex={tab ? 0 : -1}
                  className={`rl-cell${sel ? ` is-sel res-${k}` : ''}${n === par ? ' is-par' : ''}`}
                  onClick={() => {
                    buzz(8);
                    onSelect(n);
                  }}
                >
                  <span className="rl-num">{n}</span>
                  <span className="rl-cap">{captionOf(n, par)}</span>
                </button>
              );
            })}
          </div>
          <div className={`par-track${parLocked ? ' is-locked' : ''}`}>
            {!parLocked && (
              <div className="par-rail" style={{ left: centerOf(3), width: centerOf(6) - centerOf(3) }} aria-hidden="true">
                {[3, 4, 5, 6].map((p) => (
                  <i key={p} style={{ left: (p - 3) * CELL }} />
                ))}
              </div>
            )}
            <div
              className={`par-arrow${drag ? ' is-drag' : ''}${holding ? ' is-holding' : ''}`}
              style={{ left: arrowLeft }}
              role="slider"
              tabIndex={0}
              aria-label="Par du trou"
              aria-valuemin={3}
              aria-valuemax={6}
              aria-valuenow={par}
              aria-valuetext={`Par ${par}${parLocked ? ', verrouillé, appuyez sur Entrée pour corriger' : ''}`}
              aria-readonly={parLocked || undefined}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={onArrowKey}
            >
              <svg width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
                <path d="M9 0.8 17 10.2H1z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <span className="par-label">
                {parLocked && <Icon name="lock" size={11} strokeWidth={2.4} />}
                Par {par}
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="ruler-hint" aria-live="polite">
        {parLocked ? 'Par issu de la base. Maintenez la flèche pour le corriger.' : 'Faites glisser la flèche pour régler le par.'}
      </p>
    </div>
  );
}
