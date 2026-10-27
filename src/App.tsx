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
import { AdminHome } from './admin/AdminHome';
import { AdminPerson } from './admin/AdminPerson';
import { AdminDevice } from './admin/AdminDevice';
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
import { HighlightsList } from './practice/screens/HighlightsList';
import { setScreen, startTracking } from './track';
import { AdminTests } from './admin/AdminTests';
import { AdminThread } from './admin/AdminThread';
import { FeedbackScreen } from './feedback/FeedbackScreen';
import { refreshAccount, signOut, useAccount } from './practice/account';
import { signInDemo } from './practice/api';
import type { SplashAudience } from './components/Splash';

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
  const account = useAccount();
  // Écran d'accueil : visiteurs et compte Demo voient le message « programme testeurs ».
  const audience: SplashAudience =
    account.status === 'loading' ? 'loading' : account.status === 'in' ? (account.me.demo ? 'demo' : 'member') : 'guest';
  const feedbackUnread = account.status === 'in' ? (account.me.feedbackUnread ?? 0) : 0;

  // Parties saisies hors ligne : renvoyées au démarrage (puis au retour du réseau).
  useEffect(() => {
    void flushDrafts();
  }, []);

  // Suivi d'activité (zone admin) : écran affiché = feuille ouverte, sinon page du dessus, sinon onglet.
  useEffect(() => startTracking(), []);
  // Retour au premier plan : compte rafraîchi (pastille des réponses aux retours).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refreshAccount();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    const top = stack[stack.length - 1];
    if (splash) setScreen(audience === 'guest' || audience === 'demo' ? 'splash/guest' : 'splash');
    else if (login.open) setScreen('sheet/login');
    else if (zoneSheet.open) setScreen('sheet/zone');
    else if (top) setScreen(...routeScreen(top));
    else setScreen(`tab/${tab}`);
  }, [tab, stack, splash, login.open, zoneSheet.open, audience]);

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
        <TabBar active={tab} onChange={selectTab} favCount={favorites.length + golfFavs.length} settingsBadge={feedbackUnread} />

        {stack.map((r, i) => (
          <Page key={i}>
            {r.type === 'event' && <EventDetail id={r.id} initial={r.event} />}
            {r.type === 'golf' && <GolfDetail id={r.id} initial={r.golf} />}
            {r.type === 'admin' && <AdminScreen />}
            {r.type === 'admin-home' && <AdminHome />}
            {r.type === 'admin-person' && <AdminPerson id={r.id} />}
            {r.type === 'admin-device' && <AdminDevice id={r.id} />}
            {r.type === 'admin-tests' && <AdminTests />}
            {r.type === 'admin-thread' && <AdminThread id={r.id} />}
            {r.type === 'feedback' && <FeedbackScreen />}
            {r.type === 'session' && <SessionDetail id={r.id} />}
            {r.type === 'session-editor' && <SessionEditor kind={r.kind} session={r.session} />}
            {r.type === 'profile' && <ProfileEdit />}
            {r.type === 'stat' && <StatDetail metric={r.metric} />}
            {r.type === 'sessions' && <SessionsList kind={r.kind} />}
            {r.type === 'highlights' && <HighlightsList />}
          </Page>
        ))}

        <div className={`toast${toastMsg ? ' is-visible' : ''}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      </div>

      {splash && (
        <Splash
          runId={splash.run}
          audience={audience}
          onDone={() => setSplash(null)}
          onSignup={() => {
            selectTab('parties');
            // Depuis le compte Demo (partagé), on en sort avant de créer son propre compte.
            if (audience === 'demo') void signOut().finally(() => setLogin({ open: true }));
            else setLogin({ open: true });
          }}
          onDemo={() => {
            selectTab('parties');
            if (audience === 'demo') return;
            void signInDemo()
              .then(() => refreshAccount())
              .then(() => toast('Bienvenue sur le compte Demo'))
              .catch(() => setLogin({ open: true, demo: true }));
          }}
        />
      )}

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

/** Clé et libellé d'une page pour le suivi d'activité. */
function routeScreen(r: Route): [string, string | null] {
  switch (r.type) {
    case 'event':
      return [`event/${r.id}`, r.event?.title ?? null];
    case 'golf':
      return [`golf/${r.id}`, r.golf?.name ?? null];
    case 'session':
      return [`session/${r.id}`, null];
    case 'session-editor':
      return ['session-editor', r.session ? 'Modification' : r.kind === 'range' ? 'Nouveau practice' : r.kind === 'round' ? 'Nouvelle partie' : 'Nouvelle séance'];
    case 'stat':
      return [`stat/${r.metric}`, null];
    case 'sessions':
      return ['sessions', null];
    case 'admin-person':
      return [`admin-person/${r.id}`, null];
    case 'admin-device':
      return [`admin-device/${r.id}`, null];
    case 'admin-thread':
      return [`admin-thread/${r.id}`, null];
    default:
      return [r.type, null];
  }
}
