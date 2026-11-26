// Nos sélections + prix confirmés → site
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Nos sélections (Gus 17/11) ----------
  // Le robot du dépôt notes (tools/find-selections.mjs, chaque matin) lit les pages de sélection des festivals et y cherche nos films ;
  // trouvailles dans festivals/selections.json = { found: [{ id, fest, festName, edition, project, title, type, genre, directors, dops,
  // urls, snippet, why, score, foundAt, status: new | ok | no, section?, by?, at?, manual? }], pages, at }. Ici : confirmer
  // (« C'est nous ») ou écarter (« Pas nous »), préciser la section ou le prix, ajouter une sélection à la main.
  var SEL_PATH = "/repos/" + NOTES_REPO + "/contents/festivals/selections.json", sel = null, selSha = null;
  function selRead() {
    return gh(SEL_PATH, { allow404: true }).then(function (f) {
      if (f) { selSha = f.sha; sel = JSON.parse(b64dec(f.content)); } else { selSha = null; sel = { found: [], pages: {} }; }
      sel.found = sel.found || []; return sel;
    });
  }
  function selPut(items, msg, remove) {
    return selRead().then(function () {
      items.forEach(function (x) { sel.found = sel.found.filter(function (y) { return y.id !== x.id; }); if (!remove) sel.found.push(x); });
      return gh(SEL_PATH, { method: "PUT", body: { message: msg + " (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(sel, null, 2) + "\n"), sha: selSha || undefined } });
    }).then(function (r) { selSha = r.content.sha; awardsSoon(); });
  }
  // ---------- Prix confirmés → « Prix & sélections » des films sur le site (Gus 17/11) ----------
  // Chaque trouvaille confirmée (✓) devient une ligne dans `info.awards` du film : page fiction (`data/fiction.json`, film au même
  // titre avec un chef op en commun) et fiche de chaque chef op crédité (`data/dps/<adresse>.json`, film au même titre).
  // `info.awardsFrom` = { id de la trouvaille: ligne écrite } : une ligne n'est ajoutée qu'une fois (corrigée ou effacée à la main :
  // pas remise) ; trouvaille retirée ou écartée = sa ligne retirée (si elle n'a pas été corrigée). Seulement avec une clé qui peut
  // écrire sur le site (`canWeb`) ; lancé à l'ouverture de Nos sélections et après chaque changement.
  // Tirets longs remplacés par « • » (Gus 18/11).
  function awDots(t) { return String(t || "").replace(/\s*[–—]\s*/g, " • ").trim(); }
  function awLine(x) { return awDots(awLine0(x)); }
  function awLine0(x) {
    var y = String(x.edition || String(x.date || "").slice(0, 4) || ""), fest = String(x.festName || x.fest || "").trim();
    var where = fest + (y && fest.indexOf(y) < 0 ? " " + y : "");
    if (x.kind === "prize") return (x.prize || "Prize") + (x.image && !/image|photo|cin[eé]matograph/i.test(x.prize || "") ? " (cinematography)" : "") + ", " + where;
    if (x.kind === "nomination") return "Nominated" + (x.prize || x.section ? ", " + (x.prize || x.section) : "") + ", " + where;
    return "Official selection" + (x.section ? " • " + x.section : "") + ", " + where;
  }
  // Une ligne écrite à la main parle-t-elle du même prix que la trouvaille x ? Même année, festival reconnu (60 % de ses mots),
  // et : sélection ↔ ligne de sélection sans mot de prix ; prix / nomination ↔ 60 % des mots du nom du prix.
  var AW_STOP = " the of a an and in for at de du des la le les l d et en au aux un une festival film films international internationale awards award prix prize best meilleur meilleure edition ";
  function awWords(t) { return sortNrm(String(t || "").replace(/['’]/g, " ")).split(" ").filter(function (w) { return w && AW_STOP.indexOf(" " + w + " ") < 0; }); }
  function awSameText(x, z) {
    var y = String(x.edition || String(x.date || "").slice(0, 4) || ""); if (!y || String(z).indexOf(y) < 0) return false;
    var zw = awWords(z), has = function (w) { return zw.indexOf(w) > -1; };
    var fw = awWords(String(x.festName || x.fest || "").replace(/\([^)]*\)/g, " ")).filter(function (w) { return !/^\d+$/.test(w); });
    if (!fw.length || fw.filter(has).length < Math.ceil(fw.length * 0.6)) return false;
    var prizeish = /\b(prix|prize|award|winner|laur[eé]at|palme|lion|ours|bear|mention|valois|c[eé]sar|r[eé]compens|won|best|meilleur)/i.test(z);
    if (x.kind !== "prize" && x.kind !== "nomination") return !prizeish && /s[eé]lect|official|officiel|comp[eé]t|regard|quinzaine|semaine|fortnight|week|panorama|hors|out of|ouverture|opening|cl[oô]ture|closing|sp[eé]cial|screening|s[eé]ance/i.test(z);
    var pw = awWords(x.prize || x.section); if (!pw.length) return prizeish;
    return pw.filter(has).length >= Math.ceil(pw.length * 0.6) && (x.kind !== "nomination" || /nomin/i.test(z)) && (x.kind !== "prize" || !/nomin/i.test(z));
  }
  function awApply(ov, id, items) {
    var o = ov[id] || {}, info = Object.assign({}, o.info || {}), from = Object.assign({}, info.awardsFrom || {}), ch = false, want = {};
    var lines = String(info.awards || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), hid = (info.awardsHidden || []).slice();
    items.forEach(function (x) { want[x.id] = 1; });
    Object.keys(from).forEach(function (k) {
      if (want[k]) return;
      // Même texte écrit par une autre trouvaille toujours confirmée (doublon écarté) : la ligne reste (Gus 22/11).
      var shared = Object.keys(from).some(function (j) { return j !== k && want[j] && from[j] === from[k]; });
      if (!shared) { var i = lines.indexOf(from[k]); if (i > -1) lines.splice(i, 1); i = hid.indexOf(from[k]); if (i > -1) hid.splice(i, 1); }
      delete from[k]; ch = true;
    });
    var mine = {}; Object.keys(from).forEach(function (k) { mine[from[k]] = 1; });
    var hand = lines.concat(hid).filter(function (z) { return !mine[z]; }); // lignes écrites à la main
    function rk(x) { return x.kind === "prize" ? 0 : x.kind === "nomination" ? 1 : 2; }
    items.slice().sort(function (a, b) { return rk(a) - rk(b) || String(b.edition || b.date || "").localeCompare(String(a.edition || a.date || "")); }).forEach(function (x) {
      if (from[x.id] !== undefined) return;
      // Déjà là, ou déjà écrite à la main autrement (« Official selection, Cannes film festival 2026 », « Selected for Un Certain
      // Regard at the 2026 Cannes Film Festival », Gus 22/11) : pas de 2e ligne.
      var l = awLine(x); if (!lines.concat(hid).some(function (z) { return sortNrm(z) === sortNrm(l); }) && !hand.some(function (z) { return awSameText(x, z); })) lines.push(l);
      from[x.id] = l; ch = true;
    });
    if (!ch) return false;
    info.awards = lines.join("\n"); if (!info.awards) delete info.awards;
    if (hid.length) info.awardsHidden = hid; else delete info.awardsHidden;
    if (Object.keys(from).length) info.awardsFrom = from; else delete info.awardsFrom;
    ov[id] = Object.assign({}, o, { info: info });
    return true;
  }
  function awTitles(x) {
    var p = proj && proj.projects && proj.projects.filter(function (q) { return q.id === x.project; })[0];
    return [x.title].concat(p ? [p.title].concat(p.aka || []) : []).filter(Boolean);
  }
  // Titre du site comparé tel quel (« • » et « | » enlevés) et sans ce qui suit « • Bande-annonce »… : « GENER8ION • STORM | starring
  // Yung Lean » doit retrouver « GENER8ION - STORM starring Yung Lean » (Gus 18/11).
  function awHit(x, title) {
    // « Fatherland (Camera Operator) », « X (2nd unit) » : le rôle entre parenthèses ne fait pas partie du titre (Gus 19/11).
    var cands = [ficTitle(title), String(title || "").replace(/[•|]/g, " "), ficTitle(String(title || "").replace(/\s*\([^)]*\)/g, " "))];
    return awTitles(x).some(function (t) { return cands.some(function (c) { return sortSame(c, t); }); });
  }
  // Applique les trouvailles confirmées à un fichier du site (fiche d'un chef op, ou page fiction) ; null = rien à changer.
  // Liens faits à la main dans Nos sélections (Gus 22/11) : `x.links = [{ page: "fiction" | <adresse du chef op>, slate, title }]`.
  // Une trouvaille reliée ne va QUE sur ces films-là (plus de rapprochement par le titre).
  function awFor(x, f, page, fiction) {
    if (x.links && x.links.length) return x.links.some(function (l) { return l.page === page && String(l.slate) === String(f.id); });
    return !!f.title && awHit(x, f.title) && (!fiction || !f.dops.length || sortDop(f.dops, x.dops));
  }
  function awFile(text, items, fiction, page) {
    if (!text) return null;
    var d = JSON.parse(text), ov = d.overrides = d.overrides || {}, ch = false, ids = {};
    var list = fiction ? (d.films || []).map(function (f) { return { id: String(f.slate), title: (ov[f.slate] || {}).title || f.title, dops: f.artists || [] }; })
      : (d.clips || []).map(function (c) { return { id: String(c.slate), title: (ov[c.slate] || {}).title || c.title }; });
    list.forEach(function (f) { if (f.id && f.id !== "undefined") ids[f.id] = f; });
    Object.keys(ov).forEach(function (id) { if (ov[id].info && ov[id].info.awardsFrom && !ids[id]) ids[id] = { id: id, title: "" }; });
    Object.keys(ids).forEach(function (id) {
      var f = ids[id], mine = items.filter(function (x) { return awFor(x, f, page || (fiction ? "fiction" : ""), fiction); });
      if (awApply(ov, id, mine)) ch = true;
    });
    return ch ? json(d) : null;
  }
  var awT = 0, awBusy = null;
  function awardsSoon() { soon("awards", awardsSync, 1500); }
  function awardsSync() {
    if (!canWeb || !sel || awBusy) return awBusy;
    var ok = sel.found.filter(function (x) { return x.status === "ok" && x.title; });
    var note = document.querySelector(".awnote"); if (note) { note.textContent = "Site : mise à jour des prix…"; note.className = "awnote hint"; }
    awBusy = loadIndex().then(function (idx) {
      // Fiches concernées : chefs op crédités sur une trouvaille confirmée, plus celles qui ont déjà des prix ajoutés (retraits).
      var byName = {}; (idx.dps || []).forEach(function (d) { byName[sortNrm(rcBase(d.name))] = d.slug; });
      var slugs = {};
      var known = {}; (idx.dps || []).forEach(function (d) { known[d.slug] = 1; });
      sel.found.forEach(function (x) { (x.dops || []).forEach(function (n) { var sl = byName[sortNrm(rcBase(n))]; if (sl) slugs[sl] = 1; });
        (x.links || []).forEach(function (l) { if (known[l.page]) slugs[l.page] = 1; }); }); // aussi écartées : retrait
      Object.keys(awDone).forEach(function (sl) { slugs[sl] = 1; });
      var files = [{ path: "data/fiction.json", edit: function (t) { return awFile(t, ok, true, "fiction"); } }];
      Object.keys(slugs).forEach(function (sl) {
        var name = ((idx.dps || []).filter(function (d) { return d.slug === sl; })[0] || {}).name || "";
        var mine = ok.filter(function (x) { return x.links && x.links.length ? x.links.some(function (l) { return l.page === sl; })
          : (x.dops || []).some(function (n) { return sortNrm(rcBase(n)) === sortNrm(rcBase(name)); }); });
        files.push({ path: "data/dps/" + sl + ".json", edit: function (t) { var r = awFile(t, mine, false, sl); if (r) awDone[sl] = 1; return r; } });
      });
      return commit(files, "Prix & sélections des films mis à jour depuis Nos sélections (admin, " + user.login + ")");
    }).then(function (r) {
      if (note) { note.textContent = r ? "Site : prix & sélections des films mis à jour." : "Site : prix & sélections à jour."; note.className = "awnote hint ok"; }
    }, function (e) {
      if (note) { note.textContent = "Site : prix pas mis à jour (" + e.message + ")"; note.className = "awnote hint err"; }
    }).then(function () { awBusy = null; });
    return awBusy;
  }
  var awDone = {}; // fiches modifiées pendant cette session (pour retirer une ligne si la trouvaille est écartée ensuite)
  function selSave(before, after, label, remove) { // avec Annuler / Rétablir
    var b = before && JSON.parse(JSON.stringify(before)), a = JSON.parse(JSON.stringify(after));
    return selPut([a], "Sélections : " + label, remove).then(function () {
      immPush({ label: label, undo: function () { return b ? selPut([b], "Sélections : annulé — " + label) : selPut([a], "Sélections : annulé — " + label, true); },
        redo: function () { return selPut([a], "Sélections : rétabli — " + label, remove); } });
    });
  }
  function showFestSel() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: "Nos sélections" }));
    view.appendChild(el("p", { class: "lead", text: "Les festivals où nos films ont été sélectionnés, nommés ou primés. Deux robots cherchent : chaque nuit, Claude cherche film par film sur le web (AlloCiné, Unifrance, IMDb, festivals, presse, tous festivals confondus) ; chaque matin, un autre lit les pages de sélection des festivals du calendrier. Leurs trouvailles arrivent dans « À vérifier »." }));
    var box = el("div", {}, [el("p", { class: "hint", text: "Chargement…" })]);
    view.appendChild(box); immInit(function () { draw(); });
    var st = { cat: "", fest: "", dop: "", year: "", q: "", showNo: false, nAll: 60, tab: "all" };
    try { if (localStorage.getItem("kinou-sel-tab") === "rec") st.tab = "rec"; } catch (e) {} // onglet mémorisé dans ce navigateur
    // Prix sans film sur le site (Gus 22/11) : la trouvaille n'est rattachée à aucun film des fiches des chefs op ni de la page
    // fiction (même recherche par le titre que awardsSync), et n'a pas de lien fait à la main (`links`) → triangle « ! »,
    // catégorie « Sans lien », bouton « Relier à un film » (un ou plusieurs films de la bibliothèque).
    var bib = null, bibT = null, plc = {};
    function tw(t) { return sortNrm(t).split(" ").filter(Boolean); }
    function sameW(x, y) {
      if (x.join(" ") === y.join(" ")) return true;
      if (x.length < 3 || y.length < 3) return false;
      var n = x.filter(function (w) { return y.indexOf(w) > -1; }).length; return n / (x.length + y.length - n) >= 0.6;
    }
    function linkPages(f) { return f.pages.filter(function (p) { return p.slug !== "spotlight"; }); }
    function placed(x) {
      if (x.links && x.links.length) return true;
      if (!bib) return null;
      var k = x.id + "|" + x.title + "|" + (x.dops || []).join(",");
      if (plc[k] !== undefined) return plc[k];
      if (!bibT) bibT = bib.films.filter(function (f) { return f.slate && linkPages(f).length; }).map(function (f) {
        var t = String(f.title || ""); return { f: f, c: [ficTitle(t), t.replace(/[•|]/g, " "), ficTitle(t.replace(/\s*\([^)]*\)/g, " "))].map(tw) };
      });
      var ts = awTitles(x).map(tw), dn = (x.dops || []).map(function (n) { return sortNrm(rcBase(n)); });
      return plc[k] = bibT.some(function (o) {
        if (!o.c.some(function (c) { return ts.some(function (t) { return sameW(c, t); }); })) return false;
        return linkPages(o.f).some(function (p) {
          if (p.slug === "fiction") return !o.f.dops.length || sortDop(o.f.dops, x.dops);
          return dn.indexOf(sortNrm(rcBase(p.name))) > -1;
        });
      });
    }
    function tri(x) {
      return x.status !== "no" && placed(x) === false ? el("span", { class: "ftri", title: "Film pas retrouvé sur le site (fiches des chefs op, page fiction) : ce prix n'y est pas affiché. « Relier à un film » pour le faire à la main.", text: "!" }) : null;
    }
    function linkTitles(x) { var o = {}; (x.links || []).forEach(function (l) { o[l.title || l.slate] = 1; }); return Object.keys(o); }
    function linkBtn(xs, at) {
      var n = 0, miss = false; xs.forEach(function (x) { n = Math.max(n, linkTitles(x).length); if (placed(x) === false) miss = true; });
      if (!n && !miss) return null;
      return el("button", { type: "button", class: "btn ghost", text: n ? "Liens · " + n : "Relier à un film", on: { click: function () { openLink(xs, at()); } } });
    }
    function openLink(xs, at) {
      if (bib) return linkForm(xs, at);
      var w = el("p", { class: "hint seladd", text: "Chargement du video club…" }); at.after(w);
      bibLoad().then(function (b) { bib = b; w.remove(); linkForm(xs, at); }, function (e) { w.textContent = "Video club indisponible : " + e.message; });
    }
    // Choisir un ou plusieurs films de la bibliothèque (ceux des fiches et de la page fiction : là où les prix s'affichent).
    function linkForm(xs, at) {
      var old = box.querySelector(".seladd"); if (old) old.remove();
      var chosen = {}, order = [];
      function choose(f, on) { if (on && !chosen[f.key]) { chosen[f.key] = f; order.push(f.key); } if (!on) { delete chosen[f.key]; order = order.filter(function (k) { return k !== f.key; }); } }
      xs.forEach(function (x) { (x.links || []).forEach(function (l) { var f = bib.films.filter(function (g) { return String(g.slate) === String(l.slate); })[0]; if (f) choose(f, true); }); });
      var x0 = xs[0], q = el("input", { type: "search", class: "nodirty", placeholder: "Titre du film, chef op, réalisateur, production…", value: ficTitle(x0.title || "") });
      var res = el("div", { class: "selres" }), pick = el("div", { class: "sellinked" }), msg = el("span", { class: "fmsg" });
      function films() { return bib.films.filter(function (f) { return f.slate && linkPages(f).length; }); }
      function where(f) { return linkPages(f).map(function (p) { return p.slug === "fiction" ? "page fiction" : "fiche " + p.name; }).join(", "); }
      function drawPick() {
        pick.textContent = "";
        if (!order.length) { pick.appendChild(el("p", { class: "hint", text: "Aucun film choisi." })); return; }
        order.forEach(function (k) { var f = chosen[k];
          pick.appendChild(el("span", { class: "sellink" }, [el("strong", { text: f.title }), el("small", { text: where(f) }),
            el("button", { type: "button", class: "selx", title: "Retirer", text: "×", on: { click: function () { choose(f, false); drawPick(); search(); } } })])); });
      }
      function search() {
        // Tolérant : les films qui ont le plus de mots de la recherche d'abord (« L'une des leurs » trouve « Une des leurs »).
        var w = tw(q.value).filter(function (v) { return v.length > 1; }); res.textContent = "";
        if (!w.length) return;
        var need = w.length <= 2 ? w.length : Math.ceil(w.length * 0.6);
        var l = films().map(function (f) { var h = " " + sortNrm(f.hay) + " ", sc = 0; w.forEach(function (v) { if (h.indexOf(" " + v) > -1) sc++; }); return { f: f, sc: sc }; })
          .filter(function (o) { return o.sc >= need; }).sort(function (a, b) { return b.sc - a.sc; }).map(function (o) { return o.f; });
        if (!l.length) res.appendChild(el("p", { class: "hint", text: "Aucun film du video club ne correspond." }));
        l.slice(0, 10).forEach(function (f) {
          res.appendChild(el("button", { type: "button", class: "selpick" + (chosen[f.key] ? " on" : ""), on: { click: function () { choose(f, !chosen[f.key]); drawPick(); search(); } } },
            [el("strong", { text: (chosen[f.key] ? "✓ " : "") + f.title }), el("small", { text: [f.dir, f.dops.join(", "), where(f)].filter(Boolean).join(" · ") })]));
        });
      }
      q.addEventListener("input", search);
      var label = (x0.title || "Sans titre") + (xs.length > 1 ? " (" + xs.length + " trouvailles)" : " — " + x0.festName);
      // Les autres trouvailles du même film (même projet, sinon même titre), confirmées ou à vérifier : reliées aussi (case cochée).
      var ids0 = {}; xs.forEach(function (x) { ids0[x.id] = 1; });
      var sibs = sel.found.filter(function (y) { return !ids0[y.id] && y.status !== "no" && (x0.project ? y.project === x0.project : sortNrm(y.title) === sortNrm(x0.title)); });
      var also = sibs.length ? el("label", { class: "rcag" }, [el("input", { type: "checkbox", class: "nodirty", checked: true }),
        "Relier aussi les " + sibs.length + " autre" + (sibs.length > 1 ? "s" : "") + " sélection" + (sibs.length > 1 ? "s" : "") + " ou prix de « " + (x0.title || "") + " »"]) : null;
      var form2 = el("article", { class: "fcard fedit seladd" }, [
        el("label", { class: "field" }, [el("span", { class: "label", text: "Relier « " + label + " » à un ou plusieurs films de notre video club" }), q, res]),
        el("p", { class: "hint", text: "Le prix ira sur ces films (fiche du chef op, page fiction), au lieu d'être rapproché par le titre." }),
        pick, also,
        el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: "Enregistrer", on: { click: function (e) {
          var list = also && also.firstChild.checked ? xs.concat(sibs) : xs;
          var links = [];
          order.forEach(function (k) { var f = chosen[k]; linkPages(f).forEach(function (p) { links.push({ page: p.slug, slate: String(f.slate), title: f.title }); }); });
          var bs = JSON.parse(JSON.stringify(list)), ys = list.map(function (x) {
            var y = JSON.parse(JSON.stringify(x)); if (links.length) y.links = links; else delete y.links;
            y.linkBy = user && user.login || ""; y.linkAt = new Date().toISOString(); return y; });
          var lab = (x0.title || "") + (links.length ? " — relié à " + order.map(function (k) { return chosen[k].title; }).join(", ") : " — liens retirés");
          e.target.disabled = true; msg.textContent = "Enregistrement…";
          selPut(ys, "Sélections : " + lab).then(function () {
            immPush({ label: lab, undo: function () { return selPut(bs, "Sélections : annulé — " + lab).then(draw); }, redo: function () { return selPut(ys, "Sélections : rétabli — " + lab).then(draw); } });
            draw();
          }, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
        } } }),
          el("button", { type: "button", class: "btn ghost", text: "Annuler", on: { click: function () { form2.remove(); } } }), msg])
      ]);
      at.after(form2); q.focus(); search(); drawPick();
    }
    function prodOf(x) { var p = proj && proj.projects && proj.projects.filter(function (q) { return q.id === x.project; })[0]; return p && p.prod || ""; }
    function more(list, n, key, redraw) { // « Afficher plus » quand la liste dépasse
      if (list.length > n) return el("button", { type: "button", class: "btn ghost rcmore", text: "Afficher plus (" + (list.length - n) + ")", on: { click: function () { st[key] += 100; redraw(); } } });
      return null;
    }
    if (canWeb) view.insertBefore(el("p", { class: "awnote hint" }), box); // sous l'intro, au-dessus des listes
    Promise.all([selRead(), festLoad().catch(function () { return null; }), projRead().catch(function () { return null; })]).then(function () {
      draw(); awardsSoon();
      // Bibliothèque (fiches + page fiction) : pour savoir quels prix n'ont pas trouvé leur film sur le site (triangle « ! »).
      bibLoad().then(function (b) { bib = b; if (!box.querySelector(".seladd")) draw(); }, function () {});
    }, function (e) {
      box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "Indisponible : " + e.message }));
    });
    function nrm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
    function typeOf(x) { return x.type === "PUB" ? (x.genre === "web" ? "Pub · web" : x.genre === "corporate" ? "Pub · corporate" : "Pub") : x.type === "TVF" ? "Téléfilm" : (RC_CATS.filter(function (c) { return c[0] === RC_CAT[x.type]; })[0] || [0, x.type])[1]; }
    function kindOf(x) { return x.kind === "prize" ? (x.image ? "img" : "prize") : x.kind === "nomination" ? "nom" : "sel"; }
    var KL = { prize: "Prix", img: "Prix de l'image", nom: "Nomination", sel: "Sélection" };
    function when(x) { return x.date || (x.edition ? x.edition + "-06-30" : (x.at || "").slice(0, 10)); }
    function festLine(x) { return x.festName + (x.city ? " (" + x.city + ")" : "") + (x.edition ? " " + x.edition : ""); }
    function what(x) { return [x.kind !== "selection" && x.prize, x.section].filter(Boolean).join(" · "); }
    function draw() {
      box.textContent = "";
      var all = sel.found, nw = all.filter(function (x) { return x.status === "new"; }), ok = all.filter(function (x) { return x.status === "ok"; }), no = all.filter(function (x) { return x.status === "no"; });
      var pages = 0; Object.keys(sel.pages || {}).forEach(function (k) { pages += ((sel.pages[k] || {}).read || []).length; });
      var nf = Object.keys(sel.films || {}).length;
      box.appendChild(el("p", { class: "hint selrobot", text: (nf ? nf + " films déjà cherchés par Claude" : "Claude n'a pas encore cherché nos films (chaque nuit vers 3 h, 25 films)") + (sel.at ? " · pages des festivals lues le " + fdate(sel.at.slice(0, 10)) + " (" + pages + ")" : "") }));
      box.appendChild(el("div", { class: "fchips" }, [el("button", { type: "button", class: "btn fadd", text: "+ Ajouter une sélection ou un prix", on: { click: function (e) { add(e.target); } } })]));
      // 1. À vérifier, groupé par film.
      var s1 = el("section", {}, [el("h2", { text: "À vérifier · " + nw.length })]);
      if (!nw.length) s1.appendChild(el("p", { class: "hint", text: "Rien à vérifier pour l'instant." }));
      var byP = {}, keys = [];
      nw.forEach(function (x) { var k = x.project || x.title; if (!byP[k]) { byP[k] = []; keys.push(k); } byP[k].push(x); });
      keys.forEach(function (k) { s1.appendChild(filmBox(byP[k])); });
      box.appendChild(s1);
      // 2. Nos sélections confirmées, deux onglets (Gus 22/11) : « Toutes » et « Récent » (festival ou prix des 4 derniers mois, d'après
      // sa date ; sans date exacte : pas dans Récent, sauf ajout à la main récent). Catégories, filtres et recherche valent pour les deux.
      var lim = new Date(Date.now() - 122 * 864e5).toISOString().slice(0, 10);
      function evd(x) { return x.date || (x.manual && x.at ? x.at.slice(0, 10) : ""); }
      var rec = ok.filter(function (x) { return evd(x) >= lim; });
      var base = st.tab === "rec" ? rec : ok;
      function tab(k, label) {
        return el("button", { type: "button", class: "seltab" + (st.tab === k ? " on" : ""), text: label, on: { click: function () {
          st.tab = k; st.nAll = 60; try { localStorage.setItem("kinou-sel-tab", k); } catch (e) {} draw(); } } });
      }
      var s3 = el("section", {}, [el("h2", { class: "seltabs" }, [tab("all", "Toutes nos sélections · " + ok.length), tab("rec", "Récent · " + rec.length)])]);
      var cnt = { "": base.length, prize: 0, img: 0, sel: 0, nom: 0, nolink: 0 };
      base.forEach(function (x) { var k = kindOf(x); cnt[k]++; if (k === "img") cnt.prize++; if (placed(x) === false) cnt.nolink++; });
      var cats = [["", "Tout"], ["prize", "Prix"], ["img", "Prix de l'image"], ["sel", "Sélections"], ["nom", "Nominations"]];
      if (bib) cats.push(["nolink", "Sans lien"]); // film pas retrouvé sur le site (Gus 22/11)
      s3.appendChild(el("div", { class: "fchips" }, cats.map(function (c) {
        return el("button", { type: "button", class: "chip" + (st.cat === c[0] ? " on" : "") + (c[0] === "nolink" ? " selnolink" : ""), text: c[1] + " · " + cnt[c[0]], on: { click: function () { st.cat = c[0]; draw(); } } });
      })));
      function dd(key, label, vals) {
        var s = el("select", { class: "nodirty" }, [el("option", { value: "", text: label })].concat(vals.map(function (v) { return el("option", { value: v, text: v }); })));
        s.value = st[key]; s.addEventListener("change", function () { st[key] = s.value; draw(); }); return s;
      }
      function uniq(f) { var o = {}; base.forEach(function (x) { [].concat(f(x)).forEach(function (v) { if (v) o[v] = 1; }); }); return Object.keys(o); }
      var q = el("input", { type: "search", class: "find nodirty", placeholder: "Rechercher un film, un festival, un prix, un chef op, un réalisateur, une production…", value: st.q });
      var list = el("div", {});
      s3.appendChild(el("div", { class: "rcsel" }, [dd("fest", "Tous les festivals", uniq(function (x) { return x.festName; }).sort(function (a, b) { return a.localeCompare(b, "fr"); })),
        dd("dop", "Tous les chefs op", uniq(function (x) { return (x.dops || []).map(rcBase); }).sort(function (a, b) { return a.localeCompare(b, "fr"); })),
        dd("year", "Toutes les années", uniq(function (x) { return x.edition; }).sort().reverse())]));
      s3.appendChild(q); s3.appendChild(list);
      function fillAll() {
        var w = nrm(st.q).split(/\s+/).filter(Boolean); list.textContent = "";
        var l = base.filter(function (x) {
          var k = kindOf(x);
          if (st.cat === "nolink") { if (placed(x) !== false) return false; }
          else if (st.cat && !(st.cat === k || (st.cat === "prize" && k === "img"))) return false;
          if (st.fest && x.festName !== st.fest) return false;
          if (st.dop && (x.dops || []).map(rcBase).indexOf(st.dop) < 0) return false;
          if (st.year && x.edition !== st.year) return false;
          var h = nrm([x.title, x.festName, x.city, x.country, x.section, x.prize, prodOf(x), (x.directors || []).join(" "), (x.dops || []).join(" ")].join(" "));
          return w.every(function (v) { return h.indexOf(v) > -1; });
        }).sort(function (a, b) { return (st.tab === "rec" ? evd(b).localeCompare(evd(a)) : 0) || when(b).localeCompare(when(a)) || a.festName.localeCompare(b.festName); });
        if (!l.length) list.appendChild(el("p", { class: "hint", text: base.length ? "Rien avec ces filtres." : st.tab === "rec" ? "Rien ces quatre derniers mois." : "Aucune sélection confirmée pour l'instant." }));
        l.slice(0, st.nAll).forEach(function (x) { list.appendChild(line(x)); });
        var m2 = more(l, st.nAll, "nAll", fillAll); if (m2) list.appendChild(m2);
      }
      q.addEventListener("input", function () { st.q = q.value; st.nAll = 60; fillAll(); });
      fillAll();
      box.appendChild(s3);
      if (no.length) {
        var s4 = el("section", {}, [el("h2", {}, [el("button", { type: "button", class: "btn ghost", text: (st.showNo ? "Masquer" : "Voir") + " les trouvailles écartées · " + no.length, on: { click: function () { st.showNo = !st.showNo; draw(); } } })])]);
        // Deux sortes d'écartées (Gus 22/11) : « Pas nous » (✗ de l'équipe) et les doublons (même prix trouvé deux fois sous une
        // autre forme, écarté par les robots : `dupOf` = id de la version gardée).
        if (st.showNo) {
          var notUs = no.filter(function (x) { return !x.dupOf; }), dups = no.filter(function (x) { return x.dupOf; });
          if (notUs.length) {
            s4.appendChild(el("h3", { class: "selfest", text: "Pas nous · " + notUs.length }));
            s4.appendChild(el("p", { class: "hint", text: "Écartées avec ✗ : « Finalement c'est nous » les remet dans nos sélections." }));
            notUs.forEach(function (x) { s4.appendChild(line(x)); });
          }
          if (dups.length) {
            s4.appendChild(el("h3", { class: "selfest", text: "Doublons · " + dups.length }));
            s4.appendChild(el("p", { class: "hint", text: "Le même prix ou la même sélection trouvé deux fois sous une autre forme (titre, langue, section…) : seule l'autre version est gardée et affichée sur le site. « Pas un doublon » si ce sont bien deux prix différents." }));
            dups.forEach(function (x) { s4.appendChild(line(x)); });
          }
        }
        box.appendChild(s4);
      }
    }
    function badge(x) { var k = kindOf(x); return el("span", { class: "selk " + k, text: KL[k] }); }
    function save(x, y, label) { var z = x || y; return selSave(x, y, (z.title || "") + " — " + z.festName + " : " + label).then(draw); }
    function setSt(x, s, label) { var y = JSON.parse(JSON.stringify(x)); y.status = s; y.by = user && user.login || ""; y.at = new Date().toISOString(); return save(x, y, label); }
    // Un film à vérifier : ses trouvailles, chacune « ✓ / ✗ », et « Tout confirmer / Tout écarter ».
    function filmBox(l) {
      var x0 = l[0], msg = el("span", { class: "fmsg" });
      var b = el("article", { class: "selcard new" }, [el("div", { class: "selhead" }, [
        el("div", {}, [el("h3", {}, [l.some(function (x) { return placed(x) === false; }) ? tri(l.filter(function (x) { return placed(x) === false; })[0]) : null, x0.title || "Sans titre"]),
          el("p", { class: "fwhere", text: [typeOf(x0), (x0.directors || []).length && "réal. " + x0.directors.join(", "), "DoP " + (x0.dops || []).map(rcBase).join(", ")].filter(Boolean).join(" · ") }),
          linkTitles(x0).length ? el("p", { class: "sellinks", text: "Relié à : " + linkTitles(x0).join(", ") }) : null]),
        el("div", { class: "fwbtns" }, [linkBtn(l, function () { return b.firstChild; }),
          el("button", { type: "button", class: "btn primary", text: "Tout confirmer", on: { click: function (e) { all(e, "ok", "tout confirmé"); } } }),
          el("button", { type: "button", class: "btn ghost", text: "Tout écarter", on: { click: function (e) { all(e, "no", "tout écarté"); } } })])])]);
      function all(e, s, label) {
        e.target.disabled = true; msg.textContent = "Enregistrement…";
        var ys = l.map(function (x) { var y = JSON.parse(JSON.stringify(x)); y.status = s; y.by = user && user.login || ""; y.at = new Date().toISOString(); return y; });
        var bs = JSON.parse(JSON.stringify(l));
        selPut(ys, "Sélections : " + (x0.title || "") + " — " + label).then(function () {
          immPush({ label: (x0.title || "") + " — " + label, undo: function () { return selPut(bs, "Sélections : annulé"); }, redo: function () { return selPut(ys, "Sélections : rétabli"); } });
          draw();
        }, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
      }
      l.sort(function (a, b) { return when(b).localeCompare(when(a)); }).forEach(function (x) {
        var r = el("div", { class: "selrow" }, [badge(x), el("div", { class: "selwhat" }, [el("strong", { text: festLine(x) }), el("span", { text: what(x) || (x.source === "claude" ? "" : "") })]),
          el("div", { class: "selsrc" }, (x.urls || []).slice(0, 2).map(function (u) { return el("a", { href: u, target: "_blank", rel: "noopener", text: u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] + " ↗" }); })),
          el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn", title: "C'est nous", text: "✓", on: { click: function (e) { e.target.disabled = true; setSt(x, "ok", "confirmé"); } } }),
            el("button", { type: "button", class: "btn ghost", title: "Pas nous", text: "✗", on: { click: function (e) { e.target.disabled = true; setSt(x, "no", "écarté"); } } })])]);
        b.appendChild(r);
        if (x.snippet && x.source !== "claude") b.appendChild(el("p", { class: "selsnip", text: "… " + x.snippet + " …" }));
      });
      b.appendChild(msg);
      return b;
    }
    // Une ligne de « Récent » / « Toutes nos sélections » ; « Modifier » ouvre le formulaire en place.
    function dupText(x) {
      var k = typeof x.dupOf === "string" && sel.found.filter(function (y) { return y.id === x.dupOf; })[0];
      return k ? "Doublon de : " + (k.title || "") + " · " + festLine(k) + (what(k) ? " — " + what(k) : "") + (k.status === "ok" ? " (gardée)" : "") : "Doublon d'une autre trouvaille (gardée)";
    }
    function line(x) {
      var r = el("div", { class: "selrow ok" + (x.status === "no" ? " no" : "") }, [badge(x),
        el("div", { class: "selwhat" }, [el("strong", {}, [tri(x), x.title || "Sans titre"]), el("span", { text: festLine(x) + (what(x) ? " — " + what(x) : "") }),
          el("small", { text: [typeOf(x), (x.directors || []).length && "réal. " + x.directors.join(", "), "DoP " + (x.dops || []).map(rcBase).join(", ")].filter(Boolean).join(" · ") }),
          linkTitles(x).length ? el("small", { class: "sellinks", text: "Relié à : " + linkTitles(x).join(", ") }) : null,
          x.status === "no" && x.dupOf ? el("small", { class: "sellinks", text: dupText(x) }) : null]),
        el("div", { class: "selsrc" }, (x.urls || []).slice(0, 1).map(function (u) { return el("a", { href: u, target: "_blank", rel: "noopener", text: "source ↗" }); })),
        el("div", { class: "fwbtns" }, x.status === "no" ? [x.dupOf ? el("button", { type: "button", class: "btn ghost", text: "Pas un doublon", on: { click: function () {
            var y = JSON.parse(JSON.stringify(x)); y.status = "ok"; delete y.dupOf; y.by = user && user.login || ""; y.at = new Date().toISOString(); save(x, y, "pas un doublon"); } } })
          : el("button", { type: "button", class: "btn ghost", text: "Finalement c'est nous", on: { click: function () { setSt(x, "ok", "confirmé"); } } })]
          : [linkBtn([x], function () { return r; }), el("button", { type: "button", class: "btn ghost", text: "Modifier", on: { click: function () { form(x, r); } } })])]);
      return r;
    }
    // Formulaire (ajout à la main ou modification) : film, festival (libre), ville, année, type, prix, section, prix de l'image.
    function form(x0, at) {
      var old = box.querySelector(".seladd"); if (old) old.remove();
      var x = x0 ? JSON.parse(JSON.stringify(x0)) : { kind: "selection", status: "ok", manual: true, edition: String(new Date().getFullYear()) }, chosen = x0 ? { id: x.project } : null;
      var projs = (proj && proj.projects || []).filter(function (p) { return p.title && !p.workTitle; }); // autres agences comprises (Gus 18/11)
      var q = el("input", { type: "search", class: "nodirty", placeholder: "Titre du film, réalisateur, chef op…", value: x.title || "" }), res = el("div", { class: "selres" });
      q.addEventListener("input", function () {
        var w = nrm(q.value).split(/\s+/).filter(Boolean); res.textContent = ""; chosen = null;
        if (!w.length) return;
        projs.filter(function (p) { var h = nrm([p.title, (p.directors || []).join(" "), (p.dops || []).join(" ")].join(" ")); return w.every(function (v) { return h.indexOf(v) > -1; }); }).slice(0, 8).forEach(function (p) {
          res.appendChild(el("button", { type: "button", class: "selpick", on: { click: function () { chosen = p; q.value = p.title; res.textContent = ""; res.appendChild(el("p", { class: "hint", text: typeOf(p) + " · DoP " + rcDop(p) })); } } },
            [el("strong", { text: p.title }), el("small", { text: [typeOf(p), (p.directors || []).join(", "), rcDop(p), p.start ? p.start.slice(0, 4) : ""].filter(Boolean).join(" · ") })]));
        });
      });
      var names = {}; ((fest && fest.festivals) || []).forEach(function (f) { names[f.name] = 1; }); sel.found.forEach(function (y) { names[y.festName] = 1; });
      var dl = el("datalist", { id: "selfests" }, Object.keys(names).sort().map(function (n) { return el("option", { value: n }); }));
      function inp(k, ph) { var i = el("input", { type: "text", class: "nodirty", placeholder: ph, value: x[k] || "" }); i.addEventListener("input", function () { x[k] = i.value.trim(); }); return el("label", { class: "field" }, [el("span", { class: "label", text: ph }), i]); }
      var fn = inp("festName", "Festival"); fn.querySelector("input").setAttribute("list", "selfests");
      var kinds = el("div", { class: "fchips" });
      [["selection", "Sélection"], ["nomination", "Nomination"], ["prize", "Prix"]].forEach(function (k) {
        kinds.appendChild(el("button", { type: "button", class: "chip" + (x.kind === k[0] ? " on" : ""), "data-k": k[0], text: k[1], on: { click: function () { x.kind = k[0]; kinds.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c.dataset.k === k[0]); }); form2.classList.add("changed"); } } }));
      });
      var img = el("label", { class: "rcag" }, [el("input", { type: "checkbox", class: "nodirty" }), "Prix ou nomination pour l'image"]);
      img.firstChild.checked = !!x.image; img.firstChild.addEventListener("change", function () { x.image = img.firstChild.checked; });
      var msg = el("span", { class: "fmsg" });
      var form2 = el("article", { class: "fcard fedit seladd" }, [dl,
        el("label", { class: "field" }, [el("span", { class: "label", text: "Film" }), q, res]),
        el("div", { class: "fgrid" }, [fn, inp("city", "Ville"), inp("edition", "Année")]),
        el("div", { class: "field" }, [el("span", { class: "label", text: "Type" }), kinds, img]),
        el("div", { class: "fgrid" }, [inp("prize", "Prix (nom exact)"), inp("section", "Section (ex. Compétition officielle)"), inp("country", "Pays")]),
        el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: x0 ? "Enregistrer" : "Ajouter", on: { click: function (e) {
          if (!chosen) { msg.textContent = "Choisissez un film dans la liste."; return; }
          if (!x.festName) { msg.textContent = "Il faut le nom du festival."; return; }
          if (!x0) { var p = chosen; Object.assign(x, { id: "m" + Date.now().toString(36), project: p.id, title: p.title, type: p.type, genre: p.genre, directors: p.directors || [], dops: p.dops || [], urls: [] }); }
          else if (chosen.title) Object.assign(x, { project: chosen.id, title: chosen.title, type: chosen.type, genre: chosen.genre, directors: chosen.directors || [], dops: chosen.dops || [] });
          if (x.kind === "selection") delete x.prize;
          x.by = user && user.login || ""; x.at = new Date().toISOString(); x.status = "ok";
          e.target.disabled = true; msg.textContent = "Enregistrement…";
          save(x0, x, x0 ? "modifié" : "ajouté").catch(function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
        } } }),
          x0 ? el("button", { type: "button", class: "btn ghost", text: "Retirer de nos sélections", on: { click: function () { setSt(x0, "no", "retiré"); } } }) : null,
          el("button", { type: "button", class: "btn ghost", text: "Annuler", on: { click: function () { form2.remove(); } } }), msg])
      ]);
      at.after(form2); if (!x0) q.focus();
    }
    function add(btn) { form(null, btn.parentNode); }
  }
