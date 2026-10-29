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
- Connexion : token GitHub « fine-grained » personnel (un par personne), limité aux repos `Kinou-DoP/admin` et `Kinou-DoP/site`
  (site : pour les pages d'aperçu des liens, voir plus bas), permission Contents : Read and write. Stocké dans le `localStorage` du navigateur, jamais dans le repo.
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
- Téléphone : toucher autre chose qu'un champ de texte le quitte (sinon le clavier revenait au lâcher d'un curseur).
- Case « Aussi sur la vignette » : cocher / décocher arrête l'aperçu de l'extrait pour montrer la vignette.
- Fiche, onglet ouvert (sauf ALL) : interrupteur « Présentation vidéo + stills » → `showcase` de la fiche (liste des onglets) ;
  le site affiche alors cet onglet en présentation « vidéo + 6 stills » (voir CLAUDE.md du site, `renderShow`). Les stills viennent
  des liens de stills ajoutés sous chaque film (`extras`) ou des images d'un projet en images seulement (Gus 29/10).
- Recadrage d'un extrait (fiches et accueil) : curseur 100–250 % sous la vignette, sur toute sa largeur (250 % pour les films en 4:3 ; « Recadrage x % » et « Recentrer » dessous), aperçu de l'extrait dans la vignette
  → `zoom` dans les `overrides` (absent = aucun recadrage) ; extrait seulement, la vignette aussi si `zoomThumb` (case).
  Pendant le réglage : extrait entier + cadre rouge fin = partie gardée (taille de la vignette).
  Le cadre se déplace (cliquer-glisser, ou au doigt) → `zoomPos` = "X% Y%" (absent = centre) ; bouton « Recentrer ».
  Le curseur agrandit ou réduit le cadre autour de son centre (la position est recalculée).
- Cadrage téléphone du fond de la liste (sous le 1er film FEATURED seulement, bouton « Cadrage téléphone ») : extrait entier
  + bande rouge = partie visible sur un écran de téléphone (9:17), à faire glisser, + aperçu → `overrides[<id>].phoneX`
  (0–100, absent = centre) ; « Recentrer ».
- Barre du bas : Publier, ↶ Annuler, ↷ Rétablir, Voir sur le site ↗ (téléphone : ↶ ↷ et « Link ↗ », `.lg` / `.sm`) ; message (`status`) : pas de place vide
  sans message ; sur téléphone, une ligne au-dessus des boutons, qui défile doucement s'il est trop long (`.status.run`, Gus 29/10).
- Annuler / Rétablir (barre du bas, ⌘Z / ⌘⇧Z ou Ctrl+Z / Ctrl+Y hors champ de texte) : instantanés de la page ouverte
  (fiche, accueil, contact) pris à chaque modification (`touch` → `record`, saisie regroupée après 0,4 s), 100 au plus ;
  chaque page déclare `histInit({ get, set })` ; historique remis à zéro à l'ouverture d'une page et après publication.
