# Fairway — « Mes parties » : plan de développement

_Rédigé le 23/10/2026. Complète `PLAN.md`._

## 1. Ce qu'on construit

Un nouvel onglet **Mes parties**, placé dans la barre du bas juste avant **Réglages**. Le joueur y enregistre deux types de séances :

- **Partie** : 9 ou 18 trous joués sur un golf, saisie trou par trou (score, putts, fairway, green, pénalités, up & down).
- **Practice** : séance au practice ou sur les zones de petit jeu. On note la durée, le nombre de balles et ce qu'on a travaillé. On peut ajouter des exercices avec réussites/tentatives, par exemple 7 putts rentrés sur 10 à 2 m.

Au-dessus de la liste des séances, un **tableau de bord** inspiré d'Apple Santé : cartes de stats, graphes, filtre de période (1 M · 3 M · 6 M · 1 A · Tout) et écart avec la période précédente.

C'est le **seul endroit de l'app qui demande un compte**. Tout le reste fonctionne toujours en anonyme, avec les favoris stockés en local.

**Nom.** L'onglet s'appelle « Mes parties » pour l'instant. Un autre nom couvrirait aussi les séances de practice : « Carnet », au sens du carnet de jeu que tiennent beaucoup de golfeurs. On pourra trancher plus tard ; le libellé tient dans une seule constante.

## 2. Comptes

| Point | Choix |
|---|---|
| Bibliothèque | **Better Auth**, montée sur Hono (`/api/auth/*`), D1 via `kysely-d1` |
| Connexion | **Code à 6 chiffres envoyé par e-mail** (plugin `emailOTP`). Pas de mot de passe pour les vrais joueurs |
| Pourquoi pas le lien magique | Sur iPhone, le lien s'ouvre dans Safari, qui ne partage pas ses cookies avec l'app installée : le joueur resterait déconnecté |
| Session | Cookie HttpOnly, Secure, SameSite=Lax, valable **365 jours glissants** |
| Compte de démo | Identifiant **Demo**, mot de passe **Demo** (plugins `username` + `emailAndPassword`, inscription par mot de passe désactivée, longueur minimale abaissée à 4). Réservé à ce compte |
| Plus tard | V1.1 : passkey (Face ID) proposée après la première connexion. Google seulement si des joueurs le demandent. Apple écarté (99 $/an) |
| RGPD | `GET /api/me/export` (JSON complet) et `DELETE /api/me` (suppression en cascade, confirmée par un code). Une page « Confidentialité » liée depuis Réglages |
| Anti-abus | Au plus 5 codes par heure et par adresse, 20 par IP ; 3 essais par code ; le code expire au bout de 10 minutes |

**Envoi des e-mails depuis `abpq.cc`.** Deux options :

- **Cloudflare Email Service** : sans compte supplémentaire, les enregistrements DNS s'ajoutent tout seuls puisque `abpq.cc` est déjà chez Cloudflare. Il faut en revanche le plan **Workers Paid** (5 $/mois, 3 000 mails inclus) et le service est encore en bêta.
- **Resend** : gratuit jusqu'à 3 000 mails/mois et 100/jour. Il faut créer un compte Resend (à faire par Vincent), puis ajouter 3 ou 4 enregistrements DNS (SPF, DKIM, DMARC) sur un sous-domaine `mail.abpq.cc`.

Le code passe par une petite interface `sendMail()`, ce qui permet de changer de fournisseur sans toucher au reste.

## 3. Pars des trous

> Section complétée après la recherche de sources (voir § 3 bis en fin de document).

**Principe** : la base Fairway connaît les pars trou par trou. Elle est pré-remplie automatiquement quand une source existe, puis corrigée et complétée par les joueurs.

- Quand le joueur saisit son score sur un trou dont le par est connu, la règle est centrée sur ce par.
- Si le par n'est pas connu, le joueur le règle avec la flèche, et ce par entre dans la base.
- Un par corrigé par plusieurs joueurs remplace l'ancien. On garde un vote par joueur ; la valeur majoritaire gagne, et à égalité la source officielle reste.

