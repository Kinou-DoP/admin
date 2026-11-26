// Accueil de l'admin (hello), historique des publications, navigation latérale
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Accueil de l'admin (Gus 17/11) : juste pour sourire. Logo « kinou admin » = cette page ; la liste des chefs op est sur #/dops.
  function showHello() {
    bar.hidden = true; editing = false; view.textContent = "";
    var h = el("h1", { class: "hello", "aria-label": "Hello la Dream Team !" }), n = 0;
    ["Hello", "la", "Dream", "Team\u00a0!"].forEach(function (w, k, all) {
      var word = el("span", { class: "hw" });
      w.split("").forEach(function (c) { word.appendChild(el("span", { class: "hl", style: "--i:" + (n++) + ";--r:" + ((n * 37) % 13 - 6) + "deg", text: c })); });
      h.appendChild(word); if (k === 1) h.appendChild(el("br")); else if (k < all.length - 1) h.appendChild(document.createTextNode(" ")); // « Hello la / Dream Team ! »
    });
    h.addEventListener("animationend", function (e) { var l = e.target; if (e.animationName === "hDrop") l.classList.add("in"); else l.classList.remove("boing"); });
    h.addEventListener("click", function (e) { var l = e.target.closest(".hl"); if (!l) return; l.classList.remove("boing"); void l.offsetWidth; l.classList.add("boing"); });
    view.appendChild(el("div", { class: "hellobox" }, [h]));
    helloNews();
  }
  // Petit mot sous « Hello la Dream Team ! » (Gus 17/11) : nos films qui sortent cette semaine (lundi → dimanche ; page fiction
  // du site + sorties fiction) et les prix trouvés aujourd'hui par les robots (Nos sélections). Rien à dire : rien d'affiché.
  function helloNews() {
    var box = el("div", { class: "hellonews" }); view.appendChild(box);
    var t = today(), mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (t.getDay() + 6) % 7), sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    var a = sortIso(mon), b = sortIso(sun), td = sortIso(t);
    function day(d) { return dOf(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); }
    Promise.all([
      sortRead().catch(function () { return null; }),
      readFile("data/fiction.json").catch(function () { return null; }),
      selRead().catch(function () { return null; })
    ]).then(function (r) {
      if (!document.body.contains(box)) return; // page quittée entre-temps
      var lines = [];
      // Ordre et taille = importance (Gus 19/11) : sorties de la semaine en grand, puis dates de fiction et bandes-annonces,
      // puis les prix (plus petits : souvent des prix anciens retrouvés par les robots).
      var wk = sortBuild(r[1], null, r[0]).events.filter(function (e) { return e.date >= a && e.date <= b; });
      if (wk.length) lines.push(el("a", { href: "#/sorties", class: "hn hn1" }, [el("span", { class: "hnk", text: wk.length > 1 ? "Sortent cette semaine" : "Sort cette semaine" }),
        wk.map(function (e) { return e.title + " · " + day(e.date) + (e.platforms && e.platforms.length ? " (" + e.platforms.join(", ") + ")" : ""); }).join("  —  ")]));
      var fa = ficAlerts(r[1], r[0]); // date de sortie trouvée ou changée pour un Coming soon de la page fiction
      if (fa.length) lines.push(el("a", { href: "#/fiction", class: "hn hn2" }, [el("span", { class: "hnk", text: fa.length > 1 ? fa.length + " nouvelles dates de sortie" : "Nouvelle date de sortie" }),
        fa.slice(0, 4).map(function (a) { return a.title + " : " + fdate(a.r.date) + " (à vérifier dans fiction)"; }).join("  —  ")]));
      var tn = ((r[0] && r[0].trailers) || []).filter(function (t) { return !t.seen; });
      if (tn.length) lines.push(el("a", { href: "#/sorties", class: "hn hn2" }, [el("span", { class: "hnk", text: tn.length > 1 ? tn.length + " nouvelles bandes-annonces" : "Nouvelle bande-annonce" }),
        tn.slice(0, 4).map(function (t) { return t.title + (t.name ? " : " + t.name : ""); }).join("  —  ") + (tn.length > 4 ? "  …" : "")]));
      // Prix trouvés ces 3 derniers jours (Gus 25/11 : les robots passent souvent le soir, « prix du jour » ne se voyait plus le
      // lendemain matin) ; les plus récents d'abord, « à vérifier » tant qu'ils ne sont pas confirmés.
      var d3 = sortIso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 2));
      var pz = ((r[2] && r[2].found) || []).filter(function (x) { return x.kind === "prize" && x.status !== "no" && x.foundAt && sortIso(new Date(x.foundAt)) >= d3; })
        .sort(function (x, y) { return String(y.foundAt).localeCompare(String(x.foundAt)); });
      var allToday = pz.every(function (x) { return sortIso(new Date(x.foundAt)) === td; });
      if (pz.length) lines.push(el("a", { href: "#/selections", class: "hn hn3" }, [el("span", { class: "hnk", text: (pz.length > 1 ? pz.length + " prix trouvés" : "Prix trouvé") + (allToday ? " aujourd'hui" : " ces derniers jours") }),
        pz.slice(0, 4).map(function (x) { return x.title + " : " + (x.prize || "prix") + (x.festName ? ", " + x.festName : "") + (x.edition ? " " + x.edition : "") + ((x.dops || []).length ? " (" + x.dops.map(rcBase).join(", ") + ")" : "") + (x.status === "new" ? " · à vérifier" : ""); }).join("  —  ") + (pz.length > 4 ? "  …" : "")]));
      lines.forEach(function (l) { box.appendChild(l); });
    });
  }

  // ---------- Historique des publications ----------
  // Petite fenêtre (lien « historique » du menu) : derniers commits de data/ sur GitHub = qui a publié quoi et quand.
  // Sur une fiche / l'accueil / le contact : l'historique de ce fichier, avec un bouton pour tout voir.
  var histBox = document.getElementById("hist"), histAll = false;
  // Sources de l'historique : [dépôt, chemin]. Les pages festivals, nos sélections, récupération et sorties fiction enregistrent
  // dans le dépôt privé notes (Gus 17/11 : on ne voyait pas leurs changements) ; une fiche : aussi ses notes internes.
  var HIST_NOTES = ["festivals/festivals.json", "festivals/selections.json", "projets/projets.json", "sorties/sorties.json", "dps"];
  function histPath() {
    var h = location.hash;
    if (/^#\/dp\//.test(h)) { var sl = decodeURIComponent(h.slice(5)); return [[REPO, "data/dps/" + sl + ".json"], [NOTES_REPO, "dps/" + sl + ".md"]]; }
    var one = { "#/home": [REPO, "data/home.json"], "#/contact": [REPO, "data/contact.json"], "#/spotlight": [REPO, "data/spotlight.json"],
      "#/fiction": [REPO, "data/fiction.json"], "#/festivals": [NOTES_REPO, "festivals/festivals.json"], "#/selections": [NOTES_REPO, "festivals/selections.json"],
      "#/recup": [NOTES_REPO, "projets/projets.json"], "#/sorties": [NOTES_REPO, "sorties/sorties.json"] }[h];
    return one ? [one] : null;
  }
  function histAllSrc() { return [[REPO, "data"]].concat(HIST_NOTES.map(function (p) { return [NOTES_REPO, p]; })); }
  function histWho(c) {
    var m = /\(admin, ([^)]+)\)\s*$/.exec(c.commit.message.split("\n")[0]);
    if (m) return m[1];
    if (/kinou-robot|github-actions/.test(c.commit.author.name || "")) return "robot GitHub";
    return (c.author && c.author.login) || c.commit.author.name || "?";
  }
  function histWhen(d) {
    return new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function histShow() {
    var path = histAll ? null : histPath(), list = el("ol", { class: "hlist" }, [el("li", { class: "hint", text: "Chargement…" })]);
    var mode = el("button", { type: "button", class: "hmode", text: path ? "Tout voir" : (histPath() ? "Cette page seulement" : "") });
    mode.hidden = !histPath();
    mode.addEventListener("click", function () { histAll = !histAll; histShow(); });
    var close = el("button", { type: "button", class: "hclose", "aria-label": "Fermer", text: "×" });
    close.addEventListener("click", histToggle);
    histBox.textContent = "";
    histBox.appendChild(el("div", { class: "hhead" }, [el("strong", { text: path ? "Historique de cette page" : "Historique des publications" }), mode, close]));
    histBox.appendChild(list);
    var src = path || histAllSrc();
    Promise.all(src.map(function (x) {
      return gh("/repos/" + x[0] + "/commits?" + (x[0] === REPO ? "sha=" + BRANCH + "&" : "") + "per_page=40&path=" + encodeURIComponent(x[1]))
        .catch(function () { return []; }); // dépôt notes sans accès : on montre le reste
    })).then(function (all) {
      var seen = {}, cs = [];
      all.forEach(function (l) { (l || []).forEach(function (c) { if (!seen[c.sha]) { seen[c.sha] = 1; cs.push(c); } }); });
      cs.sort(function (a, b) { return b.commit.author.date.localeCompare(a.commit.author.date); });
      list.textContent = "";
      // Demandes au robot et réponses, prénoms des clés : pas des publications.
      cs = cs.filter(function (c) { return !/^(Slate : |Équipe : |Bande : |Bandes : )|demande au robot|réponse du robot/.test(c.commit.message); }).slice(0, 50);
      if (!cs.length) list.appendChild(el("li", { class: "hint", text: "Aucune publication." }));
      cs.forEach(function (c) {
        var msg = c.commit.message.split("\n")[0].replace(/\s*\(admin, [^)]+\)\s*$/, "");
        list.appendChild(el("li", {}, [
          el("div", { class: "hmeta" }, [el("span", { class: "hwho", text: histWho(c) }), el("span", { text: histWhen(c.commit.author.date) })]),
          el("a", { href: c.html_url, target: "_blank", rel: "noopener", text: msg })
        ]));
      });
    }).catch(function (e) { list.textContent = ""; list.appendChild(el("li", { class: "hint", text: e.message })); });
  }
  function histToggle(e) {
    if (e && e.preventDefault) e.preventDefault();
    histBox.hidden = !histBox.hidden;
    document.getElementById("histlink").classList.toggle("on", !histBox.hidden);
    if (!histBox.hidden) { histAll = false; histShow(); }
  }
  document.getElementById("histlink").addEventListener("click", histToggle);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !histBox.hidden && !document.querySelector(".vedit")) histToggle(); });
  window.addEventListener("hashchange", function () { if (!histBox.hidden) { histAll = false; histShow(); } });

  // ---------- Navigation ----------
  // Menu en rubriques : clic sur « website » / « festivals » = déroule ses sous-rubriques (une seule rubrique ouverte à la fois).
  function sideOpen(g, only) {
    side.querySelectorAll(".sgroup[data-group], .ssub").forEach(function (x) {
      var me = x.dataset.group === g;
      x.classList.toggle("open", me ? (only ? true : !x.classList.contains("open")) : false);
    });
    subX();
  }
  // Téléphone (menu à l'horizontale) : la ligne des sous-rubriques commence sous sa rubrique (Gus 18/11), pas au bord gauche.
  function subX() {
    // Ligne des sous-rubriques placée juste sous la ligne de sa rubrique (pas sous toutes les rubriques) : ce qui est sur les lignes
    // suivantes passe après elle (ordre CSS), Gus 18/11.
    var kids = [].slice.call(side.children), narrow = matchMedia("(max-width: 900px)").matches;
    kids.forEach(function (k) { k.style.order = k.classList.contains("ssub") ? "99" : ""; });
    var open = narrow && side.querySelector(".ssub.open"), ob = open && side.querySelector("button.sgroup[data-group='" + open.dataset.group + "']");
    if (ob) {
      var top = ob.offsetTop;
      kids.forEach(function (k) { if (!k.classList.contains("ssub")) k.style.order = k.classList.contains("histlink") ? "40" : k.offsetTop > top + 4 ? "30" : "0"; });
      open.style.order = "10";
    } else if (!narrow) kids.forEach(function (k) { k.style.order = ""; });
    side.querySelectorAll(".ssub").forEach(function (x) {
      var b = side.querySelector("button.sgroup[data-group='" + x.dataset.group + "']");
      var dx = b ? b.getBoundingClientRect().left - side.getBoundingClientRect().left - parseFloat(getComputedStyle(side).paddingLeft || 0) : 0;
      x.style.setProperty("--subx", Math.max(0, Math.min(dx, side.clientWidth * .45)) + "px");
    });
  }
  window.addEventListener("resize", subX);
  side.querySelectorAll("button.sgroup").forEach(function (b) { b.addEventListener("click", function () { sideOpen(b.dataset.group); }); });
