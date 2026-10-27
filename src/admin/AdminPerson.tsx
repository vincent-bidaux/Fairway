// Fiche d'un testeur : identité, infos de profil, usage, volume ajouté, séances, appareils et journal.
import { useState } from 'react';
import type { PersonDetail, PlayRow } from '../../shared/admin';
import { CLUB_BY_ID } from '../../shared/practice';
import { Badge, Group, Row, Spinner } from '../components/Controls';
import { BackButton, NavIconButton, Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/States';
import { useAsync } from '../hooks';
import { useUi } from '../ui';
import { getPerson, isForbidden } from './api';
import { deviceLabel, fmtDate, fmtStamp, parseIso, relTime } from './labels';
import { Avatar, Badges, Journal, MoreRow, RankGroup, UsageTiles, VolumeGroup, DailyChart, personName, place, plural } from './parts';
import './admin.css';

const PROVIDERS: Record<string, string> = {
  'email-otp': 'Code par e-mail',
  credential: 'Mot de passe',
  google: 'Google',
  apple: 'Apple',
};

const PROFILE_LABELS: Record<string, string> = {
  display_name: 'Nom affiché',
  city: 'Ville',
  birth_year: 'Année de naissance',
  handedness: 'Latéralité',
  licence: 'Licence ffgolf',
  started_year: 'Joue depuis',
  home_golf_id: "Golf d'attache",
  bag: 'Sac',
};
const PROFILE_ORDER = Object.keys(PROFILE_LABELS);
// Champs déjà traités ailleurs ou sans intérêt à l'affichage.
const PROFILE_HIDDEN = new Set(['user_id', 'photo', 'home_golf_name', 'home_golf_city', 'created_at', 'updated_at']);

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function bagIds(v: unknown): string[] {
  let raw = v;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handedness(v: unknown): string {
  const s = String(v);
  if (/^(r|right|droit)/i.test(s)) return 'Droitier';
  if (/^(l|left|gauch)/i.test(s)) return 'Gaucher';
  return s;
}

function ProfileRows({ profile }: { profile: Record<string, unknown> | null }) {
  if (!profile) return <div className="row row--muted">Aucun profil renseigné.</div>;
  const year = new Date().getFullYear();
  const keys = [...PROFILE_ORDER, ...Object.keys(profile).filter((k) => !PROFILE_ORDER.includes(k) && !PROFILE_HIDDEN.has(k))];
  const rows: JSX.Element[] = [];
  for (const k of keys) {
    const v = profile[k];
    if (k === 'bag') {
      const ids = bagIds(v);
      if (ids.length === 0) continue;
      rows.push(<Row key={k} label={PROFILE_LABELS.bag} value={plural(ids.length, 'club')} sub={ids.map((id) => CLUB_BY_ID[id]?.short ?? id).join(' · ')} />);
      continue;
    }
    if (isEmpty(v)) continue;
    if (k === 'home_golf_id') {
      const name = typeof profile.home_golf_name === 'string' ? profile.home_golf_name : null;
      const city = typeof profile.home_golf_city === 'string' ? profile.home_golf_city : null;
      rows.push(<Row key={k} label={PROFILE_LABELS[k]} value={name ? [name, city].filter(Boolean).join(' · ') : `#${String(v)}`} />);
    } else if (k === 'birth_year') {
      const n = Number(v);
      rows.push(<Row key={k} label={PROFILE_LABELS[k]} value={Number.isFinite(n) && n > 1900 ? `${n} (${year - n} ans)` : String(v)} />);
    } else if (k === 'started_year') {
      const n = Number(v);
      rows.push(<Row key={k} label={PROFILE_LABELS[k]} value={Number.isFinite(n) && n > 1900 ? `${n} (${plural(Math.max(0, year - n), 'an')})` : String(v)} />);
    } else if (k === 'handedness') {
      rows.push(<Row key={k} label={PROFILE_LABELS[k]} value={handedness(v)} />);
    } else {
      const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
      rows.push(<Row key={k} label={PROFILE_LABELS[k] ?? humanize(k)} value={text} />);
    }
  }
  const updated = profile.updated_at;
  if (typeof updated === 'string' && updated) rows.push(<Row key="updated_at" label="Profil modifié" value={fmtStamp(updated)} />);
  return rows.length ? <>{rows}</> : <div className="row row--muted">Profil vide.</div>;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

function PlayItem({ p }: { p: PlayRow }) {
  const isRound = p.kind === 'round';
  const where = p.golfName || p.place || 'Lieu non renseigné';
  const main: string[] = [];
  if (isRound) {
    main.push(`${p.played}/${p.holes ?? '?'} trous`);
    if (p.strokes != null) main.push(`${p.strokes} coups${p.par != null ? ` (${signed(p.strokes - p.par)})` : ''}`);
  } else {
    if (p.durationMin != null) main.push(`${p.durationMin} min`);
    if (p.balls != null) main.push(`${p.balls} balles`);
  }
  const extra: string[] = [];
  if (p.shots > 0) extra.push(plural(p.shots, 'coup posé', 'coups posés'));
  if (p.drills > 0) extra.push(plural(p.drills, 'exercice'));
  const dates = [`créée ${fmtStamp(p.createdAt)}`];
  if (p.updatedAt && p.updatedAt !== p.createdAt) dates.push(`modifiée ${fmtStamp(p.updatedAt)}`);
  if (p.deletedAt) dates.push(`supprimée ${fmtStamp(p.deletedAt)}`);
  return (
    <Row
      label={
        <>
          {isRound ? 'Partie' : 'Practice'} · {fmtDate(p.playedAt)}
          {p.deletedAt && (
            <span className="adm-badges">
              <Badge tone="red">corbeille</Badge>
            </span>
          )}
        </>
      }
      sub={
        <span className="adm-play-sub">
          <span>{where}</span>
          {main.length > 0 && <span>{main.join(' · ')}</span>}
          {extra.length > 0 && <span>{extra.join(' · ')}</span>}
          <small>{dates.join(' · ')}</small>
        </span>
      }
    />
  );
}

function latestIndex(h: PersonDetail['indexHistory']) {
  let best: PersonDetail['indexHistory'][number] | null = null;
  for (const e of h) if (!best || (parseIso(e.asOf)?.getTime() ?? 0) >= (parseIso(best.asOf)?.getTime() ?? 0)) best = e;
  return best;
}

const PLAYS_LIMIT = 20;

export function AdminPerson({ id }: { id: string }) {
  const ui = useUi();
  const q = useAsync((s) => getPerson(id, s), [id]);
  const [allPlays, setAllPlays] = useState(false);
  const d = q.data;
  const left = <BackButton onClick={ui.back} />;

  if (isForbidden(q.error)) {
    return (
      <Screen title="Testeur" left={left}>
        <EmptyState icon="lock" title="Accès réservé" text="Cette zone est réservée au compte administrateur." />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen title="Testeur" left={left}>
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

  const p = d.person;
  const name = personName(p);
  const photo = typeof d.profile?.photo === 'string' && d.profile.photo ? d.profile.photo : null;
  const idx = latestIndex(d.indexHistory);
  const history = [...d.indexHistory].sort((a, b) => (parseIso(b.asOf)?.getTime() ?? 0) - (parseIso(a.asOf)?.getTime() ?? 0));
  const plays = allPlays ? d.plays : d.plays.slice(0, PLAYS_LIMIT);

  return (
    <Screen
      title={name}
      left={left}
      right={<NavIconButton icon="refresh" label="Actualiser" onClick={q.reload} spinning={q.loading} />}
    >
      <div className="adm-head">
        <Avatar photo={photo} name={name} size={64} />
        <div className="adm-head-main">
          <strong>{name}</strong>
          <span>{p.email}</span>
          {p.username && <span>@{p.username}</span>}
          <Badges demo={p.demo} admin={p.admin} />
        </div>
      </div>

      <Group title="Compte">
        <Row label="E-mail" value={p.email} />
        {p.username && <Row label="Identifiant" value={p.username} />}
        <Row label="Compte créé le" value={fmtStamp(p.createdAt)} sub={relTime(p.createdAt)} />
        <Row label="E-mail vérifié" value={<span className={p.emailVerified ? 'tone-green' : 'tone-orange'}>{p.emailVerified ? 'Oui' : 'Non'}</span>} />
        {d.providers.length > 0 && <Row label="Connexion" value={d.providers.map((x) => PROVIDERS[x] ?? x).join(', ')} />}
        <Row label="Appareils" value={p.devices} />
        <Row label="Connexions" value={p.logins} />
        <Row label="Identifiant interne" value={<span className="adm-mono">{p.id}</span>} />
      </Group>

      <Group title="Infos">
        <ProfileRows profile={d.profile} />
        {idx && <Row label="Dernier index" value={idx.index.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} sub={fmtDate(idx.asOf)} />}
      </Group>

      {history.length > 1 && (
        <Group title="Historique d'index">
          {history.slice(0, 8).map((e) => (
            <Row key={e.asOf} label={fmtDate(e.asOf)} value={e.index.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} />
          ))}
        </Group>
      )}

      <UsageTiles usage={p.usage} />
      <DailyChart daily={d.daily} days={60} showPeople={false} />
      <VolumeGroup volume={p.volume} />

      <Group title={`Séances (${d.plays.length})`}>
        {d.plays.length === 0 && <div className="row row--muted">Aucune séance enregistrée.</div>}
        {plays.map((x) => (
          <PlayItem key={x.id} p={x} />
        ))}
        {!allPlays && d.plays.length > PLAYS_LIMIT && <MoreRow label={`Tout voir (${d.plays.length})`} onClick={() => setAllPlays(true)} />}
      </Group>

      <RankGroup title="Temps par écran" items={d.screens} kind="screens" color="var(--blue)" />
      <RankGroup title="Touchers" items={d.taps} kind="plain" color="var(--tint)" />
      <RankGroup title="Saisies" items={d.inputs} kind="plain" color="var(--purple)" />

      <Group title={`Appareils (${d.devices.length})`}>
        {d.devices.length === 0 && <div className="row row--muted">Aucun appareil.</div>}
        {d.devices.map((v) => (
          <Row
            key={v.deviceId}
            label={deviceLabel(v.userAgent, v.screen, v.standalone)}
            sub={
              <>
                {place(v) && <span className="adm-line">{place(v)}</span>}
                {v.ip && <span className="adm-line">IP {v.ip}</span>}
                <span className="adm-line">
                  1re vue {fmtStamp(v.firstSeen)} · dernière {relTime(v.lastSeen)}
                </span>
              </>
            }
            chevron
            onClick={() => ui.push({ type: 'admin-device', id: v.deviceId })}
          />
        ))}
      </Group>

      <Group title={`Connexions (${d.authSessions.length})`}>
        {d.authSessions.length === 0 && <div className="row row--muted">Aucune connexion.</div>}
        {d.authSessions.map((s, i) => (
          <Row
            key={`${s.createdAt}-${i}`}
            label={fmtStamp(s.createdAt)}
            sub={[s.ipAddress, deviceLabel(s.userAgent)].filter(Boolean).join(' · ')}
            value={<Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'active' : 'expirée'}</Badge>}
          />
        ))}
      </Group>

      <Journal activity={d.activity} />
    </Screen>
  );
}