- Avancement des fiches (suivi interne, pas sur le site) → `data/progress.json` = `{ <slug>: { step, at, by } }`, step 0 = à faire,
  1 Importé, 2 Snippet, 3 Recadrage & infos, 4 Stills (ordre du 29/10 ; avant : 2 Recadrage, 3 Snippet) (dernière étape faite ; sans entrée : 1 si la fiche existe, sinon 0).
  Fiche : curseur en haut à droite (`progressCtl`, crans + libellés cliquables), enregistré tout seul 0,7 s après (sans « Publier » :
  fichier relu puis seule la ligne du chef op changée, commit « Avancement Nom : étape »). Liste : tableau de bord « jeu vidéo »
  (`progressBoard` : « ROUND 1 ! » = progression des 3 premières étapes en % (somme des étapes plafonnées à 3 / 3 × nombre de chefs op),
  une jauge à 20 cases par étape (Importé, Snippet, Recadrage & infos) ; dessous « ROUND 2 ! STILLS » sur toute la largeur (fiches à l'étape 4) ;
  typo Press Start 2P (Google Fonts) ; pas de grade ni d'XP, Gus 27/10 ;
  clic sur une jauge = n'afficher que les fiches pas encore à cette étape, combiné à la recherche) et pastilles de couleur sous
  chaque nom (`pips`). Fichier hors des chemins du robot : aucune Action lancée.
- Liste des chefs op : champ de recherche au-dessus (filtre au fil de la frappe, sans accents ; Entrée ouvre le 1er résultat).
- Historique (lien « historique » en bas du menu de gauche) : petite fenêtre, derniers commits de `data/` lus sur GitHub
  (`/commits?path=…`) : qui (login entre parenthèses dans le message « (admin, login) », ou « robot GitHub »), quand, quoi
  (lien vers le commit). Sur une fiche / l'accueil / le contact : ce fichier seulement, bouton « Tout voir ».
- Navigation à gauche (comme l'en-tête du site) : cinematographers (fiches), home page, spotlight, fiction, press (à venir), contact.
- Fiction (lien « fiction » du menu, `data/fiction.json`) : comme le spotlight (lien d'une bande Slate + « Relire la bande », lue en
  entier par le robot ; mêmes réglages par film via `filmsSection` / `filmCard`, `state` = fic), plus sous le titre de chaque film
  (`ficCtl`) : statut New release / Coming soon / Past release (`status`, défaut past), genre (`genre`, onglet du genre si Past release),
  plateformes (`platforms`, un mot + Entrée = une étiquette, × pour retirer), date de
  sortie (`date`), affiche (compressée en WebP → `data/fiction/<id>-<horodatage>.webp` à la publication, `poster`).
  Cadrage cinémascope (`scopeCtl`, à la place du recadrage habituel) : onglets Vignette / Extrait ; image entière (16:9) et cadre
  rouge 2,39:1 toujours visible = partie gardée, à faire glisser ; curseur 100–250 % = cadre plus petit (agrandi sur le site) → `thumbCrop` / `snipCrop` = `{ z, x, y }` (même calcul que `scopeCrop` du site). Onglets de
  l'admin = statut. Publication : relit le fichier en ligne, n'écrit que `reel` et `overrides` (+ affiches), garde les `films`.
  Format et affichage : CLAUDE.md du site (« Fiction »).
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
- Spotlight (lien « spotlight » du menu, `data/spotlight.json`) : lien d'une bande Slate (pour l'instant shots.re/206850) +
  « Relire la bande » (publie le lien + `readAsk` = l'heure, pour que le fichier change même avec le même lien — sinon commit vide,
  robot pas lancé, attente dans le vide —, puis attend que le robot GitHub ait lu toute la bande : `films`, `readAt`) ; onglets
  (`categories`, défaut COMMERCIAL, MUSIC VIDEO, ART VIDEO — type Slate « Art Film » compté comme ART VIDEO ; ALL toujours en premier) ; films avec les mêmes réglages que sur
  une fiche (`filmsSection` / `filmCard` réutilisés : `state` = spotlight, `slate` = films rangés par catégorie) → `overrides`.
  Publication : relit le fichier en ligne et n'écrit que `reel`, `categories`, `overrides` (garde les `films` du robot).
  Étiquette de la vignette : chef op crédité. Format et affichage : CLAUDE.md du site (« Spotlight »).
- Aperçu des liens partagés (27/10) : à chaque publication d'une fiche, `sharePage` écrit `<slug>/index.html` (nom + photo du chef op
  en balises Open Graph : portrait About, sinon vignette du 1er film FEATURED) dans le dépôt **Kinou-DoP/site, branche beta**
  (API contents, seulement si le contenu change). Même contenu que `tools/share-pages.mjs` du site (à garder identique).
  Demande une clé GitHub avec **Contents : Read and write aussi sur le dépôt site** ; sinon la fiche est publiée quand même, sans
  message (Gus 29/10) : l'aperçu est refait par le workflow du site à sa prochaine mise à jour sur `beta`. Format : CLAUDE.md du site (« Adresses des pages »).
- Contact : page contact du site → `data/contact.json` : `team` (une ligne par personne : rôle, prénom, e-mail, téléphone ;
  ↑ ↓ ×, « + Ajouter une personne »), `address` (lignes), `newsletter` (lien) + `newsletterLabel` (texte du bouton), `social` (instagram, vimeo, imdb, facebook ;
  vide = pas affiché), `legal` (mentions légales, paragraphes séparés par une ligne vide, ligne seule courte = titre ; vide = pas de lien ;
  hébergeur à mettre à jour au retour sur Netlify). Publiée avec
  `data/site.json` en un seul commit (« Mise à jour du contact »). Historique de la page : `data/contact.json`.
- Contact, aussi : logo du site (PNG/WebP blanc sur transparent) → `data/brand/logo-<horodatage>.png` + `data/site.json`
  (`logo`, `logoHeight`). Sans logo : texte « kinou ».
- À propos : Instagram, Site web, puis « Autres liens » (`moreLinks`, nom du bouton + adresse, ↑ ↓ ×, « + Ajouter un lien ») →
  `about.links` = `[{ label, url }]` (IMDb, Vimeo… ; affichés sur le site après Instagram et Website).
- Portrait : compressé dans le navigateur (1600 px max, WebP) → `data/dps/img/<slug>.webp`.
  Point de cadrage : clic/glisser sur la photo → `about.pos` = "X% Y%" (background-position sur le site), aperçus
  ordinateur (16:10) et téléphone (9:19,5) ; « Recentrer » = défaut "center 30%".
  Zoom 100–250 % → `about.zoom` (agrandissement vers le point de cadrage, `transform: scale` sur le site).
  Le site affiche le portrait en noir et blanc (filtre CSS) : la photo déposée peut rester en couleur. Interrupteur « Noir et blanc
  sur le site » (coché par défaut) au-dessus du cadrage : décoché → `about.color: true`, portrait en couleur sur le site (et aperçus).
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
L'admin compare son `?v=` avec celui de `index.html` en ligne (`checkVersion`, au chargement, au retour sur l'onglet et avant chaque
publication) : plus récent → bandeau « Nouvelle version de l'admin disponible » + Recharger en haut, publication bloquée en attendant (Gus 30/10 :
une admin restée en mémoire sur un téléphone avait effacé le `showcase` de Vadim).

