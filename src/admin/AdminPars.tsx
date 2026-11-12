// Pars corrigés par les testeurs et propagés dans la base : suivi et annulation.
import { useState } from 'react';
import { Group, Row, Spinner } from '../components/Controls';
import { BackButton, NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { useUi } from '../ui';
import { getParChanges, revertParChange, type ParChangeRow } from './api';
import { relTime } from './labels';
import './admin.css';

const SOURCE: Record<string, string> = { club: 'site du club', osm: 'OpenStreetMap', ffgolf: 'ffgolf', players: 'joueurs' };
const iso = (t: string) => (t.includes('T') ? t : `${t.replace(' ', 'T')}Z`);

export function AdminPars() {
  const ui = useUi();
  const list = useAsync((s) => getParChanges(s), []);
  const [busy, setBusy] = useState<number | null>(null);

  const revert = async (r: ParChangeRow) => {
    setBusy(r.id);
    try {
      await revertParChange(r.id);
      ui.toast(`Trou ${r.hole} : par ${r.old_par ?? 'non renseigné'} rétabli`);
      list.reload();
    } catch (e) {
      ui.toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Regroupement par golf, le plus récemment corrigé en haut.
  const groups: Array<{ name: string; items: ParChangeRow[] }> = [];
  for (const r of list.data ?? []) {
    let g = groups.find((x) => x.name === r.golf_name);
    if (!g) groups.push((g = { name: r.golf_name, items: [] }));
    g.items.push(r);
  }

  return (
    <Screen
      title="Pars corrigés"
      left={<BackButton onClick={ui.back} />}
      right={<NavIconButton icon="refresh" label="Actualiser" onClick={list.reload} spinning={list.loading} />}
    >
      {list.error && !list.data && <ErrorState message={list.error.message} onRetry={list.reload} />}
      {!list.data && !list.error && (
        <div className="adm-center">
          <Spinner />
        </div>
      )}
      {list.data && list.data.length === 0 && (
        <EmptyState icon="flag" title="Aucune correction" text="Les pars modifiés et confirmés par les testeurs à la fin d'une partie apparaîtront ici." />
      )}
      {groups.map((g) => (
        <Group key={g.name} title={g.name}>
          {g.items.map((r) => (
            <Row
              key={r.id}
              label={
                <span className={r.reverted_at ? 'adm-reverted' : undefined}>
                  Trou {r.hole}
                  {r.course ? ` (${r.course})` : ''} : {r.old_par != null ? `par ${r.old_par}` : 'non renseigné'} → <b>par {r.new_par}</b>
                </span>
              }
              sub={[
                r.user_label ?? 'Compte supprimé',
                r.origin === 'backfill' ? 'rattrapage' : null,
                r.old_source ? `avant : ${SOURCE[r.old_source] ?? r.old_source}` : null,
                relTime(iso(r.created_at)),
                r.reverted_at ? 'annulé' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              value={
                r.reverted_at ? undefined : (
                  <button type="button" className="text-btn" disabled={busy === r.id} onClick={() => void revert(r)}>
                    {busy === r.id ? '…' : 'Annuler'}
                  </button>
                )
              }
            />
          ))}
        </Group>
      ))}
    </Screen>
  );
}
