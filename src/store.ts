import { useSyncExternalStore } from 'react';
import type { DepartmentCode, EventType } from '../shared/types';

export type ZoneMode = 'position' | 'city' | 'depts';
export type Period = '7' | '30' | '90' | 'all';

export type Zone =
  | { mode: 'position'; lat: number; lng: number; radius: number }
  | { mode: 'city'; name: string; postcode: string | null; lat: number; lng: number; radius: number }
  | { mode: 'depts'; depts: DepartmentCode[] };

export interface Prefs {
  zone: Zone | null;
  lastRadius: number;
  favorites: number[];
  adminToken: string;
  period: Period;
  types: EventType[];
  /** Recherche texte (non mémorisée). */
  q: string;
}

const KEY = 'fairway:prefs:v1';

const defaults: Prefs = {
  zone: null,
  lastRadius: 30,
  favorites: [],
  adminToken: '',
  period: '90',
  types: [],
  q: '',
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...defaults,
      ...p,
      favorites: Array.isArray(p.favorites) ? p.favorites.filter((n) => typeof n === 'number') : [],
      types: Array.isArray(p.types) ? p.types : [],
      q: '',
    };
  } catch {
    return { ...defaults };
  }
}

let state: Prefs = load();
const listeners = new Set<() => void>();

function save() {
  try {
    const { q: _q, ...rest } = state;
    void _q;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* stockage indisponible : on continue en mémoire */
  }
}

export function setPrefs(patch: Partial<Prefs>): void {
  state = { ...state, ...patch };
  save();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => state);
}

export function toggleFavorite(id: number): boolean {
  const has = state.favorites.includes(id);
  setPrefs({ favorites: has ? state.favorites.filter((f) => f !== id) : [...state.favorites, id] });
  return !has;
}
