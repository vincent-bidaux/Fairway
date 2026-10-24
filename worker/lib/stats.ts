import { girOf, type HoleEntry, type RangeStats, type RoundStats, type DrillCategory, type WellbeingDim, type WellbeingStats } from '../../shared/practice';

export interface RoundRow {
  id: string;
  played_at: string;
  golf_name: string | null;
  mood: number | null;
  body: number | null;
  weather: number | null;
  holes: HoleEntry[];
}
export interface RangeRow {
  id: string;
  played_at: string;
  duration_min: number | null;
  balls: number | null;
  drills: Array<{ label: string; category: DrillCategory; distance_m: number | null; attempts: number | null; successes: number | null }>;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (a: number, n: number) => (n ? Math.round((100 * a) / n) : null);

export function roundStats(rounds: RoundRow[]): RoundStats {
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, albatross: 0, ace: 0 };
  const ctx = { mood: [0, 0, 0, 0, 0].map(() => ({ n: 0, rel: 0, holes: 0 })), body: [0, 0, 0, 0, 0].map(() => ({ n: 0, rel: 0, holes: 0 })), weather: [0, 0, 0, 0, 0].map(() => ({ n: 0, rel: 0, holes: 0 })) };
  const byPar: Record<number, { sum: number; n: number }> = { 3: { sum: 0, n: 0 }, 4: { sum: 0, n: 0 }, 5: { sum: 0, n: 0 } };
  const fw = { n: 0, hit: 0, left: 0, right: 0, short: 0 };
  const gir = { n: 0, hit: 0 };
  const putts = { sum: 0, holes: 0, three: 0, onGir: 0, girHoles: 0 };
  const ud = { n: 0, made: 0 };
  let pen = 0;
  let holesPlayed = 0;
  let relSum = 0;
  const series: RoundStats['series'] = [];
  let best: RoundStats['best'] = null;

  for (const r of [...rounds].sort((a, b) => a.played_at.localeCompare(b.played_at))) {
    const played = r.holes.filter((h) => h.strokes != null);
    if (!played.length) continue;
    let rel = 0;
    let strokes = 0;
    const per = { putts: 0, puttHoles: 0, fwN: 0, fwHit: 0, girN: 0, girHit: 0, pen: 0, udN: 0, udMade: 0 };
    for (const h of played) {
      const d = h.strokes! - h.par;
      rel += d;
      strokes += h.strokes!;
      if (h.strokes === 1) dist.ace++;
      if (d <= -3) dist.albatross++;
      if (d <= -2) dist.eagle++;
      else if (d === -1) dist.birdie++;
      else if (d === 0) dist.par++;
      else if (d === 1) dist.bogey++;
      else if (d === 2) dist.double++;
      else dist.triple++;
      const bp = byPar[Math.min(Math.max(h.par, 3), 5)];
      bp.sum += d;
      bp.n++;
      pen += h.penalties ?? 0;
      per.pen += h.penalties ?? 0;
      if (h.par >= 4 && h.fairway) {
        fw.n++;
        fw[h.fairway]++;
        per.fwN++;
        if (h.fairway === 'hit') per.fwHit++;
      }
      const g = girOf(h);
      if (g != null) {
        gir.n++;
        gir.hit += g;
        per.girN++;
        per.girHit += g;
      }
      if (h.putts != null) {
        per.putts += h.putts;
        per.puttHoles++;
        putts.sum += h.putts;
        putts.holes++;
        if (h.putts >= 3) putts.three++;
        if (g === 1) {
          putts.onGir += h.putts;
          putts.girHoles++;
        }
      }
      if (g === 0 && h.up_down != null) {
        ud.n++;
        ud.made += h.up_down;
        per.udN++;
        per.udMade += h.up_down;
      }
    }
    holesPlayed += played.length;
    relSum += rel;
    for (const k of ['mood', 'body', 'weather'] as const) {
      const lvl = r[k];
      if (lvl && lvl >= 1 && lvl <= 5) {
        const b = ctx[k][lvl - 1];
        b.n++;
        b.rel += rel;
        b.holes += played.length;
      }
    }
    const rel18 = r1((rel * 18) / played.length);
    const date = r.played_at.slice(0, 10);
    series.push({
      id: r.id,
      date,
      rel18,
      strokes,
      holes: played.length,
      putts18: per.puttHoles ? r1((per.putts * 18) / per.puttHoles) : null,
      firPct: pct(per.fwHit, per.fwN),
      girPct: pct(per.girHit, per.girN),
      pen18: r1((per.pen * 18) / played.length),
      udPct: pct(per.udMade, per.udN),
    });
    // Meilleure partie : les 18 trous complets d'abord, puis les 9 trous complets.
    const tier = played.length >= 18 ? 2 : played.length >= 9 ? 1 : 0;
    const bestTier = best ? (best.holes >= 18 ? 2 : 1) : -1;
    if (tier > 0 && (tier > bestTier || (tier === bestTier && rel < best!.rel))) {
      best = { id: r.id, rel, strokes, holes: played.length, date, golf: r.golf_name };
    }
  }

