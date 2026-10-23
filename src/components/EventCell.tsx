import { EVENT_TYPE_LABELS, type GolfEvent } from '../../shared/types';
import { dayNumber, formatKm, formatTime, monthShort } from '../lib';
import { Badge } from './Controls';
import { Icon } from './Icon';

interface Props {
  event: GolfEvent;
  onOpen: () => void;
  favorite: boolean;
  onToggleFav: () => void;
  hideGolf?: boolean;
  /** Mode édition des favoris : bouton rouge « Retirer ». */
  editing?: boolean;
}

export function EventCell({ event: e, onOpen, favorite, onToggleFav, hideGolf, editing }: Props) {
  const cancelled = e.status === 'cancelled';
  const time = formatTime(e.startTime);
  const dist = formatKm(e.distanceKm);
  return (
    <div className={`cell${cancelled ? ' is-cancelled' : ''}`}>
      <button type="button" className="cell-main" onClick={onOpen}>
        <span className="date-pill" aria-hidden="true">
          <span className="date-pill-month">{monthShort(e.startDate)}</span>
          <span className="date-pill-day">{dayNumber(e.startDate)}</span>
        </span>
        <span className="cell-text">
          <span className="cell-title">{e.title}</span>
          {!hideGolf && (
            <span className="cell-sub">
              {e.golfName} · {e.golfCity}
            </span>
          )}
          <span className="cell-meta">
            <Badge tone={`t-${e.type}`}>{EVENT_TYPE_LABELS[e.type]}</Badge>
            {cancelled && <Badge tone="red">Annulée</Badge>}
            {e.status === 'full' && <Badge tone="orange">Complet</Badge>}
            {e.format && <span className="meta-text">{e.format}</span>}
            {time && <span className="meta-text">{time}</span>}
            {dist && <span className="meta-text">{dist}</span>}
          </span>
        </span>
      </button>
      {editing ? (
        <button type="button" className="remove-btn" onClick={onToggleFav} aria-label={`Retirer ${e.title} des favoris`}>
          Retirer
        </button>
      ) : (
        <button
          type="button"
          className={`star-btn${favorite ? ' is-on' : ''}`}
          onClick={onToggleFav}
          aria-pressed={favorite}
          aria-label={favorite ? `Retirer ${e.title} des favoris` : `Ajouter ${e.title} aux favoris`}
        >
          <Icon name="star" size={22} fill={favorite} />
        </button>
      )}
      {!editing && <Icon name="chevron" size={14} strokeWidth={2.6} className="chevron cell-chevron" />}
    </div>
  );
}
