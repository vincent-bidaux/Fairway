import type { Golf } from '../../shared/types';
import { deptName } from '../lib';
import { useUi } from '../ui';

/** Badge « croix » : département (haut), trous (droite), compétitions à venir (bas), km (gauche). */
export function GolfCross({ golf, size = 56 }: { golf: Golf; size?: number }) {
  const ui = useUi();
  const km = golf.distanceKm !== undefined && !isNaN(golf.distanceKm) ? Math.round(golf.distanceKm) : null;
  const up = golf.upcomingCount ?? 0;
  const holes = golf.holes ? String(golf.holes) : '–';
  const label = [
    `${deptName(ui.departments, golf.department)} ${golf.department}`,
    golf.holes ? `${golf.holes} trous` : 'nombre de trous inconnu',
    up === 0 ? 'aucune compétition à venir' : `${up} compétition${up > 1 ? 's' : ''} à venir`,
    km !== null ? `à ${km} km` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const fs = (t: string, base: number) => (t.length >= 3 ? base - 2 : base);
  const upText = String(up);
  const kmText = km !== null ? String(km) : '·';
  return (
    <svg className="golf-cross" viewBox="0 0 56 56" width={size} height={size} role="img" aria-label={label}>
      <rect width="56" height="56" rx="12" fill="#2c2c2e" />
      {/* Short central cross; the four figures sit at the end of each arm, never on a line. */}
      <path d="M28 20V36M20 28H36" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.5" strokeLinecap="round" />
      <g textAnchor="middle" dominantBaseline="central" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <text x="28" y="11.5" fontSize={fs(golf.department, 12)} fontWeight="600" fill="#fff">
          {golf.department}
        </text>
        <text x="46" y="28.5" fontSize={fs(holes, 13)} fontWeight="800" fill="#30d158">
          {holes}
        </text>
        <text x="28" y="45" fontSize={fs(upText, 12)} fontWeight="600" fill={up === 0 ? '#8e8e93' : '#fff'}>
          {upText}
        </text>
        <text x="10.5" y="28.5" fontSize={fs(kmText, 12)} fontWeight="600" fill={km === null ? '#8e8e93' : '#fff'}>
          {kmText}
        </text>
      </g>
    </svg>
  );
}
