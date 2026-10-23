// Envoi d'e-mails transactionnels via Resend (domaine fairway.abpq.cc, région UE).
// Interface volontairement minimale pour pouvoir changer de fournisseur.
import type { Env } from './env';

const FROM = 'Fairway <code@fairway.abpq.cc>';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // En local sans clé : on affiche le mail dans la console.
    console.log(`[mail] à ${mail.to} — ${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export function otpMail(code: string): Omit<Mail, 'to'> {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `${spaced} — votre code Fairway`,
    text: `Votre code de connexion Fairway : ${code}\n\nIl est valable 10 minutes. Si vous n'avez rien demandé, ignorez ce message.`,
    html: `<!doctype html><html lang="fr"><body style="margin:0;padding:32px 16px;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1c1c1e">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:420px;background:#ffffff;border-radius:16px;padding:32px 24px" cellspacing="0" cellpadding="0"><tr><td>
<p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.08em;color:#1e8e3e">FAIRWAY</p>
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.25">Votre code de connexion</h1>
<p style="margin:0 0 24px;font-size:40px;font-weight:700;letter-spacing:.12em;font-variant-numeric:tabular-nums">${spaced}</p>
<p style="margin:0;font-size:15px;line-height:1.45;color:#3c3c43">Saisissez-le dans l'app pour retrouver vos parties. Il est valable 10&nbsp;minutes.</p>
<p style="margin:20px 0 0;font-size:13px;line-height:1.45;color:#8e8e93">Vous n'avez rien demandé&nbsp;? Ignorez simplement ce message.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
