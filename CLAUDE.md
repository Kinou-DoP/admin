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
- **Depuis le 30/10, plus aucune fonction Netlify ne répond** (503 « Usage exceeded ») : l'admin lit alors Slate **par le robot
  GitHub** (`siteGet` → `askRobot`, `siteDown`) : demande déposée dans `data/ask/<horodatage>.json` = `{ items: [{ kind, link }], at, by }`
  (kind `bundle` | `stills` | `reel` ; demandes faites ensemble = un seul fichier), commit « Slate : demande de lecture » (caché dans
  l'historique) ; workflow `.github/workflows/slate-ask.yml` + `tools/ask.mjs` (lecture = `tools/slate.mjs`, copie de
  `netlify/functions/slate.mjs` du site, à garder identique) écrit `items[].answer` / `error` + `doneAt` dans le même fichier ;
  l'admin le relit toutes les 5 s (5 min au plus). Environ 1 min par lecture.
  `commit` réessaie tout seul (3 fois) si un autre commit arrive pendant la publication (GitHub 422 « Update is not a fast forward » :
  réponse du robot, autre personne qui publie ; Gus 04/11) : refait par-dessus le nouveau dernier commit. Fichiers de plus d'un jour supprimés par le robot.
  Netlify considéré hors service (`siteDown`) pour toute réponse autre que OK / 502 JSON (503, 404 d'un site Netlify supprimé, page
  non JSON, réseau) : les projets Netlify peuvent être supprimés sans rien casser (Gus 04/11).
  `refreshSite` n'est plus appelé quand Netlify est hors service (le site lit `raw.githubusercontent.com`, cache 5 min).
Liste complète et choses à faire au retour sur Netlify : CLAUDE.md du repo `site` (« Hébergement actuel »).
**Depuis le 16/11 : fonctions sur Cloudflare Pages** (`SITE` = https://kinou-4tv.pages.dev, dossier `functions/` du dépôt site) :
`/api/bundle`, `/api/stills`, `/api/reel` (même lecture de Slate, `netlify/functions/slate.mjs`, version à jour : `/api/stills`
lit aussi les vidéos avec `full`), `/api/refresh` (rien à vider : le site lit toujours le dernier commit). Réponse autre que OK / 502 JSON
(ex. erreur Cloudflare « CPU dépassé » sur un gros bundle, offre gratuite = 10 ms de calcul par appel) → robot GitHub, comme avant.

## Rôle
- `data/` : données du site (kinou.fr **et** sa beta), lues par le site directement dans ce repo GitHub
  (fonction `/api/data` du repo `site`).
  Format des fiches : voir le CLAUDE.md du repo `site` (section « Architecture des données »).
- `index.html` + `assets/` : l'interface d'admin. Elle lit et écrit `data/` **via l'API GitHub**
  (un commit par publication sur `main`), avec le token personnel de l'utilisateur.

## Fonctionnement
- Connexion : token GitHub « fine-grained » personnel (un par personne, sur son propre compte GitHub ; Resource owner = Kinou-DoP),
  limité aux repos `Kinou-DoP/admin`, `Kinou-DoP/site` (pages d'aperçu des liens, voir plus bas) et `Kinou-DoP/notes` (notes internes,
  privé), permission Contents : Read and write. Stocké dans le `localStorage` du navigateur, jamais dans le repo.
  Créé sans expiration (autorisé par l'organisation Kinou-DoP). Depuis le 04/11 : une clé sur le compte perso de Gus, une sur
  kinou-agency, une pour son frère (anciennes clés de kinou-agency supprimées ; projets Netlify supprimés).
- **Prénom à la connexion** (Gus 17/11) : l'équipe peut se connecter avec des clés créées sur un même compte GitHub (kinou-agency,
  une clé par personne, nommée « admin kinou – Prénom » pour pouvoir la supprimer seule) : GitHub ne donne pas le nom de la clé, donc
  la page de connexion demande aussi le **prénom**, **lié à la clé** : dépôt privé notes `equipe/noms.json` = `{ <empreinte SHA-256 de la clé, 24 car.>: prénom }` (`tokId`, `nameRemote`, `nameSave` ; jamais la clé elle-même) ; demandé seulement la 1re fois pour une clé, retrouvé ensuite sur tout appareil (copie locale `localStorage` « kinou-admin-name », `myName` / `setName` ; nouvelle clé collée = prénom local effacé), qui
  remplace le login GitHub partout (`user.login` = prénom, `user.gh` = vrai login) : messages des commits « (admin, Prénom) »,
  historique, champs `by` / `editedBy` des données. Clic sur le prénom en haut à droite = le changer.
- **Accès « website » réservé** (Gus 17/11) : à la connexion, l'admin teste si la clé peut écrire dans ce dépôt (`canWeb` : POST d'un
  blob vide, sans effet). Sinon (clé limitée au dépôt `notes` : Repository access = notes seulement, Contents Read and write) : rubrique
  website **en lecture seule** (Gus 17/11 : visible avec toutes ses pages, `body.readonly` + `body.webpage` posé par `route`) : champs,
  interrupteurs, genre et avancement inactifs (CSS), pas de « Publier », pastille « Lecture seule » en haut, `touch` / `askRobot` /
  `saveStep` refusent ; notes internes des fiches modifiables (dépôt notes) ; festivals, sélections, récupération et sorties marchent (lecture des
  dépôts publics admin / site toujours permise). C'est GitHub qui bloque l'écriture, pas seulement l'admin. Clés des collègues = notes seulement.
