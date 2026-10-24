// Feuille de choix du golf : favoris (golfs et compétitions), récents, distance, A–Z, département, recherche.
import { useEffect, useMemo, useState } from 'react';
import type { Golf, GolfEvent } from '../../shared/types';
import { getEvent, getGolfs } from '../api';
import { Group, SearchField, Segmented, Spinner } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { deptName, formatKm, getPosition } from '../lib';
import { useGolfFavorites, usePrefs } from '../store';
import { useUi } from '../ui';
import { recentGolfs } from './api';
import './session.css';

type Sort = 'fav' | 'distance' | 'az' | 'dept';

let golfCache: Golf[] | null = null;
const eventCache = new Map<number, GolfEvent | null>();
const dShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDay = (iso: string) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso);
  return m ? dShort.format(new Date(+m[1], +m[2] - 1, +m[3], 12)) : iso;
};

function haversine(a: { lat: number; lng: number }, lat: number, lng: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat - a.lat) * rad;
  const dLng = (lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  open: boolean;
  onClose: () => void;
  selectedId: number | null;
  onPick: (g: Golf) => void;
  /** Practice : ligne « Autre lieu » (libellés modifiables, ex. « Aucun golf d'attache »). */
  allowOther?: boolean;
  otherSelected?: boolean;
  onOther?: () => void;
  otherLabel?: string;
  otherSub?: string;
  title?: string;
  /** Saisie d'une partie : l'onglet Favoris propose aussi les compétitions favorites. */
  onPickEvent?: (e: GolfEvent, golf: Golf | null) => void;
  selectedEventId?: number | null;
}

