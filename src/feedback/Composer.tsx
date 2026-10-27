// Zone de saisie du bas : catégories (testeur), champ qui grandit, bouton d'envoi rond.
import { useLayoutEffect, useRef, useState } from 'react';
import { FEEDBACK_KINDS, FEEDBACK_MAX, type FeedbackKind } from '../../shared/feedback';
import './feedback.css';

interface Props {
  mode: 'user' | 'admin';
  /** Rejette en cas d'échec : le texte est alors conservé et le message d'erreur affiché. */
  onSend: (kind: FeedbackKind | null, body: string) => Promise<void>;
  disabled?: boolean;
}

const MAX_H = 6 * 22 + 16; // ~6 lignes + padding

export function Composer({ mode, onSend, disabled }: Props) {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const user = mode === 'user';

  // Hauteur du champ : suit le contenu jusqu'à ~6 lignes.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_H)}px`;
  }, [text]);

  const body = text.trim();
  const needsKind = user && kind === null;
  const canSend = !!body && !needsKind && !busy && !disabled;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(user ? kind : null, body);
      setText('');
    } catch (e) {
      setError((e as Error).message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fb-composer">
      {user && (
        <div className="fb-kinds" role="radiogroup" aria-label="Catégorie du retour">
          {FEEDBACK_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              className={`fb-kind${kind === k.id ? ' is-on' : ''}`}
              style={{ ['--c' as string]: k.color }}
              disabled={busy || disabled}
              onClick={() => setKind(kind === k.id ? null : k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="fb-error" role="alert">
          {error}
        </p>
      )}
      {needsKind && <p className="fb-hint">Choisissez une catégorie</p>}
      <div className="fb-inputrow">
        <textarea
          ref={area}
          className="fb-input"
          rows={1}
          value={text}
          maxLength={FEEDBACK_MAX}
          placeholder={user ? 'Votre retour…' : 'Votre réponse…'}
          aria-label={user ? 'Votre retour' : 'Votre réponse'}
          enterKeyHint="enter"
          disabled={busy || disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="fb-send" aria-label="Envoyer" disabled={!canSend} onClick={() => void send()}>
          {busy ? (
            <span className="fb-send-spin" role="status" aria-label="Envoi en cours" />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19.5V5" />
              <path d="M5.5 11.5L12 5l6.5 6.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
