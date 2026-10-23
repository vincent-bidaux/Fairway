import { useEffect, useState } from 'react';
import { EVENT_TYPE_LABELS, type GolfEvent } from '../../shared/types';
import { getEvent } from '../api';
import { Badge, Group, Row } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, Screen } from '../components/Screen';
import { ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import {
  buildICS,
  directionsUrl,
  downloadFile,
  formatDateRange,
  formatKm,
  formatTime,
  formatUpdated,
  slugify,
} from '../lib';
import { toggleFavorite, usePrefs } from '../store';
import { useUi } from '../ui';

export function EventDetail({ id, initial }: { id: number; initial?: GolfEvent }) {
  const ui = useUi();
  const { favorites } = usePrefs();
  const { data, error, reload } = useAsync((s) => getEvent(id, s), [id]);
  const [ev, setEv] = useState<GolfEvent | undefined>(initial);

  useEffect(() => {
    if (data) setEv(data);
  }, [data]);

  const back = <BackButton onClick={ui.back} />;

  if (!ev) {
    return (
      <Screen title="Compétition" large={false} left={back}>
        {error ? <ErrorState message={error.message} onRetry={reload} /> : <p className="list-footnote">Chargement…</p>}
      </Screen>
    );
  }

  const fav = favorites.includes(ev.id);
  const time = formatTime(ev.startTime);
  const dist = formatKm(ev.distanceKm);
  const cancelled = ev.status === 'cancelled';

  const share = async () => {
    const url = location.href;
    const text = `${ev.title} — ${ev.golfName} (${ev.golfCity}), ${formatDateRange(ev)}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: ev.title, text, url });
      } catch {
        /* partage annulé */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      ui.toast('Lien copié');
    } catch {
      ui.toast('Copie impossible sur cet appareil');
    }
  };

  const addToCalendar = () => {
    downloadFile(`${slugify(ev.title)}.ics`, buildICS(ev), 'text/calendar;charset=utf-8');
    ui.toast('Fichier calendrier téléchargé');
  };

  return (
    <Screen title={ev.title} left={back}>
      <div className="detail-badges">
        <Badge tone={`t-${ev.type}`}>{EVENT_TYPE_LABELS[ev.type]}</Badge>
        {cancelled && <Badge tone="red">Annulée</Badge>}
        {ev.status === 'full' && <Badge tone="orange">Complet</Badge>}
      </div>

      <Group>
        <Row label="Date" value={formatDateRange(ev)} />
        {time && <Row label="Heure" value={time} />}
        <Row
          label="Golf"
          value={ev.golfName}
          chevron
          onClick={() => ui.push({ type: 'golf', id: ev.golfId })}
        />
        <Row label="Ville" value={ev.golfCity} />
        {dist && <Row label="Distance" value={dist} />}
      </Group>

      {ev.format && (
        <Group title="Format">
          <div className="row row--text">{ev.format}</div>
        </Group>
      )}
      {ev.eligibility && (
        <Group title="Conditions">
          <div className="row row--text">{ev.eligibility}</div>
        </Group>
      )}
      {ev.price && (
        <Group title="Tarif">
          <div className="row row--text">{ev.price}</div>
        </Group>
      )}
      {ev.description && (
        <Group title="Description">
          <div className="row row--text row--pre">{ev.description}</div>
        </Group>
      )}

      <Group title="Actions">
        {ev.registrationUrl && (
          <Row
            icon={<Icon name="check-circle" size={17} />}
            iconColor="var(--tint)"
            label="S'inscrire"
            href={ev.registrationUrl}
            chevron
          />
        )}
        {ev.infoUrl && (
          <Row icon={<Icon name="link" size={17} />} iconColor="var(--blue)" label="Voir la source" href={ev.infoUrl} chevron />
        )}
        <Row
          icon={<Icon name="directions" size={17} />}
          iconColor="var(--indigo)"
          label="Itinéraire"
          href={directionsUrl({ lat: ev.lat, lng: ev.lng, name: ev.golfName, city: ev.golfCity })}
          chevron
        />
        <Row
          icon={<Icon name="calendar" size={17} />}
          iconColor="var(--red)"
          label="Ajouter au calendrier"
          onClick={addToCalendar}
          chevron
        />
        <Row icon={<Icon name="share" size={17} />} iconColor="var(--orange)" label="Partager" onClick={share} chevron />
        <Row
          icon={<Icon name="star" size={17} fill={fav} />}
          iconColor="var(--pink)"
          label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={() => toggleFavorite(ev.id)}
        />
      </Group>

      <Group>
        <Row
          icon={<Icon name="golf" size={17} />}
          iconColor="var(--teal)"
          label="Fiche du golf"
          sub={`${ev.golfName} · ${ev.golfCity}`}
          chevron
          onClick={() => ui.push({ type: 'golf', id: ev.golfId })}
        />
      </Group>

      <p className="disclaimer">
        Infos collectées automatiquement — vérifiez auprès du golf.
        {formatUpdated(ev.updatedAt) && ` Mis à jour le ${formatUpdated(ev.updatedAt)}.`}
      </p>
    </Screen>
  );
}
