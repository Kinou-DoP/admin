# CLAUDE.md — admin kinou

Interface d'administration des fiches des chefs op de kinou.fr, et **source des données** du site.
Stack : HTML/CSS/JS vanilla, aucune dépendance npm. Hébergement : Netlify (déploiement auto sur push de `main`).

## Rôle
- `data/` : données du site (kinou.fr **et** sa beta), lues par le site directement dans ce repo GitHub
  (fonction `/api/data` du repo `site`).
  Format des fiches : voir le CLAUDE.md du repo `site` (section « Architecture des données »).
- `index.html` + `assets/` : l'interface d'admin. Elle lit et écrit `data/` **via l'API GitHub**
  (un commit par publication sur `main`), avec le token personnel de l'utilisateur.

## Fonctionnement
- Connexion : token GitHub « fine-grained » personnel (un par personne), limité au repo `kinou-agency/admin`,
  permission Contents : Read and write. Stocké dans le `localStorage` du navigateur, jamais dans le repo.
- Import d'un bundle Slate : `GET <SITE>/api/bundle/<uuid | code shots.re>` (fonction du repo `site`).
- Forcer la mise à jour du site : `POST <SITE>/api/refresh/<slug>` avec le token (vide le cache CDN du DP).
- Corrections par film : `overrides` indexés par id Slate (suivent le film si l'ordre change sur Slate).
- Stills d'un film : lien d'une page Slate `kinou.slateapp.com/work/<adresse>` sous le film → `GET <SITE>/api/stills?link=…`
  → `overrides[<id>].stills` (URLs signées telles quelles) + `stillsLink`.
- Portrait : compressé dans le navigateur (1600 px max, WebP) → `data/dps/img/<slug>.webp`.
- CV : PDF → `data/dps/cv/CV-Prenom-Nom.pdf`, servi en téléchargement (`_headers`).
- Adresse (slug) : proposée depuis le nom (minuscules, sans accents), définitive après publication ;
  les chefs op déjà listés sur le site gardent leur adresse actuelle.

## Crédits Netlify
- Une publication (commit qui ne touche que `data/`) **ne remet pas kinou-admin en ligne** : règle `ignore`
  du `netlify.toml`. Le site lit les données dans GitHub (`/api/data` du repo `site`, clé `GITHUB_DATA_TOKEN`).
  La copie `kinou-admin.netlify.app/data/` n'est donc plus à jour : elle ne sert que de secours sans clé.
- Chaque modification du code de l'admin = une mise en ligne (≈ 15 crédits) : regrouper les changements.

## Règles
- Ne jamais commiter de token ni de secret.
- Ne jamais modifier les URLs Slate/CloudFront (URLs d'images signées).
- `_headers` doit garder `Access-Control-Allow-Origin: *` sur `/data/*` (le site lit ces fichiers).
- Messages de commit en français.
