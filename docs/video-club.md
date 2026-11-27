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
  de CORS, et `/api/media` (fonction Cloudflare du site) reçoit un 403 de notre CloudFront (vérifié 26/11). **Avancement des imports** : pastilles Envoi / Encodage / Prête (`.bstep`), bandeau vert
  à la fin, onglets colorés ; images : barre de progression (préparation puis envoi). **Images d'une suite d'images** : `images` fait partie
  de `BIB_EK` (enregistré dans edits.json) et se réordonne en glissant dans la fenêtre du film (`stillGrid(it, "images")`).
- **Demandes au robot qui survivent à la fenêtre** (Gus 26/11) : vignette prise dans la vidéo et extrait léger notent leur demande dans le film
  (`pend: { thumb | snip: { path, id, … } }` dans edits.json, clé de `BIB_EK`). `pendWatch` (fenêtre ouverte ou fermée tant que l'admin reste
  ouverte) ou `encCheckEdits` (ouverture du video club, puis toutes les 6 s tant qu'un `pend` existe) appliquent la réponse et effacent `pend` ;
  fenêtre rouverte = reprise de l'attente. Liste du video club : « ⟳ Vignette / Extrait en cours d'encodage… ».
- **Données relues pendant une retouche** : `adopt(d)` remet par-dessus les films relus les retouches pas encore enregistrées (`libQ.todo`) ou en
  cours d'envoi (`libQ.sent`) : sinon, à la fin d'un encodage, la fenêtre rouverte montrait d'anciens crédits et les réécrivait.
- **Recadrage des stills** (`cropWin`, bouton ▣, Gus 26/11) : rectangle rouge déformable sur l'image → `{ l, t, w, h, ar, per? }` (fractions de l'image ;
  `per[adresse]` = cadre propre à une image) commun à un groupe : `it.scrop` (images du projet) ou `extras[i].crop` (stills sous un film). Ancien format
  `{ ar, z, x, y }` encore lu. Même rendu sur le site (`cropOf`, `.pgal button.cr`, `.plcr`).
