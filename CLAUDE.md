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
- Connexion : token GitHub « fine-grained » personnel (un par personne), limité au repo `Kinou-DoP/admin`,
  permission Contents : Read and write. Stocké dans le `localStorage` du navigateur, jamais dans le repo.
  Créé sans expiration (autorisé par l'organisation Kinou-DoP).
- Import d'un bundle Slate : `GET <SITE>/api/bundle/<uuid | code shots.re>` (fonction du repo `site`).
- Forcer la mise à jour du site : `POST <SITE>/api/refresh/<slug>` avec le token (vide le cache CDN du DP).
- Corrections par film : `overrides` indexés par id Slate (suivent le film si l'ordre change sur Slate).
  Onglet ALL (admin seulement, ouvert par défaut) : tous les films des catégories, chacun une fois. Pas de bouton
  « Clip d'accueil » (l'accueil se règle par la bande Slate). Un seul aperçu d'extrait joue à la fois.
- Sous un film (fiches et accueil) : liste de liens Slate `kinou.slateapp.com/work/<adresse>` (ou shots.re), stills ou vidéo,
  → `GET <SITE>/api/stills?link=…` → `extras` (`overrides[<id>].extras` ou slide de l'accueil) : `{ link, title, stills }` ou
  `{ link, title, full, video, img }` (URLs signées telles quelles). Une case vide en bas pour ajouter un lien de plus,
  flèches ↑ ↓ pour réordonner, × pour retirer. L'ancien `stills` + `stillsLink` est converti à la première modification.
- Recadrage d'un extrait (fiches et accueil) : curseur 100–160 % sous la vignette, aperçu de l'extrait dans la vignette
  → `zoom` dans les `overrides` (absent = aucun recadrage) ; extrait seulement, la vignette aussi si `zoomThumb` (case).
  Pendant le réglage : extrait entier + cadre rouge fin = partie gardée (taille de la vignette).
  Le cadre se déplace (cliquer-glisser, ou au doigt) → `zoomPos` = "X% Y%" (absent = centre) ; bouton « Recentrer ».
  Le curseur agrandit ou réduit le cadre autour de son centre (la position est recalculée).
- Cadrage téléphone du fond de la liste (sous le 1er film FEATURED seulement, bouton « Cadrage téléphone ») : extrait entier
  + bande rouge = partie visible sur un écran de téléphone (9:17), à faire glisser, + aperçu → `overrides[<id>].phoneX`
  (0–100, absent = centre) ; « Recentrer ».
- Navigation à gauche (comme l'en-tête du site) : cinematographers (fiches), home page, spotlight et fiction (à venir), contact.
- Home page : lien d'une bande Slate → `GET <SITE>/api/reel?link=…` (10 premiers films) → `data/home.json`
  (`reel`, `slides` avec `dps: [{ name, slug }]` reliés par le nom, `src` = valeurs Slate, `overrides` par id Slate).
  « Rafraîchir » relit la bande en gardant les corrections.
  Chaque film de l'accueil peut avoir ses stills et vidéos (liens Slate, comme pour les fiches → `extras`), affichés
  sous le film dans le lecteur de l'accueil ; `full` (film complet) vient de la bande.
  Vidéo d'un film de l'accueil : bouton « Éditer la vidéo » (+ résumé des réglages) → éditeur en grand (plein écran noir,
  Terminé / Échap / clic à côté), onglets « Extrait HD », « Recadrage ordinateur », « Téléphone » (une vidéo à la fois) :
  - Extrait HD : film complet + curseur du début → `start` (secondes) ; pendant qu'on bouge le curseur la vidéo est en
    pause sur l'image choisie, au lâcher le passage (durée d'un projet) est lu en boucle ; « Revenir à l'extrait Slate ».
  - Recadrage : `zoom` / `zoomPos` (cadre rouge ; clic sur l'image = retour au réglage).
  - Téléphone : bande rouge (comme pour le fond de la liste) → `phoneX` de la slide.
  Aperçus (survol de la carte, recadrage, téléphone) = passage HD s'il existe.
- Contact : logo du site (PNG/WebP blanc sur transparent) → `data/brand/logo-<horodatage>.png` + `data/site.json`
  (`logo`, `logoHeight`). Sans logo : texte « kinou ».
- Portrait : compressé dans le navigateur (1600 px max, WebP) → `data/dps/img/<slug>.webp`.
  Point de cadrage : clic/glisser sur la photo → `about.pos` = "X% Y%" (background-position sur le site), aperçus
  ordinateur (16:10) et téléphone (9:19,5) ; « Recentrer » = défaut "center 30%".
  Zoom 100–250 % → `about.zoom` (agrandissement vers le point de cadrage, `transform: scale` sur le site).
  Le site affiche le portrait en noir et blanc (filtre CSS) : la photo déposée peut rester en couleur.
- CV : PDF → `data/dps/cv/CV-Prenom-Nom.pdf`, servi en téléchargement (`_headers`).
- Adresse (slug) : proposée depuis le nom (minuscules, sans accents) ; modifiable ensuite (demande de Gus : reprendre les
  adresses de kinou.fr). Changement d'adresse = un seul commit : nouvelle fiche, ancienne supprimée (`remove` dans `commit`),
  `index.json` et liens de `home.json` (slides et overrides) mis à jour. Le portrait garde son fichier (`about.img`).

## Hébergement et branches
- L'admin utilisée au quotidien est sur **GitHub Pages** : https://kinou-dop.github.io/admin/ (publie la branche `beta`,
  gratuit, sans crédits Netlify). Le code de l'admin se modifie donc sur `beta` ; en ligne ~1 min après un push.
- Elle appelle les fonctions du site beta (`SITE` = https://beta--kinou-test.netlify.app : import Slate, refresh).
- `main` est publié sur Netlify (https://kinou-admin.netlify.app) : ancienne version, plus utilisée
  (adresse `kinou-agency/admin` dans son code : ne peut plus publier depuis le déplacement du dépôt).
- Toutes les versions publient dans les mêmes données (`data/` de la branche `main`, constante `BRANCH`).

À chaque modification de `admin.css` ou `admin.js`, mettre à jour le numéro `?v=` dans `index.html` (cache de GitHub Pages).

## Robot GitHub (branche main)
- `.github/workflows/home-full.yml` + `tools/fill-home.mjs` : après chaque publication de `data/home.json`, ajoute le
  film complet (`full`) des slides qui n'en ont pas, lu sur la bande Slate (`reel`). Gratuit (Actions, dépôt public),
  aucune mise en ligne Netlify (`.github/` et `tools/` exclus de la règle `ignore`). Lancement manuel possible :
  onglet Actions → « Films complets de l'accueil » → Run workflow.
- Si le robot échoue à enregistrer : Settings → Actions → General → Workflow permissions → « Read and write ».

## Crédits Netlify
- Une publication (commit qui ne touche que `data/`) **ne remet pas kinou-admin en ligne** : règle `ignore`
  du `netlify.toml`. Le site lit les données dans GitHub (`/api/data` du repo `site`, clé `GITHUB_DATA_TOKEN`).
  La copie `kinou-admin.netlify.app/data/` n'est donc plus à jour : elle ne sert que de secours sans clé.
- Chaque modification du code de l'admin = une mise en ligne (≈ 15 crédits) : regrouper les changements.

## Règles
- Ce dépôt est **public** (le plan gratuit de Netlify ne déploie pas les dépôts privés d'une organisation) :
  aucune donnée privée ici. Les données des applis internes (mails, contacts, relances, CV…) vont dans un dépôt
  **privé séparé** de Kinou-DoP, lu par l'admin avec le token de la personne connectée ; les clés de services
  dans les variables secrètes de Netlify. Rien de personnel écrit en dur dans le code.
- Ne jamais commiter de token ni de secret.
- Ne jamais modifier les URLs Slate/CloudFront (URLs d'images signées).
- `_headers` doit garder `Access-Control-Allow-Origin: *` sur `/data/*` (le site lit ces fichiers).
- Messages de commit en français.
