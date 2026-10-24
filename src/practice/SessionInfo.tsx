// Lieu, date, trous et repère : partagés par « Nouvelle séance », la feuille Infos et le formulaire de practice.
import { useEffect, useState } from 'react';
import type { Golf } from '../../shared/types';
import type { HoleEntry, PlaySession } from '../../shared/practice';
import { EVENT_TYPE_LABELS, type GolfEvent } from '../../shared/types';
import { getEvents } from '../api';
import { addDaysISO, formatLongDate } from '../lib';
import { Field, Group, Row, Segmented } from '../components/Controls';
import { ContextPicker } from './contextIcons';
import { Icon } from '../components/Icon';
import { GolfPicker } from './GolfPicker';
import './session.css';

export const TEES = [
  { value: 'blanc', label: 'Blanc', color: '#f2f2f2' },
  { value: 'jaune', label: 'Jaune', color: '#ffcc00' },
  { value: 'bleu', label: 'Bleu', color: '#0a84ff' },
  { value: 'rouge', label: 'Rouge', color: '#ff3b30' },
];

export function teeLabel(t: string | null): string | null {
  return TEES.find((x) => x.value === t)?.label ?? null;
}

/** Entrées complètes (une par trou joué, dans l'ordre de jeu) à partir des trous déjà saisis. */
export function buildEntries(holes: 9 | 18, start: number, existing: HoleEntry[] = [], known: Record<number, number> = {}): HoleEntry[] {
  const out: HoleEntry[] = [];
  for (let k = 0; k < holes; k++) {
    const hole = ((start - 1 + k) % 18) + 1;
    const found = existing.find((e) => e.hole === hole);
    out.push(
      found ?? {
        hole,
        par: known[hole] ?? 4,
        strokes: null,
        putts: null,
        fairway: null,
        gir: null,
        penalties: 0,
        up_down: null,
        sand: null,
      },
    );
  }
  return out;
}

export function dateInputValue(played_at: string): string {
  return played_at.slice(0, 16);
}

interface PlaceDateProps {
  s: PlaySession;
  onChange: (patch: Partial<PlaySession>, golf?: Golf | null) => void;
}

/** Golf (ou autre lieu pour le practice) + date et heure. */
export function PlaceDate({ s, onChange }: PlaceDateProps) {
  const [pick, setPick] = useState(false);
  const isRange = s.kind === 'range';
  const other = isRange && s.golf_id == null && s.place != null;
  const golfLabel = s.golf_id != null ? (s.golf_name ?? 'Golf') : other ? 'Autre lieu' : null;
  return (
    <>
      <Group>
        <Row
          icon={<Icon name="golf" size={17} />}
          iconColor="var(--tint)"
          label="Golf"
          value={<span className={golfLabel ? '' : 'si-placeholder'}>{golfLabel ?? 'Choisir'}</span>}
          chevron
          onClick={() => setPick(true)}
        />
        {other && (
          <Field label="Lieu">
            <input
              type="text"
              value={s.place ?? ''}
              placeholder="Nom du lieu"
              maxLength={120}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => onChange({ place: e.target.value })}
            />
          </Field>
        )}
        <Field label="Date et heure">
          <input
            type="datetime-local"
            className="si-date"
            value={dateInputValue(s.played_at)}
            onChange={(e) => e.target.value && onChange({ played_at: e.target.value })}
            aria-label="Date et heure"
          />
        </Field>
      </Group>
      <GolfPicker
        open={pick}
        onClose={() => setPick(false)}
        selectedId={s.golf_id}
        allowOther={isRange}
        otherSelected={other}
        onOther={() => onChange({ golf_id: null, golf_name: null, golf_city: null, place: s.place ?? '' }, null)}
        onPick={(g) => onChange(g.id === s.golf_id ? {} : { golf_id: g.id, golf_name: g.name, golf_city: g.city, place: null, event_id: null, event_title: null }, g)}
        selectedEventId={s.event_id}
        onPickEvent={
          isRange
            ? undefined
            : (e, g) =>
                // Compétition favorite : golf, compétition et date en une fois (l'heure saisie est gardée).
                onChange(
                  {
                    golf_id: e.golfId,
                    golf_name: e.golfName,
                    golf_city: e.golfCity,
                    place: null,
                    event_id: e.id,
                    event_title: e.title,
                    played_at: `${e.startDate}T${e.startTime ?? s.played_at.slice(11, 16) ?? '09:00'}`,
                  },
                  g ?? undefined,
                )
        }
      />
    </>
  );
}

interface RoundOptionsProps {
  s: PlaySession;
  golfHoles: number | null;
  onChange: (patch: Partial<PlaySession>) => void;
  showStart?: boolean;
}

