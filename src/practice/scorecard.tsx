// Pièces partagées par l'éditeur et la fiche : couleurs de résultat, totaux, carte de score.
import type { HoleEntry } from '../../shared/practice';
import { scoreName } from '../../shared/practice';
import './session.css';

export type ResKey = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'triple';

export function resKey(rel: number): ResKey {
  if (rel <= -2) return 'eagle';
  if (rel === -1) return 'birdie';
  if (rel === 0) return 'par';
  if (rel === 1) return 'bogey';
  if (rel === 2) return 'double';
  return 'triple';
}

/** Légende courte sous un chiffre de la règle. */
export function captionOf(strokes: number, par: number): string {
  if (strokes === 1) return 'Ace';
  return scoreName(strokes - par);
}

export function ariaScore(strokes: number, par: number): string {
  const name = strokes === 1 ? 'trou en un' : scoreName(strokes - par).toLowerCase();
  return `${strokes} coup${strokes > 1 ? 's' : ''}, ${name}`;
}

export const fmtRel = (rel: number) => (rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `−${Math.abs(rel)}`);

export interface Totals {
  strokes: number;
  par: number;
  played: number;
  rel: number;
  putts: number | null;
}

export function summarize(entries: HoleEntry[]): Totals {
  let strokes = 0;
  let par = 0;
  let played = 0;
  let putts = 0;
  let puttsN = 0;
  for (const e of entries) {
    if (e.strokes == null) continue;
    strokes += e.strokes;
    par += e.par;
    played++;
    if (e.putts != null) {
      putts += e.putts;
      puttsN++;
    }
  }
  return { strokes, par, played, rel: strokes - par, putts: puttsN ? putts : null };
}

function Cell({ e, active, onPick, i }: { e: HoleEntry; active: boolean; onPick?: (i: number) => void; i: number }) {
  const has = e.strokes != null;
  const k = has ? resKey(e.strokes! - e.par) : null;
  const inner = <span className={`sc-score${k ? ` res-${k}` : ''}`}>{has ? e.strokes : ''}</span>;
  if (!onPick) return <div className="sc-cell">{inner}</div>;
  return (
    <button
      type="button"
      className={`sc-cell sc-cell--tap${active ? ' is-current' : ''}`}
      onClick={() => onPick(i)}
      aria-label={`Trou ${e.hole}, par ${e.par}${has ? `, ${ariaScore(e.strokes!, e.par)}` : ', non saisi'}`}
    >
      {inner}
    </button>
  );
}

export function Scorecard({
  entries,
  current,
  onPick,
}: {
  entries: HoleEntry[];
  current?: number;
  onPick?: (index: number) => void;
}) {
  const nines: Array<{ label: string; start: number; items: HoleEntry[] }> =
    entries.length > 9
      ? [
          { label: 'Aller', start: 0, items: entries.slice(0, 9) },
          { label: 'Retour', start: 9, items: entries.slice(9, 18) },
        ]
      : [{ label: 'Total', start: 0, items: entries }];
  const all = summarize(entries);
  return (
    <div className="scorecard">
      {nines.map((n) => {
        const t = summarize(n.items);
        const cols = n.items.length;
        const style = { gridTemplateColumns: `44px repeat(${cols}, 1fr) 46px` };
        return (
          <div className="sc-block" key={n.start} role="table" aria-label={`Carte de score, ${n.label.toLowerCase()}`}>
            <div className="sc-row sc-row--head" style={style} role="row">
              <div className="sc-label">Trou</div>
              {n.items.map((e) => (
                <div className="sc-cell sc-num" key={e.hole} role="columnheader">
                  {e.hole}
                </div>
              ))}
              <div className="sc-cell sc-tot">{n.label === 'Total' ? 'Tot.' : n.label.slice(0, 3) + '.'}</div>
            </div>
            <div className="sc-row" style={style} role="row">
              <div className="sc-label">Par</div>
              {n.items.map((e) => (
                <div className="sc-cell sc-par" key={e.hole}>
                  {e.par}
                </div>
              ))}
              <div className="sc-cell sc-tot">{n.items.reduce((a, e) => a + e.par, 0)}</div>
            </div>
            <div className="sc-row sc-row--score" style={style} role="row">
              <div className="sc-label">Score</div>
              {n.items.map((e, j) => (
                <Cell key={e.hole} e={e} i={n.start + j} active={current === n.start + j} onPick={onPick} />
              ))}
              <div className="sc-cell sc-tot sc-tot--score">{t.played ? t.strokes : '–'}</div>
            </div>
            <div className="sc-row" style={style} role="row">
              <div className="sc-label">Putts</div>
              {n.items.map((e) => (
                <div className="sc-cell sc-putts" key={e.hole}>
                  {e.putts ?? ''}
                </div>
              ))}
              <div className="sc-cell sc-tot">{t.putts ?? '–'}</div>
            </div>
          </div>
        );
      })}
      <div className="sc-total">
        <span>
          <strong>{all.played ? all.strokes : '–'}</strong>
          {all.played > 0 && <em className="sc-rel">{fmtRel(all.rel)}</em>}
        </span>
        <span className="sc-total-sub">
          {all.played} trou{all.played > 1 ? 's' : ''} joué{all.played > 1 ? 's' : ''}
          {all.putts != null ? ` · ${all.putts} putts` : ''}
        </span>
      </div>
      <div className="sc-legend" aria-hidden="true">
        <span><i className="lg lg--eagle" />Eagle</span>
        <span><i className="lg lg--birdie" />Birdie</span>
        <span>Par</span>
        <span><i className="lg lg--bogey" />Bogey</span>
        <span><i className="lg lg--double" />Double+</span>
      </div>
    </div>
  );
}
