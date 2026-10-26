// Coups d'un trou sur la carte, directement dans l'écran de saisie (enregistrement automatique) :
// toucher la carte ou « Ma position » place le coup suivant, puis on choisit le club et « Dans le trou » termine le trou.
// Le score, les putts (green dessiné) et le fairway (fairways dessinés) se déduisent de la carte, et restent modifiables.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { geoToPlan, planToGeo, type GeoPoint } from '../../shared/plan';
import { CLUB_BY_ID, DEFAULT_BAG, type Fairway, type HoleEntry, type Shot } from '../../shared/practice';
import { curveD, holeFrame, PlanBase, pts, ringD, useZoomPan } from '../components/CourseWidget';
import { Icon } from '../components/Icon';
import { useDataVersion } from './account';
import { getProfile } from './api';
import type { HolePlan } from './holePlan';
import { boxAround, dist, greenBox, holeGreen, holePin, holeTee, puttsFrom, shotDistances, shotPoints, type Box, type Pt } from './shotGeo';
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

// ---------------------------------------------------------------- repère tourné (départ en bas, drapeau en haut)
const ASPECT = 0.85;
/** En deçà de cette distance du drapeau, la carte zoome vers le green à chaque coup. */
const APPROACH_M = 150;
/** Marge autour du green et de la balle quand on zoome. */
const GREEN_MARGIN = 12;

interface Frame {
  deg: number;
  rot: (p: Pt) => Pt;
  unrot: (p: Pt) => Pt;
  box: Box;
  tee: Pt;
  pin: Pt;
  green: Pt[] | null;
}

function makeFrame(hp: HolePlan): Frame {
  const f = holeFrame(hp.hole, ASPECT);
  const t = (f.deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return {
    deg: f.deg,
    rot: ([x, y]) => [x * c - y * s, x * s + y * c],
    unrot: ([x, y]) => [x * c + y * s, -x * s + y * c],
    // de la place sous le départ pour la bulle d'aide (même proportions)
    box: { x: f.box.x - (f.box.h * 0.12 * ASPECT) / 2, y: f.box.y, w: f.box.w + f.box.h * 0.12 * ASPECT, h: f.box.h * 1.12 },
    tee: holeTee(hp.hole),
    pin: holePin(hp.hole),
    green: holeGreen(hp.plan, hp.hole),
  };
}

const fmtM = (n: number) => `${Math.round(n)} m`;
/** Avec la carte, le dernier coup placé finit dans le trou (au moins le départ et un 2e coup). */
const isHoled = (shots: Shot[]) => shots.length >= 2 && shots[shots.length - 1].lat != null;
const blank = (): Shot => ({ lat: null, lon: null, club: null });

/** Fairway du drive déduit de la position du 2e coup : dans un fairway dessiné, sinon côté de la ligne du trou. */
function fairwayOf(hp: HolePlan, p: Pt | null, frame: Frame): Fairway | null {
  if (!p) return null;
  const fws = hp.plan.layers.fairway ?? [];
  if (!fws.length) return null;
  const inside = fws.some((shape) => {
    const r = pts(shape[0] ?? []);
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) hit = !hit;
    }
    return hit;
  });
  if (inside) return 'hit';
  // côté : dans le repère tourné, le trou monte ; x négatif = gauche du joueur
  const q = frame.rot(p), t = frame.rot(frame.tee), g = frame.rot(frame.pin);
  const along = (q[1] - t[1]) / (g[1] - t[1] || 1);
  if (along < 0.25) return 'short';
  const lineX = t[0] + (g[0] - t[0]) * along;
  return q[0] < lineX ? 'left' : 'right';
}

