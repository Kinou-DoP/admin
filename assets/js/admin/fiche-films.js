// Fiche d'un chef op (2/3) : films, sélection, recadrage, portée, téléphone, filmCard
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  function filmsSection() {
    var sec = el("section", {}, [el("h2", { text: "Films" })]);
    if (!slate) {
      sec.appendChild(el("p", { class: "empty", text: "Pas encore de films sur cette page." }));
      if (pagePublish === publish) sec.appendChild(el("button", { type: "button", class: "btn primary selbtn", text: "Créer une sélection", on: { click: function () { selEditor(); } } }));
      return sec;
    }
    // ALL (admin seulement) : tous les films de toutes les catégories, chacun une seule fois.
    var cats = ["ALL"].concat(slate.categories);
    if (!curCat || cats.indexOf(curCat) < 0) curCat = "ALL";
    var tabs = el("div", { class: "tabs" });
    cats.forEach(function (cat) {
      var b = el("button", { text: cat, class: cat === curCat ? "on" : "" });
      b.addEventListener("click", function () { curCat = cat; sec.replaceWith(filmsSection()); });
      tabs.appendChild(b);
    });
    sec.appendChild(tabs);
    if (pagePublish === publish) sec.insertBefore(el("button", { type: "button", class: "btn primary selbtn", text: "Modifier la sélection", on: { click: selEditor } }), tabs);
    if (pagePublish === publish && state.slug) sec.insertBefore(infoRobotCtl(), tabs);
    // Fiche d'un chef op : interrupteur de l'onglet ouvert → présentation « vidéo + stills » sur le site (`showcase`) : par projet la
    // vidéo en grand, titre et crédits à côté, les 6 premiers stills (liens de stills ajoutés sous le film) autour.
    if (pagePublish === publish && curCat !== "ALL") {
      var on = (state.showcase || []).indexOf(curCat) > -1;
      var sw = el("input", { type: "checkbox", class: "nodirty" }); sw.checked = on;
      sw.addEventListener("change", function () {
        var l = (state.showcase || []).filter(function (c) { return c !== curCat; });
        if (sw.checked) l.push(curCat);
        if (l.length) state.showcase = l; else delete state.showcase;
        touch(); sec.replaceWith(filmsSection());
      });
      sec.appendChild(el("label", { class: "showsw" }, [sw, el("i"), el("span", { text: "Présentation vidéo + stills" }),
        el("small", { text: on ? "Sur le site, chaque projet de « " + curCat + " » : la vidéo en grand, ses 6 premiers stills autour (ajoutez un lien de stills sous chaque film)." : "" })]));
    }
    var seen = {};
    var list = slate.clips.filter(function (c) {
      if (curCat === "ALL") { if (seen[c.slate]) return false; seen[c.slate] = true; return true; }
      return curCat === "FEATURED" ? c.featured : c.cat === curCat;
    });
    if (curCat === "FEATURED") list.sort(function (a, b) { return a.featuredOrder - b.featuredOrder; });
    var grid = el("div", { class: "films" });
    list.forEach(function (c) { grid.appendChild(filmCard(c)); });
    sec.appendChild(grid);
    sec.appendChild(el("p", { class: "hint", text: pagePublish === publish ? "Onglets, films et ordre : « Modifier la sélection » (la page ne lit plus Slate). Les corrections de titre et de crédits restent attachées au film." : "L'ordre et les catégories viennent de Slate. Les corrections de titre et de crédits restent attachées au film même s'il change de place sur Slate." }));
    return sec;
  }

  // « Modifier la sélection » (Gus 25/11) : onglets de la page et films de chaque onglet, sans Slate. Films ajoutés depuis la
  // filmothèque (bibLoad : tous nos films, Slate compris) ; glisser ou ↑ ↓ pour l'ordre ; FEATURED = ordre du showreel (un film
  // de FEATURED peut n'être dans aucun autre onglet). « Valider et publier » réécrit `categories` et `clips` de la fiche (les
  // corrections `overrides` restent attachées à chaque film par son id) puis publie : la page du site change tout de suite.
  var selOpen = null; // { slug, tab } : sélection à ouvrir en arrivant sur la fiche (clic dans les bundles / bandes de la filmothèque)
  // cfg (accueil, spotlight, fiction, Gus 26/11) : { title, tab, items (films de la page), apply(ids, film) } : une seule liste, sans
  // onglets ni filtre de chef op ; apply reçoit l'ordre (ids Slate) et film(id) = le film de la page ou du video club.
  function selEditor(startTab, cfg) {
    if (typeof startTab !== "string") startTab = null;
    var base = cfg ? { name: cfg.title, categories: [cfg.tab], clips: cfg.items.map(function (c) { return Object.assign({}, c, { cat: cfg.tab }); }) }
      : slate || { name: state.name, categories: ["FEATURED"], clips: [] }; // fiche sans films : « Créer une sélection »
    var byId = {}, extra = {};
    // Id d'un film : son id Slate, ou sa clé du video club pour les imports sans Slate (stills « i… », vidéos de l'ordinateur « e… »),
    // qui peuvent ainsi entrer dans une page (Gus 25/11 : un projet de stills importé était introuvable ici).
    function sid(f) { return f.slate || f.key; }
    base.clips.forEach(function (c) { if (!byId[c.slate]) byId[c.slate] = c; });
    function uniq(l) { var seen = {}; return l.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }
    var tabs = base.categories.map(function (name) {
      var l = name === "FEATURED" ? base.clips.filter(function (c) { return c.featured; }).sort(function (a, b) { return a.featuredOrder - b.featuredOrder; })
        : base.clips.filter(function (c) { return c.cat === name; });
      return { name: name, ids: uniq(l.map(function (c) { return c.slate; })) };
    });
    var cur = Math.max(0, startTab ? tabs.map(function (t) { return t.name; }).indexOf(startTab) : 0), q = "", lib = null, changedSel = false;
    function info(id) { var c = byId[id] || extra[id] || {}; return { title: (!cfg && val(c, "title")) || c.title || c.film || "", sub: ((!cfg && val(c, "sub")) || c.sub || [c.dir, c.prod].filter(Boolean).join("\n") || (c.dps || []).map(function (d) { return d.name || d; }).join(", ")).split("\n").filter(Boolean).join(" · "), img: c.img }; }
    var ov = el("div", { class: "bmodal" }), box = el("div", { class: "bmbox selbox" });
    function close(force) {
      if (!force && changedSel && !window.confirm("Fermer sans enregistrer les changements de la sélection ?")) return;
      ov.classList.add("out"); setTimeout(function () { ov.remove(); }, 160); document.removeEventListener("keydown", esc);
    }
    function esc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", esc);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    var tabRow = el("div", { class: "seltabs" }), left = el("div", { class: "selleft" }), right = el("div", { class: "selright" });
    var search = el("input", { type: "text", placeholder: "Chercher dans le video club : titre, chef op, réal, prod, client…" }), results = el("div", { class: "selres" });
    function ch() { changedSel = true; }
    function drawTabs() {
      tabRow.textContent = "";
      tabs.forEach(function (t, i) {
        var chipT = el("button", { type: "button", class: "chip seltab" + (i === cur ? " on" : "") + (popTab === i ? " pop" : ""), "data-i": String(i), title: cfg ? "" : "Cliquer pour ouvrir, glisser pour changer l'ordre (on peut aussi y déposer un film)", text: t.name + " (" + t.ids.length + ")", on: { click: function () { if (Date.now() - dragAt < 300) return; cur = i; drawAll(); } } });
        if (!cfg) chipT.addEventListener("pointerdown", function (e) { tabDrag(e, i, chipT); });
        tabRow.appendChild(chipT);
      });
      if (cfg) return; // une seule liste
      tabRow.appendChild(el("button", { type: "button", class: "btn ghost", text: "+ Onglet", on: { click: function () {
        var n = (window.prompt("Nom du nouvel onglet (ex. COMMERCIAL, MUSIC VIDEO) :") || "").trim().toUpperCase(); if (!n) return;
        if (tabs.some(function (t) { return t.name === n; })) return window.alert("L'onglet « " + n + " » existe déjà.");
        tabs.push({ name: n, ids: [] }); cur = tabs.length - 1; ch(); drawAll();
      } } }));
      var t = tabs[cur]; if (!t) return;
      var tools = el("div", { class: "seltools" }, [el("span", { class: "label", text: "Onglet « " + t.name + " »" })]);
      if (cur > 0) tools.appendChild(el("button", { type: "button", class: "btn ghost", text: "← Avancer", on: { click: function () { tabs.splice(cur - 1, 0, tabs.splice(cur, 1)[0]); cur--; ch(); drawAll(); } } }));
      if (cur < tabs.length - 1) tools.appendChild(el("button", { type: "button", class: "btn ghost", text: "Reculer →", on: { click: function () { tabs.splice(cur + 1, 0, tabs.splice(cur, 1)[0]); cur++; ch(); drawAll(); } } }));
      if (t.name !== "FEATURED") tools.appendChild(el("button", { type: "button", class: "btn ghost", text: "Renommer", on: { click: function () {
        var n = (window.prompt("Nouveau nom de l'onglet :", t.name) || "").trim().toUpperCase(); if (!n || n === t.name) return;
        if (tabs.some(function (x) { return x.name === n; })) return window.alert("L'onglet « " + n + " » existe déjà.");
        if (state.showcase) state.showcase = state.showcase.map(function (c) { return c === t.name ? n : c; });
        t.name = n; ch(); drawAll();
      } } }));
      tools.appendChild(el("button", { type: "button", class: "btn ghost", text: "Supprimer l'onglet", on: { click: function () {
        if (t.ids.length && !window.confirm("Supprimer l'onglet « " + t.name + " » et ses " + t.ids.length + " films de la page ?")) return;
        tabs.splice(cur, 1); cur = Math.max(0, cur - 1); ch(); drawAll();
      } } }));
      tabRow.appendChild(tools);
    }
    // Glisser comme dans les bandes du video club (Gus 26/11) : le film suit la souris avec l'effet ressort (bibFly), un trait montre
    // la place ; déposé sur un autre onglet, il y passe (FEATURED : il y est ajouté sans quitter son onglet, et inversement).
    var dragAt = 0, popTab = -1, popRow = -1;
    function filmDrag(e, i, row, img) {
      if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button")) return;
      var t = tabs[cur], sx = e.clientX, sy = e.clientY, fly = null, ph = null, at = i, over = null;
      function rows() { return [].filter.call(left.children, function (x) { return x.classList.contains("selitem") && x !== row; }); }
      function mv(ev) {
        if (!fly) { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return; fly = bibFly(ev, [img], 1); row.classList.add("dragged"); document.body.classList.add("bdragging"); }
        ev.preventDefault(); fly.move(ev);
        var hit = document.elementFromPoint(ev.clientX, ev.clientY), chip = hit && hit.closest(".seltab");
        if (over && over !== chip) over.classList.remove("drop");
        over = chip && +chip.dataset.i !== cur ? chip : null;
        if (over) { over.classList.add("drop"); if (ph) { ph.remove(); ph = null; } return; }
        var rs = rows(); at = rs.length;
        for (var k = 0; k < rs.length; k++) { var r = rs[k].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { at = k; break; } }
        if (!ph) ph = el("div", { class: "bph" });
        var ref = rs[at] || (rs.length ? rs[rs.length - 1].nextSibling : row.nextSibling);
        if (ph.nextSibling !== ref) left.insertBefore(ph, ref);
      }
      function up() {
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
        if (!fly) return;
        dragAt = Date.now(); document.body.classList.remove("bdragging"); row.classList.remove("dragged");
        if (over) {
          var j = +over.dataset.i, dest = tabs[j], id = t.ids[i]; fly.end(over.getBoundingClientRect()); over.classList.remove("drop");
          if (dest.ids.indexOf(id) < 0) dest.ids.push(id);
          if (t.name !== "FEATURED" && dest.name !== "FEATURED") t.ids.splice(i, 1);
          popTab = j; ch(); drawAll(); popTab = -1; return;
        }
        fly.end(ph ? ph.getBoundingClientRect() : null); if (ph) ph.remove();
        if (at === i) return;
        t.ids.splice(at, 0, t.ids.splice(i, 1)[0]); popRow = at; ch(); drawLeft(); popRow = -1;
      }
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    }
    function tabDrag(e, i, chip) {
      if (e.button !== 0 || e.pointerType === "touch") return;
      var sx = e.clientX, sy = e.clientY, fly = null, ph = null, at = i, t = tabs[i], f0 = t.ids[0] ? info(t.ids[0]) : {};
      function chips() { return [].filter.call(tabRow.querySelectorAll(".seltab"), function (x) { return x !== chip; }); }
      function mv(ev) {
        if (!fly) { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return; fly = { move: function () {}, end: function () {} }; /* onglets : pas d'image qui suit la souris (Gus 26/11) */ chip.classList.add("dragged"); document.body.classList.add("bdragging"); }
        ev.preventDefault(); fly.move(ev);
        var cs = chips(); at = cs.length;
        for (var k = 0; k < cs.length; k++) { var r = cs[k].getBoundingClientRect(); if (ev.clientY < r.bottom && ev.clientX < r.left + r.width / 2) { at = k; break; } }
        if (!ph) ph = el("span", { class: "bphv" });
        var ref = cs[at] || (cs.length ? cs[cs.length - 1].nextSibling : chip.nextSibling);
        if (ph.nextSibling !== ref) tabRow.insertBefore(ph, ref);
      }
      function up() {
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
        if (!fly) return;
        dragAt = Date.now(); document.body.classList.remove("bdragging"); chip.classList.remove("dragged");
        fly.end(ph ? ph.getBoundingClientRect() : null); if (ph) ph.remove();
        if (at === i) return;
        var curT = tabs[cur]; tabs.splice(at, 0, tabs.splice(i, 1)[0]); cur = tabs.indexOf(curT); popTab = at; ch(); drawAll(); popTab = -1;
      }
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    }
    function drawLeft() {
      left.textContent = ""; var t = tabs[cur];
      if (!t) { left.appendChild(el("p", { class: "empty", text: "Aucun onglet : « + Onglet » pour commencer." })); return; }
      if (!t.ids.length) left.appendChild(el("p", { class: "empty", text: "Onglet vide : ajoutez des films avec « + » à droite." }));
      t.ids.forEach(function (id, i) {
        var f = info(id), th = el("div", { class: "selth" }); if (f.img) th.style.backgroundImage = 'url("' + imgShow(f.img) + '")';
        var row = el("div", { class: "selitem selmove" + (popRow === i ? " pop" : ""), title: "Glisser pour changer l'ordre, ou sur un onglet pour l'y mettre" }, [el("span", { class: "selnum", text: String(i + 1) }), th,
          el("div", { class: "seltxt" }, [el("b", { text: f.title || "(sans titre)" }), el("small", { text: f.sub })]),
          el("button", { type: "button", class: "btn ghost", text: "↑", title: "Monter", on: { click: function () { if (i) { t.ids.splice(i - 1, 0, t.ids.splice(i, 1)[0]); ch(); drawLeft(); } } } }),
          el("button", { type: "button", class: "btn ghost", text: "↓", title: "Descendre", on: { click: function () { if (i < t.ids.length - 1) { t.ids.splice(i + 1, 0, t.ids.splice(i, 1)[0]); ch(); drawLeft(); } } } }),
          el("button", { type: "button", class: "btn ghost", text: "×", title: "Retirer de l'onglet", on: { click: function () { t.ids.splice(i, 1); ch(); drawAll(); } } })]);
        row.addEventListener("pointerdown", function (e) { filmDrag(e, i, row, f.img || ""); });
        left.appendChild(row);
      });
    }
    // Liste de droite = le video club en petit (Gus 25/11) : filtres en étiquettes (chef op, réal, prod, client, type, catégorie ;
    // à l'ouverture : le chef op de la fiche), suggestions en tapant, mots libres, plus récents en haut ; clic sur l'image = aperçu.
    var chips = !cfg && rcBase(state.name || "") ? [{ type: "dop", value: rcBase(state.name || "") }] : [], chipsBox = el("div", { class: "bibchips selchips" }), sugBox = el("div", { class: "bibsug selsug", hidden: true });
    function isDefault() { if (cfg) return !chips.length; return chips.length === 1 && chips[0].type === "dop" && bnrm(chips[0].value) === bnrm(rcBase(state.name || "")); }
    function drawSug() {
      sugBox.textContent = ""; var words = bnrm(q).split(" ").filter(Boolean), per = {};
      if (!lib || !words.length) { sugBox.hidden = true; return; }
      var hits = lib.sug.filter(function (s) { var n = bnrm(s.value); return words.every(function (w) { return n.indexOf(w) > -1; }) && !chips.some(function (c) { return c.type === s.type && bnrm(c.value) === bnrm(s.value); }); })
        .sort(function (x, y) { var px = bnrm(x.value).indexOf(words[0]) === 0 ? 0 : 1, py = bnrm(y.value).indexOf(words[0]) === 0 ? 0 : 1; return BIB_ORDER.indexOf(x.type) - BIB_ORDER.indexOf(y.type) || px - py || y.n - x.n; })
        .filter(function (s) { per[s.type] = (per[s.type] || 0) + 1; return per[s.type] <= 3; }).slice(0, 10);
      hits.forEach(function (s) {
        sugBox.appendChild(el("button", { type: "button", on: { mousedown: function (e) { e.preventDefault(); }, click: function () { chips.push({ type: s.type, value: s.value }); search.value = q = ""; sugBox.hidden = true; drawRight(); search.focus(); } } },
          [el("span", { class: "bst t-" + s.type, text: BIB_T[s.type] }), el("span", { text: s.value }), el("span", { class: "bsn", text: s.n + " film" + (s.n > 1 ? "s" : "") })]));
      });
      sugBox.hidden = !hits.length;
    }
    var shownR = [], maxR = 150, lastKey = "";
    function addFilm(f) {
      var id = sid(f), t = tabs[cur]; if (!id || !t || t.ids.indexOf(id) > -1) return;
      if (!byId[id] && !extra[id]) extra[id] = f;
      if (cfg && cfg.top) t.ids.unshift(id); else t.ids.push(id); ch(); drawAll();
    }
    function drawRight() {
      results.textContent = ""; chipsBox.textContent = ""; var t = tabs[cur];
      chips.forEach(function (c, i) { chipsBox.appendChild(el("button", { type: "button", class: "bchip", title: "Retirer ce filtre", on: { click: function () { chips.splice(i, 1); drawRight(); } } }, [el("span", { class: "bst t-" + c.type, text: BIB_T[c.type] }), c.value + " ×"])); });
      if (!lib) { results.appendChild(el("p", { class: "empty", text: "Chargement du video club…" })); return; }
      var words = bnrm(q).split(" ").filter(Boolean), onPage = {};
      base.clips.forEach(function (c) { onPage[c.slate] = 1; }); Object.keys(extra).forEach(function (k) { onPage[k] = 1; });
      var withPage = isDefault() && !words.length; // à l'ouverture : les films du chef op + ceux de la page
      var list = lib.films.filter(function (f) { return sid(f) && ((withPage && onPage[sid(f)]) || (chips.every(function (c) { return bibMatch(f, c); }) && words.every(function (w) { return f.hay.indexOf(w) > -1; }))); });
      if (withPage) Object.keys(onPage).forEach(function (id) { if (/^\d+$/.test(id)) id = +id; if (!lib.byS[id]) list.push({ slate: id, title: info(id).title, img: info(id).img, dops: [] }); });
      var key = JSON.stringify([q, chips]); if (key !== lastKey) { lastKey = key; maxR = 150; } // nouvelle recherche : 150 d'abord
      results.appendChild(el("p", { class: "hint", text: list.length + " film" + (list.length > 1 ? "s" : "") + (withPage && !cfg ? " (ceux du chef op et de la page)" : "") + " · les plus récents en haut" }));
      shownR = list.slice(0, maxR);
      shownR.forEach(function (f) {
        var inTab = t && t.ids.indexOf(sid(f)) > -1, th = el("div", { class: "selth", title: "Voir le film" }); if (f.img) th.style.backgroundImage = 'url("' + imgShow(f.img) + '")';
        th.addEventListener("click", function () { selPreview(f); });
        results.appendChild(el("div", { class: "selitem" }, [th, el("div", { class: "seltxt" }, [el("b", { text: f.title || "(sans titre)" }),
          el("small", { text: [(f.dops || []).join(", "), f.dir, f.prod, f.client].filter(Boolean).join(" · ") })]),
          el("button", { type: "button", class: "btn" + (inTab ? " ghost" : ""), text: inTab ? "✓" : "+", title: inTab ? "Déjà dans l'onglet" : cfg && cfg.top ? "Ajouter en haut" : "Ajouter à la fin de l'onglet", on: { click: function () {
            if (!t || inTab) return; addFilm(f);
          } } })]));
      });
      if (list.length > maxR) results.appendChild(el("button", { type: "button", class: "btn ghost rcmore", text: "Afficher plus (" + (list.length - maxR) + ")", on: { click: function () { var y = results.scrollTop; maxR += 150; drawRight(); results.scrollTop = y; } } })); // Gus 26/11
      if (!list.length) results.appendChild(el("p", { class: "empty", text: "Aucun film trouvé" + (chips.length ? " avec ces filtres (× pour en retirer)." : ".") }));
    }
    function drawAll() { drawTabs(); drawLeft(); drawRight(); }
    search.addEventListener("input", function () { q = search.value; drawRight(); drawSug(); });
    search.addEventListener("blur", function () { setTimeout(function () { sugBox.hidden = true; }, 150); });
    function selPreview(f) { // aperçu avec ‹ › dans la liste de droite et « + » = ajouter à l'onglet ouvert (Gus 26/11)
      var l = shownR.indexOf(f) > -1 ? shownR : [f];
      navPlayer(l, l.indexOf(f), { addLabel: "Ajouter à « " + (tabs[cur] ? tabs[cur].name : "") + " »", inLabel: "Dans l'onglet", has: function (x) { var t = tabs[cur]; return t && t.ids.indexOf(sid(x)) > -1; }, add: function (x) { addFilm(x); } });
    }
    var ok = el("button", { type: "button", class: "btn primary", text: "Valider et publier" });
    ok.addEventListener("click", function () {
      if (cfg) { changedSel = false; close(true); cfg.apply(tabs[0].ids.slice(), function (id) { return byId[id] || extra[id]; }); return; }
      var feat = (tabs.filter(function (t) { return t.name === "FEATURED"; })[0] || { ids: [] }).ids, clips = [];
      function clipFor(id) {
        var o = byId[id], c;
        if (o) { c = JSON.parse(JSON.stringify(o)); delete c.featured; delete c.featuredOrder; return c; }
        var f = extra[id], me = bnrm(rcBase(state.name || "")), co = (f.dops || []).filter(function (d) { return bnrm(rcBase(d)) !== me; });
        c = { title: f.title || "" }; var sub = [f.dir, f.prod].filter(Boolean); if (co.length) sub.push("co-DoP " + co.join(", "));
        if (sub.length) c.sub = sub.join("\n"); if (f.video) c.video = f.video; if (f.full) c.full = f.full; if (f.img) c.img = f.img;
        if (f.images && f.images.length && !f.video && !f.full) c.stills = f.images.slice();
        c.slate = id; return c;
      }
      tabs.forEach(function (t) { if (t.name !== "FEATURED") t.ids.forEach(function (id) { var c = clipFor(id); c.cat = t.name; clips.push(c); }); });
      feat.forEach(function (id) { if (!clips.some(function (c) { return c.slate === id; })) { var c = clipFor(id); c.cat = ""; clips.push(c); } });
      clips.forEach(function (c) { var k = feat.indexOf(c.slate); if (k > -1) { c.featured = true; c.featuredOrder = k + 1; } });
      slate = { name: base.name || state.name, categories: tabs.map(function (t) { return t.name; }), clips: clips };
      if (state.showcase) { state.showcase = state.showcase.filter(function (c) { return slate.categories.indexOf(c) > -1; }); if (!state.showcase.length) delete state.showcase; }
      if (state.open && !clips.some(function (c) { return c.slate === state.open; })) state.open = feat[0] || (clips[0] && clips[0].slate);
      curCat = null; touch(); close(true); render(); publish();
    });
    box.appendChild(el("span", { class: "label", text: "Sélection de la page · " + (cfg ? cfg.title : state.name || "") }));
    box.appendChild(tabRow);
    box.appendChild(el("div", { class: "selgrid" }, [left, el("div", { class: "selsearch" }, [search, sugBox, chipsBox, results])]));
    box.appendChild(el("div", { class: "selfoot" }, [el("button", { type: "button", class: "btn ghost", text: "Annuler", on: { click: function () { close(); } } }), ok]));
    ov.appendChild(box); document.body.appendChild(ov); drawAll(); search.focus();
    bibLoad().then(function (d) {
      var byS = {}; d.films.forEach(function (f) { var id = sid(f); if (id && !byS[id]) byS[id] = f; });
      lib = { films: d.films, byS: byS, sug: d.sug }; drawRight();
    }, function (e) { results.textContent = ""; results.appendChild(el("p", { class: "empty", text: "Video club illisible : " + e.message })); });
  }

  // Recadrage d'un extrait (zoom 100 à 250 % ; 4:3 et bandes noires épaisses) pour enlever les bandes noires, avec aperçu :
  // l'extrait joue dans la vignette au survol et pendant le réglage. get() : zoom actuel ; set(z) : enregistre (1 = aucun).
  // getP / setP : position du cadre, "X% Y%" (absent = centre) ; le site s'en sert comme transform-origin / background-position.
  // getT / setT (optionnels) : case « aussi sur la vignette » (sinon seul l'extrait est recadré).
  var zoomStopOther = null; // un seul extrait joue à la fois : lancer un aperçu arrête le précédent
  // tch (facultatif) : appelé à chaque changement à la place de tch() (fenêtre d'un film du video club).
  function zoomCtl(thumb, video, get, set, getP, setP, getT, setT, tch) {
    tch = tch || touch;
    var range = el("input", { type: "range", min: "100", max: "250", step: "1", class: "nodirty", value: String(Math.round((get() || 1) * 100)) });
    var lab = el("span", { class: "zval" }), v = null, adjusting = false, drag = null;
    var center = el("button", { class: "zcenter", text: "Recentrer" });
    // Pendant le réglage : l'extrait entier, et un cadre rouge fin = la partie gardée (taille de la vignette),
    // qu'on déplace en cliquant-glissant (ou au doigt).
    var frame = el("i", { class: "zframe" });
    function pos() { var m = /^([\d.]+)% ([\d.]+)%$/.exec(getP() || ""); return m ? [+m[1], +m[2]] : [50, 50]; }
    function apply() {
      var z = get() || 1, w = 100 / z, p = pos(), o = p[0] + "% " + p[1] + "%";
      lab.textContent = z > 1 ? "Recadrage " + Math.round(z * 100) + " %" : "Recadrage : aucun";
      var onThumb = z > 1 && getT && getT() && !adjusting;
      thumb.style.backgroundSize = onThumb ? z * 100 + "% auto" : "";
      thumb.style.backgroundPosition = onThumb ? o : "";
      if (v) { v.style.transform = adjusting ? "none" : "scale(" + z + ")"; v.style.transformOrigin = o; }
      frame.style.width = frame.style.height = w + "%";
      frame.style.left = p[0] * (100 - w) / 100 + "%";
      frame.style.top = p[1] * (100 - w) / 100 + "%";
      frame.hidden = !adjusting;
      center.hidden = !getP();
      if (adjusting && !frame.parentNode) thumb.appendChild(frame);
    }
    function halt() { adjusting = false; drag = null; if (v) { v.remove(); v = null; } apply(); }
    function play() {
      if (zoomStopOther && zoomStopOther !== halt) zoomStopOther();
      zoomStopOther = halt;
      var m = typeof video === "function" ? video() : video;
      if (v || !m) return;
      v = mkVid(m);
      thumb.appendChild(v); apply();
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    }
    function stop() { if (v && !adjusting) { v.remove(); v = null; } }
    range.addEventListener("pointerdown", function () { adjusting = true; play(); apply(); });
    range.addEventListener("input", function () {
      adjusting = true;
      var z0 = get() || 1, z = parseInt(range.value, 10) / 100, p = pos();
      set(z > 1 ? z : undefined);
      // Le cadre grandit ou rétrécit autour de son centre (pas autour de sa position enregistrée).
      if (getP() && z0 > 1 && z > 1) {
        var w0 = 1 / z0, w = 1 / z, c = function (n) { return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10; };
        var x = c(((p[0] / 100 * (1 - w0) + w0 / 2) - w / 2) / (1 - w) * 100), y = c(((p[1] / 100 * (1 - w0) + w0 / 2) - w / 2) / (1 - w) * 100);
        setP(x === 50 && y === 50 ? undefined : x + "% " + y + "%");
      }
      play(); apply(); tch();
    });
    range.addEventListener("blur", function () { if (drag) return; adjusting = false; apply(); stop(); });
    // Déplacement du cadre : le décalage en pixels devient une position de 0 à 100 % (bords compris).
    frame.addEventListener("pointerdown", function (e) {
      var z = get() || 1; if (z <= 1) return;
      e.preventDefault(); frame.setPointerCapture(e.pointerId);
      var r = thumb.getBoundingClientRect(), p = pos();
      drag = { x: e.clientX, y: e.clientY, p: p, sx: r.width * (1 - 1 / z) / 100, sy: r.height * (1 - 1 / z) / 100 };
    });
    frame.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var c = function (n) { return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10; };
      var x = c(drag.p[0] + (e.clientX - drag.x) / drag.sx), y = c(drag.p[1] + (e.clientY - drag.y) / drag.sy);
      setP(x === 50 && y === 50 ? undefined : x + "% " + y + "%"); apply(); tch();
    });
    function endDrag() { if (!drag) return; drag = null; range.focus({ preventScroll: true }); } // le réglage continue
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);
    center.addEventListener("click", function () { setP(undefined); apply(); tch(); });
    thumb.addEventListener("mouseenter", play);
    thumb.addEventListener("mouseleave", stop);
    // Clic sur l'image : réglage (extrait entier + cadre rouge), comme en touchant le curseur.
    thumb.addEventListener("pointerdown", function () { if (adjusting) return; adjusting = true; play(); apply(); setTimeout(function () { range.focus({ preventScroll: true }); }); });
    apply();
    var box = el("div", { class: "zoom" }, [lab, range, center]);
    box._show = function () { adjusting = true; play(); apply(); range.focus({ preventScroll: true }); };
    if (!setT) return box;
    var cb = el("input", { type: "checkbox", class: "nodirty" }); cb.checked = !!getT();
    // Case cochée ou décochée : extrait arrêté, la vignette (recadrée ou non) se voit tout de suite.
    cb.addEventListener("change", function () { setT(cb.checked || undefined); halt(); tch(); });
    return el("div", {}, [box, el("label", { class: "zthumb" }, [cb, "Aussi sur la vignette"])]);
  }

  // Fiction : cadrage cinémascope (2,39:1) d'un film en 16:9, réglé à part pour la vignette (thumbCrop) et pour l'extrait
  // (snipCrop) = { z, x, y }. Comme le recadrage des fiches : l'image entière, et un cadre rouge = la partie gardée (au format
  // 2,39:1), qu'on fait glisser ; le curseur 100–250 % le rétrécit (agrandissement sur le site). Même calcul que scopeCrop (site).
  var SCOPE = 2.39, SCOPE_H = (16 / 9) / SCOPE; // hauteur du cadre (sans agrandissement), en part de la hauteur de l'image
  function scopeCtl(c, thumb, video) {
    var mode = "thumbCrop", v = null, drag = null;
    var frame = el("i", { class: "zframe" }); thumb.appendChild(frame);
    function stopMine() { if (v) { v.remove(); v = null; } if (mode !== "thumbCrop") { mode = "thumbCrop"; apply(); } }
    function cur(k) { var o = (state.overrides[c.slate] || {})[k || mode] || {}; return { z: o.z || 1, x: o.x === undefined ? 50 : o.x, y: o.y === undefined ? 50 : o.y }; }
    function save(o) {
      var r = function (n) { return Math.round(n * 10) / 10; }, out = {};
      if (o.z > 1) out.z = Math.round(o.z * 100) / 100;
      if (r(o.x) !== 50) out.x = r(o.x);
      if (r(o.y) !== 50) out.y = r(o.y);
      setOverride(c, mode, Object.keys(out).length ? out : undefined); touch();
    }
    var range = el("input", { type: "range", min: "100", max: "250", step: "1", class: "nodirty" });
    var lab = el("span", { class: "zval" }), center = el("button", { class: "zcenter", type: "button", text: "Recentrer" });
    var tabs = el("div", { class: "stabs" });
    [["thumbCrop", "Vignette"], ["snipCrop", "Extrait"]].forEach(function (m) {
      var b = el("button", { type: "button", text: m[1] }); b.dataset.m = m[0];
      b.addEventListener("click", function () { mode = m[0]; apply(); });
      tabs.appendChild(b);
    });
    function apply() {
      var o = cur(), w = 1 / o.z, h = SCOPE_H / o.z;
      var m = typeof video === "function" ? video() : video;
      if (mode === "snipCrop" && m && !v) {
        if (zoomStopOther && zoomStopOther !== stopMine) zoomStopOther(); // un seul extrait joue à la fois
        zoomStopOther = stopMine;
        v = mkVid(m); thumb.insertBefore(v, frame); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      }
      if (mode !== "snipCrop" && v) { v.remove(); v = null; }
      frame.style.width = w * 100 + "%"; frame.style.height = h * 100 + "%";
      frame.style.left = o.x * (1 - w) + "%"; frame.style.top = o.y * (1 - h) + "%";
      [].forEach.call(tabs.children, function (b) { b.classList.toggle("on", b.dataset.m === mode); });
      range.value = String(Math.round(o.z * 100));
      lab.textContent = (mode === "snipCrop" ? "Extrait" : "Vignette") + " · cadre cinémascope" + (o.z > 1 ? " · " + Math.round(o.z * 100) + " %" : "");
      center.hidden = o.z === 1 && o.x === 50 && o.y === 50;
    }
    // Curseur : le cadre rétrécit ou grandit autour de son centre.
    range.addEventListener("input", function () {
      var o = cur(), z = parseInt(range.value, 10) / 100, w0 = 1 / o.z, h0 = SCOPE_H / o.z, w = 1 / z, h = SCOPE_H / z;
      var cx = o.x / 100 * (1 - w0) + w0 / 2, cy = o.y / 100 * (1 - h0) + h0 / 2, cl = function (n) { return Math.max(0, Math.min(100, n)); };
      save({ z: z, x: w < 1 ? cl((cx - w / 2) / (1 - w) * 100) : 50, y: cl((cy - h / 2) / (1 - h) * 100) }); apply();
    });
    center.addEventListener("click", function () { save({ z: 1, x: 50, y: 50 }); apply(); });
    // Déplacement du cadre : le décalage en pixels devient une position de 0 à 100 % (bords compris).
    frame.addEventListener("pointerdown", function (e) {
      e.preventDefault(); frame.setPointerCapture(e.pointerId);
      var r = thumb.getBoundingClientRect(), o = cur();
      drag = { x: e.clientX, y: e.clientY, o: o, sx: r.width * (1 - 1 / o.z), sy: r.height * (1 - SCOPE_H / o.z) };
    });
    frame.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var cl = function (n) { return Math.max(0, Math.min(100, n)); }, o = { z: drag.o.z, x: drag.o.x, y: drag.o.y };
      if (drag.sx > 0) o.x = cl(drag.o.x + (e.clientX - drag.x) / drag.sx * 100);
      if (drag.sy > 0) o.y = cl(drag.o.y + (e.clientY - drag.y) / drag.sy * 100);
      save(o); apply();
    });
    function end() { drag = null; }
    frame.addEventListener("pointerup", end); frame.addEventListener("pointercancel", end);
    apply();
    return el("div", { class: "zoom scopectl" }, [tabs, lab, range, center]);
  }

  // Fond de la liste des chefs op sur téléphone (écran en hauteur) : extrait du 1er film FEATURED, recadré en largeur.
  // On fait glisser la bande rouge (partie visible sur un téléphone) → overrides[<id>].phoneX (0–100, absent = centre),
  // object-position horizontale de #bgvid sur le site. Le recadrage (zoom / zoomPos) du film s'applique aussi.
  var PHONE_A = 9 / 17, VID_A = 16 / 9; // écran de téléphone, extrait
  function bgFilm() {
    return slate.clips.filter(function (c) { return c.featured && c.video && !(state.overrides[c.slate] || {}).hidden; })
      .sort(function (a, b) { return a.featuredOrder - b.featuredOrder; })[0];
  }
  // Vidéo d'aperçu : un extrait (adresse) ou un passage d'un film complet ({ src, start, end }) lu en boucle, sans le son.
  function mkVid(m, poster) {
    var seg = typeof m === "object" && m;
    var v = el("video", { muted: true, loop: !seg, playsinline: true, autoplay: true, poster: poster, src: seg ? m.src + "#t=" + m.start : m });
    v.muted = true;
    if (seg) v.addEventListener("timeupdate", function () { if (v.currentTime >= m.end || v.currentTime < m.start - .5) v.currentTime = m.start; });
    return v;
  }
  // Cadrage sur téléphone (écran en hauteur) d'un extrait affiché en plein écran : on fait glisser la bande rouge
  // (partie visible sur un téléphone) → phoneX (0–100, absent = centre) = object-position horizontale sur le site.
  // Le recadrage (zoom / zoomPos) s'applique aussi. o : { label, hint, poster, get(k), setX(v), media() }.
  function phoneCtl(o) {
    var btn = el("button", { type: "button", class: "pbtn", text: o.label });
    var box = el("div", { class: "pframe" }); box.hidden = true;
    var stage = el("div", { class: "pstage" }), band = el("i", { class: "pband" }), phone = el("div", { class: "pphone" });
    var center = el("button", { type: "button", class: "zcenter", text: "Recentrer" });
    var v1 = null, v2 = null, drag = null;
    function zp() { var m = /^([\d.]+)% ([\d.]+)%$/.exec(o.get("zoomPos") || ""); return m ? [m[1] / 100, m[2] / 100] : [.5, .5]; }
    function px() { return o.get("phoneX") !== undefined ? o.get("phoneX") / 100 : .5; }
    function apply() {
      var z = o.get("zoom") > 1 ? o.get("zoom") : 1, q = zp(), p = px(), a = PHONE_A;
      var x0 = q[0] * a * (1 - 1 / z), u0 = (x0 + (VID_A - a) * p) / VID_A;
      band.style.left = u0 * 100 + "%"; band.style.width = a / z / VID_A * 100 + "%";
      band.style.top = q[1] * (1 - 1 / z) * 100 + "%"; band.style.height = 100 / z + "%";
      if (v2) { v2.style.objectPosition = p * 100 + "% 50%"; v2.style.transform = "scale(" + z + ")"; v2.style.transformOrigin = q[0] * 100 + "% " + q[1] * 100 + "%"; }
      center.hidden = o.get("phoneX") === undefined;
    }
    function close() { box.hidden = true; if (v1) { v1.remove(); v2.remove(); v1 = v2 = null; } }
    btn.addEventListener("click", function () {
      if (!box.hidden) { close(); return; }
      if (zoomStopOther && zoomStopOther !== close) zoomStopOther();
      zoomStopOther = close;
      box.hidden = false; v1 = mkVid(o.media(), o.poster); v2 = mkVid(o.media(), o.poster);
      stage.insertBefore(v1, band); phone.appendChild(v2); apply();
    });
    band.addEventListener("pointerdown", function (e) { e.preventDefault(); band.setPointerCapture(e.pointerId); drag = { x: e.clientX, p: px(), w: stage.getBoundingClientRect().width }; });
    band.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = drag.p + (e.clientX - drag.x) / drag.w * VID_A / (VID_A - PHONE_A);
      p = Math.round(Math.max(0, Math.min(1, p)) * 1000) / 10;
      o.setX(p === 50 ? undefined : p); apply(); touch();
    });
    band.addEventListener("pointerup", function () { drag = null; });
    band.addEventListener("pointercancel", function () { drag = null; });
    center.addEventListener("click", function () { o.setX(undefined); apply(); touch(); });
    stage.appendChild(band);
    box.appendChild(el("p", { class: "hint", text: o.hint }));
    box.appendChild(el("div", { class: "prow" }, [stage, phone]));
    box.appendChild(center);
    apply();
    var wrap = el("div", { class: "pctl" }, [btn, box]);
    wrap._open = function () { if (box.hidden) btn.click(); };
    return wrap;
  }
  function filmPhoneCtl(c) {
    return phoneCtl({
      label: "Cadrage téléphone (fond de la liste)", poster: c.img,
      hint: "Faites glisser la bande rouge : c'est la partie de l'extrait visible en fond de la liste sur téléphone.",
      get: function (k) { return (state.overrides[c.slate] || {})[k]; },
      setX: function (v) { setOverride(c, "phoneX", v); },
      media: function () { return c.video; }
    });
  }

  // Une seule source pour la vignette, l'extrait et le recadrage d'un film (Gus 25/11) : le video club (data/bibli/edits.json).
  // Les fiches (et spotlight, fiction) les lisent et les écrivent là ; le site les applique par-dessus les pages. Le titre reste
  // propre à chaque page. vcFilms = edits.json lu à l'ouverture de la page ; vcKey = clé du film (« s<id Slate> » ou clé d'un import).
  var vcFilms = {}, vcTodo = {};
  var vcLib = {}; // library.json (video club) : sert aux vidéos d'un même import
  function vcLoad() {
    return Promise.all([readFile(BIB_EDITS).then(function (o) { vcFilms = (o && o.films) || {}; }, function () { vcFilms = {}; }),
      readFile(BIB_LIB).then(function (l) { vcLib = {}; ((l && l.items) || []).forEach(function (it) { vcLib[it.key] = it; }); }, function () { vcLib = {}; })]);
  }
  // Vidéos importées ensemble avec ce film (Gus 26/11) : le site les montre sous lui ; ici on les montre aussi (lignes de la carte), dans l'ordre du lot.
  // Dès qu'on y touche (ordre, masquer), la carte garde sa propre liste (overrides[id].extras) : propre à cette page.
  function vcGroupRows(c) {
    var me = vcLib[vcKey(c.slate)]; if (!me || !me.grp) return null;
    var ms = Object.keys(vcLib).map(function (k) { return vcLib[k]; }).filter(function (x) { return x.grp === me.grp && x.key !== me.key; }).sort(function (a, b) { return (a.gi || 0) - (b.gi || 0); });
    var ce = vcOf(c).extras || [];
    var rows = ms.map(function (m) { var n = extraFromFilm(Object.assign({}, m, vcFilms[m.key] || {})); n.auto = true; var h = ce.filter(function (x) { return x.key === m.key; })[0]; if (h && h.hide) n.hide = h.hide.slice(); return n; }).filter(function (n) { return n.full || n.video; });
    return rows.length ? rows : null;
  }
  function vcKey(id) { return /^\d+$/.test(String(id)) ? "s" + id : String(id); }
  function vcOf(c) { return vcFilms[vcKey(c.slate)] || {}; }
  function vcImg(c) { var e = vcOf(c); return e.img || c.img; }
  function vcSnipOf(c) { var e = vcOf(c); return e.snipVideo || (e.snip && e.snip.v) || (typeof e.video === "string" && e.video) || c.video; }
  // Recadrage : celui du video club ({ z, x, y, t } ; null = aucun), sinon celui de la page (overrides zoom, zoomPos, zoomThumb).
  function vcCrop(c) {
    var e = vcOf(c); if (e.crop !== undefined) return e.crop;
    var o = state.overrides[c.slate] || {}; if (!(+o.zoom > 1)) return null;
    var m = String(o.zoomPos || "").match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
    return { z: +o.zoom, x: m ? +m[1] : 50, y: m ? +m[2] : 50, t: !!o.zoomThumb };
  }
  function vcSetCrop(c, k, v) {
    var cr = Object.assign({ z: 1, x: 50, y: 50, t: false }, vcCrop(c) || {});
    if (k === "z") cr.z = v || 1;
    else if (k === "pos") { var m = String(v || "").match(/(-?[\d.]+)%\s+(-?[\d.]+)%/); cr.x = m ? +m[1] : 50; cr.y = m ? +m[2] : 50; }
    else cr.t = !!v;
    vcPatch(c.slate, { crop: cr.z > 1 ? cr : null });
  }
  function vcPatch(id, fields) {
    var k = vcKey(id), e = vcFilms[k] = Object.assign({}, vcFilms[k]);
    Object.keys(fields).forEach(function (f) { e[f] = fields[f]; });
    vcTodo[k] = Object.assign(vcTodo[k] || {}, fields); bibCache = null; soon("vcPatch", vcSave, 1200);
  }
  function vcSave() {
    var todo = vcTodo, keys = Object.keys(todo); vcTodo = {};
    if (!keys.length || !canWeb) return;
    return commit([{ path: BIB_EDITS, edit: function (t) {
      var o = t ? JSON.parse(t) : { films: {} }; o.films = o.films || {};
      keys.forEach(function (k) { o.films[k] = Object.assign({}, o.films[k], todo[k]); });
      return json(o);
    } }], "Video club : retouches de " + keys.length + " film" + (keys.length > 1 ? "s" : "") + " (admin, " + (user && user.login || "") + ")")
      .catch(function (e) { keys.forEach(function (k) { vcTodo[k] = Object.assign({}, todo[k], vcTodo[k]); }); alert("Recadrage pas enregistré : " + e.message); });
  }
  // Crédits (Gus 25/11 : même principe, sauf le titre) : réal, prod, chefs op et rôles vivent dans le video club (dir, prod, dops,
  // roles). La carte montre les crédits tels que le site les affiche (même calcul que vcApply d'app.js) et les réécrit dans le video
  // club quand on les change ; les lignes en plus (3e ligne et suivantes, hors chefs op et rôles) restent celles de la page (sub).
  var VC_DOP = /^(?:co-)?dop\.?\s+/i;
  function vcNm(n) { return String(n || "").split(",")[0].trim(); }
  function vcCredits(c) {
    var e = vcOf(c), multi = state === spot || state === fic, l = String(val(c, "sub") || "").split("\n").map(function (x) { return x.trim(); });
    var plain = l.filter(function (x) { return x && !VC_DOP.test(x); }), was = [];
    l.filter(function (x) { return VC_DOP.test(x); }).forEach(function (x) { was = was.concat(x.replace(VC_DOP, "").split(/\s*[,&]\s*/)); });
    var lines = [e.dir !== undefined ? e.dir : plain[0] || "", e.prod !== undefined ? e.prod : plain[1] || ""], extra = plain.slice(2), rl = [];
    if (multi) { if (!["dir", "prod"].some(function (k) { return e[k] !== undefined; })) return { text: val(c, "sub"), extra: extra, roleLines: rl }; }
    else {
      if (!["dir", "prod", "dops", "roles"].some(function (k) { return e[k] !== undefined; })) return { text: val(c, "sub"), extra: extra, roleLines: rl };
      var me = bnrm(vcNm(state.name)), dops = (e.dops ? e.dops.slice() : [state.name].concat(was)).filter(Boolean), ro = {};
      Object.keys(e.roles || {}).forEach(function (n) { if (e.roles[n]) ro[bnrm(vcNm(n))] = e.roles[n]; });
      var main = dops.filter(function (n) { return !ro[bnrm(vcNm(n))]; }), oth = dops.filter(function (n) { return ro[bnrm(vcNm(n))]; });
      if (ro[me]) { if (main.length) lines.push("DoP " + main.map(vcNm).join(" & ")); }
      else { var co = main.filter(function (n) { return bnrm(vcNm(n)) !== me; }); if (co.length) lines.push("co-DoP " + co.map(vcNm).join(" & ")); }
      oth.forEach(function (n) { var x = ro[bnrm(vcNm(n))] + " " + vcNm(n); rl.push({ line: x, name: n, role: ro[bnrm(vcNm(n))] }); lines.push(x); });
    }
    return { text: lines.concat(extra).filter(Boolean).join("\n"), extra: extra, roleLines: rl };
  }
  // Texte de la carte → video club (dir, prod ; fiches : chefs op et rôles) + lignes en plus dans la page.
  function vcSetCredits(c, text) {
    var cur = vcCredits(c), e = vcOf(c), multi = state === spot || state === fic, l = String(text || "").split("\n").map(function (x) { return x.trim(); });
    var keptRoles = {}, dopLine = null, plain = [];
    l.forEach(function (x) {
      if (!x) return;
      var r = cur.roleLines.filter(function (y) { return y.line === x; })[0];
      if (r && !multi) { keptRoles[r.name] = r.role; return; }
      if (VC_DOP.test(x) && !multi) { dopLine = x; return; }
      plain.push(x);
    });
    var patch = { dir: plain[0] || "", prod: plain[1] || "" };
    if (!multi) {
      var names = dopLine ? dopLine.replace(VC_DOP, "").split(/\s*[,&]\s*/).filter(Boolean) : [], me = bnrm(vcNm(state.name));
      // Chef op de la page : toujours crédité (rôle gardé s'il en avait un) ; « DoP X » quand il a un rôle, sinon « co-DoP X ».
      var all = [state.name].concat(names.filter(function (n) { return bnrm(vcNm(n)) !== me; }));
      Object.keys(keptRoles).forEach(function (n) { if (!all.some(function (x) { return bnrm(vcNm(x)) === bnrm(vcNm(n)); })) all.push(n); });
      var meRole = Object.keys(e.roles || {}).filter(function (n) { return bnrm(vcNm(n)) === me && e.roles[n]; })[0];
      if (meRole) keptRoles[meRole] = e.roles[meRole];
      patch.dops = all; patch.roles = Object.keys(keptRoles).length ? keptRoles : undefined;
    }
    vcPatch(c.slate, patch);
    var extra = plain.slice(2), base = String(val(c, "sub") || "").split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x && !VC_DOP.test(x); });
    // Lignes en plus : gardées dans la page, derrière ses deux premières lignes (réal, prod) qui ne servent plus que de secours.
    setOverride(c, "sub", [base[0] || patch.dir, base[1] || patch.prod].concat(extra).filter(Boolean).join("\n"));
  }
  // Bouton « edit » d'un film (Gus 26/11) : la fenêtre du video club (vignette, extrait, recadrage…), par-dessus la page.
  function vcEditBtn(c, after) {
    return el("button", { type: "button", class: "vcedit", text: "edit", title: "Vignette, extrait, recadrage… (fenêtre du video club : vaut pour tout le site)", on: { pointerdown: function (e) { e.stopPropagation(); }, click: function (e) {
      e.stopPropagation(); flushSaves();
      showBibli({ key: vcKey(c.slate), ctx: state === fic ? "fiction" : state === spot ? "spotlight" : (state && state.slug) || "club", done: function (f) {
        // Valeurs de la fenêtre reprises tout de suite (enregistrées dans edits.json par la fenêtre elle-même).
        if (f) { var x = vcFilms[vcKey(c.slate)] = Object.assign({}, vcFilms[vcKey(c.slate)]); ["img", "crop", "snip", "snipVideo", "video", "full"].forEach(function (k) { if (f[k] !== undefined) x[k] = f[k]; }); }
        after();
      } });
    } } });
  }

  function filmCard(c) {
    var card = el("div", { class: "film" });
    var thumb = el("div", { class: "thumb" });
    function paintThumb() { var u = vcImg(c); thumb.style.backgroundImage = u ? 'url("' + imgShow(u) + '")' : ""; }
    paintThumb();
    var chips = el("div", { class: "chips" });
    thumb.appendChild(chips);
    // Snippet Slate (extrait d'aperçu) : petite pastille en haut à droite, pleine = extrait présent, vide = pas encore d'extrait
    // (vidéo à « snipper » sur Slate, puis « Relire le bundle »). Gus 03/11.
    if (c.full || c.video) thumb.appendChild(el("span", { class: "snipmark" + (c.video ? " on" : ""), title: c.video ? "Snippet présent" : "Pas de snippet sur Slate" }));
    var title = el("input", { type: "text", value: val(c, "title") });
    var sub = el("textarea", { rows: 2, title: "Crédits : enregistrés dans le video club (valent pour tout le site) ; le titre reste propre à la page" }); sub.value = vcCredits(c).text;
    var hide = el("button", {}), reset = el("button", { text: "Rétablir" });
    function sync() {
      var o = state.overrides[c.slate] || {};
      card.className = "film" + (state === fic ? " scope" : "") + (o.hidden ? " hidden" : "") + (o.title !== undefined || o.sub !== undefined ? " edited" : "");
      hide.textContent = o.hidden ? "Afficher" : "Masquer";
      reset.hidden = !(o.title !== undefined || o.sub !== undefined);
      chips.textContent = "";
      if (state === spot || state === fic) { if (c.artists && c.artists.length) chips.appendChild(el("span", { class: "chip", text: c.artists.join(" & ") })); } // spotlight, fiction : chef op crédité
      else if (c.featured) chips.appendChild(el("span", { class: "chip", text: "Featured " + c.featuredOrder }));
      if (!c.full && !c.video) chips.appendChild(el("span", { class: "chip", text: "Sans vidéo" }));
      var xs = extrasOf(o), ns = xs.filter(function (x) { return x.stills; }).length;
      if (ns) chips.appendChild(el("span", { class: "chip", text: ns > 1 ? ns + " galeries" : "Stills" }));
      if (xs.length > ns) chips.appendChild(el("span", { class: "chip", text: "+ " + (xs.length - ns) + " vidéo" + (xs.length - ns > 1 ? "s" : "") }));
      if (o.hover) chips.appendChild(el("span", { class: "chip", text: "Extrait au survol" }));
    }
    // Projet en stills (sans film) : extrait d'une autre vidéo Slate, joué seulement au survol (court métrage qu'on ne
    // peut pas montrer en entier, sans bande-annonce) ; au clic, le site montre la galerie. → overrides[id].hover
    var hoverBox = null;
    if (!c.full && !c.video) {
      var ho = (state.overrides[c.slate] || {}).hover;
      var hcheck = el("input", { type: "checkbox" }); hcheck.checked = !!ho;
      var hin = el("input", { type: "url", class: "stills nodirty", placeholder: "Lien Slate de la vidéo (son extrait jouera au survol)", value: ho ? ho.link || "" : "" });
      var hst = el("p", { class: "hint", text: ho ? "Extrait : " + (ho.title || "") : "" });
      var hrow = el("div", { class: "hrow" }, [hin, hst]); hrow.hidden = !ho;
      hcheck.addEventListener("change", function () {
        hrow.hidden = !hcheck.checked;
        if (!hcheck.checked && (state.overrides[c.slate] || {}).hover) { setOverride(c, "hover"); hin.value = ""; hst.textContent = ""; sync(); touch(); }
      });
      var hload = function (force) {
        var v = hin.value.trim(), cur = (state.overrides[c.slate] || {}).hover;
        if (!v) { if (cur) { setOverride(c, "hover"); hst.textContent = ""; sync(); touch(); } return; }
        if (!force && cur && v === cur.link) return;
        if (hin._busy === v) return; // Entrée déclenche aussi « change »
        hin._busy = v; hst.textContent = "Lecture du lien" + slateWait("…");
        importStills(v).then(function (d) {
          hin._busy = null;
          if (d.stills) throw new Error("C'est une page de stills : collez le lien d'une vidéo.");
          if (!d.video) throw new Error("Cette vidéo n'a pas d'extrait sur Slate : choisissez-en une qui en a un.");
          var h = { link: d.link, title: d.title, video: d.video }; if (d.img) h.img = d.img;
          setOverride(c, "hover", h); hin.value = d.link; hst.textContent = "Extrait : " + d.title; sync(); touch();
        }).catch(function (e) { hin._busy = null; hst.textContent = e.message; });
      };
      hin.addEventListener("change", function () { hload(false); });
      hin.addEventListener("keydown", function (e) { if (e.key === "Enter") hload(true); });
      hoverBox = el("div", { class: "hover" }, [el("label", { class: "hcheck" }, [hcheck, " Extrait vidéo au survol"]), hrow]);
    }
    // Sous le film dans le lecteur : stills et autres vidéos (liens Slate), enregistrés avec la fiche.
    var extras = extrasCtl(function () { var o = state.overrides[c.slate] || {}; if (o.extras) return o; var g = vcGroupRows(c); return g ? { extras: g } : o; }, function (list) {
      setOverride(c, "extras", list.length ? list : undefined); setOverride(c, "stills"); setOverride(c, "stillsLink"); sync();
    }, "Lien Slate de stills ou d'une vidéo, ou lien d'une de nos bandes, à afficher sous le film", state === fic ? "fiction" : state === spot ? "spotlight" : state.slug);
    title.addEventListener("input", function () { setOverride(c, "title", title.value); sync(); });
    sub.addEventListener("input", function () { vcSetCredits(c, sub.value); sync(); });
    hide.addEventListener("click", function () { setOverride(c, "hidden", (state.overrides[c.slate] || {}).hidden ? undefined : true); sync(); touch(); });
    reset.addEventListener("click", function () { setOverride(c, "title"); setOverride(c, "sub"); vcPatch(c.slate, { dir: undefined, prod: undefined, dops: undefined, roles: undefined }); title.value = c.title || ""; sub.value = vcCredits(c).text; sync(); touch(); });
    sync();
    // Projet en stills : le recadrage se règle sur l'extrait choisi pour le survol.
    var zvid = function () { var h = (state.overrides[c.slate] || {}).hover; return vcSnipOf(c) || (h && h.video); };
    // Recadrage : celui du video club (même réglage partout : fiches, video club, site), enregistré tout de suite dans edits.json.
    function mkZoom() {
      return state === fic ? scopeCtl(c, thumb, zvid) : zoomCtl(thumb, zvid, function () { var cr = vcCrop(c); return cr ? cr.z : undefined; }, function (z) { vcSetCrop(c, "z", z); sync(); },
        function () { var cr = vcCrop(c); return cr ? cr.x + "% " + cr.y + "%" : undefined; }, function (p) { vcSetCrop(c, "pos", p); sync(); },
        function () { var cr = vcCrop(c); return cr ? cr.t : undefined; }, function (t) { vcSetCrop(c, "t", t); sync(); }, function () {});
    }
    var zoom = mkZoom();
    // Bouton « edit » (Gus 26/11) : sous la vidéo, sur fond blanc, collé à droite de la ligne de recadrage.
    var editB = vcEditBtn(c, function () { paintThumb(); var z2 = mkZoom(); zoom.replaceWith(z2); zoom = z2; zoomIn(zoom).appendChild(editB); if (document.activeElement !== sub) sub.value = vcCredits(c).text; sync(); });
    function zoomIn(z) { return z.classList.contains("zoom") ? z : z.querySelector(".zoom") || z; } // le bouton va dans la ligne « Recadrage », pas dans la case « aussi sur la vignette »
    zoomIn(zoom).appendChild(editB);
    card.appendChild(thumb); card.appendChild(zoom);
    if (state !== spot && state !== fic && (bgFilm() || {}).slate === c.slate) card.appendChild(filmPhoneCtl(c)); // 1er film FEATURED seulement (fiches)
    card.appendChild(awardsCtl(c));
    card.appendChild(title); card.appendChild(sub);
    if (state === fic) card.appendChild(ficCtl(c));
    card.appendChild(infoCtl(c));
    card.appendChild(el("div", { class: "acts" }, [hide, reset]));
    if (hoverBox) card.appendChild(hoverBox);
    card.appendChild(extras);
    return card;
  }
