import { usePrefs } from '../store';
import { useUi } from '../ui';
import { zoneLabel } from '../lib';
import { Icon } from './Icon';

export function ZonePill() {
  const { zone } = usePrefs();
  const ui = useUi();
  return (
    <div className="pill-row">
      <button type="button" className="zone-pill" onClick={() => ui.openZone()} aria-label="Choisir la zone de recherche">
        <Icon name="locate" size={16} fill />
        <span className="zone-pill-label">{zoneLabel(zone, ui.departments)}</span>
        <Icon name="chevron-down" size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}
