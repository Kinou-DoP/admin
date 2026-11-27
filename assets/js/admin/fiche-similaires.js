// Fiche d'un chef op (films qui ressemblent, Gus 27/11) : un petit calcul dans le navigateur propose les films du video club qui
// ressemblent à ceux de la fiche (même réal, même prod, même client, titre proche : au moins 2 critères sur le même film de la
// fiche, fautes d'orthographe tolérées). Chiffre orange sur « Modifier la sélection » ; liste avec « + » et « Ignorer » en haut de
// la fenêtre de sélection. Un film déjà sur la page (ou ajouté dans la fenêtre) n'est plus compté. « Ignorer » est partagé :
// enregistré dans data/bibli/edits.json sous la clé « ~sim:<adresse de la fiche> » (jamais lue comme un film).
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
  function simCands(d, have) {
    var me = bnrm(rcBase(state && state.name || "")); if (!me || !d || !d.films) return [];
    var ign = {}; simIgnored().forEach(function (k) { ign[k] = 1; });
    var refs = d.films.filter(function (f) { var id = f.slate || f.key; return id && have(id) && !f.hidden; }).map(function (f) { return { f: f, p: simProfile(f) }; });
    if (!refs.length) return [];
    var out = [];
    d.films.forEach(function (f) {
      var id = f.slate || f.key; if (!id || have(id) || ign[id] || f.hidden || !f.title) return;
      var dops = (f.dops || []).map(bnrm);
      if (dops.length && dops.indexOf(me) < 0) return; // déjà crédité à d'autres chefs op : pas lui
      var p = simProfile(f), best = null;
      refs.forEach(function (r) {
        var w = [];
        if (simAny(p.dir, r.p.dir)) w.push("même réal");
        if (simAny(p.prod, r.p.prod, true)) w.push("même prod");
        if (p.client && r.p.client && simSame(p.client, r.p.client)) w.push("même client");
        if (simTitle(p, r.p)) w.push("titre proche");
        if (w.length >= 2 && (w.indexOf("même réal") > -1 || w.indexOf("même prod") > -1) && (!best || w.length > best.w.length)) best = { w: w, r: r.f };
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
  // Pastille orange sur le bouton « Modifier la sélection » (calcul différé : le video club se charge en arrière-plan).
  function simBadge(btn) {
    if (!slate || !state || !state.slug) return;
    var have = {}; (slate.clips || []).forEach(function (c) { have[c.slate] = 1; });
    var go = function () {
      bibLoad().then(function (d) {
        if (!btn.isConnected) return;
        var l = simCands(d, function (id) { return have[id]; }), b = btn.querySelector(".simbadge");
        if (b) b.remove();
        if (!l.length) return;
        btn.appendChild(el("span", { class: "simbadge", title: l.length + " film" + (l.length > 1 ? "s" : "") + " qui ressemble" + (l.length > 1 ? "nt" : "") + " à ceux de la fiche : ouvrir pour les voir", text: String(l.length) }));
      }, function () {});
    };
    setTimeout(go, 800);
  }
