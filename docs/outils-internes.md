# Accueil de l'admin, sorties fiction, festivals et sélections, récupération, historique (admin)

Note de tâche : à lire seulement quand la tâche touche ce sujet. Règles générales : `CLAUDE.md`.

- **Accueil de l'admin** (`#/`, `showHello`) : « Hello la Dream Team ! » + petit mot par ordre d'importance (`helloNews` : sorties de
  la semaine, dates de fiction trouvées / bandes-annonces, prix trouvés ces 3 derniers jours, « à vérifier » s'ils ne sont pas confirmés).
- **Sorties fiction** (`#/sorties`) : calendrier mois / semaine (page fiction + `notes/sorties/sorties.json` + films sans date de
  `projets.json`), bandes-annonces à voir (pastille), confirmer / masquer / ajouter une sortie. **Dates qui ne s'accordent pas** (Gus
  23/11, `sortConflicts`) : sources TMDB / Wikidata / AlloCiné (Claude) différentes, ou date confirmée (`human`) contredite par un robot
  → pastille + encadré « Date de sortie à vérifier » : « C'est cette date » / « Utiliser cette date » (date confirmée, autres dates
  retenues dans `seenDates`), « Garder la nôtre » ; une nouvelle date fait revenir l'alerte. Calendrier : date confirmée seule.
  Page fiction : `ficAlerts` compare toutes les sources, `datesSeen` = dates refusées (« Garder la nôtre »).
- **Festivals** : **dates** (`#/festivals`, `notes/festivals/festivals.json` ; ce que l'équipe a saisi n'est jamais modifié par le
  robot, désaccords = triangle orange) et **nos sélections** (`#/selections`, `notes/festivals/selections.json` : à vérifier ✓ / ✗,
  onglets « Toutes nos sélections » / « Récent », écartées en deux groupes « Pas nous » et « Doublons » (`dupOf` = version gardée,
  « Pas un doublon ») ; les prix confirmés vont tout seuls dans `info.awards` des films sur le site, `awardsSync`). **Prix sans film sur
  le site** (Gus 22/11) : triangle orange « ! » quand la trouvaille ne retrouve aucun film des fiches ni de la page fiction (`placed`,
  même rapprochement par le titre qu'`awardsSync`), catégorie **« Sans lien »**, bouton **« Relier à un film »** (`linkForm` : un ou
  plusieurs films de la bibliothèque, autres trouvailles du même film reliées aussi) → `links: [{ page, slate, title }]` dans la
  trouvaille ; une trouvaille reliée ne va **que** sur ces films (`awFor`). `awApply` n'ajoute pas une ligne déjà écrite **à la main**
  autrement (`awSameText` : même année, même festival, sélection ↔ sélection, prix ↔ même nom de prix) et ne retire pas une ligne
  dont le texte est aussi celui d'une autre trouvaille confirmée (doublon écarté).
- **Récupération** (`#/recup`, `notes/projets/projets.json`) : statut de récupération par film, à relancer, par production, mails.
- **Historique** : derniers commits des données (admin et notes) avec qui / quand / quoi.
