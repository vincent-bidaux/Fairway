import type { ReactNode } from 'react';
import { Sheet } from '../components/Sheet';

/** Confirmation en feuille du bas, style iOS (action destructive en rouge + Annuler). */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} right={<span />}>
      <div className="sheet-pad">
        {message && <p className="confirm-msg">{message}</p>}
        <div className="confirm-actions">
          <button
            type="button"
            className={`btn btn--block${destructive ? ' btn--danger' : ''}`}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn btn--block btn--secondary" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </Sheet>
  );
}