## Robot GitHub (branche main)
- `.github/workflows/home-full.yml` + `tools/fill-home.mjs` : après chaque publication de `data/home.json`, de
  `data/spotlight.json` ou `data/fiction.json` (lecture de toute la bande du spotlight / de la fiction) ou d'une fiche (`data/dps/*.json`), ajoute le film complet (`full`) qui manque : slides de l'accueil (lu sur la bande Slate, `reel`)
  et vidéos ajoutées sous un film (`extras`, lu sur leur page Slate `link`) ; images des projets en images seulement
  (`overrides[<id>].images` + leurs proportions `ratios`, lues sur le bundle de la fiche publiée — taille lue dans les 64 premiers
  Ko de chaque image —, ou de toutes les fiches au lancement manuel). Aussi les types de contenu Slate de chaque film d'une fiche
  (`overrides[<id>].types`, ex. Short Film, Series : affichés par le site sur les films Narrative ; Gus 29/10). Gratuit (Actions, dépôt public),
  aucune mise en ligne Netlify (`.github/` et `tools/` exclus de la règle `ignore`). Lancement manuel possible :
  onglet Actions → « Films complets (accueil et vidéos sous un film) » → Run workflow.
- Le robot ne peut pas vider le cache du site (`/api/refresh` refuse son jeton : « token GitHub refusé » dans son journal).
  Donc l'admin, après une publication qui a des vidéos sans film complet (« Vidéo · à publier », ex. vidéo Slate sans extrait),
  attend le commit du robot (`afterRobot`, 2 min au plus), vide le cache avec la clé de la personne connectée et reprend
  les films complets dans la page ouverte (`fullsFrom`) : fiches, accueil, spotlight, fiction (Gus 29/10).
- Publication d'une fiche : l'admin relit d'abord le fichier en ligne et reprend ce que le robot y a écrit (`robotFrom` : `images`,
  `ratios`, `types`, `full` des extras) — sinon chaque publication remettait l'ancienne version (ex. ordre des images de PANDA chez
  Vadim, changé sur Slate) et le robot la corrigeait une minute après, sans pouvoir vider le cache du site (Gus 30/10). Puis, après
  chaque publication, `afterRobot` attend le commit du robot (s'il y en a un), le reprend et vide le cache du site.
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
