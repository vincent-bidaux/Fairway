// « Mon sac » : déclaration des clubs du joueur (réutilisée à la saisie des parties).
import { useEffect, useState } from 'react';
import { CLUBS, CLUB_BY_ID, DEFAULT_BAG, MAX_CLUBS, normalizeBag, type ClubKind } from '../../shared/practice';
import { Group } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useUi } from '../ui';
import { touchData } from './account';
import { saveBag } from './api';
import './practice.css';

const KINDS: Array<{ kind: ClubKind; title: string }> = [
  { kind: 'wood', title: 'Bois' },
  { kind: 'hybrid', title: 'Hybrides' },
  { kind: 'iron', title: 'Fers' },
  { kind: 'wedge', title: 'Wedges' },
  { kind: 'putter', title: 'Putter' },
];

/** Aperçu en pastilles, dans l'ordre du catalogue. */
export function BagPreview({ ids, dim }: { ids: string[]; dim?: boolean }) {
  const list = normalizeBag(ids);
  return (
    <div className={`bag-pills${dim ? ' is-dim' : ''}`} aria-label={list.map((id) => CLUB_BY_ID[id].label).join(', ')}>
      {list.map((id) => (
        <span className="bag-pill" key={id} aria-hidden="true">
          {CLUB_BY_ID[id].short}
        </span>
      ))}
    </div>
  );
}

export function BagSheet({ open, onClose, bag, onSaved }: { open: boolean; onClose: () => void; bag: string[] | null; onSaved: (bag: string[]) => void }) {
  const ui = useUi();
  const [sel, setSel] = useState<string[]>(DEFAULT_BAG);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSel(normalizeBag(bag ?? DEFAULT_BAG));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const full = sel.length >= MAX_CLUBS;
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_CLUBS ? s : normalizeBag([...s, id])));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await saveBag(sel);
      onSaved(res.bag);
      touchData();
      ui.toast('Sac enregistré');
      onClose();
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
      title="Mon sac"
      footer={
        <button type="button" className="btn btn--block" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Envoi…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="bag-head">
        <span className={`bag-count${full ? ' is-full' : ''}`}>
          {sel.length} / {MAX_CLUBS} clubs
        </span>
        <button type="button" className="text-btn bag-reset" onClick={() => setSel(normalizeBag(DEFAULT_BAG))}>
          Revenir au sac par défaut
        </button>
      </div>
      {full && <p className="bag-note">{MAX_CLUBS} clubs au maximum (règle de golf).</p>}
      {KINDS.map(({ kind, title }) => (
        <Group key={kind} title={title}>
          {CLUBS.filter((c) => c.kind === kind).map((c) => {
            const on = sel.includes(c.id);
            return (
              <button key={c.id} type="button" className="row row--tap bag-row" role="checkbox" aria-checked={on} disabled={!on && full} onClick={() => toggle(c.id)}>
                <span className="row-main">
                  <span className="row-label">{c.label}</span>
                </span>
                <span className="row-value bag-short">{c.short}</span>
                <span className={`check${on ? ' is-on' : ''}`}>
                  <Icon name="check" size={18} strokeWidth={2.6} />
                </span>
              </button>
            );
          })}
        </Group>
      ))}
    </Sheet>
  );
}
