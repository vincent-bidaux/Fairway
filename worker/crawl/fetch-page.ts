const UA = 'FairwayBot/0.1 (+https://github.com/vincent-bidaux/Fairway; golf competitions calendar)';
const MAX_TEXT = 45_000;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export type FetchedPage =
  | { kind: 'text'; text: string; hash: string; finalUrl: string }
  | { kind: 'pdf'; base64: string; hash: string; finalUrl: string }
  | { kind: 'ical'; raw: string; hash: string; finalUrl: string };

export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/calendar,application/pdf;q=0.9,*/*;q=0.8', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  const finalUrl = res.url || url;

  if (type.includes('pdf') || /\.pdf($|\?)/i.test(finalUrl)) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) throw new Error('PDF trop volumineux');
    return { kind: 'pdf', base64: toBase64(buf), hash: await sha256(buf), finalUrl };
  }

  const body = await res.text();
  if (type.includes('text/calendar') || body.startsWith('BEGIN:VCALENDAR')) {
    return { kind: 'ical', raw: body, hash: await sha256(body), finalUrl };
  }
  const text = htmlToText(body, finalUrl).slice(0, MAX_TEXT);
  if (text.length < 40) throw new Error('Page vide ou rendue en JavaScript');
  return { kind: 'text', text, hash: await sha256(text), finalUrl };
}

/** Compact, LLM-friendly text: keeps links (resolved), table cells and iframe targets. */
export function htmlToText(html: string, baseUrl: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, ' ');

  s = s.replace(/<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi, (_m, src) => `\n[IFRAME ${resolve(src, baseUrl)}]\n`);
  s = s.replace(/<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const label = stripTags(inner).trim();
    const abs = resolve(href, baseUrl);
    if (!label) return ' ';
    if (/^(mailto|tel|javascript):/i.test(href)) return ` ${label} `;
    return ` ${label} <${abs}> `;
  });
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|table|ul|ol|dt|dd)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '\n- ');
  s = decodeEntities(stripTags(s));
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l, i, arr) => l.length > 0 && !(l === arr[i - 1]))
    .join('\n');
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, ' ');
}

function resolve(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function decodeEntities(s: string) {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è',
    ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù',
    icirc: 'î', iuml: 'ï', euml: 'ë', Eacute: 'É', rsquo: '’', lsquo: '‘', laquo: '«',
    raquo: '»', hellip: '…', ndash: '–', mdash: '—', euro: '€', deg: '°',
  };
  return s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n] ?? m);
}

async function sha256(data: string | ArrayBuffer) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
