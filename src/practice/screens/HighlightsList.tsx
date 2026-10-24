// Tous les coups de maître, du plus récent au plus ancien.
import { useEffect, useState } from 'react';
import type { Highlight } from '../../../shared/practice';
import { Spinner } from '../../components/Controls';
import { BackButton, Screen } from '../../components/Screen';
import { EmptyState, ErrorState } from '../../components/States';
import { useUi } from '../../ui';
import { useDataVersion } from '../account';
import { getProfile, type Profile } from '../api';
import { HighlightCard } from '../HighlightCard';
import { highlightSummary } from '../HighlightCarousel';
import { getHighlights } from '../highlightsApi';
import '../highlights.css';
import '../practice.css';

export function HighlightsList() {
  const ui = useUi();
  const version = useDataVersion();
  const [items, setItems] = useState<Highlight[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([getHighlights(500), getProfile().catch(() => null)])
      .then(([h, p]) => {
        if (!live) return;
        setItems(h);
        setProfile(p);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [version, tick]);

  const player = { name: profile?.display_name?.trim() || 'Joueur', photo: profile?.photo ?? null };
  const back = <BackButton onClick={ui.back} />;
  const years: Array<{ year: string; list: Highlight[] }> = [];
  for (const h of items ?? []) {
    const y = h.played_at.slice(0, 4);
    let g = years[years.length - 1];
    if (!g || g.year !== y) {
      g = { year: y, list: [] };
      years.push(g);
    }
    g.list.push(h);
  }

  return (
    <Screen title="Coups de maître" left={back}>
      {error && !items ? (
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
      ) : !items ? (
        <div className="pr-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="flag" title="Pas encore de coup de maître" text="Un birdie, un eagle ou un trou en un saisi trou par trou apparaîtra ici." />
      ) : (
        <>
          <p className="hl-summary">
            <b>{items.length}</b> · {highlightSummary(items)}
          </p>
          {years.map((g) => (
            <section key={g.year}>
              {years.length > 1 && <h3 className="hl-year">{g.year}</h3>}
              <div className="hl-list">
                {g.list.map((h) => (
                  <HighlightCard key={`${h.session_id}-${h.hole}`} h={h} player={player} onOpen={() => ui.push({ type: 'session', id: h.session_id })} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </Screen>
  );
}
