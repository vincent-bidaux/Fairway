// Conversation de l'admin avec un testeur : ses retours, les réponses de Vincent (le testeur est prévenu par e-mail).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackMessage } from '../../shared/feedback';
import { Spinner } from '../components/Controls';
import { BackButton, Screen } from '../components/Screen';
import { ErrorState } from '../components/States';
import { Composer } from '../feedback/Composer';
import { getPersonFeedback, markPersonFeedbackRead, replyToPerson } from '../feedback/api';
import { scrollScreenToEnd, Thread } from '../feedback/Thread';
import { useUi } from '../ui';
import { getPerson } from './api';
import '../feedback/feedback.css';
import './admin.css';

const POLL_MS = 30_000;

export function AdminThread({ id }: { id: string }) {
  const ui = useUi();
  const [messages, setMessages] = useState<FeedbackMessage[] | null>(null);
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<FeedbackMessage[] | null>(null);
  const sendVersion = useRef(0);
  const toEnd = useRef<'jump' | 'smooth' | null>('jump');

  const set = useCallback((list: FeedbackMessage[]) => {
    msgsRef.current = list;
    setMessages(list);
  }, []);

  const refresh = useCallback(async () => {
    const version = sendVersion.current;
    const list = await getPersonFeedback(id);
    if (version !== sendVersion.current) return;
    const prev = msgsRef.current;
    if (!prev || prev.length !== list.length || prev[prev.length - 1]?.id !== list[list.length - 1]?.id) {
      const el = wrap.current?.closest<HTMLElement>('.screen');
      const nearEnd = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (!prev || nearEnd) toEnd.current = prev ? 'smooth' : 'jump';
    }
    set(list);
    if (list.some((m) => m.author === 'user' && !m.readAt)) {
      try {
        await markPersonFeedbackRead(id);
      } catch {
        /* réessayé au prochain passage */
      }
    }
  }, [id, set]);

  // Chargement : fil et fiche en parallèle.
  useEffect(() => {
    let live = true;
    msgsRef.current = null;
    setMessages(null);
    setError(null);
    toEnd.current = 'jump';
    Promise.all([
      refresh(),
      getPerson(id).then((d) => {
        if (live) setWho({ name: d.person.displayName || d.person.name || d.person.email, email: d.person.email });
      }),
    ]).catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, tick, refresh]);

  // Rafraîchissement toutes les 30 s tant que l'écran est visible.
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && msgsRef.current && void refresh().catch(() => undefined);
    const timer = setInterval(run, POLL_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [refresh]);

  useEffect(() => {
    if (!messages || !toEnd.current) return;
    const smooth = toEnd.current === 'smooth';
    toEnd.current = null;
    requestAnimationFrame(() => scrollScreenToEnd(wrap.current, smooth));
  }, [messages]);

  const onSend = async (_kind: unknown, body: string) => {
    const m = await replyToPerson(id, body);
    sendVersion.current++;
    const prev = msgsRef.current ?? [];
    toEnd.current = 'smooth';
    set(prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    ui.toast('Réponse envoyée');
  };

  const title = who?.name ?? 'Conversation';
  const left = <BackButton onClick={ui.back} />;

  if (error && !messages) {
    return (
      <Screen title={title} large={false} left={left}>
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
      </Screen>
    );
  }

  return (
    <Screen title={title} large={false} left={left}>
      <div className="fb-wrap" ref={wrap}>
        <div className="fb-person">
          <div className="fb-person-main">
            <span className="fb-person-email">{who?.email ?? ' '}</span>
            <span className="fb-person-hint">Le testeur reçoit un e-mail à chaque réponse.</span>
          </div>
          <button type="button" className="text-btn" onClick={() => ui.push({ type: 'admin-person', id })}>
            Fiche
          </button>
        </div>
        {!messages ? (
          <div className="fb-center">
            <Spinner />
          </div>
        ) : (
          <>
            {messages.length === 0 ? (
              <div className="fb-empty">Aucun retour de ce testeur pour l’instant.</div>
            ) : (
              <Thread messages={messages} viewer="admin" userName={who?.name} />
            )}
            <Composer mode="admin" onSend={onSend} />
          </>
        )}
      </div>
    </Screen>
  );
}