## 4. Schéma D1 (migration `0003_mes_parties.sql`)

Tables Better Auth, générées par `better-auth generate` et appliquées avec `wrangler d1 migrations` : `user` (avec `username`), `session`, `account`, `verification`. La table `passkey` viendra en V1.1.

```sql
-- Pars connus (référentiel partagé, enrichi par les joueurs)
CREATE TABLE golf_holes (
  golf_id      INTEGER NOT NULL REFERENCES golfs(id) ON DELETE CASCADE,
  course       TEXT NOT NULL DEFAULT '',      -- boucle pour les 27/36 trous ('' = parcours principal)
  hole         INTEGER NOT NULL,              -- 1..18
  par          INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  stroke_index INTEGER,                       -- handicap du trou, si connu
  source       TEXT NOT NULL,                 -- 'osm' | 'club' | 'ffgolf' | 'players'
  votes        INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (golf_id, course, hole)
);

CREATE TABLE par_votes (                      -- un vote par joueur et par trou
  user_id  TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  golf_id  INTEGER NOT NULL, course TEXT NOT NULL DEFAULT '', hole INTEGER NOT NULL,
  par      INTEGER NOT NULL,
  voted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, golf_id, course, hole)
);

CREATE TABLE play_sessions (
  id           TEXT PRIMARY KEY,              -- UUID créé sur le téléphone (saisie hors ligne)
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('round','range')),
  golf_id      INTEGER REFERENCES golfs(id),  -- NULL = autre lieu
  course       TEXT NOT NULL DEFAULT '',
  played_at    TEXT NOT NULL,                 -- date-heure locale ISO
  holes        INTEGER,                       -- partie : 9 ou 18
  start_hole   INTEGER DEFAULT 1,             -- 1 ou 10
  tee          TEXT,                          -- 'blanc' | 'jaune' | 'bleu' | 'rouge'
  duration_min INTEGER,                       -- practice
  balls        INTEGER,                       -- practice
  focus        TEXT,                          -- practice : ce qu'on a travaillé
  feeling      INTEGER CHECK (feeling BETWEEN 1 AND 5),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);
CREATE INDEX idx_play_user ON play_sessions(user_id, played_at);
CREATE INDEX idx_play_golf ON play_sessions(golf_id, kind);   -- futures stats par parcours

CREATE TABLE round_holes (
  session_id  TEXT NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  hole        INTEGER NOT NULL,
  par         INTEGER NOT NULL,               -- copié au moment de la partie
  strokes     INTEGER,                        -- NULL = trou non joué / non saisi
  putts       INTEGER,
  fairway     TEXT CHECK (fairway IN ('hit','left','right','short')),  -- NULL sur par 3
  gir         INTEGER,                        -- 0/1, NULL = non saisi (déduit si possible)
  penalties   INTEGER NOT NULL DEFAULT 0,
  up_down     INTEGER,                        -- 0/1, seulement si green manqué
  sand        INTEGER,                        -- 0/1/NULL : départ de bunker de green
  PRIMARY KEY (session_id, hole)
);

CREATE TABLE range_drills (
  session_id  TEXT NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('long','approach','chip','bunker','putting')),
  label       TEXT NOT NULL,                  -- « Putts à 2 m », « Driver dans le couloir »
  distance_m  INTEGER,
  attempts    INTEGER,
  successes   INTEGER,
  PRIMARY KEY (session_id, position)
);
```

Principes :

- Les stats ne sont **pas stockées** : elles sont calculées à la volée, que ce soit le score relatif, le GIR déduit, les 3-putts ou les moyennes. Il n'y a jamais de désaccord entre une saisie et un total.
- Un trou non saisi ne compte pas comme un zéro.
- Pour les moyennes « par partie », une 9 trous est ramenée à 18. On peut aussi filtrer 9 ou 18 trous.
- Suppression d'une séance : on remplit `deleted_at` (corbeille de 30 jours, annulation possible).
- **Stats par parcours, plus tard** : `round_holes` garde le lien golf → trou → par. Les agrégats par parcours (trou le plus difficile, score moyen par trou) se feront sans migration.

