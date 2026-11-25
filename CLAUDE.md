# CLAUDE.md — admin kinou

Interface d'administration de kinou (site des chefs op + outils internes de l'équipe) et **source des données du site** (`data/`).
HTML / CSS / JS vanilla (`index.html`, `assets/js/admin.js`, `assets/css/admin.css`), aucune dépendance. On parle à Gus en français,
en le tutoyant, simplement.

## Notes par tâche (ne lire que celle de ta tâche, et seulement le passage utile)
- `docs/video-club.md` : video club (`#/bibli`), bandes, bundles, partage d'un film, retouches, encodage et envoi des vidéos chez
  Amazon, vidéos jouées depuis notre CloudFront, images pas encore en ligne, filmothèque complète.
- `docs/website.md` : fiches des chefs op, « Modifier la sélection », home page, spotlight, fiction, contact ; règles de publication
  propres à ces pages (robots `link-films`, `fill-home`, films du robot).
- `docs/outils-internes.md` : accueil de l'admin, sorties fiction, festivals et nos sélections (prix → site), récupération, historique.
- `docs/hebergement.md` : branches, `SITE` / `SITE_VIEW`, lecture de Slate (fonctions du site, robot `askRobot`), connexion et droits,
  détail de la publication (`commit`, Annuler / Rétablir, enregistrements en arrière-plan).
- `ARCHITECTURE.md` : carte du code. `HISTORIQUE.md` : pourquoi c'est comme ça (chercher le mot-clé plutôt que tout lire).
  Format des données du site : `docs/donnees.md` du dépôt `site`.
- **À chaque changement** : la note de tâche concernée, une ligne datée en bas de `HISTORIQUE.md`, `ARCHITECTURE.md` si la structure
  change ; ce fichier seulement si une règle générale change.

## L'essentiel
- **Code sur `beta`** (`git checkout beta` avant tout), en ligne ~1 min après un push sur https://kinou-dop.github.io/admin/.
  **Données sur `main`** (`data/`), écrites par l'admin via l'API GitHub ; `main` contient aussi les robots (`.github/workflows/`,
  `tools/`, dont copie Slate → Amazon, encodage, vignettes).
- À chaque modification de `admin.js` ou `admin.css` : mettre à jour `?v=` dans `index.html` (l'admin bloque la publication tant
  qu'on n'a pas rechargé la nouvelle version).
- **`admin.js` fait ~550 Ko : ne jamais le lire en entier** : chercher la fonction (grep) puis lire 50 à 150 lignes autour.
- Publication : un seul commit par publication (`commit`), relu sur la dernière version ; **ne jamais écraser ce que les robots ou
  les autres pages ont écrit** (`robotFrom`, `awMerge`, `sharedMerge`) ; enregistrements automatiques par `soon(clé, fn, ms)`.
- Menu de l'admin : website ▸, video club, sorties fiction, festivals ▸, récupération, historique. Taper une lettre hors d'un
  champ écrit dans la recherche de la page (`input.find`).
- Données internes (bandes originales, mots de passe, notes, projets, `bibli/slate.json`) : dépôt privé `notes`, lues avec la clé
  de la personne connectée.

## Règles
- Dépôt **public** : aucune donnée privée ici (mails, contacts, notes, projets → dépôt privé `notes`), jamais de clé ni de secret.
- Ne jamais modifier les URLs Slate / CloudFront (images signées).
- `_headers` garde `Access-Control-Allow-Origin: *` sur `/data/*`.
- Tester dans un navigateur (Playwright, GitHub API simulée) avant de pousser. Commits en français. Pas de pull request sans demande.
