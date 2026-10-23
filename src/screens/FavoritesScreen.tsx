import { useEffect, useMemo, useState } from 'react';
import type { Golf, GolfEvent } from '../../shared/types';
import { ApiError, getEvent, getGolf } from '../api';
import { Group, Segmented } from '../components/Controls';
import { EventCell } from '../components/EventCell';
import { GolfCell } from '../components/GolfCell';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { isUpcoming } from '../lib';
import { toggleFavorite, toggleGolfFavorite, useGolfFavorites, usePrefs } from '../store';
import { useUi } from '../ui';

type Tab = 'events' | 'golfs';

/** Récupère en parallèle les éléments pas encore connus ; les 404 sont ignorés. */
function useFavItems<T>(ids: number[], active: boolean, fetcher: (id: number) => Promise<T>) {
  const [cache, setCache] = useState<Map<number, T | null>>(new Map());
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      missing.map((id) =>
        fetcher(id)
          .then((e) => [id, e] as const)
          .catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 404) return [id, null] as const;
            throw err;
          }),
      ),
    )
      .then((pairs) => {
        if (cancelled) return;
        setCache((prev) => {
          const next = new Map(prev);
          pairs.forEach(([id, e]) => next.set(id, e));
          return next;
        });
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ids, cache, tick]);

  return {
    cache,
    error,
    loading,
    pending: ids.some((id) => !cache.has(id)),
    retry: () => setTick((t) => t + 1),
  };
}

export function FavoritesScreen({ active }: { active: boolean }) {
  const { favorites } = usePrefs();
  const golfFavs = useGolfFavorites();
  const ui = useUi();
  const [tab, setTab] = useState<Tab>('events');
  const [editing, setEditing] = useState(false);

  const ev = useFavItems<GolfEvent>(favorites, active, (id) => getEvent(id));
  const gf = useFavItems<Golf>(golfFavs, active, (id) => getGolf(id));

  const events = useMemo(
    () =>
      favorites
        .map((id) => ev.cache.get(id))
        .filter((e): e is GolfEvent => !!e)
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id),
    [favorites, ev.cache],
  );
  const golfs = useMemo(
    () =>
      golfFavs
        .map((id) => gf.cache.get(id))
        .filter((g): g is Golf => !!g)
        .map((g) => {
          const withEvents = g as Golf & { events?: GolfEvent[] };
          return { ...g, upcomingCount: g.upcomingCount ?? withEvents.events?.filter(isUpcoming).length };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [golfFavs, gf.cache],
  );
  const upcoming = events.filter(isUpcoming);
  const past = events.filter((e) => !isUpcoming(e)).reverse();

  const renderEvents = (items: GolfEvent[]) => (
    <div className="group">
      {items.map((e) => (
        <EventCell
          key={e.id}
          event={e}
          editing={editing}
          favorite
          onToggleFav={() => toggleFavorite(e.id)}
          onOpen={() => ui.push({ type: 'event', id: e.id, event: e })}
        />
      ))}
    </div>
  );

  const retryBanner = (error: Error | null, retry: () => void) =>
    error && (
      <p className="banner-error" role="alert">
        {error.message}{' '}
        <button type="button" className="text-btn" onClick={retry}>
          Réessayer
        </button>
      </p>
    );

  const eventsBody =
    favorites.length === 0 ? (
      <EmptyState icon="star" title="Aucun favori" text="Touchez l'étoile d'une compétition pour la retrouver ici." />
    ) : ev.error && events.length === 0 ? (
      <ErrorState message={ev.error.message} onRetry={ev.retry} />
    ) : ev.pending && ev.loading && events.length === 0 ? (
      <p className="list-footnote">Chargement…</p>
    ) : events.length === 0 && !ev.pending ? (
      <EmptyState
        icon="star"
        title="Compétitions introuvables"
        text="Vos favoris ne sont plus référencés (compétitions supprimées ou périmées)."
      />
    ) : (
      <>
        {upcoming.length > 0 && (
          <Group title="À venir" className="group-wrap--flush">
            {renderEvents(upcoming)}
          </Group>
        )}
        {past.length > 0 && (
          <Group title="Passées" className="group-wrap--flush">
            {renderEvents(past)}
          </Group>
        )}
        {retryBanner(ev.error, ev.retry)}
      </>
    );

  const golfsBody =
    golfFavs.length === 0 ? (
      <EmptyState icon="star" title="Aucun golf favori" text="Touchez l'étoile d'un golf pour le retrouver ici." />
    ) : gf.error && golfs.length === 0 ? (
      <ErrorState message={gf.error.message} onRetry={gf.retry} />
    ) : gf.pending && gf.loading && golfs.length === 0 ? (
      <p className="list-footnote">Chargement…</p>
    ) : golfs.length === 0 && !gf.pending ? (
      <EmptyState icon="star" title="Golfs introuvables" text="Vos golfs favoris ne sont plus référencés." />
    ) : (
      <>
        <Group className="group-wrap--flush">
          {golfs.map((g) => (
            <GolfCell
              key={g.id}
              golf={g}
              editing={editing}
              favorite
              onToggleFav={() => toggleGolfFavorite(g.id)}
              onOpen={() => ui.push({ type: 'golf', id: g.id, golf: g })}
            />
          ))}
        </Group>
        {retryBanner(gf.error, gf.retry)}
      </>
    );

  const hasItems = tab === 'events' ? events.length > 0 : golfs.length > 0;

  return (
    <Screen
      title="Favoris"
      eyebrow
      right={
        hasItems ? (
          <button type="button" className="text-btn" onClick={() => setEditing((v) => !v)}>
            {editing ? 'OK' : 'Modifier'}
          </button>
        ) : undefined
      }
    >
      <div className="golfs-controls fav-seg">
        <Segmented<Tab>
          label="Type de favoris"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setEditing(false);
          }}
          options={[
            { value: 'events', label: 'Compétitions' },
            { value: 'golfs', label: 'Golfs' },
          ]}
        />
      </div>
      {tab === 'events' ? eventsBody : golfsBody}
    </Screen>
  );
}
