// Suivi d'activité des testeurs (zone admin) : ouvertures, écrans vus et temps passé, touchers, saisies, erreurs.
// Les événements partent par lots vers /api/t (toutes les 15 s, et à la mise en arrière-plan via sendBeacon).
// Le compte est reconnu côté serveur grâce au cookie de session ; sans compte, seul l'appareil est connu.
import type { ActivityType, TrackBatch, TrackEvent } from '../shared/admin';

const DEVICE_KEY = 'fw.device';
const NEW_VISIT_AFTER = 30 * 60e3; // une absence de 30 min ouvre une nouvelle visite
const FLUSH_EVERY = 15e3;

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function loadDevice(): string {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    if (v && /^[A-Za-z0-9_-]{6,64}$/.test(v)) return v;
    const id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

const device = typeof window !== 'undefined' ? loadDevice() : 'ssr';
let visit = randomId();
let queue: TrackEvent[] = [];
let infoSent = false;
/** Écran courant. cont = suite d'une vue déjà comptée (découpée toutes les minutes, ou reprise après l'arrière-plan). */
let view: { screen: string; label?: string; start: number; cont: boolean } | null = null;
let hiddenAt: number | null = null;

/** En-têtes ajoutés aux appels « Mes parties », pour relier les écritures à l'appareil et à la visite. */
export function trackHeaders(): Record<string, string> {
  return { 'x-fairway-device': device, 'x-fairway-visit': visit };
}

export function track(type: ActivityType, target?: string | null, detail?: Record<string, unknown>) {
  if (queue.length >= 500) queue.shift();
  queue.push({
    t: Date.now(),
    type,
    screen: view?.screen,
    ...(target ? { target: target.slice(0, 200) } : {}),
    ...(detail ? { detail } : {}),
  });
}

function closeView(now = Date.now()) {
  if (!view) return;
  const dur = now - view.start;
  if (dur >= 300) {
    const detail = { ...(view.label ? { label: view.label } : {}), ...(view.cont ? { cont: 1 } : {}) };
    queue.push({ t: view.start, type: 'view', screen: view.screen, dur, ...(Object.keys(detail).length ? { detail } : {}) });
    view.cont = true;
  }
  // Le temps compté ne doit jamais l'être deux fois (pagehide puis visibilitychange, découpage à la minute…).
  view.start = now;
}

/** Écran affiché (appelé par App à chaque changement d'onglet, de page ou de feuille). */
export function setScreen(screen: string, label?: string | null) {
  if (view?.screen === screen) {
    if (label && !view.label) view.label = label;
    return;
  }
  const now = Date.now();
  closeView(now);
  view = { screen, label: label || undefined, start: now, cont: false };
}

function info(): TrackBatch['info'] {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    standalone: Boolean(nav.standalone) || window.matchMedia?.('(display-mode: standalone)').matches,
    screen: `${screen.width}×${screen.height} @${Math.round(window.devicePixelRatio * 10) / 10}`,
    lang: navigator.language,
  };
}

function flush(beacon = false) {
  if (!queue.length) return;
  const batch: TrackBatch = { device, visit, events: queue, ...(infoSent ? {} : { info: info() }) };
  queue = [];
  infoSent = true;
  const body = JSON.stringify(batch);
  try {
    if (beacon && navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/t', { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }).catch(() => {
      // Hors ligne : on remet les événements dans la file pour le prochain envoi.
      queue = [...batch.events, ...queue].slice(-500);
      infoSent = false;
    });
  } catch {
    /* rien */
  }
}

// ---------------------------------------------------------------- captation automatique

const clean = (s: string | null | undefined, n = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function tapLabel(el: Element): string {
  const own =
    el.getAttribute('data-track') ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    clean((el as HTMLElement).innerText) ||
    (el instanceof HTMLInputElement ? el.value : '');
  if (own) return clean(own);
  const img = el.querySelector('[aria-label], img[alt]');
  return clean(img?.getAttribute('aria-label') || img?.getAttribute('alt')) || el.tagName.toLowerCase();
}

const TAPPABLE =
  'button, a, [role=button], [role=tab], [role=switch], [role=option], [role=menuitem], summary, label, select, input[type=checkbox], input[type=radio], [data-track]';
const SECRET = (el: HTMLInputElement | HTMLTextAreaElement) =>
  (el instanceof HTMLInputElement && ['password', 'hidden', 'file', 'email'].includes(el.type)) ||
  /one-time-code|password|email/.test(el.getAttribute('autocomplete') ?? '');

function fieldName(el: Element): string {
  const label = el.closest('label');
  return clean(
    el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      label?.querySelector('.field-label')?.textContent ||
      label?.textContent ||
      el.tagName.toLowerCase(),
    60,
  );
}

const lastValue = new WeakMap<Element, string>();
const typing = new WeakMap<Element, number>();

function recordInput(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (!(el instanceof HTMLSelectElement) && SECRET(el)) return;
  if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'button', 'submit'].includes(el.type)) return;
  const value =
    el instanceof HTMLSelectElement ? clean(el.selectedOptions[0]?.textContent || el.value, 120) : clean(el.value, 120);
  if (lastValue.get(el) === value) return;
  lastValue.set(el, value);
  if (!value) return;
  track('input', fieldName(el), { value });
}

let started = false;

/** Démarre la captation (une seule fois, au lancement de l'app). */
export function startTracking() {
  if (started || typeof window === 'undefined') return;
  started = true;

  track('open', null, { path: location.pathname + location.search, referrer: document.referrer || undefined });

  document.addEventListener(
    'click',
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const el = t?.closest(TAPPABLE);
      if (!el || el.closest('[data-track-ignore]')) return;
      const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
      track('tap', tapLabel(el), href && /^https?:/.test(href) ? { href: href.slice(0, 200) } : undefined);
    },
    true,
  );

  // Champs de recherche : la valeur est notée quand la frappe s'arrête ; autres champs : à la validation.
  document.addEventListener(
    'input',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'search') return;
      window.clearTimeout(typing.get(el));
      typing.set(el, window.setTimeout(() => recordInput(el), 1200));
    },
    true,
  );
  document.addEventListener(
    'change',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) recordInput(el);
    },
    true,
  );

  window.addEventListener('error', (e) => track('error', clean(e.message, 200), { src: clean(e.filename, 120), line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string } | undefined;
    track('error', clean(r?.message ?? String(e.reason), 200), { kind: 'promise' });
  });

  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      closeView(now);
      hiddenAt = now;
      flush(true);
    } else {
      if (hiddenAt && now - hiddenAt > NEW_VISIT_AFTER) {
        visit = randomId();
        infoSent = false;
        track('open', null, { resume: true });
      }
      hiddenAt = null;
      if (view) view.start = now;
    }
  });
  window.addEventListener('pagehide', () => {
    if (document.visibilityState !== 'hidden') closeView();
    flush(true);
  });

  window.setInterval(() => {
    // Écran affiché depuis longtemps : on envoie le temps déjà passé, pour ne rien perdre si l'app est tuée.
    if (document.visibilityState === 'visible' && view && Date.now() - view.start > 60e3) {
      closeView();
    }
    flush();
  }, FLUSH_EVERY);
}
