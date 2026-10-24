// Carte « Coup de maître » : médaille, récap, contexte, trou stylisé avec la trajectoire des coups.
import { girOf, type Fairway, type Highlight, type HighlightKind } from '../../shared/practice';
import { ContextBadge } from './contextIcons';
import { AwardBadge, KIND_LABEL } from './AwardBadge';
import { TrophyGlyph } from './glyphs';
import { HoleDiagram } from './HoleDiagram';
import { useHolePlan } from './holePlan';
import { golfLabel, initials, rel } from './statsFormat';
import './highlights.css';

const dLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const FW_LABEL: Record<Fairway, string> = { hit: 'Touché', left: 'À gauche', right: 'À droite', short: 'Court' };

export const highlightDate = (playedAt: string) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(playedAt);
  return m ? dLong.format(new Date(+m[1], +m[2] - 1, +m[3], 12)) : playedAt;
};

export function highlightTitle(h: Pick<Highlight, 'kind' | 'hole'>): string {
  return h.kind === 'ace' ? `Trou en un au ${h.hole}` : `${KIND_LABEL[h.kind]} au trou ${h.hole}`;
}

/** Phrase de récap générée à partir des données du trou. */
export function highlightRecap(h: Highlight): string {
  if (h.kind === 'ace') return `Trou en un sur le par ${h.par} !`;
  const parts: string[] = [];
  if (h.par > 3 && h.fairway) parts.push(h.fairway === 'hit' ? 'fairway touché' : h.fairway === 'short' ? 'départ court' : `fairway manqué à ${h.fairway === 'left' ? 'gauche' : 'droite'}`);
  const gir = girOf({ gir: h.gir, strokes: h.strokes, putts: h.putts, par: h.par });
  if (gir === 1) parts.push('green en régulation');
  if (h.putts === 0) parts.push('holé sans putt');
  else if (h.putts === 1) parts.push('un seul putt');
  else if (h.putts != null) parts.push(`${h.putts} putts`);
  const base = `${h.strokes} coups sur un par ${h.par}`;
  return parts.length ? `${base} : ${parts.join(', ')}.` : `${base}.`;
}

export function roundContext(h: Highlight): string | null {
  if (!h.round_strokes) return null;
  return `Partie terminée en ${h.round_strokes} (${rel(h.round_rel, 0)})${h.holes === 9 ? ' sur 9 trous' : ''}`;
}

export interface CardPlayer {
  name: string;
  photo: string | null;
}

export function HighlightCard({ h, player, onOpen, interactive = true }: { h: Highlight; player: CardPlayer; onOpen?: () => void; interactive?: boolean }) {
  const real = useHolePlan(h.course === '' ? h.golf_id : null, h.hole);
  const title = highlightTitle(h);
  const recap = highlightRecap(h);
  const ctx = roundContext(h);
  const golf = golfLabel(h.golf_name, 'Autre lieu');
  const gir = girOf({ gir: h.gir, strokes: h.strokes, putts: h.putts, par: h.par });
  const tone = h.kind === 'birdie' ? 'silver' : 'gold';
  const summary = `${title}, ${highlightDate(h.played_at)}, ${golf}${h.golf_city ? `, ${h.golf_city}` : ''}${h.event_title ? `, ${h.event_title}` : ''}. ${recap}`;
  const chips: Array<[string, string]> = [
    ['Par', String(h.par)],
    ...(h.stroke_index ? ([['Index', String(h.stroke_index)]] as Array<[string, string]>) : []),
    ['Score', String(h.strokes)],
    ...(h.putts != null ? ([['Putts', String(h.putts)]] as Array<[string, string]>) : []),
    ...(h.par > 3 && h.fairway ? ([['Fairway', FW_LABEL[h.fairway]]] as Array<[string, string]>) : []),
    ...(gir != null ? ([['Green', gir ? 'En régul.' : 'Manqué']] as Array<[string, string]>) : []),
  ];
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag type={interactive ? 'button' : undefined} className={`hl hl--${tone}`} onClick={interactive ? onOpen : undefined} aria-label={interactive ? summary : undefined} aria-hidden={interactive ? undefined : true}>
      <span className="hl-head">
        <span className="hl-badge">
          <AwardBadge kind={h.kind as HighlightKind} size={78} />
          <span className="hl-kind">{KIND_LABEL[h.kind]}</span>
        </span>
        <span className="hl-titles">
          <span className="hl-title">{title}</span>
          <span className="hl-date">{highlightDate(h.played_at)}</span>
          <span className="hl-golf">
            {golf}
            {h.golf_city ? <span>{h.golf_city}</span> : null}
          </span>
        </span>
      </span>

      {h.event_title && (
        <span className="hl-meta">
          <span className="hl-event">
            <TrophyGlyph size={14} />
            <span>{h.event_title}</span>
          </span>
        </span>
      )}
      {h.weather != null && (
        <span className="hl-weather">
          <ContextBadge kind="weather" level={h.weather} size={28} />
        </span>
      )}

      <span className="hl-recap">{recap}</span>
      {ctx && <span className="hl-round">{ctx}</span>}

      <span className="hl-diagram">
        <HoleDiagram
          seed={(h.golf_id ?? 0) * 100 + h.hole}
          par={h.par}
          strokes={h.strokes}
          putts={h.putts}
          fairway={h.fairway}
          ace={h.kind === 'ace'}
          real={real}
          label={`Schéma du trou ${h.hole}, par ${h.par}, ${h.strokes} coup${h.strokes > 1 ? 's' : ''}`}
        />
      </span>
      <span className="hl-chips">
        {chips.map(([k, v]) => (
          <span key={k} className="hl-chip">
            <small>{k}</small>
            <b>{v}</b>
          </span>
        ))}
      </span>

      <span className="hl-foot">
        <span className="hl-avatar">{player.photo ? <img src={player.photo} alt="" /> : initials(player.name)}</span>
        <span className="hl-player">{player.name}</span>
      </span>
    </Tag>
  );
}
