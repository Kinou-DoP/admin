# admin kinou

Interface d'administration de kinou.fr et données du site (`data/`).

- Ouvrir l'admin : adresse Netlify de ce repo, se connecter avec son token GitHub personnel
  (instructions affichées à l'écran de connexion).
- Test en local : `python3 -m http.server 8766` puis http://localhost:8766.
- Détails techniques : voir `CLAUDE.md` et les notes par sujet dans `docs/`.

## À faire plus tard
- Quand la beta sera fusionnée dans le site officiel : passer la constante `SITE` de `assets/js/admin.js` (noyau)
  de la beta à l'adresse officielle (kinou.fr).
- Photo de survol de la liste des chefs op, choix des slides de l'accueil.
- Réordonner la liste des chefs op à la main.
- Signaler les corrections orphelines (film supprimé puis remis sur Slate).
- Connexion par bouton « Se connecter avec GitHub » (au lieu du token collé).
- Video club : **encodage plus rapide des vignettes** prises dans une vidéo (aujourd'hui ≈ 1 min par le robot quand la capture directe n'est pas possible :
  ajouter l'en-tête CORS sur CloudFront, ou un petit service de capture) — à faire.
- Video club : **fluidité en mode edit des vidéos** (sauter d'image en image, choisir une vignette) : version « de travail » légère avec une image-clé
  chaque seconde (nouveaux imports, puis les anciens) — à faire.
- Migrer tout ce qui dépend encore de Slate (voir l'état dans `docs/video-club.md`) — à faire juste après.

