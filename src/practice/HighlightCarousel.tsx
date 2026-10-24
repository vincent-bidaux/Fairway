import { useRef, useState } from 'react';
import type { Highlight } from '../../shared/practice';
import { Icon } from '../components/Icon';
import { HighlightCard, type CardPlayer } from './HighlightCard';
import { plural } from './statsFormat';
import './highlights.css';

/** « 1 trou en un · 2 eagles · 8 birdies » */
export function highlightSummary(list: Highlight[]): string {
  const n = (k: Highlight['kind']) => list.filter((h) => h.kind === k).length;
  const parts: string[] = [];
  if (n('ace')) parts.push(plural(n('ace'), 'trou en un', 'trous en un'));
  if (n('albatross')) parts.push(plural(n('albatross'), 'albatros', 'albatros'));
  if (n('eagle')) parts.push(plural(n('eagle'), 'eagle'));
  if (n('birdie')) parts.push(plural(n('birdie'), 'birdie'));
  return parts.join(' · ');
}

export function HighlightCarousel({
  items,
  player,
  onOpen,
  onAll,
  interactive = true,
}: {
  items: Highlight[];
  player: CardPlayer;
  onOpen: (id: string) => void;
  onAll: () => void;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const onScroll = () => {
    const el = ref.current;
    if (!el || items.length < 2) return;
    const slide = el.children[0] as HTMLElement;
    const step = slide.offsetWidth + 12;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
    setIdx((p) => (p === i ? p : i));
  };
  const dots = Math.min(items.length, 7);
  const active = items.length <= 7 ? idx : Math.min(dots - 1, Math.floor((idx * dots) / items.length));
  return (
    <section className="hl-section" aria-label="Coups de maître">
      <div className="hl-section-head">
        <h3>Coups de maître</h3>
        <span>{highlightSummary(items)}</span>
      </div>
      <div className="hl-carousel" ref={ref} onScroll={onScroll} tabIndex={interactive ? 0 : -1}>
        {items.map((h) => (
          <div className="hl-slide" key={`${h.session_id}-${h.hole}`}>
            <HighlightCard h={h} player={player} interactive={interactive} onOpen={() => onOpen(h.session_id)} />
          </div>
        ))}
      </div>
      {dots > 1 && (
        <div className="hl-dots" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => (
            <i key={i} className={`hl-dot${i === active ? ' is-active' : ''}`} />
          ))}
        </div>
      )}
      {interactive && (
        <button type="button" className="hl-all" onClick={onAll}>
          Voir tous les coups de maître
          <Icon name="chevron" size={13} strokeWidth={2.8} />
        </button>
      )}
    </section>
  );
}
