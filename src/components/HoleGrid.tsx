// Sélecteur de trous commun à toute l'app : 9 pastilles par ligne, les lignes paires décalées d'une
// demi-pastille (en quinconce), comme sur une carte de score repliée.
import type { ReactNode } from 'react';

export interface HoleGridItem {
  key: string | number;
  label: ReactNode;
  aria: string;
  /** Classe ajoutée à la pastille (ex. couleur de résultat « res-birdie »). */
  dotClass?: string;
}

const PER_ROW = 9;

export function HoleGrid({
  items,
  current,
  onPick,
  label = 'Trous',
  className = '',
}: {
  items: HoleGridItem[];
  /** Index sélectionné, ou null si aucun. */
  current: number | null;
  onPick: (index: number) => void;
  label?: string;
  className?: string;
}) {
  const rows = Math.ceil(items.length / PER_ROW);
  // 2 demi-colonnes par pastille, +1 demi-colonne pour le décalage des lignes paires
  const halves = PER_ROW * 2 + (rows > 1 ? 1 : 0);
  return (
    <div className={`hg ${className}`} role="tablist" aria-label={label} style={{ gridTemplateColumns: `repeat(${halves}, minmax(0, 1fr))` }}>
      {items.map((it, i) => {
        const row = Math.floor(i / PER_ROW);
        const col = i % PER_ROW;
        const start = col * 2 + 1 + (row % 2);
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
