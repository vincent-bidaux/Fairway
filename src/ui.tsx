import { createContext, useContext } from 'react';
import type { Department, Golf, GolfEvent } from '../shared/types';
import type { ZoneMode } from './store';

export type Route =
  | { type: 'event'; id: number; event?: GolfEvent }
  | { type: 'golf'; id: number; golf?: Golf }
  | { type: 'admin' };

export interface Ui {
  push: (r: Route) => void;
  back: () => void;
  openZone: (mode?: ZoneMode, locate?: boolean) => void;
  toast: (msg: string) => void;
  departments: Department[];
}

export const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('UiContext manquant');
  return ui;
}
