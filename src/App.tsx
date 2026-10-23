import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Department } from '../shared/types';
import { getDepartments } from './api';
import { LocationSheet } from './components/LocationSheet';
import { Page } from './components/Screen';
import { TabBar, type TabId } from './components/TabBar';
import { pushLayer } from './nav';
import { usePrefs, type ZoneMode } from './store';
import { UiContext, type Route, type Ui } from './ui';
import { AdminScreen } from './screens/AdminScreen';
import { EventDetail } from './screens/EventDetail';
import { EventsScreen } from './screens/EventsScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { GolfDetail } from './screens/GolfDetail';
import { GolfsScreen } from './screens/GolfsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const { favorites } = usePrefs();
  const [tab, setTab] = useState<TabId>('events');
  const [visited, setVisited] = useState<Set<TabId>>(new Set(['events']));
  const [stack, setStack] = useState<Route[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [zoneSheet, setZoneSheet] = useState<{ open: boolean; mode?: ZoneMode; locate?: boolean }>({ open: false });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = (attempt: number) =>
      getDepartments()
        .then((d) => alive && setDepartments(d))
        .catch(() => {
          if (alive && attempt < 3) setTimeout(() => load(attempt + 1), 3000 * (attempt + 1));
        });
    void load(0);
    return () => {
      alive = false;
    };
  }, []);

  const selectTab = (t: TabId) => {
    setTab(t);
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
  };

  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r]);
    pushLayer(() => setStack((s) => s.slice(0, -1)));
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const ui = useMemo<Ui>(
    () => ({
      push,
      back: () => history.back(),
      openZone: (mode, locate) => setZoneSheet({ open: true, mode, locate }),
      toast,
      departments,
    }),
    [push, toast, departments],
  );

  const panel = (id: TabId, node: React.ReactNode) =>
    visited.has(id) ? (
      <div className="tab-pane" role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={tab !== id}>
        {node}
      </div>
    ) : null;

  return (
    <UiContext.Provider value={ui}>
      <div className="app">
        {panel('events', <EventsScreen />)}
        {panel('golfs', <GolfsScreen active={tab === 'golfs' && stack.length === 0} />)}
        {panel('favorites', <FavoritesScreen active={tab === 'favorites'} />)}
        {panel('settings', <SettingsScreen />)}
        <TabBar active={tab} onChange={selectTab} favCount={favorites.length} />

        {stack.map((r, i) => (
          <Page key={i}>
            {r.type === 'event' && <EventDetail id={r.id} initial={r.event} />}
            {r.type === 'golf' && <GolfDetail id={r.id} initial={r.golf} />}
            {r.type === 'admin' && <AdminScreen />}
          </Page>
        ))}

        <div className={`toast${toastMsg ? ' is-visible' : ''}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      </div>

      <LocationSheet
        open={zoneSheet.open}
        initialMode={zoneSheet.mode}
        autoLocate={zoneSheet.locate}
        onClose={() => setZoneSheet((z) => ({ ...z, open: false }))}
      />
    </UiContext.Provider>
  );
}
