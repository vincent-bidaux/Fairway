# Fairway ⛳️

Web app mobile (style iOS) pour trouver les compétitions de golf autour de soi.
Périmètre V1 : région Nouvelle-Aquitaine (12 départements).

- **Front** : Vite + React 18 + TypeScript, CSS maison inspiré des composants iOS (PWA installable).
- **API + collecte** : un seul Cloudflare Worker (`fairway`) avec Hono.
- **Base** : Cloudflare D1 `fairway-db` (golfs, sources, événements, historique de collecte).
- **Extraction** : pages des golfs → texte → Claude Haiku (sortie structurée via tool use) ; iCal lu directement.

## Démarrer en local

```bash
npm install
npm run db:migrate:local
npm run seed:build && npm run db:seed:local
echo 'ADMIN_TOKEN=dev' > .dev.vars          # + ANTHROPIC_API_KEY=sk-ant-...
npm run build && npx wrangler dev           # http://localhost:8787
# ou, pour itérer sur l'UI : npx wrangler dev (API) + npm run dev (Vite, proxy /api)
```

## Déploiement

Le Worker est connecté au dépôt GitHub (Workers Builds) : chaque push sur `main` lance
`npx wrangler deploy`, qui exécute d'abord `npm run build` (champ `build` de `wrangler.jsonc`).

Secrets à définir une fois (dashboard Cloudflare → Worker → Settings → Variables, ou CLI) :

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ADMIN_TOKEN
```

Schéma / données :

```bash
npm run db:migrate:remote
npm run seed:build && npm run db:seed:remote
```

## Comment l'agenda se remplit

1. `golfs` : liste finie des golfs (seed `db/seed/golfs.json`, coordonnées GPS).
2. `sources` : une ou plusieurs URL par golf (page « compétitions » du club, calendrier iCal, PDF)
   + sources régionales (ligue, comités) rattachées à aucun golf.
3. Le cron (toutes les heures) prend les sources « dues » (non collectées depuis 20 h), par lots de 8.
   Une page dont le contenu n'a pas changé (hash SHA-256) **ne repasse pas par le LLM** → coût quasi nul.
4. Chaque événement a une empreinte `golf|date|titre normalisé` : pas de doublon, mise à jour en place.
   Un événement à venir qui disparaît de sa source passe en `removed` (masqué), sauf si l'extraction est vide.
5. Bouton « Lancer une collecte » dans Réglages → Administration (même logique, à la demande).

Voir [PLAN.md](./PLAN.md) pour la feuille de route.