## 5. API (toutes sous `/api/me/*`, session obligatoire)

| Route | Rôle |
|---|---|
| `GET /api/me` | Profil, nombre de séances |
| `GET /api/me/sessions?from&to&kind` | Liste (pagination par date) |
| `GET /api/me/sessions/:id` | Détail, avec trous ou exercices |
| `PUT /api/me/sessions/:id` | Créer ou mettre à jour (idempotent, l'id vient du téléphone) |
| `DELETE /api/me/sessions/:id` | Mettre à la corbeille |
| `GET /api/me/stats?period=3m` | Tous les chiffres et séries du tableau de bord, calculés en SQL, plus la période précédente pour les écarts |
| `GET /api/golfs/:id/holes` | Pars connus (public) |
| `GET /api/me/export` · `DELETE /api/me` | RGPD |

Pour le choix du golf, l'API golfs existante suffit : tri par distance, recherche, département. On y ajoute « mes golfs récents » côté `/api/me`.

## 6. Écrans

**Onglet Mes parties, sans compte.** Le tableau de bord s'affiche en gris, monochrome, avec des données fictives estompées, sous ce message : « Enregistrez vos parties et vos séances de practice, suivez vos progrès. Pour garder vos stats, créez un compte gratuit. » Deux boutons : « Créer un compte ou se connecter », puis un lien discret « Essayer le compte de démo ».

**Connexion.** Une feuille en deux étapes : l'adresse e-mail, puis le code à 6 chiffres. Le code se remplit automatiquement sur iPhone grâce à `autocomplete="one-time-code"`. Un lien « Renvoyer le code » s'active après 30 s. Le compte de démo passe par une autre feuille, avec identifiant et mot de passe.

**Tableau de bord** (en haut de l'onglet) :
1. Grande carte : score moyen relatif au par, sa courbe et l'écart avec la période précédente
2. Répartition birdie / par / bogey / double / triple+, en barre empilée
3. Score moyen sur les par 3 / 4 / 5
4. Fairways : % touchés et petite rose gauche / droite / court
5. Greens en régulation (%)
6. Putts par partie et % de 3-putts
7. Up & down (%) et pénalités par partie
8. Practice : minutes et balles par semaine (barres façon Activité), réussite des exercices de putting par distance

Une carte n'affiche son pourcentage qu'à partir de 3 parties ; avant, elle propose de saisir quelques parties de plus. Toucher une carte ouvre son détail, avec un graphe plein écran et le choix de la période.

**Liste des séances**, sous le tableau de bord : groupée par mois, une cellule par séance. Pour une partie : golf, date, score brut et relatif. Pour un practice : golf, durée, balles.

**Nouvelle séance** (bouton + en haut à droite) :
1. Type : Partie ou Practice (contrôle segmenté).
2. Golf : liste triée **par distance** si la position est disponible, avec les **récents** en tête (les 3 derniers golfs joués). Une barre de recherche est disponible, ainsi que les tris **A–Z** et **Département**. Les favoris sont marqués d'une étoile. Pour le practice, on peut aussi choisir « Autre lieu ».
3. Date et heure : préremplies avec le moment présent, modifiables.
4. Partie : 9 ou 18 trous, départ au 1 ou au 10, couleur de départ (facultative).

**Saisie d'une partie, trou par trou** (un écran par trou, glissement horizontal) :
- En-tête : « Trou 7 », avec le par et la règle de par juste en dessous.
- **Règle des scores** : les chiffres de 1 à 12 sur une ligne, en défilement horizontal aimanté. La règle s'ouvre centrée sur **par + 1**, puisque le bogey est le score le plus fréquent. Sous chaque chiffre, son nom en petit : Eagle, Birdie, Par, Bogey, Double… Toucher un chiffre le sélectionne : la pastille se remplit avec une couleur qui dépend de l'écart au par, avec un léger retour haptique.
- **Flèche du par** : un petit triangle sous la règle, aligné sur le chiffre du par. On le fait glisser pour changer le par, qui s'aimante sur 3, 4, 5 ou 6. Si le par vient de la base, la flèche est grisée et un appui long permet de la corriger.
- Ensuite, des puces optionnelles, une ligne chacune :
  - Putts : 0 · 1 · **2** · 3 · 4+
  - Fairway : ← Gauche · Touché · Droite → · Court (cachée sur un par 3)
  - Green en régulation : déduit automatiquement, avec une coche modifiable
  - Pénalités : 0 · 1 · 2+
  - Up & down : n'apparaît que si le green est manqué
- Toucher le score suffit pour passer au trou suivant ; le reste est facultatif. Une **carte de score** récapitule tout en tableau, pour ceux qui saisissent après coup.
- La saisie est enregistrée sur le téléphone à chaque toucher et synchronisée dès que le réseau revient. Sur un parcours, la couverture réseau est souvent mauvaise.

**Saisie d'un practice** : durée (roue), balles (30 · 50 · 70 · 100 · autre), ce qu'on a travaillé (puces : grand jeu, approches, chipping, bunker, putting), exercices facultatifs (« 10 putts à 2 m » : stepper des réussites), ressenti sur 5 et une note.

**Fiche séance** : carte de score colorée, stats de la partie et comparaison avec la moyenne du joueur. Boutons Modifier, Partager et Supprimer.

**Graphes** : composants SVG maison (ligne, barres, barre empilée, anneau), aux couleurs système iOS, sans bibliothèque. L'app n'en utilise aucune aujourd'hui, et ces quatre formes suffisent.

## 7. Compte de démo

- 30 séances sur 18 mois (avril 2025 à octobre 2026) : 23 parties et 7 practices, sur 14 golfs à moins de 150 km de La Rochelle.
- Répartition : La Prée et La Rochelle Sud réunissent près de la moitié des séances. Ensuite, plus le golf est loin, moins il y a de séances. Une série de golfs n'a été joué qu'une fois.
- Le profil progresse : environ +28 au début, autour de +19 à la fin sur 18 trous. Les putts baissent, il y a moins de pénalités, et le slice se corrige peu à peu. Il y a moins de parties l'hiver.
- Les données sont dans `db/seed/demo-sessions.json`, générées par `scripts/build-demo.mjs` (tirage reproductible).
- **Réinitialisation chaque nuit** par le cron : tout le monde partage ce compte, chacun peut le modifier, et il redevient propre le lendemain.

## 8. Découpage

| Sprint | Contenu | Qui |
|---|---|---|
| **P1 — comptes** | Better Auth, OTP, compte démo, middleware `/api/me`, feuille de connexion, Réglages > Compte (déconnexion, export, suppression), envoi des mails | Session principale |
| **P2 — données** | Migration 0003, API séances et stats, pars des trous (import de la source + votes), chargement de la démo et cron de réinitialisation | Session principale, agent Sonnet pour l'import des pars |
| **P3 — saisie** | Nouvelle séance, choix du golf, règle des scores et flèche du par, puces, carte de score, practice, brouillon hors ligne | Agents Sonnet (écrans), intégration et vérification en principal |
| **P4 — tableau de bord** | Composants de graphes, cartes, détail plein écran, état vide grisé, fiche séance | Agents Sonnet, vérification en principal |
| **P5 — finitions** | Page confidentialité, accessibilité (VoiceOver sur la règle), mode sombre, tests sur iPhone | Principal |

Chaque sprint se termine par un déploiement et une vérification sur l'app en ligne avec le compte Demo.

## 9. À décider

- Fournisseur des e-mails : Cloudflare Email Service (5 $/mois) ou Resend (compte gratuit à créer).
- Le nom définitif de l'onglet.
