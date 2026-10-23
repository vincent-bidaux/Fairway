/**
 * ffgolf.org public JSON endpoints (used by the ffgolf website's own calendar pages).
 *  A. /search/club-tournament            — every club competition entered by clubs (≈ 6–8 weeks ahead)
 *  B. /search/tournament/amateur_tournament/{pageId} — Grands Prix, Trophées seniors, GP jeunes…
 * Only factual fields are kept (name, date, venue, format) and each event links back to its source.
 */
import type { Env } from '../env';
import { todayParis } from '../lib/dates';
import type { EventType } from '../../shared/types';
import { guessType, type ExtractedEvent, type SourceDb } from './types';

const UA = 'FairwayBot/0.1 (+https://github.com/vincent-bidaux/Fairway; golf competitions calendar)';
const REGION_DEPTS = new Set(['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87']);

export function isFfgolfSource(s: SourceDb) {
  return s.kind === 'ffgolf' && /ffgolf\.org\/search\//.test(s.url);
}

export async function extractFfgolf(env: Env, source: SourceDb): Promise<{ events: ExtractedEvent[]; hash: string }> {
  const url = new URL(source.url);
  const today = todayParis();
  if (url.pathname.includes('/club-tournament')) {
    url.searchParams.set('search[date][date_from]', `${today} 00:00:00`);
  } else if (!url.searchParams.has('search[start_month]')) {
    url.searchParams.set('search[start_month]', `${today.slice(0, 4)}-01`);
  }
  if (!url.searchParams.has('limit')) url.searchParams.set('limit', '500');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ffgolf HTTP ${res.status}`);
  const body = await res.text();
  let data: { numFound?: number; documents?: unknown[] };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('ffgolf : réponse non JSON (format modifié ?)');
  }
  if (!Array.isArray(data.documents)) throw new Error('ffgolf : champ documents absent');

  const hash = await sha256(body);
  const golfs = new GolfResolver(env);
  const events: ExtractedEvent[] = [];
  const maxYear = Number(today.slice(0, 4)) + 2;

  for (const raw of data.documents as Record<string, unknown>[]) {
    const ev = url.pathname.includes('/club-tournament')
      ? await fromClubTournament(raw, golfs, today, maxYear)
      : await fromAmateurTournament(raw, golfs, today, maxYear);
    if (ev) events.push(ev);
  }
  return { events, hash };
}

// ---------- A. club competitions ----------

async function fromClubTournament(d: Record<string, unknown>, golfs: GolfResolver, today: string, maxYear: number) {
  const name = str(d.nom);
  const start = parisDate(str(d.dateDebut));
  if (!name || !start) return null;
  if (/mod[eè]le/i.test(name) || /\(\s*priv[ée]\s*\)|\bpriv[ée]e?\b/i.test(name)) return null;
  if (Number(start.slice(0, 4)) > maxYear) return null;
  let end = parisDate(str(d.dateFin));
  if (end && end <= start) end = null;
  if ((end ?? start) < today) return null;

  const adresse = str(d.adresse) ?? '';
  const postcode = adresse.match(/\b(\d{5})\b/)?.[1] ?? null;
  const golfId = await golfs.resolve({
    ffgolfId: str(d.golfId),
    name: str(d.golfLabel),
    city: str(d.ville),
    postcode,
    website: str(d.website),
  });
  if (!golfId) return null;

  const forme = str(d.formeJeu);
  const formule = str(d.formuleJeu);
  let type: EventType = guessType(name);
  if (type === 'club' && forme && /scramble|greensome|patsome|foursome|chapman/i.test(forme)) type = 'scramble';
  if (type === 'club' && forme && /pro ?am/i.test(forme)) type = 'open';
  const holes = typeof d.nbTrous === 'number' ? `${d.nbTrous} trous` : null;
  const tours = typeof d.nbTours === 'number' && d.nbTours > 1 ? `${d.nbTours} tours` : null;

  return {
    golfId,
    title: titleCase(name),
    startDate: start,
    endDate: end,
    startTime: null,
    type,
    format: [forme, formule].filter(Boolean).join(' · ') || null,
    eligibility: null,
    price: null,
    registrationUrl: str(d.lienDeparts),
    infoUrl: str(d.website) ?? 'https://www.ffgolf.org/golf-amateur/competitions-des-clubs',
    description: [holes, tours].filter(Boolean).join(', ') || null,
    status: 'scheduled',
  } satisfies ExtractedEvent;
}

// ---------- B. Grands Prix & federal events ----------

async function fromAmateurTournament(d: Record<string, unknown>, golfs: GolfResolver, today: string, maxYear: number) {
  const league = str(d.league) ?? '';
  if (!/aquitaine/i.test(league)) return null;
  const name = str(d.name);
  const start = str(d.start_date)?.slice(0, 10) ?? null;
  if (!name || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (Number(start.slice(0, 4)) > maxYear) return null;
  let end = str(d.end_date)?.slice(0, 10) ?? null;
  if (end && end <= start) end = null;
  if ((end ?? start) < today) return null;

  const deptName = str(d.department);
  const golfId = await golfs.resolve({ name: str(d.location), city: str(d.fr_city), departmentName: deptName });
  if (!golfId) return null;

  const ctype = (str(d.competition_type) ?? '').toLowerCase();
  const type: EventType = ctype.includes('jeune')
    ? 'jeunes'
    : ctype.includes('senior')
      ? 'senior'
      : ctype.includes('grand prix') || ctype.includes('classic')
        ? 'grand_prix'
        : ctype.includes('national') || ctype.includes('championnat') || ctype.includes('compétition')
          ? 'championnat'
          : guessType(name);

  const idxM = str(d.index_maxi_mess);
  const idxD = str(d.index_maxi_dame);
  const eligibility = [str(d.category), str(d.gender) === 'Mixte' ? null : str(d.gender), idxM ? `Index max messieurs ${idxM}` : null, idxD ? `dames ${idxD}` : null]
    .filter(Boolean)
    .join(' · ');
  const closing = str(d.date_cloture_inscriptions);
  const link = str(d.title_link);

  return {
    golfId,
    title: titleCase(name),
    startDate: start,
    endDate: end,
    startTime: null,
    type,
    format: [str(d.format_jeu), str(d.play_formula)].filter(Boolean).join(' · ') || null,
    eligibility: eligibility || null,
    price: null,
    registrationUrl: null,
    infoUrl: link ? new URL(link, 'https://www.ffgolf.org').toString() : 'https://www.ffgolf.org/golf-amateur/competitions-federales',
    description: closing ? `Clôture des inscriptions : ${closing.slice(0, 10).split('-').reverse().join('/')}` : null,
    status: 'scheduled',
  } satisfies ExtractedEvent;
}

// ---------- golf matching (creates missing golfs so the reference list self-heals) ----------

interface GolfHint {
  ffgolfId?: string | null;
  name: string | null;
  city: string | null;
  postcode?: string | null;
  departmentName?: string | null;
  website?: string | null;
}

class GolfResolver {
  private rows: { id: number; name: string; city: string; department: string; ffgolf_id: string | null }[] | null = null;
  private depts: { code: string; name: string }[] | null = null;
  private cache = new Map<string, number | null>();
  constructor(private env: Env) {}

  async resolve(h: GolfHint): Promise<number | null> {
    const key = `${h.ffgolfId ?? ''}|${h.name ?? ''}|${h.city ?? ''}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const id = await this.find(h);
    this.cache.set(key, id);
    return id;
  }

  private async load() {
    if (!this.rows) {
      this.rows = (
        await this.env.DB.prepare(`SELECT id, name, city, department, ffgolf_id FROM golfs`).all<{
          id: number; name: string; city: string; department: string; ffgolf_id: string | null;
        }>()
      ).results;
      this.depts = (await this.env.DB.prepare(`SELECT code, name FROM departments`).all<{ code: string; name: string }>()).results;
    }
  }

  private async find(h: GolfHint): Promise<number | null> {
    await this.load();
    const rows = this.rows!;
    if (h.ffgolfId) {
      const hit = rows.find((r) => r.ffgolf_id === h.ffgolfId);
      if (hit) return hit.id;
    }
    let dept = h.postcode ? h.postcode.slice(0, 2) : null;
    if (!dept && h.departmentName) dept = this.depts!.find((d) => norm(d.name) === norm(h.departmentName!))?.code ?? null;
    if (dept && !REGION_DEPTS.has(dept)) return null;

    const n = coreName(h.name ?? '');
    const c = norm(h.city ?? '');
    const candidates = rows.filter((r) => !dept || r.department === dept);
    let best: { id: number; score: number } | null = null;
    for (const r of candidates) {
      const rn = coreName(r.name);
      let score = 0;
      if (n && rn && (n === rn || n.includes(rn) || rn.includes(n))) score += 3;
      else score += overlap(n, rn);
      if (c && norm(r.city) === c) score += 2;
      if (!best || score > best.score) best = { id: r.id, score };
    }
    if (best && best.score >= 3) {
      if (h.ffgolfId) {
        await this.env.DB.prepare(`UPDATE golfs SET ffgolf_id = ? WHERE id = ? AND ffgolf_id IS NULL`).bind(h.ffgolfId, best.id).run();
        const r = rows.find((x) => x.id === best!.id);
        if (r) r.ffgolf_id = h.ffgolfId;
      }
      return best.id;
    }
    // Unknown golf inside the region: create it, geocoded on its commune.
    if (!dept || !h.name || !h.city) return null;
    const geo = await geocodeCommune(h.city, h.postcode ?? null);
    const name = titleCase(h.name);
    const city = geo?.name ?? titleCase(h.city);
    const slug = `${norm(name).replace(/\s+/g, '-')}-${norm(city).replace(/\s+/g, '-')}`.slice(0, 80);
    const row = await this.env.DB.prepare(
      `INSERT INTO golfs (slug, name, department, city, postcode, lat, lng, website, ffgolf_id, notes)
       VALUES (?,?,?,?,?,?,?,?,?, 'créé automatiquement depuis ffgolf ; coordonnées = centre de la commune')
       ON CONFLICT(slug) DO UPDATE SET ffgolf_id = COALESCE(golfs.ffgolf_id, excluded.ffgolf_id)
       RETURNING id`,
    )
      .bind(slug, name, dept, city, h.postcode ?? geo?.postcode ?? null, geo?.lat ?? null, geo?.lng ?? null, h.website ?? null, h.ffgolfId ?? null)
      .first<{ id: number }>();
    if (row) rows.push({ id: row.id, name, city, department: dept, ffgolf_id: h.ffgolfId ?? null });
    return row?.id ?? null;
  }
}