- **Import : fenêtre des crédits tout de suite** : vidéos (`importFilms`) et images (`importImages`) créent le film en local (`localFilm`), ouvrent
  `libEdit` aussitôt et enregistrent / envoient derrière (la demande d'encodage attend `savedLib`) ; bandeau d'avancement en haut de la fenêtre.
- **Lignes sous le film** (Gus 26/11) : poignée ⠿ pour les déplacer en glissant (`xGrip`, `xDropZone` d'`upload.js` ; fenêtre du video club **et** cartes des
  pages de chefs op / fiction / spotlight, `extrasCtl`) ; **recherche** 🔍 (`bibPicker`, panneau à droite : clic = ajouter, glisser = placer) ; liens de
  **nos** bandes / films partagés (`…/b/<code>`) acceptés à côté des liens Slate (`extrasFromLink`, `ourLinkFilms` : notes `bandes/films.json` ou
  `bandes/<code>.json`). **Masquer au cas par cas** : `extras[i].hide = [lieux]` (« club » = video club et bandes, « fiction », « spotlight », adresse d'un chef
  op ; `showBibli({ ctx })`, bouton ◉ / ⊘) ; le site filtre dans `vcApply` (`d.slug`) ; × = supprimer partout. **Import de plusieurs vidéos** : à la fin de
  l'encodage, chacune reçoit les autres en lignes `auto` sous elle (masquables).
- **Fenêtres** : un clic-glissé qui finit sur le fond ne ferme plus rien (règle globale en tête d'`admin.js`, `clDown` / `clUp`).
- **Bouton « edit »** des cartes : sous la vidéo, blanc, collé à droite de la ligne de recadrage (`.zoom .vcedit`).
- **Vidéos importées ensemble = liées** (Gus 26/11) : `grp` + `gi` (rang) dans library.json ; `bibGroups` (bibli-outils.js) donne à chacune, à chaque lecture,
  toutes celles du lot sous elle dans le même ordre (sa propre ligne `self`, visible dans la fenêtre seulement) ; lignes `auto` jusqu'à une modification
  à la main (alors sans `auto`, enregistrées dans edits.json). Le site fait pareil (`vcGroup` d'app.js, lit library.json). Un film du lot ajouté plus tard à
  la page d'un chef op montre donc ses frères.
- **Sous le film** : images du projet = un élément comme les autres (poignée, œil, `ipos` = place parmi les lignes, `ihide` = lieux où elles sont
  masquées). Œil aussi sur les cartes des pages (`extrasCtl(…, ctx)`) et dans les retouches d'une bande (lieu « band »). Recherche = fenêtre au centre
  avec les mêmes suggestions / filtres que le video club (`bibPicker`). Ligne d'ajout : 🔍 | lien | +.
- Classe `.bst` = étiquette de suggestion ; les cellules de stills sont `.bstl` (le conflit agrandissait les suggestions du video club).
- **Ordre commun du lot** (Gus 26/11) : glisser une ligne dans la fenêtre d'un film du lot change `gi` de tous les films du lot (`grpOrder`, library.json) : même ordre partout ; masquer (œil) garde le lien (`hide` repris par `bibGroups` et `vcGroup`) ; ajouter / retirer une ligne le rompt pour ce film.
- **Capture de la vignette** (Gus 26/11) : vidéo de l'ordinateur → direct ; films copiés de Slate (`/kinou/production/`) → par `/api/media` du site (marche) ; sinon directement sur notre CloudFront si l'en-tête CORS y est (sinon erreur tout de suite) ; en dernier le robot (≈ 1 min). `/api/media` renvoie 403 pour les fichiers `nous/…` (CloudFront bloque la fonction Cloudflare sur ce chemin, vérifié 26/11) : pour une capture instantanée partout, ajouter une politique d'en-têtes CORS (`Access-Control-Allow-Origin: *`) à CloudFront.
- **Montage de l'extrait** (Gus 26/11) : jusqu'à 30 s au total (avant 10 s), 0,5 s au moins par bloc ; `snip.parts = [{ s, d }, …]` (≥ 2 blocs ; `s`, `d` = 1er bloc) ;
  « + Ajouter un bloc », I / O (début / fin à l'image affichée), blocs déplaçables (⠿), cliquer un bloc pour le régler, « ▶ Montage » ; poignées qui se
  poussent (début tiré vers la fin pousse la fin, et inversement ; tirer dans l'autre sens s'arrête à la limite). Le robot (`snip` avec `parts`) fait un mp4
  par bloc puis les colle (`montage-….mp4`) → `snip.v`. Sans `v`, le lecteur de repli ne lit que le 1er bloc.
- **Suppression** : zone rouge en bas de la fenêtre d'un film importé (`libDelete` : library.json, edits.json, lien de partage ; seulement ce film, pas le lot ;
  fichiers Amazon gardés) ; boutons « Supprimer cette bande » (réglages) et « Supprimer ce bundle » (panneau), × des listes en rouge au survol.
- **Infos du film** : Client (modifiable, edits.json), date (celle de Slate, `meta.json`, sinon date d'import), poids de l'original (`size`) et de la version web
  (`ws`, écrit par le robot), taille, durée.
- **Montage, mise à jour 26/11** : la sélection (poignées, I / O) est séparée des blocs ; « + Ajouter ce bloc » la range dans la liste (`snip.parts`), seuls les blocs
  de la liste comptent à la validation (un seul bloc = extrait simple) ; cliquer un bloc = le modifier (« ✓ Retour à la sélection »). Ctrl / Cmd + Z défait d'abord
  les gestes du montage (`snipUndo`, `su`) sans rouvrir la fenêtre. Tant que le robot n'a pas fait le mp4 (`snip.v`), l'aperçu lit les blocs bout à bout.
- **Client** : `client` (proposé depuis Slate, `meta.json`) + `cshow` (case « afficher avant le titre ») dans edits.json ; site, bandes et liens partagés affichent
  « Client | Titre » seulement si `cshow` (`dtitle`) ; champ « Client » sur les cartes des fiches (`vcPatch`) ; liste du video club : client au-dessus du titre.
- **I / O** : le point posé tombe toujours sur l'image affichée ; si la durée dépasse 30 s (ou si l'autre point gêne), c'est l'autre point qui s'adapte.
- **Client affiché par défaut** (Gus 26/11) : dès qu'un film a un client (Slate : `bibli/slate.json` du dépôt notes, 2 797 films ; `meta.json` public : les films des pages), « Client | Titre »
  s'affiche sur le site, les bandes et les liens partagés, sauf case décochée (`cshow: false` dans edits.json) ; le site lit `meta.json` (`vcClient`) et edits.json ; la carte des
  fiches a un champ Client prérempli. **Date Slate** : `at` de `bibli/slate.json` (7 490 films) / `date` de `meta.json` (2 091). Survol de la liste = extrait le plus récent
  (`snipVideo`, `snip.v`) ; l'aperçu de recadrage lit le montage entier (`snip.v`).
- **Lecture à l'envers** (fenêtre d'un film, Gus 26/11) : Z ou J = à l'envers (`startRev` : on recule `currentTime` à chaque image, le navigateur ne sait pas lire à l'envers ; reboucle sur le bloc réglé), K = pause, L = lecture, espace = pause puis lecture normale. **Son coupé partout** (admin.js, app.js, b/) : couper le son d'une vidéo avec commandes coupe les autres jusqu'à ce qu'on le remette ou qu'on recharge (`sonCoupe`). `dtitle` : pas de « | » si titre vide ou identique au client.
- **Entrée** dans l'onglet Extrait = « + Ajouter ce bloc ». **Aperçu d'un film** (`navPlayer`) : « + Ajouter à la bande » devient « − Retirer de la bande » (`o.remove`) sans redessiner (la vidéo ne repart plus) ; le « + » de la liste devient « − ».
- **Zoom de la frise** (montage, Gus 26/11) : Option (Alt sous Windows) + molette sur la frise de l'extrait, centré sur la souris (`zwin`) ; deux repères blancs (début / fin du film) visibles seulement quand ils sont dans la partie affichée ; « zoom × N » dans le texte de la frise. Aperçu d'un film : boutons d'onglets en haut, arrondis (`.bptabs`).
- **Bouton « edit » d'une fiche plus rapide** (Gus 26/11) : `bibLoad` ne lit plus qu'une fois à la fois (`bibPend`) ; la page d'un chef op le lance en avance (`vcLoad`) ; « edit » réutilise le video club en mémoire (plus de relecture forcée) et `vcPatch` le met à jour sur place au lieu de le jeter ; le bouton affiche « … » pendant l'ouverture. Montage : un clic dans un endroit vide de la fenêtre désélectionne le bloc.
- **Montage, clavier et zoom** (26/11) : zoom Option / Alt + molette aussi sur la frise de la source de `montage.js` ; Z ou J = lecture à l'envers, K = pause, L = lecture, Entrée = ajoute le bloc. Les touches sont captées sur `window` (`stopImmediatePropagation`) pour ne pas être prises par la fenêtre d'edit dessous.
- **Bout à bout** (Gus 26/11, phase 1) : bouton « ▦ Créer un bout à bout » dans la fenêtre d'une vidéo liée (`montage.js`, `montageWin`) : tous les films liés (encodés) en blocs, frise
  proportionnelle à la durée, glisser pour réordonner (`hReorder`), réglage début / fin du bloc choisi sur la frise de sa vidéo, I / O, S (couper), Suppr, espace. On monte sur les versions web
  (« Encodage 1 », pas de lag). Export : demande `film-….json` avec un job `edit` (`quality: original` = masters `mkey` de library.json, sinon versions web) ; le robot (`edit` dans
  `tools/encodage.mjs`) coupe et encode chaque morceau en 1080p + son (mêmes réglages) puis les colle ; le résultat suit la chaîne d'un film (version web, extrait, vignettes) =
  nouveau projet `e<id>` (`src: "montage"`, crédits et client du 1er film). **Limite : 10 Go d'originaux** (somme des `size` des sources) ; au-delà, l'option « originaux » est grisée avec
  « utiliser la version compressée ». `mkey` (clé du master) est écrit à l'import (et a été rempli pour les films déjà importés). Phase 2 (à faire) : « edit moi si tu peux » sur toute vidéo,
  versions « Encodage 1 » / « Edit n » renommables, choix de la version affichée par le site, « créer un nouveau projet avec cet edit ».
- **Frise des blocs de l'extrait** : horizontale, largeur de chaque bloc = sa durée, glisser pour réordonner. Fenêtre d'edit plus large (1500 px).
- **Suppression en nombre** (Gus 26/11) : cocher des films dans la liste → « Supprimer la sélection (n) » (`deleteSelection`, `libDeleteMany` : un commit pour library.json + edits.json, puis les liens de partage) ; seulement les films importés (ceux de Slate / des pages sont ignorés, dit dans la confirmation).
- **Corbeille** (Gus 26/11) : supprimer un film importé (fenêtre ou « Supprimer la sélection ») = `libDeleteMany` : fiche, retouches et lien de partage vont dans `data/bibli/trash.json` (restaurable 30 jours : `trashOpen`, logo 🗑 en bas à gauche de la page) ; au-delà, la corbeille les oublie (`trashRefresh`). **Les fichiers chez Amazon ne sont jamais effacés** (le robot n'a pas le droit d'effacer) : pour libérer la place, règle de cycle de vie S3 ou droit d'effacement à donner dans AWS.
- **Phase 2 : « edit moi si tu peux ! » et versions** (Gus 26/11) : sous l'aperçu d'une vidéo, bloc « Versions » : « Encodage 1 » (`it.vname`, la vidéo encodée à l'import) et les « Edit n »
  (`it.versions` dans edits.json : `{ id, name, parts, quality, full, ws, dur, w, h, enc? }`). Le bouton ouvre `montageWin` en mode `version` (une seule vidéo, découpe / réordre / retirer
  le générique) ; l'export envoie un job `edit` avec `web: true` (le robot ne refait que le fichier) ; suivi dans la fenêtre (12 s) ou par `encCheckEdits`. La case choisit la version
  affichée : `it.full` prend le fichier de l'edit (`vbase` garde l'Encodage 1, `vsel` = version choisie) ; l'extrait léger reste (`snip.vf` suit). Noms renommables ; « Modifier » rouvre le
  montage avec les mêmes morceaux (nouvelle version) ; « Nouveau projet » = job `post` du robot (copie la version web, extrait et vignettes) + fiche `e<id>` (`src: "montage"`) ; × supprime la
  version (le fichier reste chez Amazon). Montage depuis les originaux (`mkey`, 10 Go au plus) ou depuis les versions compressées.
- **Films de Slate supprimés = masqués** (Gus 26/11) : un film qui n'est pas dans library.json (Slate / pages) ne s'efface pas : `edits.json` reçoit `hidden: true` (retiré de la liste par `bibLoad`) et la corbeille garde une entrée `hiddenOnly` (restaurable 30 jours ; ensuite il reste masqué). Il reste sur les pages du site où il est utilisé.
- **Fenêtre de montage refaite** (`montage.js`) : sélection libre sur la vidéo source (début / fin, I / O) + « + Ajouter ce bloc » / Entrée, plusieurs parties d'une même vidéo, blocs réordonnables / modifiables (2e clic = désélection), règle du montage et frise de la source avec curseur qui suit la souris (trait + heure) ; cliquer-glisser balade la vidéo ; onglets pour changer de vidéo source. Lecture séparée : ▶ Source (espace) et ▶ Montage.


- **Vitesses et navigation de frise** (Gus 27/11, montage et fenêtre d'edit) : E = lecture avant, appuis répétés = ×2 puis ×4 (3 niveaux, `TL_RATES`) ; Z / J = idem en arrière ; K pause, L normale. Frise zoomée : petite barre `tlnav` dessous (`tlNav` dans `montage.js`, la poignée se tire), Cmd / Ctrl + molette déplace la partie affichée. Les touches sont prises par la fenêtre ouverte même si le champ de recherche du dessous a le focus (on le défocalise).

- **Bundle Slate → bundle video club** (Gus 27/11) : bouton dans « Ajouter une vidéo » : lit le bundle Slate (comme l'import ordinaire : films ajoutés), puis crée une bande par onglet (`saveBand`) et un bundle les regroupant (`bunSave`) : `clubBundle` (`bibli-page.js`). C'est la seule lecture de Slate à garder ; le reste n'en dépend plus.

- **Base commune des fenêtres de montage** (Gus 27/11) : `montageWin` (`montage.js`) sert le bout à bout, l'edit d'une vidéo (`mode: "version"`), l'extrait de l'accueil (`mode: "home"`, durée exacte + cadrage téléphone) et l'extrait de 30 s d'un film (`mode: "snip"`, `max`, bouton « ✂ Fenêtre de montage » de l'onglet Extrait ; l'ancien éditeur de la fenêtre reste à côté). Communs : blocs colorés, frise source zoomable + navigation, E / Z / J / K / L, I / O, S, Entrée, annuler / rétablir (`snap`, `undo`), ▶ d'un bloc en boucle. Son coupé pour `home` et `snip`, gardé pour le reste.
- **Image par image + boucle** (Gus 27/11) : dans `montageWin`, `sn()` cale tout instant sur une image (cadence mesurée par `requestVideoFrameCallback`, 24 / 25 / 30 / 50 / 60, 25 par défaut) ; ▶ Montage rejoue sans fin en modes `home` et `snip`.
- **Délier des vidéos liées** (Gus 27/11) : barre « Liée à N autres vidéos » de la fenêtre d'un film : « Délier cette vidéo » (les autres restent liées) ou « Tout délier » (dissout le lot). `unlinkFilms` (`bibli-page.js`) retire `grp` et `gi` de `library.json` et `edits.json` en un commit ; avec 2 vidéos, « Délier » dissout tout.
- **Import de plusieurs vidéos** (Gus 27/11) : indépendantes par défaut ; case « Lier ces N vidéos entre elles » en haut de la fenêtre d'import (`setLinked` dans `importFilms`) pour leur donner un `grp` commun (ordre, crédits, bout à bout).
