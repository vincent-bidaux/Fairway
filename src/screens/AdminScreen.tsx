import { useState } from 'react';
import type { CrawlRun, SourceRow } from '../../shared/types';
import {
  ApiError,
  adminAddSource,
  adminCrawl,
  adminPatchSource,
  adminSources,
  adminStatus,
  getGolfs,
  type NewSource,
} from '../api';
import { Field, Group, Row, Segmented, Spinner, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { BackButton, NavIconButton, Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { useAsync } from '../hooks';
import { formatStamp } from '../lib';
import { usePrefs } from '../store';
import { useUi } from '../ui';

const KIND_LABELS: Record<SourceRow['kind'], string> = {
  club_page: 'Page de club',
  ffgolf: 'ffgolf',
  ligue: 'Ligue',
  comite: 'Comité',
  platform: 'Plateforme',
};

function errMsg(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return 'Code admin invalide';
  return (e as Error).message;
}

function StatTile({ value, label, tone }: { value: number | string; label: string; tone?: string }) {
  return (
    <div className="stat-tile">
      <strong className={tone ? `tone-${tone}` : ''}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RunSummary({ run }: { run: CrawlRun }) {
  return (
    <div className="run-summary">
      <div>
        <strong>{run.sourcesOk}</strong> ok · <strong>{run.sourcesUnchanged}</strong> inchangées ·{' '}
        <strong className={run.sourcesFailed ? 'tone-red' : ''}>{run.sourcesFailed}</strong> en erreur
      </div>
      <div>
        <strong>{run.eventsNew}</strong> nouvelles compétitions · <strong>{run.eventsUpdated}</strong> mises à jour
      </div>
    </div>
  );
}

function statusInfo(s: SourceRow): { label: string; tone: string } {
  if (s.lastStatus === 'ok') return { label: 'OK', tone: 'green' };
  if (s.lastStatus === 'unchanged') return { label: 'Inchangée', tone: 'gray' };
  if (s.lastStatus === 'error') return { label: 'Erreur', tone: 'red' };
  return { label: 'Jamais lancée', tone: 'gray' };
}

type Filter = 'all' | 'error' | 'never';

export function AdminScreen() {
  const { adminToken: token } = usePrefs();
  const ui = useUi();
  const status = useAsync((s) => adminStatus(token, s), [token]);
  const sources = useAsync((s) => adminSources(token, s), [token]);
  const [filter, setFilter] = useState<Filter>('all');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<CrawlRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const reloadAll = () => {
    status.reload();
    sources.reload();
  };

  const crawl = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const r = await adminCrawl(token, {});
      setRun(r);
      reloadAll();
    } catch (e) {
      setRunError(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const unauthorized =
    (status.error instanceof ApiError && status.error.status === 401) ||
    (sources.error instanceof ApiError && sources.error.status === 401);

  const list = (sources.data ?? []).filter((s) =>
    filter === 'error' ? s.lastStatus === 'error' : filter === 'never' ? !s.lastRunAt : true,
  );
  const selected = sources.data?.find((s) => s.id === selectedId) ?? null;
  const st = status.data;
  const lastRun = st?.lastRuns?.[0];

  return (
    <Screen
      title="Administration"
      left={<BackButton onClick={ui.back} />}
      right={<NavIconButton icon="refresh" label="Actualiser" onClick={reloadAll} spinning={status.loading || sources.loading} />}
    >
      {unauthorized ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="lock" size={34} />
          </div>
          <h2>Code admin invalide</h2>
          <p>Corrigez le code dans Réglages, section Administration.</p>
          <div className="empty-actions">
            <button type="button" className="btn" onClick={ui.back}>
              Retour aux réglages
            </button>
          </div>
        </div>
      ) : (
        <>
          {status.error && !st && (
            <p className="banner-error" role="alert">
              {errMsg(status.error)}
            </p>
          )}
          {st && (
            <div className="stat-grid">
              <StatTile value={st.sources.total} label="Sources" />
              <StatTile value={st.sources.ok} label="OK" tone="green" />
              <StatTile value={st.sources.unchanged} label="Inchangées" />
              <StatTile value={st.sources.error} label="En erreur" tone={st.sources.error ? 'red' : undefined} />
              <StatTile value={st.sources.never} label="Jamais lancées" tone={st.sources.never ? 'orange' : undefined} />
              <StatTile value={st.golfs} label="Golfs" />
              <StatTile value={st.events.upcoming} label="Compét. à venir" tone="green" />
              <StatTile value={st.events.total} label="Compét. au total" />
            </div>
          )}

          <Group
            title="Collecte"
            footer={
              lastRun
                ? `Dernier passage : ${formatStamp(lastRun.startedAt)} (${lastRun.trigger === 'cron' ? 'automatique' : 'manuel'}).`
                : undefined
            }
          >
            <div className="row row--block">
              <button type="button" className="btn btn--block" onClick={crawl} disabled={running}>
                {running ? (
                  <>
                    <Spinner small /> Collecte en cours…
                  </>
                ) : (
                  'Lancer une collecte'
                )}
              </button>
              {running && <p className="hint">Cela peut durer jusqu'à une minute. Ne quittez pas cet écran.</p>}
              {runError && (
                <p className="hint hint--error" role="alert">
                  {runError}
                </p>
              )}
              {run && !running && (
                <>
                  <RunSummary run={run} />
                  {run.remaining > 0 && (
                    <button type="button" className="btn btn--secondary btn--block" onClick={crawl}>
                      Continuer ({run.remaining} source{run.remaining > 1 ? 's' : ''} restante{run.remaining > 1 ? 's' : ''})
                    </button>
                  )}
                  {run.remaining === 0 && <p className="hint hint--ok">Toutes les sources ont été traitées.</p>}
                </>
              )}
            </div>
          </Group>

          <div className="sheet-pad sheet-pad--screen">
            <Segmented<Filter>
              label="Filtrer les sources"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Toutes' },
                { value: 'error', label: 'Erreurs' },
                { value: 'never', label: 'Jamais lancées' },
              ]}
            />
          </div>

          <Group title={`Sources${sources.data ? ` (${list.length})` : ''}`}>
            {sources.loading && !sources.data && (
              <div className="row row--center">
                <Spinner small />
              </div>
            )}
            {sources.error && !sources.data && <div className="row hint--error">{errMsg(sources.error)}</div>}
            {sources.data && list.length === 0 && <div className="row row--muted">Aucune source dans ce filtre.</div>}
            {list.map((s) => {
              const info = statusInfo(s);
              return (
                <button type="button" key={s.id} className="row row--tap source-row" onClick={() => setSelectedId(s.id)}>
                  <span className="row-main">
                    <span className={`row-label${s.enabled ? '' : ' is-muted'}`}>{s.label}</span>
                    <span className="row-sub">
                      {s.golfName ?? KIND_LABELS[s.kind]} ·{' '}
                      <span className={`tone-${info.tone}`}>{info.label}</span> · {s.eventCount} compét. ·{' '}
                      {formatStamp(s.lastRunAt)}
                    </span>
                    {s.lastStatus === 'error' && s.lastError && <span className="row-error">{s.lastError}</span>}
                  </span>
                  <Icon name="chevron" size={14} strokeWidth={2.6} className="chevron" />
                </button>
              );
            })}
          </Group>

          <div className="sheet-pad sheet-pad--screen">
            <button type="button" className="btn btn--secondary btn--block" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} strokeWidth={2.4} /> Ajouter une source
            </button>
          </div>
        </>
      )}

      <SourceSheet
        source={selected}
        token={token}
        onClose={() => setSelectedId(null)}
        onChanged={reloadAll}
      />
      <AddSourceSheet open={adding} token={token} onClose={() => setAdding(false)} onAdded={reloadAll} />
    </Screen>
  );
}

function SourceSheet({
  source,
  token,
  onClose,
  onChanged,
}: {
  source: SourceRow | null;
  token: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  // Mémorise la dernière source pour l'animation de fermeture.
  const [last, setLast] = useState<SourceRow | null>(null);
  if (source && source !== last) setLast(source);
  const s = source ?? last;

  const toggle = async (enabled: boolean) => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminPatchSource(token, s.id, { enabled });
      onChanged();
    } catch (e) {
      setMsg({ text: errMsg(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminCrawl(token, { sourceId: s.id });
      setMsg({
        text: `Terminé : ${r.eventsNew} nouvelle(s), ${r.eventsUpdated} mise(s) à jour${r.sourcesFailed ? ', en erreur' : ''}.`,
        error: r.sourcesFailed > 0,
      });
      onChanged();
    } catch (e) {
      setMsg({ text: errMsg(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const info = s ? statusInfo(s) : null;

  return (
    <Sheet open={!!source} onClose={onClose} title="Source">
      {s && info && (
        <>
          <Group>
            <Row label="Libellé" value={s.label} />
            <Row label="Golf" value={s.golfName ?? '—'} />
            <Row label="Type" value={KIND_LABELS[s.kind]} />
            <Row label="Parser" value={s.parser === 'ical' ? 'iCal' : 'LLM'} />
            <Row label="Statut" value={<span className={`tone-${info.tone}`}>{info.label}</span>} />
            <Row label="Dernier passage" value={formatStamp(s.lastRunAt)} />
            <Row label="Compétitions" value={s.eventCount} />
            <Row label="Adresse" sub={<span className="url-text">{s.url}</span>} href={s.url} chevron />
            {s.lastError && <div className="row row--text hint--error">{s.lastError}</div>}
          </Group>
          <Group>
            <Row
              label="Activée"
              value={<Switch checked={s.enabled} onChange={toggle} label="Source activée" disabled={busy} />}
            />
          </Group>
          <div className="sheet-pad">
            <button type="button" className="btn btn--block" onClick={collect} disabled={busy}>
              {busy ? <Spinner small /> : <Icon name="refresh" size={18} />} Collecter cette source
            </button>
            {msg && (
              <p className={`hint${msg.error ? ' hint--error' : ' hint--ok'}`} role="status">
                {msg.text}
              </p>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function AddSourceSheet({
  open,
  token,
  onClose,
  onAdded,
}: {
  open: boolean;
  token: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const golfs = useAsync((s) => getGolfs({ limit: 500 }, s), [], open);
  const [golfId, setGolfId] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SourceRow['kind']>('club_page');
  const [parser, setParser] = useState<SourceRow['parser']>('llm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^https?:\/\/\S+$/.test(url.trim()) && label.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const body: NewSource = {
      golfId: golfId ? Number(golfId) : null,
      url: url.trim(),
      label: label.trim(),
      kind,
      parser,
    };
    try {
      await adminAddSource(token, body);
      setUrl('');
      setLabel('');
      setGolfId('');
      onAdded();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nouvelle source"
      right={
        <button type="button" className="text-btn" onClick={onClose}>
          Annuler
        </button>
      }
      footer={
        <button type="button" className="btn btn--block" disabled={!valid || busy} onClick={submit}>
          {busy ? <Spinner small /> : null} Ajouter
        </button>
      }
    >
      <Group>
        <Field label="Golf">
          <select value={golfId} onChange={(e) => setGolfId(e.target.value)}>
            <option value="">{golfs.loading ? 'Chargement…' : 'Aucun (source régionale)'}</option>
            {(golfs.data?.items ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} — {g.city}
              </option>
            ))}
          </select>
        </Field>
        <Field label="URL">
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Libellé">
          <input type="text" placeholder="Ex. Calendrier 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceRow['kind'])}>
            {(Object.keys(KIND_LABELS) as Array<SourceRow['kind']>).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parser">
          <select value={parser} onChange={(e) => setParser(e.target.value as SourceRow['parser'])}>
            <option value="llm">LLM (page web)</option>
            <option value="ical">iCal (.ics)</option>
          </select>
        </Field>
      </Group>
      {golfs.error && <p className="hint hint--error sheet-pad">{golfs.error.message}</p>}
      {error && (
        <p className="hint hint--error sheet-pad" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
