# CLAUDE.md — admin kinou

Interface d'administration de kinou (site des chefs op + outils internes de l'équipe) et **source des données du site** (`data/`).
HTML / CSS / JS vanilla (`index.html`, `assets/js/admin.js`, `assets/css/admin.css`), aucune dépendance. On parle à Gus en français,
en le tutoyant, simplement.

**À lire aussi** : `ARCHITECTURE.md` (carte du code) ; `HISTORIQUE.md` (pourquoi les choses sont comme ça, demandes de Gus datées) ;
le CLAUDE.md du dépôt `site` (format des données et affichage) ; dans le dépôt privé `notes` : son CLAUDE.md (robots, données
internes), `FEUILLE-DE-ROUTE.md`, `etudes/`. **À chaque changement** : ce fichier (fonctionnement), une ligne datée en bas de
`HISTORIQUE.md`, `ARCHITECTURE.md` si la structure change.

## Branches, hébergement
- **Code sur `beta`** (dans une nouvelle session : `git checkout beta`) : publié sur GitHub Pages https://kinou-dop.github.io/admin/
  ~1 min après un push. **Données sur `main`** (`data/`, constante `BRANCH`), écrites par l'admin via l'API GitHub (un commit par
  publication). `main` contient aussi les robots (`.github/workflows/`, `tools/`). L'ancienne admin Netlify n'est plus utilisée.
- À chaque modification de `admin.js` ou `admin.css` : mettre à jour `?v=` dans `index.html`. L'admin compare son `?v=` à celui en
  ligne (`checkVersion`) : bandeau « Nouvelle version » et publication bloquée tant qu'on n'a pas rechargé (« Recharger » garde les
  modifications non publiées, `saveDraft`).
