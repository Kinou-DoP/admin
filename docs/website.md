# Pages « website » : fiches des chefs op, sélection, home, spotlight, fiction, contact (admin)

Note de tâche : à lire seulement quand la tâche touche ce sujet. Règles générales : `CLAUDE.md`.

- **Website** : **cinematographers** (`#/dops`, liste + tableau de bord d'avancement `data/progress.json`), **fiche d'un chef op**
  (`#/dp/<slug>`, `showDP`) : **« Modifier la sélection »** (`selEditor`, Gus 25/11 : la page ne lit plus Slate) = fenêtre des onglets
  (ajouter, renommer, avancer / reculer, supprimer ; **glisser un onglet** pour le déplacer) et des films de chaque onglet (**glisser comme dans les bandes du video club**, `filmDrag` / `tabDrag` + `bibFly` : effet ressort, trait de dépôt ; **déposé sur un autre onglet**, le film y passe — FEATURED : ajouté sans quitter son onglet ; ou ↑ ↓, retirer ×, ajouter « + » depuis la
  video club en petit : filtres en étiquettes comme le video club (`bibMatch`, suggestions `bibCache.sug` en tapant ; à l'ouverture, filtre « Chef op » de la fiche + films de la page), mots libres, plus récents en haut, 150 puis « Afficher plus » ; clic sur l'image = aperçu `selPreview` (film, crédits, client, types, date)) ; FEATURED = ordre du showreel (`featured`,
  `featuredOrder` ; un film de FEATURED peut n'être dans aucun autre onglet : `cat: ""`) ; fiche sans films : bouton « Créer une sélection » (même fenêtre, onglet FEATURED vide) ; « Valider et publier » réécrit `categories`
  + `clips` puis publie (site à jour en ~10 s) ; les `overrides` restent attachés à chaque film. « Réimporter depuis Slate » (option,
  demande confirmation : remplace la sélection ; un snippet absent sur Slate mais présent dans la fiche est gardé),
  films par onglet (titre, crédits, masquer, recadrage, cadrage téléphone, liens Slate de stills / vidéos sous le film avec colonnes,
  extrait au survol, infos du film, **prix & sélections**, présentation vidéo + stills), bouton **« Compléter les infos des films
  (robot) »** (onglets fiction, 2nd unit, cam op ; champs vides seulement, marqués « à vérifier »), en ligne / caché, genre, notes
  internes (dépôt notes), about (bio, liens, portrait + cadrage, CV), adresse (slug). **Home page**, **spotlight**, **fiction** : bouton **« Modifier la sélection »** (`pageSel` → `selEditor(null, cfg)` : une seule liste, ordre, ajout depuis le video club (`pageFilm` ; spotlight et fiction : film ajouté **en haut**, `cfg.top`), « Valider et publier » retire le lien `reel`, plus de Slate) ; listées aussi dans « Bundles » du video club. **Home page** (`showHome` : bande Slate, éditeur
  vidéo : extrait HD, recadrage, téléphone), **spotlight**, **fiction** (statut, genre, plateformes, date, affiche, cadrage scope,
  9 New releases au plus, passage automatique en New release le jour de la sortie, alerte « autre date trouvée »), **contact**
  (+ logo, mentions légales).
- **Film ajouté à une page** (sélection, 26/11) : le robot `link-films.mjs` (après la publication) lui recopie ce qui a déjà été saisi pour ce film sur les autres pages (`info`, `extras`, `stills`) — seulement ce qui manque. Le robot `fill-home.mjs` ne lit plus Slate (débranché le 26/11, sauf `SLATE=1`).
- Fiction et spotlight : avec une bande Slate (`reel`), la publication n'écrit que `reel`, `categories`, `overrides` (+ affiches), jamais les `films` du robot ; **sans `reel`** (sélection faite dans l'admin, « Modifier la sélection », 26/11), elle écrit aussi `films` et le robot n'y touche plus (il ne relit Slate que s'il y a un `reel`). Accueil : pareil, `slides` sans `reel`.
- Avant de publier une fiche, l'admin relit la version en ligne et garde ce que les robots ont écrit (`robotFrom` : `images`,
  `ratios`, `types`, `full`), les lignes de prix (`awMerge`) et ce que les autres pages ont changé entre-temps (`sharedMerge`,
  fusion à trois). Après publication, `afterRobot` attend le robot (2 min au plus) et reprend ses films complets.