- **Ajouter une personne à l'admin** (Gus 04/11) : une clé ne peut jamais faire plus que le compte de la personne. Donc :
  1. l'inviter dans l'organisation Kinou-DoP (People → Invite member) ;
  2. lui donner le rôle **Write** sur les 3 dépôts `admin`, `site` et **`notes`** (dépôt → Settings → Collaborators and teams →
     Add people → Write), ou une seule fois créer une équipe avec Write sur les 3 et y ajouter chaque nouvelle personne
     (sans Write sur `notes` : notes lisibles mais « Pas enregistré : GitHub 403 … Resource not accessible by personal access
     token », cas du frère de Gus) ; les owners ont déjà tout ;
  3. elle crée sa clé fine-grained (Resource owner Kinou-DoP, les 3 dépôts, Contents Read and write, sans expiration) et la
     colle dans l'admin ; si « pending approval » : organisation → Settings → Personal access tokens → Pending requests.
  Tout futur dépôt privé de données internes (tableaux, contacts…) : même règle, Write pour chaque personne + dépôt ajouté à sa clé.
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
- Vignette d'un film (fiches) : pastille en haut à droite (`.snipmark`, Gus 03/11) = snippet Slate : pleine verte = extrait présent
  (`video`), vide = pas encore d'extrait (à « snipper » sur Slate, puis « Relire le bundle ») ; rien sur un projet en images seulement.
- Infos du film (Gus 04/11, fiches, spotlight, fiction) : bloc replié « + Infos du film » sous les crédits (`infoCtl`, titre = nombre
  de champs remplis) : année, épisodes, durée, format d'image, plateformes (pas sur la fiction : déjà en étiquettes), caméra,
  optiques, synopsis français (`synopsis`) et anglais (`synopsisEn`) → `overrides[<id>].info`. Affichage : CLAUDE.md du site (`info`).
- **Prix & sélections** (Gus 17/11, `awardsCtl`, fiches, spotlight, fiction) : bloc sous la vidéo de chaque film, une ligne par prix
  (`info.awards`, ajoutées à la main avec « + Ajouter » ou depuis Nos sélections, marque « robot ») : texte modifiable, bouton
  affiché / masqué (masquées : `info.awardsHidden`, jamais sur le site), × pour retirer ; une ligne des robots corrigée garde son lien
  (`awardsFrom` mis à jour), masquée ou retirée n'est pas remise. Puis « Publier ». (Plus de champ « Prix & sélections » dans Infos du film.)
