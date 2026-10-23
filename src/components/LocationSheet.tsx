import { useCallback, useEffect, useState } from 'react';
import type { Commune, DepartmentCode } from '../../shared/types';
import { getCommunes } from '../api';
import { useDebounced } from '../hooks';
import { getPosition } from '../lib';
import { setPrefs, usePrefs, type Zone, type ZoneMode } from '../store';
import { useUi } from '../ui';
import { Group, Row, SearchField, Segmented, Spinner } from './Controls';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

interface CityDraft {
  name: string;
  postcode: string | null;
  lat: number;
  lng: number;
}

function RadiusSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = ((value - 5) / 145) * 100;
  return (
    <Group title="Rayon de recherche">
      <div className="slider-row">
        <div className="slider-head">
          <span>Rayon</span>
          <strong>{value} km</strong>
        </div>
        <input
          type="range"
          min={5}
          max={150}
          step={5}
          value={value}
          aria-label="Rayon de recherche en kilomètres"
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="slider-scale" aria-hidden="true">
          <span>5 km</span>
          <span>150 km</span>
        </div>
      </div>
    </Group>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode?: ZoneMode;
  autoLocate?: boolean;
}

export function LocationSheet({ open, onClose, initialMode, autoLocate }: Props) {
  const { zone, lastRadius } = usePrefs();
  const ui = useUi();
  const [mode, setMode] = useState<ZoneMode>('position');
  const [radius, setRadius] = useState(30);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [city, setCity] = useState<CityDraft | null>(null);
  const [depts, setDepts] = useState<DepartmentCode[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Commune[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const dq = useDebounced(query.trim(), 250);

  const locate = useCallback(async () => {
    setGeoBusy(true);
    setGeoError(null);
    try {
      setPos(await getPosition());
    } catch (e) {
      setGeoError((e as Error).message);
    } finally {
      setGeoBusy(false);
    }
  }, []);

  // Initialisation à chaque ouverture, depuis la zone mémorisée.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode ?? zone?.mode ?? 'position');
    setRadius(zone && zone.mode !== 'depts' ? zone.radius : lastRadius);
    setPos(zone?.mode === 'position' ? { lat: zone.lat, lng: zone.lng } : null);
    setCity(
      zone?.mode === 'city'
        ? { name: zone.name, postcode: zone.postcode, lat: zone.lat, lng: zone.lng }
        : null,
    );
    setDepts(zone?.mode === 'depts' ? zone.depts : []);
    setGeoError(null);
    setQuery('');
    setResults([]);
    if (autoLocate) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Autocomplétion des communes.
  useEffect(() => {
    if (!open || mode !== 'city' || dq.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    setSearchError(null);
    getCommunes(dq, ctrl.signal)
      .then((r) => {
        setResults(r.slice(0, 20));
        setSearching(false);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted) return;
        setSearchError(e.message);
        setSearching(false);
      });
    return () => ctrl.abort();
  }, [dq, mode, open]);

  const valid = mode === 'position' ? !!pos : mode === 'city' ? !!city : depts.length > 0;

  const submit = () => {
    if (!valid) return;
    let z: Zone;
    if (mode === 'position' && pos) z = { mode, lat: pos.lat, lng: pos.lng, radius };
    else if (mode === 'city' && city) z = { mode, ...city, radius };
    else z = { mode: 'depts', depts };
    setPrefs({ zone: z, lastRadius: mode === 'depts' ? lastRadius : radius });
    onClose();
  };

  const toggleDept = (code: DepartmentCode) =>
    setDepts((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Où jouer ?"
      right={
        <button type="button" className="text-btn" onClick={onClose}>
          Annuler
        </button>
      }
      footer={
        <button type="button" className="btn btn--block" disabled={!valid} onClick={submit}>
          Valider
        </button>
      }
    >
      <div className="sheet-pad">
        <Segmented<ZoneMode>
          label="Mode de localisation"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'position', label: 'Ma position' },
            { value: 'city', label: 'Une ville' },
            { value: 'depts', label: 'Départements' },
          ]}
        />
      </div>

      {mode === 'position' && (
        <>
          <div className="sheet-pad">
            <button type="button" className="btn btn--secondary btn--block" onClick={locate} disabled={geoBusy}>
              {geoBusy ? <Spinner small /> : <Icon name="locate" size={18} fill />}
              {pos ? 'Actualiser ma position' : 'Me localiser'}
            </button>
            {pos && !geoError && (
              <p className="hint hint--ok">
                <Icon name="check-circle" size={16} /> Position trouvée.
              </p>
            )}
            {geoError && (
              <p className="hint hint--error" role="alert">
                {geoError}
              </p>
            )}
          </div>
          <RadiusSlider value={radius} onChange={setRadius} />
        </>
      )}

      {mode === 'city' && (
        <>
          <div className="sheet-pad">
            <SearchField value={query} onChange={setQuery} placeholder="Rechercher une ville" label="Ville" />
          </div>
          {city && query.trim() === '' && (
            <Group title="Ville choisie">
              <Row
                icon={<Icon name="pin" size={16} />}
                iconColor="var(--tint)"
                label={city.name}
                value={city.postcode ?? undefined}
              />
            </Group>
          )}
          {dq.length >= 2 && (
            <Group title="Résultats">
              {searching && results.length === 0 && (
                <div className="row row--center">
                  <Spinner small />
                </div>
              )}
              {searchError && <div className="row hint--error">{searchError}</div>}
              {!searching && !searchError && results.length === 0 && (
                <div className="row row--muted">Aucune commune trouvée.</div>
              )}
              {results.map((c) => (
                <Row
                  key={`${c.code}-${c.postcode}`}
                  label={c.name}
                  value={c.postcode ?? c.department}
                  onClick={() => {
                    setCity({ name: c.name, postcode: c.postcode, lat: c.lat, lng: c.lng });
                    setQuery('');
                  }}
                />
              ))}
            </Group>
          )}
          {city && <RadiusSlider value={radius} onChange={setRadius} />}
        </>
      )}

      {mode === 'depts' && (
        <Group
          title="Départements de Nouvelle-Aquitaine"
          footer="Sélectionnez un ou plusieurs départements."
        >
          {ui.departments.length === 0 && <div className="row row--muted">Chargement des départements…</div>}
          {ui.departments.map((d) => {
            const on = depts.includes(d.code);
            return (
              <button
                key={d.code}
                type="button"
                role="checkbox"
                aria-checked={on}
                className="row row--tap"
                onClick={() => toggleDept(d.code)}
              >
                <span className="row-main">
                  <span className="row-label">{d.name}</span>
                  <span className="row-sub">
                    {d.code} · {d.golfCount} golf{d.golfCount > 1 ? 's' : ''}
                  </span>
                </span>
                <span className={`check${on ? ' is-on' : ''}`}>
                  <Icon name="check" size={20} strokeWidth={2.6} />
                </span>
              </button>
            );
          })}
        </Group>
      )}
    </Sheet>
  );
}
