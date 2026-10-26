import { createContext, useContext } from 'react';
import type { Department, Golf, GolfEvent } from '../shared/types';
import type { ZoneMode } from './store';
import type { PlaySession, SessionKind } from '../shared/practice';

export type Route =
  | { type: 'event'; id: number; event?: GolfEvent }
  | { type: 'golf'; id: number; golf?: Golf }
  | { type: 'admin' }
  // « Mes parties »
  | { type: 'session'; id: string }
  | { type: 'session-editor'; kind?: SessionKind; session?: PlaySession }
  | { type: 'profile' }
  | { type: 'stat'; metric: StatMetric }
  | { type: 'sessions'; kind?: SessionKind }
  | { type: 'highlights' };

export type StatMetric = 'score' | 'distribution' | 'byPar' | 'fairways' | 'gir' | 'putts' | 'upDown' | 'penalties' | 'index' | 'practice' | 'drills' | 'context' | 'clubs';

export interface Ui {
  push: (r: Route) => void;
  back: () => void;
  openZone: (mode?: ZoneMode, locate?: boolean) => void;
  toast: (msg: string) => void;
  showSplash: () => void;
  /** Feuille de connexion (onglet Mes parties, Réglages). demo = connexion directe au compte de démo. */
  openLogin: (demo?: boolean) => void;
  departments: Department[];
}

export const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('UiContext manquant');
  return ui;
}
