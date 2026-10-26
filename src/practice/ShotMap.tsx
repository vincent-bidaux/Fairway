// Coups d'un trou sur la carte : position de chaque coup (toucher la carte ou « Ma position »), trajet de la balle,
// distances et club utilisé. Sans plan du trou, seule la liste des clubs est proposée.
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoToPlan, planToGeo, type GeoPoint } from '../../shared/plan';
import { CLUB_BY_ID, DEFAULT_BAG, type HoleEntry, type Shot } from '../../shared/practice';
import { holeFrame, PlanBase, pts, ringD, useZoomPan, type Pt } from '../components/CourseWidget';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useDataVersion } from './account';
import { getProfile } from './api';
import type { HolePlan } from './holePlan';
import './shots.css';

// ---------------------------------------------------------------- sac du joueur
let bagCache: { v: number; p: Promise<string[]> } | null = null;

/** Clubs du sac déclaré (ou sac par défaut). */
export function useBag(): string[] {
  const version = useDataVersion();
  const [bag, setBag] = useState<string[]>(DEFAULT_BAG);
  useEffect(() => {
    if (!bagCache || bagCache.v !== version) {
      bagCache = { v: version, p: getProfile().then((p) => (p.bag?.length ? p.bag : DEFAULT_BAG)).catch(() => DEFAULT_BAG) };
    }
    let alive = true;
    bagCache.p.then((b) => alive && setBag(b));
    return () => {
      alive = false;
    };
  }, [version]);
  return bag;
}

// ---------------------------------------------------------------- géométrie
interface Frame {
  deg: number;
  rot: (p: Pt) => Pt;
  unrot: (p: Pt) => Pt;
  box: ReturnType<typeof holeFrame>['box'];
  tee: Pt;
  pin: Pt;
}

const ASPECT = 0.8;

