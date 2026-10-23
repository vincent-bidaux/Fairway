import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface SegProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
}

export function SearchField({ value, onChange, placeholder = 'Rechercher', label, autoFocus }: SearchProps) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" aria-label="Effacer" onClick={() => onChange('')}>
          <Icon name="close" size={12} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={`spinner${small ? ' spinner--sm' : ''}`} role="status" aria-label="Chargement" />;
}

export function Badge({ children, tone = 'gray', className = '' }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`badge badge--${tone} ${className}`}>{children}</span>;
}

/** Groupe "inset grouped" avec titre et pied optionnels. */
export function Group({
  title,
  footer,
  children,
  className = '',
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`group-wrap ${className}`}>
      {title && <h3 className="group-title">{title}</h3>}
      <div className="group">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  iconColor?: string;
  label: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  sub?: ReactNode;
}

/** Ligne de liste groupée : lien, bouton ou statique. */
export function Row({ icon, iconColor, label, value, href, onClick, chevron, destructive, disabled, sub }: RowProps) {
  const inner = (
    <>
      {icon && (
        <span className="row-icon" style={iconColor ? { background: iconColor } : undefined}>
          {icon}
        </span>
      )}
      <span className="row-main">
        <span className={`row-label${destructive ? ' is-destructive' : ''}`}>{label}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {chevron && <Icon name="chevron" size={14} strokeWidth={2.6} className="chevron" />}
    </>
  );
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <a
        className="row row--tap"
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="row row--tap" onClick={onClick} disabled={disabled}>
        {inner}
      </button>
    );
  }
  return <div className="row">{inner}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="row field">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}
