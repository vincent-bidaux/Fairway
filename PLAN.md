# Fairway — plan de développement

_Mis à jour le 23/10/2026._

## Vision

Fairway est une web app mobile pour golfeurs. La V1 a un seul cœur : **trouver les compétitions près de chez soi**,
autour de sa position, d'une ville, ou dans un ou plusieurs départements. On l'étend ensuite avec d'autres fonctions.

## Architecture

```
iPhone / Android (PWA, style iOS)
        │  /api/*
        ▼
Cloudflare Worker « fairway » (Hono) ── assets statiques (Vite/React)
        │                         └── cron horaire → collecteur
        ▼
D1 « fairway-db » : departments · golfs · sources · events · crawl_runs
```

- **Référentiel golfs** : 91 golfs. Les 85 de l'annuaire officiel ffgolf ont leur code ffgolf, leurs coordonnées GPS, leur
  site et leur téléphone. Six autres parcours hors annuaire viennent d'OpenStreetMap et sont marqués « à vérifier ».
  Le référentiel se complète tout seul : un golf inconnu présent dans une source régionale est créé automatiquement,
  géocodé sur sa commune.
- **Collecte** : par sources. Une source « due » (non lue depuis 20 h) est traitée au cron suivant, par lots de 8.

| Source | Type | Contenu | Coût |
|---|---|---|---|
| ffgolf `/search/club-tournament` (ligue 03) | JSON | Toutes les compétitions saisies par les clubs (≈ 6 à 8 semaines d'horizon) | 0 € |
| ffgolf `/search/tournament/amateur_tournament/{id}` × 5 | JSON | Grands Prix, Trophées seniors, GP jeunes, mid-am, national | 0 € |
| CD33 (Gironde) `.ics` | iCal régional → Haiku | Championnats départementaux, seniors, jeunes | ≈ 0,01 €/lecture |
| Pages « compétitions » des clubs (23 connues + découverte auto) | HTML / PDF → Haiku | Trophées sponsors, tarifs, liens d'inscription | ≈ 0,01 € par page modifiée |

- **Économies** : une page dont le hash n'a pas changé ne repasse pas par le LLM. Les sources ffgolf sont du JSON, donc
  aucun appel IA.
- **Dédoublonnage** : empreinte `golf|date|titre normalisé`. Entre sources, un même golf le même jour avec un titre
  proche donne une seule fiche, enrichie (heure, prix, lien d'inscription).
- **Disparitions** : un événement à venir qu'une source ne liste plus passe en `removed`, masqué. Ce n'est jamais fait si
  l'extraction revient vide.

## Fait (Sprint 0, 23/10)

- [x] Schéma D1 + migrations, base `fairway-db` créée et migrée en production
- [x] API publique : compétitions (position + rayon / départements / période / type / recherche), golfs, communes
- [x] Collecteur : ffgolf JSON, iCal, HTML/PDF via Claude Haiku (sortie structurée), découverte auto des pages clubs
- [x] Admin protégé par jeton : état, sources, collecte manuelle, ajout/désactivation de sources
- [x] Front iOS : onglets Compétitions / Golfs (liste + carte) / Favoris / Réglages, fiche compétition (itinéraire,
      ajout au calendrier `.ics`, partage), mode sombre, PWA installable
- [x] Tests locaux : 203 compétitions réelles importées depuis la ffgolf, Grands Prix typés, dédoublonnage vérifié

## Sprint 1 — mise en production (à faire)

- [ ] Secrets Cloudflare : `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`
- [ ] Premier passage complet depuis l'admin (« Lancer une collecte » jusqu'à 0 source restante), puis relecture des sources en erreur
- [ ] Vérifier les 6 golfs « hors annuaire » (Thouarsais, Champs-Romain, Sorbier, Rochebois, Saint-Junien, Idron)
- [ ] Accents des noms de golfs (l'annuaire ffgolf est en majuscules sans accents) : correction manuelle ou passe Haiku unique
- [ ] **Juridique** : les CGU de ffgolf.org réservent les contenus à un usage personnel et privé. Avant une ouverture
      publique, demander une autorisation écrite à la ffgolf. Garder uniquement des faits (nom, date, lieu, formule),
      avec un lien vers la source.

## Sprint 2 — fiabilité de la collecte

- [ ] Changement de saison ffgolf : les identifiants de pages Grands Prix changent chaque année. Les redécouvrir
      automatiquement à partir de `/golf-amateur/.../2027` (regex `amateur_tournament/(\d+)`).
- [ ] URL du `.ics` CD33 : elle contient la date d'envoi. La redécouvrir depuis la page calendrier du comité.
- [ ] Surveillance : alerte si `numFound` ffgolf chute de plus de 50 % ou si le format JSON change. Taux d'erreur par source dans l'admin.
- [ ] Autres comités (CD40 XLSX, CD17 Wix, CD64, CD86…) via Haiku, au cas par cas
- [ ] Classification fine par Haiku des titres ffgolf ambigus (caritatif, convivial, seniors), avec cache par titre

## Sprint 3 — produit

- [ ] Alertes : « nouvelle compétition dans ma zone ». Web Push (PWA), ou e-mail avec un lien magique, ce qui suppose des comptes.
- [ ] Filtre « ouverte aux non-membres » et index max, quand l'info est disponible
- [ ] Export / abonnement iCal personnel (`/api/calendar.ics?lat=…&radius=…`)
- [ ] Service worker : consultation hors ligne des favoris
- [ ] Extension à d'autres ligues (le code ligue ffgolf est un simple paramètre)

## Idées de features suivantes

- Fiche golf enrichie : green-fees, slope / SSS, météo du jour de la compétition
- Covoiturage entre joueurs inscrits à la même compétition
- Suivi de ses compétitions jouées et de l'évolution de l'index (saisie manuelle)
- Partenariat clubs : un club « revendique » sa fiche et publie ses compétitions directement

## Méthode de travail

- Les tâches de recherche (sources, référentiels) et de construction d'écrans sont confiées à des **agents Sonnet**,
  pour limiter le coût. L'intégration, l'architecture et la vérification restent dans la session principale.
- Chaque push sur `main` déploie automatiquement via Workers Builds.
