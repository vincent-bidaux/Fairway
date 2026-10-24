import { useEffect, useState } from 'react';
import type { CoursePlan } from '../shared/plan';
import type { Golf } from '../shared/types';

const cache = new Map<string, Promise<CoursePlan | null>>();

/** Plan du parcours (GET /api/plans/:slug). Renvoie null si le golf n'en a pas. */
export function loadPlan(slug: string): Promise<CoursePlan | null> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`/api/plans/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        const plan = (await r.json()) as CoursePlan;
        return plan && plan.v === 1 ? plan : null;
      })
      .catch(() => {
        cache.delete(slug);
        return null;
      });
    cache.set(slug, p);
  }
  return p;
}

/** `known` : le golf annonce un plan (champ planLevel), on peut réserver sa place avant le chargement. */
export function usePlan(golf: Pick<Golf, 'slug' | 'planLevel'> | undefined) {
  const slug = golf?.slug;
  const known = Boolean(golf?.planLevel);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(known);
  useEffect(() => {
    setPlan(null);
    if (!slug || !known) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadPlan(slug).then((p) => {
      if (!alive) return;
      setPlan(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [slug, known]);
  return { plan, loading, known };
}
