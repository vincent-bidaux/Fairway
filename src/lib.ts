import type { Department, EventsQuery, Golf, GolfEvent } from '../shared/types';
import type { Period, Zone } from './store';

const pad = (n: number) => String(n).padStart(2, '0');

// --- Dates ------------------------------------------------------------------

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse 'YYYY-MM-DD' en date LOCALE (pas UTC). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function addDaysISO(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function periodTo(period: Period, from: string): string | undefined {
  switch (period) {
    case '7':
      return addDaysISO(from, 7);
    case '30':
      return addDaysISO(from, 30);
    case '90':
      return addDaysISO(from, 90);
    default:
      return undefined;
  }
}

const fmtLong = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const fmtSection = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtSectionYear = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const fmtMonthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const fmtStamp = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const fmtStampLong = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatLongDate(iso: string): string {
  return cap(fmtLong.format(parseISODate(iso)));
}

export function formatDateRange(e: Pick<GolfEvent, 'startDate' | 'endDate'>): string {
  if (e.endDate && e.endDate !== e.startDate) {
    return `${formatLongDate(e.startDate)} au ${formatLongDate(e.endDate)}`;
  }
  return formatLongDate(e.startDate);
}

export function sectionLabel(iso: string): string {
  const diff = Math.round((parseISODate(iso).getTime() - parseISODate(todayISO()).getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  const d = parseISODate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return cap((sameYear ? fmtSection : fmtSectionYear).format(d));
}

export function dayNumber(iso: string): string {
  return String(parseISODate(iso).getDate());
}

export function monthShort(iso: string): string {
  return fmtMonthShort.format(parseISODate(iso));
}

/** Les horodatages SQLite 'YYYY-MM-DD HH:MM:SS' sont en UTC sans suffixe. */
export function parseTimestamp(s: string): Date {
  if (/^\d{4}-\d\d-\d\d \d/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  if (/^\d{4}-\d\d-\d\dT[\d:.]+$/.test(s)) return new Date(s + 'Z');
  return new Date(s);
}

export function formatStamp(s: string | null): string {
  if (!s) return '—';
  const d = parseTimestamp(s);
  return isNaN(d.getTime()) ? '—' : fmtStamp.format(d);
}

export function formatUpdated(s: string): string {
  const d = parseTimestamp(s);
  return isNaN(d.getTime()) ? '' : fmtStampLong.format(d);
}

export function formatTime(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2})[:h](\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, '0')}h${m[2]}` : t;
}

export function isUpcoming(e: GolfEvent): boolean {
  return (e.endDate ?? e.startDate) >= todayISO();
}

// --- Formats ----------------------------------------------------------------

export function formatKm(n: number | undefined | null): string | null {
  if (n === undefined || n === null || isNaN(n)) return null;
  if (n < 10) return `${n.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(n)} km`;
}

export function holesLabel(h: number | null): string | null {
  return h ? `${h} trous` : null;
}

export function deptName(departments: Department[], code: string): string {
  return departments.find((d) => d.code === code)?.name ?? `Département ${code}`;
}

// --- Zone -------------------------------------------------------------------

export function zoneQuery(zone: Zone | null): Pick<EventsQuery, 'lat' | 'lng' | 'radius' | 'depts'> {
  if (!zone) return {};
  if (zone.mode === 'depts') return { depts: zone.depts.join(',') };
  return { lat: zone.lat, lng: zone.lng, radius: zone.radius };
}

export function zoneLabel(zone: Zone | null, departments: Department[]): string {
  if (!zone) return 'Choisir une zone';
  if (zone.mode === 'position') return `Autour de moi · ${zone.radius} km`;
  if (zone.mode === 'city') return `${zone.name} · ${zone.radius} km`;
  if (zone.depts.length > 2) return `${zone.depts.length} départements`;
  return zone.depts.map((c) => deptName(departments, c)).join(', ');
}

export function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil. Choisissez une ville ou un département."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "L'accès à votre position est refusé. Autorisez-le dans les réglages de votre navigateur, ou choisissez une ville."
            : err.code === err.TIMEOUT
              ? 'La localisation a pris trop de temps. Réessayez ou choisissez une ville.'
              : 'Votre position est indisponible pour le moment. Réessayez ou choisissez une ville.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}

// --- Liens externes ---------------------------------------------------------

export function directionsUrl(p: { lat: number | null; lng: number | null; name: string; city?: string }): string {
  const q = encodeURIComponent(p.name);
  if (p.lat !== null && p.lng !== null) return `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${q}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(`${p.name} ${p.city ?? ''}`.trim())}&q=${q}`;
}

export function golfDirections(g: Golf): string {
  return directionsUrl({ lat: g.lat, lng: g.lng, name: g.name, city: g.city });
}

// --- Calendrier (.ics) ------------------------------------------------------

export function buildICS(e: GolfEvent): string {
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fairway//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:event-${e.id}@fairway`,
    `DTSTAMP:${stamp}`,
  ];
  const t = e.startTime ? /^(\d{1,2})[:h](\d{2})/.exec(e.startTime) : null;
  if (t) {
    const h = Number(t[1]);
    const m = Number(t[2]);
    const endMin = Math.min(h * 60 + m + 270, 23 * 60 + 59);
    const endDay = e.endDate && e.endDate > e.startDate ? e.endDate : e.startDate;
    lines.push(`DTSTART:${ymd(e.startDate)}T${pad(h)}${pad(m)}00`);
    lines.push(`DTEND:${ymd(endDay)}T${pad(Math.floor(endMin / 60))}${pad(endMin % 60)}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(e.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${ymd(addDaysISO(e.endDate ?? e.startDate, 1))}`);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  lines.push(`LOCATION:${esc(`${e.golfName}, ${e.golfCity}`)}`);
  const desc = [e.format, e.eligibility, e.price, e.description].filter(Boolean).join('\n');
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  const url = e.registrationUrl ?? e.infoUrl;
  if (url) lines.push(`URL:${url}`);
  if (e.status === 'cancelled') lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'evenement'
  );
}
