// Routeur (#/…), garde-fous de sortie, démarrage
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  var bibOpen = null; // #/bibli/video, #/bibli/images : video club + fenêtre d'import (lien ouvert dans un autre onglet)
  function route() {
    var h = location.hash, bo = /^#\/bibli\/(video|images)$/.exec(h);
    if (bo) { bibOpen = bo[1]; h = "#/bibli"; try { history.replaceState(null, "", "#/bibli"); } catch (e) {} }
    document.getElementById("back").hidden = !token || !/^#\/(dp\/|new)/.test(h);
    var page = /^#\/(home|spotlight|fiction|press|contact|festivals|selections|sorties|recup|bibli)$/.test(h) ? h.slice(2) : /^#\/(dops|dp\/.*|new)$/.test(h) ? "cinematographers" : "hello";
    side.hidden = !token;
    document.body.classList.remove("bibpage");
    if (token && !festTried) { festTried = true; festLoad().then(festBadge, function () {}); } if (token && !ficTried) { ficTried = true; ficBadgeLoad(); } // pastille « fiction » : autre date de sortie trouvée // pastille du menu (dates limites proches)
    side.querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.page === page); });
    var cur = side.querySelector("a.on"), grp = cur && cur.closest(".ssub");
    // Rubrique de la page ouverte : dépliée et sélectionnée ; page hors rubrique (sorties, récupération…) : tout est replié (Gus 18/11).
    sideOpen(grp ? grp.dataset.group : null, true);
    side.querySelectorAll("button.sgroup").forEach(function (b) { b.classList.toggle("on", !!grp && b.dataset.group === grp.dataset.group); });
    if (!token) return showLogin();
    // Clé sans droit d'écriture sur le site (Gus 17/11) : rubrique website visible en lecture seule (champs grisés, pas de
    // « Publier », bandeau « Lecture seule »). Les notes internes d'une fiche (dépôt notes) restent modifiables.
    document.body.classList.toggle("webpage", page === "cinematographers" || /^(home|contact|spotlight|fiction|press)$/.test(page));
    if (/^#\/dp\//.test(h)) return showDP(decodeURIComponent(h.slice(5)));
    if (h === "#/new") return showDP(null);
    if (page === "home") return showHome();
    if (page === "contact") return showContact();
    if (page === "spotlight") return showSpot();
    if (page === "fiction") return showFic();
    if (page === "press") return showSoon("Press");
    if (page === "festivals") return showFestivals();
    if (page === "selections") return showFestSel();
    if (page === "sorties") return showSorties();
    if (page === "recup") return showRecup();
    if (page === "bibli") return showBibli();
    if (page === "hello") return showHello();
    showList();
  }
  // Quitter la fiche (retour, autre page, rechargement) avec des modifications non publiées : on demande confirmation.
  var here = location.hash;
  window.addEventListener("hashchange", function () {
    if (!token) return;
    if (dirty && !window.confirm("Des modifications ne sont pas publiées. Quitter quand même (elles seront perdues) ?")) { history.replaceState(null, "", here || "#/"); return; }
    if (!dirty && formsDirty() && !window.confirm("Un formulaire ouvert n'est pas enregistré. Quitter quand même (les changements seront perdus) ?")) { history.replaceState(null, "", here || "#/"); return; }
    dirty = false; here = location.hash; flushSaves(); route();
  });
  // Fermer / recharger l'onglet : modifications pas publiées, formulaire ouvert, ou enregistrement en cours / prévu (que l'on
  // lance tout de suite) → le navigateur demande confirmation.
  window.addEventListener("beforeunload", function (e) {
    var wait = savesPending(); flushSaves();
    if (dirty || formsDirty() || wait) { e.preventDefault(); e.returnValue = ""; }
  });

  var saved = store(true);
  if (saved) login(saved).then(route, function () { store(false, null); showLogin("Token expiré ou révoqué : reconnectez-vous."); });
  else showLogin();
