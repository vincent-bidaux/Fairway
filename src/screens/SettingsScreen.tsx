import { Artwork } from '../components/Artwork';
import { Group, Row } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { zoneLabel } from '../lib';
import { setPrefs, usePrefs } from '../store';
import { useUi } from '../ui';

export const APP_VERSION = '0.1.0';

export function SettingsScreen() {
  const { zone, adminToken } = usePrefs();
  const ui = useUi();

  return (
    <Screen title="Réglages" eyebrow>
      <section className="about-hero">
        <Artwork size={92} className="about-art" />
        <h2 className="about-title">FAIRWAY</h2>
        <p className="about-tag">Trouvez les prochaines compétitions de golf autour de vous.</p>
        <span className="about-version">Version {APP_VERSION}</span>
      </section>

      <Group title="Zone" footer="La zone est partagée entre les onglets Compétitions et Golfs.">
        <Row
          icon={<Icon name="locate" size={16} fill />}
          iconColor="var(--tint)"
          label="Où jouer ?"
          value={zoneLabel(zone, ui.departments)}
          chevron
          onClick={() => ui.openZone()}
        />
      </Group>

      <Group title="À propos">
        <Row label="Version" value={APP_VERSION} />
        <Row label="Données" sub="Sites des golfs, ffgolf, ligue Nouvelle-Aquitaine" />
        <Row
          icon={<Icon name="link" size={16} />}
          iconColor="var(--gray)"
          label="Code source sur GitHub"
          href="https://github.com/vincent-bidaux/Fairway"
          chevron
        />
      </Group>

      <Group
        title="Administration"
        footer="Réservé à la gestion des sources de données. Le code reste enregistré sur cet appareil uniquement."
      >
        <label className="row field">
          <span className="field-label">Code admin</span>
          <span className="field-control">
            <input
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Facultatif"
              value={adminToken}
              onChange={(e) => setPrefs({ adminToken: e.target.value.trim() })}
            />
          </span>
        </label>
        {adminToken && (
          <Row
            icon={<Icon name="lock" size={16} />}
            iconColor="var(--indigo)"
            label="Console d'administration"
            chevron
            onClick={() => ui.push({ type: 'admin' })}
          />
        )}
      </Group>
    </Screen>
  );
}
