// Briques communes aux écrans admin (tuiles, graphe quotidien, classements, journal).
import { useMemo, useState, type ReactNode } from 'react';
import type { ActivityItem, DayPoint, PersonRow, Ranked, Usage, Volume } from '../../shared/admin';
import { Badge, Group, Row } from '../components/Controls';
import { BarChart, type BarDatum } from '../practice/charts';
import '../practice/charts.css';
import { activitySub, activityText, formatDuration, fmtDayAxis, fmtDayLong, fmtStamp, fmtTime, lastDays, parisDay, parseIso, relTime, screenLabel } from './labels';
import './admin.css';

const nf = (n: number) => n.toLocaleString('fr-FR');

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${nf(n)} ${n > 1 ? many : one}`;
}

export function personName(p: Pick<PersonRow, 'displayName' | 'name' | 'email'>): string {
  return p.displayName?.trim() || p.name?.trim() || p.email;
}

/* ------------------------------------------------------------------ tuiles */

export interface TileData {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}

export function Tiles({ items }: { items: TileData[] }) {
  return (
    <div className="stat-grid">
      {items.map((t) => (
        <div className="stat-tile adm-tile" key={t.label}>
          <strong className={t.tone ? `tone-${t.tone}` : ''}>{t.value}</strong>
          <span>{t.label}</span>
          {t.sub != null && <em className="adm-tile-sub">{t.sub}</em>}
        </div>
      ))}
    </div>
  );
}

export function UsageTiles({ usage }: { usage: Usage }) {
  return (
    <>
      <Tiles
        items={[
          { label: 'Visites', value: nf(usage.visits) },
          { label: 'Jours actifs', value: nf(usage.activeDays) },
          { label: 'Temps total', value: formatDuration(usage.timeMs) },
          { label: 'Touchers', value: nf(usage.taps) },
        ]}
      />
      <Group>
        <Row label="Première visite" value={fmtStamp(usage.firstSeen)} />
        <Row label="Dernière visite" value={usage.lastSeen ? `${relTime(usage.lastSeen)}` : 'jamais'} sub={usage.lastSeen ? fmtStamp(usage.lastSeen) : undefined} />
        <Row label="Dernier écran" value={screenLabel(usage.lastScreen)} />
      </Group>
    </>
  );
}

export function VolumeGroup({ volume, title = 'Volume ajouté', footer }: { volume: Volume; title?: string; footer?: ReactNode }) {
  return (
    <Group title={title} footer={footer}>
      <Row label="Parties" value={nf(volume.rounds)} />
      <Row label="Practices" value={nf(volume.ranges)} />
      <Row label="Trous saisis" value={nf(volume.holes)} />
      <Row label="Coups posés" value={nf(volume.shots)} />
      <Row label="Exercices" value={nf(volume.drills)} />
      <Row label="Votes de par" value={nf(volume.parVotes)} />
      <Row label="Index ajoutés" value={nf(volume.indexEntries)} />
      <Row label="À la corbeille" value={<span className={volume.deleted ? 'tone-orange' : ''}>{nf(volume.deleted)}</span>} />
    </Group>
  );
}

/* ------------------------------------------------------------------ avatar */

export function Avatar({ photo, name, size = 64 }: { photo?: string | null; name: string; size?: number }) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span className="adm-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : initials}
    </span>
  );
}

/* ------------------------------------------------------------------ plus */

export function MoreRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="row row--tap row--center adm-more" onClick={onClick}>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ graphe quotidien */

interface Bucket {
  key: string;
  label: string;
  timeMs: number;
  people: number;
  devices: number;
}

function buckets(daily: DayPoint[], days: number): Bucket[] {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = lastDays(days).map((day) => {
    const p = byDay.get(day);
    return { day, timeMs: p?.timeMs ?? 0, people: p?.people ?? 0, devices: p?.devices ?? 0 };
  });
  if (series.length <= 100) return series.map((s) => ({ key: s.day, label: fmtDayLong(s.day), timeMs: s.timeMs, people: s.people, devices: s.devices }));
  // Plus de 100 jours : une barre par semaine (la plus récente est complète).
  const out: Bucket[] = [];
  for (let end = series.length; end > 0; end -= 7) {
    const chunk = series.slice(Math.max(0, end - 7), end);
    out.unshift({
      key: chunk[0].day,
      label: `Semaine du ${fmtDayAxis(chunk[0].day)} au ${fmtDayAxis(chunk[chunk.length - 1].day)}`,
      timeMs: chunk.reduce((a, c) => a + c.timeMs, 0),
      people: Math.max(...chunk.map((c) => c.people)),
      devices: Math.max(...chunk.map((c) => c.devices)),
    });
  }
  return out;
}

export function DailyChart({ daily, days, title = 'Temps passé par jour', showPeople = true }: { daily: DayPoint[]; days: number; title?: string; showPeople?: boolean }) {
  const data = useMemo(() => buckets(daily, days), [daily, days]);
  const bars: BarDatum[] = data.map((b) => ({ key: b.key, value: Math.round(b.timeMs / 6000) / 10, axis: fmtDayAxis(b.key) }));
  const byKey = new Map(data.map((b) => [b.key, b]));
  const total = data.reduce((a, b) => a + b.timeMs, 0);
  return (
    <section className="adm-card">
      <h3 className="adm-card-title">{title}</h3>
      <div className="adm-card-big">
        <b>{formatDuration(total)}</b>
        <span>sur {days} jours · minutes</span>
      </div>
      <BarChart
        bars={bars}
        height={170}
        color="var(--blue)"
        minMax={5}
        labelEvery={Math.max(1, Math.ceil(bars.length / 6))}
        ariaLabel={`${title} sur ${days} jours`}
        placeholder="Touchez une barre pour voir un jour"
        describe={(b) => {
          const p = byKey.get(b.key);
          if (!p) return null;
          return (
            <>
              <span>{p.label}</span>
              <span>
                <b>{formatDuration(p.timeMs)}</b>
                {showPeople && ` · ${plural(p.people, 'compte')}`} · {plural(p.devices, 'appareil')}
              </span>
            </>
          );
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ classements */

export function RankGroup({
  title,
  items,
  kind,
  color,
  limit = 8,
  empty = 'Aucune donnée.',
}: {
  title: string;
  items: Ranked[];
  kind: 'screens' | 'plain';
  color: string;
  limit?: number;
  empty?: string;
}) {
  const [all, setAll] = useState(false);
  const metric = (r: Ranked) => (kind === 'screens' ? (r.timeMs ?? r.count) : r.count);
  const max = Math.max(1, ...items.map(metric));
  const shown = all ? items : items.slice(0, limit);
  return (
    <Group title={title}>
      {items.length === 0 && <div className="row row--muted">{empty}</div>}
      {shown.map((r) => (
        <div className="row adm-rank" key={r.key} style={{ ['--adm-c' as string]: color }}>
          <div className="adm-rank-head">
            <span className="adm-rank-name">{kind === 'screens' ? screenLabel(r.key) : r.key}</span>
            <span className="adm-rank-val">
              {kind === 'screens' ? (
                <>
                  {r.timeMs != null && <b>{formatDuration(r.timeMs)}</b>}
                  {r.timeMs != null && ' · '}
                  {plural(r.count, 'vue')}
                </>
              ) : (
                <b>{nf(r.count)}×</b>
              )}
            </span>
          </div>
          <div className="adm-rank-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(2, (metric(r) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      {!all && items.length > limit && <MoreRow label={`Tout voir (${items.length})`} onClick={() => setAll(true)} />}
    </Group>
  );
}

/* ------------------------------------------------------------------ journal */

const TYPE_TONE: Record<ActivityItem['type'], string> = {
  open: 'blue',
  view: 'gray',
  tap: 'green',
  input: 'purple',
  api: 'orange',
  error: 'red',
};

const ts = (i: ActivityItem) => parseIso(i.ts)?.getTime() ?? 0;

export function EventLine({ item }: { item: ActivityItem }) {
  const sub = activitySub(item);
  return (
    <div className="adm-ev">
      <time className="adm-ev-time" dateTime={item.ts} title={fmtStamp(item.ts)}>
        {fmtTime(item.ts)}
      </time>
      <i className={`adm-ev-dot adm-tone-${TYPE_TONE[item.type]}`} aria-hidden="true" />
      <div className="adm-ev-body">
        <span className={item.type === 'error' ? 'tone-red' : ''}>{activityText(item)}</span>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

interface VisitBlock {
  id: string;
  items: ActivityItem[];
  start: number;
  end: number;
  total: number;
}

export function Journal({ activity, pageSize = 100, title = 'Journal' }: { activity: ActivityItem[]; pageSize?: number; title?: string }) {
  const [limit, setLimit] = useState(pageSize);

  const { days, shownCount } = useMemo(() => {
    const sorted = [...activity].sort((a, b) => ts(b) - ts(a) || b.id - a.id);
    // Bornes de chaque visite sur l'ensemble des évènements chargés.
    const stats = new Map<string, { start: number; end: number; total: number }>();
    for (const i of sorted) {
      const t = ts(i);
      const s = stats.get(i.visitId) ?? { start: t, end: t, total: 0 };
      s.start = Math.min(s.start, t);
      s.end = Math.max(s.end, t + (i.durationMs ?? 0));
      s.total += 1;
      stats.set(i.visitId, s);
    }
    const shown = sorted.slice(0, limit);
    const byDay = new Map<string, Map<string, VisitBlock>>();
    for (const i of shown) {
      const day = parisDay(parseIso(i.ts) ?? new Date(0));
      let visits = byDay.get(day);
      if (!visits) byDay.set(day, (visits = new Map()));
      let v = visits.get(i.visitId);
      if (!v) {
        const s = stats.get(i.visitId)!;
        visits.set(i.visitId, (v = { id: i.visitId, items: [], ...s }));
      }
      v.items.push(i);
    }
    return {
      days: [...byDay.entries()].map(([day, visits]) => ({ day, visits: [...visits.values()] })),
      shownCount: shown.length,
    };
  }, [activity, limit]);

  if (activity.length === 0) {
    return (
      <Group title={title}>
        <div className="row row--muted">Aucune activité enregistrée.</div>
      </Group>
    );
  }

  return (
    <>
      {days.map(({ day, visits }, di) => (
        <Group key={day} title={di === 0 ? `${title} · ${fmtDayLong(day)}` : fmtDayLong(day)}>
          {visits.map((v) => (
            <div className="adm-visit" key={v.id}>
              <div className="adm-visit-head">
                <b>
                  Visite · {fmtTime(new Date(v.start).toISOString())} · {formatDuration(v.end - v.start)}
                </b>
                <span>{plural(v.total, 'action')}</span>
              </div>
              {v.items.map((i) => (
                <EventLine key={i.id} item={i} />
              ))}
            </div>
          ))}
        </Group>
      ))}
      {shownCount < activity.length && (
        <Group footer={`${shownCount} évènements affichés sur ${activity.length}.`}>
          <MoreRow label="Afficher plus" onClick={() => setLimit((l) => l + pageSize)} />
        </Group>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ divers */

export function Badges({ demo, admin }: { demo?: boolean; admin?: boolean }) {
  if (!demo && !admin) return null;
  return (
    <span className="adm-badges">
      {admin && <Badge tone="green">admin</Badge>}
      {demo && <Badge tone="orange">démo</Badge>}
    </span>
  );
}

export function place(d: { city: string | null; region: string | null; country: string | null }): string {
  return [d.city, d.region, d.country].filter(Boolean).join(', ');
}

