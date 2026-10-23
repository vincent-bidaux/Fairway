import { primeAudio } from './components/poc';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Department } from '../shared/types';
import { getDepartments } from './api';
import { LocationSheet } from './components/LocationSheet';
import { Page } from './components/Screen';
import { TabBar, type TabId } from './components/TabBar';
import { pushLayer } from './nav';
import { Splash } from './components/Splash';
import { useGolfFavorites, usePrefs, type ZoneMode } from './store';
import { UiContext, type Route, type Ui } from './ui';
import { AdminScreen } from './screens/AdminScreen';
import { EventDetail } from './screens/EventDetail';
import { EventsScreen } from './screens/EventsScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { GolfDetail } from './screens/GolfDetail';
import { GolfsScreen } from './screens/GolfsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { LoginSheet } from './practice/LoginSheet';
import { flushDrafts } from './practice/drafts';
import { PracticeScreen } from './practice/PracticeScreen';
import { ProfileEdit } from './practice/screens/ProfileEdit';
import { SessionDetail } from './practice/screens/SessionDetail';
import { SessionEditor } from './practice/screens/SessionEditor';
import { SessionsList } from './practice/screens/SessionsList';
import { StatDetail } from './practice/screens/StatDetail';

export function App() {
  const { favorites } = usePrefs();
  const golfFavs = useGolfFavorites();
  const [splash, setSplash] = useState<{ run: number } | null>({ run: 0 });
  const [tab, setTab] = useState<TabId>('events');
  const [visited, setVisited] = useState<Set<TabId>>(new Set(['events']));
  const [stack, setStack] = useState<Route[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [zoneSheet, setZoneSheet] = useState<{ open: boolean; mode?: ZoneMode; locate?: boolean }>({ open: false });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [login, setLogin] = useState<{ open: boolean; demo?: boolean }>({ open: false });
  const toastTimer = useRef<number | undefined>(undefined);

  // Parties saisies hors ligne : renvoyées au démarrage (puis au retour du réseau).
  useEffect(() => {
    void flushDrafts();
  }, []);

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
      showSplash: () => {
        primeAudio(); // tap = user gesture: unlocks the « poc » sound
        setSplash((s) => ({ run: (s?.run ?? 0) + 1 }));
      },
      openLogin: (demo) => setLogin({ open: true, demo }),
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
        {panel('parties', <PracticeScreen active={tab === 'parties' && stack.length === 0} />)}
        {panel('settings', <SettingsScreen />)}
        <TabBar active={tab} onChange={selectTab} favCount={favorites.length + golfFavs.length} />

        {stack.map((r, i) => (
          <Page key={i}>
            {r.type === 'event' && <EventDetail id={r.id} initial={r.event} />}
            {r.type === 'golf' && <GolfDetail id={r.id} initial={r.golf} />}
            {r.type === 'admin' && <AdminScreen />}
            {r.type === 'session' && <SessionDetail id={r.id} />}
            {r.type === 'session-editor' && <SessionEditor kind={r.kind} session={r.session} />}
            {r.type === 'profile' && <ProfileEdit />}
            {r.type === 'stat' && <StatDetail metric={r.metric} />}
            {r.type === 'sessions' && <SessionsList kind={r.kind} />}
          </Page>
        ))}

        <div className={`toast${toastMsg ? ' is-visible' : ''}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      </div>

      {splash && <Splash runId={splash.run} onDone={() => setSplash(null)} />}

      <LoginSheet open={login.open} demo={login.demo} onClose={() => setLogin({ open: false })} />

      <LocationSheet
        open={zoneSheet.open}
        initialMode={zoneSheet.mode}
        autoLocate={zoneSheet.locate}
        onClose={() => setZoneSheet((z) => ({ ...z, open: false }))}
      />
    </UiContext.Provider>
  );
}