function makeFrame(hp: HolePlan): Frame {
  const f = holeFrame(hp.hole, ASPECT);
  const t = (f.deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const line = pts(hp.hole.line);
  return {
    deg: f.deg,
    rot: ([x, y]) => [x * c - y * s, x * s + y * c],
    unrot: ([x, y]) => [x * c + y * s, -x * s + y * c],
    box: f.box,
    tee: line[0],
    pin: line[line.length - 1],
  };
}

const m = (n: number) => `${Math.round(n)} m`;

/** Positions (repère du plan) des coups, le départ par défaut pour le 1er coup. */
function shotPoints(shots: Shot[], origin: GeoPoint | undefined, tee: Pt | null): Array<Pt | null> {
  return shots.map((s, i) => {
    if (origin && s.lat != null && s.lon != null) return geoToPlan(origin, { lat: s.lat, lon: s.lon });
    return i === 0 ? tee : null;
  });
}

/** Distance de chaque coup : jusqu'au coup suivant, ou jusqu'au drapeau pour le dernier coup d'un trou terminé. */
export function shotDistances(points: Array<Pt | null>, pin: Pt | null, holed: boolean): Array<number | null> {
  return points.map((p, i) => {
    if (!p) return null;
    const next = i + 1 < points.length ? points[i + 1] : holed ? pin : null;
    return next ? Math.hypot(next[0] - p[0], next[1] - p[1]) : null;
  });
}

/** Nombre de lignes de coups à afficher. */
const rowCount = (e: HoleEntry, shots: Shot[]) => Math.max(e.strokes ?? 0, shots.length, 1);

function padShots(shots: Shot[], n: number): Shot[] {
  const out = shots.slice(0, Math.max(n, shots.length));
  while (out.length < n) out.push({ lat: null, lon: null, club: null });
  return out;
}

/** Retire les coups vides en fin de liste. */
function trimShots(shots: Shot[]): Shot[] {
  const out = shots.slice();
  while (out.length && out[out.length - 1].lat == null && !out[out.length - 1].club) out.pop();
  return out;
}

// ---------------------------------------------------------------- dessin
function ShotLayer({ frame, points, u, selected, player }: { frame: Frame; points: Array<Pt | null>; u: number; selected?: number | null; player?: Pt | null }) {
  const placed = points.map((p, i) => (p ? { p: frame.rot(p), i } : null)).filter((x): x is { p: Pt; i: number } => !!x);
  const pin = frame.rot(frame.pin);
  return (
    <g className="sm-layer">
      {placed.length > 1 && <path className="sm-path" d={'M' + placed.map((x) => x.p.join(' ')).join('L')} vectorEffect="non-scaling-stroke" />}
      {placed.length > 0 && <path className="sm-path sm-path--rest" d={`M${placed[placed.length - 1].p.join(' ')}L${pin.join(' ')}`} vectorEffect="non-scaling-stroke" />}
      <circle cx={pin[0]} cy={pin[1]} r={6 * u} strokeWidth={2 * u} className="sm-pin" />
      {placed.map(({ p, i }) => (
        <g key={i} className={`sm-shot${selected === i ? ' is-sel' : ''}`}>
          <circle cx={p[0]} cy={p[1]} r={11 * u} strokeWidth={2 * u} />
          <text x={p[0]} y={p[1]} fontSize={11 * u}>
            {i + 1}
          </text>
        </g>
      ))}
      {player && (
        <g className="sm-me">
          <circle cx={frame.rot(player)[0]} cy={frame.rot(player)[1]} r={16 * u} className="sm-me-halo" />
          <circle cx={frame.rot(player)[0]} cy={frame.rot(player)[1]} r={6.5 * u} strokeWidth={2.5 * u} className="sm-me-dot" />
        </g>
      )}
    </g>
  );
}

/** Aperçu dans la saisie : le trou, les coups placés et le trajet. */
export function ShotPreview({ e, hp, onOpen }: { e: HoleEntry; hp: HolePlan | null; onOpen: () => void }) {
  const frame = useMemo(() => (hp ? makeFrame(hp) : null), [hp]);
  const shots = e.shots ?? [];
  const placed = shots.filter((s) => s.lat != null).length;
  const clubs = shots.map((s) => (s.club ? CLUB_BY_ID[s.club]?.short : null)).filter(Boolean);
  if (!hp || !frame) {
    return (
      <button type="button" className="sm-card sm-card--list" onClick={onOpen}>
        <span className="sm-card-text">
          <span className="sm-card-title">Clubs utilisés</span>
          <span className="sm-card-sub">{clubs.length ? clubs.join(' · ') : 'Notez le club de chaque coup'}</span>
        </span>
        <Icon name="chevron" size={13} strokeWidth={2.8} className="sm-card-chev" />
      </button>
    );
  }
  const origin = hp.plan.origin;
  const points = shotPoints(shots, origin, frame.tee);
  const b = frame.box;
  const u = b.h / 180;
  return (
    <button type="button" className="sm-card" onClick={onOpen} aria-label={`Carte du trou ${e.hole} : ${placed ? `${placed} coup${placed > 1 ? 's' : ''} placé${placed > 1 ? 's' : ''}` : 'placer les coups'}`}>
      <svg className="sm-mini" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect x={b.x} y={b.y} width={b.w} height={b.h} className="sm-bg" />
        <g transform={`rotate(${frame.deg})`}>
          <PlanBase plan={hp.plan} />
          <path className="sm-hole" d={ringD(hp.hole.line, false)} vectorEffect="non-scaling-stroke" />
        </g>
        <ShotLayer frame={frame} points={points} u={u} />
      </svg>
      <span className="sm-card-text">
        <span className="sm-card-title">Coups sur la carte</span>
        <span className="sm-card-sub">
          {placed > 1 || (placed === 1 && shots[0]?.lat == null)
            ? `${placed} placé${placed > 1 ? 's' : ''}${clubs.length ? ` · ${clubs.join(' · ')}` : ''}`
            : origin
              ? 'Touchez pour placer vos coups et noter vos clubs'
              : 'Carte en préparation : notez vos clubs'}
        </span>
      </span>
      <Icon name="chevron" size={13} strokeWidth={2.8} className="sm-card-chev" />
    </button>
  );
}

/** Carte interactive (montée seulement quand la feuille est ouverte, pour que le zoom connaisse sa taille). */
function ShotStage({
  frame,
  hp,
  points,
  sel,
  me,
  toPin,
  onPlace,
}: {
  frame: Frame;
  hp: HolePlan;
  points: Array<Pt | null>;
  sel: number;
  me: Pt | null;
  toPin: number | null;
  onPlace: (p: Pt) => void;
}) {
  const base = frame.box;
  const zp = useZoomPan(base);
  const u = zp.u;
  const onClick = (ev: React.MouseEvent) => {
    if (zp.wasDrag()) return;
    onPlace(frame.unrot(zp.toWorld(ev.clientX, ev.clientY)));
  };
  return (
    <div ref={zp.stage} className={`sm-stage${zp.zoomed ? ' is-zoomed' : ''}`} {...zp.handlers} onClick={onClick}>
      <svg className="sm-svg" viewBox={zp.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Carte du trou ${hp.hole.ref}. Touchez la carte pour placer le coup ${sel + 1}.`}>
        <rect x={base.x - base.w} y={base.y - base.h} width={base.w * 3} height={base.h * 3} className="sm-bg" />
        <g transform={`rotate(${frame.deg})`}>
          <PlanBase plan={hp.plan} />
          <path className="sm-hole" d={ringD(hp.hole.line, false)} vectorEffect="non-scaling-stroke" />
        </g>
        <ShotLayer frame={frame} points={points} u={u} selected={sel} player={me} />
      </svg>
      <div className="sm-hint" aria-live="polite">
        Touchez la carte pour placer le coup <b>{sel + 1}</b>
      </div>
      {toPin != null && (
        <div className="sm-topin">
          <small>Drapeau</small>
          {m(toPin)}
        </div>
      )}
      <div className="cw-zoom sm-zoom">
        <button type="button" aria-label="Zoomer" onClick={(ev) => { ev.stopPropagation(); zp.zoomBy(1.6); }}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
        </button>
        <button type="button" aria-label="Dézoomer" onClick={(ev) => { ev.stopPropagation(); zp.zoomBy(1 / 1.6); }} disabled={!zp.zoomed}>
          <span className="cw-minus" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- éditeur
export function ShotSheet({
  open,
  onClose,
  e,
  hp,
  bag,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  e: HoleEntry;
  hp: HolePlan | null;
  bag: string[];
  onSave: (shots: Shot[] | null) => void;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [sel, setSel] = useState(0);
  const [me, setMe] = useState<GeoPoint | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const watch = useRef<number | null>(null);
  const frame = useMemo(() => (hp ? makeFrame(hp) : null), [hp]);
  const origin = hp?.plan.origin;
  const canMap = !!(frame && origin);
  const holed = e.strokes != null;

  // ouverture : copie de travail ; le prochain coup à placer est sélectionné
  useEffect(() => {
    if (!open) return;
    // avec une carte : au moins le départ et le coup 2 ; sans score saisi, toujours une ligne libre pour le coup suivant
    const base0 = e.shots ?? [];
    let n = Math.max(rowCount(e, base0), hp?.plan.origin ? 2 : 1);
    if (e.strokes == null && base0.length && base0[base0.length - 1].lat != null) n = Math.max(n, base0.length + 1);
    const list = padShots(base0, n);
    setShots(list);
    const next = list.findIndex((s, i) => i > 0 && s.lat == null);
    setSel(next > 0 ? next : 0);
    setGeoErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // position du joueur pendant que la carte est ouverte
  useEffect(() => {
    if (!open || !canMap || !('geolocation' in navigator)) return;
    try {
      watch.current = navigator.geolocation.watchPosition(
        (p) => setMe({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => setMe(null),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    } catch {
      /* refusé */
    }
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    };
  }, [open, canMap]);

  const points = useMemo(() => shotPoints(shots, origin, frame?.tee ?? null), [shots, origin, frame]);
  const dists = useMemo(() => shotDistances(points, frame?.pin ?? null, holed), [points, frame, holed]);
  const mePt = me && origin ? geoToPlan(origin, me) : null;
  const meFar = mePt && frame ? Math.hypot(mePt[0] - frame.pin[0], mePt[1] - frame.pin[1]) > 1500 : false;
  const toPin = mePt && frame && !meFar ? Math.hypot(mePt[0] - frame.pin[0], mePt[1] - frame.pin[1]) : null;

  const setShot = (i: number, patch: Partial<Shot>) => setShots((l) => padShots(l, i + 1).map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const place = (p: Pt) => {
    if (!origin) return;
    const g = planToGeo(origin, p[0], p[1]);
    setShot(sel, { lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6) });
    // coup suivant : la ligne existante, ou une nouvelle tant que le score n'est pas saisi
    if (sel + 1 < shots.length) setSel(sel + 1);
    else if (e.strokes == null || sel + 1 < e.strokes) {
      setShots((l) => padShots(l, sel + 2));
      setSel(sel + 1);
    }
  };


  const hereNow = () => {
    if (!('geolocation' in navigator)) {
      setGeoErr('La localisation n’est pas disponible sur cet appareil.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const g = { lat: p.coords.latitude, lon: p.coords.longitude };
        if (origin && frame) {
          const q = geoToPlan(origin, g);
          if (Math.hypot(q[0] - frame.pin[0], q[1] - frame.pin[1]) > 1500) {
            setGeoErr('Vous semblez loin de ce trou : placez le coup en touchant la carte.');
            return;
          }
          setGeoErr(null);
          place(q);
        }
      },
      (err) => {
        setLocating(false);
        setGeoErr(err.code === 1 ? 'Autorisez la localisation dans les réglages du navigateur pour utiliser votre position.' : 'Position introuvable pour le moment. Réessayez ou touchez la carte.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
  };

  const save = () => {
    const out = trimShots(shots).map((s, i) => {
      // le départ est implicite : on l'enregistre dès qu'un 2e coup est placé, pour garder la distance du drive
      const filled = i === 0 && s.lat == null && origin && frame && points[1] ? planToGeo(origin, frame.tee[0], frame.tee[1]) : null;
      const d = dists[i];
      return {
        ...s,
        ...(filled ? { lat: +filled.lat.toFixed(6), lon: +filled.lon.toFixed(6) } : {}),
        dist: d != null ? Math.round(d) : null,
      };
    });
    onSave(out.length ? out : null);
    onClose();
  };

  const rows = shots.length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Trou n° ${e.hole} · coups`}
      footer={
        <button type="button" className="btn btn--block" onClick={save}>
          Enregistrer
        </button>
      }
    >
      {canMap && frame ? (
        <div className="sm-wrap">
          <ShotStage frame={frame} hp={hp!} points={points} sel={sel} me={meFar ? null : mePt} toPin={toPin} onPlace={place} />
          <div className="sm-actions">
            <button type="button" className="btn btn--secondary sm-here" onClick={hereNow} disabled={locating}>
              <Icon name="locate" size={16} strokeWidth={2} />
              {locating ? 'Localisation…' : `Ma position = coup ${sel + 1}`}
            </button>
            {shots[sel]?.lat != null && sel > 0 && (
              <button type="button" className="text-btn" onClick={() => setShot(sel, { lat: null, lon: null })}>
                Effacer
              </button>
            )}
          </div>
          {geoErr && <p className="sm-err">{geoErr}</p>}
        </div>
      ) : (
        <p className="sm-note">{frame ? 'La carte de ce trou est en préparation. Vous pouvez déjà noter vos clubs.' : 'Pas de carte pour ce trou. Notez le club de chaque coup.'}</p>
      )}

      <div className="sm-list" role="list">
        {Array.from({ length: rows }, (_, i) => {
          const s = shots[i] ?? { lat: null, lon: null, club: null };
          const d = dists[i];
          const on = i === sel;
          return (
            <div key={i} role="listitem" className={`sm-row${on ? ' is-sel' : ''}`}>
              <button type="button" className="sm-row-head" onClick={() => setSel(i)} aria-pressed={on}>
                <span className={`sm-num${points[i] ? ' is-placed' : ''}`}>{i + 1}</span>
                <span className="sm-row-main">
                  <span className="sm-row-title">{i === 0 ? 'Départ' : `Coup ${i + 1}`}</span>
                  <span className="sm-row-sub">
                    {s.club ? CLUB_BY_ID[s.club]?.label : 'Club ?'}
                    {canMap && !points[i] ? ' · non placé' : ''}
                  </span>
                </span>
                <span className="sm-dist">{d != null ? m(d) : ''}</span>
              </button>
              {on && (
                <div className="sm-clubs" role="radiogroup" aria-label={`Club du coup ${i + 1}`}>
                  {bag.map((id) => {
                    const c = CLUB_BY_ID[id];
                    if (!c) return null;
                    const picked = s.club === id;
                    return (
                      <button key={id} type="button" role="radio" aria-checked={picked} aria-label={c.label} className={`sm-club${picked ? ' is-on' : ''}`} onClick={() => setShot(i, { club: picked ? null : id })}>
                        {c.short}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {e.strokes == null && (
          <button type="button" className="text-btn sm-add" onClick={() => { setShots((l) => [...l, { lat: null, lon: null, club: null }]); setSel(rows); }}>
            Ajouter un coup
          </button>
        )}
      </div>
    </Sheet>
  );
}
