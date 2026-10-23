import { useEffect, useState } from 'react';
import type { Golf } from '../../shared/types';
import { getGolf, type GolfDetailData } from '../api';
import { EventCell } from '../components/EventCell';
import { Group } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, Screen } from '../components/Screen';
import { ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { deptName, golfDirections, holesLabel } from '../lib';
import { toggleFavorite, usePrefs } from '../store';
import { useUi } from '../ui';

export function GolfDetail({ id, initial }: { id: number; initial?: Golf }) {
  const ui = useUi();
  const { favorites } = usePrefs();
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

  return (
    <Screen title={golf.name} left={back}>
      <p className="detail-sub">{subtitle}</p>

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
      {golf.postcode && (
        <p className="disclaimer">
          {golf.city} {golf.postcode}
        </p>
      )}
    </Screen>
  );
}
