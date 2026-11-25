# Branches, hébergement, lecture de Slate, connexion, publication (admin)

Note de tâche : à lire seulement quand la tâche touche ce sujet. Règles générales : `CLAUDE.md`.

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
- `commit(files, message)` : un seul commit pour plusieurs fichiers ; réessaie seul (3 fois) si un autre commit passe entre-temps.
  Un fichier `{ path, edit }` est **relu dans le dernier commit** puis modifié (ex. `dps/index.json` : seule l'entrée du chef op change).
- Annuler / Rétablir : instantanés de la page (`histInit`, `touch`) ; pages enregistrées tout de suite (festivals, récupération,
  sorties, sélections) : `immInit` / `immPush`.
- **Enregistrements en arrière-plan** (toute l'admin) : un enregistrement automatique (notes, bandes, bundles, infos des films,
  partage d'un film, prix) se programme avec `soon(clé, fn, ms)` (jamais un `setTimeout` à part) ; changer de page dans l'admin le
  lance tout de suite (`flushSaves`) et il continue en fond ; `gh` (écritures), `commit`, `nPut`, `nEdit` sont comptés (`track`).
  Tant qu'il reste un enregistrement en cours ou prévu, **fermer / recharger l'onglet demande confirmation** (`beforeunload`).
  Pastille en bas à gauche (`#saving`, au-dessus de la barre « Publier » quand elle est là) : « Enregistrement… », « Enregistré », « Pas enregistré : … » (clic = fermer). Les notes
  d'une fiche rouverte attendent la fin de leur enregistrement avant d'être relues (`notesPending`).

## Connexion et droits
- Clé GitHub « fine-grained » par personne (Resource owner Kinou-DoP, dépôts `admin`, `site`, `notes`, Contents : Read and write, sans
  expiration), gardée dans le navigateur, jamais dans le dépôt. Le **prénom** est demandé à la 1re connexion d'une clé et lié à son
  empreinte (`notes/equipe/noms.json`) : il signe les commits « (admin, Prénom) » et l'historique.
- Clé sans droit d'écriture sur ce dépôt (`canWeb` faux) : rubrique website **en lecture seule** ; festivals, sélections,
  récupération, sorties, notes internes restent utilisables (dépôt notes).
- Ajouter une personne : l'inviter dans l'organisation Kinou-DoP, rôle **Write** sur `admin`, `site` et `notes`, puis elle crée sa clé
  (approbation éventuelle : organisation → Settings → Personal access tokens → Pending requests).
