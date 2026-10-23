import type { PlaySession } from '../../shared/practice';
import { Icon } from '../components/Icon';
import type { Profile } from './api';
import { Sparkline } from './charts';
import { ageFrom, fmtDateShortYear, initials, nf, rel } from './statsFormat';
import './practice.css';

export interface CardSummary {
  rounds: number;
  ranges: number;
}

/** Meilleure partie (≥ 9 trous saisis), comparée au par et ramenée à 18 trous. */
export function bestRound(sessions: PlaySession[]): { strokes: number; rel: number; holes: number } | null {
  let best: { strokes: number; rel: number; holes: number; r18: number } | null = null;
  for (const s of sessions) {
    const sum = s.summary;
    if (s.kind !== 'round' || !sum || sum.played < 9) continue;
    const r = sum.strokes - sum.par;
    const r18 = (r * 18) / sum.played;
    if (!best || r18 < best.r18) best = { strokes: sum.strokes, rel: r, holes: sum.played, r18 };
  }
  return best;
}

export function PlayerCard({
  profile,
  fallbackName,
  counts,
  best,
  onOpenProfile,
  onOpenIndex,
  interactive = true,
}: {
  profile: Profile | null;
  fallbackName?: string;
  counts: CardSummary;
  best: { strokes: number; rel: number; holes: number } | null;
  onOpenProfile: () => void;
  onOpenIndex: () => void;
  interactive?: boolean;
}) {
  const name = profile?.display_name?.trim() || fallbackName || 'Joueur';
  const history = profile?.index_history ?? [];
  const last = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const age = ageFrom(profile?.birth_year);
  const club = [profile?.home_golf_name?.split(' - ')[0], profile?.city ?? profile?.home_golf_city].filter(Boolean);
  const chips = [
    age != null && age >= 5 && age < 110 ? `${age} ans` : null,
    age != null && age >= 50 ? 'Senior' : null,
    profile?.handedness === 'left' ? 'Gaucher' : profile?.handedness === 'right' ? 'Droitier' : null,
    profile?.started_year ? `Joue depuis ${profile.started_year}` : null,
  ].filter(Boolean) as string[];
  const delta = last && prev ? Math.round((last.hcp_index - prev.hcp_index) * 10) / 10 : null;

  return (
    <div className="pcard" onClick={interactive ? onOpenProfile : undefined}>
      <svg className="pcard-art" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        {[92, 72, 52, 32].map((r) => (
          <circle key={r} cx="150" cy="170" r={r} fill="none" stroke="#fff" strokeOpacity={0.09} strokeWidth="1.2" />
        ))}
        <circle cx="150" cy="170" r="5" fill="#fff" fillOpacity="0.14" />
        <path d="M150 170V128l22 8-22 8" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="pcard-top">
        <button type="button" className="pcard-id" onClick={(e) => { e.stopPropagation(); onOpenProfile(); }} tabIndex={interactive ? 0 : -1} aria-label={`Modifier ma carte joueur, ${name}`}>
          <span className="pcard-avatar">{profile?.photo ? <img src={profile.photo} alt="" /> : <span>{initials(name)}</span>}</span>
          <span className="pcard-who">
            <span className="pcard-name">{name}</span>
            <span className="pcard-club">
              {club.length ? club.join(' · ') : 'Ajoutez votre golf d’attache'}
            </span>
          </span>
          <Icon name="chevron" size={14} strokeWidth={2.8} className="pcard-chev" />
        </button>
      </div>

      <div className="pcard-index-row">
        <button type="button" className="pcard-index" onClick={(e) => { e.stopPropagation(); onOpenIndex(); }} tabIndex={interactive ? 0 : -1} aria-label={last ? `Index ${nf(last.hcp_index)}, voir l’évolution` : 'Index non renseigné'}>
          <span className="pcard-label">Index</span>
          <span className="pcard-big">{last ? nf(last.hcp_index) : '—'}</span>
          <span className="pcard-asof">
            {last ? (
              <>
                {delta != null && delta !== 0 && (
                  <b className={delta < 0 ? 'is-up' : 'is-down'}>
                    {delta < 0 ? '↓' : '↑'} {rel(delta).replace('+', '')}
                  </b>
                )}
                {fmtDateShortYear(last.as_of)}
              </>
            ) : (
              'Touchez pour l’ajouter'
            )}
          </span>
        </button>
        {history.length > 1 && (
          <div className="pcard-spark">
            <Sparkline values={history.map((h) => h.hcp_index)} width={124} height={52} color="#fff" strokeWidth={2.4} fill={false} />
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="pcard-chips">
          {chips.map((c) => (
            <span key={c} className={`pcard-chip${c === 'Senior' ? ' pcard-chip--strong' : ''}`}>
              {c}
            </span>
          ))}
        </div>
      )}

      <dl className="pcard-stats">
        <div>
          <dt>Parties</dt>
          <dd>{counts.rounds}</dd>
        </div>
        <div>
          <dt>Practices</dt>
          <dd>{counts.ranges}</dd>
        </div>
        <div>
          <dt>Meilleure</dt>
          <dd>
            {best ? (
              <>
                {best.strokes}
                <small>{rel(best.rel, 0)}</small>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
