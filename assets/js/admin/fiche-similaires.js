// Fiche d'un chef op (films qui ressemblent, Gus 27/11) : sous chaque film, à côté de « 🔍 Rechercher » (là où on ajoute du contenu
// sous le film), une pastille orange donne le nombre de films du video club qui ressemblent à CE film : au moins 2 critères sur 4
// (réal, prod, client, titre proche ; fautes d'orthographe tolérées). Un clic ouvre la liste (« + » = l'ajouter sous le film,
// « Ignorer » = ne plus le proposer pour ce chef op). Un film déjà sous le film, ou déjà sur la page, n'est pas compté.
// « Ignorer » est partagé : enregistré dans data/bibli/edits.json sous la clé « ~sim:<adresse de la fiche> » (jamais lue comme un film).
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  var SIM_GEN = /^(film|films|production|productions|prod|studio|studios|pictures|cinema|court|spot|pub|trailer|teaser|clip|making|the|les|des|une|pour|avec|dans|sur|par|and|etc)$/;
  var simMemo = {};
  function simN(s) { return bnrm(s).replace(/[^a-z0-9]+/g, " ").trim(); }
  function simToks(s, gen) { return simN(s).split(" ").filter(function (t) { return t && (!gen || (t.length > 3 && !SIM_GEN.test(t))); }); }
  function simLev(a, b) {
    var m = a.length, n = b.length, p = [], i, j;
    for (j = 0; j <= n; j++) p[j] = j;
    for (i = 1; i <= m; i++) { var prev = p[0]; p[0] = i; for (j = 1; j <= n; j++) { var t = p[j]; p[j] = Math.min(p[j] + 1, p[j - 1] + 1, prev + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)); prev = t; } }
    return p[n];
  }
  // Même nom à une petite faute près, ou mêmes mots dans un autre ordre / un mot en plus (« Wonderful » ≈ « Wonderful Films »).
  function simSame(a, b, prod) {
    if (!a || !b) return false;
    var k = a + "|" + b + (prod ? "p" : ""), r = simMemo[k]; if (r !== undefined) return r;
    r = a === b;
    if (!r) {
      var ta = simToks(a, prod), tb = simToks(b, prod);
      if (ta.length && tb.length) {
        var s = ta.length <= tb.length ? ta : tb, l = s === ta ? tb : ta;
        r = s.every(function (w) { return l.some(function (x) { return x === w || (w.length > 4 && x.length > 4 && simLev(w, x) <= (w.length > 7 ? 2 : 1)); }); }) && s.join("").length >= 4;
      }
      if (!r && a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 3) r = simLev(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.18));
    }
    return (simMemo[k] = r);
  }
  function simAny(la, lb, prod) { return la.some(function (a) { return lb.some(function (b) { return simSame(a, b, prod); }); }); }
  function simTitle(a, b) { // un mot marquant en commun (hors mots génériques) ou titres quasi identiques
    if (!a.t || !b.t) return false;
    if (simSame(a.t, b.t)) return true;
    return a.tk.some(function (w) { return b.tk.some(function (x) { return x === w || (w.length > 5 && x.length > 5 && simLev(w, x) <= 1); }); });
  }
  function simProfile(f) {
    if (f._sim) return f._sim;
    return (f._sim = { dir: bibDirs(f).map(simN).filter(Boolean), prod: bibProds(f).map(simN).filter(Boolean), client: simN(f.client), t: simN(f.title), tk: simToks(f.title, true) });
  }
  var SIM_KEY = function (slug) { return "~sim:" + (slug || "?"); };
  function simIgnored() { var e = vcFilms && vcFilms[SIM_KEY(state && state.slug)]; return (e && e.ids) || []; }
  // Films proposés. have(id) = ce film est déjà dans la page (ou dans la fenêtre de sélection) : il n'est jamais proposé.
  // Renvoie [{ f, why }] du plus ressemblant au moins ressemblant.
  function simCands(d, have, only) {
    var me = bnrm(rcBase(state && state.name || "")); if (!me || !d || !d.films) return [];
    var ign = {}; simIgnored().forEach(function (k) { ign[k] = 1; });
    var refs = d.films.filter(function (f) { var id = f.slate || f.key; return id && (only ? only === id || only === f.key : have(id)) && !f.hidden; }).map(function (f) { return { f: f, p: simProfile(f) }; });
    if (!refs.length) return [];
    var out = [];
    d.films.forEach(function (f) {
      var id = f.slate || f.key; if (!id || have(id) || have(f.key) || ign[id] || f.hidden || !f.title) return;
      var dops = (f.dops || []).map(bnrm);
      if (dops.length && dops.indexOf(me) < 0) return; // déjà crédité à d'autres chefs op : pas lui
      var p = simProfile(f), best = null;
      refs.forEach(function (r) {
        var w = [];
        if (simAny(p.dir, r.p.dir)) w.push("même réal");
        if (simAny(p.prod, r.p.prod, true)) w.push("même prod");
        if (p.client && r.p.client && simSame(p.client, r.p.client)) w.push("même client");
        if (simTitle(p, r.p)) w.push("titre proche");
        if (w.length >= 2 && (!best || w.length > best.w.length)) best = { w: w, r: r.f };
      });
      if (best) out.push({ f: f, n: best.w.length, why: best.w.join(" + ") + " · comme « " + (best.r.title || "") + " »" });
    });
    return out.sort(function (a, b) { return b.n - a.n || String(b.f.at || "").localeCompare(String(a.f.at || "")); });
  }
  function simIgnore(ids) {
    var k = SIM_KEY(state && state.slug), e = vcFilms[k] = Object.assign({}, vcFilms[k]);
    e.ids = (e.ids || []).concat(ids.filter(function (x) { return (e.ids || []).indexOf(x) < 0; }));
    vcTodo[k] = Object.assign(vcTodo[k] || {}, { ids: e.ids }); soon("vcPatch", vcSave, 1200); // pas de rechargement du video club
  }
  // Pastille d'un film (c = film de la carte) : list = lignes déjà sous le film (extras), add(f) = l'ajouter dessous.
  var simQ = 0;
  function simPill(c, list, add) {
    var b = el("button", { type: "button", class: "simbadge", hidden: true }), cands = [];
    var onPage = {}; ((slate && slate.clips) || []).forEach(function (x) { onPage[x.slate] = 1; onPage["s" + x.slate] = 1; });
    var below = {}; (list || []).forEach(function (x) { if (x.key) below[x.key] = 1; });
    var have = function (id) { return onPage[id] || below[id]; };
    setTimeout(function () {
      bibLoad().then(function (d) {
        if (!b.isConnected && !b.parentNode) return;
        cands = simCands(d, have, c.slate);
        if (!cands.length) { b.hidden = true; return; }
        b.hidden = false; b.textContent = String(cands.length);
        b.title = cands.length + " film" + (cands.length > 1 ? "s" : "") + " de ce chef op qui ressemble" + (cands.length > 1 ? "nt" : "") + " à celui-ci : cliquer pour les voir";
      }, function () {});
    }, 300 + (simQ++ % 60) * 50); // étalé : une fiche a des dizaines de films
    b.addEventListener("click", function () {
      var ov = el("div", { class: "bmodal bpickm" }), box = el("div", { class: "bmbox" }), listEl = el("div", { class: "simlist" });
      function close() { document.removeEventListener("keydown", esc, true); ov.remove(); }
      function esc(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
      document.addEventListener("keydown", esc, true); ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      function draw() {
        listEl.textContent = "";
        if (!cands.length) listEl.appendChild(el("p", { class: "empty", text: "Plus aucun film à proposer." }));
        cands.forEach(function (x) {
          var f = x.f, th = el("div", { class: "selth", title: "Voir le film et ses crédits" }); if (f.img) th.style.backgroundImage = 'url("' + imgShow(f.img) + '")';
          th.addEventListener("click", function () { preview(f); });
          listEl.appendChild(el("div", { class: "selitem" }, [th, el("div", { class: "seltxt" }, [el("b", { class: "simtitle", text: f.title || "(sans titre)", on: { click: function () { preview(f); } } }),
            el("small", { text: [(f.dops || []).join(", "), f.dir, f.prod, f.client].filter(Boolean).join(" · ") }), el("small", { class: "simwhy", text: x.why })]),
            el("button", { type: "button", class: "btn ghost", text: "Ignorer", title: "Ne plus proposer ce film pour ce chef op", on: { click: function () { simIgnore([f.slate || f.key]); cands = cands.filter(function (y) { return y !== x; }); upd(); } } }),
            el("button", { type: "button", class: "btn", text: "+", title: "Ajouter sous le film", on: { click: function () { close(); add(f); } } })]));
        });
      }
      // Aperçu avec la vidéo et les crédits (navPlayer, comme dans le video club) ; « + » y ajoute le film sous celui de la fiche.
      var added = {};
      function preview(f) {
        var l = cands.map(function (x) { return x.f; }), at = l.indexOf(f); if (at < 0) return;
        navPlayer(l, at, { addLabel: "Ajouter sous le film", inLabel: "Ajouté sous le film", has: function (g) { return added[g.key || g.slate]; },
          add: function (g) { added[g.key || g.slate] = 1; add(g); cands = cands.filter(function (y) { return y.f !== g; }); upd(); } });
      }
      function upd() { b.textContent = String(cands.length); b.hidden = !cands.length; draw(); }
      box.appendChild(el("span", { class: "label", text: "Films qui ressemblent à « " + (c.title || "") + " »" })); box.appendChild(listEl);
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: close } })]));
      ov.appendChild(box); document.body.appendChild(ov); draw();
    });
    return b;
  }
