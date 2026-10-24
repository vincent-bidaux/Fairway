// Petits pictogrammes maison (coupe, oiseau).
export function TrophyGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5a2 2 0 0 0 0 4H7M17 6h2.5a2 2 0 0 1 0 4H17" />
      <path d="M12 14v4M8.5 20h7" />
    </svg>
  );
}
