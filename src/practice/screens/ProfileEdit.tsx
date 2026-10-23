// Modifier la carte joueur : photo, nom, golf d'attache, ville, naissance, main, licence, index.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Golf } from '../../../shared/types';
import { getGolfs } from '../../api';
import { Field, Group, Row, SearchField, Segmented, Spinner } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { BackButton, Screen } from '../../components/Screen';
import { ErrorState } from '../../components/States';
import { Sheet } from '../../components/Sheet';
import { useUi } from '../../ui';
import { touchData, useAccount } from '../account';
import { deleteIndex, getProfile, putIndex, saveProfile, type Profile } from '../api';
import { fmtDateShortYear, golfLabel, initials, nf } from '../statsFormat';
import '../practice.css';

type Hand = 'right' | 'left' | null;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recadre au centre en 256×256 et encode en JPEG (qualité 0,82). */
export async function resizeToDataUrl(file: File, size = 256, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileEdit() {
  const ui = useUi();
  const account = useAccount();
  const [loaded, setLoaded] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [golfId, setGolfId] = useState<number | null>(null);
  const [golfName, setGolfName] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [birth, setBirth] = useState('');
  const [hand, setHand] = useState<Hand>(null);
  const [licence, setLicence] = useState('');
  const [since, setSince] = useState('');
  const [history, setHistory] = useState<Profile['index_history']>([]);
  const [saving, setSaving] = useState(false);
  const [golfSheet, setGolfSheet] = useState(false);
  const [indexSheet, setIndexSheet] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    getProfile()
      .then((p) => {
        if (!live) return;
        setLoaded(p);
        setName(p.display_name ?? '');
        setPhoto(p.photo);
        setGolfId(p.home_golf_id);
        setGolfName(p.home_golf_name ? golfLabel(p.home_golf_name) : null);
        setCity(p.city ?? '');
        setBirth(p.birth_year ? String(p.birth_year) : '');
        setHand(p.handedness);
        setLicence(p.licence ?? '');
        setSince(p.started_year ? String(p.started_year) : '');
        setHistory(p.index_history);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [tick]);

  const back = <BackButton onClick={ui.back} />;

  if (!loaded) {
    return (
      <Screen title="Carte joueur" left={back}>
        {error ? (
          <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
        ) : (
          <div className="pr-center">
            <Spinner />
          </div>
        )}
      </Screen>
    );
  }

  const year = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 1900 && n <= new Date().getFullYear() ? n : null;
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({
        display_name: name.trim() || null,
        photo,
        home_golf_id: golfId,
        city: city.trim() || null,
        birth_year: year(birth),
        handedness: hand,
        licence: licence.trim() || null,
        started_year: year(since),
      });
      touchData();
      ui.toast('Profil enregistré');
      ui.back();
    } catch (e) {
      ui.toast((e as Error).message);
      setSaving(false);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await resizeToDataUrl(file));
    } catch (e) {
      ui.toast((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeIndex = async (asOf: string) => {
    if (!window.confirm(`Supprimer l’index du ${fmtDateShortYear(asOf)} ?`)) return;
    try {
      await deleteIndex(asOf);
      setHistory((h) => h.filter((x) => x.as_of !== asOf));
      touchData();
    } catch (e) {
      ui.toast((e as Error).message);
    }
  };

  const ordered = [...history].sort((a, b) => b.as_of.localeCompare(a.as_of));
  const current = ordered[0];
  const email = account.status === 'in' ? account.me.user.email : null;
  const shownName = name.trim() || (account.status === 'in' ? account.me.user.name : '');

  return (
    <Screen
      title="Carte joueur"
      left={back}
      right={
        <button type="button" className="text-btn" onClick={save} disabled={saving} style={{ fontWeight: 600 }}>
          {saving ? 'Envoi…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="pe-photo">
        <div className="pe-avatar" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : initials(shownName)}
        </div>
        <input ref={fileRef} className="pe-input-hidden" type="file" accept="image/*" aria-label="Choisir une photo" onChange={(e) => void pickPhoto(e.target.files?.[0])} tabIndex={-1} />
        <div className="pe-photo-actions">
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()}>
            {photo ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          {photo && (
            <button type="button" className="text-btn pe-del" onClick={() => setPhoto(null)}>
              Supprimer la photo
            </button>
          )}
        </div>
      </div>

      <Group>
        <Field label="Nom affiché">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" autoComplete="name" maxLength={60} />
        </Field>
        <Row label="Golf d’attache" value={golfName ?? 'Choisir'} chevron onClick={() => setGolfSheet(true)} />
        <Field label="Ville">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" autoComplete="address-level2" maxLength={80} />
        </Field>
      </Group>

      <Group>
        <Field label="Année de naissance">
          <input value={birth} onChange={(e) => setBirth(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1975" inputMode="numeric" />
        </Field>
        <div className="pe-seg">
          <Segmented<'right' | 'left'>
            value={hand ?? ('' as 'right')}
            onChange={setHand}
            label="Main"
            options={[
              { value: 'right', label: 'Droitier' },
              { value: 'left', label: 'Gaucher' },
            ]}
          />
        </div>
        <Field label="Joue depuis">
          <input value={since} onChange={(e) => setSince(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Année" inputMode="numeric" />
        </Field>
        <Field label="N° de licence">
          <input value={licence} onChange={(e) => setLicence(e.target.value)} placeholder="Facultatif" autoCapitalize="characters" maxLength={20} />
        </Field>
      </Group>

      <Group title="Index" footer="Votre index officiel s’affiche en grand sur votre carte. Gardez l’historique à jour pour suivre votre progression.">
        <Row label="Index actuel" value={current ? `${nf(current.hcp_index)} · ${fmtDateShortYear(current.as_of)}` : 'Non renseigné'} />
        <button type="button" className="row row--tap" onClick={() => setIndexSheet(true)}>
          <span className="row-main">
            <span className="row-label" style={{ color: 'var(--tint)' }}>
              Mettre à jour mon index
            </span>
          </span>
        </button>
        {ordered.map((h) => (
          <div className="row pe-index-row" key={h.as_of}>
            <span className="row-main">
              <span className="row-label" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {nf(h.hcp_index)}
              </span>
              <span className="row-sub">{fmtDateShortYear(h.as_of)}</span>
            </span>
            <button type="button" className="pe-del" onClick={() => void removeIndex(h.as_of)} aria-label={`Supprimer l’index du ${fmtDateShortYear(h.as_of)}`}>
              Supprimer
            </button>
          </div>
        ))}
      </Group>

      {email && (
        <Group title="Compte" footer="La suppression du compte se fait dans Réglages.">
          <Row label="E-mail" value={email} />
        </Group>
      )}

      <GolfSheet
        open={golfSheet}
        onClose={() => setGolfSheet(false)}
        selected={golfId}
        onPick={(g) => {
          setGolfId(g?.id ?? null);
          setGolfName(g ? golfLabel(g.name) : null);
          if (g && !city.trim()) setCity(g.city);
          setGolfSheet(false);
        }}
      />
      <IndexSheet
        open={indexSheet}
        onClose={() => setIndexSheet(false)}
        initial={current?.hcp_index}
        onSaved={(asOf, v) => {
          setHistory((h) => [...h.filter((x) => x.as_of !== asOf), { as_of: asOf, hcp_index: v }].sort((a, b) => a.as_of.localeCompare(b.as_of)));
          setIndexSheet(false);
          touchData();
          ui.toast('Index mis à jour');
        }}
      />
    </Screen>
  );
}

function GolfSheet({ open, onClose, selected, onPick }: { open: boolean; onClose: () => void; selected: number | null; onPick: (g: Golf | null) => void }) {
  const [golfs, setGolfs] = useState<Golf[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || golfs) return;
    getGolfs({ limit: 200 })
      .then((r) => setGolfs(r.items))
      .catch((e: Error) => setError(e.message));
  }, [open, golfs]);

  const list = useMemo(() => {
    const n = plain(q.trim());
    const all = golfs ?? [];
    return n ? all.filter((g) => plain(`${g.name} ${g.city}`).includes(n)) : all;
  }, [golfs, q]);

  return (
    <Sheet open={open} onClose={onClose} title="Golf d’attache">
      <div className="sheet-pad">
        <SearchField value={q} onChange={setQ} placeholder="Rechercher un golf" />
      </div>
      {error ? (
        <p className="list-footnote">{error}</p>
      ) : !golfs ? (
        <div className="pr-center" style={{ padding: 30 }}>
          <Spinner />
        </div>
      ) : (
        <div className="group-wrap">
          <div className="group">
            {!q && selected != null && <Row label="Aucun golf d’attache" onClick={() => onPick(null)} />}
            {list.map((g) => (
              <Row
                key={g.id}
                label={golfLabel(g.name)}
                sub={g.city}
                value={g.id === selected ? <Icon name="check" size={18} strokeWidth={2.6} className="pe-check" /> : undefined}
                onClick={() => onPick(g)}
              />
            ))}
            {list.length === 0 && <Row label="Aucun résultat" />}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function IndexSheet({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: number; onSaved: (asOf: string, v: number) => void }) {
  const ui = useUi();
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initial != null ? String(initial).replace('.', ',') : '');
      setDate(today());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const num = parseFloat(value.replace(',', '.'));
  const valid = Number.isFinite(num) && num >= -10 && num <= 54 && /^\d{4}-\d\d-\d\d$/.test(date);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const v = Math.round(num * 10) / 10;
      await putIndex(date, v);
      onSaved(date, v);
    } catch (e) {
      ui.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mon index"
      footer={
        <button type="button" className="btn btn--block" disabled={!valid || busy} onClick={() => void submit()}>
          Enregistrer
        </button>
      }
    >
      <div className="pe-sheet-pad">
        <input className="pe-bigfield" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d,.\-]/g, '').slice(0, 5))} placeholder="18,4" aria-label="Index" autoFocus />
        <label className="pe-datelabel">
          <span>Date de mise à jour</span>
          <input className="pe-datefield" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
    </Sheet>
  );
}