/** Patch d'un trou après modification des coups : score si « dans le trou », putts et fairway déduits. */
function derive(e: HoleEntry, shots: Shot[], holed: boolean, hp: HolePlan | null, frame: Frame | null, opts: { fairway?: boolean } = {}): Partial<HoleEntry> {
  const out: Partial<HoleEntry> = { shots: shots.length ? shots : null };
  if (holed) out.strokes = Math.max(1, shots.length);
  if (hp && frame) {
    const points = shotPoints(shots, hp.plan.origin, frame.tee);
    if (holed) {
      const putts = puttsFrom(points, frame.green, frame.pin);
      if (putts != null) out.putts = putts;
    }
    if (opts.fairway && e.par >= 4 && points[1]) {
      const fw = fairwayOf(hp, points[1], frame);
      if (fw) out.fairway = fw;
    }
    const d = shotDistances(points, frame.pin, holed);
    out.shots = shots.length ? shots.map((s, i) => ({ ...s, dist: d[i] != null ? Math.round(d[i]!) : null })) : null;
  }
  return out;
}

// ---------------------------------------------------------------- carte
function MapStage({
  hp,
  frame,
  points,
  current,
  holed,
  me,
  active,
  onTap,
}: {
  hp: HolePlan;
  frame: Frame;
  points: Array<Pt | null>;
  current: number;
  holed: boolean;
  me: Pt | null;
  active: boolean;
  onTap: (p: Pt, onLast: boolean) => void;
}) {
  const zp = useZoomPan(frame.box);
  const u = zp.u;
  const placed = points.map((p, i) => (p ? { p: frame.rot(p), i } : null)).filter((x): x is { p: Pt; i: number } => !!x);
  // départ toujours visible : le coup 1 part du départ tant qu'aucun coup n'est placé
  const teeGhost = placed.length === 0 ? frame.rot(frame.tee) : null;
  const last = placed.length ? placed[placed.length - 1] : null;
  const pin = frame.rot(frame.pin);
  const gBox = greenBox(frame.green, frame.pin);
  const gCorners: Pt[] = frame.green ? frame.green.map(frame.rot) : [[gBox.x, gBox.y], [gBox.x + gBox.w, gBox.y], [gBox.x, gBox.y + gBox.h], [gBox.x + gBox.w, gBox.y + gBox.h]].map((p) => frame.rot(p as Pt));

  const zoomGreen = useCallback(() => zp.zoomTo(boxAround(gCorners, GREEN_MARGIN)), [zp, gCorners]);
  // Près du green, chaque nouveau coup recadre sur la balle et le green ; loin, on voit tout le trou.
  const lastKey = last ? `${last.i}:${last.p[0].toFixed(1)}:${last.p[1].toFixed(1)}` : '';
  useEffect(() => {
    if (!active || !last) return;
    const lp = points[last.i]!;
    const d = dist(lp, frame.pin);
    if (d <= APPROACH_M) zp.zoomTo(boxAround([last.p, ...gCorners], GREEN_MARGIN, 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey, active]);

  const meR = me ? frame.rot(me) : null;
  const toPin = me ? dist(me, frame.pin) : null;
  const near = toPin != null && toPin < 1500;

  const onClick = (ev: React.MouseEvent) => {
    if (zp.wasDrag()) return;
    const w = zp.toWorld(ev.clientX, ev.clientY);
    const onLast = !!last && last.i > 0 && Math.hypot(w[0] - last.p[0], w[1] - last.p[1]) < 18 * u;
    onTap(frame.unrot(w), onLast);
  };

  return (
    <div ref={zp.stage} className={`sm-stage${zp.zoomed ? ' is-zoomed' : ''}`} {...zp.handlers} onClick={onClick}>
      <svg className="sm-svg" viewBox={zp.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Carte du trou ${hp.hole.ref}. Touchez la carte pour placer le coup ${current + 1}.`}>
        <rect x={frame.box.x - frame.box.w} y={frame.box.y - frame.box.h} width={frame.box.w * 3} height={frame.box.h * 3} className="sm-bg" />
        <g transform={`rotate(${frame.deg})`}>
          <PlanBase plan={hp.plan} />
          <path className="sm-hole" d={ringD(hp.hole.line, false)} vectorEffect="non-scaling-stroke" />
        </g>
        {placed.length > 1 && <path className="sm-path" d={curveD(placed.map((x) => x.p))} vectorEffect="non-scaling-stroke" />}
        {last && <path className={`sm-path${holed ? '' : ' sm-path--rest'}`} d={holed ? curveD([last.p, pin]) : `M${last.p.join(' ')}L${pin.join(' ')}`} vectorEffect="non-scaling-stroke" />}
        <circle cx={pin[0]} cy={pin[1]} r={6 * u} strokeWidth={2 * u} className="sm-pin" />
        {placed.map(({ p, i }) => (
          <g key={i} className={`sm-shot${i === current ? ' is-sel' : ''}${last && i === last.i && i > 0 ? ' is-last' : ''}`}>
            <circle cx={p[0]} cy={p[1]} r={11 * u} strokeWidth={2 * u} />
            <text x={p[0]} y={p[1]} fontSize={11 * u}>
              {i + 1}
            </text>
          </g>
        ))}
        {teeGhost && (
          <g className={`sm-shot sm-shot--tee${current === 0 ? ' is-sel' : ''}`}>
            <circle cx={teeGhost[0]} cy={teeGhost[1]} r={11 * u} strokeWidth={2 * u} />
            <text x={teeGhost[0]} y={teeGhost[1]} fontSize={11 * u}>
              1
            </text>
          </g>
        )}
        {meR && near && (
          <g className="sm-me">
            <circle cx={meR[0]} cy={meR[1]} r={16 * u} className="sm-me-halo" />
            <circle cx={meR[0]} cy={meR[1]} r={6.5 * u} strokeWidth={2.5 * u} className="sm-me-dot" />
          </g>
        )}
      </svg>
      {near && toPin != null && (
        <div className="sm-topin" aria-label={`Drapeau à ${Math.round(toPin)} mètres`}>
          <small>Drapeau</small>
          {fmtM(toPin)}
        </div>
      )}
      <div className="sm-tools">
        <div className="cw-zoom sm-zoom">
          <button
            type="button"
            aria-label="Zoomer sur le dernier coup"
            onClick={(ev) => {
              ev.stopPropagation();
              if (last) zp.zoomAround(1.7, last.p);
              else zp.zoomBy(1.7);
            }}
          >
            <Icon name="plus" size={18} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Dézoomer" onClick={(ev) => { ev.stopPropagation(); zp.zoomBy(1 / 1.7); }} disabled={!zp.zoomed}>
            <span className="cw-minus" aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="sm-green-btn" onClick={(ev) => { ev.stopPropagation(); zoomGreen(); }}>
          Green
        </button>
        {zp.zoomed && (
          <button type="button" className="sm-green-btn" onClick={(ev) => { ev.stopPropagation(); zp.reset(); }}>
            Trou
          </button>
        )}
      </div>
      <div className="sm-hint" aria-hidden="true">
        {last && last.i > 0 ? `Touchez pour le coup ${last.i + 2} · touchez le ${last.i + 1} pour l’effacer` : `Touchez où est la balle pour le coup ${current + 1}`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- panneau complet
const MAP_KEY = 'fairway:entry:map';
function readMapOpen(): boolean {
  try {
    return localStorage.getItem(MAP_KEY) !== '0';
  } catch {
    return true;
  }
}

export function HoleMapPanel({
  e,
  hp,
  active,
  onPatch,
  sel,
  setSel,
}: {
  e: HoleEntry;
  hp: HolePlan | null;
  /** Trou affiché (la position GPS n'est suivie que pour lui). */
  active: boolean;
  onPatch: (p: Partial<HoleEntry>) => void;
  /** Coup choisi dans la liste pour être déplacé ou changer de club (null = coup suivant). */
  sel: number | null;
  setSel: (i: number | null) => void;
}) {
  const bag = useBag();
  const [open, setOpen] = useState(readMapOpen);
  const [me, setMe] = useState<GeoPoint | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const frame = useMemo(() => (hp ? makeFrame(hp) : null), [hp]);
  const origin = hp?.plan.origin;
  const canMap = !!(frame && origin);
  const shots = e.shots ?? [];
  // le dernier coup placé finit dans le trou : le score suit le nombre de coups (dès le 2e)
  const holed = canMap && isHoled(shots);
  const points = useMemo(() => (frame ? shotPoints(shots, origin, frame.tee) : shots.map(() => null)), [shots, origin, frame]);
  // coup en cours : celui choisi dans la liste, sinon le dernier (pour son club), ou le départ
  const current = sel ?? Math.max(0, shots.length - 1);
  const nextIndex = shots.length === 0 ? 1 : shots.length;

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(MAP_KEY, o ? '0' : '1');
      } catch {
        /* ignoré */
      }
      return !o;
    });
  };

  // position du joueur, seulement sur le trou affiché et carte ouverte
  const mePt = me && origin ? geoToPlan(origin, me) : null;
  useEffect(() => {
    if (!active || !open || !canMap || !('geolocation' in navigator)) return;
    let id: number | null = null;
    try {
      id = navigator.geolocation.watchPosition(
        (p) => setMe({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => setMe(null),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    } catch {
      /* refusé */
    }
    return () => {
      if (id != null) navigator.geolocation.clearWatch(id);
    };
  }, [active, open, canMap]);

  const commit = (list: Shot[]) => onPatch(derive(e, list, canMap && isHoled(list), hp, frame));

  const placeAt = (p: Pt) => {
    if (!origin) return;
    const g = planToGeo(origin, p[0], p[1]);
    const shot = { lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6) };
    const list = shots.slice();
    let index: number;
    if (sel != null && sel < list.length) {
      list[sel] = { ...list[sel], ...shot };
      index = sel;
      setSel(null);
    } else {
      if (!list.length) list.push(blank()); // départ implicite (au départ du trou)
      list.push({ ...blank(), ...shot });
      index = list.length - 1;
    }
    onPatch(derive(e, list, isHoled(list), hp, frame, { fairway: index === 1 }));
    setGeoErr(null);
  };

  const removeLast = () => {
    if (!shots.length) return;
    let list = shots.slice(0, -1);
    if (list.length === 1 && list[0].lat == null && !list[0].club) list = [];
    setSel(null);
    if (!list.length) onPatch({ shots: null, ...(holed ? { strokes: null, putts: null } : {}) });
    else if (canMap && !isHoled(list)) onPatch({ ...derive(e, list, false, hp, frame), ...(holed ? { strokes: null, putts: null } : {}) });
    else commit(list);
  };

  const setClub = (id: string) => {
    if (!canMap && sel == null) {
      // sans carte : chaque club touché ajoute un coup, dans l'ordre joué
      return commit([...shots, { ...blank(), club: id }]);
    }
    const list = shots.length ? shots.slice() : [blank()];
    const i = Math.min(current, list.length - 1);
    list[i] = { ...list[i], club: list[i].club === id ? null : id };
    commit(list);
  };

  const hereNow = () => {
    if (!('geolocation' in navigator)) return setGeoErr('La localisation n’est pas disponible sur cet appareil.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (!origin || !frame) return;
        const q = geoToPlan(origin, { lat: p.coords.latitude, lon: p.coords.longitude });
        if (dist(q, frame.pin) > 1500) return setGeoErr('Vous semblez loin de ce trou : touchez la carte pour placer le coup.');
        placeAt(q);
      },
      (err) => {
        setLocating(false);
        setGeoErr(err.code === 1 ? 'Autorisez la localisation dans les réglages du navigateur pour utiliser votre position.' : 'Position introuvable pour le moment. Réessayez ou touchez la carte.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
  };

  const curShot = shots[current];
  const summary = shots.length
    ? `${shots.length} coup${shots.length > 1 ? 's' : ''}`
    : canMap
      ? 'Placez vos coups'
      : 'Notez vos clubs';

  return (
    <section className={`smp${open ? ' is-open' : ''}`} aria-label="Coups du trou">
      <button type="button" className="smp-head" aria-expanded={open} onClick={toggle}>
        <span className="smp-title">{canMap ? 'Carte du trou' : 'Coups et clubs'}</span>
        <span className="smp-sum">{summary}</span>
        <Icon name="chevron" size={13} strokeWidth={2.8} className="smp-chev" />
      </button>

      {open && (
        <div className="smp-body">
          {canMap && frame && hp ? (
            <MapStage hp={hp} frame={frame} points={points} current={sel ?? nextIndex} holed={holed} me={mePt} active={active} onTap={(p, onLast) => (onLast ? removeLast() : placeAt(p))} />
          ) : frame ? (
            <p className="sm-note">La carte de ce trou est en préparation. Vous pouvez déjà noter vos clubs.</p>
          ) : null}

          <div className="smp-actions">
            {canMap && (
              <button type="button" className="smp-here" onClick={hereNow} disabled={locating}>
                <Icon name="locate" size={15} strokeWidth={2.2} />
                {locating ? 'Localisation…' : 'Ma position'}
              </button>
            )}
          </div>
          {geoErr && <p className="sm-err">{geoErr}</p>}

          <div className="smp-clubs-head">
            {canMap || sel != null ? `Club du ${current === 0 ? 'départ' : `coup ${current + 1}`}` : 'Touchez le club de chaque coup, dans l’ordre'}
            {sel != null && (
              <button type="button" className="text-btn" onClick={() => setSel(null)}>
                Terminé
              </button>
            )}
          </div>
          <div className="sm-clubs" role="radiogroup" aria-label={`Club du coup ${current + 1}`}>
            {bag.map((id) => {
              const c = CLUB_BY_ID[id];
              if (!c) return null;
              const picked = curShot?.club === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={picked} aria-label={c.label} className={`sm-club${picked ? ' is-on' : ''}`} onClick={() => setClub(id)}>
                  {c.short}
                </button>
              );
            })}
          </div>
          {sel != null && canMap && <p className="sm-note sm-note--inline">Touchez la carte pour déplacer le coup {sel + 1}.</p>}
        </div>
      )}
    </section>
  );
}

/** Liste des coups, à la suite du contenu du trou. */
export function ShotList({ e, hp, onPatch, onSelect }: { e: HoleEntry; hp: HolePlan | null; onPatch: (p: Partial<HoleEntry>) => void; onSelect?: (i: number) => void }) {
  const shots = e.shots ?? [];
  const frame = useMemo(() => (hp ? makeFrame(hp) : null), [hp]);
  const canMap = !!(frame && hp?.plan.origin);
  const holed = canMap && isHoled(shots);
  const points = useMemo(() => (frame && hp ? shotPoints(shots, hp.plan.origin, frame.tee) : shots.map(() => null)), [shots, hp, frame]);
  if (!shots.length) return null;
  const removeLast = () => {
    let list = shots.slice(0, -1);
    if (list.length === 1 && list[0].lat == null && !list[0].club) list = [];
    if (!list.length) return onPatch({ shots: null, ...(holed ? { strokes: null, putts: null } : {}) });
    onPatch({ ...derive(e, list, canMap && isHoled(list), hp, frame), ...(holed && !isHoled(list) ? { strokes: null, putts: null } : {}) });
  };
  return (
    <div className="sl">
      <div className="sl-head">
        <span>Coups</span>
        <button type="button" className="text-btn sl-clear" onClick={() => onPatch({ shots: null, ...(holed ? { strokes: null, putts: null } : {}) })}>
          Supprimer tous les coups
        </button>
      </div>
      <div className="sm-list" role="list">
        {shots.map((s, i) => {
          const d = s.dist;
          const lastRow = i === shots.length - 1;
          return (
            <div key={i} role="listitem" className="sm-row">
              <button type="button" className="sm-row-head" onClick={() => onSelect?.(i)} aria-label={`Coup ${i + 1}, ${s.club ? CLUB_BY_ID[s.club]?.label : 'club non noté'}${d != null ? `, ${d} mètres` : ''}. Modifier.`}>
                <span className={`sm-num${points[i] ? ' is-placed' : ''}`}>{i + 1}</span>
                <span className="sm-row-main">
                  <span className="sm-row-title">{i === 0 ? 'Départ' : `Coup ${i + 1}`}</span>
                  <span className="sm-row-sub">{s.club ? CLUB_BY_ID[s.club]?.label : 'Club ?'}</span>
                </span>
                <span className="sm-dist">{d != null ? fmtM(d) : ''}</span>
              </button>
              {lastRow && (
                <button type="button" className="sm-del" aria-label={`Supprimer le coup ${i + 1}`} onClick={removeLast}>
                  <Icon name="close" size={14} strokeWidth={2.6} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {holed && <p className="sl-foot">Dans le trou en {shots.length} coup{shots.length > 1 ? 's' : ''}.</p>}
    </div>
  );
}
