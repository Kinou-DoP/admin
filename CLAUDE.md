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
- **Bibliothèque** (`#/bibli`, `showBibli`, 1re version) : tous nos films (fiches, fiction, spotlight, accueil, imports
  `data/bibli/library.json`), recherche avec suggestions → filtres en étiquettes, **bandes** à glisser-déposer (sections = bundle,
  réglages : colonnes, mot de passe, expiration, téléchargement, crédits cachés) → `data/bandes/<code>.json` + `index.json`, lien
  `SITE_VIEW/b/?<code>` ; imports : lien Slate, suites d'images (`data/bibli/img/`), vidéo de l'ordinateur **vérifiée seulement**
  (hébergement des vidéos pas encore branché).
- **Sorties fiction** (`#/sorties`) : calendrier mois / semaine (page fiction + `notes/sorties/sorties.json` + films sans date de
  `projets.json`), bandes-annonces à voir (pastille), confirmer / masquer / ajouter une sortie.
- **Festivals** : **dates** (`#/festivals`, `notes/festivals/festivals.json` ; ce que l'équipe a saisi n'est jamais modifié par le
  robot, désaccords = triangle orange) et **nos sélections** (`#/selections`, `notes/festivals/selections.json` : à vérifier ✓ / ✗,
  récent, toutes ; les prix confirmés vont tout seuls dans `info.awards` des films sur le site, `awardsSync`). **Prix sans film sur
  le site** (Gus 22/11) : triangle orange « ! » quand la trouvaille ne retrouve aucun film des fiches ni de la page fiction (`placed`,
  même rapprochement par le titre qu'`awardsSync`), catégorie **« Sans lien »**, bouton **« Relier à un film »** (`linkForm` : un ou
  plusieurs films de la bibliothèque, autres trouvailles du même film reliées aussi) → `links: [{ page, slate, title }]` dans la
  trouvaille ; une trouvaille reliée ne va **que** sur ces films (`awFor`).
- **Récupération** (`#/recup`, `notes/projets/projets.json`) : statut de récupération par film, à relancer, par production, mails.
- **Historique** : derniers commits des données (admin et notes) avec qui / quand / quoi.
- Taper une lettre hors d'un champ écrit dans la recherche de la page (`input.find`).

## Règles
- Dépôt **public** : aucune donnée privée ici (mails, contacts, notes, projets → dépôt privé `notes`), jamais de clé ni de secret.
- Ne jamais modifier les URLs Slate / CloudFront (images signées).
- `_headers` garde `Access-Control-Allow-Origin: *` sur `/data/*`.
- Tester dans un navigateur (Playwright, GitHub API simulée) avant de pousser. Commits en français. Pas de pull request sans demande.
