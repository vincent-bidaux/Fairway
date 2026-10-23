import type { Env } from '../env';
import { addDays, todayParis } from '../lib/dates';
import type { FetchedPage } from './fetch-page';
import { EVENT_TYPES, guessType, type ExtractedEvent, type SourceDb } from './types';

interface GolfRef {
  id: number;
  name: string;
  city: string;
}

const TOOL = {
  name: 'save_competitions',
  description: 'Enregistre la liste des compétitions de golf trouvées dans le document.',
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            golf_id: { type: 'integer', description: "Identifiant du golf où se joue la compétition (liste fournie). Omettre si inconnu." },
            title: { type: 'string', description: 'Nom de la compétition, tel qu’affiché (sans la date).' },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            end_date: { type: 'string', description: 'YYYY-MM-DD si plusieurs jours, sinon omettre.' },
            start_time: { type: 'string', description: 'HH:MM (premier départ / shotgun) si indiqué.' },
            type: { type: 'string', enum: EVENT_TYPES },
            format: { type: 'string', description: 'Formule de jeu : Stableford, Strokeplay, Scramble à 2, Match-play…' },
            eligibility: { type: 'string', description: 'À qui elle est ouverte : tous, membres, seniors, dames, index max, licence obligatoire…' },
            price: { type: 'string', description: 'Droit de jeu / green-fee si indiqué, texte court.' },
            registration_url: { type: 'string', description: 'URL absolue d’inscription si présente.' },
            info_url: { type: 'string', description: 'URL absolue de la page de détail si présente.' },
            description: { type: 'string', description: '1-2 phrases utiles (dotation, repas, sponsor, séries). Pas de copier-coller long.' },
            status: { type: 'string', enum: ['scheduled', 'cancelled', 'full'] },
          },
          required: ['title', 'start_date', 'type'],
        },
      },
    },
    required: ['events'],
  },
} as const;

export async function extractWithLlm(
  env: Env,
  source: SourceDb,
  page: Exclude<FetchedPage, { kind: 'ical' }>,
  golfs: GolfRef[],
): Promise<ExtractedEvent[]> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquante');
  const today = todayParis();
  const horizon = addDays(today, 400);

  const venue = source.golf_id
    ? `Cette source appartient au golf « ${source.golf_name} » (${source.golf_city}), golf_id=${source.golf_id}. Par défaut, toutes les compétitions s’y jouent.`
    : `Cette source est régionale (${source.label}). Pour chaque compétition, choisis le golf_id dans la liste ci-dessous ; si le lieu n’est pas dans la liste, n’inclus pas la compétition.\nGolfs connus :\n${golfs.map((g) => `${g.id}: ${g.name} (${g.city})`).join('\n')}`;

  const system = `Tu extrais un agenda de compétitions de golf à partir de pages web de golfs français.
Date du jour : ${today}. Ne garde que les compétitions dont la date de fin est entre ${today} et ${horizon}.
Inclure : compétitions de club, Grands Prix, championnats, trophées et compétitions sponsorisées, scrambles, opens, pro-am, rencontres seniors/dames/jeunes, compétitions d'association sportive.
Exclure : cours, stages, initiations, portes ouvertes, soirées, restaurant, fermetures du parcours, offres de green-fee.
Si l’année n’est pas écrite, déduis-la du contexte (saison affichée) ou de la date du jour (prochaine occurrence).
N’invente jamais une information absente. Si rien ne correspond, renvoie une liste vide.
${venue}`;

  const content =
    page.kind === 'pdf'
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: page.base64 } },
          { type: 'text', text: `Source : ${page.finalUrl}. Extrais les compétitions.` },
        ]
      : [{ type: 'text', text: `Source : ${page.finalUrl}\n\n<page>\n${page.text}\n</page>\n\nExtrais les compétitions.` }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 8000,
      system,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content: { type: string; name?: string; input?: { events?: RawEvent[] } }[];
  };
  const call = data.content.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  const raw = call?.input?.events ?? [];
  const validGolf = new Set(golfs.map((g) => g.id));
  return raw
    .map((e) => normalise(e, source, validGolf, today))
    .filter((e): e is ExtractedEvent => e !== null);
}

interface RawEvent {
  golf_id?: number;
  title?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  type?: string;
  format?: string;
  eligibility?: string;
  price?: string;
  registration_url?: string;
  info_url?: string;
  description?: string;
  status?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalise(e: RawEvent, source: SourceDb, validGolf: Set<number>, today: string): ExtractedEvent | null {
  const title = e.title?.trim();
  if (!title || !e.start_date || !DATE.test(e.start_date)) return null;
  const golfId = source.golf_id ?? (e.golf_id && validGolf.has(e.golf_id) ? e.golf_id : null);
  if (!golfId) return null;
  const endDate = e.end_date && DATE.test(e.end_date) && e.end_date > e.start_date ? e.end_date : null;
  if ((endDate ?? e.start_date) < today) return null;
  const type = (EVENT_TYPES as string[]).includes(e.type ?? '') ? (e.type as ExtractedEvent['type']) : guessType(title);
  const url = (u?: string) => (u && /^https?:\/\//.test(u) ? u.slice(0, 500) : null);
  const short = (s?: string, n = 200) => (s && s.trim() ? s.trim().slice(0, n) : null);
  return {
    golfId,
    title: title.slice(0, 160),
    startDate: e.start_date,
    endDate,
    startTime: e.start_time && /^\d{1,2}[:h]\d{2}$/.test(e.start_time) ? e.start_time.replace('h', ':').padStart(5, '0') : null,
    type,
    format: short(e.format, 80),
    eligibility: short(e.eligibility, 160),
    price: short(e.price, 80),
    registrationUrl: url(e.registration_url),
    infoUrl: url(e.info_url) ?? source.url,
    description: short(e.description, 400),
    status: e.status === 'cancelled' || e.status === 'full' ? e.status : 'scheduled',
  };
}
