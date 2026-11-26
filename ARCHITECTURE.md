# ARCHITECTURE — admin kinou

Vue d'ensemble des trois dépôts : `ARCHITECTURE.md` du dépôt `site`. Ici : le code de l'interface d'admin et ses robots.

## Fichiers
| Fichier | Branche | Rôle |
|---|---|---|
| `index.html` | `beta` | squelette (connexion, menu de gauche, `#view`, barre du bas) ; `?v=` = version des JS / CSS |
| `assets/js/admin.js` + `assets/js/admin/*.js` | `beta` | toute l'interface, découpée par thème (portée globale partagée, chargés dans l'ordre de `index.html`, routeur par `#/…`) |
| `tools/maj-version.sh` | `beta` | met à jour `?v=` dans `index.html` après une modification du JS / CSS |
| `assets/css/admin.css` | `beta` | tout le style |
| `data/` | `main` | **les données du site** (fiches, accueil, spotlight, fiction, contact, bandes, bibliothèque, avancement) |
| `.github/workflows/home-full.yml` + `tools/fill-home.mjs`, `tools/link-films.mjs` | `main` | robot après chaque publication : films complets manquants, images des projets en images, types de contenu, infos partagées entre pages d'un même film |
| `.github/workflows/bibli-meta.yml` + `tools/bibli-meta.mjs` | `main` | robot de nuit (~4 h) : client, types de contenu, mots-clés de chaque film lus sur les bundles → `data/bibli/meta.json` |
| `.github/workflows/slate-ask.yml` + `tools/ask.mjs`, `tools/slate.mjs` | `main` | robot qui lit Slate quand les fonctions du site ne répondent pas (`data/ask/`) |
| `_headers`, `netlify.toml` | `main` | réglages de l'ancienne admin Netlify (plus utilisée) |

## Fichiers JS (dans l'ordre de chargement)
| Fichier | Contenu |
|---|---|
| `admin.js` | noyau : réglages (`SITE`…), version, outils (`el`, `status`), enregistrements en cours, API GitHub, API du site |
| `admin/upload.js` | envoi Amazon, encodage, `importBundle`, `importStills`, `relinkAll`, `extrasCtl` |
| `admin/connexion-liste.js` | `login`, prénom, `showList`, avancement des fiches |
| `admin/fiche-base.js` | Annuler / Rétablir, `showDP`, notes, `render`, identité, `infoRobotCtl` |
| `admin/fiche-films.js` | `filmsSection`, `selEditor`, `zoomCtl`, `scopeCtl`, `phoneCtl`, `vc*`, `filmCard` |
| `admin/fiche-about-publier.js` | about, portrait, CV, `publish` / `doPublish`, `sharePage` |
| `admin/accueil-spotlight.js` · `fiction.js` · `contact.js` | pages du site : home, spotlight, fiction, contact |
| `admin/festivals.js` · `selections.js` · `sorties.js` · `recup.js` | pages internes (festivals, sélections + prix, sorties fiction, récupération) |
| `admin/admin-divers.js` | accueil de l'admin (`showHello`), historique, navigation latérale |
| `admin/bibli-outils.js` · `bibli-page.js` | video club : données, bandes chiffrées, glisser · `showBibli` |
| `admin/routeur.js` | `route`, garde-fous de sortie, démarrage (toujours en dernier) |

## Détail par sections (titres `// ---------- … ----------` dans le code)
1. **Outils** : `el` (fabrique un élément), `status` (message en bas), `slugify`, `bundleId`, `shortLink`.
2. **API GitHub** : `gh` (appel avec la clé), `readFile`, `commit` (un commit pour plusieurs fichiers, `edit` = relu au dernier
   commit, réessaie si conflit), `json`.
3. **API du site (Slate)** : `siteGet`, `askRobot` (robot GitHub en secours), `importBundle`, `importStills`, `relinkAll`.
4. **Connexion** : `login`, clé gardée dans le navigateur, prénom (`notes/equipe/noms.json`), `canWeb` (droits d'écriture).
5. **Liste des chefs op** (`showList`) et **avancement** (`progressBoard`, `data/progress.json`).
6. **Fiche d'un chef op** (`showDP`) : bundle, onglets, `filmCard` (réglages d'un film), `extrasCtl`, `infoCtl`, `awardsCtl`,
   `infoRobotCtl`, `notesBox`, about, portrait (`compress`, `makeOg`), CV. **Annuler / Rétablir** (`histInit`, `touch`, `record`).
7. **Publication** (`publish`, `robotFrom`, `awMerge`, `sharedMerge`, `afterRobot`, `sharePage`).
8. **Accueil du site** (`showHome`, éditeur vidéo), **Spotlight** (`showSpot`), **Fiction** (`showFic`, `ficCtl`, `scopeCtl`,
   `ficCapNew`, `ficAutoOut`, `ficAlerts`), **Contact** (`showContact`).
9. **Pages enregistrées tout de suite** (`immInit`, `immPush`) ; **Festivals** (`showFestivals`, `festLoad`, `festAsk`) ;
   **Nos sélections** (`showFestSel`, `selRead`, `selPut`) et **prix → site** (`awLine`, `awApply`, `awFor`, `awFile`, `awardsSync` ; liens à la main : `placed`, `linkForm`) ;
   **Sorties fiction** (`showSorties`, `sortBuild`, `sortHide`, `trUnseen`) ; **Récupération** (`showRecup`, `projRead`, `projSave`, `rcMail`).
10. **Accueil de l'admin** (`showHello`, `helloNews`), **Historique** (`histPath`), **Navigation** (`route`).
11. **Bibliothèque** (`showBibli`, `bibLoad`, `bibFly` (glisser), `bandSeal` (chiffrement), `editItem` (retouches) ; bandes chiffrées `data/b/`, originaux dans notes `bandes/` ; imports et `meta.json` dans `data/bibli/`).

## Données internes
Les pages festivals, sélections, sorties, récupération, notes et prénoms lisent / écrivent le **dépôt privé `notes`**
(`NOTES_REPO`) : jamais dans ce dépôt public. Formats : CLAUDE.md et ARCHITECTURE.md du dépôt notes.

## Tester, dépanner
- Tester : servir le dossier (`python3 -m http.server`) et simuler l'API GitHub (Playwright, `page.route('https://api.github.com/**')`)
  pour ne rien écrire pour de vrai.
- **Bandeau « Nouvelle version »** : recharger. **« GitHub 409 / 422 »** à la publication : quelqu'un a publié en même temps ;
  l'admin réessaie seul, sinon republier. **« Lecture seule »** : la clé n'a pas le droit d'écrire dans ce dépôt (voir docs/hebergement.md,
  « Ajouter une personne »). **Import Slate lent** (~1 min) : passage par le robot (onglet Actions du dépôt, workflow slate-ask).
- Si le robot n'arrive pas à enregistrer : dépôt → Settings → Actions → General → Workflow permissions → « Read and write ».
