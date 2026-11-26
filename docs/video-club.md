# Video club, bandes, bundles, encodage, vidéos chez Amazon (admin)

Note de tâche : à lire seulement quand la tâche touche ce sujet. Règles générales : `CLAUDE.md`.

- **Vidéos depuis Amazon** (25/11) : tous les fichiers de Slate sont copiés dans notre compartiment `kinou-videos` au même chemin
  (robot `copie-slate.yml` sur `main`). L'admin joue chaque vidéo sur `d3toxii6rvamjf.cloudfront.net` au lieu de
  `d1ko11x0ybxl0h.cloudfront.net` (`notreCDN`, setter `src` des `<video>`), repli automatique sur Slate si le fichier manque
  (événement `error`). Les données gardent l'adresse Slate. Vignettes (images.slatecdn.net) et captures (`/api/media`) : encore Slate.
- **Encodage** (Gus 26/11) : « + Vidéo » → « Depuis l'ordinateur » → « Envoyer et encoder » : le fichier (10 Go au plus) part
  directement chez Amazon (`upload` : morceaux de 16 Mo, 3 à la fois, réessais, reprise si on choisit de nouveau le même fichier ;
  adresses signées par `/api/depot` du site, clé de dépôt rangée dans Cloudflare) dans `kinou-videos/depot/`. Le film entre tout de
  suite dans `library.json` (clé `e<id>`, `enc: { path, id }`, « Encodage en cours… ») avec une demande `data/encode/film-….json`
  (`encFile`) ; robot **`encodage.yml`** + `tools/encodage.mjs` (`main`, ffmpeg, accès Amazon sans clé) : version web 1080p H.264,
  vignettes WebP 800 / 1600, extrait 720p sans son de 5 s **aux 2/3 du film**, sous `nous/<id>/` ; `encCheck` (ouverture du video club
  puis toutes les 20 s) recopie la réponse dans le film (`full`, `video`, `img`, `img1600`, `snip { s, d, v }`, `thumbT`, `dur`, `w`, `h`).
  **Extrait léger** : « Valider l'extrait » demande au robot (`rapide-….json`, `encAsk` / `encWait`) le passage en 720p sans son →
  `snip.v`, joué par les bandes à la place du film complet. Deux files (films longs / rapide). Demandes : `snip`, `thumb`, `film`.
  **Fenêtre d'import** (`importFilms`, Gus 26/11) : « + Vidéo » → une ou plusieurs vidéos (bouton ou fichiers glissés) → chaque vidéo
  entre tout de suite au video club (`enc.sending` pendant l'envoi) et la fenêtre d'infos du film s'ouvre (`libEdit(f, { local, head,
  credits })`) : vignette / extrait réglables sur la vidéo de l'ordinateur (`lib.local`, blob) pendant l'envoi ; en haut un onglet par
  vidéo + avancement (envoi en %, puis robot : `progress { step, pct }` écrit dans la demande, `encWait(…, onPoll)`). Envois l'un
  après l'autre ; une vidéo sans crédits reprend ceux de la 1re ; à la fin, version web (`encCheck`), vignette / extrait choisis à la
  main gardés (extrait léger refait, `libPatch`). « + Vidéo » / « + Images » sont des liens `#/bibli/video`, `#/bibli/images`
  (Cmd + clic = autre onglet, plusieurs envois à la fois ; `bibOpen`).
  **« ↻ Remplacer la vidéo »** (bouton : clic = choix lien Slate / ordinateur ; une vidéo glissée dessus = envoi direct ; `rpUp` /
  `rpWait`) : demande `web: true` (version web seulement) ; **vignette, extrait et leurs temps gardés** (`thumbT`, `snip`) ; « Valider »
  les refait dans la nouvelle vidéo (`snipStale` : `snip.vf` = vidéo d'où vient l'extrait léger). `it.enc` = encodage en cours (repris
  en rouvrant la fenêtre ; aussi repris à l'ouverture du video club, `encCheckEdits`, Gus 25/11). **Stills de l'ordinateur** sous le film (« ⤒ Ajouter des stills », clic ou glisser plusieurs images) →
  `data/bibli/img/<id>/`, groupe `extras` `{ title: "Stills", stills, up: true }` ; images de chaque groupe réordonnées en glissant
  (`stillGrid`), × pour retirer.
- **Images pas encore en ligne** (Gus 26/11, vignettes grises) : une image importée / capturée n'est sur raw.githubusercontent qu'après
  son enregistrement (et raw garde ~5 min un « pas trouvé ») : `imgLocal[adresse]` = copie locale (blob), affichée à sa place par
  `el()` (styles `url("…")`, `<img src>`) et `imgShow()` jusqu'au rechargement de la page.
- **Filmothèque complète** (25/11) : en plus des films des pages, tous les films de Slate (7 490) lus dans le dépôt privé
  `notes` (`bibli/slate.json`, constante `BIB_SLATE`, avec la clé de la personne connectée) ; les infos des pages restent prioritaires.
- **Video club** (ancienne « filmothèque », appelée « bibliothèque » dans le code ; `#/bibli`, `showBibli`) : tous nos films (fiches, fiction, spotlight, accueil, imports `data/bibli/library.json`),
  **les plus récents en haut** (id Slate décroissant). Recherche avec suggestions dans cet ordre : chef op (étiquette orange), réal, prod,
  client, type de contenu, catégorie (jamais les films ; 4 par sorte) → filtres en étiquettes. Client / types de contenu / mots-clés :
  `data/bibli/meta.json`, écrit chaque nuit par le robot `bibli-meta.yml` (`tools/bibli-meta.mjs`, `readMeta` de `slate.mjs`, `main`).
  **Bandes** (panneau de droite) : en arrivant, toujours une nouvelle bande vide ; on glisse les films n'importe où dans la colonne
  (film qui suit la souris avec effet ressort, paquet d'images pour plusieurs films cochés ; Maj + clic = plage), « + », réordonner en
  glissant ; boutons en bas (+ Section, Réglages, Voir, + Nouvelle bande) ; **enregistrement automatique** 1,2 s après chaque changement
  (`changed` → `saveBand`, nouvel essai seul en cas d'échec). ✎ sur un film = **retouches pour cette bande seulement** (`editItem` :
  titre, crédits, chefs op, types, vignette = image du film capturée par `/api/media` du site ou still, extrait `snip {s, d}` =
  début et fin choisis dans le film complet (0,5 à 10 s : la poignée tirée s'arrête à la limite, l'autre ne bouge pas), lecteur image par image (raccourcis écoutés partout dans la fenêtre sauf champs de texte : flèches ← → = image par image, vidéo arrêtée, Maj = 1 s ; espace = lecture, en boucle entre début et fin s'il y a un extrait ; frise du film (vignette) ; extrait : **une seule frise sur tout le film** avec poignées début / fin (Gus 26/11 : plus de frise de détail de 30 s qui se recentrait) : image figée pendant le réglage, extrait en boucle dès qu'on lâche), recadrage `crop {z,x,y,t}` (**même réglage que les fiches** : `zoomCtl` avec `tch`, cadre rouge sur l'extrait qui défile pendant le réglage, « Aussi sur la vignette » ; repris de la page du film : `zoom`, `zoomPos`, `zoomThumb` → `t` = vignette aussi, `cropOf` ; case « Recadrer aussi la vignette » ; la retouche ne vaut que pour la bande), stills et vidéos sous le film `extras`, prix `awards`). Les films de
  la bande sont des copies (prix et extras des fiches repris). Réglages : mise en page **Grille / Plein écran en haut** (`layout`), nom, chefs op (vide = détectés : nos chefs op des films, le
  plus présent d'abord), description, crédits / types / prix cachés, colonnes, expiration, mot de passe, téléchargement.
  **Lien** `SITE_VIEW/b/<code>` (9 caractères au hasard, `bandCode`) ; page publique **chiffrée** `data/b/<empreinte>.json` (`bandSeal` :
  PBKDF2-SHA256 150 000 tours du code → nom du fichier + clé AES-GCM ; mot de passe → clé tirée de code + mot de passe), original et liste
  (avec les mots de passe) dans le dépôt **notes** `bandes/<code>.json` + `bandes/index.json` (`nGet` / `nPut` / `nEdit`). « Bandes
  existantes » (revenir à l'onglet de la bande = nouvelle bande vide) : clic sur la ligne = ouvrir (seulement le nom de la bande), voir ↗, supprimer ×. **Annuler / Rétablir** (boutons en bas
  ou Ctrl / Cmd + Z, Maj + Ctrl / Cmd + Z) : instantanés de la bande (`undo*`), remis à zéro à chaque bande ouverte ou nouvelle. Anciennes bandes en clair (`data/bandes/`, 19/11) : listées, converties au premier changement.
  **Dans la liste** : clic sur l'image = lecteur (`bibPlay` → `navPlayer` : film complet, ‹ › / flèches = film d'avant / d'après dans la liste affichée, « + Ajouter à la bande » au milieu, Échap / clic à côté ; même lecteur dans « Modifier la sélection », « + » = onglet ouvert) ; clic ailleurs sur la ligne = **infos du
  film** (même fenêtre que les retouches, `editItem(-1, lib)`), enregistrées dans `data/bibli/edits.json` (seulement ce qui diffère des
  pages, `bibApply`, `_orig`), reprises par les films ajoutés ensuite aux bandes **et sur le site** (Gus 26/11 : le site lit `edits.json` et applique vignette,
  extrait léger `snip.v` / mp4 `snipVideo`, film, titre, crédits, stills / vidéos dessous par-dessus les fiches, spotlight, fiction,
  accueil ; `vcApply` d'`app.js`) ; ligne marquée ✎. **Crédits avec
  rôle** : `dops` + `roles { nom: rôle }` (rôle vide = cinematographer, crédité en premier ; ex. « Camera operator »), dans les infos
  et les retouches ; case à cocher et « + » plus grands. **Réal, prod, types de contenu en blocs** (`chipsIn` : suggestions des noms
  déjà connus de la même sorte, clic / Entrée / virgule = bloc, clic sur un bloc = le modifier ; enregistrés séparés par « , » ; plusieurs
  prods = plusieurs suggestions et filtres, `bibProds`). Sous le film : onglets **Vignette** (« Valider cette image » en bas à droite = image du film capturée → `thumbT`, stills du film et de dessous, **image de
  l'ordinateur**, **anciennes vignettes**) puis **Extrait** (poignées tout de suite : sans extrait, proposition de 5 s à partir de
  `thumbT` ou du début, `_snipTmp`, **rien n'est enregistré avant « Valider l'extrait »** (brouillon `_snipTmp` / `_snipSaved`, `snipOk` : jamais dans les sauvegardes, oublié en fermant) ; « Début de l'extrait ici » ; **mp4 de l'ordinateur** (boutons d'import `upBtn` : clic ou fichier glissé dessus)
  ≤ 20 Mo → `snipVideo` dans `data/bibli/vid/`, lu sur la page par `/api/media` ; **anciens extraits**). Historique `hist { img, snip }`
  (8 derniers, pas sur la page publique). Dans une bande : **« ★ En faire la vignette / l'extrait officiel du film »** en bas des onglets (`libPatch` : appliqué au film de la filmothèque, pour les prochaines bandes ; un extrait pas encore validé est validé d'abord). Fenêtre : **Annuler / Rétablir** (boutons, Ctrl / Cmd + Z hors champ de texte, `edUndo`).
  Bande : « Annuler » actif dès le geste (`undoBtns` compte le changement pas encore noté). Plus de marque orange des films modifiés ;
  rôle « Cinematographer » dans la liste.
  **Partager un film seul** (fenêtre d'un film, « 🔗 Copier le lien de ce film » + « Autoriser le téléchargement », Gus 23/11) : bande
  d'un seul film `{ single: true }`, même lien court chiffré `SITE_VIEW/b/<code>`, code par film dans notes `bandes/films.json`
  (`{ <clé du film>: { code, download, title, at, by } }`), page republiée 2,5 s après chaque retouche du film (`shr`).
  Lien de partage **créé dès l'ajout** d'un film ou d'images (`shareCreate` : un commit pour tous, puis `films.json`).
  **Pages du site dans la filmothèque** (Gus 25/11) : « Bundles » liste aussi chaque page de chef op (« Page · Nom », `bibCache.pages`)
  et « Bandes existantes » chacun de ses onglets (« Nom · ONGLET ») ; clic = la fiche s'ouvre sur « Modifier la sélection » à cet
  onglet (`selOpen`), ↗ = la page sur le site ; pas de lien à envoyer (une seule source : la fiche).
  **Bundles** (3e onglet discret du panneau, Gus 23/11) : bandes de bandes ; liste avec recherche (notes `bandes/bundles.json`),
  « + Nouveau bundle », ajouter une bande existante (liste avec recherche), ordre en glissant (`bunDrag`, même animation que les films d'une bande) ou ↑, retirer ×, clic sur une bande = l'ouvrir pour la
  modifier, « + Créer une bande dans ce bundle » ; « ← Retour au bundle » ajoute la bande ouverte / créée (`backToBundle`) ; lien
  `SITE_VIEW/b/<code>` (page chiffrée `{ bundle: true, title, description, bands: [{ code }] }`, enregistrée toute seule, `bunSave`).
  « Bandes existantes » : **recherche** par nom (`drawOld`, `bandsList`).
  **« ↻ Remplacer la vidéo »** (fenêtre d'un film) : lien Slate ou vidéo de l'ordinateur (voir « Encodage » plus haut) ; vignette,
  extrait et leurs temps gardés.
  **Ajouts** : un film lu sur Slate (un seul) ou une suite d'images (choisies puis enregistrées, titre deviné du nom des fichiers, clé
  `i<id>`) ouvrent ensuite la même fenêtre d'infos.
  Imports : lien Slate, suites d'images (`data/bibli/img/`), vidéos de l'ordinateur (envoi chez Amazon + encodage, voir « Encodage »).
- **Images chez Amazon** (Gus 25/11) : `imgPut(nom, base64, aperçu, dossier)` envoie une image (stills de l'ordinateur, vignette
  importée ou capturée, suite d'images) dans `kinou-videos/depot/<dossier>/` (adresse signée par `/api/depot` op `img`) et rend tout de
  suite son adresse sur notre CloudFront ; `commit()` attend la fin des envois (`imgWait`). Plus rien n'est écrit dans `data/bibli/img/`
  (anciennes images copiées chez Amazon par le robot `images-bibli.yml`, `main`).
- **Vignette depuis la vidéo** (Gus 26/11) : « Valider cette image » sur une vidéo de l'ordinateur (blob) = capture directe (canvas) ; sur une
  vidéo en ligne = demande `thumb` au robot (`grabRobot`, file « rapide », ≈ 1 min, vignettes 800 / 1600) car notre CloudFront n'envoie pas
  de CORS et `/api/media` (Netlify) est souvent figé. **Avancement des imports** : pastilles Envoi / Encodage / Prête (`.bstep`), bandeau vert
  à la fin, onglets colorés ; images : barre de progression (préparation puis envoi). **Images d'une suite d'images** : `images` fait partie
  de `BIB_EK` (enregistré dans edits.json) et se réordonne en glissant dans la fenêtre du film (`stillGrid(it, "images")`).
