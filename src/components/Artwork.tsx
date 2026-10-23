import { useId } from 'react';

/** Icône de l'app (reprend public/icons/icon.svg) en SVG inline, avec animation d'apparition facultative. */
export function Artwork({ size = 160, animate = false, className = '' }: { size?: number; animate?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bg = `bg${uid}`;
  const hill = `hill${uid}`;
  const clip = `clip${uid}`;
  const flag = `flag${uid}`;
  const sheen = `sheen${uid}`;
  const ball = `ball${uid}`;
  return (
    <svg
      className={`artwork${animate ? ' is-animated' : ''} ${className}`}
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Fairway"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3DBE63" />
          <stop offset="1" stopColor="#0F5E26" />
        </linearGradient>
        <linearGradient id={hill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38B35E" />
          <stop offset="1" stopColor="#1C8C41" />
        </linearGradient>
        <linearGradient id={flag} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E02D22" />
          <stop offset="1" stopColor="#FF4A3F" />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={ball} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#D9DEDB" />
        </radialGradient>
        <clipPath id={clip}>
          <rect width="512" height="512" rx="114" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="512" height="512" fill={`url(#${bg})`} />
        <rect width="512" height="230" fill={`url(#${sheen})`} />
        <ellipse cx="256" cy="560" rx="400" ry="190" fill={`url(#${hill})`} />
        <path d="M60 372 Q256 330 452 372" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="3" />
        <ellipse cx="256" cy="400" rx="92" ry="22" fill="#0B3F19" />
        <ellipse cx="256" cy="396" rx="92" ry="20" fill="#0E4A1E" />
        <g className="art-pole">
          <rect x="250" y="120" width="12" height="280" rx="6" fill="#fff" />
          <rect x="250" y="120" width="5" height="280" rx="2.5" fill="#000" fillOpacity="0.1" />
        </g>
        <g className="art-flag">
          <path d="M262 126 L376 174 L262 222 Z" fill={`url(#${flag})`} />
          <path d="M262 126 L376 174 L262 174 Z" fill="#fff" fillOpacity="0.14" />
        </g>
        <circle cx="256" cy="116" r="9" fill="#fff" />
        <g className="art-ball">
          <ellipse cx="342" cy="411" rx="19" ry="5" fill="#000" fillOpacity="0.22" />
          <circle cx="338" cy="388" r="20" fill={`url(#${ball})`} />
          <circle cx="331" cy="382" r="2.4" fill="#000" fillOpacity="0.08" />
          <circle cx="341" cy="379" r="2.4" fill="#000" fillOpacity="0.08" />
          <circle cx="344" cy="391" r="2.4" fill="#000" fillOpacity="0.08" />
          <circle cx="332" cy="393" r="2.4" fill="#000" fillOpacity="0.08" />
        </g>
      </g>
    </svg>
  );
}
