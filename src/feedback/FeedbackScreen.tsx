// Réglages › Retours : le testeur écrit à Vincent et lit ses réponses (un seul fil de conversation).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackKind, FeedbackMessage } from '../../shared/feedback';
import { ApiError } from '../api';
import { Spinner } from '../components/Controls';
import { BackButton, Screen } from '../components/Screen';
import { ErrorState } from '../components/States';
import { refreshAccount, useAccount } from '../practice/account';
import { useUi } from '../ui';
import { getMyFeedback, markMyFeedbackRead, sendFeedback } from './api';
import { Composer } from './Composer';
import { scrollScreenToEnd, Thread } from './Thread';
import './feedback.css';

const POLL_MS = 30_000;

function Intro() {
  return (
    <section className="fb-card">
      <h2 className="fb-card-title">Programme testeurs</h2>
      <p>
        Fairway est en développement. Dites-nous ce que vous aimez, ce que vous utilisez, ce que vous aimez moins ou n’utilisez pas, et posez vos
        questions : Vincent vous répond ici.
      </p>
      <p>À l’issue des tests, les testeurs actifs auront un compte gratuit à vie (hors coûts IA s’il y en a).</p>
    </section>
  );
}

export function FeedbackScreen() {
  const ui = useUi();
  const account = useAccount();
  const signedIn = account.status === 'in' && !account.me.demo;
  const demo = account.status === 'in' && account.me.demo;

  const [messages, setMessages] = useState<FeedbackMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<FeedbackMessage[] | null>(null);
  const sendVersion = useRef(0);
  const toEnd = useRef<'jump' | 'smooth' | null>('jump');

  const set = useCallback((list: FeedbackMessage[]) => {
    msgsRef.current = list;
    setMessages(list);
  }, []);

  const load = useCallback(async () => {
    const version = sendVersion.current;
    try {
      const r = await getMyFeedback();
      if (version !== sendVersion.current) return; // un envoi a eu lieu entre-temps : cette réponse est périmée
      const prev = msgsRef.current;
      if (!prev || prev.length !== r.messages.length || prev[prev.length - 1]?.id !== r.messages[r.messages.length - 1]?.id) {
        const el = wrap.current?.closest<HTMLElement>('.screen');
        const nearEnd = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        if (!prev || nearEnd) toEnd.current = prev ? 'smooth' : 'jump';
      }
      set(r.messages);
      setError(null);
      if (r.unread > 0 && document.visibilityState === 'visible') {
        try {
          await markMyFeedbackRead();
          void refreshAccount();
        } catch {
          /* réessayé au prochain passage */
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else if (!msgsRef.current) setError((e as Error).message);
    }
  }, [set]);

  // Chargement initial, puis rafraîchissement toutes les 30 s tant que l'écran est visible.
  useEffect(() => {
    if (!signedIn) return;
    void load();
    const tick = () => document.visibilityState === 'visible' && void load();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [signedIn, load]);

  useEffect(() => {
    if (!messages || !toEnd.current) return;
    const smooth = toEnd.current === 'smooth';
    toEnd.current = null;
    requestAnimationFrame(() => scrollScreenToEnd(wrap.current, smooth));
  }, [messages]);

  const onSend = async (kind: FeedbackKind | null, body: string) => {
    if (!kind) throw new Error('Choisissez une catégorie.');
    const m = await sendFeedback({ kind, body, screen: 'feedback' });
    sendVersion.current++;
    const prev = msgsRef.current ?? [];
    toEnd.current = 'smooth';
    set(prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    ui.toast('Merci, retour envoyé');
  };

  const left = <BackButton onClick={ui.back} />;
  const login = (
    <button type="button" className="btn btn--block" onClick={() => ui.openLogin()}>
      Créer un compte ou se connecter
    </button>
  );

  let body;
  if (account.status === 'loading') {
    body = (
      <div className="fb-center">
        <Spinner />
      </div>
    );
  } else if (account.status === 'out' || account.status === 'offline') {
    body = (
      <section className="fb-card fb-card--action">
        <p>
          {account.status === 'out'
            ? 'Pour envoyer vos retours et recevoir les réponses de Vincent, créez votre compte gratuit ou connectez-vous.'
            : 'Connexion indisponible pour le moment. Connectez-vous pour envoyer vos retours et recevoir les réponses de Vincent.'}
        </p>
        {login}
        {account.status === 'offline' && (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void refreshAccount()}>
            Réessayer
          </button>
        )}
      </section>
    );
  } else if (demo || forbidden) {
    body = (
      <section className="fb-card fb-card--action">
        <p>Le compte de démo est partagé entre tous les visiteurs : créez votre compte pour envoyer vos retours et recevoir les réponses.</p>
        {login}
      </section>
    );
  } else if (error && !messages) {
    body = <ErrorState message={error} onRetry={() => void load()} />;
  } else if (!messages) {
    body = (
      <div className="fb-center">
        <Spinner />
      </div>
    );
  } else {
    body = (
      <>
        {messages.length === 0 ? (
          <div className="fb-empty">Aucun retour pour l’instant. Le premier est le bienvenu !</div>
        ) : (
          <Thread messages={messages} viewer="user" />
        )}
        <Composer mode="user" onSend={onSend} />
      </>
    );
  }

  return (
    <Screen title="Retours" large={false} left={left}>
      <div className="fb-wrap" ref={wrap}>
        <Intro />
        {body}
      </div>
    </Screen>
  );
}
