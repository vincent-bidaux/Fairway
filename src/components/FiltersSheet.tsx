import { EVENT_TYPE_LABELS, type EventType } from '../../shared/types';
import { setPrefs, usePrefs } from '../store';
import { Group, Row, SearchField, Switch } from './Controls';
import { Sheet } from './Sheet';

const TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

export function FiltersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { types, q } = usePrefs();
  const toggle = (t: EventType, on: boolean) =>
    setPrefs({ types: on ? [...types, t] : types.filter((x) => x !== t) });
  const active = types.length + (q.trim() ? 1 : 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtres"
      right={
        <button type="button" className="text-btn" onClick={onClose}>
          OK
        </button>
      }
      footer={
        active > 0 ? (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setPrefs({ types: [], q: '' })}>
            Réinitialiser les filtres
          </button>
        ) : undefined
      }
    >
      <div className="sheet-pad">
        <SearchField
          value={q}
          onChange={(v) => setPrefs({ q: v })}
          placeholder="Mot-clé (titre, golf, ville)"
          label="Recherche par mot-clé"
        />
      </div>
      <Group title="Types de compétition" footer="Sans sélection, tous les types sont affichés.">
        {TYPES.map((t) => (
          <Row
            key={t}
            label={EVENT_TYPE_LABELS[t]}
            value={<Switch checked={types.includes(t)} onChange={(v) => toggle(t, v)} label={EVENT_TYPE_LABELS[t]} />}
          />
        ))}
      </Group>
    </Sheet>
  );
}
