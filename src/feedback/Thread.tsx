// Conversation façon iMessage : bulles à droite pour celui qui regarde, à gauche pour l'autre.
import { Fragment } from 'react';
import { FEEDBACK_KINDS, type FeedbackMessage } from '../../shared/feedback';
import './feedback.css';
import { deviceLabel } from '../admin/labels';

interface Props {
  messages: FeedbackMessage[];
  /** Qui regarde : ses messages sont à droite. */
  viewer: 'user' | 'admin';
  adminName?: string;
  userName?: string;
}

const DAY = 86400e3;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Fait défiler l'écran (conteneur .screen) tout en bas, là où se trouve le composeur. */
export function scrollScreenToEnd(from: HTMLElement | null, smooth = false) {
  const screen = from?.closest<HTMLElement>('.screen');
  if (!screen) return;
  screen.scrollTo({ top: screen.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

export function Thread({ messages, viewer, adminName = 'Vincent · Fairway', userName }: Props) {
  // Dernière réponse de l'admin (pour la marque « Lu » côté admin).
  let lastAdminId = -1;
  for (const m of messages) if (m.author === 'admin') lastAdminId = m.id;

  return (
    <div className="fb-thread" role="log" aria-label="Conversation">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
        const own = m.author === viewer;
        const sameRun = !newDay && prev && prev.author === m.author;
        const sender = own ? null : m.author === 'admin' ? adminName : userName;
        const kind = m.author === 'user' && m.kind ? FEEDBACK_KINDS.find((k) => k.id === m.kind) : undefined;
        const ctx =
          viewer === 'admin' && m.author === 'user' && m.context
            ? [m.context.screen === 'feedback' ? 'Réglages › Retours' : m.context.screen, m.context.ua ? deviceLabel(m.context.ua) : null, m.context.app]
                .filter(Boolean)
                .join(' · ')
            : '';
        const seen = viewer === 'admin' && m.id === lastAdminId && !!m.readAt;
        return (
          <Fragment key={m.id}>
            {newDay && <div className="fb-day">{dayLabel(m.createdAt)}</div>}
            <div className={`fb-msg ${own ? 'fb-msg--own' : 'fb-msg--other'}${sameRun ? ' is-run' : ''}`}>
              {sender && !sameRun && <div className="fb-sender">{sender}</div>}
              <div className="fb-bubble">
                {kind && (
                  <span className="fb-chip" style={{ ['--c' as string]: kind.color }}>
                    <span className="fb-chip-dot" aria-hidden="true" />
                    {kind.label}
                  </span>
                )}
                <span className="fb-text">{m.body}</span>
              </div>
              <div className="fb-meta">
                {timeLabel(m.createdAt)}
                {seen && <span className="fb-seen"> · Lu</span>}
              </div>
              {ctx && <div className="fb-ctx">{ctx}</div>}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
