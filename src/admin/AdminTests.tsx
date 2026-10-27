// Programme testeurs : tableau de bord des retours, conversations, parcours et testeurs les plus actifs.
import { useState } from 'react';
import { FEEDBACK_KINDS } from '../../shared/feedback';
import { Badge, Group, Row, Segmented, Spinner } from '../components/Controls';
import { BackButton, NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { useUi } from '../ui';
import { getTests, isForbidden } from './api';
import { formatDuration, relTime } from './labels';
import { Avatar, Tiles, plural } from './parts';
import './admin.css';

type Period = '7' | '30' | '90' | '365';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
  { value: '365', label: '1 an' },
];

const nf = (n: number) => n.toLocaleString('fr-FR');
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)} %` : '—');

function oneLine(s: string, n = 140): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function AdminTests() {
  const ui = useUi();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  const q = useAsync((s) => getTests(days, s), [days]);
  const d = q.data;

  const left = <BackButton onClick={ui.back} />;
  const right = <NavIconButton icon="refresh" label="Actualiser" onClick={q.reload} spinning={q.loading} />;

  if (isForbidden(q.error)) {
    return (
      <Screen title="Tests" left={left}>
        <EmptyState icon="lock" title="Accès réservé" text="Cette zone est réservée au compte administrateur.">
          <button type="button" className="btn" onClick={ui.back}>
            Retour
          </button>
        </EmptyState>
      </Screen>
    );
  }

  const t = d?.testers;
  const fb = d?.feedback;
  const maxKind = fb ? Math.max(1, ...FEEDBACK_KINDS.map((k) => fb.byKind[k.id] ?? 0)) : 1;
  const firstStep = d?.funnel[0]?.count ?? 0;

  return (
    <Screen title="Tests" left={left} right={right}>
      <div className="sheet-pad sheet-pad--screen">
        <Segmented<Period> label="Période" value={period} onChange={setPeriod} options={PERIODS} />
      </div>

      {q.error && !d && <ErrorState message={q.error.message} onRetry={q.reload} />}
      {!q.error && !d && (
        <div className="adm-center">
          <Spinner />
        </div>
      )}
      {q.error && d && (
        <p className="banner-error" role="alert">
          {q.error.message}
        </p>
      )}

      {d && t && fb && (
        <div className={q.loading ? 'adm-stale' : undefined}>
          <Tiles
            items={[
              { label: 'Testeurs', value: nf(t.total), sub: t.newInPeriod > 0 ? `+${nf(t.newInPeriod)} nouveau${t.newInPeriod > 1 ? 'x' : ''}` : 'aucun nouveau' },
              { label: 'Actifs 7 j', value: nf(t.active7), tone: t.active7 ? 'green' : undefined },
              { label: 'Actifs 30 j', value: nf(t.active30) },
              { label: 'Profils complets', value: `${nf(t.profileComplete)} / ${nf(t.total)}` },
              { label: 'Avec séances', value: nf(t.withSessions) },
              { label: 'Ont envoyé un retour', value: nf(t.withFeedback) },
            ]}
          />

          <h3 className="group-title adm-title-out">Retours</h3>
          <Tiles
              items={[
                { label: 'Retours au total', value: nf(fb.total) },
                { label: 'Sur la période', value: nf(fb.inPeriod) },
                { label: 'Non lus', value: nf(fb.unread), tone: fb.unread > 0 ? 'orange' : undefined },
                { label: 'En attente de réponse', value: nf(fb.awaitingReply), tone: fb.awaitingReply > 0 ? 'orange' : undefined },
                {
                  label: 'Délai moyen de réponse',
                  value: fb.avgReplyHours == null ? '—' : `${fb.avgReplyHours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`,
                },
              ]}
          />

          <Group title="Par catégorie">
            {FEEDBACK_KINDS.map((k) => {
              const n = fb.byKind[k.id] ?? 0;
              return (
                <div className="row adm-kind-row" key={k.id} style={{ ['--c' as string]: k.color }}>
                  <span className="adm-kind-label">{k.label}</span>
                  <span className="adm-kind-bar" aria-hidden="true">
                    {n > 0 && <i style={{ width: `${Math.max(2, (n / maxKind) * 100)}%` }} />}
                  </span>
                  <b className="adm-kind-count">{nf(n)}</b>
                </div>
              );
            })}
          </Group>

          <Group title={`Conversations (${d.threads.length})`}>
            {d.threads.length === 0 && <div className="row row--muted">Aucun retour pour l’instant.</div>}
            {d.threads.map((th) => (
              <button
                key={th.userId}
                type="button"
                className="row row--tap adm-thread"
                onClick={() => ui.push({ type: 'admin-thread', id: th.userId })}
              >
                <Avatar name={th.name} size={40} />
                <span className="adm-thread-main">
                  <span className="adm-thread-name">{th.name}</span>
                  <span className="adm-thread-sub">
                    {th.lastAuthor === 'admin' ? 'Vous : ' : ''}« {oneLine(th.lastBody)} »
                  </span>
                  <span className="adm-thread-time">{relTime(th.lastAt)}</span>
                </span>
                <span className="adm-thread-side">
                  {th.unread > 0 ? (
                    <span className="adm-pill" aria-label={`${th.unread} non lu${th.unread > 1 ? 's' : ''}`}>
                      {nf(th.unread)}
                    </span>
                  ) : th.awaitingReply ? (
                    <Badge tone="orange">à répondre</Badge>
                  ) : null}
                </span>
              </button>
            ))}
          </Group>

          <Group title="Parcours des testeurs">
            {d.funnel.length === 0 && <div className="row row--muted">Aucune donnée.</div>}
            {d.funnel.map((s, i) => {
              const prev = i > 0 ? d.funnel[i - 1].count : null;
              return (
                <div className="row adm-rank" key={s.id} style={{ ['--adm-c' as string]: 'var(--blue)' }}>
                  <div className="adm-rank-head">
                    <span className="adm-rank-name">{s.label}</span>
                    <span className="adm-rank-val">
                      <b>{nf(s.count)}</b>
                      {prev != null && <span className="adm-funnel-pct"> · {pct(s.count, prev)}</span>}
                    </span>
                  </div>
                  <div className="adm-rank-bar" aria-hidden="true">
                    <i style={{ width: `${s.count > 0 && firstStep > 0 ? Math.max(2, Math.min(100, (s.count / firstStep) * 100)) : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </Group>

          <Group
            title="Message testeur (écran d’accueil)"
            footer="Touchers sur la période. Les pourcentages sont calculés sur le nombre d’affichages du message."
          >
            <Row label="Affichages" value={nf(d.splash.views)} />
            <Row label="Explorer la démo" value={`${nf(d.splash.demo)} · ${pct(d.splash.demo, d.splash.views)}`} />
            <Row label="Créer mon compte" value={`${nf(d.splash.signup)} · ${pct(d.splash.signup, d.splash.views)}`} />
            <Row label="Plus tard" value={`${nf(d.splash.later)} · ${pct(d.splash.later, d.splash.views)}`} />
          </Group>

          <Group
            title="Testeurs les plus actifs"
            footer="Les testeurs actifs bénéficieront d’un compte gratuit à vie à l’issue des tests."
          >
            {d.testers_list.length === 0 && <div className="row row--muted">Aucun testeur pour l’instant.</div>}
            {d.testers_list.map((x) => {
              const where = [x.city, x.homeGolf].filter(Boolean).join(' · ');
              return (
                <Row
                  key={x.userId}
                  label={<span className="adm-name">{x.name}</span>}
                  sub={
                    <>
                      <span className="adm-line">
                        {[plural(x.activeDays, 'j actif', 'j actifs'), formatDuration(x.timeMs), plural(x.sessions, 'séance'), plural(x.feedbacks, 'retour')].join(' · ')}
                      </span>
                      <span className="adm-line">
                        Profil {x.profileFields}/{d.profileFieldsTotal}
                        {where ? ` · ${where}` : ''}
                      </span>
                    </>
                  }
                  chevron
                  onClick={() => ui.push({ type: 'admin-person', id: x.userId })}
                />
              );
            })}
          </Group>
        </div>
      )}
    </Screen>
  );
}
