// Saisie d'une séance de practice : durée, balles, travail, exercices, ressenti, note.
import { useState } from 'react';
import type { Drill, DrillCategory, PlaySession } from '../../shared/practice';
import { Group } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { PlaceDate } from './SessionInfo';
import './session.css';

const buzz = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* rien */
  }
};

export const FOCUS: Array<{ key: DrillCategory; label: string }> = [
  { key: 'long', label: 'Grand jeu' },
  { key: 'approach', label: 'Approches' },
  { key: 'chip', label: 'Chipping' },
  { key: 'bunker', label: 'Bunker' },
  { key: 'putting', label: 'Putting' },
];
export const focusLabel = (k: string) => FOCUS.find((f) => f.key === k)?.label ?? k;
export const FEELING = ['Difficile', 'Moyen', 'Correct', 'Bon', 'Excellent'];

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const PRESETS: Array<{ label: string; category: DrillCategory; distance_m: number | null }> = [
  { label: 'Putts à 1 m', category: 'putting', distance_m: 1 },
  { label: 'Putts à 2 m', category: 'putting', distance_m: 2 },
  { label: 'Putts à 4 m', category: 'putting', distance_m: 4 },
  { label: 'Chips à moins d’1 m', category: 'chip', distance_m: 1 },
  { label: 'Approches à 50 m dans le rond', category: 'approach', distance_m: 50 },
  { label: 'Driver dans le couloir', category: 'long', distance_m: null },
  { label: 'Sorties de bunker', category: 'bunker', distance_m: null },
];
const CAT_LABEL: Record<DrillCategory, string> = { long: 'Grand jeu', approach: 'Approches', chip: 'Chipping', bunker: 'Bunker', putting: 'Putting' };

function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  big,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  big?: boolean;
}) {
  return (
    <div className={`stepper${big ? ' stepper--big' : ''}`} role="group" aria-label={label}>
      <button type="button" aria-label={`Moins ${label.toLowerCase()}`} disabled={value <= min} onClick={() => { buzz(); onChange(Math.max(min, value - step)); }}>
        −
      </button>
      <button type="button" aria-label={`Plus ${label.toLowerCase()}`} disabled={value >= max} onClick={() => { buzz(); onChange(Math.min(max, value + step)); }}>
        +
      </button>
    </div>
  );
}

interface Props {
  s: PlaySession;
  update: (fn: (s: PlaySession) => PlaySession) => void;
  setGolfN: (n: number | null) => void;
  busy: boolean;
  onSave: () => void;
  onBack: () => void;
  isNew: boolean;
}

