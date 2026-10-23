import { useMemo, useState } from 'react';
import type { Golf } from '../../shared/types';
import { getGolfs } from '../api';
import { Badge, SearchField, Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { MapView } from '../components/MapView';
import { NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState, SkeletonList } from '../components/States';
import { ZonePill } from '../components/ZonePill';
import { useAsync, useDebounced } from '../hooks';
import { deptName, formatKm, holesLabel, zoneQuery } from '../lib';
import { usePrefs } from '../store';
import { useUi } from '../ui';

type View = 'list' | 'map';

export function GolfsScreen({ active }: { active: boolean }) {
  const { zone } = usePrefs();
  const ui = useUi();
  const [view, setView] = useState<View>('list');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);

  const params = useMemo(() => ({ ...zoneQuery(zone), q: dq || undefined, limit: 500 }), [zone, dq]);
  const { data, error, loading, reload } = useAsync((s) => getGolfs(params, s), [JSON.stringify(params)]);

  const groups = useMemo(() => {
    const map = new Map<string, Golf[]>();
    for (const g of data?.items ?? []) {
      const arr = map.get(g.department);
      if (arr) arr.push(g);
      else map.set(g.department, [g]);
    }
    return [...map.entries()]
      .map(([code, golfs]) => ({ code, name: deptName(ui.departments, code), golfs }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [data, ui.departments]);

  const open = (g: Golf) => ui.push({ type: 'golf', id: g.id, golf: g });
  const isMap = view === 'map';

  const controls = (
    <div className="golfs-controls">
      <Segmented<View>
        label="Affichage"
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: 'Liste' },
          { value: 'map', label: 'Carte' },
        ]}
      />
      <SearchField value={q} onChange={setQ} placeholder="Rechercher un golf ou une ville" label="Rechercher un golf" />
    </div>
  );

  return (
    <Screen
      title="Golfs"
      large={!isMap}
      fill={isMap}
      right={<NavIconButton icon="refresh" label="Actualiser" onClick={reload} spinning={loading} />}
    >
      <ZonePill />
      {controls}
      {isMap ? (
        <div className="fill">
          {error && !data ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : (
            active && <MapView golfs={data?.items ?? []} zone={zone} onOpen={open} />
          )}
        </div>
      ) : error && !data ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonList rows={7} />
      ) : data && data.items.length === 0 ? (
        <EmptyState icon="pin" title="Aucun golf" text="Aucun golf ne correspond à cette zone ou à cette recherche.">
          <button type="button" className="btn" onClick={() => ui.openZone()}>
            Modifier la zone
          </button>
        </EmptyState>
      ) : (
        <div className={loading ? 'is-dimmed' : ''}>
          {groups.map((g) => (
            <section className="date-section" key={g.code}>
              <h3 className="section-head">
                {g.name} <span className="section-count">{g.golfs.length}</span>
              </h3>
              <div className="group">
                {g.golfs.map((golf) => {
                  const meta = [golf.city, holesLabel(golf.holes), formatKm(golf.distanceKm)].filter(Boolean).join(' · ');
                  return (
                    <button type="button" key={golf.id} className="row row--tap golf-row" onClick={() => open(golf)}>
                      <span className="row-main">
                        <span className="row-label">{golf.name}</span>
                        <span className="row-sub">{meta}</span>
                      </span>
                      {!!golf.upcomingCount && (
                        <Badge tone="green">
                          {golf.upcomingCount} compét.
                        </Badge>
                      )}
                      <Icon name="chevron" size={14} strokeWidth={2.6} className="chevron" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Screen>
  );
}
