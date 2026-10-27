// État du compte (connecté ou non), partagé par l'onglet « Mes parties » et les Réglages.
import { useSyncExternalStore } from 'react';
import { ApiError } from '../api';
import { getMe, signInDemo, signOut as apiSignOut, type Me } from './api';

export type AccountState = { status: 'loading' } | { status: 'out' } | { status: 'in'; me: Me } | { status: 'offline' };

let state: AccountState = { status: 'loading' };
const listeners = new Set<() => void>();
/** Incrémenté à chaque changement de données (séance enregistrée, supprimée…) : les écrans rechargent. */
let dataVersion = 0;

function emit() {
  listeners.forEach((l) => l());
}

/** Démo connectée d'office : un visiteur sans compte arrive sur le compte Demo (une tentative par déconnexion). */
let demoTried = false;

export async function refreshAccount(): Promise<AccountState> {
  try {
    state = { status: 'in', me: await getMe() };
  } catch (e) {
    const out = e instanceof ApiError && e.status === 401;
    if (out && !demoTried) {
      demoTried = true;
      try {
        await signInDemo();
        state = { status: 'in', me: await getMe() };
      } catch {
        state = { status: 'out' };
      }
    } else {
      state = out ? { status: 'out' } : { status: 'offline' };
    }
  }
  dataVersion++;
  emit();
  return state;
}

/** Déconnexion : on retombe sur le compte Demo. */
export async function signOut() {
  try {
    await apiSignOut();
  } finally {
    state = { status: 'out' };
    demoTried = false;
    dataVersion++;
    emit();
    void refreshAccount();
  }
}

/** À appeler après toute écriture (séance, profil) pour rafraîchir tableau de bord et listes. */
export function touchData() {
  dataVersion++;
  emit();
  void refreshAccount();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => state);
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => dataVersion);
}

if (typeof window !== 'undefined') void refreshAccount();
