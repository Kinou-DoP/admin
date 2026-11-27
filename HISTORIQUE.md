# HISTORIQUE — dépôt admin

Détail daté des demandes de Gus et des décisions, **jusqu'au 21/11/2026** : c'est l'ancien CLAUDE.md complet, gardé tel quel.
Le CLAUDE.md actuel ne garde que le fonctionnement et les règles ; ARCHITECTURE.md décrit le code. À consulter avant de changer un
comportement (pour savoir pourquoi il est comme ça). Les changements suivants s'ajoutent en bas, datés.

---

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
- Import d'un bundle Slate : `GET <SITE>/api/bundle/<uuid | code shots.re>` (fonction du repo `site`). Plus de bouton « Mettre à jour le site depuis Slate » (Gus 19/11) : le site affiche la copie publiée de la fiche ; changement sur Slate = « Relire le bundle » puis Publier.
- Forcer la mise à jour du site : `POST <SITE>/api/refresh/<slug>` avec le token (vide le cache CDN du DP).
- Corrections par film : `overrides` indexés par id Slate (suivent le film si l'ordre change sur Slate).
  Onglet ALL (admin seulement, ouvert par défaut) : tous les films des catégories, chacun une fois. Pas de bouton
  « Clip d'accueil » (l'accueil se règle par la bande Slate). Un seul aperçu d'extrait joue à la fois.
