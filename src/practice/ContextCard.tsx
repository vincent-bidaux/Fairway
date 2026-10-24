// Humeur, forme et météo : score moyen par niveau (5 barres par dimension) et phrase de synthèse.
import type { RoundStats } from '../../shared/practice';
import { CONTEXT_TITLES, ContextBadge, contextColor, type ContextKind } from './contextIcons';
import { rel } from './statsFormat';
import './highlights.css';

type Ctx = RoundStats['context'];
const KINDS: ContextKind[] = ['mood', 'body', 'weather'];

const PHRASE: Record<ContextKind, readonly string[]> = {
  mood: ['votre humeur est très mauvaise', 'votre humeur est mauvaise', 'votre humeur est normale', 'vous êtes de bonne humeur', 'votre humeur est excellente'],
  body: ['vous êtes blessé', 'vous êtes fatigué', 'vous êtes dans votre état normal', 'vous êtes en forme', 'vous êtes en pleine forme'],
  weather: ['il fait un sale temps', 'le temps est médiocre', 'le temps est correct', 'il fait beau', 'la météo est fantastique'],
};

const withData = (ctx: Ctx, k: ContextKind) => (ctx?.[k] ?? []).filter((l) => l.rounds > 0 && l.rel18 != null);

/** Nombre de dimensions à au moins 2 niveaux renseignés. */
export const hasContext = (ctx: Ctx | undefined) => !!ctx && KINDS.some((k) => withData(ctx, k).length >= 2);

export function contextInsight(ctx: Ctx | undefined): string | null {
  if (!ctx) return null;
  let best: { gap: number; kind: ContextKind; good: number; bad: number } | null = null;
  for (const k of KINDS) {
    const l = withData(ctx, k);
    if (l.length < 2) continue;
    const good = l.reduce((a, b) => (b.rel18! < a.rel18! ? b : a));
    const bad = l.reduce((a, b) => (b.rel18! > a.rel18! ? b : a));
    const gap = bad.rel18! - good.rel18!;
    if (!best || gap > best.gap) best = { gap, kind: k, good: good.level, bad: bad.level };
  }
  if (!best || Math.round(best.gap) < 1) return null;
  const n = Math.round(best.gap);
  return `Vous jouez ${n} coup${n > 1 ? 's' : ''} de moins quand ${PHRASE[best.kind][best.good - 1]} que quand ${PHRASE[best.kind][best.bad - 1]}.`;
}

export function ContextBars({ ctx, size = 28, titles = true }: { ctx: Ctx; size?: number; titles?: boolean }) {
  const all = KINDS.flatMap((k) => ctx[k] ?? []).filter((l) => l.rel18 != null).map((l) => l.rel18!);
  const max = Math.max(1, ...all);
  return (
    <div className="ctxb">
      {KINDS.map((k) => (
        <div key={k} className="ctxb-row" role="group" aria-label={CONTEXT_TITLES[k]}>
          {titles && <span className="ctxb-title">{CONTEXT_TITLES[k]}</span>}
          <div className="ctxb-cols">
            {[1, 2, 3, 4, 5].map((level) => {
              const e = ctx[k]?.find((x) => x.level === level);
              const has = !!e && e.rounds > 0 && e.rel18 != null;
              const h = has ? Math.max(8, (Math.max(0, e!.rel18!) / max) * 54) : 4;
              return (
                <div key={level} className={`ctxb-col${has ? '' : ' is-empty'}`}>
                  <span className="ctxb-val">{has ? rel(e!.rel18!) : '—'}</span>
                  <span className="ctxb-bar" style={{ height: h, background: contextColor(k, level) }} />
                  <ContextBadge kind={k} level={level} size={size} />
                  <span className="ctxb-n">{has ? `${e!.rounds} p.` : ' '}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
