import type { Golf } from '../../shared/types';
import { deptName } from '../lib';
import { useUi } from '../ui';

/**
 * Golf badge (takes the place of the date tile in golf lists):
 *   line 1 — department (white) and number of holes (green), centred together
 *   thin horizontal rule
 *   line 2 — number of upcoming competitions
 */
export function GolfCross({ golf, size = 56 }: { golf: Golf; size?: number }) {
  const ui = useUi();
  const up = golf.upcomingCount ?? 0;
  const holes = golf.holes ? String(golf.holes) : '–';
  const label = [
    `${deptName(ui.departments, golf.department)} (${golf.department})`,
    golf.holes ? `${golf.holes} trous` : 'nombre de trous inconnu',
    up === 0 ? 'aucune compétition à venir' : `${up} compétition${up > 1 ? 's' : ''} à venir`,
  ].join(', ');

  return (
    <svg className="golf-cross" viewBox="0 0 56 56" width={size} height={size} role="img" aria-label={label}>
      <rect width="56" height="56" rx="12" fill="#2c2c2e" />
      <g
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font, -apple-system, system-ui, sans-serif)' }}
      >
        <text x="28" y="19" fontSize="13" letterSpacing="-0.2">
          <tspan fill="#fff" fontWeight="600">
            {golf.department}
          </tspan>
          <tspan fill="#30d158" fontWeight="800" dx="5">
            {holes}
          </tspan>
        </text>
        <line x1="13" y1="28" x2="43" y2="28" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.25" strokeLinecap="round" />
        <text x="28" y="38.5" fontSize="14" fontWeight="700" fill={up === 0 ? '#8e8e93' : '#fff'}>
          {up}
        </text>
      </g>
    </svg>
  );
}
