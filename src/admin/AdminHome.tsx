// Zone admin « testeurs » : vue d'ensemble, comptes, visiteurs anonymes, usage et activité récente.
import { useState } from 'react';
import type { ActivityItem } from '../../shared/admin';
import { Group, Row, Segmented, Spinner } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { useUi } from '../ui';
import { getOverview, getPeople, isForbidden } from './api';
import { activityText, deviceLabel, formatDuration, relTime } from './labels';
import { Badges, DailyChart, MoreRow, RankGroup, Tiles, VolumeGroup, personName, plural } from './parts';
import './admin.css';

type Period = '7' | '30' | '90' | '365';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
  { value: '365', label: '1 an' },
];

const nf = (n: number) => n.toLocaleString('fr-FR');
const ANON_LIMIT = 20;
const RECENT_LIMIT = 25;

export function AdminHome() {
  const ui = useUi();
  const [period, setPeriod] = useState<Period>('30');
  const [allAnon, setAllAnon] = useState(false);
  const [allRecent, setAllRecent] = useState(false);
  const days = Number(period);
  const overview = useAsync((s) => getOverview(days, s), [days]);
  const people = useAsync((s) => getPeople(s), []);

  const reload = () => {
    overview.reload();
    people.reload();
  };

  const left = <BackButton onClick={ui.back} />;
  const right = <NavIconButton icon="refresh" label="Actualiser" onClick={reload} spinning={overview.loading || people.loading} />;

  const error = overview.error ?? people.error;
  if (isForbidden(error)) {
    return (
      <Screen title="Administration" left={left}>
        <EmptyState icon="lock" title="Accès réservé" text="Cette zone est réservée au compte administrateur.">
          <button type="button" className="btn" onClick={ui.back}>
            Retour
          </button>
        </EmptyState>
      </Screen>
    );
  }

  const ov = overview.data;
  const list = people.data;

  const goActivity = (i: ActivityItem) => {
    if (i.userId) ui.push({ type: 'admin-person', id: i.userId });
    else if (i.deviceId) ui.push({ type: 'admin-device', id: i.deviceId });
  };

  const anon = list?.anonymous ?? [];
  const anonShown = allAnon ? anon : anon.slice(0, ANON_LIMIT);
  const recent = ov?.recent ?? [];
  const recentShown = allRecent ? recent : recent.slice(0, RECENT_LIMIT);

  return (
    <Screen title="Administration" left={left} right={right}>
      <div className="sheet-pad sheet-pad--screen">
        <Segmented<Period> label="Période" value={period} onChange={setPeriod} options={PERIODS} />
      </div>

      {overview.error && !ov && <ErrorState message={overview.error.message} onRetry={reload} />}
      {people.error && !list && (
        <p className="banner-error" role="alert">
          {people.error.message}
        </p>
      )}
      {!error && !ov && !list && (
        <div className="adm-center">
          <Spinner />
        </div>
      )}

      {ov && (
        <div className={overview.loading ? 'adm-stale' : undefined}>
          <Tiles
            items={[
              { label: 'Testeurs', value: nf(ov.people.total), sub: ov.people.newInPeriod > 0 ? `+${nf(ov.people.newInPeriod)} nouveau${ov.people.newInPeriod > 1 ? 'x' : ''}` : 'aucun nouveau' },
              { label: 'Actifs sur la période', value: nf(ov.people.activeInPeriod), tone: ov.people.activeInPeriod ? 'green' : undefined },
              { label: 'Visiteurs anonymes actifs', value: nf(ov.anonymous.activeInPeriod), sub: `sur ${nf(ov.anonymous.total)} connus` },
              { label: 'Ouvertures', value: nf(ov.visits) },
              { label: 'Temps passé total', value: formatDuration(ov.timeMs) },
              { label: 'Touchers', value: nf(ov.taps) },
            ]}
          />
          <DailyChart daily={ov.daily} days={ov.days} title="Activité par jour" />
          <VolumeGroup volume={ov.volume} footer="Depuis le début, tous testeurs confondus (hors compte de démo, rempli automatiquement, et hors comptes admin). Les chiffres d'activité de cette page excluent aussi votre propre usage." />
        </div>
      )}

      {list && (
        <>
          <Group title={`Testeurs (${list.people.length})`}>
            {list.people.length === 0 && <div className="row row--muted">Aucun compte pour l'instant.</div>}
            {list.people.map((p) => {
              const u = p.usage;
              const parts = [p.email, u.lastSeen ? `vu ${relTime(u.lastSeen)}` : 'jamais vu'];
              if (u.timeMs > 0) parts.push(formatDuration(u.timeMs));
              const v = p.volume;
              return (
                <Row
                  key={p.id}
                  label={
                    <>
                      <span className="adm-name">{personName(p)}</span>
                      <Badges demo={p.demo} admin={p.admin} />
                    </>
                  }
                  sub={parts.join(' · ')}
                  value={
                    v.rounds || v.ranges ? (
                      <span className="adm-counts">
                        <b>{plural(v.rounds, 'partie')}</b>
                        {v.ranges > 0 && <span>{plural(v.ranges, 'practice')}</span>}
                      </span>
                    ) : (
                      <span className="adm-counts">aucune séance</span>
                    )
                  }
                  chevron
                  onClick={() => ui.push({ type: 'admin-person', id: p.id })}
                />
              );
            })}
          </Group>

          <Group title={`Visiteurs anonymes (${anon.length})`}>
            {anon.length === 0 && <div className="row row--muted">Aucun visiteur anonyme.</div>}
            {anonShown.map((d) => {
              const u = d.usage;
              const parts = [`vu ${relTime(d.lastSeen)}`];
              if (u.timeMs > 0) parts.push(formatDuration(u.timeMs));
              parts.push(plural(u.visits, 'visite'));
              return (
                <Row
                  key={d.deviceId}
                  label={[deviceLabel(d.userAgent, d.screen, d.standalone), d.city].filter(Boolean).join(' · ')}
                  sub={parts.join(' · ')}
                  chevron
                  onClick={() => ui.push({ type: 'admin-device', id: d.deviceId })}
                />
              );
            })}
            {anon.length > ANON_LIMIT && (
              <MoreRow label={allAnon ? 'Réduire' : `Tout voir (${anon.length})`} onClick={() => setAllAnon((v) => !v)} />
            )}
          </Group>
        </>
      )}
      {!list && people.loading && ov && (
        <div className="adm-center">
          <Spinner small />
        </div>
      )}

      {ov && (
        <div className={overview.loading ? 'adm-stale' : undefined}>
          <RankGroup title="Écrans les plus vus" items={ov.topScreens} kind="screens" color="var(--blue)" />
          <RankGroup title="Ce qu'ils touchent" items={ov.topTaps} kind="plain" color="var(--tint)" />
          <RankGroup title="Ce qu'ils tapent" items={ov.topInputs} kind="plain" color="var(--purple)" />

          <Group title="Activité récente">
            {recent.length === 0 && <div className="row row--muted">Aucune activité récente.</div>}
            {recentShown.map((i) => (
              <Row
                key={i.id}
                label={i.userLabel || 'Anonyme'}
                sub={activityText(i)}
                value={<span className="adm-counts">{relTime(i.ts)}</span>}
                chevron
                onClick={() => goActivity(i)}
              />
            ))}
            {!allRecent && recent.length > RECENT_LIMIT && <MoreRow label={`Tout voir (${recent.length})`} onClick={() => setAllRecent(true)} />}
          </Group>
        </div>
      )}

      <Group>
        <Row
          icon={<Icon name="gear" size={18} />}
          iconColor="var(--gray)"
          label="Collecte et sources"
          chevron
          onClick={() => ui.push({ type: 'admin' })}
        />
      </Group>
    </Screen>
  );
}
