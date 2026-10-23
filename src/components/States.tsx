import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="group-wrap" aria-busy="true" aria-label="Chargement">
      <div className="group">
        {Array.from({ length: rows }, (_, i) => (
          <div className="cell cell--skeleton" key={i}>
            <div className="skel skel--date" />
            <div className="skel-lines">
              <div className="skel skel--line" style={{ width: `${70 - (i % 3) * 12}%` }} />
              <div className="skel skel--line skel--short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={34} />
      </div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState icon="info" title="Un souci de connexion" text={message}>
      <button type="button" className="btn" onClick={onRetry}>
        Réessayer
      </button>
    </EmptyState>
  );
}