- **Films reliés** (Gus 17/11) : un même film (même id Slate) sur une fiche, la page fiction et / ou le spotlight partage ses
  **infos** (`info`, clé par clé : année, durée, caméra, synopsis, prix…) et ses **stills / vidéos sous le film** (`extras`, ancien
  `stills` + `stillsLink`) : robot `tools/link-films.mjs` (branche main, avant fill-home dans `home-full.yml`) qui recopie ce que la
  publication a changé (seulement les champs changés ; changé différemment sur deux pages dans la même publication = laissé).
  Pas partagés : titre / crédits corrigés, masqué, recadrages, affiche, statut, date, plateformes de la fiction. Page ouverte avant
  une recopie : à la publication, ce qu'elle n'a pas touché depuis son ouverture est repris de la version en ligne (`ovBase` /
  `sharedSnap` / `sharedMerge`, fusion à trois). Mise en commun complète faite une fois le 17/11 (`ALL_LINK=1`).
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
  (`progressBoard` : « ROUND 1 ! » = progression des 4 étapes en % (somme des étapes / 4 × nombre de chefs op),
  une jauge à 20 cases par étape (Importé, Snippet, Recadrage & infos, Stills) ; plus de « ROUND 2 » pour l'instant (stills remis dans le round 1, Gus 12/11) ;
  typo Press Start 2P (Google Fonts) ; pas de grade ni d'XP, Gus 27/10 ;
  clic sur une jauge = n'afficher que les fiches pas encore à cette étape, combiné à la recherche) et pastilles de couleur sous
  chaque nom (`pips`). Fichier hors des chemins du robot : aucune Action lancée.
- Notes internes d'une fiche (Gus 03/11) : bloc blanc crème sous le titre (`notesBox`), jamais sur le site, **pas dans ce dépôt
  (public)** : dépôt **privé `Kinou-DoP/notes`**, un fichier par chef op `dps/<adresse>.md` (adresse à l'ouverture de la fiche ;
  pas déplacé si l'adresse change), lu à l'ouverture, enregistré tout seul 1,2 s après la frappe ou en quittant le champ (API
  contents, sans « Publier », hors annuler / rétablir). Dépôt absent ou clé sans accès : message dans le bloc. Chaque clé GitHub
  doit avoir accès à ce dépôt (Contents : Read and write).
- **En ligne sur le site** (Gus 10/11) : interrupteur sous le titre d'une fiche (`onlineCtl`) → `hidden: true` dans l'entrée de
  `data/dps/index.json` quand il est décoché (écrit à la publication ; `state.hidden` = choix pas encore publié, `isHidden`). **Une
  nouvelle fiche est créée cachée** ; les fiches existantes au 10/11 sont en ligne. Liste de l'admin : « hors ligne » + nom estompé.
- **Accueil de l'admin** (Gus 17/11, `showHello`, adresse `#/`, clic sur « kinou admin ») : « Hello la Dream Team ! » en très grand, police Bagel Fat One (Google Fonts), centré sur l'écran, lettres qui tombent une à une, gigotent au survol, sautent au clic ; juste pour sourire ; en bas, petit mot (`helloNews`, Gus 17/11) : nos films qui sortent cette semaine (lundi → dimanche, `sortBuild` = mêmes sorties que le calendrier, lien vers sorties fiction) et les prix trouvés aujourd'hui par les robots (`selections.json`, `kind: prize`, `foundAt` du jour, lien vers nos sélections) ; rien à dire = rien d'affiché. La liste des chefs op est sur `#/dops` (menu website → cinematographers).
- Liste des chefs op : champ de recherche au-dessus (filtre au fil de la frappe, sans accents ; Entrée ouvre le 1er résultat).
- Historique (lien « historique » en bas du menu de gauche) : petite fenêtre, derniers commits de `data/` lus sur GitHub
  (`/commits?path=…`) : qui (login entre parenthèses dans le message « (admin, login) », ou « robot GitHub »), quand, quoi
  (lien vers le commit). Sur une fiche / l'accueil / le contact : ce fichier seulement, bouton « Tout voir ». Aussi le dépôt privé notes (Gus 17/11, `histPath` / `histAllSrc`) : festivals, nos sélections, récupération, sorties fiction (leur fichier sur leur page) et notes internes des fiches ; demandes / réponses du robot et prénoms des clés cachés.
- Navigation à gauche **en rubriques déroulantes** (Gus 16/11 ; clic sur website / festivals = ses sous-rubriques se déroulent, une
  rubrique ouverte à la fois, celle de la page ouverte déroulée d'office ; sorties fiction et récupération = lien direct) : WEBSITE (cinematographers, home page, spotlight, fiction, press à venir, contact),
  FESTIVALS (dates `#/festivals`, nos sélections `#/selections`), SORTIES FICTION (calendrier `#/sorties`, à venir), RÉCUPÉRATION
  (suivi `#/recup`, à venir : k-recup, mails) ; téléphone : rubriques en ligne. Notification = pastille rouge sur « festivals »
  (`festBadge` : dates limites d'inscription dans les 14 jours, hors estimées), calculée à la connexion.
- **Festivals** (Gus 16/11, `showFestivals`) : données dans le dépôt **privé** `Kinou-DoP/notes`, `festivals/festivals.json` =
  `{ festivals: [{ id, name, city, country, types: [feature|short|music-video|commercial|cinematography|event], start, end, est?,
  deadlines: [{ label, date, ed (édition), est? }], submit, site, selection, note, checked }] }` ; lu / enregistré directement (comme les
  notes, sans « Publier » ; un festival à la fois, fichier relu avant). Absent : créé avec la liste de départ `FEST_SEED` (19 festivals,
  dates relevées le 16/11/2026 ; `est` = estimée d'après l'édition précédente). Page : « Bientôt » (dates limites dans les 45 jours,
  festivals qui commencent dans les 30 jours ou en cours), filtres par type, cartes (dates, inscriptions, remarques, liens S'inscrire /
  Site / Sélection, boutons « Nos … » vers le site Cloudflare `FEST_OURS` : clips → `spotlight/music-video`, pub → `spotlight/commercial`,
  longs → `fiction/feature-films`, courts → `fiction/short-films`), édition passée = estompée « à mettre à jour », formulaire « Modifier »
  / « + Ajouter un festival ». **Robot du matin** (dépôt notes, `tools/check-festivals.mjs`, chaque jour vers 9 h à Paris) : écrit seulement `check`
  (`issues` = date proche mais différente sur le site du festival : `deadline` / `start`, ou `new` = nouvelles dates possibles quand
  les nôtres sont estimées ; `page` = site illisible, affiché en petit dans le pied de carte, sans triangle). **Robot / humain** (Gus 16/11) : `source` = `robot` (liste de départ, remplie par Claude ; mis à jour directement par le
  robot, pas de triangle, pastille « robot ») ou `human` (enregistré par quelqu'un : « Enregistrer » pose `source: human`, `editedBy`,
  `editedAt` ; pastille verte « humain » ; le robot n'y touche plus). **Ce que l'équipe a saisi
  n'est jamais modifié** : triangle orange « ! » (`.ftri`, festivals `human` seulement) devant le nom, la date concernée et un encadré (`.fwarn` : chez
  nous / sur le site, pages lues, « Vu, nos infos sont bonnes » = `checkSeen` = `check.hash`, « Corriger ») ; enregistrer le festival
  marque aussi les désaccords actuels comme vus ; la pastille du menu les compte. **« Compléter automatiquement »** (bouton blanc sous le nom, formulaire d'un festival ; `festAsk` / `festFill`) : demande au robot du
  dépôt notes (`festivals/ask/<horodatage>.json`, workflow `festival-ask.yml` : Claude + recherche web, ~1–2 min, clé `ANTHROPIC_API_KEY`
  en secret du dépôt notes), réponse relue toutes les 5 s ; ne remplit **que les champs vides** (et remplace des dates estimées par des
  dates annoncées), puis « Enregistrer » ; `filled = { by, at, sources }` (« complété automatiquement le … » en pied de carte). Festival
  ajouté avec son nom seul : complété par le robot du matin. **Nos sélections** (Gus 17/11, v2, `showFestSel`, `#/selections`) : dépôt notes `festivals/selections.json` (format et robots : CLAUDE.md du dépôt notes), lu / écrit directement (`selRead` / `selPut`, Annuler / Rétablir `selSave`). Trois parties : **À vérifier** (trouvailles des robots groupées par film : type Sélection / Nomination / Prix / Prix de l'image, festival + ville + année, section ou prix, source ; ✓ / ✗ par ligne, « Tout confirmer » / « Tout écarter » par film), **Récent** (repliable, choix gardé dans le navigateur `kinou-sel-rec` ; 30 lignes puis « Afficher plus » ; confirmées, festival ou prix des 4 derniers mois d'après sa `date` (Gus 17/11 : pas la date de la recherche) ; sans date exacte : pas dans Récent, sauf ajout à la main récent), **Toutes nos sélections** (catégories Tout / Prix / Prix de l'image / Sélections / Nominations, listes déroulantes festival, chef op, année, recherche (film, festival, prix, chef op, réalisateur, production) ; 60 lignes puis « Afficher plus » ; « Modifier » en place, « Retirer »), trouvailles écartées repliées. « + Ajouter une sélection ou un prix » : film cherché dans projets.json, festival libre (liste des noms connus), ville, année, type, prix, section, case « pour l'image ». **Prix confirmés → site** (Gus 17/11, `awardsSync`, avec une clé `canWeb`, à l'ouverture de la page et après chaque changement) : chaque trouvaille confirmée devient une ligne (anglais, `awLine` : « Prize, Festival 2026 », « Nominated, …, Festival 2026 », « Official selection – Section, Festival 2026 ») dans `info.awards` du film, sur la page fiction (même titre, `sortSame` / `ficTitle` + autres titres de projets.json, et un chef op en commun) et sur la fiche de chaque chef op crédité (même titre) ; `info.awardsFrom` = { id de la trouvaille: ligne } : ajoutée une fois (corrigée ou effacée à la main = pas remise), retirée si la trouvaille est écartée / retirée ; un seul commit (`edit` sur chaque fichier, rien si à jour), ligne « Site : … » sous l'intro. Publier une fiche ou la fiction ouverte avant garde ces lignes (`awMerge`).
- **Récupération** (Gus 16/11, `#/recup`, `showRecup`, remplace l'ancien outil k-recup, même design que l'admin) : dépôt **privé** `Kinou-DoP/notes`, `projets/projets.json` (format : CLAUDE.md du dépôt notes), lu en entier (`projRead`, contenu brut + sha par la liste du dossier : fichier > 750 Ko), un film (ou un groupe) enregistré tout de suite par-dessus la dernière version (`projSave`, réessaie si 409 / 422). Statut `recup.statut` (À demander = Pas commencé, En cours, Récupéré, Impossible ; sans `recup` : Récupéré si `recovered`). Page (v2, Gus 16/11) : chiffres + % (clic = filtre), puis onglets **Tous les films** (arrivée) | **À relancer** (filtres +3 mois / +1 mois / relances prévues, étiquette sur chaque film), commun aux deux : recherche, types à cases (`RC_CATS` : Pub = pub + web + corporate, Long métrage = longs + téléfilms…), chef op, « Films d'autres agences » coché par défaut, **Par film / Par production** (groupes dépliables, mail par production ; tri « plus de films d'abord » par défaut ou « tournage le plus récent » ; production inconnue à la fin, sans mail). v3 (Gus 17/11) : types = Tous / **Non-fiction** (pub + clip, arrivée, et quand tout est décoché) / familles ; chiffres et % sur la non-fiction seulement (case « Compter aussi la fiction ») ; mail par production = liste des films à cocher (tous cochés), choix « Première demande / Relance », lignes « • Titre, réalisé par X, DoP : Y » (« | » seulement dans l'objet), un film : « le film T, réalisé par X, sur lequel … ». **Annuler / Rétablir** (`immInit` / `immPush` / `immGo`, barre `.immbar` en bas à droite, ⌘Z) sur les pages enregistrées tout de suite (récupération, festivals) : chaque enregistrement garde l'avant et l'après. Formulaire ouvert modifié non enregistré (`.fedit.changed`, `.rcedit.changed`, `formsDirty`) : confirmation avant de quitter. Festivals : champ de recherche au-dessus du calendrier. Ancienne description : « À relancer » par production (urgence `rcUrg` comme k-recup : relance programmée échue, +90 j sans contact ou jamais relancé / sortie dans < 30 j = rouge, 30–90 j = jaune ; films « En cours » seulement), mails FR / EN (`rcMail`, textes repris de k-recup ; un film : objet « Film | Réal | Chef op », plusieurs : un mail par production ; « Copier », « Ouvrir dans la messagerie », « Envoyé » = En cours + dernier contact aujourd'hui + e-mail gardé), puis tous les films (recherche, statut, type, chef op, films d'autres agences masqués par défaut ; clic = fiche en place : statut, dates, e-mail, notes).
- **Sorties fiction** (Gus 17/11, `showSorties`, `#/sorties`) : calendrier des sorties de nos longs métrages et séries. Sources : page fiction du site (`data/fiction.json`, `overrides[<id>].date` / `platforms` / `genre`, titre nettoyé par `ficTitle`), dépôt notes `sorties/sorties.json` (`sortRead` / `sortPut`, Annuler / Rétablir `sortSave` ; ajouts à la main et robot, format : CLAUDE.md du dépôt notes), et films sans date connue (projets.json : LM, TVF, STV hors autres agences). Vue Mois / Semaine (lundi en premier, mercredi souligné = sorties en salle), ‹ › période précédente / suivante, ⇤ ⇥ sortie précédente / suivante (saute les mois vides, tient compte de la recherche), Aujourd'hui ; recherche (film, réal, chef op, plateforme, production, pays) = liste des résultats juste sous le champ, au-dessus du calendrier (Gus 16/11) ; « À venir » ; « Sans date connue » repliable (« + Ajouter une date ») ; clic sur une sortie = détail (source, Modifier sauf page fiction) ; « + Ajouter une sortie » (film, date, Cinéma / Plateforme / Télé, plateforme, pays, lien). Blanc = cinéma, bleu = plateforme / télé, pointillé = série. Doublons (Gus 17/11) : une sortie du robot (TMDB, Claude) d'un film déjà daté par la page fiction sous un titre un peu différent (`sortSame` : 60 % de mots communs, + même date ou même chef op) est ignorée, la page fiction l'emporte ; jours grisés du mois d'avant / d'après sans sorties (sinon le même film dans deux mois).
- **Genre du chef op** (Gus 16/11, fiche, sous « En ligne sur le site », `genderCtl`) : Homme (défaut, rien d'écrit) / Femme / Autre → `gender: "f" | "x"` dans l'entrée de `data/dps/index.json` (écrit à la publication, comme `hidden`). **Publication et `index.json`** (Gus 17/11) : la liste est relue dans le dernier commit au moment de publier (`edit` de `commit` : fichier lu au commit de base, seule l'entrée de ce chef op changée ; `loadIndex` lit aussi le dernier commit) — avant, une copie gardée en mémoire effaçait le genre réglé entre-temps sur d'autres fiches. Fiche publiée sans bundle ni films (juste le genre ou « En ligne ») : avancement « À faire » écrit dans `progress.json` (sinon une fiche qui existe compte comme « Importé »). Mails de récupération : « notre chef opérateur / notre cheffe opératrice X » (autre : le nom seul), « nos cheffes opératrices » si toutes des femmes.
- Fiction (lien « fiction » du menu, `data/fiction.json`) : comme le spotlight (lien d'une bande Slate + « Relire la bande », lue en
  entier par le robot ; mêmes réglages par film via `filmsSection` / `filmCard`, `state` = fic), plus sous le titre de chaque film
  (`ficCtl`) : statut New release / Coming soon (`status` ; Past release = défaut, proposé seulement pour un film déjà passé :
  **9 New releases au plus**, au-delà les plus anciens par date de sortie passent tout seuls en Past release, `ficCapNew`, au
  changement de statut ou de date et à la publication, avec un message ; Gus 04/11 ; film ainsi poussé marqué `autoPast` : il revient
  tout seul en New release, le plus récent d'abord, dès qu'une place se libère, ex. un New release remis en Coming soon), genre (`genre`, onglet du genre si Past release),
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
  Image d'aperçu des liens partagés (Gus 06/11, `makeOg`) : à la publication d'une fiche, le portrait en JPEG 1200 px, noir et blanc
  (ou couleur si décoché) → `data/dps/img/<slug>-og-<horodatage>.jpg` = `about.og` (+ `ogColor`) ; refaite seulement si le portrait
  ou ce choix change (nouveau nom, l'ancienne supprimée) ; utilisée par `sharePage` et `tools/share-pages.mjs` du site.
- CV : PDF → `data/dps/cv/CV-Prenom-Nom.pdf`, servi en téléchargement (`_headers`).
- Adresse (slug) : proposée depuis le nom (minuscules, sans accents) ; modifiable ensuite (demande de Gus : reprendre les
  adresses de kinou.fr). Changement d'adresse = un seul commit : nouvelle fiche, ancienne supprimée (`remove` dans `commit`),
  `index.json` et liens de `home.json` (slides et overrides) mis à jour. Le portrait garde son fichier (`about.img`).

## Hébergement et branches
- L'admin utilisée au quotidien est sur **GitHub Pages** : https://kinou-dop.github.io/admin/ (publie la branche `beta`,
  gratuit, sans crédits Netlify). Le code de l'admin se modifie donc sur `beta` ; en ligne ~1 min après un push.
- Elle appelle les fonctions du site (`SITE` = https://kinou-4tv.pages.dev, Cloudflare depuis le 16/11 : import Slate, refresh).
  « Voir sur le site » ouvre la copie Cloudflare de la beta (`SITE_VIEW` = https://kinou-4tv.pages.dev, essai depuis le 16/11 ;
  la beta GitHub Pages `SITE_PAGES` = https://kinou-dop.github.io/site reste l'adresse des pages d'aperçu des liens).
- `main` est publié sur Netlify (https://kinou-admin.netlify.app) : ancienne version, plus utilisée
  (adresse `kinou-agency/admin` dans son code : ne peut plus publier depuis le déplacement du dépôt).
- Toutes les versions publient dans les mêmes données (`data/` de la branche `main`, constante `BRANCH`).

À chaque modification de `admin.css` ou `admin.js`, mettre à jour le numéro `?v=` dans `index.html` (cache de GitHub Pages).
L'admin compare son `?v=` avec celui de `index.html` en ligne (`checkVersion`, au chargement, au retour sur l'onglet, toutes les minutes, à chaque changement de page et avant chaque
publication) : plus récent → bandeau « Nouvelle version de l'admin disponible » + Recharger en haut, publication bloquée en attendant (Gus 30/10 :
une admin restée en mémoire sur un téléphone avait effacé le `showcase` de Vadim).
« Recharger » garde les modifications non publiées (Gus 03/11) : `saveDraft` met la page ouverte (données + `refs` : bundle lu,
fichiers déposés, aperçus `blob:` changés en base64) dans `sessionStorage` (`kinou-admin-draft`, avec l'adresse), et `histInit` la
remet à la réouverture de la même page (message « Modifications non publiées reprises… », Annuler revient à la version en ligne).

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
