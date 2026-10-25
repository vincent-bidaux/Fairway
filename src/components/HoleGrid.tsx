// Sélecteur de trous commun à toute l'app : 9 pastilles par ligne, les lignes paires décalées d'une
// demi-pastille (en quinconce). Une pastille de tête facultative (ex. « Parcours ») ouvre la première
// ligne, à la même hauteur et dans le même corps de texte que les trous.
import type { CSSProperties, ReactNode } from 'react';

export interface HoleGridItem {
  key: string | number;
  label: ReactNode;
  aria: string;
  /** Classe ajoutée à la pastille (ex. couleur de résultat « res-birdie »). */
  dotClass?: string;
}

const PER_ROW = 9;
/** Largeur de la pastille de tête, en demi-colonnes (2 demi-colonnes = 1 trou). */
const LEAD_HALVES = 5;

export function HoleGrid({
  items,
  current,
  onPick,
  lead,
  label = 'Trous',
  className = '',
}: {
  items: HoleGridItem[];
  /** Index sélectionné, ou null si aucun (la pastille de tête est alors sélectionnée). */
  current: number | null;
  onPick: (index: number) => void;
  lead?: { label: ReactNode; aria?: string; onPick: () => void };
  label?: string;
  className?: string;
}) {
  const rows = Math.max(1, Math.ceil(items.length / PER_ROW));
  const offset = lead ? LEAD_HALVES : 0;
  // 2 demi-colonnes par pastille, +1 pour le décalage des lignes paires
  const halves = offset + PER_ROW * 2 + (rows > 1 ? 1 : 0);
  const style = { gridTemplateColumns: `repeat(${halves}, minmax(0, 1fr))`, '--halves': halves } as CSSProperties;
  return (
    <div className={`hg ${className}`} role="tablist" aria-label={label} style={style}>
      {lead && (
        <button
          type="button"
          role="tab"
          aria-selected={current == null}
          aria-label={lead.aria}
          className={`hg-btn hg-btn--lead${current == null ? ' is-cur' : ''}`}
          style={{ gridColumn: `1 / span ${LEAD_HALVES}`, gridRow: 1 }}
          onClick={lead.onPick}
        >
          <span className="hg-dot hg-dot--lead">{lead.label}</span>
        </button>
      )}
      {items.map((it, i) => {
        const row = Math.floor(i / PER_ROW);
        const col = i % PER_ROW;
        const start = offset + col * 2 + 1 + (row % 2);
        const on = i === current;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={it.aria}
            className={`hg-btn${on ? ' is-cur' : ''}`}
            style={{ gridColumn: `${start} / span 2`, gridRow: row + 1 }}
            onClick={() => onPick(i)}
          >
            <span className={`hg-dot${it.dotClass ? ` ${it.dotClass}` : ''}`}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
