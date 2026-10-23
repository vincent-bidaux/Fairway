import { Icon, type IconName } from './Icon';

/** Nom de l'onglet (provisoire, voir PLAN-MES-PARTIES.md). */
export const PARTIES_LABEL = 'Mes parties';

export type TabId = 'events' | 'golfs' | 'favorites' | 'parties' | 'settings';

const TABS: Array<{ id: TabId; label: string; icon: IconName }> = [
  { id: 'events', label: 'Compétitions', icon: 'flag' },
  { id: 'golfs', label: 'Golfs', icon: 'pin' },
  { id: 'favorites', label: 'Favoris', icon: 'star' },
  { id: 'parties', label: PARTIES_LABEL, icon: 'chart' },
  { id: 'settings', label: 'Réglages', icon: 'gear' },
];

export function TabBar({ active, onChange, favCount }: { active: TabId; onChange: (t: TabId) => void; favCount: number }) {
  return (
    <nav className="tabbar" role="tablist" aria-label="Navigation principale">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          className={`tab${active === t.id ? ' is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-icon">
            <Icon name={t.icon} size={25} strokeWidth={active === t.id ? 2.2 : 1.7} fill={t.id === 'favorites' && active === t.id} />
            {t.id === 'favorites' && favCount > 0 && <span className="tab-badge">{favCount}</span>}
          </span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
