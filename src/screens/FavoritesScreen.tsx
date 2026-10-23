import { useEffect, useMemo, useState } from 'react';
import type { GolfEvent } from '../../shared/types';
import { ApiError, getEvent } from '../api';
import { Group } from '../components/Controls';
import { EventCell } from '../components/EventCell';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { isUpcoming } from '../lib';
import { toggleFavorite, usePrefs } from '../store';
import { useUi } from '../ui';

export function FavoritesScreen({ active }: { active: boolean }) {
  const { favorites } = usePrefs();
  const ui = useUi();
  const [cache, setCache] = useState<Map<number, GolfEvent | null>>(new Map());
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);

  // Récupère en parallèle les événements pas encore connus ; les 404 sont ignorés.
  useEffect(() => {
    if (!active) return;
    const missing = favorites.filter((id) => !cache.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      missing.map((id) =>
        getEvent(id)
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
  }, [active, favorites, cache, tick]);

  const events = useMemo(
    () =>
      favorites
        .map((id) => cache.get(id))
        .filter((e): e is GolfEvent => !!e)
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id),
    [favorites, cache],
  );
  const upcoming = events.filter(isUpcoming);
  const past = events.filter((e) => !isUpcoming(e)).reverse();
  const pending = favorites.some((id) => !cache.has(id));

  const renderList = (items: GolfEvent[]) => (
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

  return (
    <Screen
      title="Favoris"
      right={
        events.length > 0 ? (
          <button type="button" className="text-btn" onClick={() => setEditing((v) => !v)}>
            {editing ? 'OK' : 'Modifier'}
          </button>
        ) : undefined
      }
    >
      {favorites.length === 0 ? (
        <EmptyState
          icon="star"
          title="Aucun favori"
          text="Touchez l'étoile d'une compétition pour la retrouver ici."
        />
      ) : error && events.length === 0 ? (
        <ErrorState message={error.message} onRetry={() => setTick((t) => t + 1)} />
      ) : pending && loading && events.length === 0 ? (
        <p className="list-footnote">Chargement…</p>
      ) : events.length === 0 && !pending ? (
        <EmptyState
          icon="star"
          title="Compétitions introuvables"
          text="Vos favoris ne sont plus référencés (compétitions supprimées ou périmées)."
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <Group title="À venir" className="group-wrap--flush">
              {renderList(upcoming)}
            </Group>
          )}
          {past.length > 0 && (
            <Group title="Passées" className="group-wrap--flush">
              {renderList(past)}
            </Group>
          )}
          {error && (
            <p className="banner-error" role="alert">
              {error.message}{' '}
              <button type="button" className="text-btn" onClick={() => setTick((t) => t + 1)}>
                Réessayer
              </button>
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
