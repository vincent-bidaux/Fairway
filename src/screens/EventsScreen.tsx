import { useMemo, useState } from 'react';
import type { EventsQuery, GolfEvent } from '../../shared/types';
import { getEvents } from '../api';
import { EventsMap } from '../components/EventsMap';
import { EventCell } from '../components/EventCell';
import { FiltersSheet } from '../components/FiltersSheet';
import { Icon } from '../components/Icon';
import { NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState, SkeletonList } from '../components/States';
import { ZonePill } from '../components/ZonePill';
import { useAsync } from '../hooks';
import { getPosition, periodTo, sectionLabel, todayISO, zoneQuery } from '../lib';
import { setPrefs, toggleFavorite, usePrefs, type Period } from '../store';
import { useUi } from '../ui';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '7', label: '7 jours' },
  { value: '30', label: '30 jours' },
  { value: '90', label: '3 mois' },
  { value: 'all', label: 'Tout' },
];

function Welcome() {
  const ui = useUi();
  const [busy, setBusy] = useState(false);

  const useMyPosition = async () => {
    setBusy(true);
    try {
      const p = await getPosition();
      setPrefs({ zone: { mode: 'position', ...p, radius: 30 } });
    } catch {
      // Refus ou erreur : la sheet affiche le message détaillé.
      ui.openZone('position');
    } finally {
      setBusy(false);
    }
  };

  return (
    <EmptyState
      icon="golf"
      title="Bienvenue sur Fairway"
      text="Trouvez les compétitions de golf près de chez vous. Commencez par choisir votre zone de jeu."
    >
      <button type="button" className="btn btn--block" onClick={useMyPosition} disabled={busy}>
        <Icon name="locate" size={18} fill /> Utiliser ma position
      </button>
      <button type="button" className="btn btn--secondary btn--block" onClick={() => ui.openZone('depts')}>
        Choisir un département
      </button>
    </EmptyState>
  );
}

function groupByDate(items: GolfEvent[]): Array<[string, GolfEvent[]]> {
  const map = new Map<string, GolfEvent[]>();
  for (const e of items) {
    const arr = map.get(e.startDate);
    if (arr) arr.push(e);
    else map.set(e.startDate, [e]);
  }
  return [...map.entries()];
}

export function EventsScreen() {
  const { zone, period, types, q, favorites } = usePrefs();
  const ui = useUi();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isMap, setIsMap] = useState(false);
  const today = todayISO();

  const query = useMemo<EventsQuery>(
    () => ({
      ...zoneQuery(zone),
      from: today,
      to: periodTo(period, today),
      types: types.length ? types.join(',') : undefined,
      q: q.trim() || undefined,
      limit: 300,
    }),
    [zone, period, types, q, today],
  );

  const { data, error, loading, reload } = useAsync(
    (signal) => getEvents(query, signal),
    [JSON.stringify(query)],
    !!zone,
  );

  const activeFilters = types.length + (q.trim() ? 1 : 0);
  const groups = useMemo(() => groupByDate(data?.items ?? []), [data]);

  const filterRow = (
    <div className="filter-row">
      <button
        type="button"
        className={`chip chip--filters${activeFilters ? ' is-active' : ''}`}
        onClick={() => setFiltersOpen(true)}
      >
        <Icon name="filter" size={16} />
        Filtres
        {activeFilters > 0 && <span className="chip-count">{activeFilters}</span>}
      </button>
      <div className="chips" role="group" aria-label="Période">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`chip${period === p.value ? ' is-active' : ''}`}
            aria-pressed={period === p.value}
            onClick={() => setPrefs({ period: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );

  const mapButton = (
    <button
      type="button"
      className="round-btn"
      onClick={() => setIsMap((v) => !v)}
      aria-label={isMap ? 'Afficher la liste' : 'Afficher la carte'}
      aria-pressed={isMap}
    >
      <Icon name={isMap ? 'list' : 'map'} size={22} />
    </button>
  );

  const mapMode = isMap && !!zone;

  return (
    <Screen
      title="Compétitions"
      eyebrow
      large={!mapMode}
      fill={mapMode}
      right={zone ? <NavIconButton icon="refresh" label="Actualiser" onClick={reload} spinning={loading} /> : undefined}
    >
      {!zone ? (
        <Welcome />
      ) : (
        <>
          <ZonePill extra={mapButton} />
          {filterRow}

          {mapMode ? (
            <div className="fill">
              {error && !data ? (
                <ErrorState message={error.message} onRetry={reload} />
              ) : (
                <EventsMap
                  events={data?.items ?? []}
                  zone={zone}
                  onOpenGolf={(id) => ui.push({ type: 'golf', id })}
                />
              )}
            </div>
          ) : error && !data ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : loading && !data ? (
            <SkeletonList />
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon="flag"
              title="Aucune compétition"
              text={
                <>
                  Aucune compétition dans cette zone.{' '}
                  {zone.mode === 'depts' ? 'Ajoutez des départements.' : 'Élargissez le rayon.'}
                  {activeFilters > 0 && ' Vous pouvez aussi retirer des filtres.'}
                </>
              }
            >
              <button type="button" className="btn" onClick={() => ui.openZone()}>
                Modifier la zone
              </button>
            </EmptyState>
          ) : (
            <div className={loading ? 'is-dimmed' : ''}>
              {error && (
                <p className="banner-error" role="alert">
                  {error.message}{' '}
                  <button type="button" className="text-btn" onClick={reload}>
                    Réessayer
                  </button>
                </p>
              )}
              {groups.map(([date, items]) => (
                <section className="date-section" key={date}>
                  <h3 className="section-head">{sectionLabel(date)}</h3>
                  <div className="group">
                    {items.map((e) => (
                      <EventCell
                        key={e.id}
                        event={e}
                        favorite={favorites.includes(e.id)}
                        onToggleFav={() => toggleFavorite(e.id)}
                        onOpen={() => ui.push({ type: 'event', id: e.id, event: e })}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {data && data.total > data.items.length && (
                <p className="list-footnote">
                  {data.items.length} compétitions affichées sur {data.total}. Affinez la période ou la zone.
                </p>
              )}
            </div>
          )}
        </>
      )}
      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </Screen>
  );
}