export function RoundOptions({ s, golfHoles, onChange, showStart = true }: RoundOptionsProps) {
  const holes = s.holes ?? 18;
  const canStart = showStart && holes === 9 && (golfHoles ?? 0) >= 18;
  return (
    <>
      <Group title="Parcours">
        <div className="row row--block si-seg">
          <Segmented<'9' | '18'>
            label="Nombre de trous"
            value={String(holes) as '9' | '18'}
            onChange={(v) => onChange({ holes: v === '9' ? 9 : 18, start_hole: v === '9' ? s.start_hole : 1 })}
            options={[
              { value: '9', label: '9 trous' },
              { value: '18', label: '18 trous' },
            ]}
          />
        </div>
        {canStart && (
          <div className="row row--block si-seg">
            <Segmented<'1' | '10'>
              label="Trou de départ"
              value={s.start_hole === 10 ? '10' : '1'}
              onChange={(v) => onChange({ start_hole: v === '10' ? 10 : 1 })}
              options={[
                { value: '1', label: 'Départ du trou 1' },
                { value: '10', label: 'Départ du trou 10' },
              ]}
            />
          </div>
        )}
      </Group>
      <Group title="Repère de départ" footer="Facultatif.">
        <div className="row row--block">
          <div className="tee-chips" role="radiogroup" aria-label="Repère de départ">
            {TEES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={s.tee === t.value}
                className={`chip tee-chip${s.tee === t.value ? ' is-active' : ''}`}
                onClick={() => onChange({ tee: s.tee === t.value ? null : t.value })}
              >
                <i className="tee-dot" style={{ background: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Group>
    </>
  );
}

/** Titre affiché d'une séance : la compétition si elle existe, sinon le golf. */
export function sessionTitle(s: Pick<PlaySession, 'event_title' | 'golf_name' | 'place' | 'kind'>): string {
  return s.event_title || s.golf_name || s.place || (s.kind === 'round' ? 'Partie' : 'Practice');
}

const fmtEventDate = (e: GolfEvent) => {
  const d = formatLongDate(e.startDate).split(' ').slice(0, 3).join(' ');
  return `${d}${e.startTime ? ` · ${e.startTime.replace(':', 'h')}` : ''}`;
};

/** Lie la partie à une compétition de l'agenda (golf + date ±1 jour), ou à une compétition libre. */
export function CompetitionGroup({ s, onChange }: { s: PlaySession; onChange: (p: Partial<PlaySession>) => void }) {
  const [events, setEvents] = useState<GolfEvent[]>([]);
  const [custom, setCustom] = useState(false);
  const day = s.played_at.slice(0, 10);
  const golfId = s.golf_id;
  useEffect(() => {
    if (golfId == null || !day) {
      setEvents([]);
      return;
    }
    let alive = true;
    getEvents({ golfId, from: addDaysISO(day, -1), to: addDaysISO(day, 1), limit: 20 })
      .then((r) => alive && setEvents(r.items.filter((e) => e.status !== 'cancelled')))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [golfId, day]);

  const linked = s.event_id != null;
  const freeTitle = !linked && !!s.event_title;
  const isCustom = custom || freeTitle;
  const known = linked && !events.some((e) => e.id === s.event_id);
  if (golfId == null || (!events.length && !linked && !isCustom && !custom)) {
    // Rien à proposer : pas de groupe, sauf si une compétition libre est déjà saisie.
    return null;
  }
  const none = !linked && !isCustom;
  const radio = (on: boolean) => (
    <span className={`check${on ? ' is-on' : ''}`}>
      <Icon name="check" size={18} strokeWidth={2.6} />
    </span>
  );
  return (
    <Group title="Compétition" footer="Rattachez la partie à une compétition de l’agenda, ou jouez librement.">
      <button type="button" className="row row--tap" role="radio" aria-checked={none} onClick={() => { setCustom(false); onChange({ event_id: null, event_title: null }); }}>
        <span className="row-main"><span className="row-label">Partie libre</span></span>
        {radio(none)}
      </button>
      {known && (
        <button type="button" className="row row--tap" role="radio" aria-checked onClick={() => undefined}>
          <span className="row-main">
            <span className="row-label">{s.event_title}</span>
            <span className="row-sub">Compétition de l’agenda</span>
          </span>
          {radio(true)}
        </button>
      )}
      {events.map((e) => (
        <button
          key={e.id}
          type="button"
          className="row row--tap"
          role="radio"
          aria-checked={s.event_id === e.id}
          onClick={() => { setCustom(false); onChange({ event_id: e.id, event_title: e.title }); }}
        >
          <span className="row-main">
            <span className="row-label">{e.title}</span>
            <span className="row-sub">{[EVENT_TYPE_LABELS[e.type], e.format, fmtEventDate(e)].filter(Boolean).join(' · ')}</span>
          </span>
          {radio(s.event_id === e.id)}
        </button>
      ))}
      <button type="button" className="row row--tap" role="radio" aria-checked={isCustom} onClick={() => { setCustom(true); onChange({ event_id: null }); }}>
        <span className="row-main"><span className="row-label">Autre compétition…</span></span>
        {radio(isCustom)}
      </button>
      {isCustom && (
        <Field label="Titre">
          <input
            type="text"
            value={s.event_title ?? ''}
            placeholder="Nom de la compétition"
            maxLength={120}
            autoComplete="off"
            enterKeyHint="done"
            autoFocus={custom && !freeTitle}
            onChange={(e) => onChange({ event_id: null, event_title: e.target.value || null })}
          />
        </Field>
      )}
    </Group>
  );
}

/** Météo + forme physique (connues avant le départ). */
export function BeforeGroup({ s, onChange }: { s: PlaySession; onChange: (p: Partial<PlaySession>) => void }) {
  return (
    <Group title="Conditions" footer="Facultatif. Sert à comparer vos scores selon la météo et votre forme.">
      <div className="row row--block ctx-row">
        <ContextPicker kind="weather" value={s.weather} onChange={(v) => onChange({ weather: v })} />
      </div>
      <div className="row row--block ctx-row">
        <ContextPicker kind="body" value={s.body} onChange={(v) => onChange({ body: v })} />
      </div>
    </Group>
  );
}
