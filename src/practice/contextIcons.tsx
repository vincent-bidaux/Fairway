// Humeur, forme physique et météo : 5 niveaux chacun (3 = normal / OK).
// Pictogrammes vectoriels blancs, tracés simples, posés sur une pastille de couleur (style iOS).
import type { ReactNode } from 'react';
import { BODY_LABELS, MOOD_LABELS, WEATHER_LABELS } from '../../shared/practice';
import './contextIcons.css';

export type ContextKind = 'mood' | 'body' | 'weather';

export const CONTEXT_TITLES: Record<ContextKind, string> = { mood: 'Humeur', body: 'Forme physique', weather: 'Météo' };
export const CONTEXT_LABELS: Record<ContextKind, readonly string[]> = { mood: MOOD_LABELS, body: BODY_LABELS, weather: WEATHER_LABELS };

/** Couleur de pastille par niveau (variables iOS : s'adaptent au mode sombre). */
const COLORS: Record<ContextKind, string[]> = {
  mood: ['var(--red)', 'var(--orange)', 'var(--gray)', 'var(--teal)', 'var(--tint)'],
  body: ['var(--red)', 'var(--orange)', 'var(--gray)', 'var(--teal)', 'var(--tint)'],
  weather: ['var(--indigo)', 'var(--blue)', 'var(--gray)', 'var(--cyan)', 'var(--sun, #f5b400)'],
};

export function contextColor(kind: ContextKind, level: number): string {
  return COLORS[kind][Math.min(Math.max(level, 1), 5) - 1];
}

// ---------------------------------------------------------------- tracés (viewBox 24×24)
const face = (mouth: ReactNode, extra?: ReactNode) => (
  <>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="9.2" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="10" r="0.9" fill="currentColor" stroke="none" />
    {mouth}
    {extra}
  </>
);

const battery = (bars: number) => (
  <>
    <rect x="4" y="8" width="14.5" height="8" rx="2" />
    <path d="M20.5 10.7v2.6" />
    {Array.from({ length: bars }, (_, i) => (
      <rect key={i} x={6 + i * 3.4} y="10" width="2.2" height="4" rx="0.6" fill="currentColor" stroke="none" />
    ))}
  </>
);

const cloudPath = 'M7.5 17.5h9a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.3 3 3 0 0 0 .2 5.9z';

const GLYPHS: Record<ContextKind, ReactNode[]> = {
  mood: [
    face(<path d="M8.6 16.4c1.9-2.3 4.9-2.3 6.8 0" />, <path d="M7.6 7.4l2.6 1.2M16.4 7.4l-2.6 1.2" />),
    face(<path d="M9 15.6c1.7-1.3 4.3-1.3 6 0" />),
    face(<path d="M9 14.8h6" />),
    face(<path d="M8.8 13.9c1.8 1.9 4.6 1.9 6.4 0" />),
    face(<path d="M8 13.2h8a4 4 0 0 1-8 0z" fill="currentColor" />),
  ],
  body: [
    // Blessé : pansement en croix
    <>
      <rect x="3.2" y="9" width="17.6" height="6" rx="3" transform="rotate(-45 12 12)" />
      <rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(-45 12 12)" />
      <circle cx="11" cy="11" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="0.55" fill="currentColor" stroke="none" />
    </>,
    battery(1),
    battery(2),
    battery(3),
    // Fantastique : éclair
    <path d="M13.2 3.5L6.5 13.2h5l-1 7.3 7-10h-5.2z" fill="currentColor" strokeLinejoin="round" />,
  ],
  weather: [
    // Sale temps : nuage d'orage
    <>
      <path d="M7.5 14.5h9a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.3 3 3 0 0 0 .2 5.9z" />
      <path d="M12.6 15.2l-2 3.3h2.6l-1.6 2.8" />
    </>,
    // Médiocre : pluie
    <>
      <path d="M7.5 14.5h9a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.3 3 3 0 0 0 .2 5.9z" />
      <path d="M9 17l-.8 2M12.5 17l-.8 2M16 17l-.8 2" />
    </>,
    // OK : nuage
    <path d={cloudPath} />,
    // Beau : soleil voilé
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M9 3.6v1.2M3.6 9h1.2M5.2 5.2l.85.85M12.8 5.2l-.85.85M5.2 12.8l.85-.85" />
      <path d="M10 19h7.2a3 3 0 0 0 .3-6 4.1 4.1 0 0 0-7.8 1.1 2.5 2.5 0 0 0 .3 4.9z" />
    </>,
    // Fantastique : grand soleil
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
    </>,
  ],
};

/** Pictogramme seul (blanc par défaut). */
export function ContextGlyph({ kind, level, size = 24 }: { kind: ContextKind; level: number; size?: number }) {
  const l = Math.min(Math.max(Math.round(level), 1), 5);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size >= 28 ? 1.9 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="ctx-glyph"
    >
      {GLYPHS[kind][l - 1]}
    </svg>
  );
}

/** Pastille de couleur + pictogramme blanc. `mono` : pas de pastille, pictogramme couleur du texte (noir en clair, blanc en sombre). */
export function ContextBadge({ kind, level, size = 36, label, mono = false }: { kind: ContextKind; level: number; size?: number; label?: boolean; mono?: boolean }) {
  const text = CONTEXT_LABELS[kind][Math.min(Math.max(level, 1), 5) - 1];
  return (
    <span className="ctx-badge-wrap">
      <span
        className={`ctx-badge${mono ? ' ctx-badge--mono' : ''}`}
        style={mono ? { width: size, height: size } : { width: size, height: size, background: contextColor(kind, level) }}
        role="img"
        aria-label={`${CONTEXT_TITLES[kind]} : ${text}`}
      >
        <ContextGlyph kind={kind} level={level} size={Math.round(size * 0.66)} />
      </span>
      {label && <span className="ctx-badge-label">{text}</span>}
    </span>
  );
}

/** Sélecteur à 5 pastilles (une seule sélection, re-toucher pour effacer). */
export function ContextPicker({ kind, value, onChange }: { kind: ContextKind; value: number | null; onChange: (v: number | null) => void }) {
  const labels = CONTEXT_LABELS[kind];
  return (
    <div className="ctx-picker">
      <div className="ctx-picker-head">
        <span className="ctx-picker-title">{CONTEXT_TITLES[kind]}</span>
        <span className="ctx-picker-value">{value ? labels[value - 1] : 'Non renseigné'}</span>
      </div>
      <div className="ctx-picker-row" role="radiogroup" aria-label={CONTEXT_TITLES[kind]}>
        {labels.map((label, i) => {
          const level = i + 1;
          const on = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              className={`ctx-option${on ? ' is-on' : ''}${value && !on ? ' is-dim' : ''}`}
              style={{ ['--ctx' as string]: contextColor(kind, level) }}
              onClick={() => {
                navigator.vibrate?.(8);
                onChange(on ? null : level);
              }}
            >
              <ContextGlyph kind={kind} level={level} size={32} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
