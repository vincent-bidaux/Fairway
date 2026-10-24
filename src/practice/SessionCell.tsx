import type { PlaySession } from '../../shared/practice';
import { Icon } from '../components/Icon';
import { TrophyGlyph } from './glyphs';
import { duration, fmtDateFull, fmtDateShort, relClass, rel, sessionPlace } from './statsFormat';
import './practice.css';

/** Cellule de séance : icône, lieu, date ; à droite score (partie) ou durée et balles (practice). */
export function SessionCell({ s, onOpen }: { s: PlaySession; onOpen: () => void }) {
  const isRound = s.kind === 'round';
  const sum = s.summary;
  const hasScore = isRound && !!sum && sum.played > 0;
  const relative = hasScore ? sum!.strokes - sum!.par : 0;
  const label = `${isRound ? 'Partie' : 'Practice'}${s.event_title ? `, ${s.event_title}` : ''}, ${sessionPlace(s)}, ${fmtDateFull(s.played_at)}`;
  return (
    <div className="cell">
      <button type="button" className="cell-main sess-main" onClick={onOpen} aria-label={label}>
        <span className={`sess-icon ${isRound ? 'sess-icon--round' : 'sess-icon--range'}`}>
          <Icon name={isRound ? 'golf' : 'chart'} size={20} strokeWidth={2} />
        </span>
        <span className="cell-text">
          {s.event_title ? (
            <>
              <span className="sess-title-row">
                <span className="sess-trophy">
                  <TrophyGlyph size={15} />
                </span>
                <span className="sess-title">{s.event_title}</span>
              </span>
              <span className="cell-sub sess-sub">
                <span className="sess-sub-golf">{sessionPlace(s)}</span>
                <span className="sess-sub-date"> · {fmtDateShort(s.played_at)}</span>
              </span>
            </>
          ) : (
            <>
              <span className="sess-title">{sessionPlace(s)}</span>
              <span className="cell-sub">{fmtDateFull(s.played_at)}</span>
            </>
          )}
        </span>
        <span className="sess-right">
          {isRound ? (
            hasScore ? (
              <>
                <span className={`sess-score ${relClass(relative, sum!.played)}`}>
                  {sum!.strokes}
                  <small>({rel(relative, 0)})</small>
                </span>
                <span className="sess-meta">{sum!.played < (s.holes ?? 18) ? `${sum!.played} / ${s.holes ?? 18} trous` : `${s.holes ?? sum!.played} trous`}</span>
              </>
            ) : (
              <span className="sess-meta">Score non saisi</span>
            )
          ) : (
            <>
              <span className="sess-score sess-score--range">{s.duration_min ? duration(s.duration_min) : '—'}</span>
              <span className="sess-meta">{s.balls ? `${s.balls} balles` : 'Practice'}</span>
            </>
          )}
        </span>
        <Icon name="chevron" size={14} strokeWidth={2.6} className="chevron sess-chev" />
      </button>
    </div>
  );
}