- Sous un film (fiches et accueil) : liste de liens Slate `kinou.slateapp.com/work/<adresse>` (ou shots.re / slt.re, converti en
  shots.re par `shortLink` : les fonctions du site ne connaissent que shots.re), stills ou vidéo,
  → `GET <SITE>/api/stills?link=…` → `extras` (`overrides[<id>].extras` ou slide de l'accueil) : `{ link, title, stills }` ou
  `{ link, title, full, video, img }` (URLs signées telles quelles). Une case vide en bas pour ajouter un lien de plus,
  flèches ↑ ↓ pour réordonner, × pour retirer. L'ancien `stills` + `stillsLink` est converti à la première modification.
  **Colonnes des vidéos** (Gus 18/11) : bouton « + » à côté d'une vidéo → nombre de colonnes sur ordinateur et sur téléphone (1 à 3)
  → `cols: { d, m }` sur cette vidéo (`layOf`) ; les vidéos suivantes sans réglage suivent (bouton « ↳3·2 »), jusqu'à des stills ou une vidéo
  qui a son propre réglage (ex. 3 vidéos en ligne puis une grande : 3 col. sur la 1re, 1 col. sur la 4e) ; gardé quand on relit le lien.
  « Relire le bundle » (fiche) et « Rafraîchir » (accueil) relisent aussi tous ces liens (`relinkAll` : extras, ancien
  stills, extrait au survol ; 4 à la fois ; lien sans réponse = ancienne version gardée ; `full` du robot gardé si même vidéo).
- Projet en stills (« Sans vidéo ») : case « Extrait vidéo au survol » → lien Slate d'une vidéo qui a un extrait
  → `overrides[<id>].hover` = `{ link, title, video, img? }` ; sur le site l'extrait joue au survol, le clic montre la galerie.
  Le recadrage (zoom / zoomPos) de ce projet se règle sur cet extrait.
- Téléphone : toucher autre chose qu'un champ de texte le quitte (sinon le clavier revenait au lâcher d'un curseur).
- Vignette d'un film (fiches) : pastille en haut à droite (`.snipmark`, Gus 03/11) = snippet Slate : pleine verte = extrait présent
  (`video`), vide = pas encore d'extrait (à « snipper » sur Slate, puis « Relire le bundle ») ; rien sur un projet en images seulement. « Relire le bundle » garde l'ancien snippet d'un film quand Slate n'en renvoie plus (même id Slate ; Gus 19/11 : 68 snippets de Matias Boucard effacés côté Slate, remis depuis l'historique de la fiche).
- Infos du film (Gus 04/11, fiches, spotlight, fiction) : bloc replié « + Infos du film » sous les crédits (`infoCtl`, titre = nombre
  de champs remplis) : année, épisodes, durée, format d'image, plateformes (pas sur la fiction : déjà en étiquettes), caméra,
  optiques, **starring** (`starring`, acteurs séparés par des virgules, Gus 18/11), synopsis français (`synopsis`) et anglais (`synopsisEn`) → `overrides[<id>].info`. Affichage : CLAUDE.md du site (`info`).
  **« Compléter les infos des films (robot) »** (Gus 18/11, fiche d'un chef op, au-dessus des onglets des films, `infoRobotCtl`) : demande au robot du
  dépôt notes (`infos/ask/<adresse>-<horodatage>.json`, workflow `film-infos.yml`, Claude + recherche web, 6 films par recherche, ~3 min chacune ;
  **seulement les films des onglets fiction** (Narrative, Documentaries, Short film, Feature film, Series… variantes et fautes comprises, `ficTab` ; aussi les onglets 2nd unit / cam op / camera operator / cadreur, Gus 19/11 ; pas FEATURED seul, ni pub / clip / TV commercial, Gus 18/11), films masqués et films déjà complets exclus, champs déjà remplis jamais cherchés ; année, épisodes, durée, format, plateformes, caméra, optiques, starring, **pas le synopsis**), avancement relu toutes les 10 s (la page peut être quittée,
  la réponse est gardée), puis **« Appliquer (champs vides seulement) »** : ce que l'équipe ou Slate a déjà écrit passe toujours en priorité ;
  champs remplis = `info.auto` (encadré orange « robot, à vérifier », sources `info.autoSrc` ; ignorés par le site), modifier un champ ou
  « Vérifié, tout est bon » enlève la marque ; puis Publier.
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
- **Accueil de l'admin** (Gus 17/11, `showHello`, adresse `#/`, clic sur « kinou admin ») : « Hello la Dream Team ! » en très grand, police Bagel Fat One (Google Fonts), centré et un peu au-dessus du milieu de l'écran (place pour le petit mot du bas, Gus 17/11), lettres qui tombent une à une, gigotent au survol, sautent au clic ; juste pour sourire ; en bas, petit mot (`helloNews`, Gus 17/11 ; ordre et taille = importance, Gus 19/11) : en haut et plus grand (`.hn1`) nos films qui sortent cette semaine (lundi → dimanche, `sortBuild` = mêmes sorties que le calendrier, lien vers sorties fiction) ; puis (`.hn2`) les dates de sortie trouvées ou changées pour un Coming soon de la page fiction (`ficAlerts`, lien vers fiction) et les nouvelles bandes-annonces ; en bas et plus petit (`.hn3`) les prix trouvés aujourd'hui par les robots (`selections.json`, `kind: prize`, `foundAt` du jour, lien vers nos sélections ; souvent des prix anciens) ; rien à dire = rien d'affiché. La liste des chefs op est sur `#/dops` (menu website → cinematographers).
- Liste des chefs op : champ de recherche au-dessus (filtre au fil de la frappe, sans accents ; Entrée ouvre le 1er résultat).
- **Taper pour chercher** (Gus 18/11) : sur toute page qui a un champ de recherche (`input.find` : récupération, sorties, sélections, festivals, chefs op), taper une lettre hors d'un champ écrit directement dans la recherche (pas pendant un formulaire ouvert, l'historique ou un raccourci ⌘ / Ctrl).
- Historique (lien « historique » en bas du menu de gauche) : petite fenêtre, derniers commits de `data/` lus sur GitHub
  (`/commits?path=…`) : qui (login entre parenthèses dans le message « (admin, login) », ou « robot GitHub »), quand, quoi
  (lien vers le commit). Sur une fiche / l'accueil / le contact : ce fichier seulement, bouton « Tout voir ». Aussi le dépôt privé notes (Gus 17/11, `histPath` / `histAllSrc`) : festivals, nos sélections, récupération, sorties fiction (leur fichier sur leur page) et notes internes des fiches ; demandes / réponses du robot et prénoms des clés cachés.
- Navigation à gauche **en rubriques déroulantes** (Gus 16/11 ; clic sur website / festivals = ses sous-rubriques se déroulent, une
  rubrique ouverte à la fois, celle de la page ouverte déroulée d'office ; sorties fiction et récupération = lien direct) : WEBSITE (cinematographers, home page, spotlight, fiction, press à venir, contact),
  SORTIES FICTION (calendrier `#/sorties`, avant festivals depuis le 19/11), FESTIVALS (dates `#/festivals`, nos sélections `#/selections`), RÉCUPÉRATION
  (suivi `#/recup`, à venir : k-recup, mails) ; téléphone (Gus 17/11) : rubriques à l'horizontale, sous-rubriques sur la ligne d'en dessous, qui commence sous leur rubrique (`subX` → `--subx`) avec un trait à gauche ; nom + « Se déconnecter » sur une petite ligne en haut à droite, au-dessus du logo ; la ligne des sous-rubriques est placée juste sous la ligne de sa rubrique (ordre CSS posé par `subX`, les rubriques des lignes suivantes passent après) ; page ouverte = sa rubrique et elle-même en blanc et en gras (`.on`), une rubrique seulement dépliée reste grise, page hors rubrique = tout replié. Barre Annuler / Rétablir des pages enregistrées tout de suite : collée en bas sur toute la largeur sur téléphone ; boutons des formulaires qui passent à la ligne. Notification = pastille rouge sur « festivals »
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
  ajouté avec son nom seul : complété par le robot du matin. **Nos sélections** (Gus 17/11, v2, `showFestSel`, `#/selections`) : dépôt notes `festivals/selections.json` (format et robots : CLAUDE.md du dépôt notes), lu / écrit directement (`selRead` / `selPut`, Annuler / Rétablir `selSave`). Trois parties : **À vérifier** (trouvailles des robots groupées par film : type Sélection / Nomination / Prix / Prix de l'image, festival + ville + année, section ou prix, source ; ✓ / ✗ par ligne, « Tout confirmer » / « Tout écarter » par film), **Récent** (repliable, choix gardé dans le navigateur `kinou-sel-rec` ; 30 lignes puis « Afficher plus » ; confirmées, festival ou prix des 4 derniers mois d'après sa `date` (Gus 17/11 : pas la date de la recherche) ; sans date exacte : pas dans Récent, sauf ajout à la main récent), **Toutes nos sélections** (catégories Tout / Prix / Prix de l'image / Sélections / Nominations, listes déroulantes festival, chef op, année, recherche (film, festival, prix, chef op, réalisateur, production) ; 60 lignes puis « Afficher plus » ; « Modifier » en place, « Retirer »), trouvailles écartées repliées. « + Ajouter une sélection ou un prix » : film cherché dans projets.json, festival libre (liste des noms connus), ville, année, type, prix, section, case « pour l'image ». **Prix confirmés → site** (Gus 17/11, `awardsSync`, avec une clé `canWeb`, à l'ouverture de la page et après chaque changement) : chaque trouvaille confirmée devient une ligne (anglais, `awLine` : « Prize, Festival 2026 », « Nominated, …, Festival 2026 », « Official selection • Section, Festival 2026 » ; tirets longs toujours remplacés par « • », `awDots`, Gus 18/11) dans `info.awards` du film, sur la page fiction (même titre, `sortSame` / `ficTitle` + autres titres de projets.json, et un chef op en commun) et sur la fiche de chaque chef op crédité (même titre) ; `info.awardsFrom` = { id de la trouvaille: ligne } : ajoutée une fois (corrigée ou effacée à la main = pas remise), retirée si la trouvaille est écartée / retirée ; un seul commit (`edit` sur chaque fichier, rien si à jour), ligne « Site : … » sous l'intro. Titre d'un film de fiche avec le rôle entre parenthèses (« Fatherland (Camera Operator) ») : comparé aussi sans la parenthèse (`awHit`, Gus 19/11). Publier une fiche ou la fiction ouverte avant garde ces lignes (`awMerge`).
- **Récupération** (Gus 16/11, `#/recup`, `showRecup`, remplace l'ancien outil k-recup, même design que l'admin) : dépôt **privé** `Kinou-DoP/notes`, `projets/projets.json` (format : CLAUDE.md du dépôt notes), lu en entier (`projRead`, contenu brut + sha par la liste du dossier : fichier > 750 Ko), un film (ou un groupe) enregistré tout de suite par-dessus la dernière version (`projSave`, réessaie si 409 / 422). Statut `recup.statut` (À demander = Pas commencé, En cours, Récupéré, Impossible ; sans `recup` : Récupéré si `recovered`). Page (v2, Gus 16/11) : chiffres + % (clic = filtre), puis onglets **Tous les films** (arrivée) | **À relancer** (filtres +3 mois / +1 mois / relances prévues, étiquette sur chaque film), commun aux deux : recherche, types à cases (`RC_CATS` : Pub = pub + web + corporate, Long métrage = longs + téléfilms…), chef op, « Films d'autres agences » coché par défaut, **Par film / Par production** (groupes dépliables, mail par production ; tri « plus de films d'abord » par défaut ou « tournage le plus récent » ; production inconnue à la fin, sans mail). v3 (Gus 17/11) : types = Tous / **Non-fiction** (pub + clip, arrivée, et quand tout est décoché) / familles ; chiffres et % sur la non-fiction seulement (case « Compter aussi la fiction ») ; mail par production = liste des films à cocher (tous cochés), choix « Première demande / Relance », lignes « • Titre, réalisé par X, DoP : Y » (« | » seulement dans l'objet), un film : « le film T, réalisé par X, sur lequel … ». **Annuler / Rétablir** (`immInit` / `immPush` / `immGo`, barre `.immbar` en bas à droite, ⌘Z) sur les pages enregistrées tout de suite (récupération, festivals) : chaque enregistrement garde l'avant et l'après. Formulaire ouvert modifié non enregistré (`.fedit.changed`, `.rcedit.changed`, `formsDirty`) : confirmation avant de quitter. Festivals : champ de recherche au-dessus du calendrier. Ancienne description : « À relancer » par production (urgence `rcUrg` comme k-recup : relance programmée échue, +90 j sans contact ou jamais relancé / sortie dans < 30 j = rouge, 30–90 j = jaune ; films « En cours » seulement), mails FR / EN (`rcMail`, textes repris de k-recup ; un film : objet « Film | Réal | Chef op », plusieurs : un mail par production ; « Copier », « Ouvrir dans la messagerie », « Envoyé » = En cours + dernier contact aujourd'hui + e-mail gardé), puis tous les films (recherche, statut, type, chef op, films d'autres agences masqués par défaut ; clic = fiche en place : statut, dates, e-mail, notes).
- **Sorties fiction** (Gus 17/11, `showSorties`, `#/sorties`) : calendrier des sorties de nos longs métrages et séries. Sources : page fiction du site (`data/fiction.json`, `overrides[<id>].date` / `platforms` / `genre`, titre nettoyé par `ficTitle`), dépôt notes `sorties/sorties.json` (`sortRead` / `sortPut`, Annuler / Rétablir `sortSave` ; ajouts à la main et robot, format : CLAUDE.md du dépôt notes), et films sans date connue (projets.json : LM, TVF, STV, films d'autres agences compris : ce sont nos chefs op, Gus 18/11). Vue Mois / Semaine (titre de la semaine court, « 16 – 22 nov. 2026 », `MOISC` ; téléphone : ⇤ ‹ période › ⇥ sur une ligne (année cachée sous 380px), puis « Aujourd'hui » seul, puis Mois / Semaine seul ; lundi en premier, mercredi souligné = sorties en salle), ‹ › période précédente / suivante, ⇤ ⇥ sortie précédente / suivante (saute les mois vides, tient compte de la recherche), Aujourd'hui ; recherche (film, réal, chef op, plateforme, production, pays) = liste des résultats juste sous le champ, au-dessus du calendrier (Gus 16/11) ; « À venir » ; « Sans date connue » repliable (« + Ajouter une date ») ; clic sur une sortie = détail (source, Modifier sauf page fiction ; film de la page fiction : bouton « Page fiction ↗ » vers le site, `ficLink` = `SITE_VIEW/fiction/<onglet>/<id Slate>`, lecteur ouvert sur le film) ; téléphone : balayer le calendrier = période suivante / précédente (le calendrier suit le doigt, sort de l'écran, la nouvelle période arrive de l'autre côté, `st.enter` ; `.calbox` en `overflow-x: clip`, sinon la page s'élargit et la barre Annuler / Rétablir disparaît pendant l'animation) ; date du robot d'un film de la page fiction (même titre) : aussi le lien « Page fiction ↗ » (`ficSlate`) ; « + Ajouter une sortie » (film, date, Cinéma / Plateforme / Télé, plateforme, pays, lien). **Bandes-annonces** (Gus 18/11, `trUnseen` / `trSeen` / `sortBadge`) : trouvées par le robot des sorties (`sorties.trailers`, chaque jour vers 10 h, TMDB) ; pas encore vues = pastille rouge sur « sorties fiction » (calculée à la connexion), encadré « Nouvelle bande-annonce » en haut de la page (film, nom, langue, date, « Voir sur YouTube ↗ » / « Voir / télécharger ↗ » pour Vimeo, « Vu » = `seen: { by, at }` partagé, « Tout marquer comme vu »), ligne sur l'accueil de l'admin ; détail d'une sortie : liens de ses bandes-annonces. **Masquer** (Gus 19/11, `sortHide` / `sortHid`) : bouton sur une sortie (sauf page fiction) ou un film sans date → `sorties.hidden` = `[{ key (titre normalisé), title, project?, slate?, by, at }]` du dépôt notes : film retiré du calendrier, des bandes-annonces et des recherches du robot (ex. Fatherland, Stanisław Cuske seulement cadreur) ; liste « Masqués » repliable en bas, « Réafficher ». Blanc = cinéma, bleu = plateforme / télé, pointillé = série. Doublons (Gus 17/11) : une sortie du robot (TMDB, Claude) d'un film déjà daté par la page fiction sous un titre un peu différent (`sortSame` : 60 % de mots communs, + même date ou même chef op) est ignorée, la page fiction l'emporte ; jours grisés du mois d'avant / d'après sans sorties (sinon le même film dans deux mois).
- **Bibliothèque** (Gus 19/11, 1re version d'après la « Library » de Slate, `showBibli`, `#/bibli`, menu « bibliothèque ») : tous nos films
  connus (`bibLoad` : fiches des chefs op, page fiction, spotlight, accueil, imports ; même film = même id Slate, chefs op et catégories
  réunis ; ~2 100 films) en liste (vignette, titre, pages où il est, chef op, catégories, prod, réal ; extrait au survol). Recherche avec
  **suggestions** (chef op, réal, prod, catégorie, film ; flèches + Entrée) qui deviennent des **filtres en étiquettes** (clic sur un nom
  d'une ligne = filtre aussi ; Retour arrière retire le dernier). **Bande** dans le panneau de droite : glisser des films (ou « + », ou
  cases à cocher + « Ajouter la sélection »), réordonner en glissant, « + Section » (bande avec sections = bundle), brouillon gardé dans
  le navigateur (`kinou-bande-draft`) ; **Réglages** : nom, chefs op, description, cacher réal / chef op / prod / types, 1 à 3 colonnes,
  date d'expiration, mot de passe (enregistré haché SHA-256 + sel : protection légère, le dépôt est public), autoriser le téléchargement ;
  « Créer la bande » → `data/bandes/<code>.json` (copie des films : la bande ne dépend plus de la bibliothèque) + `data/bandes/index.json`
  (onglet « Bandes existantes » : rouvrir, modifier, même lien). Lien : `SITE_VIEW/b/?<code>` (page `b/index.html` du site).
  Imports (`data/bibli/library.json`) : « + Vidéo » = lien Slate (bundle / shots.re → tous ses films ; page vidéo ou stills → un élément),
  ou fichier depuis l'ordinateur **vérifié seulement** (poids, limite 10 Go et 2 Go habituels, durée, taille, débit, image) tant que
  l'hébergement des vidéos n'est pas branché (étude « remplacer Slate », dépôt notes) ; « + Images » = suite d'images compressées en
  WebP 1600 px → `data/bibli/img/<id>/NNN.webp`, utilisable dans une bande (galerie dans le lecteur).
- **Genre du chef op** (Gus 16/11, fiche, sous « En ligne sur le site », `genderCtl`) : Homme (défaut, rien d'écrit) / Femme / Autre → `gender: "f" | "x"` dans l'entrée de `data/dps/index.json` (écrit à la publication, comme `hidden`). **Publication et `index.json`** (Gus 17/11) : la liste est relue dans le dernier commit au moment de publier (`edit` de `commit` : fichier lu au commit de base, seule l'entrée de ce chef op changée ; `loadIndex` lit aussi le dernier commit) — avant, une copie gardée en mémoire effaçait le genre réglé entre-temps sur d'autres fiches. Fiche publiée sans bundle ni films (juste le genre ou « En ligne ») : avancement « À faire » écrit dans `progress.json` (sinon une fiche qui existe compte comme « Importé »). Mails de récupération : « notre chef opérateur / notre cheffe opératrice X » (autre : le nom seul), « nos cheffes opératrices » si toutes des femmes.
- Fiction (lien « fiction » du menu, `data/fiction.json`) : comme le spotlight (lien d'une bande Slate + « Relire la bande », lue en
  entier par le robot ; mêmes réglages par film via `filmsSection` / `filmCard`, `state` = fic), plus sous le titre de chaque film
  (`ficCtl`) : statut New release / Coming soon (`status` ; Past release = défaut, proposé seulement pour un film déjà passé :
  **9 New releases au plus**, au-delà les plus anciens par date de sortie passent tout seuls en Past release, `ficCapNew`, au
  changement de statut ou de date et à la publication, avec un message ; Gus 04/11 ; film ainsi poussé marqué `autoPast` : il revient
  tout seul en New release, le plus récent d'abord, dès qu'une place se libère, ex. un New release remis en Coming soon), **Coming soon passé tout seul en New release le jour de la sortie dès 9 h (Paris)** (`ficAutoOut` à l'ouverture de la page fiction, écrit à la publication suivante ; le site le fait déjà de lui-même, Gus 18/11), **autre date de sortie trouvée** (Gus 18/11, `ficAlerts` / `ficDateWarn` / `ficBadge`) : film Coming soon (ou New release à venir) dont Sorties fiction (`sorties.json` du dépôt notes : robots TMDB / Claude ou ajout à la main, même titre `sortSame` ou même id Slate ; France d'abord) a une autre date → encadré orange sous la date (date, source, lien) « Utiliser cette date » / « Garder la nôtre » (`dateSeen` = date vue, ignoré par le site) + pastille rouge sur « fiction » et « website » dans le menu (calculée à la connexion) ; la page fiction ne change jamais toute seule (l'info de l'équipe prime), genre (`genre`, onglet du genre si Past release),
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

---

## Après le 21/11/2026

- 22/11 : **Nos sélections : prix sans film sur le site** (Gus : « un petit triangle sur les films qui ont reçu un prix mais que les robots
  n'ont pas retrouvés dans la bibliothèque », « afficher que ceux qui n'ont pas le lien et pouvoir le faire soi-même avec un ou plusieurs
  films »). La page charge la bibliothèque (`bibLoad` : fiches + page fiction) et refait le rapprochement d'`awardsSync` (titre, chef op
  crédité ; spotlight exclu, les prix n'y vont pas) : pas de film → triangle orange « ! » (lignes et cartes « À vérifier »), catégorie
  « Sans lien · N » dans Toutes nos sélections, bouton « Relier à un film » : recherche tolérante dans la bibliothèque (mots en commun,
  préremplie avec le titre), plusieurs films possibles, case « relier aussi les autres sélections ou prix de ce film » (cochée).
  Enregistré dans la trouvaille (dépôt notes) : `links: [{ page: "fiction" | <adresse du chef op>, slate, title }]`, `linkBy`, `linkAt` ;
  « Liens · N » pour modifier ou tout retirer ; Annuler / Rétablir. `awardsSync` : une trouvaille reliée va seulement sur ces films
  (fiche d'un chef op même pas crédité sur la trouvaille), plus de rapprochement par le titre. Au 22/11 : 13 prix ou sélections sans
  film (ex. « Furcy » = « Furcy né libre » sur le site).
- 22/11 : **doublons de prix sur le site** (Gus : Histoires Parallèles, L'homme qui rétrécit). `awApply` : (1) une trouvaille confirmée
  n'ajoute plus sa ligne si une ligne écrite à la main dit déjà la même chose autrement (`awSameText` ; ex. « Official selection,
  Cannes film festival 2026 » ↔ « Official selection • Compétition officielle, Festival de Cannes 2026 », « Selected for Un Certain
  Regard at the 2026 Cannes Film Festival ») ; (2) bug : écarter une trouvaille dont le texte est identique à celui d'une autre encore
  confirmée retirait la ligne du site pour les deux — la ligne reste désormais. Données : 3 lignes écrites à la main en double retirées
  (Histoires Parallèles : page fiction + fiche Guillaume Deffontaines ; Les Fraises : page fiction), la ligne du robot gardée.
- 22/11 : **Nos sélections** (Gus) : « Récent » devient un **onglet** à droite de « Toutes nos sélections » (mêmes catégories, filtres et
  recherche ; onglet mémorisé dans le navigateur) au lieu d'une section repliable. **Trouvailles écartées** en deux groupes : « Pas nous »
  (✗ de l'équipe, « Finalement c'est nous ») et « Doublons » (écartés par les robots : « Doublon de : <version gardée> », bouton « Pas un
  doublon » qui la remet dans nos sélections) ; Gus : « ça dit finalement c'est nous alors que c'est nous mais c'est des doublons ».
- 22/11 : **bibliothèque, 2e version** (retours de Gus). Suggestions : plus de films ; ordre chef op (étiquette orange) → réal → prod →
  client → type de contenu → catégorie ; client et types lus sur Slate par un nouveau robot de nuit (`bibli-meta`). Films les plus récents
  en haut. Arrivée = nouvelle bande vide. Boutons de la bande en bas ; on dépose n'importe où dans la colonne ; glisser avec un film qui
  suit la souris (ressort, paquet si plusieurs, comme Slate). Plus de bouton « Enregistrer » : enregistrement automatique. Retouches
  film par film pour une bande (titre, crédits, vignette, extrait, recadrage, stills / vidéos dessous, prix). **Liens des bandes** : Gus
  a remarqué que chez Slate les liens se suivent (on devinait les bandes privées d'autres sociétés en changeant le chiffre) ; et les
  bandes du 19/11 étaient lisibles en clair dans le dépôt public (liste des codes comprise ; mot de passe vérifié seulement dans le
  navigateur). Désormais : lien court au hasard `…/b/<9 caractères>`, contenu chiffré avec le lien (et le mot de passe), liste privée
  dans notes.
- 22/11 (bibliothèque, retours de Gus) : plus de cadre en pointillé (toute la colonne reçoit les films), sections séparées par un trait,
  « Bandes existantes » : seulement le nom, clic sur la ligne pour ouvrir ; Annuler / Rétablir sur la bande (ex. vidée par erreur).
- 22/11 (retouches d'un film dans une bande, Gus) : image par image avec les flèches (vignette, début et fin de l'extrait) ; extrait =
  un début et une fin (10 s au plus) au lieu de 10 s fixes ; on voit l'image pendant le réglage, l'extrait joue dès qu'on lâche.
  Robot `bibli-meta` poussé sur `main` (feu vert de Gus).
- 22/11 (extrait d'une bande, Gus) : au-delà de 10 s la poignée tirée se bloque et l'autre reste en place (avant : elle poussait
  l'autre) ; pour aller plus loin, déplacer d'abord le début puis la fin.
- 22/11 (lecteur des retouches, Gus) : espace et flèches marchaient selon l'endroit cliqué (bouton qui gardait la main, curseur de
  zoom, recherche de la page) → raccourcis écoutés en premier dans toute la fenêtre ; les flèches ne relancent plus la lecture ; la
  lecture tourne toujours en boucle entre le début et la fin de l'extrait.
- 22/11 (bibliothèque, Gus) : revenir de « Bandes existantes » ouvre une nouvelle bande vide (comme au rechargement) ; un changement
  en attente d'enregistrement n'est plus perdu quand on change de bande (`saveBand(b)` garde la bande à enregistrer).
- 22/11 (bandes, Gus) : un film ajouté à une bande reprend le recadrage réglé sur sa page (extrait, et vignette si « vignette aussi ») ; une retouche dans la bande passe par-dessus, pour cette bande seulement. Bandes déjà faites : pas changées (copies).
- 22/11 (bibliothèque, Gus) : clic sur l'image = lecteur, clic sur la ligne = infos du film (titre, crédits, extrait, recadrage… pour les prochaines bandes) ; crédits avec rôle (nos chefs op « Camera operator » etc., crédités après le cinematographer) ; case et « + » plus grands.
- 22/11 (bibliothèque, Gus) : la fenêtre d'infos s'ouvre aussi après l'ajout d'un film ou d'images ; réals, prods et types de contenu en blocs avec suggestions ; vignette et extrait en deux onglets.
- 22/11 (bibliothèque, Gus) : « Annuler » de la bande grisé une demi-seconde après chaque geste (corrigé) et Ctrl+Z bloqué dans la
  fenêtre d'un film (annuler / rétablir ajoutés) ; plus de marques orange ; « Cinematographer » dans les rôles ; onglet Extrait prêt
  tout de suite (à partir de la vignette) ; historique des vignettes et des extraits ; image et mp4 de l'ordinateur.
- 22/11 (bibliothèque, Gus) : « Valider cette image » et « Valider l'extrait » en bas à droite ; un extrait réglé sans valider n'est pas enregistré ; boutons d'import (clic ou fichier glissé dessus).
- 23/11 (Gus) : « Bibliothèque » renommée « Filmothèque » (texte seulement) ; lien de partage d'un film seul (comme sur Slate) avec « Autoriser le téléchargement ».
- 23/11 (Gus) : lien de partage créé dès l'ajout d'un film ; bundles (bandes de bandes) ; recherche dans les bandes existantes.
- 23/11 : **dates de sortie qui ne s'accordent pas** (Gus : « une notif si un film trouvé a une différence, je te confirme une date, et dès
  que tu as encore une date qui change tu renvoies une notif »). Sorties fiction : `sortConflicts` (films hors page fiction, date à venir
  ou de moins de 30 jours) → pastille du menu + encadré : sources en désaccord → « C'est cette date » (crée la date confirmée `human`,
  `seenDates` = autres dates) ; date confirmée contredite par un robot → « Utiliser cette date » / « Garder la nôtre » ; date nouvelle
  → l'alerte revient. Calendrier : un film à date confirmée n'affiche plus les dates des robots. Page fiction : `ficAlerts` regarde toutes
  les sources (plus seulement la 1re), « Garder la nôtre » retient toutes les dates refusées (`datesSeen`), autres sources affichées.
  Sources nommées (`sortSrc`) : TMDB, Wikidata, AlloCiné (recherche Claude) ; « Confirmer » aussi pour Wikidata.
- 23/11 (bundles, Gus) : réordonner les bandes d'un bundle en les glissant (animation comme pour les films d'une bande).
- 23/11 (Gus) : rôle « Underwater DoP » ajouté à la liste des crédits.
- 23/11 (Gus) : dans les retouches d'une bande, « ★ En faire la vignette / l'extrait officiel du film » (appliqué au film de la filmothèque).
- 23/11 (Gus) : recadrage de la fenêtre d'un film (filmothèque, bandes) = celui des fiches (cadre rouge, extrait qui défile pendant le réglage, case « Aussi sur la vignette » qui montre la vignette).
- 23/11/2026 : enregistrements en arrière-plan dans toute l'admin (Gus : une note tapée puis page quittée trop vite n'était pas enregistrée). Changer de page lance tout de suite les enregistrements prévus, qui continuent en fond ; fermer ou recharger l'onglet pendant un enregistrement demande confirmation ; pastille « Enregistrement… / Enregistré / Pas enregistré » en bas à gauche (`soon`, `track`, `flushSaves`, `#saving`).
- 23/11 (Gus) : « Remplacer la vidéo » dans la fenêtre d'un film (par un lien Slate ; depuis l'ordinateur quand Amazon sera branché).
- 24/11 (Gus) : réglage de mise en page d'une bande « Grille » / « Plein écran en haut » (Full Bleed de Slate).
- 25/11 : accueil de l'admin : **prix trouvés ces 3 derniers jours** (au lieu du jour même : les robots passent souvent le soir, Gus ne les
  voyait plus le lendemain matin), plus récents d'abord, « à vérifier » tant qu'ils ne sont pas confirmés.
- 25/11/2026 : la « filmothèque » s'appelle « video club » partout dans l'admin (menu, titre, messages, commits) ; code inchangé (`bibli`, `#/bibli`) (Gus).
- 25/11 : « Modifier la sélection » sur les fiches des chefs op (onglets et films sans Slate, ajout depuis le video club, publié tout de suite) ; « Relire le bundle » devient « Réimporter depuis Slate » (option) ; pages et onglets des chefs op listés dans Bundles / Bandes existantes du video club (Gus).
- 25/11 : fiche sans films : bouton « Créer une sélection » (même fenêtre que « Modifier la sélection ») (Gus).
- 25/11 : « Modifier la sélection » : sans recherche, la liste de droite montre tous les films du video club avec ce chef op (plus récents en haut), pas seulement ceux de la page (Gus).
- 25/11 : « Modifier la sélection » : filtre « Chef op » actif (la recherche reste dans ses films, × pour tout le video club) ; clic sur une vignette = aperçu du film (Gus). À faire : filtres et fenêtre d'infos comme le video club.
- 26/11 : « Modifier la sélection » : liste de droite comme le video club (filtres en étiquettes avec suggestions, chef op de la fiche à l'ouverture), aperçu avec crédits, client, types, date (Gus).
- 26/11 : « Modifier la sélection » aussi pour l'accueil, spotlight et fiction (une liste, ajout depuis le video club ; publier retire le lien de la bande Slate : le robot ne relit plus Slate pour ces pages) ; ces pages listées dans Bundles du video club (Gus).
- 26/11 : spotlight / fiction : films ajoutés en haut de la sélection ; film ajouté à une page complété par le robot (stills, vidéos, infos des autres pages : SDM de Julien Lascar rattrapé) ; robot fill-home débranché de Slate (Gus).
- 26/11 : « Modifier la sélection » : films et onglets glissés comme dans les bandes du video club (effet ressort), film déposé sur un autre onglet ; extrait : une seule frise sur tout le film (plus d'effet zoom / dézoom) (Gus).
- 26/11 : « Modifier la sélection » : onglets affichés correctement (pastilles) ; en les glissant, plus d'image qui suit la souris (seulement pour les films) (Gus).
- 26/11 : aperçu d'un film (video club, « Modifier la sélection ») : ‹ › pour le film d'avant / d'après de la recherche, « + » pour l'ajouter à la bande / l'onglet ; pastille « Enregistrement » au-dessus de « Publier » (Gus).
- 26/11 : « Modifier la sélection » : bouton « Afficher plus » (150 de plus à chaque clic) en bas de la liste de droite (Gus).
- 26/11 (Gus) : encodage dans le video club : envoi des vidéos de l'ordinateur chez Amazon + robot `encodage.yml` (version web 1080p, vignettes WebP, extrait 720p de 5 s aux 2/3 du film) ; « Valider l'extrait » = extrait léger 720p sans son fait par le robot (`snip.v`). Snippets choisis à la main, 720p partout sauf l'accueil (1080p, pas de snippet).
- 26/11 (Gus) : « Remplacer la vidéo » depuis l'ordinateur (envoi chez Amazon + encodage par le robot).
- 26/11 (Gus) : fenêtre d'import (infos + vignette / extrait pendant l'envoi, avancement envoi + encodage, plusieurs vidéos d'un projet avec les crédits de la 1re, liens « + Vidéo » / « + Images » ouvrables dans un autre onglet) ; « Remplacer la vidéo » garde vignette / extrait / temps (Valider les refait), vidéo glissée sur le bouton ; stills de l'ordinateur ajoutés par glisser-déposer, ordre en glissant.
- 26/11 (Gus) : vignettes grises après un changement de vignette → copie locale affichée tant que l'image n'est pas en ligne (`imgLocal`).
- 26/11 (Gus) : « le video club sert partout » : textes de la fenêtre d'un film (« sur le site et dans les prochaines bandes ») ; le site applique `edits.json` (vcApply d'app.js).
- 26/11 (chef d'orchestre) : CLAUDE.md allégé pour économiser l'abonnement Claude (relu à chaque message) : le détail est déplacé
  tel quel dans des notes par sujet `docs/` (à lire seulement pour la tâche concernée) ; CLAUDE.md garde l'essentiel et les règles.
- 25/11 — « Modifier la sélection » : les imports du video club sans id Slate (stills, vidéos de l'ordinateur) sont cherchables et ajoutables (id = clé du video club, `sid`). Robots (main) : encodage (réponses jamais enregistrées : identité git, rebase coincé) et vignettes réduites (images du site d'abord).
- 25/11 — Une seule source (Gus) : vignette, extrait et recadrage des cartes des fiches lus et écrits dans edits.json ; bouton « edit » = fenêtre du video club par-dessus la page ; vidéo remplacée reprise à l'ouverture du video club (`encCheckEdits`).
- 25/11 — Images du video club envoyées chez Amazon (`imgPut`) ; crédits des cartes des fiches lus et écrits dans le video club (`vcCredits`, `vcSetCredits`), titre propre à la page.
- 26/11 — Video club : vignette prise dans une vidéo en ligne = demande `thumb` au robot d'encodage (le navigateur ne peut pas copier l'image d'un CloudFront sans CORS, `/api/media` figé) ; vidéo de l'ordinateur : capture directe. Imports : pastilles Envoi / Encodage / Prête + bandeau vert, onglets colorés, barre de progression pour les images. Images d'une suite d'images : `images` ajouté à `BIB_EK`, réordonnées en glissant (`stillGrid(it, "images")`).
- 26/11 — Video club : `pend` (vignette / extrait demandés au robot survivent à la fermeture), `adopt` (crédits non enregistrés jamais écrasés par un rechargement), recadrage des stills (`scrop`, `extras[].crop`, fenêtre ▣). La vignette passe par le robot car `/api/media` (Cloudflare) reçoit un 403 de notre CloudFront ; l'hébergement est Cloudflare + GitHub Pages, plus Netlify.
- 26/11 — Recadrage des stills en rectangle rouge déformable (+ cadre à part par image, `per`) ; import vidéo / images : fenêtre des crédits ouverte tout de suite (`localFilm`).
- 26/11 — Lignes sous le film : glisser-déposer, recherche, liens de nos bandes, masquer par lieu (`hide`) ; vidéos importées ensemble = lignes `auto` ; clic-glissé ne ferme plus les fenêtres ; bouton edit sous la vidéo.
- 26/11 — Import groupé = vidéos liées (`grp`), œil partout (pages, bandes), images du projet déplaçables, recherche au centre avec filtres, case chef op vide d'emblée, suggestions du video club réparées (`.bst`).
- 26/11 — Video club : la barre de recherche a le focus à l'arrivée.
- 26/11 — Video club : Ctrl / Cmd + Z (bande) ne marchait plus à cause du focus automatique de la recherche (champ = ignoré) ; ignoré seulement si la barre contient du texte.
- 26/11 — Vidéos d'un même import : ordre commun (glisser change l'ordre pour tout le lot), masquages gardés au recalcul.
- 26/11 — Lot de vidéos : un film dont les lignes ont les mêmes vidéos que le lot (même réglées à la main avant) reste lié (`bibGroups`, onChange) ; ordre du lot repris de la fenêtre de Prince de ma ville.
- 26/11 — Enregistrements : commits de la page en file (`commitQ`), 6 essais, et infos du video club réessayées 2 fois seules avant l'alerte (GitHub 422 « Reference cannot be updated »).
- 26/11 — Cartes des pages de chefs op : les vidéos du même import s'affichent sous le film (`vcGroupRows`), avec poignée et œil ; toucher au réglage crée la liste propre à la page (overrides[id].extras).
- 26/11 — Fiches : la liste d'une carte (vidéos d'un lot) suit le video club (titres, ordre) tant que l'ordre n'a pas été changé sur la page (overrides[id].extrasOrd).
- 26/11 — Capture de vignette : essais instantanés (blob, /api/media, CORS direct) avant le robot.
- 26/11 — Montage d'extrait (blocs, I / O, poignées qui se poussent, 30 s), suppression d'un film / bande / bundle, client + date + poids dans les infos, à faire plus tard (README).
- 26/11 — Montage : sélection séparée des blocs, Ctrl+Z du montage ; client affiché avant le titre (site, bandes, fiches, liste).
- 26/11 — I / O exacts, client affiché par défaut (meta.json), date Slate = `at`, survol de la liste et aperçu de recadrage = dernier extrait.
- 26/11 — Lecture à l'envers (Z/J, K, L), son coupé partout, client sans doublon (Ubisoft | Ubisoft → Ubisoft).
- 26/11 — Entrée = ajouter le bloc ; aperçu d'un film : ajouter / retirer de la bande sans relancer la vidéo.
- 26/11 — Montage : blocs visibles sur la frise, ▶ d'un bloc ne le sélectionne plus, 2e clic = désélection, « + Nouvelle sélection ».
- 26/11 — « Modifier la sélection » : aperçu d'un film avec boutons discrets par onglet (ajouter / retirer sans changer l'onglet ouvert) et « + » pour créer un onglet ; « − Retirer de l'onglet ».
- 26/11 — Zoom de la frise (Option + molette), repères début / fin du film ; onglets de l'aperçu en haut, arrondis.
- 26/11 — Bouton « edit » des fiches plus rapide (chargement en avance, cache réutilisé) ; clic dans le vide = désélection du bloc.
- 26/11 — Logo « lien » sur les vidéos liées (liste du video club, fenêtre d'un film : `linkIcon`, `grpCount`).
- 26/11 — Recadrage : le cadre rouge reste tant qu'on ne clique pas ailleurs (`outside`), commandes plus recréées après « edit ».
- 26/11 — Bout à bout (montage.js + job edit du robot, limite 10 Go), frise horizontale proportionnelle des blocs, fenêtre d'edit plus large.
- 26/11 — Bouton « Créer un bout à bout » en haut de la fenêtre d'une vidéo liée + logo lien cliquable dans la liste.
- 26/11 — Video club : « Supprimer la sélection (n) » dans la liste (films importés cochés, confirmation, un seul enregistrement : `libDeleteMany`).
- 26/11 — Corbeille du video club (30 jours, restaurer, oublier).
- 26/11 — Phase 2 : « edit moi si tu peux ! », versions Encodage / Edit n, version affichée choisie, nouveau projet depuis un edit (job post).
- 26/11 — Suppression = masquer pour les films de Slate ; fenêtre de montage refaite (blocs comme les extraits, curseur sur les frises).
- 26/11 : montage — zoom Option/Alt + molette sur la frise de la source (autour de la souris, traits de début/fin de vidéo), raccourcis Z/J (à l'envers), K (pause), L (lecture), Entrée (ajoute le bloc) ; clavier capté sur window pour ne plus être avalé par la fenêtre d'edit du dessous.
- 27/11 : montage + fenêtre d'edit des extraits : E = lecture (1 à 3 appuis : ×1, ×2, ×4), Z / J = arrière (idem), barre de navigation sous la frise zoomée (poignée à tirer), Cmd / Ctrl + molette = déplacement ; les lettres ne vont plus dans la recherche du video club sous la fenêtre ; recherche du video club pas focalisée sur téléphone ; recadrage du film repris dans la fiche spotlight.
- 27/11 : « Bundle Slate → bundle video club » (fenêtre « Ajouter une vidéo ») : films ajoutés au video club, une bande par onglet, un bundle qui les regroupe (`clubBundle`).
- 27/11 : montage de l'extrait de l'accueil (`montageWin` mode `home`, durée exacte, cadrage téléphone par bloc, bouton dans « Éditer la vidéo » > Extrait HD) ; sélecteur « Source vidéo » (nous / Slate) en haut de la liste des chefs op (`data/source.json`).
- 27/11 : montage (base commune `montageWin` + options) : couleur par bloc, clic dans le vide = désélection, espace après Z = pause ; mode accueil : écran de téléphone à gauche (canvas), recadrage global / « Séparer » (zoom ordinateur ≠ téléphone, `phoneZoom` → `--zm` sur le site).
- 27/11 : montage : fenêtre presque plein écran, annuler / rétablir (↶ ↷), ▶ d'un bloc = boucle sur ce bloc, clic sur le bloc choisi = retour à son début, « Nouvelle sélection » en orange, bande téléphone tenant compte du zoom ordinateur, son coupé pour l'accueil / extraits ; mode `snip` (extrait 30 s) = même fenêtre via « ✂ Fenêtre de montage » dans l'onglet Extrait ; accueil : bouton de montage en évidence.
- 27/11 : accueil admin : « Éditer la vidéo » ouvre directement le montage (l'ancien éditeur reste pour les films sans film complet) ; recadrage : glisser la vidéo zoomée règle le point de cadrage (`zoomPos`) ; aperçus de l'admin (`mkVid`) jouent les blocs du montage.
- 27/11 : accueil admin : « Éditer la vidéo » sans film complet connu = message « en cours de récupération » (plus d'ancien éditeur).
- 27/11 : montage : poignées, curseurs, I / O, coupes calés sur l'image (cadence mesurée, 25 par défaut) ; ▶ Montage tourne en boucle pour l'extrait de l'accueil et l'extrait 30 s.
- 27/11 : montage : convention logiciel de montage : le curseur est au début de l'image affichée, la sortie d'un bloc (touche O, poignée) englobe cette image (va jusqu'au trait de l'image d'après) ; +1/4 d'image aux sauts pour tomber sur la bonne image.
- 27/11 : montage : curseur de la frise source au-dessus des poignées (dépasse haut et bas, triangle) ; traits de la règle = images, adaptés au zoom (1 trait par image, puis toutes les 2 / 5 / 10 images, puis par secondes…) (`drawTicks`).
- 27/11 : montage : frise source plus haute (68 px), traits de la règle moins denses.
- 27/11 : montage : fin de bloc détectée par rappel image par image (`requestVideoFrameCallback`) + arrêt net avant de sauter (`hop`) : plus d'image du plan d'après ; « il manque N images » ; molette sur toute la zone de la frise (`det`) ; choisir un bloc amène la frise zoomée sur son début (`showAt`).
- 27/11 : fin de bloc sans image en trop (montage, aperçus admin `mkVid`, site `hdFin`) : arrêt sur l'avant-dernière / dernière image, affichage explicite de la dernière image du bloc (déplacement à l'arrêt), puis saut.
- 27/11 : video club : « Bandes existantes » et « Bundles » = une seule liste (nos bandes + onglets / pages du site, étiquetés, filtres Tout / Nos bandes / Pages du site).
- 27/11 : accueil admin : « Enregistrer et exporter pour le site » (robot `home` → petit fichier), pastille d'export sur la carte (verte = prêt, orange = en cours / montage changé, grise = jamais exporté, rouge = échec), historique des montages (« Reprendre »).
- 27/11 : pastille d'export = `.snipmark` (même que les fiches des chefs op : verte = prêt, orange = à refaire, orange clignotante = en cours, rouge = échec) sur la vignette de la carte de l'accueil et des fiches ; correction de la classe `.hexp` (conflit avec le panneau du montage) ; « Bandes existantes » / bundles : une seule liste sans catégories ni filtres.
- 27/11 : bundle : la liste « ajouter une bande » montre la vignette du 1er film et inclut les onglets des pages du site (un onglet ajouté devient une vraie bande, copie de ses films).
- 27/11 : fenêtre de montage ajustée à l'écran (`.bmfit` : plus de défilement, la vidéo prend la hauteur libre), curseur de recadrage sous le titre à droite, bouton « Exporter » ; liste « ajouter une bande » d'un bundle : toute la liste sans chercher (défile).
- 27/11 : montage de l'accueil : titre du film en haut de la colonne de droite (l'en-tête ne garde que annuler / rétablir / fermer), retour vidéo agrandi (colonne gauche 2,6 fr, hauteurs resserrées en bas, anciennes largeurs forcées retirées).
- 27/11 : montage de l'accueil : plus d'en-tête (« Fermer » en haut à droite, ↶ ↷ avec les boutons de lecture) ; téléphone portrait = une colonne (réglages, téléphone + ordinateur, frises, la fenêtre défile) ; paysage = côte à côte avec frises accessibles.
- 27/11 : montage : boutons image par image (◀| et |▶) de chaque côté de ▶ / ❚❚ (sans le mot « Source »), ↶ ↷ plus visibles ; vidéo + téléphone dimensionnés par unités de conteneur (ne débordent plus sur la colonne de droite).
- 27/11 : montage : boutons ◀◀ (Z) et ▶▶ (E) à la suite de l'image par image (`revGo`, `fwdGo` partagés avec le clavier) ; téléphone en paysage : boutons de lecture et « Nouvelle sélection » déplacés dans la colonne de droite (`rcSlot`), l'image seule à gauche.
- 27/11 : montage : couper un bloc = touche C (avant S), bouton ciseau seul.
- 27/11 : montage de l'accueil sur téléphone : portrait = réglages, puis vidéo + boutons de lecture juste au-dessus de « Nouvelle sélection », puis les frises ; paysage = grille (vidéo + les deux frises à gauche sans défilement, boutons de lecture, « Nouvelle sélection » et réglages à droite qui défilent).
- 27/11 : montage de l'accueil : paysage téléphone : frises sur toute la largeur ; pincer à deux doigts sur la frise de la source = zoom (autour des doigts), la barre de navigation sert à se déplacer.
- 27/11 : montages (bout à bout, edit, extrait 30 s, accueil) : même mise en page sans en-tête (« Fermer » en haut à droite, nom du montage en haut de la colonne de droite, ↶ ↷ avec les boutons de lecture, même réorganisation téléphone) ; barre de navigation de la frise toujours visible (poignée pleine quand pas zoomé).
- 27/11 : barre de navigation des frises : tirer les bords de la poignée = zoomer ; fenêtre d'edit d'un film, onglet Extrait : plus d'ancien éditeur : extrait actuel en boucle, gros bouton « Ouvrir la fenêtre de montage », « Importer un mp4 », historique ; « Exporter » dans le montage valide ET encode en un clic ; reprendre un ancien extrait le valide tout de suite.
- 27/11 : onglet Extrait : un extrait « fichier » (d'origine Slate ou mp4 importé) est reconnu, affiché et joué dans un petit lecteur (plus de « pas d'extrait ») ; montage d'un extrait de 30 s : on part sans aucun bloc (avant : tout le film en un bloc).
- 27/11 : fiches des chefs op : pas d'extrait = pastille grise + petit ciseau dessous ; le ciseau ouvre la fenêtre de montage (30 s), « Exporter » enregistre l'extrait dans le video club et le demande au robot (pastille orange qui clignote puis verte quand il est prêt).
- 27/11 : fiches : le ciseau d'extrait n'ouvre plus le cadre de recadrage de la vignette (il garde pointerdown / mousedown pour lui).
- 27/11 : ancien éditeur de l'accueil supprimé (`hdCtl`, `videoEditor` : ~120 lignes de accueil-spotlight.js) ; l'ancien éditeur d'extrait de la fenêtre d'edit d'un film est masqué mais son code reste (entremêlé avec la frise de la vignette : à retirer dans un chantier à part, avec tests).
- 27/11 : crédits : sigles (AFC, SBC…) gardés dans les lignes de crédits des cartes (`vcShow`, `vcSep`) comme sur le site.
- 27/11 : video club : « Délier cette vidéo » / « Tout délier » dans la barre des vidéos liées (importées ensemble) de la fenêtre d'un film (`unlinkFilms` : retire `grp` / `gi` de library.json et edits.json ; un lot réduit à une vidéo est dissous).
- 27/11 : import de plusieurs vidéos : plus liées au départ ; case « Lier ces N vidéos entre elles » tout en haut de la fenêtre d'import (décochée ; la cocher lie, la décocher délie : `setLinked`).
- 27/11 : montage : C coupe le bloc sous le curseur (choisi ou non, ou celui qui joue) ; fin de bloc : minuteur de précision en plus du rappel image par image (`armEnd`) dans la fenêtre de montage, l'aperçu de l'admin et le site : plus aucune image du plan d'après sur la vidéo d'essai (12 s de boucle).
- 27/11 : image en trop à la fin d'un bloc (y compris à l'export) : (1) robot : coupe à l'image près (`fpsOf`, `coupe` : images comptées avec -frames:v, départ un demi-image avant, -fps_mode passthrough, setpts) — vérifié sur le vrai film d'un extrait de 3 blocs (70 images, première et dernière de chaque bloc = les bonnes, PSNR 44-50 dB) ; avant, un début arrondi à la milliseconde (119,641) perdait la 1re image ; (2) fenêtre de montage : cadence mesurée dès l'ouverture (`measureFR`) au lieu de 25 images / s par défaut.
- 27/11 : video club : la liste suit le recadrage du film (extrait au survol zoomé ; vignette zoomée si « vignette aussi »).
