import { useSyncExternalStore } from 'react';
import type { DepartmentCode, EventType } from '../shared/types';

export type ZoneMode = 'position' | 'city' | 'depts';
export type Period = '7' | '30' | '90' | 'all';

export type Zone =
  | { mode: 'position'; lat: number; lng: number; radius: number }
  | { mode: 'city'; name: string; postcode: string | null; lat: number; lng: number; radius: number }
  | { mode: 'depts'; depts: DepartmentCode[] };

export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  /** Apparence : suit le système par défaut. */
  theme: Theme;
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
  theme: 'system',
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
      theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
      favorites: Array.isArray(p.favorites) ? p.favorites.filter((n) => typeof n === 'number') : [],
      types: Array.isArray(p.types) ? p.types : [],
      q: '',
    };
  } catch {
    return { ...defaults };
  }
}

let state: Prefs = load();

const THEME_COLOR = { light: '#F2F2F7', dark: '#000000' };
/** Pose `data-theme` sur <html> (absent = système) et accorde la couleur de la barre du navigateur. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (theme === 'system') delete el.dataset.theme;
  else el.dataset.theme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const sys = (m.media || '').includes('dark') ? 'dark' : 'light';
    m.content = THEME_COLOR[theme === 'system' ? sys : theme];
  });
}
applyTheme(state.theme);
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
  const themeChanged = patch.theme != null && patch.theme !== state.theme;
  state = { ...state, ...patch };
  save();
  if (themeChanged) applyTheme(state.theme);
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

// --- Golfs favoris ----------------------------------------------------------

const GOLF_KEY = 'fairway:golf-favorites:v1';

function loadGolfFavs(): number[] {
  try {
    const raw = localStorage.getItem(GOLF_KEY);
    const p = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(p) ? p.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

let golfFavs: number[] = loadGolfFavs();
const golfListeners = new Set<() => void>();

export function toggleGolfFavorite(id: number): boolean {
  const has = golfFavs.includes(id);
  golfFavs = has ? golfFavs.filter((f) => f !== id) : [...golfFavs, id];
  try {
    localStorage.setItem(GOLF_KEY, JSON.stringify(golfFavs));
  } catch {
    /* stockage indisponible : on continue en mémoire */
  }
  golfListeners.forEach((l) => l());
  return !has;
}

export function useGolfFavorites(): number[] {
  return useSyncExternalStore(
    (l) => {
      golfListeners.add(l);
      return () => golfListeners.delete(l);
    },
    () => golfFavs,
  );
}