- **Une seule source pour vignette, extrait, recadrage** (Gus 25/11) : les cartes des films (fiches, spotlight, fiction) lisent
  `data/bibli/edits.json` à l'ouverture (`vcLoad`, `vcFilms`) : vignette `vcImg`, extrait `vcSnipOf`, recadrage `vcCrop` (celui du
  video club, sinon celui de la page). Régler le recadrage d'une carte l'écrit tout de suite dans `edits.json` (`vcPatch` / `vcSave`,
  sans « Publier »). Bouton **« edit »** en bas à droite de chaque vignette (`vcEditBtn`) : la fenêtre du film du video club par-dessus
  la page (`showBibli({ key, done })`, mode « fenêtre seule »). Le titre reste propre à chaque page.
- **Crédits** (Gus 25/11, même principe, sauf le titre) : la zone de crédits d'une carte montre les crédits du video club calculés
  comme sur le site (`vcCredits`) et les y réécrit (`vcSetCredits` : réal, prod, chefs op, rôles gardés) ; lignes en plus (3e et
  suivantes) gardées dans la page (`sub`, publiées avec « Publier »). « Rétablir » remet aussi les crédits du video club à ceux de la page.
- **Aperçu d'un film dans « Modifier la sélection »** (Gus 26/11) : `navPlayer` avec `o.tabs` = boutons discrets « + / ✓ onglet » pour chaque onglet du chef op (ajouter / retirer sans changer l'onglet ouvert, `togTab`) et « + » = créer un onglet avec ce film ; le bouton du bas devient « − Retirer de l'onglet » (`o.remove`). Le son coupé (`sonCoupe`, admin.js) s'applique aussi à cet aperçu.
- **Recadrage (cadre rouge)** (Gus 26/11) : `zoomCtl` garde le cadre affiché tant qu'on ne clique pas en dehors de la vidéo / des commandes / du cadre (`outside`, écouteur `pointerdown` du document) ; avant, il dépendait du focus du curseur (un clic sur la vidéo hors du cadre le fermait). Après la fenêtre « edit », les commandes sont relues (`_apply`) au lieu d'être recréées (écouteurs en double).


- **Accueil : montage de l'extrait** (Gus 27/11) : « Éditer la vidéo » > Extrait HD > « ✂ Montage de l'extrait » ouvre `montageWin` en mode `home` : blocs de la vidéo, durée **exacte** d'un projet (poignées bornées au temps restant, « Compléter avec le dernier bloc », « Enregistrer » seulement à la durée pile), cadrage téléphone propre à chaque bloc (bande rouge sur la vidéo). Enregistré dans la slide : `parts: [{ s, d, x }]` (+ `start` = 1er bloc). Le site les lit l'un après l'autre (`hdBloc`).
- **Source des vidéos** (Gus 27/11) : liste des chefs op, en haut : Video club (Amazon) / Slate (secours) / Cloudflare (bientôt) → `data/source.json` ; le site (`kinouSource`) et l'admin (`setSource`) lisent alors les vidéos et images chez Slate. Les adresses Slate restent dans les données exprès.
- **Montage de l'accueil, suite** (27/11) : écran de téléphone à gauche (rend le cadrage de chaque bloc en direct), bande rouge seulement pour régler un bloc, curseur « Recadrage » commun ordinateur + téléphone ou, après « Séparer », un zoom par écran (`zoom`, `phoneZoom` de la slide ; site : `--zm`). Chaque bloc a sa couleur (frise des blocs et frise de la source).
