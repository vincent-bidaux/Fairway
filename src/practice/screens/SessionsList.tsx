// Toutes les séances, groupées par mois.
import { useEffect, useMemo, useState } from 'react';
import type { PlaySession, SessionKind } from '../../../shared/practice';
import { Segmented, Spinner } from '../../components/Controls';
import { BackButton, NavIconButton, Screen } from '../../components/Screen';
import { EmptyState, ErrorState } from '../../components/States';
import { useUi } from '../../ui';
import { useDataVersion } from '../account';
import { listSessions } from '../api';
import { SessionCell } from '../SessionCell';
import { monthLabel } from '../statsFormat';
import '../practice.css';

type Filter = 'all' | SessionKind;

export function SessionsList({ kind }: { kind?: SessionKind }) {
  const ui = useUi();
  const version = useDataVersion();
  const [filter, setFilter] = useState<Filter>(kind ?? 'all');
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
    const out: Array<{ key: string; label: string; items: PlaySession[] }> = [];
    for (const s of sessions ?? []) {
      if (filter !== 'all' && s.kind !== filter) continue;
      const key = s.played_at.slice(0, 7);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: monthLabel(s.played_at), items: [] };
        out.push(g);
      }
      g.items.push(s);
    }
    return out;
  }, [sessions, filter]);

  const left = <BackButton onClick={ui.back} />;
  const right = <NavIconButton icon="plus" label="Nouvelle séance" onClick={() => ui.push({ type: 'session-editor', kind: filter === 'all' ? undefined : filter })} />;

  return (
    <Screen title="Séances" left={left} right={right}>
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
