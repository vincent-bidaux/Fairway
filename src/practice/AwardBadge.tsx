// Médaille façon Apple Fitness : argent pour un birdie, or pour un eagle, un albatros ou un trou en un.
import { useId } from 'react';
import type { HighlightKind } from '../../shared/practice';
import './highlights.css';

export const KIND_LABEL: Record<HighlightKind, string> = { birdie: 'Birdie', eagle: 'Eagle', ace: 'Trou en un', albatross: 'Albatros' };

// ink = chiffre gravé (sombre, bien contrasté sur la face) ; lit = reflet clair sous la gravure (effet de relief).
const PALETTE = {
  silver: { rim: ['#f4f6f9', '#9aa3ae', '#e7ebf0', '#7d8691'], face: ['#f3f5f8', '#c9d0d8', '#a7b0bb'], ink: ['#3f4752', '#1f252d'], lit: '#ffffff', glow: '#c7d0dc' },
  gold: { rim: ['#fff2b8', '#c8901a', '#ffe58a', '#a8700e'], face: ['#fff0b8', '#f4c451', '#d99b1c'], ink: ['#6e4304', '#3f2602'], lit: '#fff6d6', glow: '#ffd25a' },
} as const;

export function AwardBadge({ kind, size = 92 }: { kind: HighlightKind; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const tone = kind === 'birdie' ? PALETTE.silver : PALETTE.gold;
  const text = kind === 'ace' ? '1' : kind === 'eagle' ? '−2' : kind === 'birdie' ? '−1' : null;
  return (
    <svg className={`award award--${kind}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Médaille ${kind === 'birdie' ? 'd’argent' : 'd’or'} : ${KIND_LABEL[kind]}`} focusable="false">
      <defs>
        <linearGradient id={`${uid}rim`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={tone.rim[0]} />
          <stop offset="0.35" stopColor={tone.rim[1]} />
          <stop offset="0.6" stopColor={tone.rim[2]} />
          <stop offset="1" stopColor={tone.rim[3]} />
        </linearGradient>
        <linearGradient id={`${uid}face`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={tone.face[0]} />
          <stop offset="0.55" stopColor={tone.face[1]} />
          <stop offset="1" stopColor={tone.face[2]} />
        </linearGradient>
        <linearGradient id={`${uid}ink`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone.ink[0]} />
          <stop offset="1" stopColor={tone.ink[1]} />
        </linearGradient>
        <radialGradient id={`${uid}hi`} cx="0.3" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}clip`}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
        <filter id={`${uid}sh`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter={`url(#${uid}sh)`}>
        {/* rosette crantée */}
        <path
          d={Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const b = ((i + 0.5) / 24) * Math.PI * 2;
            return `${i ? 'L' : 'M'}${50 + Math.cos(a) * 47.5},${50 + Math.sin(a) * 47.5}L${50 + Math.cos(b) * 44.5},${50 + Math.sin(b) * 44.5}`;
          }).join('') + 'Z'}
          fill={`url(#${uid}rim)`}
        />
        <circle cx="50" cy="50" r="40" fill={`url(#${uid}rim)`} />
        <circle cx="50" cy="50" r="36.5" fill={`url(#${uid}face)`} />
        <circle cx="50" cy="50" r="36.5" fill="none" stroke="#000" strokeOpacity="0.14" strokeWidth="1" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="31" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="1 3" />
        <ellipse cx="38" cy="30" rx="26" ry="15" fill={`url(#${uid}hi)`} transform="rotate(-25 38 30)" />
        {/* emblème en relief */}
        {kind === 'albatross' ? (
          <g>
            <path d="M16 56 Q30 36 50 52 Q70 36 84 56 Q70 50 50 62 Q30 50 16 56Z" fill={tone.lit} fillOpacity="0.85" transform="translate(0 1.6)" />
            <path d="M16 56 Q30 36 50 52 Q70 36 84 56 Q70 50 50 62 Q30 50 16 56Z" fill={`url(#${uid}ink)`} />
            <path d="M44 62 Q50 72 56 62" fill="none" stroke={`url(#${uid}ink)`} strokeWidth="3" strokeLinecap="round" />
          </g>
        ) : (
          <g fontFamily="-apple-system, 'SF Pro Rounded', system-ui, sans-serif" fontWeight="800" textAnchor="middle">
            <text x="50" y={kind === 'ace' ? 69 : 64} fontSize={kind === 'ace' ? 60 : 38} fill={tone.lit} fillOpacity="0.85" transform="translate(0 1.6)">
              {text}
            </text>
            <text x="50" y={kind === 'ace' ? 69 : 64} fontSize={kind === 'ace' ? 60 : 38} fill={`url(#${uid}ink)`}>
              {text}
            </text>
          </g>
        )}
        {kind !== 'birdie' && kind !== 'ace' && <path d="M50 20l1.8 4.2 4.4.4-3.3 3 1 4.4-3.9-2.3-3.9 2.3 1-4.4-3.3-3 4.4-.4z" fill={`url(#${uid}ink)`} opacity="0.9" transform="translate(0 -1) scale(1)" />}
      </g>
      <g clipPath={`url(#${uid}clip)`}>
        <rect className="award-sweep" x="-60" y="0" width="45" height="100" fill={`url(#${uid}sweep)`} transform="skewX(-20)" />
      </g>
    </svg>
  );
}