- `SITE` = `SITE_VIEW` = https://kinou-4tv.pages.dev (fonctions Cloudflare du site : lecture de Slate ; « Voir sur le site ») ;
  `SITE_PAGES` = beta GitHub Pages (pages d'aperçu des liens) ; `RAW_DATA` = données sur raw.githubusercontent.com.
- **Lecture de Slate** : par les fonctions du site (`siteGet`) ; si elles ne répondent pas, par le **robot GitHub** (`askRobot` :
  demande dans `data/ask/<horodatage>.json`, workflow `slate-ask.yml` + `tools/ask.mjs` sur `main`, ~1 min ; `tools/slate.mjs` =
  copie de `netlify/functions/slate.mjs` du site, **à garder identiques**). Slate exige un User-Agent.

## Connexion et droits
- Clé GitHub « fine-grained » par personne (Resource owner Kinou-DoP, dépôts `admin`, `site`, `notes`, Contents : Read and write, sans
  expiration), gardée dans le navigateur, jamais dans le dépôt. Le **prénom** est demandé à la 1re connexion d'une clé et lié à son
  empreinte (`notes/equipe/noms.json`) : il signe les commits « (admin, Prénom) » et l'historique.
- Clé sans droit d'écriture sur ce dépôt (`canWeb` faux) : rubrique website **en lecture seule** ; festivals, sélections,
  récupération, sorties, notes internes restent utilisables (dépôt notes).
- Ajouter une personne : l'inviter dans l'organisation Kinou-DoP, rôle **Write** sur `admin`, `site` et `notes`, puis elle crée sa clé
  (approbation éventuelle : organisation → Settings → Personal access tokens → Pending requests).

## Publication (règles importantes)
- `commit(files, message)` : un seul commit pour plusieurs fichiers ; réessaie seul (3 fois) si un autre commit passe entre-temps.
  Un fichier `{ path, edit }` est **relu dans le dernier commit** puis modifié (ex. `dps/index.json` : seule l'entrée du chef op change).
- Avant de publier une fiche, l'admin relit la version en ligne et garde ce que les robots ont écrit (`robotFrom` : `images`,
  `ratios`, `types`, `full`), les lignes de prix (`awMerge`) et ce que les autres pages ont changé entre-temps (`sharedMerge`,
  fusion à trois). Après publication, `afterRobot` attend le robot (2 min au plus) et reprend ses films complets.
- Fiction et spotlight : la publication n'écrit que `reel`, `categories`, `overrides` (+ affiches), jamais les `films` du robot.
- Annuler / Rétablir : instantanés de la page (`histInit`, `touch`) ; pages enregistrées tout de suite (festivals, récupération,
  sorties, sélections) : `immInit` / `immPush`.

## Pages (menu à gauche : website ▸, bibliothèque, sorties fiction, festivals ▸, récupération, historique)
- **Accueil de l'admin** (`#/`, `showHello`) : « Hello la Dream Team ! » + petit mot par ordre d'importance (`helloNews` : sorties de
  la semaine, dates de fiction trouvées / bandes-annonces, prix du jour).
- **Website** : **cinematographers** (`#/dops`, liste + tableau de bord d'avancement `data/progress.json`), **fiche d'un chef op**
  (`#/dp/<slug>`, `showDP`) : bundle Slate (« Relire le bundle » ; un snippet absent sur Slate mais présent dans la fiche est gardé),
  films par onglet (titre, crédits, masquer, recadrage, cadrage téléphone, liens Slate de stills / vidéos sous le film avec colonnes,
  extrait au survol, infos du film, **prix & sélections**, présentation vidéo + stills), bouton **« Compléter les infos des films
  (robot) »** (onglets fiction, 2nd unit, cam op ; champs vides seulement, marqués « à vérifier »), en ligne / caché, genre, notes
  internes (dépôt notes), about (bio, liens, portrait + cadrage, CV), adresse (slug). **Home page** (`showHome` : bande Slate, éditeur
  vidéo : extrait HD, recadrage, téléphone), **spotlight**, **fiction** (statut, genre, plateformes, date, affiche, cadrage scope,
  9 New releases au plus, passage automatique en New release le jour de la sortie, alerte « autre date trouvée »), **contact**
  (+ logo, mentions légales).
- **Filmothèque** (appelée « bibliothèque » dans le code ; `#/bibli`, `showBibli`) : tous nos films (fiches, fiction, spotlight, accueil, imports `data/bibli/library.json`),
  **les plus récents en haut** (id Slate décroissant). Recherche avec suggestions dans cet ordre : chef op (étiquette orange), réal, prod,
  client, type de contenu, catégorie (jamais les films ; 4 par sorte) → filtres en étiquettes. Client / types de contenu / mots-clés :
  `data/bibli/meta.json`, écrit chaque nuit par le robot `bibli-meta.yml` (`tools/bibli-meta.mjs`, `readMeta` de `slate.mjs`, `main`).
  **Bandes** (panneau de droite) : en arrivant, toujours une nouvelle bande vide ; on glisse les films n'importe où dans la colonne
  (film qui suit la souris avec effet ressort, paquet d'images pour plusieurs films cochés ; Maj + clic = plage), « + », réordonner en
  glissant ; boutons en bas (+ Section, Réglages, Voir, + Nouvelle bande) ; **enregistrement automatique** 1,2 s après chaque changement
  (`changed` → `saveBand`, nouvel essai seul en cas d'échec). ✎ sur un film = **retouches pour cette bande seulement** (`editItem` :
  titre, crédits, chefs op, types, vignette = image du film capturée par `/api/media` du site ou still, extrait `snip {s, d}` =
  début et fin choisis dans le film complet (0,5 à 10 s : la poignée tirée s'arrête à la limite, l'autre ne bouge pas), lecteur image par image (raccourcis écoutés partout dans la fenêtre sauf champs de texte : flèches ← → = image par image, vidéo arrêtée, Maj = 1 s ; espace = lecture, en boucle entre début et fin s'il y a un extrait ; frise du film + frise de
  détail de 30 s avec poignées début / fin : image figée pendant le réglage, extrait en boucle dès qu'on lâche), recadrage `crop {z,x,y,t}` (repris de la page du film : `zoom`, `zoomPos`, `zoomThumb` → `t` = vignette aussi, `cropOf` ; case « Recadrer aussi la vignette » ; la retouche ne vaut que pour la bande), stills et vidéos sous le film `extras`, prix `awards`). Les films de
  la bande sont des copies (prix et extras des fiches repris). Réglages : nom, chefs op (vide = détectés : nos chefs op des films, le
  plus présent d'abord), description, crédits / types / prix cachés, colonnes, expiration, mot de passe, téléchargement.
  **Lien** `SITE_VIEW/b/<code>` (9 caractères au hasard, `bandCode`) ; page publique **chiffrée** `data/b/<empreinte>.json` (`bandSeal` :
  PBKDF2-SHA256 150 000 tours du code → nom du fichier + clé AES-GCM ; mot de passe → clé tirée de code + mot de passe), original et liste
  (avec les mots de passe) dans le dépôt **notes** `bandes/<code>.json` + `bandes/index.json` (`nGet` / `nPut` / `nEdit`). « Bandes
  existantes » (revenir à l'onglet de la bande = nouvelle bande vide) : clic sur la ligne = ouvrir (seulement le nom de la bande), voir ↗, supprimer ×. **Annuler / Rétablir** (boutons en bas
  ou Ctrl / Cmd + Z, Maj + Ctrl / Cmd + Z) : instantanés de la bande (`undo*`), remis à zéro à chaque bande ouverte ou nouvelle. Anciennes bandes en clair (`data/bandes/`, 19/11) : listées, converties au premier changement.
  **Dans la liste** : clic sur l'image = lecteur (`bibPlay`, film complet, Échap / clic à côté) ; clic ailleurs sur la ligne = **infos du
  film** (même fenêtre que les retouches, `editItem(-1, lib)`), enregistrées dans `data/bibli/edits.json` (seulement ce qui diffère des
  pages, `bibApply`, `_orig`), reprises par les films ajoutés ensuite aux bandes, jamais sur le site ; ligne marquée ✎. **Crédits avec
  rôle** : `dops` + `roles { nom: rôle }` (rôle vide = cinematographer, crédité en premier ; ex. « Camera operator »), dans les infos
  et les retouches ; case à cocher et « + » plus grands. **Réal, prod, types de contenu en blocs** (`chipsIn` : suggestions des noms
  déjà connus de la même sorte, clic / Entrée / virgule = bloc, clic sur un bloc = le modifier ; enregistrés séparés par « , » ; plusieurs
  prods = plusieurs suggestions et filtres, `bibProds`). Sous le film : onglets **Vignette** (« Valider cette image » en bas à droite = image du film capturée → `thumbT`, stills du film et de dessous, **image de
  l'ordinateur**, **anciennes vignettes**) puis **Extrait** (poignées tout de suite : sans extrait, proposition de 5 s à partir de
  `thumbT` ou du début, `_snipTmp`, **rien n'est enregistré avant « Valider l'extrait »** (brouillon `_snipTmp` / `_snipSaved`, `snipOk` : jamais dans les sauvegardes, oublié en fermant) ; « Début de l'extrait ici » ; **mp4 de l'ordinateur** (boutons d'import `upBtn` : clic ou fichier glissé dessus)
  ≤ 20 Mo → `snipVideo` dans `data/bibli/vid/`, lu sur la page par `/api/media` ; **anciens extraits**). Historique `hist { img, snip }`
  (8 derniers, pas sur la page publique). Fenêtre : **Annuler / Rétablir** (boutons, Ctrl / Cmd + Z hors champ de texte, `edUndo`).
  Bande : « Annuler » actif dès le geste (`undoBtns` compte le changement pas encore noté). Plus de marque orange des films modifiés ;
  rôle « Cinematographer » dans la liste.
  **Partager un film seul** (fenêtre d'un film, « 🔗 Copier le lien de ce film » + « Autoriser le téléchargement », Gus 23/11) : bande
  d'un seul film `{ single: true }`, même lien court chiffré `SITE_VIEW/b/<code>`, code par film dans notes `bandes/films.json`
  (`{ <clé du film>: { code, download, title, at, by } }`), page republiée 2,5 s après chaque retouche du film (`shr`).
  Lien de partage **créé dès l'ajout** d'un film ou d'images (`shareCreate` : un commit pour tous, puis `films.json`).
  **Bundles** (3e onglet discret du panneau, Gus 23/11) : bandes de bandes ; liste avec recherche (notes `bandes/bundles.json`),
  « + Nouveau bundle », ajouter une bande existante (liste avec recherche), ordre ↑, retirer ×, clic sur une bande = l'ouvrir pour la
  modifier, « + Créer une bande dans ce bundle » ; « ← Retour au bundle » ajoute la bande ouverte / créée (`backToBundle`) ; lien
  `SITE_VIEW/b/<code>` (page chiffrée `{ bundle: true, title, description, bands: [{ code }] }`, enregistrée toute seule, `bunSave`).
  « Bandes existantes » : **recherche** par nom (`drawOld`, `bandsList`).
  **Ajouts** : un film lu sur Slate (un seul) ou une suite d'images (choisies puis enregistrées, titre deviné du nom des fichiers, clé
  `i<id>`) ouvrent ensuite la même fenêtre d'infos.
  Imports : lien Slate, suites d'images (`data/bibli/img/`), vidéo de l'ordinateur **vérifiée seulement** (hébergement pas encore branché).
- **Sorties fiction** (`#/sorties`) : calendrier mois / semaine (page fiction + `notes/sorties/sorties.json` + films sans date de
  `projets.json`), bandes-annonces à voir (pastille), confirmer / masquer / ajouter une sortie.
- **Festivals** : **dates** (`#/festivals`, `notes/festivals/festivals.json` ; ce que l'équipe a saisi n'est jamais modifié par le
  robot, désaccords = triangle orange) et **nos sélections** (`#/selections`, `notes/festivals/selections.json` : à vérifier ✓ / ✗,
  onglets « Toutes nos sélections » / « Récent », écartées en deux groupes « Pas nous » et « Doublons » (`dupOf` = version gardée,
  « Pas un doublon ») ; les prix confirmés vont tout seuls dans `info.awards` des films sur le site, `awardsSync`). **Prix sans film sur
  le site** (Gus 22/11) : triangle orange « ! » quand la trouvaille ne retrouve aucun film des fiches ni de la page fiction (`placed`,
  même rapprochement par le titre qu'`awardsSync`), catégorie **« Sans lien »**, bouton **« Relier à un film »** (`linkForm` : un ou
  plusieurs films de la bibliothèque, autres trouvailles du même film reliées aussi) → `links: [{ page, slate, title }]` dans la
  trouvaille ; une trouvaille reliée ne va **que** sur ces films (`awFor`). `awApply` n'ajoute pas une ligne déjà écrite **à la main**
  autrement (`awSameText` : même année, même festival, sélection ↔ sélection, prix ↔ même nom de prix) et ne retire pas une ligne
  dont le texte est aussi celui d'une autre trouvaille confirmée (doublon écarté).
- **Récupération** (`#/recup`, `notes/projets/projets.json`) : statut de récupération par film, à relancer, par production, mails.
- **Historique** : derniers commits des données (admin et notes) avec qui / quand / quoi.
- Taper une lettre hors d'un champ écrit dans la recherche de la page (`input.find`).

## Règles
- Dépôt **public** : aucune donnée privée ici (mails, contacts, notes, projets → dépôt privé `notes`), jamais de clé ni de secret.
- Ne jamais modifier les URLs Slate / CloudFront (images signées).
- `_headers` garde `Access-Control-Allow-Origin: *` sur `/data/*`.
- Tester dans un navigateur (Playwright, GitHub API simulée) avant de pousser. Commits en français. Pas de pull request sans demande.
