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
- Recadrage d'un extrait (fiches et accueil) : curseur 100–160 % sous la vignette, aperçu de l'extrait dans la vignette
  → `zoom` dans les `overrides` (absent = aucun recadrage).
- Navigation à gauche (comme l'en-tête du site) : cinematographers (fiches), home page, spotlight et fiction (à venir), contact.
- Home page : lien d'une bande Slate → `GET <SITE>/api/reel?link=…` (10 premiers films) → `data/home.json`
  (`reel`, `slides` avec `dps: [{ name, slug }]` reliés par le nom, `src` = valeurs Slate, `overrides` par id Slate).
  « Rafraîchir » relit la bande en gardant les corrections.
- Contact : logo du site (PNG/WebP blanc sur transparent) → `data/brand/logo-<horodatage>.png` + `data/site.json`
  (`logo`, `logoHeight`). Sans logo : texte « kinou ».
- Portrait : compressé dans le navigateur (1600 px max, WebP) → `data/dps/img/<slug>.webp`.
- CV : PDF → `data/dps/cv/CV-Prenom-Nom.pdf`, servi en téléchargement (`_headers`).
- Adresse (slug) : proposée depuis le nom (minuscules, sans accents), définitive après publication ;
  les chefs op déjà listés sur le site gardent leur adresse actuelle.

## Copie Slate → Amazon (robot `copie-slate.yml` + `tools/copie-slate.mjs`)
- Copie en flux (sans disque) les fichiers de chaque média Slate : original (toutes les images d'une galerie), versions web,
  extraits, vignette choisie → compartiment S3 `kinou-videos` (Stockholm, Intelligent-Tiering), **même chemin** que sur le
  CloudFront de Slate (`d1ko11x0ybxl0h…/<chemin>` → `d3toxii6rvamjf.cloudfront.net/<chemin>`).
- Slate refuse ses **pages** aux machines de GitHub (403 depuis le 24/11) mais pas ses **fichiers** : le robot part d'une **liste
  privée** (lue ailleurs, rangée dans le dépôt privé `notes`), déposée par un robot de `notes` dans `kinou-videos/prive-<hasard>/liste.json` ;
  le robot la trouve en listant le compartiment. Sans liste : arrêt en rouge. Jamais d'adresse de fichier dans ce dépôt ni dans les
  journaux d'Actions (publics) : seulement numéro, rôle, taille. Rien de sensible à une adresse devinable du compartiment
  (notre CloudFront le rend lisible).
- L'accès OIDC ne dure qu'une heure : l'outil aws le renouvelle tout seul via `tools/aws-cle.mjs` (credential_process), même
  en plein envoi. 30 échecs d'affilée = arrêt d'urgence (pas de passage suivant). Une erreur = passage en rouge.
- Test `test-slate-fichier.yml` (24/11) : lit 20 Mo d'un fichier Slate déjà public depuis GitHub (vérifie que les fichiers passent).
- Accès Amazon **sans clé** (OIDC) : rôle `arn:aws:iam::919012714656:role/kinou-robot-copie`, réservé à `Kinou-DoP/admin` branche
  `main` ; droits : déposer / lire / lister dans `kinou-videos`, pas d'effacement.
- Lancement à la main (Actions → Run workflow) : numéros précis (`ids`) ou tous (1 → 13000, reprise automatique avant 6 h),
  mode `tout` / `originaux` / `web`, case « vérification seule ». Déjà présent avec la même taille = sauté. Ne supprime rien.
- La liste complète des médias (export Slate, avec clients et prods) reste dans le dépôt privé `notes`, jamais ici.

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
