import { useEffect, useState } from 'react';
import type { Golf } from '../../shared/types';
import { getGolf, type GolfDetailData } from '../api';
import { GolfBanner } from '../components/GolfBanner';
import { GolfCross } from '../components/GolfCross';
import { EventCell } from '../components/EventCell';
import { Group, Row } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, Screen } from '../components/Screen';
import { ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { deptName, golfDirections, holesLabel } from '../lib';
import { toggleFavorite, toggleGolfFavorite, useGolfFavorites, usePrefs } from '../store';
import { useUi } from '../ui';

export function GolfDetail({ id, initial }: { id: number; initial?: Golf }) {
  const ui = useUi();
  const { favorites } = usePrefs();
  const golfFavs = useGolfFavorites();
  const { data, error, reload } = useAsync((s) => getGolf(id, s), [id]);
  const [golf, setGolf] = useState<(Golf & { events?: GolfDetailData['events'] }) | undefined>(initial);

  useEffect(() => {
    if (data) setGolf(data);
  }, [data]);

  const back = <BackButton onClick={ui.back} />;

  if (!golf) {
    return (
      <Screen title="Golf" large={false} left={back}>
        {error ? <ErrorState message={error.message} onRetry={reload} /> : <p className="list-footnote">Chargement…</p>}
      </Screen>
    );
  }

  const events = data?.events;
  const website = golf.website ? (/^https?:/.test(golf.website) ? golf.website : `https://${golf.website}`) : null;
  const subtitle = [golf.city, deptName(ui.departments, golf.department), holesLabel(golf.holes)]
    .filter(Boolean)
    .join(' · ');
  const isFav = golfFavs.includes(golf.id);
  const cityLine = [golf.postcode, golf.city].filter(Boolean).join(' ');
  const crossGolf: Golf = { ...golf, upcomingCount: golf.upcomingCount ?? events?.length };

  return (
    <Screen title={golf.name} left={back}>
      <GolfBanner golf={golf} />

      <div className="golf-hero">
        <GolfCross golf={crossGolf} size={96} />
        <div className="golf-hero-text">
          <p className="detail-sub golf-hero-sub">{subtitle}</p>
          <button
            type="button"
            className={`chip golf-fav${isFav ? ' is-active' : ''}`}
            aria-pressed={isFav}
            aria-label={isFav ? `Retirer ${golf.name} des favoris` : `Ajouter ${golf.name} aux favoris`}
            onClick={() => toggleGolfFavorite(golf.id)}
          >
            <Icon name="star" size={16} fill={isFav} />
            {isFav ? 'Favori' : 'Ajouter aux favoris'}
          </button>
        </div>
      </div>

      <div className="action-grid">
        {website ? (
          <a className="action-btn" href={website} target="_blank" rel="noopener noreferrer">
            <Icon name="globe" size={24} />
            <span>Site web</span>
          </a>
        ) : (
          <span className="action-btn is-disabled" aria-disabled="true">
            <Icon name="globe" size={24} />
            <span>Site web</span>
          </span>
        )}
        {golf.phone ? (
          <a className="action-btn" href={`tel:${golf.phone.replace(/[^\d+]/g, '')}`}>
            <Icon name="phone" size={24} />
            <span>Appeler</span>
          </a>
        ) : (
          <span className="action-btn is-disabled" aria-disabled="true">
            <Icon name="phone" size={24} />
            <span>Appeler</span>
          </span>
        )}
        <a className="action-btn" href={golfDirections(golf)} target="_blank" rel="noopener noreferrer">
          <Icon name="directions" size={24} />
          <span>Itinéraire</span>
        </a>
      </div>

      <Group title="Coordonnées">
        <Row
          icon={<Icon name="pin" size={17} />}
          iconColor="var(--tint)"
          label={golf.address || cityLine || golf.city}
          sub={golf.address ? cityLine : undefined}
          value="Itinéraire"
          href={golfDirections(golf)}
          chevron
        />
        {golf.email && (
          <Row
            icon={<Icon name="mail" size={17} />}
            iconColor="var(--blue)"
            label={golf.email}
            href={`mailto:${golf.email}`}
            chevron
          />
        )}
      </Group>

      <Group title="Compétitions à venir">
        {!events && !error && <div className="row row--muted">Chargement…</div>}
        {error && !events && (
          <div className="row hint--error">
            {error.message}{' '}
            <button type="button" className="text-btn" onClick={reload}>
              Réessayer
            </button>
          </div>
        )}
        {events && events.length === 0 && <div className="row row--muted">Aucune compétition à venir référencée.</div>}
        {events?.map((e) => (
          <EventCell
            key={e.id}
            event={e}
            hideGolf
            favorite={favorites.includes(e.id)}
            onToggleFav={() => toggleFavorite(e.id)}
            onOpen={() => ui.push({ type: 'event', id: e.id, event: e })}
          />
        ))}
      </Group>
    </Screen>
  );
}
