// Fiche d'un appareil (visiteur anonyme ou rattaché à un compte) : infos, usage et journal.
import type { DeviceRow } from '../../shared/admin';
import { Group, Row, Spinner } from '../components/Controls';
import { BackButton, NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { useUi } from '../ui';
import { getDevice, isForbidden } from './api';
import { deviceLabel, fmtStamp, relTime } from './labels';
import { DailyChart, Journal, RankGroup, UsageTiles, place } from './parts';
import './admin.css';

function InfoRows({ device }: { device: DeviceRow }) {
  const loc = place(device);
  return (
    <>
      <Row label="Appareil" value={deviceLabel(device.userAgent, device.screen, device.standalone)} />
      <Row label="Mode" value={device.standalone == null ? '—' : device.standalone ? 'App installée' : 'Navigateur'} />
      {device.screen && <Row label="Écran" value={device.screen} />}
      {device.lang && <Row label="Langue" value={device.lang} />}
      {loc && <Row label="Lieu" value={loc} />}
      {device.ip && <Row label="Adresse IP" value={device.ip} />}
      <Row label="Première vue" value={fmtStamp(device.firstSeen)} sub={relTime(device.firstSeen)} />
      <Row label="Dernière vue" value={fmtStamp(device.lastSeen)} sub={relTime(device.lastSeen)} />
      <Row label="Identifiant" value={<span className="adm-mono">{device.deviceId}</span>} />
      {device.userAgent && <div className="adm-ua">{device.userAgent}</div>}
    </>
  );
}

export function AdminDevice({ id }: { id: string }) {
  const ui = useUi();
  const q = useAsync((s) => getDevice(id, s), [id]);
  const d = q.data;
  const left = <BackButton onClick={ui.back} />;

  if (isForbidden(q.error)) {
    return (
      <Screen title="Appareil" left={left}>
        <EmptyState icon="lock" title="Accès réservé" text="Cette zone est réservée au compte administrateur." />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen title="Appareil" left={left}>
        {q.error ? (
          <ErrorState message={q.error.message} onRetry={q.reload} />
        ) : (
          <div className="adm-center">
            <Spinner />
          </div>
        )}
      </Screen>
    );
  }

  const v = d.device;
  const title = v.userId ? (d.personName ?? 'Appareil') : 'Visiteur anonyme';
  return (
    <Screen
      title={title}
      left={left}
      right={<NavIconButton icon="refresh" label="Actualiser" onClick={q.reload} spinning={q.loading} />}
    >
      <Group title="Compte lié">
        {v.userId ? (
          <Row label={d.personName ?? 'Compte'} sub="Voir la fiche du testeur" chevron onClick={() => ui.push({ type: 'admin-person', id: v.userId! })} />
        ) : (
          <div className="row row--muted">Aucun compte : visiteur anonyme.</div>
        )}
      </Group>

      <Group title="Appareil">
        <InfoRows device={v} />
      </Group>

      <UsageTiles usage={v.usage} />
      <DailyChart daily={d.daily} days={60} showPeople={false} />

      <RankGroup title="Temps par écran" items={d.screens} kind="screens" color="var(--blue)" />
      <RankGroup title="Touchers" items={d.taps} kind="plain" color="var(--tint)" />
      <RankGroup title="Saisies" items={d.inputs} kind="plain" color="var(--purple)" />

      <Journal activity={d.activity} />
    </Screen>
  );
}
