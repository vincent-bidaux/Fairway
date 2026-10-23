import { todayParis } from '../lib/dates';
import { guessType, type ExtractedEvent, type SourceDb } from './types';

/** Minimal RFC 5545 reader: enough for club calendars exported from common tools. */
export function extractIcal(raw: string, source: SourceDb): ExtractedEvent[] {
  if (!source.golf_id) throw new Error('Une source iCal doit être rattachée à un golf');
  const today = todayParis();
  const lines = raw.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: ExtractedEvent[] = [];
  let cur: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      const ev = toEvent(cur, source, today);
      if (ev) out.push(ev);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i > 0) cur[line.slice(0, i).split(';')[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return out;
}

function toEvent(p: Record<string, string>, source: SourceDb, today: string): ExtractedEvent | null {
  const title = unescape(p.SUMMARY ?? '').trim();
  const start = parseDate(p.DTSTART);
  if (!title || !start) return null;
  let end = parseDate(p.DTEND);
  // DTEND is exclusive for all-day events.
  if (end && p.DTEND && /^\d{8}$/.test(p.DTEND)) {
    const d = new Date(`${end.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    end = { date: d.toISOString().slice(0, 10), time: null };
  }
  const endDate = end && end.date > start.date ? end.date : null;
  if ((endDate ?? start.date) < today) return null;
  const desc = unescape(p.DESCRIPTION ?? '').trim();
  return {
    golfId: source.golf_id!,
    title: title.slice(0, 160),
    startDate: start.date,
    endDate,
    startTime: start.time,
    type: guessType(title),
    format: null,
    eligibility: null,
    price: null,
    registrationUrl: null,
    infoUrl: p.URL && /^https?:/.test(p.URL) ? p.URL : source.url,
    description: desc ? desc.slice(0, 400) : null,
    status: (p.STATUS ?? '').toUpperCase() === 'CANCELLED' ? 'cancelled' : 'scheduled',
  };
}

function parseDate(v?: string): { date: string; time: string | null } | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  const isUtc = v.endsWith('Z');
  if (m[4] && isUtc) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
    return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
}

function unescape(s: string) {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}