export function PracticeForm({ s, update, setGolfN, busy, onSave, onBack, isNew }: Props) {
  const [add, setAdd] = useState(false);
  const [custom, setCustom] = useState('');
  const [customCat, setCustomCat] = useState<DrillCategory>('putting');
  const drills = s.drills ?? [];
  const focus = (s.focus ?? '').split(',').filter(Boolean);
  const ballsPreset = [30, 50, 70, 100];
  const [ballsOther, setBallsOther] = useState(s.balls != null && !ballsPreset.includes(s.balls));
  const dur = s.duration_min ?? 60;

  const setDrills = (fn: (d: Drill[]) => Drill[]) =>
    update((x) => ({ ...x, drills: fn(x.drills ?? []).map((d, i) => ({ ...d, position: i + 1 })) }));
  const addDrill = (label: string, category: DrillCategory, distance_m: number | null) => {
    setDrills((d) => [...d, { position: d.length + 1, category, label, distance_m, attempts: 10, successes: 0 }]);
    // Ce qu'on a travaillé se coche tout seul avec l'exercice.
    update((x) => {
      const f = (x.focus ?? '').split(',').filter(Boolean);
      return f.includes(category) ? x : { ...x, focus: [...f, category].join(',') };
    });
    setAdd(false);
    setCustom('');
  };

  return (
    <Screen
      title="Practice"
      left={<BackButton onClick={onBack} label={isNew ? 'Retour' : 'Annuler'} />}
      right={
        <button type="button" className="text-btn re-finish" onClick={onSave} disabled={busy}>
          {busy ? 'Envoi…' : 'Enregistrer'}
        </button>
      }
    >
      <PlaceDate
        s={s}
        onChange={(p, g) => {
          if (g !== undefined) setGolfN(g?.holes ?? null);
          update((x) => ({ ...x, ...p }));
        }}
      />

      <Group title="Durée">
        <div className="row pf-row">
          <span className="pf-big">{fmtDuration(dur)}</span>
          <Stepper label="Durée" value={dur} min={15} max={480} step={15} onChange={(v) => update((x) => ({ ...x, duration_min: v }))} />
        </div>
      </Group>

      <Group title="Balles">
        <div className="row row--block">
          <div className="pf-chips" role="radiogroup" aria-label="Nombre de balles">
            {ballsPreset.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={s.balls === b && !ballsOther}
                className={`cr-chip${s.balls === b && !ballsOther ? ' is-active' : ''}`}
                onClick={() => {
                  buzz(5);
                  setBallsOther(false);
                  update((x) => ({ ...x, balls: x.balls === b ? null : b }));
                }}
              >
                {b}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={ballsOther}
              className={`cr-chip${ballsOther ? ' is-active' : ''}`}
              onClick={() => setBallsOther(true)}
            >
              Autre
            </button>
          </div>
          {ballsOther && (
            <input
              className="pf-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={2000}
              placeholder="Nombre de balles"
              aria-label="Nombre de balles"
              value={s.balls ?? ''}
              autoFocus
              onChange={(e) => update((x) => ({ ...x, balls: e.target.value ? Math.max(1, Math.min(2000, Number(e.target.value))) : null }))}
            />
          )}
        </div>
      </Group>

      <Group title="Travail" footer="Ce que vous avez travaillé pendant la séance.">
        <div className="row row--block">
          <div className="pf-chips pf-chips--wrap" role="group" aria-label="Ce que vous avez travaillé">
            {FOCUS.map((f) => {
              const on = focus.includes(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  className={`cr-chip cr-chip--auto${on ? ' is-active' : ''}`}
                  onClick={() => {
                    buzz(5);
                    const next = on ? focus.filter((k) => k !== f.key) : FOCUS.map((x) => x.key).filter((k) => k === f.key || focus.includes(k));
                    update((x) => ({ ...x, focus: next.length ? next.join(',') : null }));
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </Group>

      <Group title="Exercices" footer={drills.length ? undefined : 'Facultatif. Notez par exemple 7 putts rentrés sur 10 à 2 m.'}>
        {drills.map((d, i) => {
          const a = d.attempts ?? 0;
          const ok = d.successes ?? 0;
          const pct = a ? Math.round((100 * ok) / a) : 0;
          return (
            <div className="row drill" key={i}>
              <div className="drill-head">
                <div className="drill-title">
                  <span className="drill-name">{d.label}</span>
                  <span className="drill-cat">{CAT_LABEL[d.category]}</span>
                </div>
                <button type="button" className="drill-del" aria-label={`Supprimer l’exercice ${d.label}`} onClick={() => setDrills((x) => x.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div className="drill-body">
                <div className="drill-score">
                  <strong>{ok}</strong>
                  <span> / {a}</span>
                  <em>{pct} %</em>
                </div>
                <Stepper
                  big
                  label="Réussites"
                  value={ok}
                  min={0}
                  max={a}
                  onChange={(v) => setDrills((x) => x.map((y, j) => (j === i ? { ...y, successes: v } : y)))}
                />
              </div>
              <div className="bar" role="img" aria-label={`${pct} % de réussite`}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="drill-att">
                <span>Tentatives</span>
                <Stepper
                  label="Tentatives"
                  value={a}
                  min={1}
                  max={200}
                  onChange={(v) => setDrills((x) => x.map((y, j) => (j === i ? { ...y, attempts: v, successes: Math.min(y.successes ?? 0, v) } : y)))}
                />
                <strong>{a}</strong>
              </div>
            </div>
          );
        })}
        <button type="button" className="row row--tap add-row" onClick={() => setAdd(true)}>
          <span className="add-ic">
            <Icon name="plus" size={16} strokeWidth={2.6} />
          </span>
          <span className="row-label add-label">Ajouter un exercice</span>
        </button>
      </Group>

      <Group title="Ressenti">
        <div className="row row--block feel">
          <div className="feel-stars" role="radiogroup" aria-label="Ressenti sur 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={s.feeling === n}
                aria-label={`${n} sur 5, ${FEELING[n - 1].toLowerCase()}`}
                className={`feel-star${(s.feeling ?? 0) >= n ? ' is-on' : ''}`}
                onClick={() => {
                  buzz(6);
                  update((x) => ({ ...x, feeling: x.feeling === n ? null : n }));
                }}
              >
                <Icon name="star" size={32} fill={(s.feeling ?? 0) >= n} />
              </button>
            ))}
          </div>
          <div className="feel-cap" aria-live="polite">
            {s.feeling ? FEELING[s.feeling - 1] : 'Touchez pour noter la séance'}
          </div>
        </div>
      </Group>

      <Group title="Note">
        <div className="row row--block">
          <textarea
            className="notes-input"
            rows={3}
            maxLength={2000}
            placeholder="Sensations, points à retenir…"
            value={s.notes ?? ''}
            onChange={(e) => update((x) => ({ ...x, notes: e.target.value || null }))}
            aria-label="Note de la séance"
          />
        </div>
      </Group>

      <div className="pf-save">
        <button type="button" className="btn btn--block" onClick={onSave} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer la séance'}
        </button>
      </div>

      <Sheet open={add} onClose={() => setAdd(false)} title="Ajouter un exercice">
        <Group>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="row row--tap" onClick={() => addDrill(p.label, p.category, p.distance_m)}>
              <span className="row-main">
                <span className="row-label">{p.label}</span>
                <span className="row-sub">{CAT_LABEL[p.category]}</span>
              </span>
              <Icon name="plus" size={16} strokeWidth={2.4} className="chevron" />
            </button>
          ))}
        </Group>
        <Group title="Exercice personnalisé">
          <div className="row row--block cust">
            <input
              className="pf-input"
              type="text"
              placeholder="Nom de l’exercice"
              aria-label="Nom de l’exercice"
              maxLength={80}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <div className="pf-chips pf-chips--wrap" role="radiogroup" aria-label="Catégorie">
              {FOCUS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={customCat === f.key}
                  className={`cr-chip cr-chip--auto${customCat === f.key ? ' is-active' : ''}`}
                  onClick={() => setCustomCat(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn--block" disabled={!custom.trim()} onClick={() => addDrill(custom.trim(), customCat, null)}>
              Ajouter
            </button>
          </div>
        </Group>
      </Sheet>
    </Screen>
  );
}
