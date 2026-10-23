# CLAUDE.md — admin kinou

Interface d'administration des fiches des chefs op de kinou.fr, et **source des données** du site.
Stack : HTML/CSS/JS vanilla, aucune dépendance npm. Hébergement : Netlify (déploiement auto sur push de `main`).

## ⚠️ Netlify bloqué (crédits épuisés depuis le 21/10/2026)
On travaille uniquement sur GitHub (Pages + Actions). Les fonctions du site (`SITE` = https://beta--kinou-test.netlify.app :
`/api/bundle`, `/api/stills`, `/api/reel`, `/api/refresh`, `/api/data`) répondent encore mais sont **figées dans leur
version du 21/10** : un changement de `netlify/functions/` du repo site n'y arrive pas. Contournements :
- `importStills` : si `/api/stills` échoue (page d'une vidéo), lecture par `/api/reel` (1er film, sans `full`) ;
- le robot GitHub (`tools/fill-home.mjs`) ajoute le `full` manquant (slides de l'accueil, vidéos `extras` des fiches et
  de l'accueil) en lisant Slate directement, après chaque publication de `data/home.json` ou `data/dps/*.json`.
- Projets en images seulement : le robot lit leurs images sur le bundle Slate → `overrides[<id>].images`
  (fiches du commit publié ; toutes au lancement manuel). L'admin ne touche pas à ce champ.
Liste complète et choses à faire au retour sur Netlify : CLAUDE.md du repo `site` (« Hébergement actuel »).

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
- Sous un film (fiches et accueil) : liste de liens Slate `kinou.slateapp.com/work/<adresse>` (ou shots.re / slt.re, converti en
  shots.re par `shortLink` : les fonctions du site ne connaissent que shots.re), stills ou vidéo,
  → `GET <SITE>/api/stills?link=…` → `extras` (`overrides[<id>].extras` ou slide de l'accueil) : `{ link, title, stills }` ou
  `{ link, title, full, video, img }` (URLs signées telles quelles). Une case vide en bas pour ajouter un lien de plus,
  flèches ↑ ↓ pour réordonner, × pour retirer. L'ancien `stills` + `stillsLink` est converti à la première modification.
  « Relire le bundle » (fiche) et « Rafraîchir » (accueil) relisent aussi tous ces liens (`relinkAll` : extras, ancien
  stills, extrait au survol ; 4 à la fois ; lien sans réponse = ancienne version gardée ; `full` du robot gardé si même vidéo).
- Projet en stills (« Sans vidéo ») : case « Extrait vidéo au survol » → lien Slate d'une vidéo qui a un extrait
  → `overrides[<id>].hover` = `{ link, title, video, img? }` ; sur le site l'extrait joue au survol, le clic montre la galerie.
  Le recadrage (zoom / zoomPos) de ce projet se règle sur cet extrait.
- Recadrage d'un extrait (fiches et accueil) : curseur 100–250 % sous la vignette, sur toute sa largeur (250 % pour les films en 4:3 ; « Recadrage x % » et « Recentrer » dessous), aperçu de l'extrait dans la vignette
  → `zoom` dans les `overrides` (absent = aucun recadrage) ; extrait seulement, la vignette aussi si `zoomThumb` (case).
  Pendant le réglage : extrait entier + cadre rouge fin = partie gardée (taille de la vignette).
  Le cadre se déplace (cliquer-glisser, ou au doigt) → `zoomPos` = "X% Y%" (absent = centre) ; bouton « Recentrer ».
  Le curseur agrandit ou réduit le cadre autour de son centre (la position est recalculée).
- Cadrage téléphone du fond de la liste (sous le 1er film FEATURED seulement, bouton « Cadrage téléphone ») : extrait entier
  + bande rouge = partie visible sur un écran de téléphone (9:17), à faire glisser, + aperçu → `overrides[<id>].phoneX`
  (0–100, absent = centre) ; « Recentrer ».
- Annuler / Rétablir (barre du bas, ⌘Z / ⌘⇧Z ou Ctrl+Z / Ctrl+Y hors champ de texte) : instantanés de la page ouverte
  (fiche, accueil, contact) pris à chaque modification (`touch` → `record`, saisie regroupée après 0,4 s), 100 au plus ;
  chaque page déclare `histInit({ get, set })` ; historique remis à zéro à l'ouverture d'une page et après publication.
- Liste des chefs op : champ de recherche au-dessus (filtre au fil de la frappe, sans accents ; Entrée ouvre le 1er résultat).
- Historique (lien « historique » en bas du menu de gauche) : petite fenêtre, derniers commits de `data/` lus sur GitHub
  (`/commits?path=…`) : qui (login entre parenthèses dans le message « (admin, login) », ou « robot GitHub »), quand, quoi
  (lien vers le commit). Sur une fiche / l'accueil / le contact : ce fichier seulement, bouton « Tout voir ».
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
  « Voir sur le site » ouvre la beta sur GitHub Pages (`SITE_PAGES` = https://kinou-dop.github.io/site).
- `main` est publié sur Netlify (https://kinou-admin.netlify.app) : ancienne version, plus utilisée
  (adresse `kinou-agency/admin` dans son code : ne peut plus publier depuis le déplacement du dépôt).
- Toutes les versions publient dans les mêmes données (`data/` de la branche `main`, constante `BRANCH`).

À chaque modification de `admin.css` ou `admin.js`, mettre à jour le numéro `?v=` dans `index.html` (cache de GitHub Pages).

## Robot GitHub (branche main)
- `.github/workflows/home-full.yml` + `tools/fill-home.mjs` : après chaque publication de `data/home.json` ou d'une fiche
  (`data/dps/*.json`), ajoute le film complet (`full`) qui manque : slides de l'accueil (lu sur la bande Slate, `reel`)
  et vidéos ajoutées sous un film (`extras`, lu sur leur page Slate `link`) ; images des projets en images seulement
  (`overrides[<id>].images`, lues sur le bundle de la fiche publiée, ou de toutes les fiches au lancement manuel). Gratuit (Actions, dépôt public),
  aucune mise en ligne Netlify (`.github/` et `tools/` exclus de la règle `ignore`). Lancement manuel possible :
  onglet Actions → « Films complets (accueil et vidéos sous un film) » → Run workflow.
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
