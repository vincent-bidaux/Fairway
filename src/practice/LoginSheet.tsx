import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Spinner } from '../components/Controls';
import { useUi } from '../ui';
import { refreshAccount } from './account';
import { sendCode, signInDemo, verifyCode } from './api';
import './login.css';

type Step = 'email' | 'code';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Connexion / création de compte : e-mail puis code à 6 chiffres. Lien discret vers le compte de démo. */
export function LoginSheet({ open, onClose, demo = false }: { open: boolean; onClose: () => void; demo?: boolean }) {
  const ui = useUi();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep('email');
    setCode('');
    setError(null);
    if (demo) void enterDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const done = async (msg: string) => {
    await refreshAccount();
    onClose();
    ui.toast(msg);
  };

  const askCode = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      setError('Saisissez une adresse e-mail valide.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendCode(e);
      setEmail(e);
      setStep('code');
      setResendIn(30);
      setTimeout(() => codeRef.current?.focus(), 350);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, value);
      await done('Vous êtes connecté');
    } catch (err) {
      setError((err as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  async function enterDemo() {
    setBusy(true);
    setError(null);
    try {
      await signInDemo();
      await done('Compte de démo ouvert');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={step === 'email' ? 'Mon compte Fairway' : 'Code de connexion'}>
      <div className="sheet-pad login">
        {step === 'email' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askCode();
            }}
          >
            <p className="login-lead">
              Saisissez votre adresse e-mail. Nous vous envoyons un code à 6 chiffres : pas de mot de passe à retenir. Si vous n’avez pas encore de compte, il est créé automatiquement.
            </p>
            <input
              className="login-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="vous@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Adresse e-mail"
            />
            {error && <p className="hint hint--error">{error}</p>}
            <button type="submit" className="btn btn--block login-cta" disabled={busy || !email.trim()}>
              {busy ? <Spinner small /> : 'Recevoir un code'}
            </button>
            <button type="button" className="login-link" onClick={() => void enterDemo()} disabled={busy}>
              Essayer avec le compte de démo
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            <p className="login-lead">
              Code envoyé à <strong>{email}</strong>. Il est valable 10 minutes.
            </p>
            <input
              ref={codeRef}
              className="login-input login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6) void submitCode(v);
              }}
              aria-label="Code à 6 chiffres"
            />
            {error && <p className="hint hint--error">{error}</p>}
            <button type="submit" className="btn btn--block login-cta" disabled={busy || code.length !== 6}>
              {busy ? <Spinner small /> : 'Se connecter'}
            </button>
            <div className="login-row">
              <button type="button" className="login-link" onClick={() => setStep('email')} disabled={busy}>
                Changer d’adresse
              </button>
              <button type="button" className="login-link" onClick={() => void askCode()} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? `Renvoyer (${resendIn} s)` : 'Renvoyer le code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}
