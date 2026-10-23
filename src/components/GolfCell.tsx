import type { Golf } from '../../shared/types';
import { Badge } from './Controls';
import { GolfCross } from './GolfCross';
import { Icon } from './Icon';

interface Props {
  golf: Golf;
  onOpen: () => void;
  favorite: boolean;
  onToggleFav: () => void;
  /** Mode édition des favoris : bouton rouge « Retirer ». */
  editing?: boolean;
}

export function GolfCell({ golf, onOpen, favorite, onToggleFav, editing }: Props) {
  return (
    <div className="cell">
      <button type="button" className="cell-main golf-cell-main" onClick={onOpen}>
        <GolfCross golf={golf} />
        <span className="cell-text">
          <span className="cell-title">{golf.name}</span>
          <span className="cell-sub">
            {[golf.city, golf.holes ? `${golf.holes} trous` : null, golf.distanceKm !== undefined ? `${Math.round(golf.distanceKm)} km` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {!!golf.upcomingCount && (
            <span className="cell-meta">
              <Badge tone="green">{golf.upcomingCount} compét.</Badge>
            </span>
          )}
        </span>
      </button>
      {editing ? (
        <button type="button" className="remove-btn" onClick={onToggleFav} aria-label={`Retirer ${golf.name} des favoris`}>
          Retirer
        </button>
      ) : (
        <button
          type="button"
          className={`star-btn${favorite ? ' is-on' : ''}`}
          onClick={onToggleFav}
          aria-pressed={favorite}
          aria-label={favorite ? `Retirer ${golf.name} des favoris` : `Ajouter ${golf.name} aux favoris`}
        >
          <Icon name="star" size={22} fill={favorite} />
        </button>
      )}
      {!editing && <Icon name="chevron" size={14} strokeWidth={2.6} className="chevron cell-chevron" />}
    </div>
  );
}
