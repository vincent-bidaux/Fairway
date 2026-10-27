// Libellés et formats français de la zone admin.
import type { ActivityItem } from '../../shared/admin';

const TZ = 'Europe/Paris';

/* ------------------------------------------------------------------ écrans */

export function screenLabel(key: string | null | undefined): string {
  if (!key) return '—';
  switch (key) {
    case 'tab/events':
      return 'Compétitions';
    case 'tab/golfs':
      return 'Golfs';
    case 'tab/favorites':
      return 'Favoris';
    case 'tab/parties':
      return 'Mes parties';
    case 'tab/settings':
      return 'Réglages';
    case 'session-editor':
      return 'Saisie de séance';
    case 'profile':
      return 'Profil joueur';
    case 'sessions':
      return 'Liste des séances';
    case 'highlights':
      return 'Coups de maître';
    case 'sheet/login':
      return 'Connexion';
    case 'sheet/zone':
      return 'Choix de zone';
    case 'splash':
      return "Écran d'accueil";
  }
  if (key.startsWith('admin')) return 'Admin';
  if (key.startsWith('event/')) return `Compétition #${key.slice(6)}`;
  if (key.startsWith('golf/')) return `Golf #${key.slice(5)}`;
  if (key.startsWith('session/')) return 'Fiche séance';
  if (key.startsWith('stat/')) return `Stat · ${key.slice(5)}`;
  return key;
}

/** Libellé lisible porté par le détail d'un évènement (titre de compétition, nom de golf…). */
export function detailLabel(detail: Record<string, unknown> | null | undefined): string | null {
  const l = detail?.label;
  return typeof l === 'string' && l.trim() ? l.trim() : null;
}

/* ------------------------------------------------------------------ durées et dates */

export function formatDuration(ms: number | null | undefined): string {
  const v = Math.max(0, ms ?? 0);
  if (v < 59_500) return `${Math.round(v / 1000)} s`;
  const totalMin = Math.round(v / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Les dates SQLite (« 2026-10-25 14:03:12 ») sont en UTC sans fuseau. */
export function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** Jour calendaire à Paris, « YYYY-MM-DD ». */
export function parisDay(d: Date): string {
  const parts = fmt('ymd', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayShift(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** « 14:03 » (heure de Paris). */
export function fmtTime(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? fmt('hm', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : '';
}

/** « 12 oct. 14:03 » (avec l'année si ce n'est pas l'année en cours). */
export function fmtStamp(iso: string | null | undefined): string {
  const d = parseIso(iso);
  if (!d) return '—';
  const sameYear = parisDay(d).slice(0, 4) === parisDay(new Date()).slice(0, 4);
  const date = (sameYear ? fmt('dm', { day: 'numeric', month: 'short' }) : fmt('dmy', { day: 'numeric', month: 'short', year: 'numeric' })).format(d);
  return `${date} ${fmtTime(iso)}`;
}

/** « 12 oct. 2026 » */
export function fmtDate(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? fmt('dmy', { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '—';
}

/** « Mardi 27 octobre » */
export function fmtDayLong(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 12/10 » pour l'axe des graphes. */
export function fmtDayAxis(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

export function relTime(iso: string | null | undefined): string {
  const d = parseIso(iso);
  if (!d) return 'jamais';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "à l'instant";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `il y a ${min} min`;
  const day = parisDay(d);
  const today = parisDay(now);
  if (day === today) return `il y a ${Math.floor(min / 60)} h`;
  if (day === dayShift(today, -1)) return `hier ${fmtTime(iso)}`;
  return fmtStamp(iso);
}

/** Liste des `n` derniers jours (Paris), du plus ancien à aujourd'hui. */
export function lastDays(n: number): string[] {
  const today = parisDay(new Date());
  return Array.from({ length: n }, (_, i) => dayShift(today, i - (n - 1)));
}

/* ------------------------------------------------------------------ appareils */

export function deviceLabel(ua: string | null | undefined, screen?: string | null, standalone?: boolean | null): string {
  if (!ua) return screen ? `Appareil · ${screen}` : 'Appareil inconnu';
  let os = 'Appareil';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux|X11/i.test(ua)) os = 'Linux';
  let browser = '';
  if (/EdgA?\/|Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  else if (/AppleWebKit/i.test(ua)) browser = os === 'iPhone' || os === 'iPad' ? 'Safari' : 'WebKit';
  return [os, browser, standalone ? 'app installée' : ''].filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ activité */

const API_LABELS: Record<string, string> = {
  'PUT sessions': 'séance enregistrée',
  'DELETE sessions': 'séance supprimée',
  'PUT profile': 'profil modifié',
  'PUT bag': 'sac modifié',
  'PUT index': 'index ajouté',
};

function apiText(target: string | null): string {
  if (!target) return 'Enregistre une donnée';
  const m = /^([A-Z]+)\s+\/?([^/\s?]+)/.exec(target.trim());
  const mapped = m ? API_LABELS[`${m[1]} ${m[2]}`] : undefined;
  return mapped ? mapped.charAt(0).toUpperCase() + mapped.slice(1) : `Enregistre : ${target}`;
}

function clip(s: string, n = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function activityText(item: ActivityItem): string {
  switch (item.type) {
    case 'open':
      return "Ouvre l'app";
    case 'view': {
      const base = `Regarde ${screenLabel(item.screen)}`;
      return item.durationMs != null && item.durationMs > 0 ? `${base} · ${formatDuration(item.durationMs)}` : base;
    }
    case 'tap':
      return `Touche « ${clip(item.target ?? '?')} »`;
    case 'input': {
      const v = item.detail?.value;
      const field = item.target ?? 'un champ';
      return v == null || v === '' ? `Saisit dans ${field}` : `Saisit « ${clip(String(v))} » dans ${field}`;
    }
    case 'api':
      return apiText(item.target);
    case 'error':
      return `Erreur : ${clip(item.target ?? 'inconnue', 120)}`;
    default:
      return item.target ?? item.type;
  }
}

/** Ligne secondaire d'un évènement : libellé lisible (titre de compétition…) ou message d'erreur. */
export function activitySub(item: ActivityItem): string | null {
  const l = detailLabel(item.detail);
  if (l && l !== item.target) return clip(l, 100);
  if (item.type === 'error') {
    const m = item.detail?.message;
    if (typeof m === 'string' && m) return clip(m, 140);
  }
  return null;
}