export function GolfPicker({ open, onClose, selectedId, onPick, allowOther, otherSelected, onOther, otherLabel, otherSub, title, onPickEvent, selectedEventId }: Props) {
  const ui = useUi();
  const favs = useGolfFavorites();
  const { favorites: favEventIds } = usePrefs();
  const [favEvents, setFavEvents] = useState<GolfEvent[]>([]);
  const hasFavs = favs.length > 0 || (!!onPickEvent && favEventIds.length > 0);
  const [golfs, setGolfs] = useState<Golf[]>(golfCache ?? []);
  const [loading, setLoading] = useState(!golfCache);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [posTried, setPosTried] = useState(false);
  const [sort, setSort] = useState<Sort>('distance');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ('');
    if (hasFavs) setSort('fav');
    else setSort((v) => (v === 'fav' ? 'distance' : v));
    let alive = true;
    if (!golfCache) {
      setLoading(true);
      getGolfs({ limit: 1000 })
        .then((r) => {
          golfCache = r.items;
          if (alive) {
            setGolfs(r.items);
            setError(null);
          }
        })
        .catch((e: Error) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    }
    recentGolfs()
      .then((ids) => alive && setRecent(ids.slice(0, 3)))
      .catch(() => undefined);
    if (!posTried) {
      setPosTried(true);
      getPosition()
        .then((p) => alive && setPos(p))
        .catch(() => alive && setSort((s) => (s === 'distance' ? 'az' : s)));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Compétitions favorites (saisie d'une partie) : chargées une fois, gardées en mémoire.
  useEffect(() => {
    if (!open || !onPickEvent || !favEventIds.length) {
      setFavEvents([]);
      return;
    }
    let alive = true;
    const ids = favEventIds.slice(-40);
    Promise.all(
      ids.map((id) =>
        eventCache.has(id)
          ? Promise.resolve(eventCache.get(id) ?? null)
          : getEvent(id)
              .then((e) => (eventCache.set(id, e), e))
              .catch(() => (eventCache.set(id, null), null)),
      ),
    ).then((list) => {
      if (!alive) return;
      setFavEvents(list.filter((e): e is GolfEvent => !!e).sort((a, b) => b.startDate.localeCompare(a.startDate)));
    });
    return () => {
      alive = false;
    };
  }, [open, onPickEvent, favEventIds]);

  const withDist = useMemo(
    () =>
      golfs.map((g) => ({
        g,
        km: pos && g.lat != null && g.lng != null ? haversine(pos, g.lat, g.lng) : null,
      })),
    [golfs, pos],
  );

  const query = norm(q.trim());
  const filtered = useMemo(
    () => (query ? withDist.filter(({ g }) => norm(`${g.name} ${g.city}`).includes(query)) : withDist),
    [withDist, query],
  );

  const sections = useMemo(() => {
    const out: Array<{ title: string; items: typeof filtered }> = [];
    if (!query) {
      const rec = recent
        .map((id) => withDist.find((x) => x.g.id === id))
        .filter((x): x is (typeof withDist)[number] => !!x);
      if (rec.length) out.push({ title: 'Récents', items: rec });
    }
    const rest = filtered;
    if (sort === 'fav') {
      const fav = rest.filter((x) => favs.includes(x.g.id));
      out.length = 0; // pas de « Récents » dans l'onglet Favoris
      if (fav.length) {
        out.push({
          title: 'Golfs favoris',
          items: [...fav].sort((a, b) => (pos ? (a.km ?? 1e9) - (b.km ?? 1e9) : a.g.name.localeCompare(b.g.name, 'fr'))),
        });
      }
    } else if (sort === 'distance' && pos) {
      out.push({
        title: query ? 'Résultats' : 'Par distance',
        items: [...rest].sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9)),
      });
    } else if (sort === 'dept') {
      const map = new Map<string, typeof filtered>();
      for (const x of rest) {
        const arr = map.get(x.g.department);
        if (arr) arr.push(x);
        else map.set(x.g.department, [x]);
      }
      [...map.entries()]
        .map(([code, items]) => ({ title: deptName(ui.departments, code), items: items.sort((a, b) => a.g.name.localeCompare(b.g.name, 'fr')) }))
        .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
        .forEach((s) => out.push(s));
    } else {
      out.push({ title: query ? 'Résultats' : 'A–Z', items: [...rest].sort((a, b) => a.g.name.localeCompare(b.g.name, 'fr')) });
    }
    return out;
  }, [filtered, recent, withDist, sort, pos, query, ui.departments, favs]);

  const row = ({ g, km }: { g: Golf; km: number | null }, key: string) => (
    <button
      key={key}
      type="button"
      className="row row--tap gp-row"
      onClick={() => {
        onPick(g);
        onClose();
      }}
    >
      <span className="row-main">
        <span className="row-label gp-name">
          {favs.includes(g.id) && <Icon name="star" size={13} fill className="gp-star" />}
          {g.name}
        </span>
        <span className="row-sub">{[g.city, g.holes ? `${g.holes} trous` : null].filter(Boolean).join(' · ')}</span>
      </span>
      {km != null && <span className="row-value gp-km">{formatKm(km)}</span>}
      <span className={`check${selectedId === g.id ? ' is-on' : ''}`}>
        <Icon name="check" size={18} strokeWidth={2.6} />
      </span>
    </button>
  );

  const shownEvents = sort === 'fav' && onPickEvent ? favEvents.filter((e) => !query || norm(`${e.title} ${e.golfName} ${e.golfCity}`).includes(query)) : [];
  const eventRow = (e: GolfEvent) => (
    <button
      key={`ev-${e.id}`}
      type="button"
      className="row row--tap gp-row"
      onClick={() => {
        onPickEvent?.(e, golfs.find((g) => g.id === e.golfId) ?? null);
        onClose();
      }}
    >
      <span className="row-main">
        <span className="row-label gp-name">
          <Icon name="star" size={13} fill className="gp-star" />
          {e.title}
        </span>
        <span className="row-sub">{[e.golfName, fmtDay(e.startDate)].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={`check${selectedEventId === e.id ? ' is-on' : ''}`}>
        <Icon name="check" size={18} strokeWidth={2.6} />
      </span>
    </button>
  );
  const favEmpty = sort === 'fav' && sections.every((x) => !x.items.length) && !shownEvents.length;

  return (
    <Sheet open={open} onClose={onClose} title={title ?? 'Choisir un golf'}>
      <div className="gp-controls">
        <SearchField value={q} onChange={setQ} placeholder="Rechercher un golf ou une ville" label="Rechercher un golf" />
        <Segmented<Sort>
          label="Tri"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'fav', label: 'Favoris' },
            { value: 'distance', label: 'Distance' },
            { value: 'az', label: 'A–Z' },
            { value: 'dept', label: 'Dép.' },
          ]}
        />
        {sort === 'distance' && !pos && posTried && (
          <p className="gp-note">Position indisponible : le tri par distance n’est pas possible. Autorisez la localisation pour l’activer.</p>
        )}
      </div>
      {allowOther && !query && (
        <Group>
          <button
            type="button"
            className="row row--tap"
            onClick={() => {
              onOther?.();
              onClose();
            }}
          >
            <span className="row-icon" style={{ background: 'var(--indigo)' }}>
              <Icon name="pin" size={16} />
            </span>
            <span className="row-main">
              <span className="row-label">{otherLabel ?? 'Autre lieu'}</span>
              {(otherSub ?? 'Practice hors golf, terrain d’entraînement…') && <span className="row-sub">{otherSub ?? 'Practice hors golf, terrain d’entraînement…'}</span>}
            </span>
            <span className={`check${otherSelected ? ' is-on' : ''}`}>
              <Icon name="check" size={18} strokeWidth={2.6} />
            </span>
          </button>
        </Group>
      )}
      {loading && !golfs.length ? (
        <div className="gp-loading">
          <Spinner />
        </div>
      ) : error && !golfs.length ? (
        <p className="gp-note gp-note--error">{error}</p>
      ) : favEmpty ? (
        <p className="gp-note">
          {query
            ? `Aucun favori ne correspond à « ${q} ».`
            : `Aucun favori pour l’instant. Touchez l’étoile sur la fiche d’un golf${onPickEvent ? ' ou d’une compétition' : ''} pour le retrouver ici.`}
        </p>
      ) : sort !== 'fav' && sections.every((s) => !s.items.length) ? (
        <p className="gp-note">Aucun golf ne correspond à « {q} ».</p>
      ) : (
        <>
          {sections.map((s) => (
            <Group key={s.title} title={s.title}>
              {s.items.map((x) => row(x, `${s.title}-${x.g.id}`))}
            </Group>
          ))}
          {shownEvents.length > 0 && <Group title="Compétitions favorites">{shownEvents.map(eventRow)}</Group>}
        </>
      )}
    </Sheet>
  );
}
