// Page du site : fiction
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Fiction (data/fiction.json) ----------
  // Comme le spotlight (bande Slate lue en entier par le robot GitHub : `films`), mais les onglets se règlent à la main, film par
  // film (overrides[id]) : status new | soon | past (défaut past), genre (films sortis), date (AAAA-MM-JJ, carré blanc au survol
  // dans NEW RELEASES et COMING SOON), poster (affiche déposée ici → data/fiction/<id>-<horodatage>.webp).
  var fic = null, FIC_STATUS = [["new", "New release"], ["soon", "Coming soon"], ["past", "Past release"]];
  var FIC_GENRES = ["FEATURE FILM", "SERIES", "DOCUMENTARY", "SHORT FILM"];
  function showFic() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([readFile("data/fiction.json"), sortRead().catch(function () { return null; })]).then(function (r) {
      var s = r[0]; ficSort = r[1];
      fic = s || { reel: "", overrides: {}, films: [] }; fic.overrides = fic.overrides || {};
      ficAutoOut();
      pending = {}; dirty = false; histReset(); ovBase = sharedSnap(fic.overrides); curCat = null; renderFic();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  var FIC_TABS = { new: "NEW RELEASES", soon: "COMING SOON", past: "PAST RELEASES" };
  function ficSlate() {
    var clips = (fic.films || []).map(function (f, i) {
      var st = (fic.overrides[f.slate] || {}).status || "past";
      return Object.assign({}, f, { cat: FIC_TABS[st], featuredOrder: i + 1 });
    });
    return { name: "Fiction", categories: ["NEW RELEASES", "COMING SOON", "PAST RELEASES"], clips: clips };
  }
  // Infos d'un film (Gus 04/11) : année, épisodes, durée, format d'image, plateformes, caméra, optiques, prix & sélections,
  // synopsis → overrides[<id>].info (texte libre, champs vides absents). Sur le site : dans le lecteur, sous les crédits
  // (et la ligne année | durée | format dans la présentation vidéo + stills). Bloc replié ; son titre dit combien sont remplies.
  var INFO_FIELDS = [["year", "Année", "2025"], ["episodes", "Épisodes", "8 (séries)"], ["runtime", "Durée", "90 min"], ["ratio", "Format d'image", "1.85"],
    ["platforms", "Plateformes", "Netflix, Canal+"], ["camera", "Caméra", "ALEXA 35"], ["lenses", "Optiques", "Cooke S4"],
    ["starring", "Starring (acteurs)", "Noms séparés par des virgules", 0, true], // Gus 18/11 : sur le site, ligne STARRING avant caméra / optiques
    ["synopsis", "Synopsis (français)", "Une ligne vide entre deux paragraphes", 5], ["synopsisEn", "Synopsis (anglais)", "Sur le site : l'anglais d'abord, avec un choix EN / FR si les deux sont remplis", 5]];
  // Prix & sélections du film (Gus 17/11), sous la vidéo : une ligne par prix (ajoutées à la main ou depuis « Nos sélections »),
  // texte modifiable, œil = affichée / masquée sur le site (masquées : `info.awardsHidden`, le site ne lit que `info.awards`),
  // × = retirée (une ligne des robots retirée n'est pas remise). Une ligne corrigée garde son lien avec la trouvaille (`awardsFrom`).
  function awardsCtl(c) {
    function cur() { return (state.overrides[c.slate] || {}).info || {}; }
    var box = el("div", { class: "awbox" }), list = el("div", { class: "awlist" });
    function lines() { return String(cur().awards || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function save(vis, hid, ren) {
      var i = Object.assign({}, cur());
      vis = vis.map(function (x) { return x.trim(); }).filter(Boolean); hid = hid.map(function (x) { return x.trim(); }).filter(Boolean);
      if (vis.length) i.awards = vis.join("\n"); else delete i.awards;
      if (hid.length) i.awardsHidden = hid; else delete i.awardsHidden;
      if (ren && i.awardsFrom) { var f = Object.assign({}, i.awardsFrom); Object.keys(f).forEach(function (k) { if (f[k] === ren[0]) f[k] = ren[1]; }); i.awardsFrom = f; }
      setOverride(c, "info", Object.keys(i).length ? i : undefined); touch();
    }
    function draw() {
      list.textContent = "";
      var vis = lines(), hid = (cur().awardsHidden || []).slice(), from = cur().awardsFrom || {}, robot = {};
      Object.keys(from).forEach(function (k) { robot[from[k]] = 1; });
      function row(t, k, hidden) {
        var inp = el("input", { type: "text", value: t, title: t, placeholder: "Prix, Festival 2026" }), last = t;
        inp.addEventListener("change", function () {
          var v = inp.value.trim(), a = lines(), h = (cur().awardsHidden || []).slice(), arr = hidden ? h : a, j = arr.indexOf(last);
          if (j < 0) return; if (v) arr[j] = v; else arr.splice(j, 1);
          save(a, h, v ? [last, v] : null); last = v; if (!v) draw();
        });
        var eye = el("button", { type: "button", class: "aweye" + (hidden ? " off" : ""), title: hidden ? "Masqué sur le site : cliquer pour l'afficher" : "Affiché sur le site : cliquer pour le masquer", text: hidden ? "masqué" : "affiché" });
        eye.addEventListener("click", function () {
          var a = lines(), h = (cur().awardsHidden || []).slice();
          if (hidden) { h.splice(h.indexOf(last), 1); a.push(last); } else { a.splice(a.indexOf(last), 1); h.push(last); }
          save(a, h); draw();
        });
        var del = el("button", { type: "button", class: "awdel", title: "Retirer", text: "×" });
        del.addEventListener("click", function () {
          var a = lines(), h = (cur().awardsHidden || []).slice(), arr = hidden ? h : a, j = arr.indexOf(last);
          if (j > -1) arr.splice(j, 1); save(a, h); draw();
        });
        return el("div", { class: "awrow" + (hidden ? " off" : "") }, [eye, inp, robot[t] ? el("span", { class: "awbot", title: "Ajouté depuis Nos sélections", text: "robot" }) : null, del]);
      }
      vis.forEach(function (t, k) { list.appendChild(row(t, k, false)); });
      hid.forEach(function (t, k) { list.appendChild(row(t, k, true)); });
      head.textContent = "Prix & sélections" + (vis.length + hid.length ? " · " + vis.length + (hid.length ? " (+ " + hid.length + " masqué" + (hid.length > 1 ? "s" : "") + ")" : "") : "");
    }
    var head = el("span", { class: "label" });
    var add = el("button", { type: "button", class: "awadd", text: "+ Ajouter" });
    add.addEventListener("click", function () {
      var v = window.prompt("Prix ou sélection (ex. « Best Cinematography, Festival 2026 »)");
      if (!v || !v.trim()) return; var a = lines(); a.push(v.trim()); save(a, (cur().awardsHidden || []).slice()); draw();
    });
    box.appendChild(el("div", { class: "awhead" }, [head, add])); box.appendChild(list);
    draw();
    return box;
  }
  function infoCtl(c) {
    function cur() { return (state.overrides[c.slate] || {}).info || {}; }
    var sum = el("summary"), grid = el("div", { class: "infogrid" }), box = el("details", { class: "infobox" }, [sum, grid]);
    function count() { var n = Object.keys(cur()).filter(function (k) { return !/^(awards|auto)/.test(k); }).length; sum.textContent = "Infos du film" + (n ? " · " + n + " renseignée" + (n > 1 ? "s" : "") : ""); }
    INFO_FIELDS.forEach(function (f) {
      if (f[0] === "platforms" && state === fic) return; // fiction : plateformes déjà réglées plus haut (étiquettes)
      var inp = f[3] ? el("textarea", { rows: String(f[3]), placeholder: f[2] }) : el("input", { type: "text", placeholder: f[2] });
      inp.value = cur()[f[0]] || "";
      var lab = el("span", { class: "label", text: f[1] });
      if ((cur().auto || []).indexOf(f[0]) > -1) { inp.classList.add("auto"); lab.appendChild(el("em", { class: "autotag", text: " · robot, à vérifier" })); }
      inp.addEventListener("input", function () {
        var i = Object.assign({}, cur()), v = inp.value.trim();
        if (v) i[f[0]] = v; else delete i[f[0]];
        if (i.auto) { i.auto = i.auto.filter(function (k) { return k !== f[0]; }); if (!i.auto.length) { delete i.auto; delete i.autoSrc; } } // modifié à la main = vérifié
        inp.classList.remove("auto"); var tg = lab.querySelector(".autotag"); if (tg) tg.remove();
        setOverride(c, "info", Object.keys(i).length ? i : undefined); count();
      });
      grid.appendChild(el("label", { class: "ifield" + (f[3] || f[4] ? " wide" : "") }, [lab, inp]));
    });
    if ((cur().auto || []).length) { // infos remplies par le robot : sources + « tout est bon »
      var src = cur().autoSrc || [], ok = el("button", { type: "button", class: "btn ghost", text: "Vérifié, tout est bon" });
      ok.addEventListener("click", function () { var i = Object.assign({}, cur()); delete i.auto; delete i.autoSrc; setOverride(c, "info", i); touch(); box.replaceWith(infoCtl(c)); });
      grid.appendChild(el("div", { class: "ifield wide autobox" }, [el("span", { class: "hint", text: "Champs en orange : trouvés par le robot, à vérifier." + (src.length ? " Sources : " : "") }),
        el("span", {}, src.map(function (u, i) { return el("a", { href: u, target: "_blank", rel: "noopener", text: (i ? " · " : "") + u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] + " ↗" }); })), ok]));
      box.open = true;
    }
    count();
    return box;
  }
  // NEW RELEASES : 9 films au plus (Gus 04/11). Au-delà, les plus anciens (date de sortie ; sans date = tout juste ajouté, donc
  // gardé) passent tout seuls en Past release. Même règle que le site (ficToDP), qui l'applique aussi à l'affichage.
  var FIC_NEW_MAX = 9;
  function ficNewOrder() {
    var films = fic.films || [];
    return films.map(function (f, i) { return { f: f, i: i, o: fic.overrides[f.slate] || {} }; })
      .filter(function (x) { return x.o.status === "new"; })
      .sort(function (a, b) { return (b.o.date || "9999") < (a.o.date || "9999") ? -1 : (b.o.date || "9999") > (a.o.date || "9999") ? 1 : a.i - b.i; });
  }
  // Film poussé en Past release par cette règle : marqué `autoPast`. Si une place se libère (un New release passe en Coming soon…),
  // le plus récent d'entre eux revient tout seul en New release (Gus 04/11 : sinon 8 New releases après un aller-retour).
  // Date de sortie trouvée par les robots (Sorties fiction : TMDB, Claude) ou ajoutée au calendrier, différente de celle de la page
  // fiction, pour un film Coming soon (ou New release à venir) : avertissement sous le film + pastille sur « fiction » (Gus 18/11).
  // La page fiction ne change jamais toute seule : « Utiliser cette date » ou « Garder la nôtre » (`dateSeen` = date vue, pas sur le site).
  var ficSort = null;
  function ficAlerts(f0, so) {
    if (!f0 || !so) return [];
    var ov = f0.overrides || {}, out = [], today = sortIso(new Date());
    (f0.films || []).forEach(function (f) {
      var o = ov[f.slate] || {}, st = o.status || "past";
      if (!(st === "soon" || (st === "new" && o.date && o.date > today))) return;
      var t = ficTitle(f.title), hits = (so.releases || []).filter(function (r) { return r.date && (String(r.slate || "") === String(f.slate) || sortSame(t, r.title)); });
      if (!hits.length) return;
      hits.sort(function (a, b) { return ((a.country || "France") === "France" ? 0 : 1) - ((b.country || "France") === "France" ? 0 : 1) || (a.date < b.date ? -1 : 1); });
      // Plusieurs sources (TMDB, Wikidata, AlloCiné… Gus 23/11) : alerte pour la 1re date qui n'est ni la nôtre ni déjà refusée
      // (« Garder la nôtre » retient toutes les dates refusées : une nouvelle date fait revenir l'alerte).
      var no = [].concat(o.dateSeen || [], o.datesSeen || []);
      var r = hits.filter(function (h) { return h.date !== o.date && no.indexOf(h.date) < 0; })[0];
      if (r) out.push({ slate: f.slate, title: t, r: r, all: hits });
    });
    return out;
  }
  function ficBadge() {
    var n = ficAlerts(fic, ficSort).length;
    ['a[data-page="fiction"]', '.sgroup[data-group="website"]'].forEach(function (q) {
      var a = side.querySelector(q); if (!a) return;
      var b = a.querySelector(".nbadge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = el("span", { class: "nbadge" }); a.appendChild(b); }
      b.textContent = n; b.title = "Fiction : date de sortie différente trouvée dans Sorties fiction";
    });
  }
  function ficBadgeLoad() {
    Promise.all([readFile("data/fiction.json"), sortRead()]).then(function (r) { if (!fic) fic = r[0]; ficSort = r[1]; ficBadge(); sortBadge(); }, function () {});
  }
  function ficDateWarn(c) {
    var a = ficAlerts(fic, ficSort).filter(function (x) { return String(x.slate) === String(c.slate); })[0];
    if (!a) return null;
    var r = a.r, o = fic.overrides[c.slate] || {}, src = sortSrc(r);
    var others = {}; (a.all || []).forEach(function (h) { if (h !== r) (others[h.date] = others[h.date] || []).push(sortSrc(h)); });
    var use = el("button", { type: "button", class: "btn", text: "Utiliser cette date" }), keep = el("button", { type: "button", class: "btn ghost", text: o.date ? "Garder la nôtre" : "Ignorer" });
    use.addEventListener("click", function () { setOverride(c, "date", r.date); setOverride(c, "dateSeen"); touch(); var y = window.scrollY; ficCapNew(); slate = ficSlate(); renderFic(); window.scrollTo(0, y); ficBadge(); });
    keep.addEventListener("click", function () { var l = [].concat(o.datesSeen || [], o.dateSeen ? [o.dateSeen] : []); if (l.indexOf(r.date) < 0) l.push(r.date); setOverride(c, "datesSeen", l); setOverride(c, "dateSeen"); touch(); box.remove(); ficBadge(); });
    var box = el("div", { class: "fdwarn" }, [
      el("p", {}, [el("b", { text: "! " }), (o.date ? "Autre date trouvée : " : "Date trouvée : ") + fdate(r.date) + " (" + (SK[r.kind] || r.kind || "") + (r.platform ? " · " + r.platform : "") + (r.country ? ", " + r.country : "") + " ; " + src + ")" + (o.date ? ". Chez nous : " + fdate(o.date) + "." : ".") + " ",
        r.url ? el("a", { href: r.url, target: "_blank", rel: "noopener", text: "Source ↗" }) : ""]),
      Object.keys(others).length ? el("p", { class: "hint", text: "Autres sources : " + Object.keys(others).sort().map(function (d) { return fdate(d) + (d === o.date ? " (la nôtre)" : "") + " — " + others[d].join(", "); }).join(" ; ") }) : null,
      el("div", { class: "fdbtns" }, [use, keep])]);
    return box;
  }
  // Coming soon → New release tout seul le jour de la sortie, dès 9 h (heure de Paris) : le site le fait de lui-même (ficStatus
  // dans app.js) ; l'admin l'applique à l'ouverture de la page fiction et l'écrit à la prochaine publication (Gus 18/11).
  function ficOut(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return false;
    var now; try { now = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).format(new Date()); } catch (e) { now = new Date().toISOString().slice(0, 13).replace("T", " "); }
    return now.slice(0, 10) > d || (now.slice(0, 10) === d && +now.slice(11, 13) >= 9);
  }
  function ficAutoOut() {
    state = fic; // setOverride travaille sur state.overrides
    var out = (fic.films || []).filter(function (f) { var o = fic.overrides[f.slate] || {}; return o.status === "soon" && ficOut(o.date); })
      .map(function (f) { setOverride(f, "status", "new"); setOverride(f, "autoPast"); return f.title; });
    if (!out.length) return;
    ficCapNew();
    flash = "Sorti" + (out.length > 1 ? "s" : "") + " : « " + out.join(" », « ") + " » passe" + (out.length > 1 ? "nt" : "") + " en New release (déjà le cas sur le site ; écrit à la prochaine publication)." + (flash ? " " + flash : "");
  }
  function ficCapNew() {
    var out = ficNewOrder().slice(FIC_NEW_MAX).map(function (x) { setOverride(x.f, "status"); setOverride(x.f, "autoPast", true); return x.f.title; });
    var back = [], n = ficNewOrder().length;
    (fic.films || []).map(function (f, i) { return { f: f, i: i, o: fic.overrides[f.slate] || {} }; })
      .filter(function (x) { return x.o.autoPast && (x.o.status || "past") === "past"; })
      .sort(function (a, b) { return (b.o.date || "9999") < (a.o.date || "9999") ? -1 : (b.o.date || "9999") > (a.o.date || "9999") ? 1 : a.i - b.i; })
      .forEach(function (x) { if (n >= FIC_NEW_MAX) return; setOverride(x.f, "autoPast"); setOverride(x.f, "status", "new"); back.push(x.f.title); n++; });
    var msg = [];
    if (out.length) msg.push("9 New releases au plus : « " + out.join(" », « ") + " » passe" + (out.length > 1 ? "nt" : "") + " en Past release.");
    if (back.length) msg.push("« " + back.join(" », « ") + " » revien" + (back.length > 1 ? "nent" : "t") + " en New release.");
    if (msg.length) flash = msg.join(" ");
    return out.length + back.length;
  }
  // Réglages propres à la fiction, sous le titre d'un film : statut, genre, date de sortie, affiche.
  function ficCtl(c) {
    var warn = null;
    function o() { return fic.overrides[c.slate] || {}; }
    var stSel = el("select", { class: "nodirty" }), genre = el("select", { class: "nodirty" });
    // Statut : on choisit New release ou Coming soon ; Past release se fait tout seul (plus de 9 New releases), et ne s'affiche
    // que pour les films déjà passés (Gus 04/11).
    FIC_STATUS.forEach(function (x) {
      if (x[0] === "past" && (o().status || "past") !== "past") return;
      var op = el("option", { value: x[0], text: x[1] }); if ((o().status || "past") === x[0]) op.selected = true; stSel.appendChild(op);
    });
    [["", "Genre…"]].concat(FIC_GENRES.map(function (g) { return [g, g.charAt(0) + g.slice(1).toLowerCase()]; })).forEach(function (x) {
      var op = el("option", { value: x[0], text: x[1] }); if ((o().genre || "") === x[0]) op.selected = true; genre.appendChild(op);
    });
    var date = el("input", { type: "date", class: "nodirty", value: o().date || "" });
    stSel.addEventListener("change", function () {
      setOverride(c, "status", stSel.value === "past" ? undefined : stSel.value); setOverride(c, "autoPast"); touch(); // choix à la main : plus « automatique »
      var y = window.scrollY; ficCapNew(); slate = ficSlate(); renderFic(); window.scrollTo(0, y); // le film change d'onglet ; le 10e New release passe en Past release
    });
    genre.addEventListener("change", function () { setOverride(c, "genre", genre.value || undefined); touch(); });
    date.addEventListener("change", function () {
      setOverride(c, "date", date.value || undefined); touch();
      var w2 = ficDateWarn(c); if (warn) warn.replaceWith(w2 || el("span")); warn = w2; ficBadge(); // avertissement « autre date trouvée » à jour
      if (o().status === "new" && ficCapNew()) { var y = window.scrollY; slate = ficSlate(); renderFic(); window.scrollTo(0, y); }
    });
    // Plateformes (Netflix, Canal+…) : un mot + Entrée = une étiquette ; × pour la retirer. Sur le site, en haut à gauche
    // de la vignette après le genre (« FEATURE FILM · NETFLIX »), au survol / à la sélection.
    var plats = el("div", { class: "plats" }), pin = el("input", { type: "text", class: "nodirty", placeholder: "Plateforme + Entrée" });
    function drawPlats() {
      plats.textContent = "";
      (o().platforms || []).forEach(function (w, i) {
        var x = el("button", { type: "button", text: "×", title: "Retirer" });
        x.addEventListener("click", function () { var a = (o().platforms || []).slice(); a.splice(i, 1); setOverride(c, "platforms", a.length ? a : undefined); drawPlats(); touch(); });
        plats.appendChild(el("span", { class: "plat" }, [w, x]));
      });
      plats.appendChild(pin);
    }
    pin.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return; e.preventDefault();
      var w = pin.value.trim(); if (!w) return;
      var a = (o().platforms || []).slice(); if (a.indexOf(w) < 0) a.push(w);
      setOverride(c, "platforms", a); pin.value = ""; drawPlats(); touch(); pin.focus();
    });
    drawPlats();
    function posterDrop() {
      var p = (pending.posters || {})[c.slate], cur = o().poster;
      var z = dropZone("image/*", "Affiche (glissez ou cliquez)", function (f) {
        status("Compression de l'affiche…");
        compress(f).then(function (r) { pending.posters = pending.posters || {}; pending.posters[c.slate] = r; z.replaceWith(posterDrop()); touch(); status(""); }, function (e) { status(e.message, "err"); });
      }, function () { if (pending.posters) delete pending.posters[c.slate]; setOverride(c, "poster"); z.replaceWith(posterDrop()); touch(); },
        p ? "Nouvelle affiche" : cur ? "Affiche" : "", p ? p.preview : null);
      z.classList.add("poster");
      if (!p && cur) fetch("https://api.github.com/repos/" + REPO + "/contents/data/" + cur + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) { if (b) z.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)), url("' + URL.createObjectURL(b) + '")'; });
      return z;
    }
    warn = ficDateWarn(c);
    return el("div", { class: "ficctl" }, [el("div", {}, [el("div", { class: "ficrow" }, [stSel, genre, date]), warn || "", plats]), posterDrop()]);
  }
  function renderFic() {
    view.textContent = ""; editing = true; pagePublish = publishFic;
    state = fic; slate = ficSlate(); isNew = false; listed = true; // filmCard et setOverride travaillent sur state.overrides
    histInit({ get: function () { return { data: fic, refs: Object.assign({}, pending) }; }, set: function (h) { fic = JSON.parse(h.data); pending = Object.assign({}, h.refs); renderFic(); } });
    view.appendChild(el("h1", { text: "Fiction" }));
    view.appendChild(el("button", { type: "button", class: "btn primary selbtn", text: "Modifier la sélection", on: { click: function () {
      pageSel("Fiction", fic.films || [], function (l) { fic.films = l.map(function (f) { return f.cats ? f : pageFilm(f); }); delete fic.reel; delete fic.readError; }, publishFic, renderFic, true);
    } } }));
    view.appendChild(el("p", { class: "lead", text: "Une bande Slate des films de fiction. Pour chaque film : son onglet (New release, Coming soon, Past release), son genre et ses plateformes (affichés à la sélection), , sa date de sortie (affichée au survol dans New releases et Coming soon), son affiche et ses stills." }));
    var input = el("input", { type: "url", class: "nodirty", placeholder: "Lien de la bande Slate (shots.re/… ou kinou.slateapp.com/…)", value: fic.reel || "" });
    var st = el("p", { class: "hint" });
    st.textContent = fic.readError ? "Dernière lecture impossible : " + fic.readError
      : fic.readAt ? (fic.films || []).length + " films, lus sur Slate le " + new Date(fic.readAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) + "."
      : "Collez le lien de la bande puis cliquez sur « Relire la bande ».";
    var imp = el("button", { class: "btn", text: "Relire la bande" });
    imp.addEventListener("click", function () {
      var v = shortLink(input.value);
      if (!v) { st.textContent = "Collez le lien de la bande."; return; }
      fic.reel = v; imp.disabled = true;
      var before = fic.readAt || "";
      st.textContent = "Publication du lien…";
      publishFic(true).then(function () {
        st.textContent = "Le robot GitHub lit toute la bande sur Slate (environ 1 minute)…";
        var t0 = Date.now();
        (function poll() {
          readFile("data/fiction.json").then(function (s) {
            if (s && s.readAt && s.readAt !== before) {
              if (dirty) { st.textContent = "Bande relue : publiez vos changements puis rechargez la page pour la voir."; imp.disabled = false; return; }
              fic = s; fic.overrides = fic.overrides || {}; histReset(); ovBase = sharedSnap(fic.overrides); renderFic();
              status(s.readError ? "Lecture impossible : " + s.readError : (s.films || []).length + " films lus sur la bande.", s.readError ? "err" : "ok");
              return;
            }
            if (Date.now() - t0 > 240000) { st.textContent = "Le robot n'a pas encore fini : rechargez la page dans quelques minutes."; imp.disabled = false; return; }
            setTimeout(poll, 10000);
          }).catch(function () { setTimeout(poll, 10000); });
        })();
      }, function (e) { st.textContent = e.message; imp.disabled = false; });
    });
    view.appendChild(el("section", {}, [el("h2", { text: "Bande Slate" }), el("div", { class: "row" }, [el("div", { class: "grow" }, [input]), imp]), st]));
    view.appendChild((fic.films || []).length ? filmsSection() : el("section", {}, [el("h2", { text: "Films" }), el("p", { class: "empty", text: "Pas encore de films : relisez la bande." })]));
    bar.hidden = false;
    seeLink.href = SITE_VIEW + "/#fiction"; seeLink.hidden = false; ficBadge();
    if (flash) status(flash, "ok"); else if (dirty) touch(); else status("");
    flash = "";
  }
  // Publication : fichier en ligne relu (films du robot gardés) ; on n'y écrit que le lien et les réglages, + les affiches déposées.
  function publishFic(justLink) {
    if (justLink !== true) ficCapNew(); // 9 New releases au plus (ex. 10 en ligne avant cette règle)
    publishBtn.disabled = true; status("Publication…");
    var files = [], stamp = Date.now().toString(36);
    for (var id in pending.posters || {}) {
      var path = "fiction/" + id + "-" + stamp + ".webp";
      files.push({ path: "data/" + path, base64: pending.posters[id].base64 });
      fic.overrides[id] = Object.assign({}, fic.overrides[id], { poster: path });
    }
    return readFile("data/fiction.json").then(function (remote) {
      var out = remote || {};
      sharedMerge(fic.overrides, out.overrides); // films reliés : changé sur une fiche ou le spotlight entre-temps
      awMerge(fic.overrides, out.overrides); // prix ajoutés depuis « Nos sélections » entre-temps
      out.reel = fic.reel; out.overrides = fic.overrides;
      if (!fic.reel) { delete out.reel; delete out.readError; out.films = fic.films || []; } // sélection faite dans l'admin (sans Slate)
      if (justLink === true) out.readAsk = new Date().toISOString(); // fichier changé même avec le même lien → le robot relit la bande
      files.push({ path: "data/fiction.json", text: json(out) });
      return commit(files, "Mise à jour de la page fiction (admin, " + user.login + ")").then(function (ref) { out._ref = ref; return out; });
    }).then(function (out) {
      var ref = out._ref; delete out._ref;
      out.overrides = fic.overrides; fic = out; pending = {}; dirty = false; histReset(); ovBase = sharedSnap(out.overrides);
      if (justLink !== true && needsRobot(extrasLists(out.overrides))) afterRobot("data/fiction.json", ref, "fiction", function (d) {
        if (fic !== out) return;
        fullsFrom(out, d); if (!dirty && pagePublish === publishFic) renderFic();
        status("Le robot a ajouté les films complets : le site est à jour.", "ok");
      });
      refreshSite("fiction").catch(function () {});
      if (justLink !== true) { flash = fic.reel ? "Publié. Le robot relit la bande sur Slate (environ 1 minute)." : "Publié. Le site est à jour."; renderFic(); }
      else status("Lien publié.", "ok");
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); throw e; })
      .then(function (r) { publishBtn.disabled = false; return r; }, function (e) { publishBtn.disabled = false; throw e; });
  }
