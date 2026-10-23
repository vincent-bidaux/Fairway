// Brouillons de séance sur l'appareil : saisie hors ligne, resynchronisée dès que possible.
import type { PlaySession } from '../../shared/practice';
import { saveSession } from './api';

const PREFIX = 'fairway:draft:';

export interface Draft {
  session: PlaySession;
  /** Modifications pas encore envoyées au serveur. */
  dirty: boolean;
  /** Jours : horodatage de la dernière modification locale. */
  at: number;
  /** Cases de pénalités touchées (0 explicite) — jamais envoyé au serveur. */
  penTouched?: number[];
}

export function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(id: string, d: Draft): void {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify(d));
  } catch {
    /* stockage plein ou indisponible */
  }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* rien */
  }
}

export function listDrafts(): Array<{ id: string; draft: Draft }> {
  const out: Array<{ id: string; draft: Draft }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      const d = readDraft(id);
      if (d) out.push({ id, draft: d });
    }
  } catch {
    /* rien */
  }
  return out;
}

/** Envoie les brouillons modifiés hors ligne ; supprime les brouillons déjà synchronisés depuis plus de 24 h. */
export async function flushDrafts(): Promise<number> {
  let sent = 0;
  for (const { id, draft } of listDrafts()) {
    if (draft.dirty) {
      try {
        await saveSession(draft.session);
        writeDraft(id, { ...draft, dirty: false });
        sent++;
      } catch {
        /* toujours hors ligne : on réessaiera */
      }
    } else if (Date.now() - draft.at > 24 * 3600 * 1000) {
      clearDraft(id);
    }
  }
  return sent;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushDrafts());
}
