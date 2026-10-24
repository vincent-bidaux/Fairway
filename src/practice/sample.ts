// Données fictives pour l'aperçu grisé (utilisateur non connecté). Aucune n'est réelle.
import type { Highlight, PlaySession, RoundStats, StatsResponse } from '../../shared/practice';
import type { Profile } from './api';

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const rels = [27, 25, 24, 26, 22, 23, 21, 22, 19, 20, 18, 17];
const rounds: RoundStats = {
  count: rels.length,
  holesPlayed: rels.length * 18,
  rel18: 20.4,
  best: { id: 's0', rel: 17, strokes: 89, holes: 18, date: iso(12), golf: 'Golf de Démonstration' },
  series: rels.map((r, i) => ({ id: `s${i}`, date: iso((rels.length - i) * 14), rel18: r, strokes: 72 + r, holes: 18, putts18: 34 - Math.round(i / 3), firPct: 40 + ((i * 7) % 20), girPct: 10 + ((i * 5) % 18), pen18: 3 - (i % 3), udPct: 15 + ((i * 6) % 20) })),
  dist: { eagle: 1, birdie: 11, par: 62, bogey: 88, double: 41, triple: 14, albatross: 0, ace: 0 },
  byPar: { 3: 0.9, 4: 1.2, 5: 1.1 },
  context: {
    mood: [26, 23, 21, 19, 17].map((r, i) => ({ level: i + 1, rounds: 2 + i, rel18: r })),
    body: [27, 23, 21, 20, 18].map((r, i) => ({ level: i + 1, rounds: 1 + i, rel18: r })),
    weather: [25, 22, 21, 19, 19].map((r, i) => ({ level: i + 1, rounds: 3, rel18: r })),
  },
  fairways: { n: 160, hit: 78, left: 34, right: 42, short: 6, pct: 49 },
  gir: { n: 216, hit: 46, pct: 21 },
  putts: { per18: 32.1, threePuttPct: 12, perGir: 1.9, n: 216 },
  upDown: { n: 170, made: 36, pct: 21 },
  penalties: { per18: 1.8 },
};

const weekly = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (11 - i) * 7);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return {
    week: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    minutes: [0, 60, 45, 0, 90, 60, 0, 75, 60, 90, 45, 60][i],
    balls: [0, 70, 50, 0, 100, 70, 0, 80, 70, 100, 50, 70][i],
  };
});

export const sampleStats: StatsResponse = {
  period: '6m',
  from: iso(180),
  to: iso(0),
  rounds,
  prevRounds: { ...rounds, rel18: 23.1, fairways: { ...rounds.fairways, pct: 44 }, gir: { ...rounds.gir, pct: 17 }, upDown: { ...rounds.upDown, pct: 18 }, putts: { ...rounds.putts, per18: 33.4, threePuttPct: 16 }, penalties: { per18: 2.4 } },
  range: {
    count: 8,
    minutes: 485,
    balls: 590,
    weekly,
    drills: [
      { label: 'Putts à 1 m', category: 'putting', distance_m: 1, points: [{ date: iso(60), rate: 80, attempts: 10 }, { date: iso(30), rate: 90, attempts: 10 }] },
      { label: 'Putts à 2 m', category: 'putting', distance_m: 2, points: [{ date: iso(60), rate: 50, attempts: 10 }, { date: iso(30), rate: 60, attempts: 10 }] },
      { label: 'Putts à 4 m', category: 'putting', distance_m: 4, points: [{ date: iso(60), rate: 20, attempts: 10 }, { date: iso(30), rate: 30, attempts: 10 }] },
    ],
  },
  prevRange: null,
};

export const sampleProfile: Profile = {
  display_name: 'Camille Martin',
  photo: null,
  home_golf_id: null,
  home_golf_name: 'Golf de Démonstration',
  home_golf_city: 'La Rochelle',
  city: 'La Rochelle',
  birth_year: 1974,
  handedness: 'right',
  licence: null,
  started_year: 2023,
  index_history: [
    { as_of: iso(300), hcp_index: 28.4 },
    { as_of: iso(240), hcp_index: 26.9 },
    { as_of: iso(180), hcp_index: 25.1 },
    { as_of: iso(120), hcp_index: 23.8 },
    { as_of: iso(60), hcp_index: 22.2 },
    { as_of: iso(10), hcp_index: 20.6 },
  ],
};

const base = { golf_id: null, course: '', place: null, start_hole: 1, tee: null, focus: null, feeling: null, notes: null, event_id: null, event_title: null, mood: 3, body: 3, weather: 4 } as const;
export const sampleSessions: PlaySession[] = [
  { ...base, id: 'a1', kind: 'round', golf_name: 'Golf de Démonstration', golf_city: 'La Rochelle', played_at: `${iso(5)}T09:30:00`, holes: 18, duration_min: null, balls: null, summary: { strokes: 91, par: 72, played: 18, putts: 32 } },
  { ...base, id: 'a2', kind: 'range', golf_name: 'Golf de Démonstration', golf_city: 'La Rochelle', played_at: `${iso(9)}T17:00:00`, holes: null, duration_min: 60, balls: 70 },
  { ...base, id: 'a3', kind: 'round', golf_name: 'Golf des Pins', golf_city: 'Royan', played_at: `${iso(19)}T10:00:00`, holes: 9, duration_min: null, balls: null, summary: { strokes: 47, par: 36, played: 9, putts: 16 } },
];

export const sampleHighlights: Highlight[] = [
  { session_id: 'h1', hole: 7, par: 4, strokes: 3, putts: 1, fairway: 'hit', gir: 1, stroke_index: 5, kind: 'birdie', played_at: `${iso(12)}T10:00:00`, golf_id: 0, golf_name: 'Golf de Démonstration', golf_city: 'La Rochelle', course: '', event_title: 'Trophée des Vendanges', holes: 18, round_strokes: 91, round_rel: 19, weather: 4 },
];
