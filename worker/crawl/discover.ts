import type { Env } from '../env';

/**
 * For golfs that have a website but no source yet, fetch the homepage and pick the most
 * likely "compétitions / calendrier sportif" link. Pure heuristics, no LLM call.
 */
export async function discoverSources(env: Env, limit = 5) {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, g.website FROM golfs g
     WHERE g.active = 1 AND g.website IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.golf_id = g.id)
       AND (g.notes IS NULL OR g.notes NOT LIKE '%[discover:%')
     ORDER BY g.id LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: number; name: string; website: string }>();

  const report: { golfId: number; url: string | null; error?: string }[] = [];
  for (const g of results) {
    try {
      const res = await fetch(g.website, {
        headers: { 'User-Agent': 'FairwayBot/0.1 (+https://github.com/vincent-bidaux/Fairway)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const best = pickCompetitionLink(html, res.url || g.website);
      const url = best ?? (res.url || g.website);
      await env.DB.prepare(
        `INSERT INTO sources (golf_id, kind, parser, label, url) VALUES (?, 'club_page', ?, ?, ?) ON CONFLICT(url) DO NOTHING`,
      )
        .bind(g.id, /\.ics($|\?)/i.test(url) ? 'ical' : 'llm', `${g.name} — ${best ? 'calendrier' : "page d'accueil"}`, url)
        .run();
      await markDiscovered(env, g.id, best ? 'ok' : 'homepage');
      report.push({ golfId: g.id, url });
    } catch (err) {
      await markDiscovered(env, g.id, 'error');
      report.push({ golfId: g.id, url: null, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}

async function markDiscovered(env: Env, golfId: number, result: string) {
  await env.DB.prepare(`UPDATE golfs SET notes = COALESCE(notes || ' ', '') || ? WHERE id = ?`)
    .bind(`[discover:${result}]`, golfId)
    .run();
}

const STRONG = /(comp[ée]titions?|calendrier[\s-]*(sportif|des comp)|programme sportif|agenda sportif|planning des comp)/i;
const MEDIUM = /(calendrier|agenda|[ée]v[ée]nements|association sportive|\bas\b|tournois?|troph[ée]es?)/i;
const NEGATIVE = /(tarif|restaurant|cours|stage|enseignement|boutique|proshop|mentions|contact|green-?fee|h[ée]bergement|s[ée]minaire|mariage|cgv)/i;

export function pickCompetitionLink(html: string, base: string): string | null {
  const host = safeHost(base);
  let best: { url: string; score: number } | null = null;
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    let url: string;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const hay = `${text} ${decodeURIComponent(url)}`;
    let score = 0;
    if (STRONG.test(hay)) score += 10;
    else if (MEDIUM.test(hay)) score += 4;
    if (NEGATIVE.test(hay)) score -= 6;
    if (/\.ics($|\?)/i.test(url)) score += 6;
    if (/\.pdf($|\?)/i.test(url) && STRONG.test(hay)) score += 2;
    if (safeHost(url) !== host && !/\.ics|\.pdf/i.test(url)) score -= 3;
    if (score > 0 && (!best || score > best.score)) best = { url, score };
  }
  return best && best.score >= 4 ? best.url : null;
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
