import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '../styles.css';
import { UiContext, type Route, type Ui } from '../ui';
import { Page } from '../components/Screen';
import { getDepartments } from '../api';
import { pushLayer } from '../nav';
import { SessionEditor } from './screens/SessionEditor';
import { SessionDetail } from './screens/SessionDetail';

function H() {
  const [stack, setStack] = useState<Route[]>(() => {
    const h = location.hash.slice(1);
    if (h.startsWith('detail=')) return [{ type: 'session', id: h.slice(7) }];
    return [{ type: 'session-editor', kind: h === 'range' ? 'range' : 'round' }];
  });
  const [deps, setDeps] = useState<any[]>([]);
  const [toastMsg, setToast] = useState('');
  useEffect(() => { pushLayer(() => setStack((s) => s.slice(0, -1))); }, []);
  useEffect(() => { getDepartments().then(setDeps).catch(() => {}); }, []);
  const push = useCallback((r: Route) => { setStack((s) => [...s, r]); pushLayer(() => setStack((s) => s.slice(0, -1))); }, []);
  const ui = useMemo<Ui>(() => ({ push, back: () => history.back(), openZone() {}, toast: (m) => { setToast(m); setTimeout(() => setToast(''), 2200); }, showSplash() {}, openLogin() {}, departments: deps }), [push, deps]);
  return (
    <UiContext.Provider value={ui}>
      <div className="app">
        <div className="screen" style={{ padding: 40 }}>racine</div>
        {stack.map((r, i) => (
          <Page key={i}>
            {r.type === 'session' && <SessionDetail id={r.id} />}
            {r.type === 'session-editor' && <SessionEditor kind={r.kind} session={r.session} />}
          </Page>
        ))}
        <div className={`toast${toastMsg ? ' is-visible' : ''}`}>{toastMsg}</div>
      </div>
    </UiContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<H />);
