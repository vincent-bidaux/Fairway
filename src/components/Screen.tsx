import { useEffect, useState, type ReactNode, type UIEvent } from 'react';
import { useUi } from '../ui';
import { Icon } from './Icon';

interface Props {
  title: string;
  /** Large title qui se condense au scroll. */
  large?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  /** Le contenu remplit l'écran sans défiler (carte). */
  fill?: boolean;
  /** Écran racine d'onglet : affiche « ‹ Fairway » (ré-affiche le splash). */
  eyebrow?: boolean;
  children: ReactNode;
}

export function Screen({ title, large = true, left, right, fill, eyebrow, children }: Props) {
  const ui = useUi();
  const [collapsed, setCollapsed] = useState(!large);

  useEffect(() => {
    if (!large) setCollapsed(true);
  }, [large]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!large) return;
    const c = e.currentTarget.scrollTop > 28;
    setCollapsed((prev) => (prev === c ? prev : c));
  };

  const isCollapsed = collapsed || !large;

  return (
    <div className={`screen${fill ? ' screen--fill' : ''}`} onScroll={onScroll}>
      <header className={`navbar${isCollapsed ? ' is-collapsed' : ''}`}>
        <div className="navbar-inner">
          <div className="nav-side">{left}</div>
          <h2 className="nav-title" aria-hidden={!isCollapsed}>
            {title}
          </h2>
          <div className="nav-side nav-side--right">{right}</div>
        </div>
      </header>
      {large && eyebrow && (
        <button type="button" className="nav-btn nav-btn--back eyebrow" onClick={ui.showSplash} aria-label="Fairway, afficher l'écran d'accueil">
          <Icon name="chevron-left" size={22} strokeWidth={2.6} />
          <span>Fairway</span>
        </button>
      )}
      {large && <h1 className="large-title">{title}</h1>}
      {children}
    </div>
  );
}

export function BackButton({ onClick, label = 'Retour' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="nav-btn nav-btn--back" onClick={onClick} aria-label={label}>
      <Icon name="chevron-left" size={22} strokeWidth={2.6} />
      <span>{label}</span>
    </button>
  );
}

export function NavIconButton({
  icon,
  label,
  onClick,
  spinning,
  disabled,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick: () => void;
  spinning?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="nav-btn nav-btn--icon" aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={22} className={spinning ? 'spin' : undefined} />
    </button>
  );
}

/** Écran poussé par-dessus les onglets (slide latéral). */
export function Page({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}
