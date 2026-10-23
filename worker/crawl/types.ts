import type { EventType } from '../../shared/types';

/** Normalised event coming out of any parser, before it is written to D1. */
export interface ExtractedEvent {
  golfId: number;
  title: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  type: EventType;
  format: string | null;
  eligibility: string | null;
  price: string | null;
  registrationUrl: string | null;
  infoUrl: string | null;
  description: string | null;
  status: 'scheduled' | 'cancelled' | 'full';
}

export interface SourceDb {
  id: number;
  golf_id: number | null;
  kind: string;
  parser: 'llm' | 'ical';
  label: string;
  url: string;
  last_hash: string | null;
  golf_name: string | null;
  golf_city: string | null;
}

export const EVENT_TYPES: EventType[] = [
  'club', 'grand_prix', 'championnat', 'senior', 'dames', 'jeunes', 'scramble', 'sponsor', 'open', 'autre',
];

/** Keyword-based type guess, used by non-LLM parsers and as a fallback. */
export function guessType(title: string): EventType {
  const t = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/grand prix|\bgp\b/.test(t)) return 'grand_prix';
  if (/championnat|champ\.|criterium/.test(t)) return 'championnat';
  if (/senior|veteran|\bas\s?sen/.test(t)) return 'senior';
  if (/dame|ladies|feminin/.test(t)) return 'dames';
  if (/jeune|junior|u1[0-9]|ecoles? de golf|kids|benjamin|minime/.test(t)) return 'jeunes';
  if (/scramble|greensome|foursome|patsome/.test(t)) return 'scramble';
  if (/\bopen\b|pro-?am/.test(t)) return 'open';
  if (/trophee|coupe|challenge|cup\b|tour\b/.test(t)) return 'sponsor';
  return 'club';
}