async function geocodeCommune(city: string, postcode: string | null) {
  const u = new URL('https://geo.api.gouv.fr/communes');
  u.searchParams.set('nom', city);
  if (postcode) u.searchParams.set('codePostal', postcode);
  u.searchParams.set('fields', 'nom,codesPostaux,centre');
  u.searchParams.set('boost', 'population');
  u.searchParams.set('limit', '1');
  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const [c] = (await res.json()) as { nom: string; codesPostaux?: string[]; centre?: { coordinates: [number, number] } }[];
    if (!c?.centre) return null;
    return { name: c.nom, postcode: c.codesPostaux?.[0] ?? null, lng: c.centre.coordinates[0], lat: c.centre.coordinates[1] };
  } catch {
    return null;
  }
}

// ---------- helpers ----------

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // ffgolf wraps many values as { name, icon }.
  if (typeof v === 'object') return Array.isArray(v) ? null : str((v as { name?: unknown }).name);
  const s = String(v).trim();
  return s ? s : null;
}

/** "2026-10-24T22:00:00Z" → "2026-10-25" (Europe/Paris). */
function parisDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return todayParis(d);
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOP = new Set(['golf', 'club', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'gc', 'country', 'international', 'bluegreen', 'ugolf', 'domaine', 'et']);
function coreName(s: string) {
  return norm(s).split(' ').filter((w) => w && !STOP.has(w)).join(' ');
}

function overlap(a: string, b: string) {
  const A = new Set(a.split(' ').filter((w) => w.length > 2));
  const B = b.split(' ').filter((w) => w.length > 2);
  return B.filter((w) => A.has(w)).length;
}

function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s.charAt(0).toUpperCase() + s.slice(1);
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'à', 'au', 'aux', 'sur', 'by', "d'", "l'"]);
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
    .replace(/\b(D|L)'(\w)/g, (_m, a, b) => `${a.toLowerCase()}'${b.toUpperCase()}`);
}

async function sha256(s: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
