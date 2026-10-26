// Plan réel d'un trou (OSM) quand le golf en a un : recherche golf → slug → plan.
import { useEffect, useMemo, useState } from 'react';
import type { CoursePlan, PlanHole } from '../../shared/plan';
import type { Golf } from '../../shared/types';
import { getGolfs } from '../api';
import { loadPlan } from '../plans';

let golfMap: Promise<Map<number, Pick<Golf, 'slug' | 'planLevel'>>> | null = null;
function golfSlugs() {
  if (!golfMap) {
    golfMap = getGolfs({ limit: 200 })
      .then((r) => new Map(r.items.map((g) => [g.id, { slug: g.slug, planLevel: g.planLevel }] as const)))
      .catch(() => {
        golfMap = null;
        return new Map();
      });
  }
  return golfMap;
}

export interface HolePlan {
  plan: CoursePlan;
  hole: PlanHole;
}

/** Plan complet du golf (null s'il n'en a pas, ou si ses trous ne sont pas tracés). */
export function useGolfPlan(golfId: number | null, enabled = true): CoursePlan | null {
  const [res, setRes] = useState<CoursePlan | null>(null);
  useEffect(() => {
    setRes(null);
    if (!enabled || golfId == null) return;
    let alive = true;
    golfSlugs()
      .then(async (m) => {
        const g = m.get(golfId);
        if (!g?.planLevel || g.planLevel === 'inexistant') return null;
        return loadPlan(g.slug);
      })
      .then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [golfId, enabled]);
  return res;
}

/** Plan du trou `hole` de la boucle `loop` (0 = parcours principal), ou null. */
export function useHolePlan(golfId: number | null, hole: number, enabled = true, loop = 0): HolePlan | null {
  const plan = useGolfPlan(golfId, enabled);
  return useMemo(() => {
    const h = plan?.holes.find((x) => x.loop === loop && x.ref === hole);
    return plan && h && h.line.length >= 4 ? { plan, hole: h } : null;
  }, [plan, hole, loop]);
}
