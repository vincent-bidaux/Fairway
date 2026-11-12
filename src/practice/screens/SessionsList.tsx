// Toutes les séances : groupées par mois (récentes ou anciennes d'abord) ou par golf. golfId : seulement ce golf.
import { useEffect, useMemo, useState } from 'react';
import type { PlaySession, SessionKind } from '../../../shared/practice';
import { Segmented, Spinner } from '../../components/Controls';
import { BackButton, NavIconButton, Screen } from '../../components/Screen';
import { EmptyState, ErrorState } from '../../components/States';
import { useUi } from '../../ui';
import { useDataVersion } from '../account';
import { listSessions } from '../api';
import { SessionCell } from '../SessionCell';
import { monthLabel, sessionPlace } from '../statsFormat';
import '../practice.css';

type Filter = 'all' | SessionKind;
type Order = 'desc' | 'asc' | 'golf';
const ORDER_KEY = 'fairway:sessions-order';
const readOrder = (): Order => {
  try {
    const v = localStorage.getItem(ORDER_KEY);
    return v === 'asc' || v === 'golf' ? v : 'desc';
  } catch {
    return 'desc';
  }
};
const golfKey = (s: PlaySession) => (s.golf_id != null ? `g${s.golf_id}` : `p${(s.place ?? '').trim().toLowerCase()}`);

export function SessionsList({ kind, golfId, golfName }: { kind?: SessionKind; golfId?: number; golfName?: string }) {
  const ui = useUi();
  const version = useDataVersion();
  const [filter, setFilter] = useState<Filter>(kind ?? 'all');
  const [order, setOrderState] = useState<Order>(() => (golfId ? 'desc' : readOrder()));
  const setOrder = (o: Order) => {
    setOrderState(o);
    try {
      localStorage.setItem(ORDER_KEY, o);
    } catch {
      /* rien */
    }
  };
  const [sessions, setSessions] = useState<PlaySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    listSessions()
      .then((l) => {
        if (!live) return;
        setSessions(l);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [version, tick]);

  const groups = useMemo(() => {
    const list = (sessions ?? []).filter((s) => (filter === 'all' || s.kind === filter) && (golfId == null || s.golf_id === golfId));
    // L'API renvoie les plus récentes d'abord.
    const sorted = order === 'asc' ? [...list].reverse() : list;
    const out: Array<{ key: string; label: string; items: PlaySession[] }> = [];
    if (order === 'golf') {
      // Un groupe par golf, le golf joué le plus récemment en haut.
      const byKey = new Map<string, { key: string; label: string; items: PlaySession[] }>();
      for (const s of sorted) {
        const key = golfKey(s);
        let g = byKey.get(key);
        if (!g) {
          g = { key, label: sessionPlace(s), items: [] };
          byKey.set(key, g);
          out.push(g);
        }
        g.items.push(s);
      }
      return out;
    }
    for (const s of sorted) {
      const key = s.played_at.slice(0, 7);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: monthLabel(s.played_at), items: [] };
        out.push(g);
      }
      g.items.push(s);
    }
    return out;
  }, [sessions, filter, order, golfId]);

  const left = <BackButton onClick={ui.back} />;
  const right = <NavIconButton icon="plus" label="Nouvelle séance" onClick={() => ui.push({ type: 'session-editor', kind: filter === 'all' ? undefined : filter })} />;

  return (
    <Screen title={golfName ?? 'Séances'} left={left} right={right}>
      <div className="sl-seg">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          label="Type de séance"
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'round', label: 'Parties' },
            { value: 'range', label: 'Practice' },
          ]}
        />
        <Segmented<Order>
          value={order}
          onChange={setOrder}
          label="Ordre"
          options={[
            { value: 'desc', label: 'Récentes' },
            { value: 'asc', label: 'Anciennes' },
            ...(golfId == null ? [{ value: 'golf' as const, label: 'Par golf' }] : []),
          ]}
        />
      </div>
      {error && !sessions ? (
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
      ) : !sessions ? (
        <div className="pr-center">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon="flag" title={filter === 'range' ? 'Aucune séance de practice' : filter === 'round' ? 'Aucune partie' : 'Aucune séance'} text="Touchez + pour en enregistrer une." />
      ) : (
        groups.map((g) => (
          <section className="date-section" key={g.key}>
            <h3 className="section-head">
              {g.label}
              <span className="section-count">{g.items.length}</span>
            </h3>
            <div className="group">
              {g.items.map((s) => (
                <SessionCell key={s.id} s={s} onOpen={() => ui.push({ type: 'session', id: s.id })} />
              ))}
            </div>
          </section>
        ))
      )}
    </Screen>
  );
}
