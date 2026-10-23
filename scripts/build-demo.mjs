// Génère les séances du compte de démo « Demo » : db/seed/demo-sessions.json
// Tirage reproductible (graine fixe). Relancer : node scripts/build-demo.mjs
//
// Profil : joueur qui démarre autour de +28 sur 18 trous (avril 2025) et finit vers +19
// (octobre 2026). Moins de pénalités, putting qui progresse, slice qui se corrige.
// Les 3 premières parties ne notent que score et putts (il ne suivait pas encore les fairways).

import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const PARS = JSON.parse(readFileSync(new URL('db/seed/demo-pars.json', root), 'utf8'));

// ---------------------------------------------------------------- aléatoire reproductible
let seed = 20261023;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (weights) => {
  const tot = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rnd() * tot;
  for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
  return Object.keys(weights).at(-1);
};
const lerp = (a, b, t) => a + (b - a) * t;
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (rnd() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

// ---------------------------------------------------------------- calendrier (30 séances)
// [date, heure, slug, type, trous, note]
const LA_PREE = 'golf-de-la-pree-la-rochelle-marsilly';
const LR_SUD = 'golf-la-rochelle-sud-la-jarne';
const ROCHEFORT = 'golf-bluegreen-rochefort-ocean-saint-laurent-de-la-pree';
const OLERON = 'golf-club-d-oleron-saint-pierre-d-oleron';
const TROUSSE = 'golf-de-trousse-chemise-les-portes-en-re';

const PLAN = [
  ['2025-04-12', '09:40', LA_PREE, 'round', 18, 'Première partie notée. Beaucoup de balles à droite.'],
  ['2025-04-27', '10:15', LR_SUD, 'round', 9, null],
  ['2025-05-10', '18:00', LA_PREE, 'range', null, null],
  ['2025-05-24', '08:50', ROCHEFORT, 'round', 18, 'Vent fort sur le retour.'],
  ['2025-06-07', '09:30', 'golf-de-saintes-fontcouverte', 'round', 18, null],
  ['2025-06-21', '19:00', LR_SUD, 'range', null, null],
  ['2025-07-05', '08:30', LA_PREE, 'round', 18, null],
  ['2025-07-19', '09:00', TROUSSE, 'round', 9, 'Vacances sur l’île de Ré.'],
  ['2025-07-26', '17:30', TROUSSE, 'round', 9, null],
  ['2025-08-09', '08:45', 'la-palmyre-golf-resort-la-palmyre', 'round', 9, 'Pins et sable partout.'],
  ['2025-08-23', '09:10', 'golf-de-royan-saint-palais-sur-mer', 'round', 18, null],
  ['2025-09-13', '18:30', LA_PREE, 'range', null, 'Travail du putting court.'],
  ['2025-09-27', '10:00', LA_PREE, 'round', 18, null],
  ['2025-10-18', '09:20', 'golf-du-cognac-saint-brice', 'round', 18, 'Week-end à Cognac.'],
  ['2025-11-15', '10:30', LR_SUD, 'round', 9, 'Terrain gras, pas de roule.'],
  ['2026-01-17', '11:00', LA_PREE, 'range', null, 'Reprise après les fêtes.'],
  ['2026-02-21', '10:45', ROCHEFORT, 'round', 18, null],
  ['2026-03-14', '09:30', 'golf-du-chateau-de-la-vallade-saint-porchaire', 'round', 9, null],
  ['2026-03-28', '17:45', ROCHEFORT, 'range', null, null],
  ['2026-04-11', '09:00', LA_PREE, 'round', 9, 'Neuf trous après le boulot… un samedi.'],
  ['2026-04-25', '08:40', 'golf-bluegreen-niort-romagne-niort', 'round', 18, null],
  ['2026-05-16', '18:15', LR_SUD, 'range', null, null],
  ['2026-05-30', '09:15', OLERON, 'round', 9, null],
  ['2026-06-13', '08:30', 'golf-bluegreen-mazieres-en-gatine-mazieres-en-gatine', 'round', 18, null],
  ['2026-06-27', '19:00', OLERON, 'range', null, null],
  ['2026-07-11', '08:20', LA_PREE, 'round', 18, 'Meilleure carte de l’année !'],
  ['2026-08-01', '09:00', 'golf-de-margaux-margaux', 'round', 18, 'Parcours exigeant, greens rapides.'],
  ['2026-08-22', '10:10', 'angouleme-golf-l-hirondelle-angouleme', 'round', 18, null],
  ['2026-09-19', '09:30', LR_SUD, 'round', 9, null],
  ['2026-10-17', '09:45', LA_PREE, 'round', 18, null],
];

// Difficulté relative des parcours (coups sur 18 trous par rapport à la moyenne)
const DIFF = {
  [LR_SUD]: -1.5,
  [TROUSSE]: -1,
  'golf-de-margaux-margaux': 2.5,
  'golf-de-royan-saint-palais-sur-mer': 1.5,
  'la-palmyre-golf-resort-la-palmyre': 1,
};

const START = Date.parse('2025-04-12');
const END = Date.parse('2026-10-17');
const progress = (date) => (Date.parse(date) - START) / (END - START);

// Score cible relatif au par sur 18 trous : +28 → +19, avec un petit coup de mou l'hiver
function targetRel18(date, slug) {
  const t = progress(date);
  const month = Number(date.slice(5, 7));
  const winter = [11, 12, 1, 2].includes(month) ? 1.5 : 0;
  return lerp(28, 19, t) + winter + (DIFF[slug] ?? 0) + (rnd() - 0.5) * 4;
}

// ---------------------------------------------------------------- simulation d'un trou
function playHole(par, t, detailed) {
  const pen = rnd() < lerp(0.11, 0.045, t) ? 1 + (rnd() < 0.15 ? 1 : 0) : 0;

  let fairway = null;
  if (par >= 4) {
    if (rnd() < lerp(0.38, 0.54, t)) fairway = 'hit';
    else fairway = pick({ right: lerp(0.68, 0.5, t), left: lerp(0.24, 0.38, t), short: 0.08 });
  }

  let pGir = par === 3 ? lerp(0.13, 0.3, t) : lerp(0.11, 0.27, t);
  if (fairway === 'hit') pGir *= 1.45;
  else if (fairway) pGir *= 0.65;
  if (pen) pGir *= 0.25;
  const gir = rnd() < pGir;

  // coups supplémentaires pour atteindre le green quand il est manqué
  const extra = gir ? 0 : Number(pick({ 1: lerp(0.58, 0.72, t), 2: lerp(0.32, 0.24, t), 3: lerp(0.1, 0.04, t) }));

  let putts;
  if (gir) putts = Number(pick({ 1: lerp(0.07, 0.13, t), 2: 0.66, 3: lerp(0.24, 0.12, t), 4: lerp(0.03, 0.005, t) }));
  else putts = Number(pick({ 0: 0.02, 1: lerp(0.26, 0.38, t), 2: 0.6, 3: lerp(0.11, 0.05, t) }));

  const strokes = par - 2 + extra + putts + pen;
  const upDown = gir ? null : extra === 1 && putts <= 1 ? 1 : 0;

  return {
    par,
    strokes,
    putts,
    fairway: detailed ? fairway : null,
    gir: detailed ? (gir ? 1 : 0) : null,
    penalties: pen,
    up_down: detailed ? upDown : null,
  };
}

// Parties marquantes : cible imposée (relatif au par sur 18 trous)
const OVERRIDE = { '2026-07-11': 15 };

function playRound(pars, date, slug, detailed) {
  const t = progress(date);
  const k = pars.length / 18;
  const target = (OVERRIDE[date] ?? targetRel18(date, slug)) * k;
  const puttTarget = (lerp(36, 31, t) + (rnd() - 0.5) * 2) * k;
  let best = null;
  for (let i = 0; i < 4000; i++) {
    const holes = pars.map((p) => playHole(p, t, detailed));
    const rel = holes.reduce((s, h) => s + h.strokes - h.par, 0);
    const putts = holes.reduce((s, h) => s + h.putts, 0);
    const gap = Math.abs(rel - target) + 0.6 * Math.abs(putts - puttTarget);
    if (!best || gap < best.gap) best = { holes, gap };
    if (gap <= 0.8) break;
  }
  return best.holes;
}

// ---------------------------------------------------------------- séances de practice
const FOCUS = ['putting', 'long', 'approach', 'chip', 'bunker'];
function rangeSession(date, note) {
  const t = progress(date);
  const focus = [FOCUS[0], FOCUS[1 + Math.floor(rnd() * 3)]];
  const drills = [];
  const make = (label, category, distance, attempts, rate) =>
    drills.push({
      position: drills.length + 1,
      category,
      label,
      distance_m: distance,
      attempts,
      successes: Math.max(0, Math.min(attempts, Math.round(attempts * (rate + (rnd() - 0.5) * 0.15)))),
    });
  make('Putts à 1 m', 'putting', 1, 10, lerp(0.72, 0.93, t));
  make('Putts à 2 m', 'putting', 2, 10, lerp(0.42, 0.68, t));
  if (rnd() < 0.7) make('Putts à 4 m', 'putting', 4, 10, lerp(0.14, 0.3, t));
  if (focus.includes('long')) make('Driver dans le couloir', 'long', null, 20, lerp(0.38, 0.6, t));
  if (focus.includes('approach')) make('Approches à 50 m dans le rond', 'approach', 50, 15, lerp(0.25, 0.47, t));
  if (focus.includes('chip')) make('Chips à moins d’1 m', 'chip', null, 15, lerp(0.22, 0.45, t));
  return {
    duration_min: [45, 60, 60, 75, 90][Math.floor(rnd() * 5)],
    balls: [50, 70, 70, 100][Math.floor(rnd() * 4)],
    focus: focus.join(','),
    feeling: 3 + Math.round(rnd() * 2 * (0.4 + t * 0.6)),
    notes: note,
    drills,
  };
}

// ---------------------------------------------------------------- assemblage
const TEES = ['jaune', 'jaune', 'jaune', 'blanc'];
const sessions = PLAN.map(([date, time, slug, kind, holes, note], i) => {
  const base = { id: uuid(), kind, golf_slug: slug, course: '', played_at: `${date}T${time}:00` };
  if (kind === 'range') return { ...base, ...rangeSession(date, note) };

  const layout = PARS[slug];
  if (!layout) throw new Error(`Pars manquants pour ${slug}`);
  const pars = layout.pars.slice(0, holes);
  const roundNumber = PLAN.slice(0, i + 1).filter((p) => p[3] === 'round').length;
  const played = playRound(pars, date, slug, roundNumber > 3);
  const rel = played.reduce((s, h) => s + h.strokes - h.par, 0);
  return {
    ...base,
    holes,
    start_hole: 1,
    tee: TEES[Math.floor(rnd() * TEES.length)],
    feeling: Math.max(1, Math.min(5, Math.round(3.5 - (rel / holes) * 18 / 10 + 1.2 + (rnd() - 0.5)))),
    notes: note,
    holes_data: played.map((h, k) => ({ hole: k + 1, ...h })),
  };
});

writeFileSync(new URL('db/seed/demo-sessions.json', root), JSON.stringify(sessions, null, 1) + '\n');

// ---------------------------------------------------------------- résumé console
for (const s of sessions) {
  if (s.kind === 'range') {
    console.log(s.played_at.slice(0, 10), 'practice', s.golf_slug.slice(0, 28).padEnd(28), `${s.duration_min} min, ${s.balls} balles`);
    continue;
  }
  const h = s.holes_data;
  const rel = h.reduce((a, x) => a + x.strokes - x.par, 0);
  const putts = h.reduce((a, x) => a + x.putts, 0);
  const fw = h.filter((x) => x.fairway);
  const fir = fw.length ? Math.round((100 * fw.filter((x) => x.fairway === 'hit').length) / fw.length) : '-';
  const gir = h[0].gir == null ? '-' : Math.round((100 * h.filter((x) => x.gir).length) / h.length);
  console.log(
    s.played_at.slice(0, 10), `${s.holes}T`.padEnd(8), s.golf_slug.slice(0, 28).padEnd(28),
    `${h.reduce((a, x) => a + x.strokes, 0)} (${rel >= 0 ? '+' : ''}${rel})`.padEnd(10),
    `putts ${putts}`.padEnd(9), `FIR ${fir}%`.padEnd(9), `GIR ${gir}%`,
  );
}
