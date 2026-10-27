// Onglet « Mes parties » : tableau de bord (connecté) ou aperçu grisé + invitation (non connecté).
import { useEffect, useRef, useState } from 'react';
import type { Highlight, PlaySession, StatsPeriod, StatsResponse } from '../../shared/practice';
import { Group, Row, Segmented, Spinner } from '../components/Controls';
import { Icon } from '../components/Icon';
import { NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { PARTIES_LABEL } from '../components/TabBar';
import { useUi } from '../ui';
import { useAccount, useDataVersion } from './account';
import { getProfile, getStats, listSessions, type Profile } from './api';
import { Dashboard, type DashMetric } from './Dashboard';
import { HighlightCarousel } from './HighlightCarousel';
import { getHighlights } from './highlightsApi';
import { PlayerCard } from './PlayerCard';
import { sampleHighlights, sampleProfile, sampleSessions, sampleStats } from './sample';
import { SessionCell } from './SessionCell';
import { MIN_ROUNDS } from './Dashboard';
import { PERIODS, plural, readPeriod, roundsByPeriod, writePeriod } from './statsFormat';
import './practice.css';

const PERIOD_WORDS: Record<StatsPeriod, string> = { '1m': 'le dernier mois', '3m': '3 mois', '6m': '6 mois', '1y': '1 an', all: 'toute la période' };

interface Loaded {
  profile: Profile | null;
  sessions: PlaySession[];
  highlights: Highlight[];
}

export function PracticeScreen({ active: _active }: { active: boolean }) {
  const ui = useUi();
  const account = useAccount();
  const version = useDataVersion();
  const [period, setPeriod] = useState<StatsPeriod>(readPeriod);
  const [data, setData] = useState<Loaded | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const statsSeq = useRef(0);
  const signedIn = account.status === 'in';
  const accountId = account.status === 'in' ? account.me.user.id : undefined;

  // chaque compte garde sa propre période (par défaut 6 mois)
  useEffect(() => {
    if (accountId) setPeriod(readPeriod(accountId));
  }, [accountId]);

  // profil + séances : à chaque changement de données
  useEffect(() => {
    if (!signedIn) {
      setData(null);
      setStats(null);
      return;
    }
    let live = true;
    Promise.all([getProfile().catch(() => null), listSessions(), getHighlights(20).catch(() => [] as Highlight[])])
      .then(([profile, sessions, highlights]) => {
        if (!live) return;
        setData({ profile, sessions, highlights });
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [signedIn, version, tick]);

  // stats : période ou données modifiées (on garde l'ancien affichage pendant le chargement)
  useEffect(() => {
    if (!signedIn) return;
    const seq = ++statsSeq.current;
    setStatsBusy(true);
    getStats(period)
      .then((s) => {
        if (seq !== statsSeq.current) return;
        setStats(s);
        setError(null);
      })
      .catch((e: Error) => seq === statsSeq.current && setError(e.message))
      .finally(() => seq === statsSeq.current && setStatsBusy(false));
  }, [signedIn, period, version, tick]);

  const onPeriod = (p: StatsPeriod) => {
    setPeriod(p);
    writePeriod(p, accountId);
  };

  // ------------------------------------------------------------ non connecté
  if (account.status === 'loading') {
    return (
      <Screen title={PARTIES_LABEL} eyebrow>
        <div className="pr-center">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (!signedIn) {
    const offline = account.status === 'offline';
    return (
      <Screen title={PARTIES_LABEL} eyebrow>
        <div className="pr-teaser">
          <div className="pr-preview" aria-hidden="true" ref={(el) => el?.setAttribute('inert', '')}>
            <div className="pr-preview-inner">
              <PlayerCard profile={sampleProfile} counts={{ rounds: 23, ranges: 7 }} best={{ strokes: 87, rel: 15, holes: 18 }} onOpenProfile={() => {}} onOpenIndex={() => {}} interactive={false} />
              <HighlightCarousel items={sampleHighlights} player={{ name: sampleProfile.display_name ?? '', photo: null }} onOpen={() => {}} onAll={() => {}} interactive={false} />
              <div className="pr-period">
                <Segmented value="6m" options={[...PERIODS]} onChange={() => {}} label="Période" />
              </div>
              <Dashboard stats={sampleStats} profile={sampleProfile} onOpen={() => {}} />
              <Group title="Dernières séances">
                {sampleSessions.map((s) => (
                  <SessionCell key={s.id} s={s} onOpen={() => {}} />
                ))}
              </Group>
            </div>
          </div>
          <div className="pr-invite-wrap">
            <section className="pr-invite" aria-labelledby="pr-invite-title">
              <div className="pr-invite-icon">
                <Icon name="chart" size={26} strokeWidth={2} />
              </div>
              <h2 id="pr-invite-title">Suivez vos progrès</h2>
              <p>
                {offline
                  ? 'Impossible de joindre le serveur pour le moment. Vérifiez votre connexion, puis réessayez.'
                  : 'Enregistrez vos parties et vos séances de practice, suivez vos stats dans le temps. Pour garder vos données, créez un compte gratuit.'}
              </p>
              <button type="button" className="btn btn--block" onClick={() => ui.openLogin()}>
                Créer un compte ou se connecter
              </button>
              <button type="button" className="pr-demo-link" onClick={() => ui.openLogin(true)}>
                Essayer le compte de démo
              </button>
            </section>
          </div>
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------------------ connecté
  const plus = <NavIconButton icon="plus" label="Nouvelle séance" onClick={() => ui.push({ type: 'session-editor' })} />;
  if (error && !data) {
    return (
      <Screen title={PARTIES_LABEL} eyebrow right={plus}>
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
      </Screen>
    );
  }
  if (!data || !stats) {
    return (
      <Screen title={PARTIES_LABEL} eyebrow right={plus}>
        <div className="pr-center">
          <Spinner />
        </div>
      </Screen>
    );
  }

  const me = account.me;
  const total = me.rounds + me.ranges;
  const recent = data.sessions.slice(0, 5);
  // Peu de parties sur la période choisie : proposer la plus courte période qui en a assez.
  const counts = roundsByPeriod(data.sessions);
  const periodRounds = counts[period] ?? 0;
  const fewRounds = periodRounds < MIN_ROUNDS ? PERIODS.map((p) => p.value).find((v) => v !== period && (counts[v] ?? 0) >= MIN_ROUNDS && (counts[v] ?? 0) > periodRounds) : undefined;

  return (
    <Screen title={PARTIES_LABEL} eyebrow right={plus}>
      {me.demo && (
        <div className="pr-demo-banner" role="note">
          <p>
            <strong>Compte Demo.</strong> Partagé par tous les visiteurs et remis à zéro chaque nuit : explorez, puis créez votre compte pour
            garder vos parties.
          </p>
          <div className="pr-demo-banner-actions">
            <button type="button" className="btn btn--small" data-track="demo-banner:signup" onClick={() => ui.openLogin()}>
              Créer mon compte
            </button>
            <button type="button" className="pr-demo-banner-link" data-track="demo-banner:login" onClick={() => ui.openLogin()}>
              Se connecter
            </button>
          </div>
        </div>
      )}
      <PlayerCard
        profile={data.profile}
        fallbackName={me.demo ? 'Demo' : me.user.name}
        counts={{ rounds: me.rounds, ranges: me.ranges }}
        best={stats.rounds.best ? { strokes: stats.rounds.best.strokes, rel: stats.rounds.best.rel, holes: stats.rounds.best.holes } : null}
        onOpenProfile={() => ui.push({ type: 'profile' })}
        onOpenIndex={() => ui.push({ type: 'stat', metric: 'index' })}
      />

      {total === 0 ? (
        <EmptyState icon="flag" title="Votre carnet est vide" text="Enregistrez votre première partie ou séance de practice pour voir apparaître vos statistiques.">
          <button type="button" className="btn" onClick={() => ui.push({ type: 'session-editor' })}>
            Nouvelle séance
          </button>
        </EmptyState>
      ) : (
        <>
          {data.highlights.length > 0 && (
            <HighlightCarousel
              items={data.highlights}
              player={{ name: data.profile?.display_name?.trim() || me.user.name, photo: data.profile?.photo ?? null }}
              onOpen={(id) => ui.push({ type: 'session', id })}
              onAll={() => ui.push({ type: 'highlights' })}
            />
          )}
          <div className="pr-period">
            <Segmented value={period} options={[...PERIODS]} onChange={onPeriod} label="Période" />
          </div>
          {fewRounds && (
            <div className="pr-few" role="status">
              <span>
                {periodRounds === 0 ? 'Aucune partie' : plural(periodRounds, 'partie')} sur {PERIOD_WORDS[period]}. Les statistiques s’affichent à partir de {MIN_ROUNDS} parties.
              </span>
              <button type="button" className="text-btn" onClick={() => onPeriod(fewRounds)}>
                Voir {PERIOD_WORDS[fewRounds]}
              </button>
            </div>
          )}
          <div className={statsBusy ? 'pr-busy' : undefined} aria-busy={statsBusy}>
            <Dashboard stats={stats} profile={data.profile} totalRanges={me.ranges} onOpen={(metric: DashMetric) => ui.push({ type: 'stat', metric })} />
          </div>

          <Group title="Dernières séances">
            {recent.map((s) => (
              <SessionCell key={s.id} s={s} onOpen={() => ui.push({ type: 'session', id: s.id })} />
            ))}
            <Row label="Toutes les séances" value={`${total}`} chevron onClick={() => ui.push({ type: 'sessions' })} />
          </Group>
        </>
      )}
    </Screen>
  );
}
