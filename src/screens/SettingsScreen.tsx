import { Artwork } from '../components/Artwork';
import { Group, Row, Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { zoneLabel } from '../lib';
import { setPrefs, usePrefs, type Theme } from '../store';
import { useUi } from '../ui';
import { refreshAccount, signOut, useAccount } from '../practice/account';
import { deleteAccount, exportUrl, resetDemo } from '../practice/api';

export const APP_VERSION = '0.1.0';

export function SettingsScreen() {
  const { zone, adminToken, theme } = usePrefs();
  const ui = useUi();
  const account = useAccount();

  const onDelete = async () => {
    if (!window.confirm('Supprimer votre compte et toutes vos parties ? Cette action est définitive.')) return;
    try {
      await deleteAccount();
      await refreshAccount();
      ui.toast('Compte supprimé');
    } catch (e) {
      ui.toast((e as Error).message);
    }
  };

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

      <Group title="Apparence" footer="« Système » suit le réglage clair ou sombre de votre téléphone.">
        <div className="row set-theme">
          <Segmented<Theme>
            label="Apparence"
            value={theme}
            onChange={(v) => setPrefs({ theme: v })}
            options={[
              { value: 'system', label: 'Système' },
              { value: 'light', label: 'Clair' },
              { value: 'dark', label: 'Sombre' },
            ]}
          />
        </div>
      </Group>

      <Group
        title="Compte"
        footer={
          account.status === 'in'
            ? account.me.demo
              ? 'Compte de démo partagé : il est remis à zéro chaque nuit.'
              : 'Votre compte sert uniquement à enregistrer vos parties et vos stats.'
            : 'Un compte n’est utile que pour l’onglet Mes parties. Le reste de l’app fonctionne sans compte.'
        }
      >
        {account.status === 'in' ? (
          <>
            <Row
              icon={<Icon name="person" size={16} />}
              iconColor="var(--blue)"
              label={account.me.user.name || account.me.user.email}
              sub={account.me.demo ? 'Compte de démo' : account.me.user.email}
              chevron
              onClick={() => ui.push({ type: 'profile' })}
            />
            {!account.me.demo && <Row label="Exporter mes données" href={exportUrl} chevron />}
            {account.me.demo && (
              <Row
                label="Remettre la démo à zéro"
                onClick={async () => {
                  await resetDemo();
                  await refreshAccount();
                  ui.toast('Démo remise à zéro');
                }}
              />
            )}
            <Row label="Se déconnecter" onClick={() => void signOut().then(() => ui.toast('Déconnecté'))} />
            {!account.me.demo && <Row label="Supprimer mon compte" destructive onClick={() => void onDelete()} />}
          </>
        ) : (
          <Row
            icon={<Icon name="person" size={16} />}
            iconColor="var(--blue)"
            label="Se connecter ou créer un compte"
            chevron
            onClick={() => ui.openLogin()}
          />
        )}
      </Group>

      <Group
        title="Retours / Feedbacks"
        footer="Fairway est en développement : dites ce que vous aimez, ce que vous utilisez, ce que vous aimez moins, posez vos questions. Les testeurs actifs auront un compte gratuit à vie."
      >
        <Row
          icon={<Icon name="mail" size={16} />}
          iconColor="var(--tint)"
          label="Retours / Feedbacks"
          sub={account.status === 'in' && !account.me.demo ? 'Votre fil de discussion avec Vincent' : 'Programme testeurs'}
          value={
            account.status === 'in' && (account.me.feedbackUnread ?? 0) > 0 ? (
              <span className="settings-unread">{account.me.feedbackUnread} nouvelle{(account.me.feedbackUnread ?? 0) > 1 ? 's' : ''}</span>
            ) : undefined
          }
          chevron
          onClick={() => ui.push({ type: 'feedback' })}
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

      {account.status === 'in' && account.me.admin ? (
        <Group title="Administration" footer="Testeurs, activité, volume saisi, et collecte des compétitions.">
          <Row
            icon={<Icon name="lock" size={16} />}
            iconColor="var(--indigo)"
            label="Administration"
            chevron
            onClick={() => ui.push({ type: 'admin-home' })}
          />
        </Group>
      ) : (
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
      )}
    </Screen>
  );
}