  const avg = (b: { sum: number; n: number }) => (b.n ? Math.round((100 * b.sum) / b.n) / 100 : null);
  return {
    count: series.length,
    holesPlayed,
    rel18: holesPlayed ? r1((relSum * 18) / holesPlayed) : null,
    best,
    series,
    dist,
    byPar: { 3: avg(byPar[3]), 4: avg(byPar[4]), 5: avg(byPar[5]) },
    fairways: { ...fw, pct: pct(fw.hit, fw.n) },
    gir: { ...gir, pct: pct(gir.hit, gir.n) },
    putts: {
      n: putts.holes,
      per18: putts.holes ? r1((putts.sum * 18) / putts.holes) : null,
      threePuttPct: pct(putts.three, putts.holes),
      perGir: putts.girHoles ? Math.round((100 * putts.onGir) / putts.girHoles) / 100 : null,
    },
    upDown: { ...ud, pct: pct(ud.made, ud.n) },
    penalties: { per18: holesPlayed ? r1((pen * 18) / holesPlayed) : null },
    context: {
      mood: ctx.mood.map((b, i) => ({ level: i + 1, rounds: b.n, rel18: b.holes ? r1((b.rel * 18) / b.holes) : null })),
      body: ctx.body.map((b, i) => ({ level: i + 1, rounds: b.n, rel18: b.holes ? r1((b.rel * 18) / b.holes) : null })),
      weather: ctx.weather.map((b, i) => ({ level: i + 1, rounds: b.n, rel18: b.holes ? r1((b.rel * 18) / b.holes) : null })),
    },
  };
}

/** Humeur, forme et météo elles-mêmes, sur toutes les séances (parties et practice) où elles sont renseignées. */
export function wellbeingStats(rows: Array<{ played_at: string; kind: 'round' | 'range'; mood: number | null; body: number | null; weather: number | null }>): WellbeingStats {
  const sorted = [...rows].sort((a, b) => a.played_at.localeCompare(b.played_at));
  const dim = (k: 'mood' | 'body' | 'weather'): WellbeingDim => {
    const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    const series: WellbeingDim['series'] = [];
    let sum = 0;
    for (const r of sorted) {
      const lvl = r[k];
      if (lvl == null || !Number.isInteger(lvl) || lvl < 1 || lvl > 5) continue;
      dist[lvl - 1]++;
      sum += lvl;
      series.push({ date: r.played_at, level: lvl, kind: r.kind });
    }
    return { n: series.length, avg: series.length ? r1(sum / series.length) : null, dist, series };
  };
  return { mood: dim('mood'), body: dim('body'), weather: dim('weather') };
}

/** Lundi de la semaine (YYYY-MM-DD) */
function weekOf(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function rangeStats(rows: RangeRow[]): RangeStats {
  const weeks = new Map<string, { minutes: number; balls: number }>();
  const drills = new Map<string, RangeStats['drills'][number]>();
  let minutes = 0;
  let balls = 0;
  for (const r of [...rows].sort((a, b) => a.played_at.localeCompare(b.played_at))) {
    minutes += r.duration_min ?? 0;
    balls += r.balls ?? 0;
    const w = weekOf(r.played_at);
    const cur = weeks.get(w) ?? { minutes: 0, balls: 0 };
    cur.minutes += r.duration_min ?? 0;
    cur.balls += r.balls ?? 0;
    weeks.set(w, cur);
    for (const d of r.drills) {
      if (!d.attempts || d.successes == null) continue;
      const key = `${d.category}|${d.label}`;
      const entry = drills.get(key) ?? { label: d.label, category: d.category, distance_m: d.distance_m, points: [] };
      entry.points.push({ date: r.played_at.slice(0, 10), rate: Math.round((100 * d.successes) / d.attempts), attempts: d.attempts });
      drills.set(key, entry);
    }
  }
  return {
    count: rows.length,
    minutes,
    balls,
    weekly: [...weeks.entries()].sort().map(([week, v]) => ({ week, ...v })),
    drills: [...drills.values()].sort((a, b) => b.points.length - a.points.length),
  };
}
