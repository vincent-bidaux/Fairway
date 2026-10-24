// Plan réel d'un trou (OSM) quand le golf en a un : recherche golf → slug → plan.
import { useEffect, useState } from 'react';
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

/** Plan du trou `hole` (parcours principal) du golf, ou null. */
export function useHolePlan(golfId: number | null, hole: number, enabled = true): HolePlan | null {
  const [res, setRes] = useState<HolePlan | null>(null);
  useEffect(() => {
    if (!enabled || golfId == null) return;
    let alive = true;
    golfSlugs()
      .then(async (m) => {
        const g = m.get(golfId);
        if (!g?.planLevel || g.planLevel === 'inexistant') return null;
        const plan = await loadPlan(g.slug);
        const h = plan?.holes.find((x) => x.loop === 0 && x.ref === hole);
        return plan && h && h.line.length >= 4 ? { plan, hole: h } : null;
      })
      .then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [golfId, hole, enabled]);
  return res;
}
