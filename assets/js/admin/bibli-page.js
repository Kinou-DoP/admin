// Bibliothèque / video club (2/2) : showBibli
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // emb (Gus 25/11, bouton « edit » d'une fiche) : { key, done(film) } = seulement la fenêtre d'un film du video club, ouverte
  // par-dessus la page en cours (rien n'est affiché du video club ; mêmes enregistrements dans edits.json).
  function showBibli(emb) {
    var trashBtn = null, trashN = 0; // corbeille (bouton en bas à gauche de la page)
    var CTX = (emb && emb.ctx) || "club", CTXN = CTX === "club" ? "video club et bandes" : CTX === "fiction" ? "page fiction" : CTX === "spotlight" ? "page spotlight" : "cette page de chef op";
    function filmByKey(k) { return data && data.films.filter(function (x) { return x.key === k; })[0]; }
    if (!emb) { bar.hidden = true; editing = false; view.textContent = ""; document.body.classList.add("bibpage"); }
    // En arrivant : toujours une nouvelle bande vide (Gus 22/11), sauf une bande pas encore enregistrée (enregistrement raté).
    var band; try { band = JSON.parse(localStorage.getItem(BAND_KEY) || "null"); } catch (e) {}
    if (!band || !band.items || band.code || !band.items.length) band = bandNew();
    var st = { q: "", chips: [], n: 60, sel: {}, sugI: -1, tab: "new", last: null };
    var wrap = el("div", { class: "bib" }), left = el("div", { class: "bibl" }), right = el("aside", { class: "bibr" });
    wrap.appendChild(left); wrap.appendChild(right); if (!emb) view.appendChild(wrap);
    if (!emb) { trashBtn = el("button", { type: "button", class: "btrash", title: "Corbeille : films supprimés, restaurables 30 jours", on: { click: trashOpen } }, [el("span", { text: "🗑" }), el("b")]); view.appendChild(trashBtn); setTimeout(trashRefresh, 800); }
    var head = el("div", { class: "bibhead" }, [el("h1", { text: "Video club" }), el("div", { class: "bibadd" }, [
      // Liens (Gus 26/11) : Cmd / Ctrl + clic ou clic molette = la fenêtre d'import dans un autre onglet (plusieurs envois à la fois).
      el("a", { class: "btn primary", href: "#/bibli/video", text: "+ Vidéo", on: { click: function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); importVideo(); } } }),
      el("a", { class: "btn primary", href: "#/bibli/images", text: "+ Images", on: { click: function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); importImages(); } } })])]);
    left.appendChild(head);
    var q = el("input", { type: "search", class: "find bibq", placeholder: "Chercher : chef op, réal, prod, client, type de contenu, catégorie, titre…", autocomplete: "off" });
    var sugBox = el("div", { class: "bibsug", hidden: true }), chipsBox = el("div", { class: "bibchips" });
    var info = el("p", { class: "hint bibinfo", text: "Chargement de tous nos films…" }), list = el("div", { class: "biblist" });
    left.appendChild(el("div", { class: "bibsearch" }, [q, sugBox])); left.appendChild(chipsBox); left.appendChild(info); left.appendChild(list);
    var data = null;
    var openNext = emb ? null : bibOpen; if (!emb) bibOpen = null;
    if (emb) { bibLoad().then(function (d) { adopt(d); var f = filmOf(emb.key); if (!f) { alert("Film introuvable dans le video club."); emb.done(null); return; } libEdit(f); if (emb.opened) emb.opened(); }, function (e) { alert("Video club indisponible : " + e.message); emb.done(null); }); }
    else bibLoad().then(function (d) { adopt(d); draw(); encCheck(); if (openNext === "video") importVideo(); else if (openNext === "images") importImages(); }, function (e) { info.textContent = "Indisponible : " + e.message; });
    // Films envoyés depuis l'ordinateur : dès que le robot a fini, le film reçoit sa version web, sa vignette et son extrait
    // (library.json) ; vérifié à l'ouverture du video club puis toutes les 20 s tant qu'un encodage est en cours.
    var encT = 0;
    // Vidéos remplacées (« ↻ Remplacer la vidéo », edits.json : `enc`) : la nouvelle version est reprise ici aussi, sans attendre
    // qu'on rouvre la fenêtre du film (Gus 25/11 : film resté « encodage en cours » des heures après la fin du robot).
    function encCheckEdits() {
      return readFile(BIB_EDITS).then(function (o) {
        var fl = (o && o.films) || {}, vp = function (x) { return (x.versions || []).filter(function (v) { return v.enc && v.enc.path && !v.enc.error; }); }, keys = Object.keys(fl).filter(function (k) { var e = fl[k].enc; return e && e.path && !e.error && !e.sending || fl[k].pend || vp(fl[k]).length; });
        if (!keys.length) return;
        var paths = [];
        keys.forEach(function (k) { var x = fl[k]; vp(x).forEach(function (v) { paths.push(v.enc.path); }); if (x.enc && x.enc.path) paths.push(x.enc.path); if (x.pend) Object.keys(x.pend).forEach(function (w) { if (x.pend[w] && x.pend[w].path) paths.push(x.pend[w].path); }); });
        paths = paths.filter(function (p, k, a) { return a.indexOf(p) === k; });
        return Promise.all(paths.map(function (p) { return readFile(p).catch(function () { return null; }); })).then(function (rs) {
          var res = {}; rs.forEach(function (d) { if (d && d.doneAt) (d.jobs || []).forEach(function (j) { res[j.id] = j; }); });
          var any = keys.some(function (k) { var x = fl[k]; return (x.enc && res[x.enc.id]) || vp(x).some(function (v) { return res[v.enc.id]; }) || (x.pend && Object.keys(x.pend).some(function (w) { return x.pend[w] && res[x.pend[w].id]; })); });
          if (!any) return;
          return commit([{ path: BIB_EDITS, edit: function (t) {
            var O = t ? JSON.parse(t) : { films: {} }, n = 0; O.films = O.films || {};
            Object.keys(O.films).forEach(function (k) {
              var x = O.films[k], j = x.enc && res[x.enc.id];
              (x.versions || []).forEach(function (v) { var r = v.enc && res[v.enc.id]; if (!r) return; n++; if (r.answer) { v.full = r.answer.full; v.ws = r.answer.ws; v.dur = r.answer.dur; v.w = r.answer.w; v.h = r.answer.h; delete v.enc; } else v.enc.error = r.error || "pas de réponse"; }); // versions « Edit » prêtes
              if (j) { n++; if (j.error || !j.answer) x.enc.error = j.error || "pas de réponse"; else { x.full = j.answer.full; delete x.enc; } }
              Object.keys(x.pend || {}).forEach(function (w) { // vignette / extrait demandés au robot : appliqués ici si la fenêtre du film n'est plus là pour le faire
                var q = x.pend[w], r = q && res[q.id]; if (!r) return; n++;
                if (r.answer && w === "thumb") {
                  if (x.img && x.img !== r.answer.img) { x.hist = x.hist || {}; x.hist.img = [x.img].concat((x.hist.img || []).filter(function (u) { return u !== x.img; })).slice(0, 8); }
                  x.img = r.answer.img; x.thumbT = q.t;
                } else if (r.answer && w === "snip" && x.snip && x.snip.s === q.s && x.snip.d === q.d && JSON.stringify(x.snip.parts || null) === (q.pj || "null")) { x.snip.v = r.answer.video; x.snip.vf = q.from; }
                delete x.pend[w];
              });
              if (x.pend && !Object.keys(x.pend).length) delete x.pend;
            });
            return n ? json(O) : null;
          } }], "Video club : vidéo, vignette ou extrait prêt (admin, " + (user && user.login || "") + ")").then(function () { return bibLoad(true); }).then(function (d) { if (location.hash === "#/bibli") { adopt(d); draw(); } });
        });
      }).catch(function () {});
    }
    function x_pend() { return (data.films || []).some(function (x) { return x.pend; }); }
    function encCheck() {
      clearTimeout(encT); if (!canWeb) return Promise.resolve();
      encCheckEdits();
      return readFile(BIB_LIB).then(function (l) {
        var wait = ((l && l.items) || []).filter(function (x) { return x.enc && !x.enc.error && !x.enc.sending && !x.full; });
        if (!wait.length) return;
        var paths = wait.map(function (x) { return x.enc.path; }).filter(function (p, k, a) { return a.indexOf(p) === k; });
        return Promise.all(paths.map(function (p) { return readFile(p).catch(function () { return null; }); })).then(function (rs) {
          var res = {}; rs.forEach(function (d) { if (d && d.doneAt) (d.jobs || []).forEach(function (j) { res[j.id] = j; }); });
          var done = wait.filter(function (x) { return res[x.enc.id]; });
          if (done.length) return commit([{ path: BIB_LIB, edit: function (t) {
            var L = t ? JSON.parse(t) : { items: [] };
            (L.items || []).forEach(function (x) {
              var j = x.enc && res[x.enc.id]; if (!j || x.full) return;
              if (j.error || !j.answer) { x.enc.error = j.error || "pas de réponse"; return; }
              var a = j.answer; x.full = a.full; x.video = a.video; x.img = a.img; x.img1600 = a.img1600; x.thumbT = a.thumbT;
              x.snip = { s: a.snip.s, d: a.snip.d, v: a.video, vf: a.full }; x.dur = a.dur; x.w = a.w; x.h = a.h; if (a.ws) x.ws = a.ws; if (a.os) x.os = a.os; delete x.enc;
            });
            return json(L);
          } }], "Video club : encodage terminé (admin, " + (user && user.login || "") + ")").then(function () { return bibLoad(true); }).then(function (d) { if (location.hash === "#/bibli") { adopt(d); draw(); } });
        });
      }).catch(function () {}).then(function () {
        if (location.hash !== "#/bibli" || !data) return;
        if ((data.films || []).some(function (x) { return (x.enc && !x.enc.error) || x.pend || (x.versions || []).some(function (v) { return v.enc && !v.enc.error; }); })) encT = setTimeout(encCheck, x_pend() ? 6000 : 20000);
      });
    }
    if (!emb && !openNext && !(window.matchMedia && matchMedia("(max-width: 700px), (pointer: coarse)").matches)) setTimeout(function () { q.focus(); }, 50); // (pas sur téléphone : le clavier s'ouvrirait) // on tape directement, sans cliquer sur la barre (Gus 26/11)
    q.addEventListener("input", function () { st.q = q.value; st.n = 60; st.sugI = -1; suggest(); draw(); });
    q.addEventListener("keydown", function (e) {
      var items = sugBox.querySelectorAll("button");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!items.length) return; st.sugI = (st.sugI + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items.forEach(function (b, i) { b.classList.toggle("on", i === st.sugI); }); }
      else if (e.key === "Enter" && st.sugI > -1 && items[st.sugI]) { e.preventDefault(); items[st.sugI].click(); }
      else if (e.key === "Escape") { sugBox.hidden = true; }
      else if (e.key === "Backspace" && !q.value && st.chips.length) { st.chips.pop(); draw(); }
    });
    q.addEventListener("blur", function () { setTimeout(function () { sugBox.hidden = true; }, 150); });
    q.addEventListener("focus", suggest);
    function suggest() {
      sugBox.textContent = "";
      var v = bnrm(st.q); if (!data || v.length < 1) { sugBox.hidden = true; return; }
      var words = v.split(/\s+/), per = {};
      // Toujours dans cet ordre : chef op, réal, prod, client, type de contenu, catégorie (Gus 22/11) ; 4 au plus par sorte.
      var hits = data.sug.filter(function (s) { var n = bnrm(s.value); return words.every(function (w) { return n.indexOf(w) > -1; }) && !st.chips.some(function (c) { return c.type === s.type && bnrm(c.value) === bnrm(s.value); }); })
        .sort(function (a, b) { var pa = bnrm(a.value).indexOf(words[0]) === 0 ? 0 : 1, pb = bnrm(b.value).indexOf(words[0]) === 0 ? 0 : 1; return BIB_ORDER.indexOf(a.type) - BIB_ORDER.indexOf(b.type) || pa - pb || b.n - a.n; })
        .filter(function (s) { per[s.type] = (per[s.type] || 0) + 1; return per[s.type] <= 4; }).slice(0, 14);
      hits.forEach(function (s, i) {
        sugBox.appendChild(el("button", { type: "button", style: "--i:" + i, on: { mousedown: function (e) { e.preventDefault(); }, click: function () { st.chips.push({ type: s.type, value: s.value }); q.value = st.q = ""; sugBox.hidden = true; draw(); q.focus(); } } },
          [el("span", { class: "bst t-" + s.type, text: BIB_T[s.type] }), el("span", { text: s.value }), el("span", { class: "bsn", text: s.n + " film" + (s.n > 1 ? "s" : "") })]));
      });
      sugBox.hidden = !hits.length;
    }
    function shown() {
      var words = bnrm(st.q).split(/\s+/).filter(Boolean);
      return data.films.filter(function (f) { return st.chips.every(function (c) { return bibMatch(f, c); }) && words.every(function (w) { return f.hay.indexOf(w) > -1; }); });
    }
    function draw() {
      chipsBox.textContent = "";
      st.chips.forEach(function (c, i) { chipsBox.appendChild(el("button", { type: "button", class: "bchip", title: "Retirer ce filtre", on: { click: function () { st.chips.splice(i, 1); draw(); } } }, [el("span", { class: "bst t-" + c.type, text: BIB_T[c.type] }), c.value + " ×"])); });
      if (!data) return;
      var l = shown(), nSel = Object.keys(st.sel).length;
      st.shown = l;
      info.textContent = "";
      info.appendChild(document.createTextNode(l.length + " film" + (l.length > 1 ? "s" : "") + (st.chips.length || st.q ? " sur " + data.films.length : "") + " · les plus récents en haut"));
      if (nSel) {
        info.appendChild(el("button", { type: "button", class: "btn ghost bselb", text: "Ajouter la sélection à la bande (" + nSel + ")", on: { click: function () { addKeys(Object.keys(st.sel), band.items.length, info); } } }));
        info.appendChild(el("button", { type: "button", class: "btn ghost", text: "Tout désélectionner", on: { click: function () { st.sel = {}; draw(); } } }));
        if (canWeb) info.appendChild(el("button", { type: "button", class: "btn ghost bdelb", text: "Supprimer la sélection (" + nSel + ")", title: "Supprime du video club les films importés cochés (confirmation avant)", on: { click: deleteSelection } }));
      }
      list.textContent = "";
      l.slice(0, st.n).forEach(function (f, i) { list.appendChild(row(f, i)); });
      if (l.length > st.n) list.appendChild(el("button", { type: "button", class: "btn ghost rcmore", text: "Afficher plus (" + (l.length - st.n) + ")", on: { click: function () { st.n += 120; draw(); } } }));
    }
    function row(f, i) {
      var th = el("div", { class: "bthumb" }); if (f.img) th.style.backgroundImage = 'url("' + imgShow(f.img) + '")';
      if (f.images && !f.video && !f.full) th.appendChild(el("span", { class: "bimgs", text: f.images.length + " images" }));
      var v = null;
      th.addEventListener("mouseenter", function () { var hs = f.snipVideo || (f.snip && f.snip.v) || f.video; if (!hs || v || document.body.classList.contains("bdragging")) return; v = el("video", { muted: true, autoplay: true, loop: true, playsinline: true }); v.muted = true; v.src = hs; th.appendChild(v); }); // l'extrait le plus récent (montage, extrait importé), pas l'ancien
      th.addEventListener("mouseleave", function () { if (v) { v.remove(); v = null; } });
      var cb = el("input", { type: "checkbox" }); cb.checked = !!st.sel[f.key];
      cb.addEventListener("click", function (e) { // Maj + clic : toute la plage depuis la dernière case cochée
        if (e.shiftKey && st.last && st.shown) {
          var a = st.shown.indexOf(st.last), b = st.shown.indexOf(f); if (a > -1 && b > -1) { st.shown.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (x) { st.sel[x.key] = 1; }); }
        }
      });
      cb.addEventListener("change", function () { if (cb.checked) st.sel[f.key] = 1; else delete st.sel[f.key]; st.last = f; draw(); });
      function lnk(type, v) { return el("button", { type: "button", class: "blink", text: v, title: "Filtrer : " + BIB_T[type] + " " + v, on: { click: function (e) { e.stopPropagation(); st.chips.push({ type: type, value: v }); draw(); } } }); }
      var add = el("button", { type: "button", class: "btn ghost badd", text: inBand(f) ? "−" : "+", title: inBand(f) ? "Retirer de la bande" : "Ajouter à la bande", on: { click: function (e) { e.stopPropagation(); if (inBand(f)) removeKey(f.key); else addKeys([f.key], band.items.length, th); } } });
      var r = el("div", { class: "brow" + (st.sel[f.key] ? " sel" : "") + (inBand(f) ? " inband" : "") }, [
        el("span", { class: "bnum", text: String(i + 1) }), cb, th,
        el("div", { class: "bt" }, [f.client ? el("small", { class: "bclient", text: f.client }) : null, el("strong", {}, [f.title || "(sans titre)", grpCount(f) > 1 ? linkIcon(grpCount(f), function (e) { e.stopPropagation(); openMontage(f); }) : null]), el("small", {}, f.pages.map(function (p, j) { return el("span", {}, [j ? " · " : "", p.name]); })),
          f.pend && !f.enc ? el("small", { class: "benc run", text: "⟳ " + [f.pend.thumb ? "Vignette" : "", f.pend.snip ? "Extrait" : ""].filter(Boolean).join(" et ") + " en cours d'encodage…" }) : f.enc ? el("small", { class: "benc" + (f.enc.error ? " err" : " run"), text: f.enc.error ? "⚠ Encodage raté : " + f.enc.error : f.enc.sending ? "↑ Envoi en cours (ou interrompu)…" : "⟳ Encodage en cours (quelques minutes)…" }) : null]),
        el("div", { class: "bc" }, f.dops.map(function (d) { var r = (f.roles || {})[d]; return r ? el("span", { class: "brole" }, [lnk("dop", d), el("small", { text: r })]) : lnk("dop", d); })),
        el("div", { class: "bc" }, f.cats.slice(0, 2).map(function (c) { return lnk("cat", c); }).concat(f.types.filter(function (t) { return !f.cats.some(function (c) { return bnrm(c) === bnrm(t); }); }).slice(0, 3).map(function (c) { return lnk("type", c); }))),
        el("div", { class: "bc" }, bibProds(f).map(function (x) { return lnk("prod", x); }).concat(f.client ? [lnk("client", f.client)] : [])),
        el("div", { class: "bc" }, bibDirs(f).map(function (d) { return lnk("dir", d); })), add]);
      // Clic sur l'image = lecteur ; clic ailleurs sur la ligne = infos du film (Gus 22/11) ; glisser = vers la bande.
      th.addEventListener("click", function (e) { if (Date.now() - (st.dragAt || 0) < 300) return; e.stopPropagation(); bibPlay(f); });
      r.addEventListener("click", function (e) { if (Date.now() - (st.dragAt || 0) < 300 || e.target.closest("button, input, a, .bthumb")) return; libEdit(f); });
      r.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button, input, a")) return;
        var keys = st.sel[f.key] ? Object.keys(st.sel) : [f.key];
        dragStart(e, { kind: "add", keys: keys, imgs: keys.map(function (k) { var x = filmOf(k); return x && x.img; }), from: r });
      });
      return r;
    }
    // Lecteur simple de la bibliothèque : le film complet avec le son ; clic à côté, croix ou Échap = fermer.
    function bibPlay(f) { // aperçu avec ‹ › dans la liste affichée et « + » = ajouter à la bande (Gus 26/11)
      var l = st.shown && st.shown.indexOf(f) > -1 ? st.shown : [f];
      navPlayer(l, l.indexOf(f), { addLabel: "Ajouter à la bande", inLabel: "Dans la bande", has: inBand, add: function (x) { if (!inBand(x)) addKeys([x.key], band.items.length); }, remove: function (x) { removeKey(x.key); } });
    }
    // Infos d'un film de la bibliothèque : même fenêtre que les retouches d'une bande ; enregistrées dans data/bibli/edits.json
    // (seulement ce qui diffère des pages), reprises par les films ajoutés ensuite aux bandes et appliquées aussi au site
    // (fiches, spotlight, fiction, accueil : app.js du site lit edits.json, Gus 26/11 « le video club sert partout »).
    var libQ = { t: 0, busy: false, again: false, todo: {}, sent: {}, files: [] };
    // Données du video club relues (fin d'un encodage…) : les retouches pas encore enregistrées (en attente `todo`, ou en cours d'envoi
    // `sent`) sont remises par-dessus, sinon la fenêtre rouverte montrerait d'anciens crédits et les écraserait au prochain changement.
    function adopt(d) {
      data = d;
      [libQ.sent, libQ.todo].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { var f = filmOf(k), e = m[k]; if (f && e) { bibApply(f, e); bibHay(f); } }); });
    }
    // Appliquer une retouche d'une bande au film du video club (Gus 23/11 : « en faire la vignette / l'extrait officiel ») :
    // mêmes infos que la fenêtre du film (edits.json, seulement ce qui diffère des pages), reprises par les prochaines bandes.
    function libPatch(f, patch) {
      var cl = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
      if (!f._orig) { f._orig = {}; BIB_EK.forEach(function (k) { f._orig[k] = cl(f[k]); }); }
      Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete f[k]; else f[k] = cl(patch[k]); });
      var e = {}; BIB_EK.forEach(function (k) { var a = f[k], b = f._orig[k]; if (JSON.stringify(a === undefined ? null : a) !== JSON.stringify(b === undefined ? null : b)) e[k] = a === undefined ? null : a; });
      f.libEdited = !!Object.keys(e).length; bibHay(f);
      libQ.todo[f.key] = f.libEdited ? e : null; soon("libEdits", libSaveEdits, 800);
    }
    function libSaveEdits() {
      if (!canWeb) return;
      if (libQ.busy) { libQ.again = true; return; }
      var todo = libQ.todo, files = libQ.files.splice(0), keys = Object.keys(todo); libQ.todo = {}; libQ.sent = todo;
      if (!keys.length && !files.length) return;
      libQ.busy = true; info.classList.add("saving");
      return commit([{ path: BIB_EDITS, edit: function (t) {
        var o = t ? JSON.parse(t) : { films: {} }; o.films = o.films || {};
        keys.forEach(function (k) { if (todo[k]) o.films[k] = todo[k]; else delete o.films[k]; });
        return json(o);
      } }].concat(files), "Video club : infos de " + keys.length + " film" + (keys.length > 1 ? "s" : "") + " (admin, " + (user && user.login || "") + ")").then(function () {
        libQ.busy = false; libQ.sent = {}; libQ.fail = 0; info.classList.remove("saving"); if (libQ.again) { libQ.again = false; libSaveEdits(); }
      }, function (e) { libQ.busy = false; libQ.sent = {}; keys.forEach(function (k) { if (!(k in libQ.todo)) libQ.todo[k] = todo[k]; }); libQ.files = files.concat(libQ.files); info.classList.remove("saving");
        // Échec (souvent un autre commit en même temps) : on réessaie tout seul 2 fois avant de déranger (Gus 26/11) ; rien n'est perdu, tout reste en attente.
        if ((libQ.fail = (libQ.fail || 0) + 1) <= 2) { soon("libEdits", libSaveEdits, 2500 * libQ.fail); return; }
        libQ.fail = 0; alert("Infos pas enregistrées : " + e.message + "\n\nRien n'est perdu : les changements sont gardés, ils partiront au prochain changement."); throw e; });
    }
    function libEdit(f, opt) { // opt (import) : { local: vidéo de l'ordinateur, head: onglets + avancement, credits: crédits à reprendre }
      opt = opt || {};
      var o = f._orig || {}, it = { key: f.key, full: f.full, video: f.video, images: f.images };
      BIB_EK.forEach(function (k) { if (f[k] !== undefined) it[k] = JSON.parse(JSON.stringify(f[k])); });
      var cr = opt.credits, empty = !it.dir && !it.prod && !(it.dops || []).filter(Boolean).length;
      var base = {}; BIB_EK.forEach(function (k) { base[k] = f._orig ? o[k] : f[k]; });
      function diff() { // ce qui diffère des pages
        var e = {}; BIB_EK.forEach(function (k) { var a = k === "snip" && it._snipTmp ? it._snipSaved : it[k], b = base[k]; if (JSON.stringify(a === undefined ? null : a) !== JSON.stringify(b === undefined ? null : b)) e[k] = a === undefined ? null : a; });
        Object.keys(e).forEach(function (k) { if (e[k] === null && (k === "snip" || k === "crop" || k === "roles" || k === "awards" || k === "extras")) e[k] = null; });
        return Object.keys(e).length ? e : null;
      }
      var L = { it: it, orig: { img: base.img, images: f.images }, files: libQ.files, local: opt.local, head: opt.head,
        meta: { size: f.size, ws: f.ws, os: f.os, w: f.w, h: f.h, dur: f.dur, date: f.date, at: f.at, by: f.by, slate: f.slate, grpN: grpCount(f), mkey: f.mkey, key: f.key },
        montage: function () { openMontage(f); }, unlink: function (all) { return unlinkFilms(f, all); }, canDelete: function () { return !!canWeb; }, isSlate: function () { return !(data && data.lib && (data.lib.items || []).some(function (x) { return x.key === f.key; })); }, del: function () { return libDelete(f); },
        onChange: function () {
          // Vidéos d'un même import : ordre commun à toutes (Gus 26/11). Glisser une ligne change l'ordre du lot entier ; masquer ne casse pas le lien.
          // Lignes ajoutées / retirées / ajoutées à la main : lien rompu pour ce film (lignes sans `auto`, enregistrées dans edits.json).
          if (it.extras && base.extras && JSON.stringify(it.extras) !== JSON.stringify(base.extras)) {
            var kk = function (l) { return l.map(function (x) { return x.key || ""; }); }, kb = kk(base.extras), ki = kk(it.extras);
            var linked = f.grp && it.extras.every(function (x) { return x.key; }) && kb.slice().sort().join() === ki.slice().sort().join();
            if (!linked) it.extras.forEach(function (x) { delete x.auto; });
            else {
              it.extras.forEach(function (x) { x.auto = true; });
              if (kb.join() !== ki.join()) { grpOrder(f.grp, ki); base.extras = JSON.parse(JSON.stringify(it.extras)).map(function (x) { delete x.hide; return x; }); }
            }
          }
          var e = diff(), keep = f._orig;
          if (!keep) { f._orig = {}; BIB_EK.forEach(function (k) { f._orig[k] = base[k] === undefined ? undefined : JSON.parse(JSON.stringify(base[k])); }); }
          BIB_EK.forEach(function (k) { var v = k === "snip" && it._snipTmp ? it._snipSaved : it[k]; f[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); });
          f.dops = (f.dops || []).filter(Boolean); f.types = f.types || []; f.libEdited = !!e; bibHay(f);
          libQ.todo[f.key] = e; soon("libEdits", libSaveEdits, 1500);
        },
        onClose: function () { unsoon("libEdits"); runSave(libSaveEdits); if (emb) emb.done(f); else draw(); },
        reset: function () { BIB_EK.forEach(function (k) { f[k] = base[k] === undefined ? undefined : JSON.parse(JSON.stringify(base[k])); }); f.dops = f.dops || []; f.types = f.types || []; f.libEdited = false; bibHay(f); libQ.todo[f.key] = null; }
      };
      // Plusieurs vidéos d'un même projet (Gus 26/11) : une vidéo sans crédits reprend ceux de la 1re.
      if (cr && empty) { ["dir", "prod", "dops", "roles", "types"].forEach(function (k) { if (cr[k] !== undefined) it[k] = JSON.parse(JSON.stringify(cr[k])); }); L.onChange(); }
      editItem(-1, L);
    }
    // Liens de films partagés seuls (Gus 23/11) : payload d'une « bande » d'un seul film ; création groupée à l'ajout de films.
    function sharePayload(it, dl) {
      var c = {}; Object.keys(it).forEach(function (k) { if (k.charAt(0) !== "_" && k !== "key" && k !== "hist" && k !== "pend" && k !== "pages" && k !== "hay" && k !== "libEdited") c[k] = it[k]; }); snipOk(it, c);
      c.dops = (c.dops || []).filter(Boolean);
      if (!(c.client && c.cshow !== false)) delete c.client; delete c.cshow; // le client ne part que s'il est affiché
      if (c.extras) { c.extras = c.extras.filter(function (x) { return !xHidden(x, "club") && !x.self; }).map(function (x) { x = Object.assign({}, x); delete x.hide; return x; }); if (!c.extras.length) delete c.extras; }
      return { single: true, title: c.title || "", artists: [], cols: 1, hide: {}, download: !!dl, items: [c], at: new Date().toISOString() };
    }
    function shareCreate(fl) { // un lien pour chaque film qui n'en a pas encore : un commit (pages chiffrées) + la liste des codes (notes)
      var by = user && user.login || "";
      return nGet(BAND_NOTES + "films.json").then(function (t) {
        var m = t ? JSON.parse(t) : {}, todo = fl.filter(function (f) { return f && !m[f.key]; }).map(function (f) { return { f: f, code: bandCode() }; });
        if (!todo.length) return;
        return Promise.all(todo.map(function (x) { return bandSeal(x.code, "", "", sharePayload(x.f, false)); })).then(function (sealed) {
          return commit(sealed.map(function (x) { return { path: BAND_PUB + x.id + ".json", text: x.text }; }), "Films partagés : " + todo.length + " lien" + (todo.length > 1 ? "s" : "") + " (admin, " + by + ")");
        }).then(function () {
          return nEdit(BAND_NOTES + "films.json", function (t2) { var m2 = t2 ? JSON.parse(t2) : {}; todo.forEach(function (x) { if (!m2[x.f.key]) m2[x.f.key] = { code: x.code, download: false, title: x.f.title || "", at: new Date().toISOString(), by: by }; }); return json(m2); }, "Films partagés (admin, " + by + ")");
        });
      });
    }
    function filmOf(k) { return data && data.films.filter(function (x) { return x.key === k; })[0]; }
    function inBand(f) { return band.items.some(function (x) { return x.key === f.key; }); }
    function addKeys(keys, at, fromEl) {
      var n = 0;
      keys.forEach(function (k) { var f = filmOf(k); if (f && !inBand(f)) { band.items.splice(at + n, 0, bandItem(f)); n++; } });
      st.sel = {}; changed(); drawBand(at, n);
      if (fromEl && n) { // petit vol de la vignette jusqu'à la bande
        var r = fromEl.getBoundingClientRect(), it = right.querySelectorAll(".bit")[at];
        var fl = bibFly({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, keys.map(function (k) { var x = filmOf(k); return x && x.img; }), keys.length);
        fl.end(it ? it.getBoundingClientRect() : right.getBoundingClientRect());
      }
      if (data) draw();
    }

    // ---------- Glisser-déposer (souris) : de la liste vers la bande, ou dans la bande pour changer l'ordre ----------
    // Toute la colonne de droite reçoit les films (pas seulement une zone en pointillé, Gus 22/11).
    function dragStart(e, d) {
      var sx = e.clientX, sy = e.clientY, fly = null, ph = null, at = -1;
      function over(ev) { var r = right.getBoundingClientRect(); return st.tab === "new" && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; }
      function place(ev) {
        var box = right.querySelector(".bitems"); if (!box) return;
        var its = Array.prototype.filter.call(box.children, function (x) { return x.classList.contains("bit") && !x.classList.contains("dragged"); });
        at = its.length;
        for (var i = 0; i < its.length; i++) { var r = its[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { at = i; break; } }
        if (!ph) ph = el("div", { class: "bph" });
        var ref = its[at] || null;
        if (ph.nextSibling !== ref || ph.parentNode !== box) box.insertBefore(ph, ref);
        // défilement automatique près des bords
        var br = box.getBoundingClientRect();
        if (ev.clientY < br.top + 40) box.scrollTop -= 12; else if (ev.clientY > br.bottom - 40) box.scrollTop += 12;
      }
      function move(ev) {
        if (!fly) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
          fly = bibFly(ev, d.imgs, d.kind === "add" ? d.keys.length : 1); st.dragAt = Date.now();
          document.body.classList.add("bdragging"); if (d.from) d.from.classList.add("dragged");
          var vids = document.querySelectorAll(".bthumb video"); vids.forEach(function (v) { v.remove(); });
        }
        ev.preventDefault(); fly.move(ev);
        var o = over(ev); right.classList.toggle("bdz", o);
        if (o) place(ev); else if (ph) { ph.remove(); ph = null; }
      }
      function up(ev) {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", esc);
        if (!fly) return;
        st.dragAt = Date.now();
        document.body.classList.remove("bdragging"); right.classList.remove("bdz"); if (d.from) d.from.classList.remove("dragged");
        var ok = ev && over(ev) && at > -1, to = ok && ph ? ph.getBoundingClientRect() : null;
        if (ph) ph.remove();
        fly.end(ok ? (to || right.getBoundingClientRect()) : null);
        if (!ok) return;
        if (d.kind === "move") { var it = band.items.splice(d.from_i, 1)[0], j = at; band.items.splice(j, 0, it); changed(); drawBand(j, 1); }
        else { var j0 = itemIndex(at); addKeys(d.keys, j0); }
      }
      function esc(ev) { if (ev.key === "Escape") { fly && fly.end(null); fly = null; document.body.classList.remove("bdragging"); right.classList.remove("bdz"); if (ph) ph.remove(); if (d.from) d.from.classList.remove("dragged"); up(null); } }
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("keydown", esc);
    }
    function itemIndex(at) { return Math.max(0, Math.min(at, band.items.length)); }

    // ---------- Enregistrement automatique (Gus 22/11 : plus de bouton « Enregistrer », comme sur Slate) ----------
    var save = { t: 0, busy: false, again: false, files: [], state: "", meta: null, legacy: null };
    function keep() { try { localStorage.setItem(BAND_KEY, JSON.stringify(band, function (k, v) { return k.charAt(0) === "_" ? undefined : v; })); } catch (e) {} }
    function changed() { keep(); setState("wait"); soon("band", saveBand, 1200); undoMark(); undoBtns(); }
    // Annuler / Rétablir (Gus 22/11 : une bande vidée par erreur…) : instantanés de la bande, un par moment de calme (0,6 s).
    var undo = { l: [], i: -1, t: 0 };
    function snap() { return JSON.stringify(band, function (k, v) { return k.charAt(0) === "_" ? undefined : v; }); }
    function undoReset() { undo.l = [snap()]; undo.i = 0; undoBtns(); }
    function undoMark() { clearTimeout(undo.t); undo.t = setTimeout(function () { var s = snap(); if (s === undo.l[undo.i]) return; undo.l = undo.l.slice(0, undo.i + 1); undo.l.push(s); if (undo.l.length > 80) undo.l.shift(); undo.i = undo.l.length - 1; undoBtns(); }, 600); }
    function undoGo(d) {
      clearTimeout(undo.t); var s = snap();
      if (s !== undo.l[undo.i]) { undo.l = undo.l.slice(0, undo.i + 1); undo.l.push(s); undo.i++; } // changement pas encore noté
      var j = undo.i + d; if (j < 0 || j >= undo.l.length) return;
      undo.i = j; var code = band.code, created = band.created; band = JSON.parse(undo.l[j]); band.code = code; band.created = created;
      keep(); setState("wait"); soon("band", saveBand, 1200);
      drawBand(); if (data) draw();
    }
    function undoBtns() { // un changement pas encore noté compte déjà (sinon « Annuler » restait grisé une demi-seconde après chaque geste)
      var u = right.querySelector(".bundo"), r = right.querySelector(".bredo"), pend = snap() !== undo.l[undo.i];
      if (u) u.disabled = undo.i <= 0 && !pend; if (r) r.disabled = pend || undo.i >= undo.l.length - 1;
    }
    if (!emb) bibKey = function (e) { // Ctrl / Cmd + Z, Maj + Ctrl / Cmd + Z (hors champs de texte)
      var inField = e.target.closest && e.target.closest("input, textarea"); // la barre de recherche vide (focus automatique à l'arrivée) ne bloque plus Annuler / Rétablir
      if (!document.body.classList.contains("bibpage") || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || (inField && !(inField === q && !q.value)) || document.querySelector(".bmodal")) return;
      e.preventDefault(); undoGo(e.shiftKey ? 1 : -1);
    };
    function setState(s, msg) {
      save.state = s; var x = right.querySelector(".bsave"); if (!x) return;
      x.className = "bsave " + s;
      x.textContent = msg || { wait: "Modifications…", busy: "Enregistrement…", ok: "Enregistré", err: "Pas enregistré", ro: "Lecture seule" }[s] || "";
    }
    function films(b) { return (b || band).items.filter(function (x) { return x.section === undefined; }); }
    function artistsOf(b) { // chefs op de la bande : réglages en priorité, sinon ceux des films (le plus présent d'abord)
      b = b || band;
      if (String(b.artists || "").trim()) return b.artists.split(/\s*,\s*/).filter(Boolean);
      var n = {}, first = {};
      films(b).forEach(function (x, i) { (x.dops || []).forEach(function (d) { n[d] = (n[d] || 0) + 1; if (first[d] === undefined) first[d] = i; }); });
      var l = Object.keys(n).sort(function (a, b) { return n[b] - n[a] || first[a] - first[b]; });
      // seulement nos chefs op (pas un co-chef op d'une autre agence), s'il y en a
      var ours = l.filter(function (d) { return ((index && index.dps) || []).some(function (x) { return bnrm(x.name) === bnrm(d); }); });
      return ours.length ? ours : l;
    }
    // bArg : la bande à enregistrer (par défaut celle affichée) ; un enregistrement en cours garde la bande à refaire ensuite,
    // même si on est passé à une autre bande entre-temps (sinon ses derniers changements se perdaient).
    function saveBand(bArg) {
      var b = bArg && bArg.items ? bArg : band;
      if (!canWeb) { setState("ro"); return; }
      if (!films(b).length && !b.code) { if (b === band) setState(""); return; } // rien à enregistrer tant qu'il n'y a pas de film
      if (save.busy) { save.again = b; return; }
      save.busy = true; save.again = null; if (b === band) setState("busy");
      var isNew = !b.code; if (isNew) b.code = bandCode();
      var now = new Date().toISOString(), artists = artistsOf(b);
      var items = b.items.map(function (x) { var c = {}; Object.keys(x).forEach(function (k) { if (k.charAt(0) !== "_" && k !== "key" && k !== "hist") c[k] = x[k]; }); return snipOk(x, c); }); // page publique : sans l'historique
      var srcItems = b.items.map(function (x) { var c = {}; Object.keys(x).forEach(function (k) { if (k.charAt(0) !== "_") c[k] = x[k]; }); return snipOk(x, c); });
      var pub = { title: b.title.trim() || "Bande", description: (b.description || "").trim(), artists: artists, cols: b.cols, layout: b.layout || "grid", hide: b.hide, download: !!b.download, items: items, at: now };
      var files = save.files.splice(0);
      var by = user && user.login || "";
      return track(bandSeal(b.code, b.pw || "", b.expires, pub).then(function (s) {
        var cf = [{ path: BAND_PUB + s.id + ".json", text: s.text }].concat(files);
        if (save.legacy === b.code) { // ancienne bande en clair (19/11) : supprimée au passage
          cf.push({ path: BANDS + b.code + ".json", remove: true });
          cf.push({ path: BANDS + "index.json", edit: function (t) { var ix = t ? JSON.parse(t) : { bandes: [] }; ix.bandes = (ix.bandes || []).filter(function (x) { return x.code !== b.code; }); return json(ix); } });
        }
        return commit(cf, "Bande : " + pub.title + " (admin, " + by + ")").then(function () {
          save.legacy = null;
          var src = Object.assign({}, b, { at: now, by: by, created: b.created || now, items: srcItems });
          b.created = src.created;
          var src0 = Object.assign({}, src); delete src0._file;
          return nPut(BAND_NOTES + b.code + ".json", json(src0), "Bande : " + pub.title + " (admin, " + by + ")").then(function () {
            var m = { code: b.code, title: pub.title, n: films(b).length, by: by, pw: !!b.pw, expires: b.expires || "", artists: artists.join(", "), img: (films(b)[0] || {}).img || "" };
            var key = JSON.stringify(m);
            if (key === save.meta && !isNew) return;
            return nEdit(BAND_NOTES + "index.json", function (t) {
              var ix = t ? JSON.parse(t) : { bandes: [] }; ix.bandes = (ix.bandes || []).filter(function (x) { return x.code !== b.code; });
              ix.bandes.push(Object.assign({ at: now, created: src.created }, m)); return json(ix);
            }, "Bandes : liste (admin, " + by + ")").then(function () { save.meta = key; });
          });
        });
      }).then(function () {
        save.busy = false; keep(); if (b === band) setState("ok");
        if (isNew && b === band) { drawFoot(); flash(right.querySelector(".blinkline")); }
        if (save.again) saveBand(save.again);
      }, function (e) {
        save.busy = false; if (isNew && !save.meta) { /* garde le code : réessai avec le même lien */ }
        save.files = files.concat(save.files); if (b === band) setState("err", "Pas enregistré : " + e.message);
        soon("band", function () { return saveBand(b); }, 8000); // nouvel essai tout seul
        throw e;
      }), true);
    }
    function flash(x) { if (!x) return; x.classList.remove("flash"); void x.offsetWidth; x.classList.add("flash"); }

    // ---------- Bande (panneau de droite) ----------
    var foot = null;
    function drawBand(popAt, popN) {
      right.textContent = "";
      right.appendChild(el("div", { class: "btabs" }, [
        // Revenir de « Bandes existantes » = une nouvelle bande vide, comme en rechargeant la page (Gus 22/11) ; la bande en cours reste enregistrée.
        el("button", { type: "button", class: st.tab === "new" ? "on" : "", text: band.code && st.tab === "new" ? "Bande" : "Nouvelle bande", on: { click: function () {
          if (st.tab !== "new") { if (save.busy || save.state === "wait") { unsoon("band"); saveBand(); } band = bandNew(); save.meta = null; save.legacy = null; save.state = ""; keep(); undoReset(); if (data) draw(); }
          st.tab = "new"; st.fromBundle = false; drawBand();
        } } }),
        el("button", { type: "button", class: st.tab === "old" ? "on" : "", text: "Bandes existantes", on: { click: function () { st.tab = "old"; st.fromBundle = false; drawBand(); } } }),
        el("button", { type: "button", class: "bsmall" + (st.tab === "bundles" || st.tab === "bundle" ? " on" : ""), text: "Bundles", title: "Bundles : des bandes de bandes", on: { click: function () { st.tab = "bundles"; st.fromBundle = false; drawBand(); } } })]));
      if (st.tab === "old") return drawOld();
      if (st.tab === "bundles") return drawBundles();
      if (st.tab === "bundle") return drawBundle();
      if (st.fromBundle && bun) right.appendChild(el("button", { type: "button", class: "blink bback", text: "← Retour au bundle « " + (bun.title || "Bundle") + " »", on: { click: backToBundle } }));
      var title = el("input", { type: "text", class: "btitle", value: band.title, "aria-label": "Titre de la bande" });
      title.addEventListener("input", function () { band.title = title.value; changed(); });
      right.appendChild(title);
      var ul = el("div", { class: "bitems" });
      band.items.forEach(function (it, i) {
        var li;
        if (it.section !== undefined) {
          var si = el("input", { type: "text", value: it.section, placeholder: "Titre de la section (facultatif)" });
          si.addEventListener("input", function () { it.section = si.value; changed(); });
          li = el("div", { class: "bit sec" }, [el("span", { class: "bgrip", text: "⋮⋮" }), si, el("button", { type: "button", class: "bx", text: "×", title: "Retirer la section", on: { click: function () { remove(i, li); } } })]);
        } else {
          var th = el("div", { class: "bithumb" }), crop = it.crop && it.crop.t !== false ? it.crop : null; // vignette recadrée seulement si « vignette aussi »
          if (it.img) th.appendChild(el("i", { style: 'background-image:url("' + it.img + '")' + (crop ? ";transform:scale(" + crop.z + ");transform-origin:" + crop.x + "% " + crop.y + "%" : "") }));
          var marks = [];
          li = el("div", { class: "bit" }, [el("span", { class: "bgrip", text: "⋮⋮" }), th,
            el("span", { class: "bitt" }, [it.title || "", marks.length ? el("small", { text: marks.join(" · ") }) : null]),
            el("button", { type: "button", class: "bx bed", text: "✎", title: "Retoucher ce film pour cette bande (titre, crédits, vignette, extrait, recadrage)", on: { click: function () { editItem(i); } } }),
            el("button", { type: "button", class: "bx", text: "×", title: "Retirer", on: { click: function () { remove(i, li); } } })]);
        }
        if (popAt !== undefined && i >= popAt && i < popAt + (popN || 0)) li.classList.add("pop");
        li.addEventListener("pointerdown", function (e) {
          if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button, input")) return;
          dragStart(e, { kind: "move", from_i: i, from: li, imgs: [it.img || ""] });
        });
        ul.appendChild(li);
      });
      if (!band.items.length) ul.appendChild(el("div", { class: "bempty" }, [el("strong", { text: "Glissez des films dans cette colonne" }), el("span", { text: "ou « + » sur une ligne. Plusieurs films : cochez-les puis glissez-en un." })]));
      right.appendChild(ul);
      foot = el("div", { class: "bfoot" }); right.appendChild(foot); drawFoot();
    }
    function removeKey(k) { var j = band.items.findIndex(function (x) { return x.key === k; }); if (j > -1) { band.items.splice(j, 1); changed(); drawBand(); if (data) draw(); } }
    function remove(i, li) {
      li.classList.add("out");
      setTimeout(function () { band.items.splice(i, 1); changed(); drawBand(); if (data) draw(); }, 180);
    }
    function drawFoot() {
      if (!foot) return; foot.textContent = "";
      var msg = el("p", { class: "hint bmsg" });
      if (band.code) foot.appendChild(el("div", { class: "blinkline" }, [el("a", { href: bandURL(band.code), target: "_blank", rel: "noopener", text: bandURL(band.code).replace(/^https?:\/\//, "") }),
        el("button", { type: "button", class: "btn ghost", text: "Copier", on: { click: function (e) { var b = e.currentTarget; navigator.clipboard.writeText(bandURL(band.code)).then(function () { b.textContent = "Copié ✓"; setTimeout(function () { b.textContent = "Copier"; }, 1500); }); } } })]));
      foot.appendChild(el("div", { class: "bfrow" }, [
        el("button", { type: "button", class: "btn ghost", text: "+ Section", title: "Une bande avec des sections = un bundle (ex. une section par catégorie)", on: { click: function () { band.items.push({ section: "" }); changed(); drawBand(band.items.length - 1, 1); var s = right.querySelectorAll(".bit.sec input"); if (s.length) s[s.length - 1].focus(); } } }),
        el("button", { type: "button", class: "btn ghost", text: "Réglages", on: { click: settings } }),
        band.code ? el("a", { class: "btn ghost", href: bandURL(band.code), target: "_blank", rel: "noopener", text: "Voir ↗" }) : null,
        el("button", { type: "button", class: "btn primary", text: "+ Nouvelle bande", title: "La bande en cours reste enregistrée (Bandes existantes)", on: { click: function () {
          if (save.busy || save.state === "wait") { unsoon("band"); saveBand(); }
          band = bandNew(); save.meta = null; keep(); st.tab = "new"; undoReset(); drawBand(); if (data) draw();
        } } })]));
      foot.appendChild(el("div", { class: "bfrow2" }, [el("span", { class: "bsave" }),
        el("span", { class: "bur" }, [el("button", { type: "button", class: "blink bundo", text: "↶ Annuler", title: "Annuler (Ctrl / Cmd + Z)", on: { click: function () { undoGo(-1); } } }),
          el("button", { type: "button", class: "blink bredo", text: "Rétablir ↷", title: "Rétablir (Maj + Ctrl / Cmd + Z)", on: { click: function () { undoGo(1); } } })]),
        band.items.length ? el("button", { type: "button", class: "blink", text: "Vider", on: { click: function () { if (!confirm("Retirer tous les films de la bande ?")) return; band.items = []; changed(); drawBand(); if (data) draw(); } } }) : null]));
      foot.appendChild(msg);
      setState(save.state); undoBtns();
    }
    function drawOld() {
      // Recherche par nom (Gus 23/11 : la liste va vite grandir).
      var q2 = el("input", { type: "search", class: "boldq", placeholder: "Chercher une bande…", autocomplete: "off", value: st.oldQ || "" });
      var box = el("div", { class: "bold" }, [el("p", { class: "hint", text: "Chargement…" })]); right.appendChild(q2);
      // Une seule liste (Gus 27/11), sans catégories : nos bandes puis les onglets des pages du site, tous au même format ; la recherche les filtre ensemble.
      right.appendChild(box);
      bandsList().then(function (l) {
        var today = new Date().toISOString().slice(0, 10);
        function rows() {
          box.textContent = ""; var w = bnrm(q2.value).split(/\s+/).filter(Boolean);
          var m = l.filter(function (b) { var h = bnrm([b.title, b.artists, b.by].join(" ")); return h.indexOf(w.join(" ")) > -1; });
          if (!m.length && !(pd && (pd.pages || []).length)) box.appendChild(el("p", { class: "hint", text: l.length ? "Aucune bande ne correspond." : "Aucune bande enregistrée pour l'instant." }));
          m.forEach(function (b, i) {
            var exp = b.expires && b.expires < today;
            var th = el("div", { class: "bithumb" }); if (b.img) th.appendChild(el("i", { style: 'background-image:url("' + b.img + '")' }));
            // Clic n'importe où sur la bande = l'ouvrir (Gus 22/11) ; seulement son nom, pas les chefs op.
            box.appendChild(el("div", { class: "boldrow" + (exp ? " exp" : ""), style: "--i:" + Math.min(i, 20), title: "Ouvrir cette bande", on: { click: function (e) { if (!e.target.closest("a, button")) openBand(b); } } }, [th, el("div", { class: "boldt" }, [el("strong", { text: b.title }),
              el("small", { text: [b.n + " film" + (b.n > 1 ? "s" : ""), fdate(String(b.at).slice(0, 10)), b.by, b.pw ? "mot de passe" : "", b.expires ? (exp ? "expirée le " : "jusqu'au ") + fdate(b.expires) : "", b.legacy ? "ancien lien" : ""].filter(Boolean).join(" · ") })]),
              el("div", { class: "fwbtns" }, [
                el("a", { class: "btn ghost", title: "Voir la page envoyée", href: b.legacy ? SITE_VIEW + "/b/?" + b.code : bandURL(b.code), target: "_blank", rel: "noopener", text: "↗" }),
                b.legacy ? null : el("button", { type: "button", class: "btn ghost", text: "×", title: "Supprimer cette bande (le lien ne marchera plus)", on: { click: function () { delBand(b); } } })])]));
          });
        }
        q2.addEventListener("input", function () { st.oldQ = q2.value; rows(); });
        // Onglets des pages du site (Gus 25/11) : une bande par onglet, ouverte dans « Modifier la sélection » de la fiche ; rangés à la suite de nos bandes (même liste).
        var pd = null, pb = box;
        function prow() {
          if (!pd) return; var w = bnrm(q2.value); var k = 0;
          (pd.pages || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p) {
            p.tabs.forEach(function (t) {
              if (bnrm(p.name + " " + t.name).indexOf(w) < 0) return;
              var th = el("div", { class: "bithumb" }); if (t.img) th.appendChild(el("i", { style: 'background-image:url("' + t.img + '")' }));
              pb.appendChild(el("div", { class: "boldrow", style: "--i:" + Math.min(k++, 20), title: "Modifier cet onglet de la page", on: { click: function (e) { if (e.target.closest("a, button")) return; selOpen = { slug: p.slug, tab: t.name }; location.hash = "#/dp/" + p.slug; } } }, [th,
                el("div", { class: "boldt" }, [el("strong", { text: p.name + " · " + t.name }), el("small", { text: t.n + " film" + (t.n > 1 ? "s" : "") })]),
                el("div", { class: "fwbtns" }, [el("a", { class: "btn ghost", href: SITE_VIEW + "/" + p.slug + "/" + t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), target: "_blank", rel: "noopener", text: "↗", title: "Voir l'onglet sur le site" })])]));
            });
          });
        }
        var rows0 = rows; rows = function () { rows0(); prow(); };
        bibLoad().then(function (d) { pd = d; rows(); });
        rows(); q2.focus();
      }, function (e) { box.textContent = "Indisponible : " + e.message + " (la clé doit avoir accès au dépôt notes)"; });
    }
    // ---------- Bundles (Gus 23/11) : des bandes de bandes, comme sur Slate ----------
    // Liste dans le dépôt notes (bandes/bundles.json : { bundles: [{ code, title, description, bands: [codes], at, by, created }] }) ;
    // page publique chiffrée comme une bande ({ bundle: true, title, description, bands: [{ code }] }), même lien b/<code> : la page
    // lit chaque bande avec son propre code (toujours à jour). On ajoute des bandes existantes, on les ordonne, on les ouvre pour les
    // modifier ou on en crée une nouvelle depuis le bundle (« ← Retour au bundle » l'y ajoute).
    var bun = null, bunQ = Promise.resolve(), bunT = 0, bunState = "";
    function bundlesList() { return nGet(BAND_NOTES + "bundles.json").then(function (t) { return t ? JSON.parse(t).bundles || [] : []; }); }
    function bunChanged() { if (!bun.code && !bun.bands.length) return; bunSt("wait"); soon("bundle", bunSave, 1000); }
    function bunSt(x, msg) { bunState = x; var e = right.querySelector(".bsave"); if (e && st.tab === "bundle") { e.className = "bsave " + x; e.textContent = msg || { wait: "Modifications…", busy: "Enregistrement…", ok: "Enregistré", err: "Pas enregistré" }[x] || ""; } }
    function bunSave() {
      if (!canWeb || !bun) return;
      var b = bun, isNew = !b.code; if (isNew) b.code = bandCode();
      var by = user && user.login || "", now = new Date().toISOString(), snapB = JSON.parse(JSON.stringify(b));
      bunQ = bunQ.then(function () {
        bunSt("busy");
        var pub = { bundle: true, title: snapB.title || "Bundle", description: snapB.description || "", bands: snapB.bands.map(function (c) { return { code: c }; }), at: now };
        return bandSeal(snapB.code, "", "", pub).then(function (x) {
          return commit([{ path: BAND_PUB + x.id + ".json", text: x.text }], "Bundle : " + pub.title + " (admin, " + by + ")");
        }).then(function () {
          return nEdit(BAND_NOTES + "bundles.json", function (t) {
            var o = t ? JSON.parse(t) : { bundles: [] }; o.bundles = (o.bundles || []).filter(function (x) { return x.code !== snapB.code; });
            o.bundles.push({ code: snapB.code, title: pub.title, description: pub.description, bands: snapB.bands, at: now, by: by, created: snapB.created || now }); return json(o);
          }, "Bundles : liste (admin, " + by + ")");
        }).then(function () { b.created = b.created || now; bunSt("ok"); if (isNew && st.tab === "bundle") drawBand(); }, function (e) { bunSt("err", "Pas enregistré : " + e.message); });
      });
      return bunQ.then(function () { if (bunState === "err") throw new Error("bundle pas enregistré"); });
    }
    function drawBundles() {
      var q3 = el("input", { type: "search", class: "boldq", placeholder: "Chercher un bundle…", autocomplete: "off" });
      var box = el("div", { class: "bold" }, [el("p", { class: "hint", text: "Chargement…" })]);
      right.appendChild(el("div", { class: "bunhead" }, [el("p", { class: "hint", text: "Un bundle regroupe plusieurs bandes sous un seul lien (une bande par onglet)." }),
        el("button", { type: "button", class: "btn primary", text: "+ Nouveau bundle", on: { click: function () { bun = { code: null, title: "Bundle (" + new Date().getDate() + " " + MOISC[new Date().getMonth()] + ")", description: "", bands: [] }; st.tab = "bundle"; drawBand(); } } })]));
      right.appendChild(q3); right.appendChild(box);
      bundlesList().then(function (l) {
        l.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
        var pageRows = null; // pages du site : à la suite des bundles, dans la même liste (Gus 27/11)
        function rows() {
          box.textContent = ""; var w = bnrm(q3.value).split(/\s+/).filter(Boolean);
          var m = l.filter(function (b) { var h = bnrm([b.title, b.by].join(" ")); return h.indexOf(w.join(" ")) > -1; });
          if (!m.length) box.appendChild(el("p", { class: "hint", text: l.length ? "Aucun bundle ne correspond." : "Aucun bundle pour l'instant." }));
          m.forEach(function (b, i) {
            box.appendChild(el("div", { class: "boldrow nothumb", style: "--i:" + Math.min(i, 20), title: "Ouvrir ce bundle", on: { click: function (e) { if (e.target.closest("a, button")) return; bun = JSON.parse(JSON.stringify(b)); st.tab = "bundle"; drawBand(); } } }, [
              el("div", { class: "boldt" }, [el("strong", { text: b.title }), el("small", { text: [b.bands.length + " bande" + (b.bands.length > 1 ? "s" : ""), fdate(String(b.at).slice(0, 10)), b.by].filter(Boolean).join(" · ") })]),
              el("div", { class: "fwbtns" }, [el("a", { class: "btn ghost", href: bandURL(b.code), target: "_blank", rel: "noopener", text: "↗", title: "Voir la page envoyée" }),
                el("button", { type: "button", class: "btn ghost", text: "×", title: "Supprimer ce bundle (ses bandes restent)", on: { click: function () { delBundle(b); } } })])]));
          });
          if (pageRows) pageRows();
        }
        q3.addEventListener("input", rows); rows();
        // Pages du site (Gus 25/11) : chaque page de chef op est un bundle (un onglet = une bande), modifiable ici ou dans sa fiche ;
        // le site change dès la publication. Pas de lien à envoyer (la page du site existe déjà).
        bibLoad().then(function (d) {
          var pb = box;
          function prow() {
            var w = bnrm(q3.value);
            [["Accueil", "#/home", ""], ["Spotlight", "#/spotlight", "spotlight/"], ["Fiction", "#/fiction", "fiction/"]].forEach(function (x) {
              if (bnrm(x[0]).indexOf(w) < 0) return;
              pb.appendChild(el("div", { class: "boldrow nothumb", title: "Ouvrir la page dans l'admin (« Modifier la sélection »)", on: { click: function (e) { if (!e.target.closest("a, button")) location.hash = x[1]; } } }, [
                el("div", { class: "boldt" }, [el("strong", { text: "Page · " + x[0] }), el("small", { text: "page du site" })]),
                el("div", { class: "fwbtns" }, [el("a", { class: "btn ghost", href: SITE_VIEW + "/" + x[2], target: "_blank", rel: "noopener", text: "↗", title: "Voir la page sur le site" })])]));
            });
            (d.pages || []).filter(function (p) { return bnrm(p.name).indexOf(w) > -1; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p, i) {
              pb.appendChild(el("div", { class: "boldrow nothumb", style: "--i:" + Math.min(i, 20), title: "Modifier la sélection de la page", on: { click: function (e) { if (e.target.closest("a, button")) return; selOpen = { slug: p.slug }; location.hash = "#/dp/" + p.slug; } } }, [
                el("div", { class: "boldt" }, [el("strong", { text: "Page · " + p.name }), el("small", { text: [p.tabs.length + " onglet" + (p.tabs.length > 1 ? "s" : ""), p.tabs.map(function (t) { return t.name; }).join(", "), p.hidden ? "cachée" : ""].filter(Boolean).join(" · ") })]),
                el("div", { class: "fwbtns" }, [el("a", { class: "btn ghost", href: SITE_VIEW + "/" + p.slug + "/", target: "_blank", rel: "noopener", text: "↗", title: "Voir la page sur le site" })])]));
            });
          }
          pageRows = prow; rows();
        });
      }, function (e) { box.textContent = "Indisponible : " + e.message; });
    }
    function delBundle(b) {
      if (!confirm("Supprimer le bundle « " + b.title + " » ? Son lien ne marchera plus (les bandes restent).")) return;
      var by = user && user.login || "";
      bandKeys(b.code).then(function (k) { return commit([{ path: BAND_PUB + k.id + ".json", remove: true }], "Bundle supprimé : " + b.title + " (admin, " + by + ")").catch(function () {}); })
        .then(function () { return nEdit(BAND_NOTES + "bundles.json", function (t) { var o = t ? JSON.parse(t) : { bundles: [] }; o.bundles = (o.bundles || []).filter(function (x) { return x.code !== b.code; }); return json(o); }, "Bundles : suppression (admin, " + by + ")"); })
        .then(function () { if (bun && bun.code === b.code) bun = null; drawBand(); }, function (e) { alert("Pas supprimé : " + e.message); });
    }
    function drawBundle() {
      if (!bun) { st.tab = "bundles"; return drawBundles(); }
      right.appendChild(el("button", { type: "button", class: "blink bback", text: "← Tous les bundles", on: { click: function () { st.tab = "bundles"; drawBand(); } } }));
      var title = el("input", { type: "text", class: "btitle", value: bun.title, "aria-label": "Nom du bundle" });
      title.addEventListener("input", function () { bun.title = title.value; bunChanged(); });
      right.appendChild(title);
      var ul = el("div", { class: "bitems" }, [el("p", { class: "hint", text: "Chargement…" })]); right.appendChild(ul);
      var foot2 = el("div", { class: "bfoot" }); right.appendChild(foot2);
      if (bun.code) right.appendChild(el("button", { type: "button", class: "btn bdelb bdelside", text: "Supprimer ce bundle", title: "Son lien ne marchera plus (ses bandes restent)", on: { click: function () { delBundle(bun); } } }));
      bandsList().then(function (all) {
        var by = {}; all.forEach(function (b) { by[b.code] = b; });
        var dragAt = 0;
        // Réordonner en glissant (Gus 23/11, comme les films d'une bande) : la bande suit la souris (effet ressort), un trait lumineux
        // montre où elle va, les autres s'écartent ; au lâcher elle se pose à sa place (petit rebond). Un clic sans glisser l'ouvre.
        function bunDrag(e, i, row, img) {
          if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button")) return;
          var sx = e.clientX, sy = e.clientY, fly = null, ph = null, at = i;
          function rowsNow() { return [].filter.call(ul.children, function (x) { return x.classList.contains("bunit") && x !== row; }); }
          function mv(ev) {
            if (!fly) { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return; fly = bibFly(ev, [img], 1); row.classList.add("dragged"); document.body.classList.add("bdragging"); }
            ev.preventDefault(); fly.move(ev);
            var rs = rowsNow(); at = rs.length;
            for (var k = 0; k < rs.length; k++) { var r = rs[k].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { at = k; break; } }
            if (!ph) ph = el("div", { class: "bph" });
            var ref = rs[at] || (rs.length ? rs[rs.length - 1].nextSibling : row.nextSibling);
            if (ph.nextSibling !== ref) ul.insertBefore(ph, ref);
          }
          function up() {
            removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
            if (!fly) return;
            dragAt = Date.now(); document.body.classList.remove("bdragging"); row.classList.remove("dragged");
            fly.end(ph ? ph.getBoundingClientRect() : null); if (ph) ph.remove();
            if (at === i) return;
            bun.bands.splice(at, 0, bun.bands.splice(i, 1)[0]); bunChanged(); drawL(at);
          }
          addEventListener("pointermove", mv); addEventListener("pointerup", up);
        }
        function drawL(popAt) {
          ul.textContent = "";
          bun.bands.forEach(function (c, i) {
            var b = by[c] || { code: c, title: "(bande supprimée ?)", n: 0 };
            var th = el("div", { class: "bithumb" }); if (b.img) th.appendChild(el("i", { style: 'background-image:url("' + b.img + '")' }));
            var row = el("div", { class: "bit bunit" + (popAt === i ? " pop" : ""), title: "Cliquer pour ouvrir, glisser pour changer l'ordre", on: { click: function (e) { if (e.target.closest("button") || Date.now() - dragAt < 300) return; if (by[c]) { st.fromBundle = true; openBand(by[c]); } } } }, [
              el("span", { class: "bgrip", text: String(i + 1) }), th, el("span", { class: "bitt" }, [b.title || "", el("small", { text: (b.n || 0) + " film" + (b.n > 1 ? "s" : "") })]),
              el("button", { type: "button", class: "bx", text: "↑", title: "Monter", disabled: i ? null : true, on: { click: function () { bun.bands.splice(i - 1, 0, bun.bands.splice(i, 1)[0]); bunChanged(); drawL(i - 1); } } }),
              el("button", { type: "button", class: "bx", text: "×", title: "Retirer du bundle (la bande reste)", on: { click: function () { bun.bands.splice(i, 1); bunChanged(); drawL(); } } })]);
            row.addEventListener("pointerdown", function (e) { bunDrag(e, i, row, b.img || ""); });
            ul.appendChild(row);
          });
          if (!bun.bands.length) ul.appendChild(el("div", { class: "bempty" }, [el("strong", { text: "Aucune bande dans ce bundle" }), el("span", { text: "Ajoutez une bande existante ou créez-en une." })]));
          // Ajouter une bande existante : liste avec recherche
          var pq = el("input", { type: "search", class: "boldq", placeholder: "Ajouter une bande existante : chercher…", autocomplete: "off" }), pl = el("div", { class: "bunpick" });
          // Vignette du 1er film (comme sur le site) ; nos bandes ET les onglets des pages du site dans la même liste (Gus 27/11) : un onglet de page devient une vraie bande
          // (copie de ses films) au moment où on l'ajoute au bundle.
          function pick() {
            pl.textContent = ""; var w = bnrm(pq.value).split(/\s+/).filter(Boolean);
            var cand = all.filter(function (b) { return !b.legacy && bun.bands.indexOf(b.code) < 0; });
            if (pagesAll) pagesAll.forEach(function (p) { p.tabs.forEach(function (t) { if (t.n) cand.push({ tab: t, page: p, title: p.name + " · " + t.name, img: t.img, n: t.n }); }); });
            cand.filter(function (b) { var h = bnrm(b.title); return h.indexOf(w.join(" ")) > -1; }).slice(0, 120).forEach(function (b) { // sans recherche aussi : toute la liste, qui défile
              var th = el("div", { class: "bithumb" }); if (b.img) th.appendChild(el("i", { style: 'background-image:url("' + b.img + '")' }));
              pl.appendChild(el("button", { type: "button", on: { click: function (e) {
                if (!b.tab) { bun.bands.push(b.code); bunChanged(); drawL(); return; }
                var btn = e.currentTarget; btn.disabled = true; var nb = bandNew(); nb.title = b.title;
                nb.items = (b.tab.keys || []).map(function (k) { return filmOf(k); }).filter(Boolean).map(bandItem);
                if (!nb.items.length) { btn.disabled = false; return; }
                if (save.busy || save.state === "wait") { unsoon("band"); saveBand(); }
                Promise.resolve(saveBand(nb)).then(function () { bun.bands.push(nb.code); bunChanged(); drawL(); }, function (er) { btn.disabled = false; alert("Pas ajouté : " + er.message); });
              } } }, [th, el("span", { class: "bpt", text: b.title }), el("small", { text: (b.n || 0) + " films" })]));
            });
          }
          var pagesAll = null; bibLoad().then(function (d) { pagesAll = d.pages || []; pick(); });
          pq.addEventListener("input", pick); pick();
          ul.appendChild(el("div", { class: "bunadd" }, [pq, pl,
            el("button", { type: "button", class: "btn ghost", text: "+ Créer une bande dans ce bundle", on: { click: function () {
              if (save.busy || save.state === "wait") { unsoon("band"); saveBand(); }
              band = bandNew(); save.meta = null; save.legacy = null; save.state = ""; keep(); undoReset(); st.fromBundle = true; st.tab = "new"; drawBand(); if (data) draw();
            } } })]));
        }
        drawL();
      }, function (e) { ul.textContent = "Indisponible : " + e.message; });
      if (bun.code) foot2.appendChild(el("div", { class: "blinkline" }, [el("a", { href: bandURL(bun.code), target: "_blank", rel: "noopener", text: bandURL(bun.code).replace(/^https?:\/\//, "") }),
        el("button", { type: "button", class: "btn ghost", text: "Copier", on: { click: function (e) { var b = e.currentTarget; navigator.clipboard.writeText(bandURL(bun.code)).then(function () { b.textContent = "Copié ✓"; setTimeout(function () { b.textContent = "Copier"; }, 1500); }); } } })]));
      else foot2.appendChild(el("p", { class: "hint", text: "Le lien du bundle est créé dès qu'on y ajoute une bande." }));
      foot2.appendChild(el("div", { class: "bfrow2" }, [el("span", { class: "bsave" })])); bunSt(bunState);
    }
    function backToBundle() { // depuis une bande ouverte ou créée dans un bundle : elle y est ajoutée si elle n'y est pas encore
      unsoon("band"); if (band.items.some(function (x) { return x.section === undefined; })) saveBand();
      if (bun && band.code && bun.bands.indexOf(band.code) < 0) { bun.bands.push(band.code); bunChanged(); }
      st.fromBundle = false; st.tab = "bundle";
      setTimeout(drawBand, band.code && save.busy ? 1500 : 0); // laisse la bande finir son 1er enregistrement (liste à jour)
    }
    function bandsList() { // toutes les bandes (dépôt notes + anciennes en clair), les plus récentes d'abord
      return Promise.all([nGet(BAND_NOTES + "index.json").then(function (t) { return t ? JSON.parse(t).bandes || [] : []; }), readFile(BANDS + "index.json").catch(function () { return null; })]).then(function (r) {
        return r[0].concat(((r[1] && r[1].bandes) || []).map(function (b) { return Object.assign({ legacy: true }, b); })).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      });
    }
    function openBand(b) {
      if (save.busy || save.state === "wait") { unsoon("band"); saveBand(); } // la bande affichée garde ses derniers changements
      var p = b.legacy ? readFile(BANDS + b.code + ".json") : nGet(BAND_NOTES + b.code + ".json").then(function (t) { return t ? JSON.parse(t) : null; });
      p.then(function (d) {
        if (!d) return;
        band = { code: d.code, title: d.title, description: d.description || "", artists: Array.isArray(d.artists) ? (b.legacy ? "" : d.artists.join(", ")) : (d.artists || ""), items: d.items || [], cols: d.cols || 3, layout: d.layout || "grid",
          hide: d.hide || {}, expires: d.expires || "", download: !!d.download, pw: b.legacy ? "" : (d.pw || ""), created: d.created };
        band.items.forEach(function (x) { if (x.section === undefined && !x.key) x.key = x.slate ? "s" + x.slate : "u" + (x.full || x.video || x.img || x.title); });
        save.meta = null; save.legacy = b.legacy ? b.code : null; save.state = ""; st.tab = "new"; undoReset(); drawBand(); if (data) draw();
        if (b.legacy) setState("", "Ancienne bande : elle passera au nouveau lien sécurisé au premier changement.");
      });
    }
    function delBand(b) {
      if (!confirm("Supprimer « " + b.title + " » ? Le lien ne marchera plus.")) return;
      var by = user && user.login || "";
      bandKeys(b.code).then(function (k) {
        return commit([{ path: BAND_PUB + k.id + ".json", remove: true }], "Bande supprimée : " + b.title + " (admin, " + by + ")").catch(function () {});
      }).then(function () {
        return nEdit(BAND_NOTES + "index.json", function (t) { var ix = t ? JSON.parse(t) : { bandes: [] }; ix.bandes = (ix.bandes || []).filter(function (x) { return x.code !== b.code; }); return json(ix); }, "Bandes : suppression (admin, " + by + ")");
      }).then(function () {
        return nGet(BAND_NOTES + b.code + ".json").then(function (t) { if (t !== null) return gh("/repos/" + NOTES_REPO + "/contents/" + BAND_NOTES + b.code + ".json", { method: "DELETE", body: { message: "Bande supprimée (admin, " + by + ")", sha: nSha[BAND_NOTES + b.code + ".json"] } }); });
      }).then(function () { if (band.code === b.code) { band = bandNew(); keep(); } drawBand(); }, function (e) { alert("Pas supprimée : " + e.message); });
    }
    function settings() {
      var ov = el("div", { class: "bmodal" }), box = el("div", { class: "bmbox" });
      function close() { ov.classList.add("out"); setTimeout(function () { ov.remove(); }, 160); drawBand(); }
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      var name = el("input", { type: "text", value: band.title }), arts = el("input", { type: "text", value: band.artists || "", placeholder: "Vide = détectés dans les films : " + (artistsOf().join(", ") || "aucun") });
      var desc = el("textarea", { rows: 4 }); desc.value = band.description || "";
      function ck(label, get, set) { var c = el("input", { type: "checkbox" }); c.checked = !!get(); c.addEventListener("change", function () { set(c.checked); changed(); }); return el("label", { class: "bck" }, [c, " " + label]); }
      var cols = el("div", { class: "bcols" });
      // Mise en page (Gus 24/11, comme sur Slate) : grille, ou « Plein écran » = le 1er film en grand en haut, son extrait qui joue.
      function drawCols() { cols.textContent = "";
        [["grid", "Grille"], ["bleed", "Plein écran en haut"]].forEach(function (l) { cols.appendChild(el("button", { type: "button", class: "btn" + ((band.layout || "grid") === l[0] ? " primary" : ""), text: l[1], on: { click: function () { band.layout = l[0]; changed(); drawCols(); } } })); });
        cols.appendChild(el("span", { class: "bcolsep" }));
        [1, 2, 3].forEach(function (n) { cols.appendChild(el("button", { type: "button", class: "btn" + (band.cols === n ? " primary" : ""), text: n + " colonne" + (n > 1 ? "s" : ""), on: { click: function () { band.cols = n; changed(); drawCols(); } } })); }); }
      drawCols();
      var exp = el("input", { type: "date", value: band.expires || "" });
      var pw = el("input", { type: "text", value: band.pw || "", placeholder: "Aucun", autocomplete: "off" });
      [name, arts, desc, exp, pw].forEach(function (x) { x.addEventListener("input", function () { band.title = name.value; band.artists = arts.value; band.description = desc.value; band.expires = exp.value; band.pw = pw.value.trim(); changed(); }); });
      box.appendChild(el("span", { class: "label", text: "Réglages de la bande · enregistrés tout seuls" }));
      box.appendChild(el("div", { class: "bmgrid" }, [
        el("div", {}, [el("span", { class: "label", text: "Nom" }), name, el("span", { class: "label", text: "Chefs op (en haut de la page, liens vers leur page sur le site)" }), arts, el("span", { class: "label", text: "Description" }), desc,
          el("div", { class: "bcks" }, [ck("Cacher le réal", function () { return band.hide.dir; }, function (v) { band.hide.dir = v; }), ck("Cacher le chef op", function () { return band.hide.dop; }, function (v) { band.hide.dop = v; }),
            ck("Cacher la prod", function () { return band.hide.prod; }, function (v) { band.hide.prod = v; }), ck("Cacher les types de contenu", function () { return band.hide.types; }, function (v) { band.hide.types = v; }),
            ck("Cacher les prix", function () { return band.hide.awards; }, function (v) { band.hide.awards = v; })])]),
        el("div", {}, [el("span", { class: "label", text: "Présentation" }), cols, el("span", { class: "label", text: "Date d'expiration (la page affiche « plus disponible » après)" }), exp,
          el("span", { class: "label", text: "Mot de passe (vide = aucun ; la page est chiffrée avec)" }), pw,
          ck("Autoriser le téléchargement", function () { return band.download; }, function (v) { band.download = v; })])]));
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: "OK", on: { click: close } }),
        band.code && !band.legacy ? el("button", { type: "button", class: "btn bdelb", text: "Supprimer cette bande", title: "Le lien ne marchera plus", on: { click: function () { ov.remove(); delBand({ code: band.code, title: band.title }); } } }) : null]));
      ov.appendChild(box); document.body.appendChild(ov);
    }

    // ---------- Retouches d'un film pour cette bande seulement (Gus 22/11) ----------
    // Titre, crédits, chefs op, types de contenu ; vignette (une image du film ou un still) ; extrait (début choisi dans le film,
    // 10 s) ; recadrage (zoom + point de cadrage). La bibliothèque et les fiches ne changent pas.
    // i = numéro du film dans la bande ; ou lib = { it, orig, onChange, onClose, reset, files } pour les infos d'un film de la
    // bibliothèque (Gus 22/11 : même fenêtre, mais pour toutes les prochaines bandes ; data/bibli/edits.json).
    function editItem(i, lib) {
      var it = lib ? lib.it : band.items[i], orig = lib ? lib.orig : filmOf(it.key), chg0 = lib ? lib.onChange : changed, files = lib ? lib.files : save.files;
      // Annuler / Rétablir dans la fenêtre (Gus 22/11) : instantanés du film (gardés quand la fenêtre se redessine après un retour).
      var ED_K = BIB_EK.concat(["edited"]), eu = edUndo.get(it);
      function esnap() { var o = {}; ED_K.forEach(function (k) { var v = k === "snip" && it._snipTmp ? it._snipSaved : it[k]; if (v !== undefined) o[k] = v; }); return JSON.stringify(o); }
      if (!eu) { eu = { l: [esnap()], i: 0, t: 0 }; edUndo.set(it, eu); }
      function eMark() { clearTimeout(eu.t); eu.t = setTimeout(function () { var x = esnap(); if (x === eu.l[eu.i]) return; eu.l = eu.l.slice(0, eu.i + 1); eu.l.push(x); if (eu.l.length > 60) eu.l.shift(); eu.i = eu.l.length - 1; eBtns(); }, 500); eBtns(); }
      function chg() { chg0(); eMark(); if (shr && shr.again) shr.again(); }
      function eBtns() { var pend = esnap() !== eu.l[eu.i]; if (euB) { euB.disabled = eu.i <= 0 && !pend; erB.disabled = pend || eu.i >= eu.l.length - 1; } }
      function eGo(d) {
        clearTimeout(eu.t); var x = esnap(); if (x !== eu.l[eu.i]) { eu.l = eu.l.slice(0, eu.i + 1); eu.l.push(x); eu.i++; }
        var j = eu.i + d; if (j < 0 || j >= eu.l.length) return; eu.i = j;
        var o = JSON.parse(eu.l[j]); ED_K.forEach(function (k) { if (o[k] === undefined) delete it[k]; else it[k] = o[k]; }); delete it._snipTmp; delete it._snipSaved;
        chg0(); document.removeEventListener("keydown", eKey, true); ov.remove(); editItem(i, lib);
      }
      var euB = null, erB = null, shr = null;
      function reopen() { document.removeEventListener("keydown", eKey, true); ov.remove(); editItem(i, lib); } // rouvre la fenêtre (version affichée changée)
      function eKey(e) {
        if (!document.body.contains(box)) { document.removeEventListener("keydown", eKey, true); return; }
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || (e.target.matches && e.target.matches("textarea, input:not([type=range]):not([type=checkbox])"))) return;
        e.preventDefault(); e.stopPropagation(); if (snipUndo(e.shiftKey ? 1 : -1)) return; eGo(e.shiftKey ? 1 : -1);
      }
      document.addEventListener("keydown", eKey, true);
      var ov = el("div", { class: "bmodal" }), box = el("div", { class: "bmbox bedit" });
      function close() {
        if (it._snipTmp) { snipDiscard(); chg0(); } // extrait pas validé : oublié, l'extrait validé reste
        document.removeEventListener("keydown", eKey, true);
        ov.classList.add("out"); setTimeout(function () { ov.remove(); }, 160); if (lib) lib.onClose(); else drawBand();
      }
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      // Montage : un clic dans un endroit vide de la fenêtre désélectionne le bloc en cours de modification (Gus 26/11), comme un 2e clic sur le bloc.
      box.addEventListener("click", function (e) {
        if (typeof parts !== "function" || !parts() || bi < 0 || !e.isTrusted) return;
        if (e.target.closest && e.target.closest(".bblk, .bblks, .hb, .bblkbar, button, input, textarea, select, a, video, label, .tl, .bthumbs, .bhsnip, .bchipin")) return;
        bi = -1; delete it._sel; act = "in"; drawBlocks(); if (typeof draw === "function" && tl) { draw(); if (player) seek(selB().s); }
      });
      function fld(label, get, set, ph) {
        var x = el("input", { type: "text", value: get() || "", placeholder: ph || "" });
        x.addEventListener("input", function () { set(x.value); it.edited = true; chg(); prevMeta(); });
        return [el("span", { class: "label", text: label }), x];
      }
      var list2 = function (s) { return String(s || "").split(/\s*,\s*/).filter(Boolean); };
      // Crédits en blocs (Gus 22/11) : on tape, la liste propose les noms déjà connus de cette sorte (réals, prods, types) ; un clic
      // ou Entrée (ou une virgule) en fait un bloc ; clic sur un bloc = le modifier ; Retour arrière dans le champ vide = retirer le dernier.
      function chipsIn(type, get, set) {
        var l = get(), box = el("div", { class: "bchipin" }), inp = el("input", { type: "text", placeholder: l.length ? "" : "Taper un nom…", autocomplete: "off" }), sug = el("div", { class: "bcsug", hidden: true }), si = -1;
        function commit2() { set(l.slice()); it.edited = true; chg(); prevMeta(); }
        function add(v) { v = String(v || "").trim(); if (!v) return; if (!l.some(function (x) { return bnrm(x) === bnrm(v); })) l.push(v); inp.value = ""; commit2(); drawC(); inp.focus(); }
        function drawC() {
          [].slice.call(box.querySelectorAll(".bcc")).forEach(function (x) { x.remove(); });
          l.forEach(function (v, j) {
            box.insertBefore(el("span", { class: "bcc", title: "Cliquer pour modifier" }, [el("span", { text: v, on: { click: function () { l.splice(j, 1); commit2(); drawC(); inp.value = v; inp.focus(); suggest(); } } }),
              el("button", { type: "button", class: "bccx", text: "×", title: "Retirer", on: { click: function (e) { e.stopPropagation(); l.splice(j, 1); commit2(); drawC(); } } })]), inp);
          });
          inp.placeholder = l.length ? "" : "Taper un nom…";
        }
        function suggest() {
          sug.textContent = ""; si = -1; var v = bnrm(inp.value); if (!v || !data) { sug.hidden = true; return; }
          var hits = data.sug.filter(function (x) { return x.type === type && bnrm(x.value).indexOf(v) > -1 && !l.some(function (y) { return bnrm(y) === bnrm(x.value); }); })
            .sort(function (a, b) { return (bnrm(a.value).indexOf(v) === 0 ? 0 : 1) - (bnrm(b.value).indexOf(v) === 0 ? 0 : 1) || b.n - a.n; }).slice(0, 8);
          hits.forEach(function (x) { sug.appendChild(el("button", { type: "button", on: { mousedown: function (e) { e.preventDefault(); }, click: function () { add(x.value); sug.hidden = true; } } }, [el("span", { text: x.value }), el("small", { text: x.n + " film" + (x.n > 1 ? "s" : "") })])); });
          sug.hidden = !hits.length;
        }
        inp.addEventListener("input", function () { if (/,/.test(inp.value)) { inp.value.split(",").forEach(function (x, k, a) { if (k < a.length - 1) add(x); else inp.value = x; }); } suggest(); });
        inp.addEventListener("keydown", function (e) {
          var b = sug.querySelectorAll("button");
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && b.length) { e.preventDefault(); si = (si + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length; b.forEach(function (x, k) { x.classList.toggle("on", k === si); }); }
          else if (e.key === "Enter") { e.preventDefault(); if (si > -1 && b[si]) b[si].click(); else { add(inp.value); sug.hidden = true; } }
          else if (e.key === "Backspace" && !inp.value && l.length) { l.pop(); commit2(); drawC(); }
          else if (e.key === "Escape") { sug.hidden = true; }
        });
        inp.addEventListener("blur", function () { setTimeout(function () { sug.hidden = true; if (inp.value.trim()) add(inp.value); }, 150); });
        box.addEventListener("click", function (e) { if (e.target === box) inp.focus(); });
        box.appendChild(inp); drawC();
        return el("div", { class: "bchipwrap" }, [box, sug]);
      }
      // Crédits avec rôle (Gus 22/11) : un de nos chefs op « Camera operator » sur un film est crédité après le cinematographer.
      // it.dops = noms ; it.roles = { nom: rôle } (sans rôle = cinematographer).
      function credEd() {
        var box = el("div", { class: "bcred" });
        function mark() { it.edited = true; chg(); }
        function draw() {
          box.textContent = ""; it.dops = it.dops || [];
          (it.dops.length ? it.dops.slice() : [""]).forEach(function (n, j) { // aucune ligne : une case vide à remplir d'emblée (rien n'est enregistré tant qu'elle est vide)
            if (j >= it.dops.length) { var ghost = true; }
            var ni = el("input", { type: "text", value: n, placeholder: "Nom", list: "bibdopnames" }), ri = el("input", { type: "text", value: (it.roles || {})[n] || "", placeholder: "Cinematographer", list: "bibroles" });
            ni.addEventListener("input", function () { if (j >= it.dops.length) it.dops[j] = ""; var old = it.dops[j], r = it.roles && it.roles[old]; if (r) delete it.roles[old]; it.dops[j] = ni.value.trim(); if (r && it.dops[j]) it.roles[it.dops[j]] = r; mark(); });
            ri.addEventListener("input", function () { if (j >= it.dops.length) it.dops[j] = ""; var v = ri.value.trim(), k = it.dops[j]; it.roles = it.roles || {}; if (v && !/^(cinematographer|dop|d\.?o\.?p\.?|director of photography|chef op[ée]rat(eur|rice))$/i.test(v)) it.roles[k] = v; else delete it.roles[k]; if (!Object.keys(it.roles).length) delete it.roles; mark(); });
            box.appendChild(el("div", { class: "bcrow" }, [ni, ri, el("button", { type: "button", class: "bx", text: "×", title: "Retirer", on: { click: function () { if (j >= it.dops.length) return; if (it.roles) delete it.roles[it.dops[j]]; it.dops.splice(j, 1); mark(); draw(); } } })]));
          });
          box.appendChild(el("button", { type: "button", class: "blink", text: "+ Ajouter un chef op ou un rôle", on: { click: function () { if (!it.dops.length) it.dops.push(""); it.dops.push(""); draw(); var l = box.querySelectorAll(".bcrow input"); if (l.length) l[l.length - 2].focus(); } } }));
          var dn = document.getElementById("bibdopnames"); if (dn) dn.remove();
          if (data) document.body.appendChild(el("datalist", { id: "bibdopnames" }, data.sug.filter(function (x) { return x.type === "dop"; }).sort(function (a, b) { return b.n - a.n; }).map(function (x) { return el("option", { value: x.value }); })));
          if (!document.getElementById("bibroles")) document.body.appendChild(el("datalist", { id: "bibroles" }, ["Cinematographer", "Camera operator", "B camera operator", "2nd unit DoP", "Underwater DoP", "Additional photography", "Steadicam operator", "Gaffer", "Colorist"].map(function (r) { return el("option", { value: r }); })));
        }
        draw(); return box;
      }
      // Aperçu : comme sur la page envoyée (vignette, extrait au survol, recadrage)
      var pv = el("div", { class: "bpv" }), pin = el("div", { class: "bpvin" }), pmeta = el("div", { class: "bpvm" });
      pv.appendChild(pin); pv.appendChild(pmeta);
      var pvid = null;
      function prevImg() {
        pin.style.backgroundImage = it.img ? 'url("' + imgShow(it.img) + '")' : "";
        if (typeof zth !== "undefined" && zth) zth.style.backgroundImage = it.img ? 'url("' + imgShow(it.img) + '")' : "";
        // Recadrage : l'extrait toujours ; la vignette seulement si « vignette aussi » (t), comme sur les pages.
        var c = it.crop || { z: 1, x: 50, y: 50 }, all = !it.crop || it.crop.t !== false;
        pin.style.transform = all ? "scale(" + c.z + ")" : ""; pin.style.transformOrigin = c.x + "% " + c.y + "%";
        if (pvid) { pvid.style.transform = all ? "" : "scale(" + c.z + ")"; pvid.style.transformOrigin = c.x + "% " + c.y + "%"; }
        if (thumbCk) { thumbCk.checked = !it.crop || it.crop.t !== false; thumbCk.disabled = !it.crop; }
      }
      function prevMeta() { pmeta.textContent = ""; pmeta.appendChild(el("strong", { text: it.title || "" })); pmeta.appendChild(el("span", { text: (it.types || it.cats || []).join(" · ") })); }
      pv.addEventListener("mouseenter", function () {
        var own = it.snipVideo || (it.snip && it.snip.v), src = own || (it.snip ? it.full : it.video); if (!src || pvid) return;
        pvid = el("video", { muted: true, playsinline: true, autoplay: true, loop: !!own || !it.snip }); pvid.muted = true;
        pvid.src = src + (!own && it.snip ? "#t=" + it.snip.s : "");
        if (!own && it.snip) { var PP = it.snip.parts && it.snip.parts.length > 1 ? it.snip.parts : [{ s: it.snip.s, d: it.snip.d }], pi0 = 0; // montage pas encore fabriqué : blocs bout à bout
          pvid.addEventListener("timeupdate", function () { if (pvid && pvid.currentTime >= PP[pi0].s + PP[pi0].d) { pi0 = (pi0 + 1) % PP.length; pvid.currentTime = PP[pi0].s; } }); }
        pin.appendChild(pvid); prevImg();
      });
      pv.addEventListener("mouseleave", function () { if (pvid) { pvid.remove(); pvid = null; } });
      // Recadrage repris des fiches (Gus 23/11, zoomCtl) : curseur 100–250 %, pendant le réglage l'extrait entier défile avec le
      // cadre rouge (partie gardée) à faire glisser ; « Aussi sur la vignette » montre tout de suite la vignette recadrée ou non.
      var zth = el("div", { class: "thumb" });
      var cropP = function () { return it.crop && (it.crop.x !== 50 || it.crop.y !== 50) ? it.crop.x + "% " + it.crop.y + "%" : undefined; };
      var zctl = zoomCtl(zth, function () { return it.snipVideo || (it.snip && it.snip.v && (!it.snip.vf || it.snip.vf === it.full) ? it.snip.v : it.snip && it.full ? { src: it.full, start: it.snip.s, end: it.snip.s + it.snip.d } : it.video || it.full); },
        function () { return it.crop ? it.crop.z : undefined; },
        function (z) { if (!z || z <= 1) delete it.crop; else it.crop = { z: Math.round(z * 100) / 100, x: it.crop ? it.crop.x : 50, y: it.crop ? it.crop.y : 50, t: it.crop ? it.crop.t !== false : false }; prevImg(); },
        cropP,
        function (p) { var m = /^([\d.]+)% ([\d.]+)%$/.exec(p || ""); if (!it.crop) return; it.crop.x = m ? +m[1] : 50; it.crop.y = m ? +m[2] : 50; prevImg(); },
        function () { return !!(it.crop && it.crop.t !== false); },
        function (t) { if (it.crop) it.crop.t = !!t; prevImg(); },
        function () { it.edited = true; chg(); });
      var zwrap = el("div", { class: "film bzoomw" }, [zth, zctl]);
      // Recadrage : zoom + glisser dans l'aperçu
      var zoom = el("input", { type: "range", min: "100", max: "200", step: "1", value: String(Math.round((it.crop ? it.crop.z : 1) * 100)) });
      var zl = el("span", { class: "hint", text: "" }), thumbCk = el("input", { type: "checkbox" });
      thumbCk.addEventListener("change", function () { if (!it.crop) return; it.crop.t = thumbCk.checked; prevImg(); chg(); });
      function zlab() { zl.textContent = zoom.value + " %" + (+zoom.value > 100 ? " · glissez l'image pour choisir le cadrage" : ""); }
      zoom.addEventListener("input", function () {
        var z = +zoom.value / 100; if (z <= 1) delete it.crop; else it.crop = { z: z, x: it.crop ? it.crop.x : 50, y: it.crop ? it.crop.y : 50, t: it.crop ? it.crop.t !== false : true };
        zlab(); prevImg(); chg();
      });
      var dragC = null;
      pv.addEventListener("pointerdown", function (e) { if (!it.crop) return; e.preventDefault(); pv.setPointerCapture(e.pointerId); dragC = { x: e.clientX, y: e.clientY, cx: it.crop.x, cy: it.crop.y, w: pv.clientWidth, h: pv.clientHeight }; });
      pv.addEventListener("pointermove", function (e) {
        if (!dragC) return; var k = 100 / (it.crop.z - 1);
        it.crop.x = Math.round(Math.max(0, Math.min(100, dragC.cx - (e.clientX - dragC.x) / dragC.w * k)));
        it.crop.y = Math.round(Math.max(0, Math.min(100, dragC.cy - (e.clientY - dragC.y) / dragC.h * k)));
        prevImg();
      });
      pv.addEventListener("pointerup", function () { if (dragC) { dragC = null; chg(); } });
      // Lecteur du film (Gus 22/11) : image par image avec les flèches (Maj = 1 s), pour la vignette et pour l'extrait.
      // Extrait = un début et une fin (0,5 à 10 s) : poignées sur une frise de tout le film (Gus 26/11) ; pendant qu'on
      // bouge une poignée la vidéo montre l'image sans bouger, dès qu'on lâche (ou 0,7 s après la dernière flèche) l'extrait joue en boucle.
      // Extrait en montage (Gus 26/11) : la SÉLECTION (poignées, I / O) est réglée à part ; « + Ajouter ce bloc » la range dans la liste du montage (it.snip.parts).
      // Seuls les blocs de la liste comptent à la validation. `bi` = -1 : poignées sur la sélection ; ≥ 0 : poignées sur ce bloc de la liste (modification).
      var MIND = .5, MAXD = 30, bi = -1;
      function parts() { return it.snip && it.snip.parts && it.snip.parts.length ? it.snip.parts : null; }
      function selB() {
        if (it._sel) return it._sel; var p = parts(), last = p && p[p.length - 1], s0 = last ? Math.min(last.s + last.d, Math.max(0, (typeof dur === "number" && dur ? dur : 1e9) - MIND)) : 0;
        return (it._sel = { s: s0, d: 5 });
      }
      function actB() { var p = parts(); if (!p) return it.snip; return bi >= 0 && p[bi] ? p[bi] : selB(); }
      function totalD() { var p = parts(); return p ? p.reduce(function (a, b) { return a + b.d; }, 0) : 0; }
      function maxFor() { var p = parts(); return p ? MAXD - totalD() + (bi >= 0 && p[bi] ? p[bi].d : 0) : MAXD; }
      var player = null, pout = el("p", { class: "hint" }), tools = el("div", { class: "tltools" }), tl = null;
      var src = it.full || it.video || (lib && lib.local) || ""; // lib.local : la vidéo de l'ordinateur, pendant l'envoi / l'encodage
      var full = it.full || (lib && lib.local) || "";
      function fmtF(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2).replace(".", ","); }
      if (src) {
        player = el("video", { playsinline: true, preload: "auto", muted: true }); player.muted = true; player.src = src;
        var FR = 1 / 25, seqOn = false, seqI = 0, dur = 0, act = "play", loopOn = false, kT = 0, WIN = 30, ptab = "thumb"; // onglet : vignette | extrait (Gus 22/11)
        var oReg = el("i", { class: "tlreg" }), oPh = el("i", { class: "tlph" }), over = el("div", { class: "tlo", title: "Tout le film : cliquez ou glissez" }, [oReg, oPh]);
        var dReg = el("i", { class: "tlreg" }), dPh = el("i", { class: "tlph" }), hIn = el("b", { class: "tlh in", title: "Début de l'extrait" }), hOut = el("b", { class: "tlh out", title: "Fin de l'extrait" });
        var blkLayer = el("div", { class: "tlblks" }), blkKey = "", endL = el("i", { class: "tlend l", title: "Début du film" }), endR = el("i", { class: "tlend r", title: "Fin du film" });
        var dLab = el("div", { class: "tllab" }), det = el("div", { class: "tld" }, [blkLayer, endL, endR, dReg, dPh, hIn, hOut]);
        var time = el("span", { class: "tlt" }), playB = el("button", { type: "button", class: "btn ghost", text: "▶", title: "Lecture / pause (espace)" });
        var nav = tlNav(function () { return zwin; }, function (w) { zwin = w; draw(); }, function () { return dur; });
        tl = el("div", { class: "tl" }, [over, det, nav.el, dLab]);
        var clamp = function (t) { return Math.max(0, Math.min(dur || 0, t)); };
        // Une seule frise pour l'extrait, sur tout le film (Gus 26/11 : la frise de détail de 30 s se recentrait et donnait un effet de
        // zoom / dézoom en bougeant une poignée). Précision : flèches image par image. La frise du haut ne sert plus qu'à la vignette.
        // Zoom de la frise (Gus 26/11) : Option (Alt sous Windows) + molette, centré sur la souris ; repères aux extrémités du film (traits vifs : le début et la fin sont visibles).
        var zwin = null;
        var win = function () { return zwin || [0, dur]; };
        var pc = function (t, a, b) { return Math.max(0, Math.min(100, (t - a) / (b - a || 1) * 100)) + "%"; };
        var draw = function () {
          if (!dur) return; var t = player.currentTime, w = win();
          oPh.style.left = pc(t, 0, dur); time.textContent = fmtF(t) + " / " + fmtF(dur) + (lvl ? "  " + (revOn ? "◀◀ ×" : "▶▶ ×") + TL_RATES[lvl - 1] : ""); nav.draw();
          det.hidden = dLab.hidden = !it.snip || ptab !== "snip"; oReg.hidden = true; over.hidden = !det.hidden;
          var bk = JSON.stringify([parts(), bi, dur]); // les blocs du montage, en repères sur la frise (l'orange = celui qu'on modifie)
          bk += JSON.stringify(zwin);
          if (bk !== blkKey) { blkKey = bk; blkLayer.textContent = ""; (parts() || []).forEach(function (b, n) { blkLayer.appendChild(el("i", { class: "tlblk" + (n === bi ? " on" : ""), title: "Bloc " + (n + 1), style: "left:" + pc(b.s, w[0], w[1]) + ";width:" + Math.max(.4, b.d / (w[1] - w[0]) * 100) + "%" })); }); }
          endL.hidden = w[0] > 0; endR.hidden = w[1] < dur - .001; // repères : début / fin du film visibles ou non
          if (it.snip) {
            var A = actB(), s = A.s, e = s + A.d;
            oReg.style.left = pc(s, 0, dur); oReg.style.width = Math.max(.4, A.d / dur * 100) + "%";
            dReg.style.left = pc(s, w[0], w[1]); dReg.style.width = (A.d / (w[1] - w[0]) * 100) + "%";
            hIn.style.left = pc(s, w[0], w[1]); hOut.style.left = pc(e, w[0], w[1]); dPh.style.left = pc(t, w[0], w[1]);
            dPh.hidden = t < w[0] || t > w[1];
            hIn.hidden = s < w[0] || s > w[1]; hOut.hidden = e < w[0] || e > w[1]; // poignées hors de la partie affichée : masquées
            hIn.classList.toggle("on", act === "in"); hOut.classList.toggle("on", act === "out");
            dLab.textContent = (parts() ? (bi >= 0 ? "Bloc " + (bi + 1) + " (en modification) : " : "Sélection : ") : "Extrait : ") + fmtF(s) + " → " + fmtF(e) + " (" + A.d.toFixed(1).replace(".", ",") + " s" + (parts() ? ", montage " + totalD().toFixed(1).replace(".", ",") + " s sur " + MAXD : "") + ")" + " · I / O : début / fin ici" + (zwin ? " · zoom × " + (dur / (zwin[1] - zwin[0])).toFixed(1).replace(".", ",") : "") + " · Option / Alt + molette = zoom" + (act === "play" ? "" : " · flèches : " + (act === "in" ? "début" : "fin") + " image par image") + " · espace : lire la boucle";
          }
        };
        // Lecture à l'envers (Gus 26/11) : Z ou J ; K = pause ; L = lecture normale ; espace = pause puis lecture dans le bon sens. Le navigateur ne sait pas lire à
        // l'envers : on recule l'image à chaque rafraîchissement (dans un montage / une sélection, on reboucle sur la fin du bloc réglé).
        var revOn = false, revRaf = 0, lvl = 0; // lvl : vitesse (0 normale, 1 à 3 = TL_RATES, Gus 26/11 : E avant, Z / J arrière, appuis répétés = plus vite)
        var setSpd = function (n) { lvl = n; player.defaultPlaybackRate = player.playbackRate = TL_RATES[n - 1] || 1; };
        var stopRev = function () { revOn = false; cancelAnimationFrame(revRaf); };
        var startRev = function (n) {
          if (!dur) return; stopRev(); loopOn = false; seqOn = false; player.pause(); revOn = true; setSpd(n || 1);
          var t0 = performance.now(), from = player.currentTime, A0 = it.snip && ptab === "snip" ? actB() : null, inB = !!A0 && from >= A0.s && from <= A0.s + A0.d + .05;
          (function step() {
            if (!revOn || !player.isConnected) return;
            var t = from - (performance.now() - t0) / 1000 * TL_RATES[lvl - 1];
            if (inB && t < A0.s) { from = A0.s + A0.d; t0 = performance.now(); t = from; }
            else if (t <= 0) { player.currentTime = 0; draw(); stopRev(); return; }
            if (!player.seeking) player.currentTime = t;
            draw(); revRaf = requestAnimationFrame(step);
          })();
        };
        var seek = function (t) { stopRev(); rangeOv = null; loopOn = false; seqOn = false; player.pause(); player.currentTime = clamp(t); draw(); };
        var rangeOv = null; // lecture d'un bloc de la liste (▶) sans le sélectionner
        var playSnip = function () { if (!it.snip) return; rangeOv = null; seqOn = false; loopOn = true; player.currentTime = actB().s; player.play().catch(function () {}); };
        // Onglet Extrait (Gus 27/11) : l'extrait actuel tourne en boucle (tous ses blocs) ; tout le réglage se fait dans la fenêtre de montage.
        var playExtract = function () {
          var ps = parts(); stopRev(); rangeOv = null; seqOn = false; loopOn = false;
          if (!it.snip || it.snipVideo) { player.pause(); return; } // extrait « fichier » : joué par le petit lecteur sous le texte
          if (ps) { seqOn = true; seqI = 0; player.currentTime = ps[0].s; } else { rangeOv = { s: it.snip.s, d: it.snip.d }; loopOn = true; player.currentTime = it.snip.s; }
          player.play().catch(function () {});
        };
        var playRange = function (b) { stopRev(); seqOn = false; rangeOv = { s: b.s, d: b.d }; loopOn = true; player.currentTime = b.s; player.play().catch(function () {}); };
        // Extrait : jusqu'à 30 s au total (Gus 26/11, avant 10 s), 0,5 s au moins par bloc. Les poignées se poussent : tirer le début vers la droite jusqu'à
        // la fin la pousse devant lui (on avance dans le film) ; tirer la fin vers la gauche pousse le début ; tirer dans l'autre sens s'arrête à la limite.
        // Montage : plusieurs blocs bout à bout (it.snip.parts) ; `bi` = bloc réglé par les poignées.
        var setSnip = function (s, e, which) {
          s = Math.round(s * 1000) / 1000; e = Math.round(e * 1000) / 1000; var mx = maxFor();
          if (which === "in") { s = Math.max(0, e - mx, s); if (s > e - MIND) { e = Math.min(dur, s + MIND); s = Math.min(s, e - MIND); } }
          else if (which === "out") { e = Math.min(dur, s + mx, e); if (e < s + MIND) { s = Math.max(0, e - MIND); e = Math.max(e, s + MIND); } }
          else { s = Math.max(0, Math.min(s, dur - MIND)); e = Math.min(dur, Math.max(s + MIND, Math.min(e, s + mx))); }
          s = Math.max(0, s); var d = Math.round((Math.min(dur, e) - s) * 1000) / 1000, p = parts();
          if (p && bi >= 0 && p[bi]) { p[bi] = { s: s, d: d }; it.snip = { s: p[0].s, d: p[0].d, parts: p }; } else if (p) it._sel = { s: s, d: d }; else it.snip = { s: s, d: d };
          it.edited = true;
        };
        var moveHandle = function (which, t) { snipDraft(); var A = actB(), s = A.s, e = s + A.d; if (which === "in") setSnip(t, e, "in"); else setSnip(s, t, "out"); A = actB(); seek(which === "in" ? A.s : A.s + A.d); };
        player.addEventListener("loadedmetadata", function () { dur = player.duration || 0; if (ptab === "snip") setTab("snip"); else if (it.thumbT !== undefined) player.currentTime = it.thumbT; draw(); });
        player.addEventListener("timeupdate", draw);
        player.addEventListener("seeked", draw);
        player.addEventListener("play", function () { stopRev(); playB.textContent = "❚❚"; });
        player.addEventListener("pause", function () { playB.textContent = "▶"; if (!revOn) setSpd(0); });
        (function tick() { // boucle de l'extrait + mesure de la cadence (image par image exact)
          if (dur && !player.isConnected) return; // fenêtre fermée
          if (seqOn && parts() && !player.paused) { // montage : les blocs bout à bout, en boucle
            var B = parts()[seqI] || parts()[0];
            if (player.currentTime >= B.s + B.d - .03 || player.currentTime < B.s - .3) { seqI = (seqI + 1) % parts().length; player.currentTime = parts()[seqI].s; }
          } else if (loopOn && it.snip && !player.paused) { var A0 = rangeOv || actB(); if (player.currentTime >= A0.s + A0.d || player.currentTime < A0.s - .1) player.currentTime = A0.s; }
          if (!player.paused) draw();
          requestAnimationFrame(tick);
        })();
        if (player.requestVideoFrameCallback) { var lastMT = null; var fcb = function (now, m) { if (lastMT !== null) { var d = m.mediaTime - lastMT; if (d > .015 && d < .05) FR = d; } lastMT = m.mediaTime; if (player.isConnected) player.requestVideoFrameCallback(fcb); }; player.requestVideoFrameCallback(fcb); }
        // Lecture : s'il y a un extrait, toujours en boucle entre le début et la fin (Gus 22/11) ; sinon le film.
        var toggle = function () {
          if (revOn) { stopRev(); return; } // espace pendant la lecture à l'envers : pause
          if (!player.paused) { player.pause(); return; }
          if (ptab === "snip") { playExtract(); }
          else { loopOn = false; player.play().catch(function () {}); }
        };
        playB.addEventListener("click", function () { toggle(); playB.blur(); });
        player.addEventListener("click", toggle);
        function drag(elm, onMove, onUp) {
          elm.addEventListener("pointerdown", function (e) {
            e.preventDefault(); e.stopPropagation(); elm.setPointerCapture(e.pointerId); onMove(e);
            function mv(ev) { onMove(ev); } function up() { elm.removeEventListener("pointermove", mv); elm.removeEventListener("pointerup", up); if (onUp) onUp(); }
            elm.addEventListener("pointermove", mv); elm.addEventListener("pointerup", up);
          });
        }
        var tAt = function (e, box, a, b) { var r = box.getBoundingClientRect(); return a + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (b - a); };
        drag(over, function (e) { act = "play"; seek(tAt(e, over, 0, dur)); });
        drag(det, function (e) { act = "play"; var w = win(); seek(tAt(e, det, w[0], w[1])); });
        det.addEventListener("wheel", function (e) {
          if ((e.metaKey || e.ctrlKey) && !e.altKey && dur) { e.preventDefault(); e.stopPropagation(); nav.pan(e); draw(); return; } // Cmd / Ctrl + molette : se déplacer dans la frise zoomée
          if (!e.altKey || !dur) return; e.preventDefault(); e.stopPropagation();
          var w = win(), W = w[1] - w[0], tm = tAt(e, det, w[0], w[1]), f = Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.004), nW = Math.max(Math.min(1, dur), Math.min(dur, W * f));
          if (nW >= dur - .001) zwin = null;
          else { var a = tm - (tm - w[0]) * (nW / W), b2 = a + nW; if (a < 0) { b2 -= a; a = 0; } if (b2 > dur) { a -= b2 - dur; b2 = dur; } zwin = [Math.max(0, a), Math.min(dur, b2)]; }
          draw();
        }, { passive: false });
        var hw = null;
        [[hIn, "in"], [hOut, "out"]].forEach(function (h) {
          drag(h[0], function (e) { act = h[1]; if (!hw) hw = win(); moveHandle(h[1], tAt(e, det, hw[0], hw[1])); }, function () { hw = null; snipMark(); prevSnip(); playSnip(); drawSnip(); });
        });
        // Raccourcis valables où que soit le clic dans la fenêtre (Gus 22/11) : écoutés avant tout le reste (capture), sauf dans un
        // champ de texte. Espace = lecture / pause ; flèches = image par image (la vidéo s'arrête, pas de reprise toute seule).
        var onKey = function (e) {
          if (!document.body.contains(box)) { document.removeEventListener("keydown", onKey, true); return; }
          if (e.target && e.target.matches && e.target.matches("textarea, input:not([type=range]):not([type=checkbox])") && box.contains(e.target)) return;
          if (e.target && e.target.blur && e.target.matches && e.target.matches("input, textarea") && !box.contains(e.target)) e.target.blur(); // le champ de recherche du dessous ne doit pas prendre les lettres
          if (e.key === " ") { e.preventDefault(); e.stopPropagation(); if (document.activeElement && document.activeElement.blur && box.contains(document.activeElement)) document.activeElement.blur(); if (!e.repeat) toggle(); return; }
          if (false && e.key === "Enter" && ptab === "snip" && !it.snipVideo && it.snip && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) addBlock(); return; } // Entrée : ajouter la sélection comme bloc (Gus 26/11)
          if (/^[ezjkl]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { // E : avant, Z / J : à l'envers (appuis répétés : plus vite, 3 au plus), K : pause, L : lecture
            e.preventDefault(); e.stopPropagation(); if (e.repeat) return; var kk = e.key.toLowerCase();
            if (kk === "k") { stopRev(); player.pause(); setSpd(0); }
            else if (kk === "l") { stopRev(); setSpd(0); if (player.paused) toggle(); }
            else if (kk === "e") { if (!player.paused && !revOn) setSpd(Math.min(3, lvl + 1)); else { stopRev(); setSpd(0); if (player.paused) toggle(); setSpd(1); } }
            else startRev(revOn ? Math.min(3, lvl + 1) : 1);
            return;
          }
          if ((e.key === "i" || e.key === "o" || e.key === "I" || e.key === "O") && !e.ctrlKey && !e.metaKey && !e.altKey && false) { // I / O : début / fin de l'extrait ici (Gus 26/11)
            e.preventDefault(); e.stopPropagation(); if (e.repeat) return; var tt = player.currentTime; snipDraft();
            if (!it.snip) it.snip = { s: tt, d: Math.round(Math.min(5, dur - tt) * 1000) / 1000 };
            var A2 = actB(), mx2 = maxFor(), e0 = A2.s + A2.d; act = /i/i.test(e.key) ? "in" : "out";
            // Le point posé tombe toujours sur l'image voulue (Gus 26/11) : si la durée dépasse la limite ou si l'autre point gêne, c'est l'AUTRE point qui s'adapte.
            if (act === "in") setSnip(tt, tt > e0 - MIND ? tt + MIND : Math.min(e0, tt + mx2), "new"); else setSnip(tt < A2.s + MIND ? Math.max(0, tt - MIND) : Math.max(A2.s, tt - mx2), tt, "new");
            snipMark(); prevSnip(); draw(); drawSnip(); return;
          }
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault(); e.stopPropagation(); var st2 = (e.shiftKey ? 1 : FR) * (e.key === "ArrowLeft" ? -1 : 1);
          if (act === "play" || !it.snip || ptab !== "snip") seek(player.currentTime + st2);
          else { moveHandle(act, (act === "in" ? actB().s : actB().s + actB().d) + st2); clearTimeout(kT); kT = setTimeout(function () { snipMark(); prevSnip(); drawSnip(); }, 300); }
        };
        document.addEventListener("keydown", onKey, true);
        tools.appendChild(el("div", { class: "tlrow" }, [
          el("button", { type: "button", class: "btn ghost", text: "◀ 1 image", title: "Image précédente (←, Maj + ← = 1 s)", on: { click: function (e) { e.currentTarget.blur(); onKey({ key: "ArrowLeft", target: player, preventDefault: function () {}, stopPropagation: function () {} }); } } }),
          playB,
          el("button", { type: "button", class: "btn ghost", text: "1 image ▶", title: "Image suivante (→, Maj + → = 1 s)", on: { click: function (e) { e.currentTarget.blur(); onKey({ key: "ArrowRight", target: player, preventDefault: function () {}, stopPropagation: function () {} }); } } }),
          time]));
        var grabB = el("button", { type: "button", class: "btn primary", text: "Valider cette image", title: "L'image affichée devient la vignette", on: { click: grab } });
        var snipB = full ? el("button", { type: "button", class: "btn ghost", text: "Début de l'extrait ici", title: "Place le début sur l'image affichée (même durée)", on: { click: function () {
            snipDraft(); var s = player.currentTime, d = it.snip ? actB().d : 5; act = "in"; if (!it.snip) it.snip = { s: s, d: Math.min(d, Math.max(MIND, dur - s)) }; setSnip(s, s + d, "new"); snipMark(); prevSnip(); draw(); playSnip(); drawSnip();
          } } }) : null;
        var tabB = {}, ptabs = el("div", { class: "btabs ptabs" }, [["thumb", "Vignette"], ["snip", "Extrait"]].map(function (t) { return tabB[t[0]] = el("button", { type: "button", text: t[1], on: { click: function () { setTab(t[0]); } } }); }));
        if (!full) tabB.snip.hidden = true;
        var setTab = function (t) {
          ptab = t; act = "play"; tabB.thumb.classList.toggle("on", t === "thumb"); tabB.snip.classList.toggle("on", t === "snip");
          if (thumbPane) thumbPane.hidden = t !== "thumb"; if (snipPane) snipPane.hidden = t !== "snip";
          if (t === "thumb") { loopOn = false; player.pause(); if (it._snipTmp) snipDiscard(); }
          else if (dur) playExtract();
          if (tl) tl.hidden = tools.hidden = t === "snip"; // frises et poignées de l'ancien éditeur : plus affichées (la fenêtre de montage les remplace)
          draw(); drawSnip();
        };
      }
      var exPrev = el("video", { class: "exprev", muted: true, loop: true, playsinline: true, controls: false }), snipLine = el("p", { class: "hint" }), snipCur = el("p", { class: "snipcur" }), blocksBox = el("div", { class: "bblks" });
      // Montage (Gus 26/11) : plusieurs blocs de l'extrait, bout à bout. « + Ajouter un bloc » en crée un à l'image affichée (réglable ensuite avec les
      // poignées ou I / O) ; le bloc réglé est surligné ; on les déplace en glissant ⠿, on en modifie un en cliquant dessus.
      var addB = null;
      function sync() { var p = parts(); if (p) it.snip = { s: p[0].s, d: p[0].d, parts: p }; it.edited = true; }
      function drawBlocks() {
        blocksBox.textContent = ""; var p = parts(); if (addB) { addB.textContent = bi >= 0 ? "+ Nouvelle sélection" : "+ Ajouter ce bloc"; addB.title = bi >= 0 ? "Quitte la modification du bloc : les poignées règlent une nouvelle sélection, après le dernier bloc (ou clique à nouveau le bloc)" : "Range la sélection (poignées, I / O) dans le montage ; tu règles ensuite la suivante"; } if (!p) return;
        blocksBox.appendChild(el("span", { class: "label", text: "Montage : " + p.length + " bloc" + (p.length > 1 ? "s" : "") + " · " + totalD().toFixed(1).replace(".", ",") + " s sur " + MAXD + " · glisse un bloc pour changer l'ordre · clique pour le modifier (un 2e clic le désélectionne)" }));
        // Frise : un bloc par morceau, sa largeur = sa durée (un seul bloc = toute la largeur ; un 2e deux fois plus long = deux tiers).
        var bar = el("div", { class: "bblkbar" }), tot = totalD() || 1;
        p.forEach(function (b, i) {
          var w = el("div", { class: "hb" + (i === bi ? " on" : ""), style: "flex:0 0 " + b.d / tot * 100 + "%", title: fmtF(b.s) + " → " + fmtF(b.s + b.d) + " · " + b.d.toFixed(1).replace(".", ",") + " s · clique pour le régler" }, [
            el("b", { text: String(i + 1) }), el("small", { text: b.d.toFixed(1).replace(".", ",") + " s" }),
            el("button", { type: "button", class: "hbp", text: "▶", title: "Voir ce bloc", on: { click: function (e) { e.stopPropagation(); playRange(b); } } }),
            el("button", { type: "button", class: "hbx", text: "×", title: "Retirer ce bloc", on: { click: function (e) {
              e.stopPropagation(); snipDraft(); var gone = p.splice(i, 1)[0];
              if (!p.length) { it.snip = { s: gone.s, d: gone.d }; delete it._sel; bi = -1; } else { sync(); bi = bi === i ? -1 : bi > i ? bi - 1 : bi; }
              it.edited = true; snipMark(); drawBlocks(); drawSnip(); draw();
            } } })]);
          w.style.setProperty("--hue", (i * 47 + 20) % 360);
          w.addEventListener("click", function () { // un clic sélectionne le bloc ; un autre clic dessus le désélectionne (retour à la sélection)
            if (bar._dragged) return;
            if (bi === i) { bi = -1; delete it._sel; act = "in"; drawBlocks(); draw(); if (player) seek(selB().s); return; }
            bi = i; act = "in"; drawBlocks(); draw(); if (player) seek(p[i].s);
          });
          bar.appendChild(w);
        });
        hReorder(bar, function (from, to) {
          snipDraft(); var cur = bi >= 0 ? p[bi] : null, x = p.splice(from, 1)[0]; p.splice(to, 0, x); bi = cur ? p.indexOf(cur) : -1; sync(); snipMark(); drawBlocks(); drawSnip(); draw();
        });
        blocksBox.appendChild(bar);
      }
      function addBlock() {
        if (!player || !dur) return; snipDraft(); var t = Math.max(0, Math.min(player.currentTime, dur - MIND));
        if (!it.snip) { it.snip = { s: t, d: Math.round(Math.min(5, dur - t) * 1000) / 1000 }; act = "in"; snipMark(); drawSnip(); draw(); return; }
        if (bi >= 0) { bi = -1; delete it._sel; act = "in"; drawBlocks(); draw(); seek(selB().s); return; } // fin de la modification d'un bloc : nouvelle sélection après le dernier bloc
        var p = parts(), sel = p ? selB() : it.snip, tot = p ? totalD() : 0;
        if (tot + sel.d > MAXD + .001) { pout.className = "hint berr"; pout.textContent = "Montage plein : " + MAXD + " s au plus en tout (réduis la sélection ou retire un bloc)."; return; }
        p = p || []; p.push({ s: sel.s, d: sel.d }); it.snip = { s: p[0].s, d: p[0].d, parts: p }; it.edited = true;
        var ns = Math.min(sel.s + sel.d, Math.max(0, dur - MIND)); it._sel = { s: ns, d: Math.round(Math.max(MIND, Math.min(5, dur - ns, MAXD - totalD())) * 1000) / 1000 }; // la sélection suivante part juste après
        act = "in"; pout.textContent = ""; snipMark(); drawBlocks(); drawSnip(); draw(); seek(it._sel.s);
      }
      function playSeq() { if (!player || !it.snip) return; if (!parts()) { playSnip(); return; } loopOn = false; seqOn = true; seqI = 0; player.currentTime = parts()[0].s; player.play().catch(function () {}); }
      function prevSnip() { if (pvid) { pvid.remove(); pvid = null; } }
      function drawSnip() {
        var ps0 = parts(), fileEx = it.snipVideo || (!it.snip && it.video) || (it.snip && it.snip.v && !it.snip.vf && false); // extrait « fichier » : importé, ou d'origine (Slate)
        exPrev.hidden = !fileEx; if (fileEx) { if (exPrev.dataset.u !== fileEx) { exPrev.dataset.u = fileEx; exPrev.src = fileEx; } if (ptab === "snip") { var pr0 = exPrev.play(); if (pr0 && pr0.catch) pr0.catch(function () {}); } } else { exPrev.pause(); }
        snipCur.textContent = it.snipVideo ? "Extrait actuel : importé de l'ordinateur (mp4)" : !it.snip && it.video ? "Extrait actuel : celui d'origine (fichier vidéo de Slate). Ouvre le montage pour en faire un nouveau." : it.snip ? "Extrait actuel : " + (ps0 ? ps0.length + " blocs, " + totalD().toFixed(1).replace(".", ",") : it.snip.d.toFixed(1).replace(".", ",")) + " s (en boucle ci-dessus)" : "Pas encore d'extrait";
        drawBlocks(); snipLine.textContent = ""; if (typeof valB !== "undefined" && valB) valB.disabled = !it._snipTmp && !snipStale();
        if (it.snipVideo) snipLine.appendChild(el("span", {}, ["Extrait importé de l'ordinateur · ", el("button", { type: "button", class: "blink", text: "le retirer", on: { click: function () { delete it.snipVideo; chg(); prevSnip(); drawSnip(); } } })]));
        else if (it._snipTmp) snipLine.textContent = "Extrait pas encore enregistré : « Valider l'extrait » pour le garder (sinon il est oublié en fermant).";
        else if (it.snip) snipLine.appendChild(el("span", {}, [el("button", { type: "button", class: "blink", text: "Revenir à l'extrait d'origine", on: { click: function () { snipDiscard(); pushHist("snip", it.snip); delete it.snip; lastSnip = null; act = "play"; chg(); drawSnip(); drawHist(); if (tl) { loopOn = false; draw(); } } } })]));
        else snipLine.textContent = it.video ? "Extrait d'origine (Slate)." : "Pas d'extrait.";
      }
      function fmtT(t) { return fmtF(t); }
      // Historique des vignettes et des extraits (Gus 22/11) : les 8 derniers, pour reprendre un ancien.
      function pushHist(kind, v) {
        if (!v) return; it.hist = it.hist || {}; var l = it.hist[kind] = (it.hist[kind] || []).filter(function (x) { return JSON.stringify(x) !== JSON.stringify(v); });
        l.unshift(v); if (l.length > 8) l.length = 8;
      }
      function setImg(u) { if (it.img && it.img !== u) pushHist("img", it.img); it.img = u; it.edited = true; prevImg(); chg(); drawThumbs(); drawHist(); }
      var lastSnip = it.snip ? JSON.stringify(it.snip) : null;
      // Brouillon de l'extrait : réglé à la souris / aux flèches sans rien enregistrer ; « Valider l'extrait » l'enregistre.
      // Annuler / Rétablir du montage (Gus 26/11) : Ctrl / Cmd + Z défait d'abord les gestes de l'extrait en cours de réglage (blocs, poignées, I / O),
      // sans rouvrir la fenêtre ; quand il n'y a plus rien, il défait le reste de la fenêtre.
      var su = { l: [], i: -1 };
      function snipState() { return JSON.stringify([it.snip || null, it._sel || null, bi]); }
      function snipMark() { var x = snipState(); if (x === su.l[su.i]) return; su.l = su.l.slice(0, su.i + 1); su.l.push(x); su.i = su.l.length - 1; if (su.l.length > 80) { su.l.shift(); su.i--; } }
      function snipUndo(d) {
        if (!it._snipTmp && !su.l.length) return false; var j = su.i + d; if (j < 0 || j >= su.l.length) return false;
        su.i = j; var o = JSON.parse(su.l[j]); if (o[0]) it.snip = o[0]; else delete it.snip; if (o[1]) it._sel = o[1]; else delete it._sel; bi = o[2];
        it.edited = true; prevSnip(); drawBlocks(); drawSnip(); if (tl) draw(); return true;
      }
      function snipDraft() { if (it._snipTmp) return; it._snipSaved = it.snip ? JSON.parse(JSON.stringify(it.snip)) : undefined; it._snipTmp = true; snipMark(); }
      function snipDiscard() { if (!it._snipTmp) return; bi = -1; delete it._sel; if (it._snipSaved) it.snip = it._snipSaved; else delete it.snip; delete it._snipTmp; delete it._snipSaved; if (typeof draw === "function" && tl) draw(); }
      function snipCommit() { // extrait validé : l'ancien va dans l'historique, le nouveau est enregistré
        var p0 = parts(); if (p0 && p0.length === 1) it.snip = { s: p0[0].s, d: p0[0].d }; // un seul bloc = extrait simple
        delete it._sel; bi = -1; su = { l: [], i: -1 }; delete it._snipTmp; delete it._snipSaved; var x = it.snip ? JSON.stringify(it.snip) : null;
        if (lastSnip && lastSnip !== x) pushHist("snip", JSON.parse(lastSnip));
        lastSnip = x; it.edited = true; chg(); drawSnip(); drawHist(); snipLight();
      }
      // Extrait léger (Gus 26/11) : le robot d'encodage découpe le passage validé en petite vidéo 720p sans son (~1–2 Mo), rangée
      // chez Amazon → snip.v, que jouent les bandes (au lieu du film complet lu à partir du début de l'extrait).
      // Extrait léger à refaire : jamais fait, ou fait dans une autre vidéo (vidéo remplacée, Gus 26/11).
      function snipStale() { return !!(it.snip && it.full && !it.snipVideo && (!it.snip.v || (it.snip.vf && it.snip.vf !== it.full))); }
      function snipLight() {
        var sn = it.snip, from = it.full;
        if (!canWeb || !sn || it.snipVideo || !from || !snipStale()) return;
        var id = encId(), s0 = sn.s, d0 = sn.d, pj = JSON.stringify(sn.parts || null);
        pout.className = "hint bwait"; pout.textContent = "Demande au robot…";
        encAsk("rapide", [{ id: id, kind: "snip", src: from, s: s0, d: d0, parts: sn.parts }]).then(function (path) {
          var q = { path: path, id: id, s: s0, d: d0, pj: pj, from: from }; pendSet("snip", q); snipWait(q);
        }).catch(function (e) { if (pout.isConnected) { pout.className = "hint berr"; pout.textContent = "Extrait léger pas fait : " + e.message; } });
      }
      function snipWait(q) {
        pout.className = "hint bwait"; pout.textContent = "⟳ Extrait en cours d'encodage (≈ 1 min) : tu peux fermer cette fenêtre ou changer de page, il s'appliquera tout seul.";
        pendWatch("snip", q, function (a) {
          if (it.snip && it.snip.s === q.s && it.snip.d === q.d && JSON.stringify(it.snip.parts || null) === q.pj && it.full === q.from) { it.snip.v = a.video; it.snip.vf = q.from; it.edited = true; chg(); if (pout.isConnected) { pout.className = "hint bok"; pout.textContent = "✓ Extrait léger prêt (720p) : c'est lui que jouent les bandes."; } }
        }, function (e) { if (pout.isConnected) { pout.className = "hint berr"; pout.textContent = "Extrait léger pas fait : " + e.message; } });
      }
      var histImgL = el("span", { class: "label", text: "Anciennes vignettes" }), histImg = el("div", { class: "bthumbs" });
      var histSnipL = el("span", { class: "label", text: "Anciens extraits" }), histSnip = el("div", { class: "bhsnip" });
      function drawHist() {
        var h = it.hist || {};
        histImg.textContent = ""; (h.img || []).forEach(function (u) { histImg.appendChild(el("button", { type: "button", style: 'background-image:url("' + u + '")', title: "Reprendre cette ancienne vignette", on: { click: function () { setImg(u); } } })); });
        histImg.hidden = histImgL.hidden = !(h.img || []).length;
        histSnip.textContent = ""; (h.snip || []).forEach(function (x) { histSnip.appendChild(el("button", { type: "button", class: "bcc", text: fmtF(x.s) + " → " + fmtF(x.s + x.d), title: "Reprendre cet ancien extrait", on: { click: function () {
          snipDraft(); it.snip = { s: x.s, d: x.d }; if (x.parts) it.snip.parts = JSON.parse(JSON.stringify(x.parts)); delete it._sel; bi = -1; snipMark(); snipCommit(); prevSnip(); if (typeof playExtract === "function") playExtract(); /* reprendre un ancien extrait = le valider (et le réencoder) tout de suite */
        } } })); });
        histSnip.hidden = histSnipL.hidden = !(h.snip || []).length;
      }
      // Image de l'ordinateur pour la vignette ; mp4 de l'ordinateur pour l'extrait (20 Mo au plus) → data/bibli/img/b/, data/bibli/vid/.
      var imgUp = el("input", { type: "file", accept: "image/*", hidden: true }), vidUp = el("input", { type: "file", accept: "video/mp4", hidden: true });
      imgUp.addEventListener("change", function () { doImg(imgUp.files[0]); });
      vidUp.addEventListener("change", function () { doVid(vidUp.files[0]); });
      // Boutons d'import (Gus 22/11) : un clic ouvre le choix du fichier ; on peut aussi y lâcher un fichier glissé depuis l'ordinateur.
      function upBtn(label, input, kind, onFile, multi) { // multi : tous les fichiers lâchés (sinon le 1er)
        var b = el("button", { type: "button", class: "btn bupbtn", title: "Cliquer ou glisser un fichier ici" }, [label]);
        b.onclick = function () { input.click(); };
        ["dragenter", "dragover"].forEach(function (ev) { b.addEventListener(ev, function (e) { if (!e.dataTransfer || [].indexOf.call(e.dataTransfer.types, "Files") < 0) return; e.preventDefault(); b.classList.add("over"); }); });
        b.addEventListener("dragleave", function () { b.classList.remove("over"); });
        b.addEventListener("drop", function (e) { e.preventDefault(); b.classList.remove("over"); var fl = [].filter.call(e.dataTransfer.files, function (x) { return x.type.indexOf(kind) === 0; }), f = fl[0]; if (f) onFile(multi ? fl : f); else pout.textContent = kind === "image" ? "Ce n'est pas une image." : "Ce n'est pas une vidéo."; });
        return b;
      }
      function doImg(f) {
        if (!f) return; pout.textContent = "Préparation de l'image…";
        compress(f).then(function (c) { setImg(imgPut("vignette.webp", c.base64, c.preview)); pout.textContent = "Vignette importée."; imgUp.value = ""; }, function (e) { pout.textContent = e.message; });
      }
      function doVid(f) {
        if (!f) return;
        if (f.size > 20e6) { pout.textContent = "Vidéo trop lourde (20 Mo au plus pour un extrait)."; vidUp.value = ""; return; }
        pout.textContent = "Préparation de la vidéo…"; var fr = new FileReader();
        fr.onload = function () {
          var path = "data/bibli/vid/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ".mp4";
          files.push({ path: path, base64: fr.result.split(",")[1] }); it.snipVideo = rawURL(path);
          snipDiscard(); it.edited = true; chg(); prevSnip(); drawSnip();
          pout.textContent = "Extrait importé (" + Math.round(f.size / 1e5) / 10 + " Mo) : il remplace l'extrait pris dans le film."; vidUp.value = "";
        };
        fr.readAsDataURL(f);
      }
      // Capture d'une image du film. Vidéo de l'ordinateur (blob, pendant l'envoi) : dessinée directement dans le navigateur.
      // Vidéo en ligne (notre CloudFront ou Slate) : le navigateur n'a pas le droit de copier l'image (pas d'en-tête CORS) et la
      // fonction /api/media du site (Cloudflare) reçoit un 403 de notre CloudFront ; c'est donc le robot d'encodage qui sort l'image du film (demande
      // « thumb », ≈ 1 min) → vignettes WebP 800 / 1600 chez Amazon (Gus 26/11 : « la vignette depuis la vidéo ne marche pas »).
      function grabDone(u, t) { grabBusy(false); it.thumbT = Math.round(t * 1000) / 1000; setImg(u); pout.textContent = "✓ Vignette remplacée par l'image à " + fmtT(t) + "."; pout.className = "hint bok"; }
      function grabBusy(on) { if (typeof grabB !== "undefined" && grabB) { grabB.disabled = on; grabB.classList.toggle("busy", on); } }
      // Demandes au robot (vignette, extrait léger) : gardées dans le film (`pend`, edits.json) pour survivre à la fermeture de la fenêtre et au
      // rechargement de la page ; reprises par encCheckEdits (liste du video club) ou par la fenêtre rouverte (pendWatch). Seulement pour
      // les films du video club (`lib`) ; dans une bande, la demande n'est suivie que fenêtre ouverte.
      function pendSet(w, q) { if (!lib) return; it.pend = Object.assign({}, it.pend || {}); it.pend[w] = q; it.edited = true; chg(); }
      function pendDone(w, id) { if (!lib) return true; if (!it.pend || !it.pend[w] || it.pend[w].id !== id) return false; it.pend = Object.assign({}, it.pend); delete it.pend[w]; if (!Object.keys(it.pend).length) delete it.pend; chg(); return true; }
      function pendWatch(w, q, ok, ko) {
        return encWait(q.path, 3000, 900000).then(function (jobs) {
          var j = jobs.filter(function (y) { return y.id === q.id; })[0] || {};
          if (lib && !(it.pend && it.pend[w] && it.pend[w].id === q.id)) return; // déjà appliquée ailleurs
          if (!j.answer) { pendDone(w, q.id); ko(new Error(j.error || "pas de réponse")); return; }
          pendDone(w, q.id); ok(j.answer);
        }, function (e) { ko(e); });
      }
      function grabRobot(t) {
        if (!canWeb) { pout.textContent = "Lecture seule : cette clé ne peut pas demander de capture."; return; }
        if (!/\.(mp4|mov|m4v)$/i.test(src)) { pout.textContent = "Capture impossible : adresse de vidéo non reconnue."; return; }
        t = Math.round(t * 1000) / 1000; grabBusy(true); pout.className = "hint bwait"; pout.textContent = "Demande au robot…";
        var id = encId();
        encAsk("rapide", [{ id: id, kind: "thumb", src: src, t: t }]).then(function (path) {
          var q = { path: path, id: id, t: t }; pendSet("thumb", q); grabWait(q);
        }).catch(function (e) { grabBusy(false); pout.className = "hint berr"; pout.textContent = "Capture pas faite : " + e.message; });
      }
      function grabWait(q) {
        grabBusy(true); pout.className = "hint bwait"; pout.textContent = "⟳ Vignette en cours d'encodage (≈ 1 min) à " + fmtT(q.t) + " : tu peux fermer cette fenêtre ou changer de page, elle s'appliquera toute seule.";
        pendWatch("thumb", q, function (a) { grabBusy(false); grabDone(a.img, q.t); }, function (e) { grabBusy(false); pout.className = "hint berr"; pout.textContent = "Capture pas faite : " + e.message; });
      }
      // Capture instantanée (Gus 26/11 : « sur Slate c'était quasiment instantané ») : on essaie dans l'ordre
      //  1. vidéo de l'ordinateur (blob) : directement ; 2. films copiés de Slate : par /api/media du site (autorisation CORS) ;
      //  3. directement sur notre CloudFront (marche si CloudFront envoie l'autorisation CORS) ; 4. le robot (≈ 1 min, sans condition).
      function capture(url, cors, fail) {
        var v = el("video", { muted: true, playsinline: true, preload: "auto" }); v.muted = true; if (cors) v.crossOrigin = "anonymous";
        var done = false, t0 = setTimeout(function () { if (!done) { done = true; v.removeAttribute("src"); v.load(); fail("trop long"); } }, 12000);
        function bad(m) { if (done) return; done = true; clearTimeout(t0); fail(m); }
        v.addEventListener("loadedmetadata", function () { v.currentTime = grabT; });
        v.addEventListener("seeked", function () {
          if (done) return; done = true; clearTimeout(t0);
          try {
            var w = Math.min(1600, v.videoWidth), c = document.createElement("canvas"); c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth);
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            c.toBlob(function (bl) {
              if (!bl) { fail("image vide"); return; }
              var fr = new FileReader();
              fr.onload = function () { grabDone(imgPut("vignette.webp", fr.result.split(",")[1], URL.createObjectURL(bl)), grabT); };
              fr.readAsDataURL(bl);
            }, "image/webp", .85);
          } catch (e) { fail(e.message); }
        });
        v.addEventListener("error", function () { bad("lecture impossible"); });
        v.src = url;
      }
      var grabT = 0;
      function grab() {
        if (!player) return; grabT = player.currentTime; var t = grabT;
        pout.className = "hint bwait"; pout.textContent = "Capture de l'image…"; grabBusy(true);
        function off(m) { grabBusy(false); pout.className = "hint berr"; pout.textContent = "Capture impossible : " + m; }
        if (/^blob:/.test(src)) { capture(src, false, off); return; }
        function robot() { grabBusy(false); grabRobot(t); }
        function direct() { capture(src, true, robot); }
        if (/\/kinou\/production\//.test(src)) capture(SITE + "/api/media?u=" + encodeURIComponent(src), true, direct); else direct();
      }
      // Vignettes possibles : vignette d'origine + stills du film
      var thumbs = el("div", { class: "bthumbs" });
      function drawThumbs() {
        thumbs.textContent = "";
        var exS = []; (it.extras || []).forEach(function (x) { exS = exS.concat(x.stills || []); }); // stills sous le film aussi
        var l = [orig && orig.img].concat(it.images || (orig && orig.images) || [], exS).filter(Boolean).filter(function (u, k, a) { return a.indexOf(u) === k; }).slice(0, 18);
        if (it.img && l.indexOf(it.img) < 0) l.unshift(it.img);
        l.forEach(function (u) { thumbs.appendChild(el("button", { type: "button", class: u === it.img ? "on" : "", style: 'background-image:url("' + u + '")', title: "Prendre comme vignette", on: { click: function () { setImg(u); } } })); });
      }
      drawThumbs(); prevImg(); prevMeta(); zlab(); drawSnip(); drawHist();
      if (lib && it.pend) { if (it.pend.thumb) grabWait(it.pend.thumb); else if (it.pend.snip) snipWait(it.pend.snip); } // fenêtre rouverte pendant une demande au robot
      // Sous le film (comme sur les pages des chefs op) : galeries de stills et autres vidéos, liens Slate « work » ou shots.re.
      var exBox = el("div", { class: "bexs" }), exIn = el("input", { type: "text", placeholder: "Lien Slate (stills, vidéo, shots.re) ou lien d'une de nos bandes / d'un film partagé" }), exOut = el("p", { class: "hint" });
      // Tout ce qui est « sous le film » dans un seul ordre : les images du projet (si le projet n'a pas de film) puis les lignes `extras` ; les
      // images se placent entre les lignes avec `ipos`. Chaque élément a une poignée ⠿ (déplacer) et un œil (masquer ici seulement).
      var HC = lib ? CTX : "band", HCN = lib ? CTXN : "cette bande";
      function hasImgs() { return !it.full && !it.video && it.images && it.images.length; }
      function combined() {
        var l = (it.extras || []).map(function (x, j) { return { k: "x", j: j }; });
        if (hasImgs()) l.splice(Math.max(0, Math.min(it.ipos || 0, l.length)), 0, { k: "img" });
        return l;
      }
      function eyeBtn(hid, toggle) {
        return el("button", { type: "button", class: "bx bhide" + (hid ? " on" : ""), text: hid ? "⊘" : "◉", title: hid ? "Masqué ici (" + HCN + ") : cliquer pour le montrer de nouveau. Il reste visible ailleurs." : "Masquer ici (" + HCN + ") seulement : il reste visible ailleurs", on: { click: toggle } });
      }
      function drawEx() {
        exBox.textContent = "";
        var all = combined();
        all.forEach(function (c, n) {
          var w = el("div", { class: "bxw", "data-xi": String(n) });
          if (c.k === "img") { // images du projet
            var hi = (it.ihide || []).indexOf(HC) > -1;
            w.appendChild(el("div", { class: "bit bex" + (hi ? " xhid" : "") }, [xGrip(w, n), el("div", { class: "bithumb" }, [el("i", { style: 'background-image:url("' + imgShow(it.img || it.images[0]) + '")' })]),
              el("span", { class: "bitt" }, ["Images du projet", el("small", { text: it.images.length + " images" + (hi ? " · masquées ici" : "") })]),
              cropBtn(it.images, "Recadrer les images du projet", function () { return it.scrop; }, function (cc) { if (cc) it.scrop = cc; else delete it.scrop; }),
              eyeBtn(hi, function () { var l = (it.ihide || []).slice(), i = l.indexOf(HC); if (i > -1) l.splice(i, 1); else l.push(HC); if (l.length) it.ihide = l; else delete it.ihide; it.edited = true; chg(); drawEx(); })]));
            w.appendChild(stillGrid(it, "images", it.scrop));
            exBox.appendChild(w); return;
          }
          var x = it.extras[c.j], j = c.j, th = el("div", { class: "bithumb" }), u = x.img || (x.stills && x.stills[0]); if (u) th.appendChild(el("i", { style: 'background-image:url("' + imgShow(u) + '")' }));
          var hid = xHidden(x, HC);
          w.appendChild(el("div", { class: "bit bex" + (hid || x.self ? " xhid" : "") }, [xGrip(w, n), th, el("span", { class: "bitt" }, [x.title || x.link || "", el("small", { text: (x.stills ? x.stills.length + " images" : "vidéo") + (x.self ? " · cette vidéo (pas montrée sous elle)" : "") + (hid ? " · masquée ici" : "") })]),
            x.stills && x.stills.length ? cropBtn(x.stills, "Recadrer : " + (x.title || "stills"), function () { return x.crop; }, function (cc) { if (cc) x.crop = cc; else delete x.crop; }) : null,
            eyeBtn(hid, function () { xToggleHide(x, HC); it.edited = true; chg(); drawEx(); }),
            el("button", { type: "button", class: "bx", text: "×", title: lib ? "Supprimer partout (pour la cacher seulement ici : ◉)" : "Retirer de cette bande", on: { click: function () { it.extras.splice(j, 1); if (!it.extras.length) delete it.extras; chg(); drawEx(); } } })]));
          if (x.stills && x.stills.length) w.appendChild(stillGrid(x, "stills", x.crop));
          exBox.appendChild(w);
        });
      }
      // Lignes déplaçables (poignée ⠿, y compris les images du projet) et films déposés depuis la recherche.
      function reorder(newAll) { // newAll : liste combinée dans le nouvel ordre
        var ex = it.extras || [], out = [], pos = 0;
        newAll.forEach(function (c, n) { if (c.k === "img") pos = n; else out.push(ex[c.j]); });
        it.extras = out; if (hasImgs()) { if (pos) it.ipos = pos; else delete it.ipos; } if (!out.length) delete it.extras;
        it.edited = true; chg(); drawEx();
      }
      xDropZone(exBox, function (from, to) { var l = combined(); l.splice(to, 0, l.splice(from, 1)[0]); reorder(l); }, function (key, at) {
        var f = filmByKey(key); if (!f) return; var l = combined(), ex = it.extras = it.extras || []; ex.push(extraFromFilm(f));
        l.splice(at, 0, { k: "x", j: ex.length - 1 }); reorder(l);
      });
      // Stills de l'ordinateur (Gus 26/11) : cliquer ou glisser des images sur le bouton → réduites (WebP) et envoyées chez Amazon (imgPut) ;
      // rangées dans un groupe « Stills » sous le film ; l'ordre de toutes les images se change en les glissant.
      var stUp = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
      stUp.addEventListener("change", function () { addStills([].slice.call(stUp.files)); stUp.value = ""; });
      function addStills(l) {
        l = l.filter(function (f) { return /^image\//.test(f.type); }).sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
        if (!l.length) return; exOut.textContent = "Préparation de " + l.length + " image" + (l.length > 1 ? "s" : "") + "…";
        var g = (it.extras || []).filter(function (x) { return x.up && x.stills; })[0];
        if (!g) { g = { title: "Stills", stills: [], up: true }; (it.extras = it.extras || []).push(g); }
        var dir = imgDir(), n = 0;
        l.reduce(function (p, f) { return p.then(function () { return compress(f).then(function (c) {
          g.stills.push(imgPut(String(++n).padStart(3, "0") + ".webp", c.base64, c.preview, dir));
        }); }); }, Promise.resolve()).then(function () { exOut.textContent = n + " image" + (n > 1 ? "s" : "") + " ajoutée" + (n > 1 ? "s" : "") + "."; it.edited = true; chg(); drawEx(); },
          function (e) { exOut.textContent = e.message; drawEx(); });
      }
      function stillGrid(x, key, crop) { // images d'un groupe (x[key], « stills » par défaut) : glisser pour changer l'ordre, × pour retirer ; crop : recadrage montré
        key = key || "stills"; var g = el("div", { class: "bstgrid" }), from = -1, arr = x[key];
        arr.forEach(function (u, k) {
          var c = el("div", { class: "bstl", draggable: "true", title: "Glisser pour changer l'ordre" }, [el("i", { class: "bsi", style: 'background-image:url("' + imgShow(u) + '")' }),
            el("button", { type: "button", class: "bx", text: "×", title: "Retirer cette image", on: { click: function () { arr.splice(k, 1); it.edited = true; chg(); drawEx(); drawThumbs(); } } })]);
          var nc = scNorm(crop); if (scFor(nc, u)) scCell(c, nc, u);
          c.addEventListener("dragstart", function (e) { from = k; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "st"); c.classList.add("drag"); });
          c.addEventListener("dragend", function () { c.classList.remove("drag"); });
          c.addEventListener("dragover", function (e) { if (from < 0) return; e.preventDefault(); c.classList.add("over"); });
          c.addEventListener("dragleave", function () { c.classList.remove("over"); });
          c.addEventListener("drop", function (e) { if (from < 0) return; e.preventDefault(); var a = arr.splice(from, 1)[0]; arr.splice(k, 0, a); from = -1; it.edited = true; chg(); drawEx(); drawThumbs(); });
          g.appendChild(c);
        });
        return g;
      }
      function cropBtn(urls, title, get, set) { // petit carré « recadrer » : ouvre la fenêtre de recadrage de ces images
        var cur = scNorm(get());
        return el("button", { type: "button", class: "bx bcropb" + (cur ? " on" : ""), text: "▣", title: scLabel(cur) + " : recadrer toutes les images", on: { click: function () {
          cropWin(title, urls, get(), function (c) { set(c); it.edited = true; chg(); drawEx(); });
        } } });
      }
      var exGo = el("button", { type: "button", class: "btn bplus", title: "Ajouter ce lien sous le film", text: "+", on: { click: function () {
        var v = exIn.value.trim(); if (!v) return; exGo.disabled = true; exOut.textContent = (ourCode(v) ? "Lecture du lien" : "Lecture sur Slate") + slateWait("…");
        extrasFromLink(v).then(function (ns) { (it.extras = it.extras || []); ns.forEach(function (n) { it.extras.push(n); }); it.edited = true; exIn.value = ""; exOut.textContent = ns.length > 1 ? ns.length + " films ajoutés." : ""; exGo.disabled = false; chg(); drawEx(); },
          function (e) { exGo.disabled = false; exOut.textContent = "Lecture impossible : " + (e.message || "Slate ne répond pas"); });
      } } });
      var exFind = el("button", { type: "button", class: "btn ghost bplus", text: "🔍", title: "Chercher un film dans le video club et l'ajouter sous ce film", on: { click: function () {
        bibPicker("Ajouter sous le film", function (f) { it.extras = it.extras || []; it.extras.push(extraFromFilm(f)); it.edited = true; chg(); drawEx(); });
      } } });
      exIn.addEventListener("keydown", function (e) { if (e.key === "Enter") exGo.click(); });
      drawEx();
      var aw = el("textarea", { rows: 3, placeholder: "Une ligne par prix ou sélection (ex. Best Cinematography, Camerimage 2026)" }); aw.value = it.awards || "";
      aw.addEventListener("input", function () { it.awards = aw.value.trim(); if (!it.awards) delete it.awards; it.edited = true; chg(); });
      // Infos du fichier (Gus 26/11) : date (celle de Slate pour les films de Slate, sinon l'import), poids de l'original et de la version web.
      // Client (Gus 26/11) : proposé depuis Slate ; la case l'affiche avant le titre (« McDo | Big Mac ») sur le site, dans les bandes et les liens partagés.
      function clientFld() {
        var inp = el("input", { type: "text", value: it.client || "", placeholder: "Ex. McDo" }), ck = el("input", { type: "checkbox" }); ck.checked = it.cshow !== false;
        function upd() { var v = inp.value.trim(); if (v) it.client = v; else delete it.client; it.edited = true; chg(); prevMeta(); }
        inp.addEventListener("input", upd);
        ck.addEventListener("change", function () { if (ck.checked) delete it.cshow; else it.cshow = false; it.edited = true; chg(); });
        return [el("span", { class: "label", text: "Client" }), inp, el("label", { class: "bck" }, [ck, " Afficher avant le titre sur le site et dans les bandes (« Client | Titre »)"])];
      }
      function fsz(n) { return n >= 1e9 ? (n / 1e9).toFixed(1).replace(".", ",") + " Go" : Math.max(1, Math.round(n / 1e6)) + " Mo"; }
      function infoFile(m) {
        m = m || {}; var l = [];
        if (m.slate && (m.date || m.at)) l.push("Date sur Slate : " + fdate(m.date || String(m.at).slice(0, 10))); else if (m.at) l.push("Importé le " + fdate(String(m.at).slice(0, 10)) + (m.by ? " par " + m.by : ""));
        if (m.size) l.push("Fichier d'origine : " + fsz(m.size) + (m.ws ? " → version web " + fsz(m.ws) + " (" + Math.round((1 - m.ws / m.size) * 100) + " % de moins)" : (m.os ? "" : " → version web en préparation")));
        else if (m.ws) l.push("Version web : " + fsz(m.ws));
        if (m.w) l.push(m.w + "×" + m.h); if (m.dur) l.push(Math.floor(m.dur / 60) + " min " + String(Math.round(m.dur % 60)).padStart(2, "0") + " s");
        var ip = el("p", { class: "hint binfo" }); if (m.grpN > 1) { ip.appendChild(linkIcon(m.grpN)); ip.appendChild(document.createTextNode(" Liée à " + (m.grpN - 1) + " autre" + (m.grpN > 2 ? "s" : "") + " vidéo" + (m.grpN > 2 ? "s" : "") + " (importées ensemble) · ")); }
        ip.appendChild(document.createTextNode(l.join(" · ")));
        if (m.grpN > 1 && lib && lib.montage) ip.appendChild(el("button", { type: "button", class: "btn ghost bmontb", text: "▦ Créer un bout à bout", title: "Assembler les vidéos liées (fenêtre de montage, export 1080p avec le son)", on: { click: lib.montage } }));
        return ip;
      }
      // Bouton bien visible en haut de la fenêtre pour les vidéos liées (Gus 26/11 : on ne le voyait pas dans les infos).
      if (lib && lib.meta && lib.meta.grpN > 1 && lib.montage) {
        var lbar = el("div", { class: "bmontbar" }, [linkIcon(lib.meta.grpN), el("span", { text: "Liée à " + (lib.meta.grpN - 1) + " autre" + (lib.meta.grpN > 2 ? "s" : "") + " vidéo" + (lib.meta.grpN > 2 ? "s" : "") }),
          el("button", { type: "button", class: "btn primary", text: "▦ Créer un bout à bout", title: "Assembler les vidéos liées : fenêtre de montage, export 1080p avec le son", on: { click: lib.montage } })]);
        if (lib.unlink) {
          var unl = function (all) {
            var n = lib.meta.grpN, msg = all || n <= 2 ? "Délier les " + n + " vidéos de ce lot ?\n\nElles ne seront plus liées : chacune garde ses infos et ses extraits, mais plus d'ordre ni de crédits partagés, et plus de bout à bout depuis le lot."
              : "Délier cette vidéo des " + (n - 1) + " autres ?\n\nLes autres restent liées entre elles. Cette vidéo garde ses infos et ses extraits.";
            if (!confirm(msg)) return; lbar.classList.add("busy");
            lib.unlink(all).then(function () { lbar.remove(); }, function (e) { lbar.classList.remove("busy"); alert("Pas délié : " + e.message); });
          };
          lbar.appendChild(el("button", { type: "button", class: "btn ghost", text: lib.meta.grpN > 2 ? "Délier cette vidéo" : "Délier", title: "Retire cette vidéo du lot importé ensemble", on: { click: function () { unl(false); } } }));
          if (lib.meta.grpN > 2) lbar.appendChild(el("button", { type: "button", class: "btn ghost", text: "Tout délier", title: "Dissout le lot : plus aucune vidéo liée", on: { click: function () { unl(true); } } }));
        }
        box.appendChild(lbar);
      }
      box.appendChild(el("span", { class: "label", text: lib ? "Infos du film dans le video club (sur le site et dans les prochaines bandes) · enregistrées toutes seules" : "Retouches pour cette bande seulement · enregistrées toutes seules" }));
      box.appendChild(el("div", { class: "bmgrid" }, [
        el("div", {}, [].concat(
          fld(lib ? "Titre (bandes seulement : chaque page du site garde le sien)" : "Titre", function () { return it.title; }, function (v) { it.title = v; }),
          [el("span", { class: "label", text: "Réal" }), chipsIn("dir", function () { return bibDirs(it); }, function (l) { it.dir = l.join(", "); })],
          [el("span", { class: "label", text: "Prod" }), chipsIn("prod", function () { return bibProds(it); }, function (l) { it.prod = l.join(", "); })],
          [el("span", { class: "label", text: "Chefs op et rôles (rôle vide = cinematographer, crédité en premier)" }), credEd()],
          [el("span", { class: "label", text: "Types de contenu" }), chipsIn("type", function () { return (it.types || it.cats || []).slice(); }, function (l) { it.types = l; })],
          lib ? clientFld() : [],
          lib ? [infoFile(lib.meta)] : [],
          [orig || lib ? el("button", { type: "button", class: "btn ghost", text: lib ? "Tout remettre comme sur les pages" : "Tout remettre comme dans le video club", on: { click: function () {
            if (lib) { lib.reset(); close(); return; } var keepKey = it.key; band.items[i] = bandItem(orig); band.items[i].key = keepKey; chg(); close();
          } } }) : null])),
        el("div", {}, [el("span", { class: "label", text: "Aperçu et recadrage (survol = extrait ; cliquer ou bouger le curseur pour régler)" }), zwrap,
          player ? null : el("span", { class: "label", text: "Vignette" }), player ? null : thumbs,
          player ? null : upBtn("⤒ Importer une image", imgUp, "image", doImg), player ? null : imgUp,
          player ? null : histImgL, player ? null : histImg])]));
      box.appendChild(el("div", { class: "bmgrid" }, [
        el("div", {}, [el("span", { class: "label", text: "Sous le film : stills et autres vidéos" }), exBox, el("div", { class: "row exrow" }, [exFind, el("div", { class: "grow" }, [exIn]), exGo]),
          el("div", { class: "tlrow" }, [upBtn("⤒ Ajouter des stills de l'ordinateur", stUp, "image", addStills, true), stUp]), exOut]),
        el("div", {}, [el("span", { class: "label", text: "Prix et sélections" }), aw])]));
      // Remplacer la vidéo (Gus 23/11) : lien Slate d'une vidéo (page « work » ou shots.re) → nouveau film complet et extrait ;
      // l'extrait choisi et l'image de vignette prise dans l'ancien film sont oubliés (ils ne correspondent plus). Depuis l'ordinateur :
      // quand notre hébergement (Amazon) sera branché.
      var rpIn = el("input", { type: "text", placeholder: "Lien Slate de la nouvelle vidéo (page d'une vidéo ou shots.re)" }), rpOut = el("p", { class: "hint" });
      var rpGo = el("button", { type: "button", class: "btn", text: "Remplacer", on: { click: function () {
        var v = rpIn.value.trim(); if (!v) return; rpGo.disabled = true; rpOut.textContent = "Lecture sur Slate" + slateWait("…");
        importStills(v).then(function (d) {
          if (!d.full && !d.video) throw new Error("ce lien ne contient pas de vidéo");
          // Vignette, extrait et leurs temps gardés (Gus 26/11) : « Valider » les refait dans la nouvelle vidéo.
          it.full = d.full || d.video; if (!it.video && d.video) it.video = d.video; delete it._snipTmp; delete it._snipSaved;
          it.edited = true; chg(); document.removeEventListener("keydown", eKey, true); ov.remove(); editItem(i, lib); // la fenêtre se rouvre sur la nouvelle vidéo
        }).catch(function (e) { rpGo.disabled = false; rpOut.textContent = "Lecture impossible : " + (e.message || "Slate ne répond pas"); });
      } } });
      rpIn.addEventListener("keydown", function (e) { if (e.key === "Enter") rpGo.click(); });
      // Depuis l'ordinateur (Gus 26/11) : la vidéo part chez Amazon (upload), le robot l'encode (version web 1080p, vignette, extrait
      // 720p aux 2/3) ; le film garde l'ancienne vidéo jusqu'à la fin (it.enc = encodage en cours, repris si on rouvre la fenêtre).
      var rpFile = el("input", { type: "file", accept: "video/*", hidden: true }), rpBar = el("progress", { max: 1, value: 0, class: "bupprog", hidden: true });
      rpFile.addEventListener("change", function () { rpUp(rpFile.files[0]); rpFile.value = ""; });
      function rpUp(f) {
        if (!f) return;
        if (!canWeb) { rpOut.textContent = "Lecture seule : cette clé ne peut rien envoyer."; return; }
        if (f.size > 10e9) { rpOut.textContent = "Plus de 10 Go : trop lourd pour le robot d'encodage."; return; }
        rpBar.hidden = false; rpBar.value = 0; rpOut.textContent = "Envoi chez Amazon…"; var t0 = Date.now();
        upload(f, function (p) {
          rpBar.value = p; var sec = (Date.now() - t0) / 1000, left = p > .02 ? sec * (1 - p) / p : 0;
          rpOut.textContent = "Envoi : " + Math.floor(p * 100) + " %" + (left > 5 ? " · encore ≈ " + (left > 90 ? Math.round(left / 60) + " min" : Math.round(left) + " s") : "") + " (garde l'admin ouverte)";
        }).then(function (key) {
          var id = encId();
          return encAsk("film", [{ id: id, kind: "film", key: key, web: true }]).then(function (path) {
            it.enc = { path: path, id: id }; it.edited = true; chg(); rpBar.hidden = true;
            rpOut.textContent = "Envoyé. Encodage en cours (quelques minutes) : la vidéo sera remplacée toute seule. Tu peux fermer cette fenêtre, garde l'admin ouverte.";
            rpWait();
          });
        }).catch(function (e) { rpBar.hidden = true; rpOut.textContent = "Envoi interrompu : " + e.message + ". Rechoisis le même fichier : l'envoi reprendra où il en était."; });
      }
      function rpWait() {
        var e = it.enc; if (!e || e.error || encBusy[e.id]) return; encBusy[e.id] = 1;
        encWait(e.path, 15000, 4 * 3600000).then(function (jobs) {
          delete encBusy[e.id];
          if (!it.enc || it.enc.id !== e.id) return;
          var j = jobs.filter(function (x) { return x.id === e.id; })[0] || {};
          if (!j.answer) { it.enc.error = j.error || "pas de réponse"; chg(); rpOut.textContent = "Encodage raté : " + it.enc.error; return; }
          // Vignette, extrait et leurs temps gardés (Gus 26/11) : « Valider » les refait dans la nouvelle vidéo.
          it.full = j.answer.full; delete it._snipTmp; delete it._snipSaved; delete it.enc; it.edited = true; chg();
          if (document.body.contains(ov)) { document.removeEventListener("keydown", eKey, true); ov.remove(); editItem(i, lib); } // la fenêtre se rouvre sur la nouvelle vidéo
        }, function (err) { delete encBusy[e.id]; rpOut.textContent = "Encodage : " + err.message; });
      }
      var rpBox = el("div", { class: "brepl", hidden: true }, [el("div", { class: "row" }, [el("div", { class: "grow" }, [rpIn]), rpGo]),
        el("div", { class: "tlrow" }, [upBtn("⤒ Depuis l'ordinateur", rpFile, "video", rpUp), rpFile]),
        el("p", { class: "hint", text: "La vignette et l'extrait actuels sont gardés (mêmes temps) : « Valider » dans Vignette / Extrait les refait dans la nouvelle vidéo." }), rpBar, rpOut]);
      if (it.enc && !it.enc.error) { rpBox.hidden = false; rpOut.textContent = "Nouvelle vidéo : encodage en cours… (la fenêtre se met à jour toute seule)"; rpWait(); }
      // Le bouton accepte aussi une vidéo glissée depuis l'ordinateur (Gus 26/11).
      var rpB = upBtn("↻ Remplacer la vidéo", rpFile, "video", function (f) { rpBox.hidden = false; rpUp(f); });
      rpB.className = "btn ghost bupbtn"; rpB.title = "Cliquer pour les choix, ou glisser une vidéo de l'ordinateur ici";
      rpB.onclick = function (e) { e.stopImmediatePropagation(); rpBox.hidden = !rpBox.hidden; if (!rpBox.hidden) rpIn.focus(); };
      box.appendChild(el("div", { class: "breplw" }, [rpB, rpBox]));
      // Vignette et extrait : deux onglets sous le film (Gus 22/11), vignette d'abord.
      var thumbPane = null, snipPane = null;
      if (player) {
        // « Valider » en bas à droite (Gus 22/11) : la vignette = l'image affichée ; l'extrait réglé n'est enregistré qu'en validant.
        var valB = el("button", { type: "button", class: "btn primary", text: "Valider l'extrait", on: { click: function () { snipCommit(); valB.disabled = true; prevSnip(); } } });
        // Dans une bande : faire de cette vignette / de cet extrait ceux du film dans le video club (Gus 23/11).
        var libF = !lib && filmOf(it.key), offOut = el("span", { class: "hint" });
        function official(kind) {
          if (!libF) return;
          if (kind === "snip" && it._snipTmp) snipCommit(); // un extrait réglé mais pas encore validé : validé d'abord
          if (kind === "img") libPatch(libF, { img: it.img, thumbT: it.thumbT });
          else libPatch(libF, { snip: it.snip, snipVideo: it.snipVideo });
          offOut.textContent = (kind === "img" ? "Vignette appliquée" : "Extrait appliqué") + " au film dans le video club : le site et les prochaines bandes l'utiliseront.";
        }
        var offImg = libF ? el("div", { class: "boff" }, [el("button", { type: "button", class: "blink", text: "★ En faire la vignette officielle du film", title: "Le film du video club prend cette vignette (sur le site et pour toutes les prochaines bandes)", on: { click: function () { official("img"); } } })]) : null;
        var offSnip = libF ? el("div", { class: "boff" }, [el("button", { type: "button", class: "blink", text: "★ En faire l'extrait officiel du film", title: "Le film du video club prend cet extrait (sur le site et pour toutes les prochaines bandes)", on: { click: function () { official("snip"); } } })]) : null;
        thumbPane = el("div", { class: "ppane" }, [el("div", { class: "tlrow" }, [upBtn("⤒ Importer une image", imgUp, "image", doImg), imgUp, el("span", { class: "tlgrow" }), grabB]),
          el("span", { class: "label", text: "Ou une image du film" }), thumbs, histImgL, histImg, offImg]);
        var montBtn = el("button", { type: "button", class: "btn primary montbtn", text: "✂ Ouvrir la fenêtre de montage", title: "Régler l'extrait (30 s au plus) : blocs, zoom, image par image", on: { click: function () {
          if (!it.full && !src) return; var p0 = parts() || (it.snip ? [{ s: it.snip.s, d: it.snip.d }] : null);
          montageWin([{ key: it.key, title: it.title || "Film", full: it.full || src, dur: dur }], { mode: "snip", max: MAXD, parts: p0 && p0.length ? p0.map(function (x) { return { s: x.s, d: x.d }; }) : undefined, name: it.title,
            onSave: function (ps) { snipDraft(); it.snip = ps.length > 1 ? { s: ps[0].s, d: ps[0].d, parts: ps } : { s: ps[0].s, d: ps[0].d }; delete it._sel; bi = -1; snipMark(); snipCommit(); prevSnip(); playExtract(); } });
        } } });
        snipPane = el("div", { class: "ppane", hidden: true }, [snipCur, exPrev, montBtn, snipLine, el("div", { class: "tlrow" }, [upBtn("⤒ Importer un mp4", vidUp, "video", doVid), vidUp]), histSnipL, histSnip, offSnip]);
        box.appendChild(el("div", { class: "bplay" }, [ptabs, el("span", { class: "hint", text: "Image par image avec les flèches ← → (Maj = 1 s) · espace = lecture / pause · Z ou J = à l'envers, K = pause, L = lecture · I / O = début / fin de l'extrait · Entrée = ajouter le bloc" }), player, tl, tools, thumbPane, snipPane, pout, offOut]));
        // Versions de la vidéo (Gus 26/11, phase 2) : « Encodage 1 » (la vidéo encodée à l'import) et les « Edit n » faits avec « edit moi si tu peux ! » ; la case choisit celle
        // que le site et les bandes affichent (le fichier original reste chez Amazon). Un edit peut devenir un nouveau projet.
        if (lib) {
          var verBox = el("div", { class: "bvers" }), verT = 0;
          var nextEditN = function () { var n = 0; (it.versions || []).forEach(function (v) { var m = /^Edit (\d+)$/.exec(v.name); if (m) n = Math.max(n, +m[1]); }); return n + 1; };
          var fmtDur = function (d) { return Math.floor(d / 60) + " min " + String(Math.round(d % 60)).padStart(2, "0") + " s"; };
          var openEdit = function (parts) {
            var m = lib.meta || {}, base = { key: it.key, title: it.title, full: it.vbase || it.full, dur: m.dur || (player && player.duration) || 0, size: m.size, mkey: m.mkey, dir: it.dir, prod: it.prod, dops: it.dops, types: it.types, client: it.client };
            if (!base.dur) { alert("Durée de la vidéo inconnue : rouvre la fenêtre quand la vidéo est chargée."); return; }
            montageWin([base], { mode: "version", parts: parts, name: "Edit " + nextEditN(), onVersion: function (v) { it.versions = (it.versions || []).concat([v]); it.edited = true; chg(); drawVers(); } });
          };
          var pickVersion = function (id) { // id : version choisie, ou « » = Encodage 1
            var v = id && (it.versions || []).filter(function (x) { return x.id === id; })[0]; if (id && (!v || !v.full)) return;
            if (id) { it.vbase = it.vbase || it.full; it.full = v.full; it.vsel = id; } else if (it.vbase) { it.full = it.vbase; delete it.vbase; delete it.vsel; }
            if (it.snip && it.snip.v) it.snip.vf = it.full; // l'extrait léger reste valable : il ne vient pas de cette version
            it.edited = true; chg(); reopen();
          };
          var newProject = function (v) {
            if (!v.full || !confirm("Créer un nouveau projet du video club avec « " + v.name + " » ?\n\nIl apparaît dans le video club (encodage en cours quelques minutes), avec ses propres vignettes, extraits et crédits ; cette vidéo reste comme elle est.")) return;
            var nid = encId(), by = user && user.login || "", req = encFile("film", [{ id: nid, kind: "post", src: v.full }]);
            var item = { key: "e" + nid, kind: "video", title: (it.title || "") + " — " + v.name, dir: it.dir || "", prod: it.prod || "", dops: (it.dops || []).slice(), types: (it.types || []).slice(), cats: [], src: "montage", at: new Date().toISOString(), by: by, enc: { path: req.path, id: nid }, montage: { from: [it.key], version: v.id, parts: v.parts } };
            if (it.client) item.client = it.client;
            commit([req, { path: BIB_LIB, edit: function (t) { var L = t ? JSON.parse(t) : { items: [] }; L.items = (L.items || []).filter(function (x) { return x.key !== item.key; }); L.items.push(item); return json(L); } }], "Edit : nouveau projet (admin, " + by + ")")
              .then(function () { alert("Nouveau projet « " + item.title + " » envoyé au robot : il apparaît dans le video club (⟳ encodage en cours)."); return bibLoad(true); }).then(function (d) { adopt(d); draw(); encCheck(); }, function (e) { alert("Pas créé : " + e.message); });
          };
          var delVersion = function (v) {
            if (!confirm("Supprimer la version « " + v.name + " » ? (le fichier reste chez Amazon, il n'est pas effacé)")) return;
            var was = it.vsel === v.id; it.versions = (it.versions || []).filter(function (x) { return x.id !== v.id; }); if (!it.versions.length) delete it.versions;
            if (was) { it.full = it.vbase || it.full; delete it.vbase; delete it.vsel; if (it.snip && it.snip.v) it.snip.vf = it.full; }
            it.edited = true; chg(); if (was) reopen(); else drawVers();
          };
          var drawVers = function () {
            verBox.textContent = ""; clearTimeout(verT);
            verBox.appendChild(el("span", { class: "label", text: "Versions de la vidéo · la case choisit celle que le site et les bandes affichent" }));
            var row = function (id, name, onName, state, btns, can) {
              var r = el("input", { type: "radio", name: "vsel", disabled: can ? null : true }); r.checked = (it.vsel || "") === id; r.addEventListener("change", function () { pickVersion(id); });
              var ni = el("input", { type: "text", value: name, class: "bvname" }); ni.addEventListener("input", function () { onName(ni.value.trim() || name); it.edited = true; chg(); });
              return el("div", { class: "bver" + ((it.vsel || "") === id ? " on" : "") }, [r, ni, el("span", { class: "hint bvst", text: state })].concat(btns || []));
            };
            var m = lib.meta || {};
            verBox.appendChild(row("", it.vname || "Encodage 1", function (n) { it.vname = n; }, "Vidéo encodée à l'import · 1080p" + (m.ws ? " · " + fsz(m.ws) : ""), [], true));
            (it.versions || []).forEach(function (v) {
              var pend = v.enc && !v.enc.error, bad = v.enc && v.enc.error;
              verBox.appendChild(row(v.id, v.name, function (n) { v.name = n; }, bad ? "⚠ raté : " + v.enc.error : pend ? "⟳ encodage en cours…" : (v.dur ? fmtDur(v.dur) : "") + (v.ws ? " · " + fsz(v.ws) : "") + (v.quality === "web" ? " · depuis la version compressée" : " · depuis l'original"), [
                el("button", { type: "button", class: "btn ghost", text: "✎ Modifier", title: "Rouvre le montage avec ces morceaux (crée une nouvelle version)", on: { click: function () { openEdit(v.parts); } } }),
                el("button", { type: "button", class: "btn ghost", text: "Nouveau projet", title: "Créer un nouveau projet du video club avec cet edit", disabled: v.full ? null : true, on: { click: function () { newProject(v); } } }),
                el("button", { type: "button", class: "bx", text: "×", title: "Supprimer cette version", on: { click: function () { delVersion(v); } } })], !!v.full));
            });
            verBox.appendChild(el("div", { class: "tlrow" }, [el("button", { type: "button", class: "btn primary", text: "✂ edit moi si tu peux !", title: "Couper, réordonner, retirer le générique : fenêtre de montage, export 1080p avec le son", on: { click: function () { openEdit(null); } } })]));
            var pending = (it.versions || []).filter(function (v) { return v.enc && !v.enc.error; });
            if (pending.length) verT = setTimeout(function () { // suivi du robot tant que la fenêtre est ouverte
              if (!ov.isConnected) return;
              Promise.all(pending.map(function (v) { return readFile(v.enc.path).catch(function () { return null; }).then(function (d) {
                if (!d || !d.doneAt) return false; var j = (d.jobs || []).filter(function (y) { return y.id === v.enc.id; })[0]; if (!j) return false;
                if (j.answer) { v.full = j.answer.full; v.ws = j.answer.ws; v.dur = j.answer.dur; v.w = j.answer.w; v.h = j.answer.h; delete v.enc; } else v.enc.error = j.error || "pas de réponse"; return true;
              }); })).then(function (r) { if (r.some(Boolean)) { it.edited = true; chg(); } if (ov.isConnected) drawVers(); });
            }, 12000);
          };
          drawVers(); box.appendChild(verBox);
        }
        setTab("thumb");
      }
      // Lien de partage de ce film seul (Gus 23/11, comme sur Slate) : une « bande » d'un seul film, centrée, même lien court chiffré
      // (b/<code>) ; « Autoriser le téléchargement ». Code gardé par film dans le dépôt notes (bandes/films.json), jamais dans le public ;
      // la page est remise à jour quand on retouche le film.
      shr = { code: null, dl: false, t: 0 };
      var shrB = el("button", { type: "button", class: "btn", text: "🔗 Copier le lien de ce film" }), shrMsg = el("span", { class: "hint" });
      var shrCk = el("input", { type: "checkbox" }), shrDl = el("label", { class: "bck" }, [shrCk, " Autoriser le téléchargement"]);
      nGet(BAND_NOTES + "films.json").then(function (t) { var m = t ? JSON.parse(t) : {}; var x = m[it.key]; if (x) { shr.code = x.code; shr.dl = !!x.download; shrCk.checked = shr.dl; shrMsg.textContent = "Lien : " + bandURL(x.code).replace(/^https?:\/\//, ""); } }, function () {});
      function shrPublish() {
        var pub = sharePayload(it, shr.dl), c = pub.items[0];
        var by = user && user.login || "", code = shr.code;
        return bandSeal(code, "", "", pub).then(function (x) {
          return commit([{ path: BAND_PUB + x.id + ".json", text: x.text }].concat(files.splice(0)), "Film partagé : " + (c.title || "") + " (admin, " + by + ")");
        }).then(function () {
          return nEdit(BAND_NOTES + "films.json", function (t) { var m = t ? JSON.parse(t) : {}; var o = m[it.key] || {}; if (o.code === code && !!o.download === shr.dl) return null; m[it.key] = { code: code, download: shr.dl, title: c.title || "", at: new Date().toISOString(), by: by }; return json(m); }, "Films partagés (admin, " + by + ")");
        });
      }
      shrB.addEventListener("click", function () {
        if (!canWeb) { shrMsg.textContent = "Lecture seule."; return; }
        var isNew = !shr.code; if (isNew) shr.code = bandCode();
        var url = bandURL(shr.code), short = url.replace(/^https?:\/\//, "");
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
        shrMsg.textContent = isNew ? "Création du lien… " + short : "Lien copié : " + short;
        shrPublish().then(function () { shrMsg.textContent = "Lien copié : " + short; shrB.textContent = "✓ Lien copié"; setTimeout(function () { shrB.textContent = "🔗 Copier le lien de ce film"; }, 1800); },
          function (e) { shrMsg.textContent = "Lien pas enregistré : " + e.message; });
      });
      shrCk.addEventListener("change", function () { shr.dl = shrCk.checked; if (shr.code) shrPublish().then(function () { shrMsg.textContent = shr.dl ? "Téléchargement autorisé sur ce lien." : "Téléchargement retiré de ce lien."; }, function (e) { shrMsg.textContent = "Pas enregistré : " + e.message; }); });
      shr.again = function () { if (!shr.code) return; soon("share" + it.key, shrPublish, 2500); };
      euB = el("button", { type: "button", class: "blink bundo", text: "↶ Annuler", title: "Annuler (Ctrl / Cmd + Z)", on: { click: function () { eGo(-1); } } });
      erB = el("button", { type: "button", class: "blink bredo", text: "Rétablir ↷", title: "Rétablir (Maj + Ctrl / Cmd + Z)", on: { click: function () { eGo(1); } } });
      box.appendChild(el("div", { class: "bshare" }, [el("span", { class: "label", text: "Partager ce film seul" }), el("div", { class: "tlrow" }, [shrB, shrDl, shrMsg])]));
      // Zone rouge (Gus 26/11) : supprimer ce film du video club (films importés seulement ; seulement celui-ci, pas les autres vidéos importées avec lui).
      if (lib && lib.canDelete && lib.canDelete()) {
        var delOut = el("span", { class: "hint" });
        box.appendChild(el("div", { class: "bdanger" }, [el("span", { class: "label", text: "Zone rouge" }),
          el("button", { type: "button", class: "btn bdelb", text: lib.isSlate && lib.isSlate() ? "Masquer du video club (film de Slate)" : lib.meta && lib.meta.size && !(it.images && it.images.length) ? "Supprimer cette vidéo du video club" : "Supprimer du video club", on: { click: function () {
            if (!confirm("Supprimer « " + (it.title || "ce film") + " » du video club ?\n\nSeulement celui-ci : les autres vidéos importées avec lui restent. Son lien de partage ne marchera plus. Les fichiers chez Amazon ne sont pas effacés.")) return;
            delOut.textContent = "Suppression…"; this.disabled = true;
            lib.del().then(function () { close(); }, function (e) { delOut.textContent = "Pas supprimé : " + e.message; });
          } } }), delOut]));
      }
      box.appendChild(el("div", { class: "fwbtns bedfoot" }, [el("button", { type: "button", class: "btn primary", text: "OK", on: { click: close } }), el("span", { class: "bur" }, [euB, erB])]));
      if (lib && lib.head) box.insertBefore(lib.head, box.firstChild); // import : onglets des vidéos + avancement de l'envoi / l'encodage
      ov.appendChild(box); document.body.appendChild(ov); eBtns();
    }

    // ---------- Imports ----------
    // Recadrage des stills (Gus 26/11) : un rectangle posé sur l'image (déformable à volonté), commun à toutes les images d'un groupe :
    // { l, t, w, h, ar, per? } = position et taille du rectangle en fraction de l'image, `ar` = forme du cadre affiché (largeur / hauteur
    // en pixels), `per` = { adresse de l'image : { l, t, w, h, ar } } pour les images qui ont leur propre recadrage. Groupe sous un film :
    // `extras[i].crop` ; images du projet : `it.scrop`. Ancien format { ar, z, x, y } (zoom) encore lu. Même rendu sur le site.
    var SC_AR = [["16:9", 16 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3], ["1:1", 1], ["2,39:1", 2.39], ["9:16", 9 / 16]];
    function scBase(c) { return c && (c.w > 0 || c.ar > 0) ? c : null; }
    function scNorm(c) {
      if (!c) return null; var o = {};
      if (c.w > 0 && c.h > 0) { o.w = Math.max(.02, Math.min(1, +c.w)); o.h = Math.max(.02, Math.min(1, +c.h)); o.l = Math.max(0, Math.min(1 - o.w, +c.l || 0)); o.t = Math.max(0, Math.min(1 - o.h, +c.t || 0)); o.ar = Math.round(Math.max(.2, Math.min(6, +c.ar || 16 / 9)) * 1000) / 1000; }
      else if (c.ar > 0) { o.ar = +c.ar; o.z = Math.max(1, +c.z || 1); o.x = c.x === undefined ? 50 : +c.x; o.y = c.y === undefined ? 50 : +c.y; }
      var per = {}; Object.keys(c.per || {}).forEach(function (u) { var q = scNorm(Object.assign({}, c.per[u], { per: null })); if (q && q.w) per[u] = q; });
      if (Object.keys(per).length) o.per = per;
      return Object.keys(o).length ? o : null;
    }
    function scFor(c, u) { return (c && c.per && c.per[u]) || scBase(c); } // recadrage de l'image u (le sien, sinon celui du groupe)
    function scLayer(i, c) { // applique un recadrage (ou rien) à un calque image
      i.style.transform = ""; i.style.transformOrigin = ""; i.style.backgroundSize = ""; i.style.backgroundPosition = "";
      if (!c) return;
      if (c.w > 0) { i.style.backgroundSize = 100 / c.w + "% " + 100 / c.h + "%"; i.style.backgroundPosition = (c.w < 1 ? c.l / (1 - c.w) * 100 : 0) + "% " + (c.h < 1 ? c.t / (1 - c.h) * 100 : 0) + "%"; }
      else if (c.ar > 0) { if (c.z > 1) i.style.transform = "scale(" + c.z + ")"; i.style.transformOrigin = c.x + "% " + c.y + "%"; i.style.backgroundPosition = c.x + "% " + c.y + "%"; }
    }
    function scCell(cell, c, u) { var q = scFor(c, u); cell.style.aspectRatio = q ? String(q.ar) : ""; scLayer(cell.firstChild, q); }
    function scLabel(c) { c = scNorm(c); if (!c) return "Recadrer"; var n = Object.keys(c.per || {}).length, b = scBase(c); return "Recadrage" + (b ? " " + (b.ar.toFixed(2).replace(".", ",")) + ":1" : "") + (n ? " · " + n + " image" + (n > 1 ? "s" : "") + " à part" : ""); }
    function cropWin(title, urls, cur, done) { // cur : recadrage actuel ou null ; done(c | null) à « Appliquer » / « Retirer »
      var gc = scNorm(cur) || {}, per = {}, k = 0, ratios = {}, keep = false;
      Object.keys(gc.per || {}).forEach(function (u) { per[u] = gc.per[u]; }); delete gc.per; if (!(gc.w > 0)) gc = gc.ar > 0 ? gc : null; // groupe : null = pas de cadre commun
      var ov = el("div", { class: "bmodal bcropw" }), stage = el("div", { class: "bcst" }), im = el("img", { draggable: false }), rc = el("div", { class: "bcr" }), cnt = el("span", { class: "hint" });
      var HS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"], hs = HS.map(function (m) { return el("b", { class: "bch " + m, "data-m": m }); });
      rc.appendChild(el("i", { class: "bcg" })); hs.forEach(function (h) { rc.appendChild(h); }); stage.appendChild(im); stage.appendChild(rc);
      var strip = el("div", { class: "bcropstrip" }), arRow = el("div", { class: "btabs" }), msg = el("p", { class: "hint" });
      var ownCk = el("input", { type: "checkbox" }), keepCk = el("input", { type: "checkbox" });
      function u() { return urls[k]; }
      function ir() { return ratios[u()] || 16 / 9; }
      function legacy(c) { var r = ir(), fw = Math.min(1, c.ar / r) / c.z, fh = Math.min(1, r / c.ar) / c.z; return { l: (1 - fw) * c.x / 100, t: (1 - fh) * c.y / 100, w: fw, h: fh, ar: c.ar }; }
      function full() { return { l: 0, t: 0, w: 1, h: 1, ar: ir() }; }
      function rect() { var o = per[u()]; if (o) return o; var b = scBase(gc); return b ? (b.w > 0 ? b : legacy(b)) : full(); } // rectangle montré / modifié
      function setRect(r) { // enregistre le rectangle dans l'image (cadre à part) ou le groupe, en recalculant la forme du cadre
        r = scNorm(Object.assign({}, r, { ar: r.w / r.h * ir() })); if (per[u()] || ownCk.checked) per[u()] = r; else gc = r;
      }
      function paint() {
        var r = rect(); im.src = imgShow(u()); rc.style.left = r.l * 100 + "%"; rc.style.top = r.t * 100 + "%"; rc.style.width = r.w * 100 + "%"; rc.style.height = r.h * 100 + "%";
        cnt.textContent = (k + 1) + " / " + urls.length; ownCk.checked = !!per[u()];
        msg.textContent = per[u()] ? "Cette image a son propre cadre." : "Ce cadre vaut pour toutes les images du groupe sans cadre à part.";
        paintStrip();
      }
      function paintStrip() { strip.querySelectorAll(".bsc").forEach(function (b, i) { b.classList.toggle("on", i === k); scCell(b, Object.assign({}, scBase(gc) || {}, { per: per }), urls[i]); if (!scFor(Object.assign({}, scBase(gc) || {}, { per: per }), urls[i])) b.style.aspectRatio = "16 / 9"; }); }
      function load(i, then) { var x = new Image(); x.onload = function () { ratios[urls[i]] = x.naturalWidth / x.naturalHeight; if (then) then(); }; x.onerror = function () { if (then) then(); }; x.src = imgShow(urls[i]); }
      function go(i) { k = (i + urls.length) % urls.length; if (ratios[u()]) paint(); else load(k, paint); }
      im.addEventListener("load", function () { if (!ratios[u()] && im.naturalWidth) { ratios[u()] = im.naturalWidth / im.naturalHeight; paint(); } });
      // Rectangle : glisser un côté ou un coin pour le déformer, l'intérieur pour le déplacer ; « Garder la forme » verrouille le rapport.
      var dr = null;
      rc.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); rc.setPointerCapture(e.pointerId); var b = im.getBoundingClientRect(); dr = { m: e.target.dataset.m || "move", px: e.clientX, py: e.clientY, r: Object.assign({}, rect()), W: b.width, H: b.height }; });
      rc.addEventListener("pointermove", function (e) {
        if (!dr) return; var dx = (e.clientX - dr.px) / dr.W, dy = (e.clientY - dr.py) / dr.H, o = dr.r, m = dr.m, MIN = .03, L = o.l, T = o.t, R = o.l + o.w, B = o.t + o.h;
        if (m === "move") { L = Math.max(0, Math.min(1 - o.w, o.l + dx)); T = Math.max(0, Math.min(1 - o.h, o.t + dy)); R = L + o.w; B = T + o.h; }
        else {
          if (m.indexOf("w") > -1) L = Math.max(0, Math.min(R - MIN, o.l + dx)); if (m.indexOf("e") > -1) R = Math.min(1, Math.max(L + MIN, o.l + o.w + dx));
          if (m.indexOf("n") > -1) T = Math.max(0, Math.min(B - MIN, o.t + dy)); if (m.indexOf("s") > -1) B = Math.min(1, Math.max(T + MIN, o.t + o.h + dy));
          if (keepCk.checked && m.length === 2) { // coin avec la forme verrouillée : la hauteur suit la largeur
            var ar = o.w / o.h, w = R - L, h = w / ar;
            if (m.indexOf("n") > -1) T = Math.max(0, B - h); else B = Math.min(1, T + h);
            if (T === 0 || B === 1) { h = B - T; w = h * ar; if (m.indexOf("w") > -1) L = R - w; else R = L + w; }
          }
        }
        setRect({ l: L, t: T, w: R - L, h: B - T }); paint();
      });
      rc.addEventListener("pointerup", function () { dr = null; });
      // Formes toutes faites : le plus grand cadre de cette forme dans l'image, centré sur le cadre actuel.
      function shape(ratio) { var r = rect(), I = ir(), w = Math.min(1, ratio / I), h = w * I / ratio; if (h > 1) { h = 1; w = ratio / I; } var cx = r.l + r.w / 2, cy = r.t + r.h / 2; setRect({ l: Math.max(0, Math.min(1 - w, cx - w / 2)), t: Math.max(0, Math.min(1 - h, cy - h / 2)), w: w, h: h }); paint(); }
      SC_AR.forEach(function (a) { arRow.appendChild(el("button", { type: "button", text: a[0], on: { click: function () { shape(a[1]); } } })); });
      arRow.appendChild(el("button", { type: "button", text: "Image entière", on: { click: function () { setRect({ l: 0, t: 0, w: 1, h: 1 }); paint(); } } }));
      ownCk.addEventListener("change", function () { if (ownCk.checked) per[u()] = scNorm(Object.assign({}, rect(), { ar: rect().w / rect().h * ir() })); else delete per[u()]; paint(); });
      urls.slice(0, 80).forEach(function (x, i) { strip.appendChild(el("button", { type: "button", class: "bsc", title: "Voir cette image", on: { click: function () { go(i); } } }, [el("i", { class: "bsi", style: 'background-image:url("' + imgShow(x) + '")' })])); });
      var result = function () { var c = scBase(gc) ? Object.assign({}, gc) : {}; if (Object.keys(per).length) c.per = per; return scNorm(c); };
      var box = el("div", { class: "bmbox" }, [el("span", { class: "label", text: title }),
        el("p", { class: "hint", text: "Le rectangle rouge montre ce qui sera visible : glisse un côté ou un coin pour le déformer, l'intérieur pour le déplacer." }), stage,
        el("div", { class: "row" }, [el("button", { type: "button", class: "btn ghost", text: "◀", on: { click: function () { go(k - 1); } } }), cnt, el("button", { type: "button", class: "btn ghost", text: "▶", on: { click: function () { go(k + 1); } } })]),
        el("span", { class: "label", text: "Formes toutes faites" }), arRow,
        el("label", { class: "bcck" }, [keepCk, " Garder la forme en tirant un coin"]),
        el("label", { class: "bcck" }, [ownCk, " Cadre à part pour cette image seulement"]), msg,
        el("span", { class: "label", text: "Résultat sur toutes les images" }), strip,
        el("div", { class: "fwbtns" }, [
          el("button", { type: "button", class: "btn primary", text: "Appliquer", on: { click: function () { ov.remove(); done(result()); } } }),
          el("button", { type: "button", class: "btn ghost", text: "Retirer tout recadrage", on: { click: function () { ov.remove(); done(null); } } }),
          el("button", { type: "button", class: "btn ghost", text: "Annuler", on: { click: function () { ov.remove(); } } })])]);
      ov.appendChild(box); ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); }); document.body.appendChild(ov); go(0);
    }
    function modal(title, kids) {
      var ov = el("div", { class: "bmodal" }), box = el("div", { class: "bmbox small" }, [el("span", { class: "label", text: title })].concat(kids));
      ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: function () { ov.remove(); } } })]));
      ov.appendChild(box); document.body.appendChild(ov); return ov;
    }
    // Film pas encore enregistré mais déjà utilisable (Gus 26/11 : la fenêtre des crédits s'ouvre tout de suite à l'import, pendant l'envoi).
    // Supprimer un film importé du video club (Gus 26/11) : sa fiche (library.json), ses retouches (edits.json) et son lien de partage ; les autres vidéos
    // importées avec lui ne sont pas touchées. Rien n'est effacé chez Amazon (le robot n'a pas le droit d'effacer).
    function libDelete(f) { return libDeleteMany([f]); }
    // Corbeille (Gus 26/11) : un film supprimé part dans data/bibli/trash.json avec sa fiche, ses retouches et son lien de partage ; restaurable 30 jours, ensuite
    // la corbeille l'oublie. Les fichiers chez Amazon ne sont JAMAIS effacés par l'admin (le robot n'a pas le droit d'effacer) : pour libérer la place il faudrait
    // une règle de cycle de vie S3 ou un droit d'effacement dans AWS.
    var BIB_TRASH = "data/bibli/trash.json", TRASH_DAYS = 30;
    function libDelete(f) { return libDeleteMany([f]); }
    // Plusieurs films d'un coup (liste du video club, sélection cochée) : un seul enregistrement pour les fiches, les retouches et la corbeille, puis les liens de partage.
    function libDeleteMany(fl) {
      var by = user && user.login || "", keys = fl.map(function (f) { return f.key; }), now = new Date().toISOString();
      keys.forEach(function (k) { delete libQ.todo[k]; }); unsoon("libEdits");
      return Promise.all([readFile(BIB_LIB), readFile(BIB_EDITS).catch(function () { return null; }), nGet(BAND_NOTES + "films.json").catch(function () { return null; })]).then(function (r) {
        var lib = r[0] || { items: [] }, ed = (r[1] && r[1].films) || {}, shares = r[2] ? JSON.parse(r[2]) : {}, codes = keys.map(function (k) { return (shares[k] || {}).code; }).filter(Boolean);
        var gone = (lib.items || []).filter(function (x) { return keys.indexOf(x.key) > -1; }).map(function (x) { return { item: x, edit: ed[x.key] || null, share: shares[x.key] || null, at: now, by: by }; });
        // Films de Slate / des pages (pas dans library.json) : on ne les efface pas, on les MASQUE du video club (edits.json : hidden) ; restaurables 30 jours, puis ils restent masqués.
        var inLib = {}; (lib.items || []).forEach(function (x) { inLib[x.key] = 1; }); var hide = fl.filter(function (f) { return !inLib[f.key]; });
        hide.forEach(function (f) { gone.push({ item: { key: f.key, slate: f.slate || null, title: f.title || "", img: f.img || "", hiddenOnly: true }, edit: ed[f.key] || null, share: null, at: now, by: by }); });
        var hideKeys = hide.map(function (f) { return f.key; });
        return commit([{ path: BIB_LIB, edit: function (x) { if (!x) return null; var l = JSON.parse(x); l.items = (l.items || []).filter(function (y) { return keys.indexOf(y.key) < 0; }); return json(l); } },
          { path: BIB_EDITS, edit: function (x) { var o = x ? JSON.parse(x) : { films: {} }; o.films = o.films || {}; keys.forEach(function (k) { if (hideKeys.indexOf(k) > -1) o.films[k] = Object.assign({}, o.films[k], { hidden: true }); else delete o.films[k]; }); return json(o); } },
          { path: BIB_TRASH, edit: function (x) { var o = x ? JSON.parse(x) : { items: [] }; o.items = (o.items || []).filter(function (y) { return keys.indexOf(y.item.key) < 0; }).concat(gone); return json(o); } }],
          "Video club : " + keys.length + " film" + (keys.length > 1 ? "s mis" : " mis") + " à la corbeille (admin, " + by + ")").then(function () { return codes; });
      }).then(function (codes) {
        if (!codes.length) return;
        return Promise.all(codes.map(bandKeys)).then(function (ks) { return commit(ks.map(function (k) { return { path: BAND_PUB + k.id + ".json", remove: true }; }), "Liens de films supprimés (admin, " + by + ")").catch(function () {}); })
          .then(function () { return nEdit(BAND_NOTES + "films.json", function (t) { var m = t ? JSON.parse(t) : {}; keys.forEach(function (k) { delete m[k]; }); return json(m); }, "Films partagés : suppression (admin, " + by + ")"); }).catch(function () {});
      }).then(function () {
        data.films = data.films.filter(function (x) { return keys.indexOf(x.key) < 0; }); if (data.lib) data.lib.items = (data.lib.items || []).filter(function (x) { return keys.indexOf(x.key) < 0; });
        keys.forEach(function (k) { delete st.sel[k]; }); bibGroups(data.films); trashRefresh();
      });
    }
    // Petite corbeille en bas à gauche de la page video club : nombre de films, liste (restaurer / supprimer pour de bon), oubli automatique après 30 jours.
    function trashRefresh() {
      if (!trashBtn || !trashBtn.isConnected) return;
      return readFile(BIB_TRASH).catch(function () { return null; }).then(function (o) {
        var l = (o && o.items) || [], old = l.filter(function (x) { return Date.now() - Date.parse(x.at) > TRASH_DAYS * 864e5; });
        trashN = l.length - old.length; trashBtn.querySelector("b").textContent = trashN ? String(trashN) : ""; trashBtn.classList.toggle("full", trashN > 0);
        if (old.length && canWeb) commit([{ path: BIB_TRASH, edit: function (x) { if (!x) return null; var t = JSON.parse(x); t.items = (t.items || []).filter(function (y) { return Date.now() - Date.parse(y.at) <= TRASH_DAYS * 864e5; }); return json(t); } }], "Corbeille : films de plus de " + TRASH_DAYS + " jours oubliés (admin)").catch(function () {});
      });
    }
    function trashOpen() {
      var ov = el("div", { class: "bmodal btrashm" }), box = el("div", { class: "bmbox" }), list = el("div", { class: "btrashl" });
      function close() { ov.remove(); }
      function drawT(o) {
        list.textContent = ""; var l = ((o && o.items) || []).filter(function (x) { return Date.now() - Date.parse(x.at) <= TRASH_DAYS * 864e5; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
        if (!l.length) { list.appendChild(el("p", { class: "hint", text: "La corbeille est vide." })); return; }
        l.forEach(function (x) {
          var left = Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - Date.parse(x.at)) / 864e5));
          var th = el("i", { class: "bpth" }); if (x.item.img) th.style.backgroundImage = 'url("' + imgShow(x.item.img) + '")';
          list.appendChild(el("div", { class: "bpr" }, [th, el("span", { class: "bpt" }, [x.item.title || x.item.key, el("small", { text: "Supprimé le " + fdate(String(x.at).slice(0, 10)) + (x.by ? " par " + x.by : "") + " · oublié dans " + left + " jour" + (left > 1 ? "s" : "") })]),
            el("button", { type: "button", class: "btn ghost", text: "Restaurer", on: { click: function () { restore(x, this); } } }),
            el("button", { type: "button", class: "btn ghost bdelb", text: "Supprimer pour de bon", title: "Retire de la corbeille (les fichiers chez Amazon ne sont pas effacés)", on: { click: function () { forget([x]); } } })]));
        });
      }
      function reload() { return readFile(BIB_TRASH).catch(function () { return null; }).then(function (o) { drawT(o); trashRefresh(); return o; }); }
      function forget(xs) {
        if (!confirm("Supprimer " + (xs.length > 1 ? "ces " + xs.length + " films" : "« " + (xs[0].item.title || "ce film") + " »") + " pour de bon ? Ils ne pourront plus être restaurés. Les fichiers chez Amazon ne sont pas effacés.")) return;
        commit([{ path: BIB_TRASH, edit: function (t) { if (!t) return null; var o = JSON.parse(t); o.items = (o.items || []).filter(function (y) { return !xs.some(function (z) { return z.item.key === y.item.key && z.at === y.at; }); }); return json(o); } }], "Corbeille : suppression définitive (admin, " + (user && user.login || "") + ")").then(reload, function (e) { alert("Pas supprimé : " + e.message); });
      }
      function restore(x, btn) {
        btn.disabled = true; btn.textContent = "…";
        commit([{ path: BIB_LIB, edit: function (t) { if (x.item.hiddenOnly) return null; var l = t ? JSON.parse(t) : { items: [] }; l.items = (l.items || []).filter(function (y) { return y.key !== x.item.key; }); l.items.push(x.item); return json(l); } },
          { path: BIB_EDITS, edit: function (t) { if (!x.edit && !x.item.hiddenOnly) return null; var o = t ? JSON.parse(t) : { films: {} }; o.films = o.films || {}; if (x.edit) o.films[x.item.key] = x.edit; else delete o.films[x.item.key]; return json(o); } },
          { path: BIB_TRASH, edit: function (t) { if (!t) return null; var o = JSON.parse(t); o.items = (o.items || []).filter(function (y) { return !(y.item.key === x.item.key && y.at === x.at); }); return json(o); } }],
          "Video club : film restauré (admin, " + (user && user.login || "") + ")").then(function () { return bibLoad(true); }).then(function (d) {
          adopt(d); draw(); var f = filmOf(x.item.key); if (f && x.share) shareCreate([f]).catch(function () {}); return reload();
        }, function (e) { btn.disabled = false; btn.textContent = "Restaurer"; alert("Pas restauré : " + e.message); });
      }
      box.appendChild(el("span", { class: "label", text: "Corbeille · les films y restent " + TRASH_DAYS + " jours avant d'être oubliés" })); box.appendChild(list);
      box.appendChild(el("p", { class: "hint", text: "Les vidéos et images déjà envoyées chez Amazon restent là-bas : la corbeille ne retire que les fiches du video club." }));
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: close } })]));
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); }); ov.appendChild(box); document.body.appendChild(ov); list.appendChild(el("p", { class: "hint", text: "Chargement…" })); reload();
    }
    // Supprimer la sélection cochée dans la liste (Gus 26/11) : seulement les films importés ; ceux de Slate / des pages ne se suppriment pas d'ici.
    function deleteSelection() {
      var fl = Object.keys(st.sel).map(filmOf).filter(Boolean), inLib = {}; ((data.lib && data.lib.items) || []).forEach(function (x) { inLib[x.key] = 1; });
      var ok = fl, hide = fl.filter(function (f) { return !inLib[f.key]; }).length;
      if (!ok.length) return;
      var names = ok.slice(0, 6).map(function (f) { return "• " + (f.title || f.key); }).join("\n") + (ok.length > 6 ? "\n• … et " + (ok.length - 6) + " autre" + (ok.length - 6 > 1 ? "s" : "") : "");
      if (!confirm("Supprimer " + ok.length + " film" + (ok.length > 1 ? "s" : "") + " du video club ?\n\n" + names + (hide ? "\n\n" + hide + " film" + (hide > 1 ? "s" : "") + " vien" + (hide > 1 ? "nent" : "t") + " de Slate : " + (hide > 1 ? "ils sont masqués" : "il est masqué") + " du video club (" + (hide > 1 ? "ils restent" : "il reste") + " sur les pages du site où " + (hide > 1 ? "ils sont utilisés" : "il est utilisé") + ")." : "") + "\n\nIls vont à la corbeille (restaurables pendant 30 jours). Les liens de partage des films importés ne marcheront plus. Les autres vidéos importées avec eux restent. Les fichiers chez Amazon ne sont pas effacés.")) return;
      info.textContent = "Suppression…";
      libDeleteMany(ok).then(function () { draw(); }, function (e) { alert("Pas supprimé : " + e.message); draw(); });
    }
    // Délier des vidéos importées ensemble par erreur (Gus 27/11) : « cette vidéo » seulement (les autres restent liées entre elles) ou tout le lot. Un lot qui n'aurait plus
    // qu'une vidéo est dissous. `grp` / `gi` sont retirés de library.json et d'edits.json ; le site cesse de les lier à la prochaine lecture des données.
    function unlinkFilms(f, all) {
      if (!canWeb || !f.grp) return Promise.resolve(false);
      var mates = data.films.filter(function (x) { return x.grp === f.grp; }), keys = all || mates.length <= 2 ? mates.map(function (x) { return x.key; }) : [f.key], by = user && user.login || "";
      return commit([
        { path: BIB_LIB, edit: function (t) { var l = t ? JSON.parse(t) : { items: [] }; (l.items || []).forEach(function (x) { if (keys.indexOf(x.key) > -1) { delete x.grp; delete x.gi; } }); return json(l); } },
        { path: BIB_EDITS, edit: function (t) { var o = t ? JSON.parse(t) : { films: {} }; o.films = o.films || {}; keys.forEach(function (k) { if (o.films[k]) { delete o.films[k].grp; delete o.films[k].gi; } }); return json(o); } }
      ], "Video club : " + (keys.length > 1 ? "lot de vidéos délié" : "vidéo déliée") + " (admin, " + by + ")").then(function () {
        keys.forEach(function (k) { var m = filmOf(k); if (m) { delete m.grp; delete m.gi; } }); bibGroups(data.films); bibCache = null; draw(); return true;
      });
    }
    // Bout à bout des vidéos liées (Gus 26/11) : fenêtre de montage (montage.js) ; le nouveau projet apparaît dans le video club à la fin de l'encodage.
    function openMontage(f) {
      var ms = data.films.filter(function (x) { return x.grp && x.grp === f.grp; }).sort(function (a, b) { return (a.gi || 0) - (b.gi || 0); });
      var base = String(f.title || "").replace(/ - .*$/, ""); montageWin(ms, { name: "Bout à bout — " + (f.client && base.toLowerCase().indexOf(String(f.client).toLowerCase()) < 0 ? f.client + " " : "") + base, onCreated: function () { bibLoad(true).then(function (d) { adopt(d); draw(); encCheck(); }); } });
    }
    // Ordre commun des vidéos d'un même import : `gi` de chaque film du lot (library.json), recalculé pour tous.
    function grpOrder(g, ks) {
      var all = data.films.filter(function (x) { return x.grp === g; }).sort(function (a, b) { return (a.gi || 0) - (b.gi || 0); }).map(function (x) { return x.key; }), left = ks.slice(), set = {};
      ks.forEach(function (k) { set[k] = 1; });
      var out = all.map(function (k) { return set[k] ? left.shift() : k; });
      out.forEach(function (k, i) { var m = filmOf(k); if (m) m.gi = i; });
      bibGroups(data.films); // les autres films du lot prennent le nouvel ordre tout de suite
      grpPend = out; soon("grpord", function () {
        var o = grpPend; grpPend = null; if (!o || !canWeb) return;
        return commit([{ path: BIB_LIB, edit: function (t) { var l = t ? JSON.parse(t) : { items: [] }; (l.items || []).forEach(function (x) { var i = o.indexOf(x.key); if (i > -1) x.gi = i; }); return json(l); } }], "Video club : ordre des vidéos d'un même import (admin, " + (user && user.login || "") + ")");
      }, 800);
    }
    var grpPend = null;
    function localFilm(it) {
      var f = Object.assign({ slate: null, title: "", dir: "", prod: "", dops: [], cats: [], types: [], video: "", full: "", img: "", images: null, pages: [], at: "" }, JSON.parse(JSON.stringify(it)));
      f.dops = f.dops || []; f.cats = f.cats || []; f.types = f.types || []; bibHay(f); return f;
    }
    function libSave(items, msgEl) {
      return commit([{ path: BIB_LIB, edit: function (t) {
        var l = t ? JSON.parse(t) : { items: [] }; l.items = l.items || [];
        items.forEach(function (it) { var c = Object.assign({}, it); delete c._files; l.items = l.items.filter(function (x) { return x.key !== c.key; }); l.items.push(c); });
        return json(l);
      } }].concat(items.reduce(function (a, it) { return a.concat(it._files || []); }, [])), "Video club : " + items.length + " ajout" + (items.length > 1 ? "s" : "") + " (admin, " + (user && user.login || "") + ")");
    }
    // Bundle Slate → bundle du video club (Gus 26/11) : les films entrent dans le video club (comme un import ordinaire), puis une bande par onglet
    // du bundle Slate, et un bundle qui les regroupe (même lien de partage que les autres bundles). Plus rien ne dépend de Slate ensuite.
    function clubBundle(d, items) {
      var groups = [], byCat = {};
      (d.clips || []).forEach(function (c) {
        var f = filmOf(c.slate ? "s" + c.slate : "u" + (c.full || c.video || c.img)); if (!f) return;
        var name = String(c.cat || "").trim() || "Films"; if (!byCat[name]) { byCat[name] = { name: name, items: [] }; groups.push(byCat[name]); }
        if (!byCat[name].items.some(function (x) { return x.key === f.key; })) byCat[name].items.push(bandItem(f));
      });
      if (!groups.length) return Promise.reject(new Error("aucun film dans ce bundle"));
      if (save.busy || save.state === "wait") { unsoon("band"); saveBand(); }
      var codes = [], chain = Promise.resolve();
      groups.forEach(function (g) {
        chain = chain.then(function () {
          var b = bandNew(); b.title = g.name === g.name.toUpperCase() ? g.name.charAt(0) + g.name.slice(1).toLowerCase() : g.name; // « COMMERCIAL » → « Commercial »
          b.items = g.items; return Promise.resolve(saveBand(b)).then(function () { codes.push(b.code); });
        });
      });
      return chain.then(function () {
        bun = { code: null, title: d.name || "Bundle Slate", description: "", bands: codes }; return bunSave();
      }).then(function () { return { bands: codes.length, films: groups.reduce(function (a, g) { return a + g.items.length; }, 0), code: bun.code }; });
    }
    function importVideo() {
      var link = el("input", { type: "text", placeholder: "Lien Slate : bundle, shots.re, page d'une vidéo ou de stills" }), out = el("p", { class: "hint" });
      var bd = null, asBundle = false;
      var goB = el("button", { type: "button", class: "btn ghost", text: "Bundle Slate → bundle video club", title: "Lit le bundle, ajoute ses films au video club, crée une bande par onglet et un bundle qui les regroupe", on: { click: function () { asBundle = true; go.click(); } } });
      var go = el("button", { type: "button", class: "btn primary", text: "Lire le lien", on: { click: function () {
        var wantB = asBundle; asBundle = false; bd = null;
        if (!canWeb) { out.textContent = "Lecture seule : cette clé ne peut pas ajouter au video club."; return; }
        var v = link.value.trim(); if (!v) return; go.disabled = true; out.textContent = "Lecture sur Slate" + slateWait("…");
        if (ourCode(v)) { // lien de nos bandes / d'un film partagé : ces films sont déjà dans le video club
          ourLinkFilms(v).then(function (l) { go.disabled = false; var f = l.length === 1 && filmOf(l[0].key); if (f) { mo.remove(); libEdit(f); } else out.textContent = "Ces films sont déjà dans le video club" + (l.length > 1 ? " (" + l.length + " films)" : "") + " : cherche-les dans la liste."; },
            function (e) { go.disabled = false; out.textContent = e.message; });
          return;
        }
        var isBundle = /\/bundles\//.test(v) || /^(https?:\/\/)?(shots|slt)\.re\//i.test(v);
        (isBundle ? importBundle(v).then(function (d) { bd = d; return (d.clips || []).map(function (c) { return { slate: c.slate, title: c.title, sub: c.sub, video: c.video, full: c.full, img: c.img, cats: [c.cat].concat(c.types || []), dops: c.artists || (d.name ? [d.name] : []) }; }); })
          : importStills(v).then(function (d) { return [{ title: d.title, video: d.video, full: d.full, img: d.img || (d.stills && d.stills[0]), images: d.stills }]; }))
          .then(function (l) {
            var now = new Date().toISOString(), seen = {};
            var items = l.filter(function (c) { var k = c.slate ? "s" + c.slate : c.full || c.video || c.img; if (seen[k]) return false; seen[k] = 1; return true; }).map(function (c) {
              var s = String(c.sub || "").split("\n");
              var it = { key: c.slate ? "s" + c.slate : "u" + (c.full || c.video || c.img), slate: c.slate || null, title: c.title, dir: s[0] || "", prod: s[1] || "", dops: c.dops || [], cats: (c.cats || []).filter(Boolean),
                video: c.video, full: c.full, img: c.img, images: c.images, link: v, src: "slate", at: now, by: user && user.login || "" };
              Object.keys(it).forEach(function (k) { if (it[k] === undefined || it[k] === null || it[k] === "") delete it[k]; });
              return it;
            });
            out.textContent = items.length + " film" + (items.length > 1 ? "s" : "") + " lu" + (items.length > 1 ? "s" : "") + " : enregistrement…";
            return libSave(items).then(function () { out.textContent = items.length + " film" + (items.length > 1 ? "s" : "") + " ajouté" + (items.length > 1 ? "s" : "") + " au video club."; go.disabled = false; return bibLoad(true); }).then(function (d) {
              adopt(d); draw();
              // Un seul film : la fenêtre d'infos s'ouvre tout de suite (Gus 22/11 : même fenêtre qu'en cliquant sur un film).
              // Lien de partage créé tout de suite pour chaque film ajouté (Gus 23/11).
              var added = items.map(function (x) { return filmOf(x.key); }).filter(Boolean);
              shareCreate(added).catch(function () {}).then(function () {
                if (wantB && bd) { out.textContent = "Création des bandes et du bundle…"; return clubBundle(bd, items).then(function (r) { out.textContent = "Bundle video club créé : " + r.bands + " bande" + (r.bands > 1 ? "s" : "") + ", " + r.films + " film" + (r.films > 1 ? "s" : "") + " (voir « Bundles »). Plus rien ne dépend de Slate pour ce bundle."; }, function (e) { out.textContent = "Films ajoutés, mais bundle pas créé : " + e.message; }); }
                if (items.length === 1 && added[0]) { mo.remove(); libEdit(added[0]); }
              });
            });
          }).catch(function (e) { go.disabled = false; out.textContent = "Lecture impossible : " + (e.message || "Slate ne répond pas"); });
      } } });
      // Depuis l'ordinateur (Gus 26/11) : une ou plusieurs vidéos d'un même projet → fenêtre d'import (importFilms).
      var fin = el("input", { type: "file", accept: "video/*", multiple: true, hidden: true });
      fin.addEventListener("change", function () { var l = [].slice.call(fin.files); if (!l.length) return; mo.remove(); importFilms(l); });
      var finB = el("button", { type: "button", class: "btn primary bupbtn", text: "⤒ Choisir ou glisser une ou plusieurs vidéos", on: { click: function () { fin.click(); } } });
      ["dragenter", "dragover"].forEach(function (ev) { finB.addEventListener(ev, function (e) { e.preventDefault(); finB.classList.add("over"); }); });
      finB.addEventListener("dragleave", function () { finB.classList.remove("over"); });
      finB.addEventListener("drop", function (e) { e.preventDefault(); var l = [].filter.call(e.dataTransfer.files, function (x) { return /^video\//.test(x.type) || /\.(mov|mxf|mp4|m4v|avi|mkv)$/i.test(x.name); }); if (!l.length) return; mo.remove(); importFilms(l); });
      var chk = el("p", { class: "hint", text: "Plusieurs vidéos d'un même projet : elles gardent les crédits de la 1re (titre, vignette et extrait propres à chacune), et entrent une par une dans le video club. 10 Go au plus par vidéo." });
      var mo = modal("Ajouter une vidéo", [el("span", { class: "label", text: "Depuis Slate" }), el("div", { class: "row" }, [el("div", { class: "grow" }, [link]), go, goB]), out,
        el("span", { class: "label", text: "Depuis l'ordinateur" }), finB, fin, chk]);
    }
    // Fenêtre d'import de vidéos de l'ordinateur (Gus 26/11) : chaque vidéo entre tout de suite dans le video club (« Encodage en
    // cours… ») et la fenêtre d'infos du film s'ouvre (titre, crédits, vignette, extrait réglés sur la vidéo de l'ordinateur pendant
    // l'envoi), avec en haut un onglet par vidéo et l'avancement : envoi (ici), puis encodage (robot, `progress`). Les vidéos sont
    // envoyées l'une après l'autre ; à la fin de l'encodage, le film reçoit sa version web ; une vignette / un extrait choisis à la main
    // sont gardés (l'extrait léger est alors refait par le robot). Garder l'onglet ouvert pendant l'envoi (l'encodage, lui, continue seul).
    function importFilms(fl) {
      if (!canWeb) { alert("Lecture seule : cette clé ne peut pas ajouter au video club."); return; }
      var big = fl.filter(function (f) { return f.size > 10e9; }); fl = fl.filter(function (f) { return f.size <= 10e9; });
      if (big.length) alert("Plus de 10 Go, pas envoyé : " + big.map(function (f) { return f.name; }).join(", "));
      if (!fl.length) return;
      var now = new Date().toISOString(), by = user && user.login || "", cur = 0;
      var grp = fl.length > 1 ? "g" + Date.now().toString(36) : null; // vidéos importées ensemble = liées
      var g = fl.map(function (file, k) {
        var id = encId(), path = "data/encode/film-" + Date.now() + "-" + k + Math.random().toString(36).slice(2, 6) + ".json";
        var title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Vidéo";
        return { file: file, id: id, path: path, local: URL.createObjectURL(file), up: 0, step: "attente",
          it: { key: "e" + id, kind: "video", title: title, dops: [], cats: [], src: "upload", grp: grp || undefined, gi: grp ? k : undefined, enc: { path: path, id: id, sending: true }, size: file.size, at: now, by: by } };
      });
      var hd = el("div", { class: "bimphead" }), tabs = el("div", { class: "btabs bimptabs" }), stat = el("p", { class: "bimpstat" }), bar = el("progress", { max: 1, value: 0, class: "bupprog" });
      hd.appendChild(tabs); hd.appendChild(stat); hd.appendChild(bar);
      var STEP = { attente: "en attente d'envoi", envoi: "envoi", demande: "demande au robot", file: "en attente du robot", lecture: "le robot lit la vidéo", web: "encodage de la version web",
        extrait: "fabrication de l'extrait", vignette: "fabrication de la vignette", fini: "prête", erreur: "erreur" };
      function label(x) { var f = filmOf(x.it.key); return (f && f.title) || x.it.title; }
      // État d'une vidéo en 3 temps : Envoi → Encodage → Prête (pastilles colorées), + message, + bandeau vert quand c'est fini.
      var PH = ["Envoi", "Encodage", "Prête"], steps = el("div", { class: "bsteps" }), banner = el("p", { class: "bbanner", hidden: true });
      hd.insertBefore(steps, stat); hd.appendChild(banner);
      function phase(x) { return x.step === "fini" ? 3 : x.step === "erreur" ? (x.up >= 1 ? 1 : 0) : (x.step === "attente" || x.step === "envoi" || x.step === "demande") ? 0 : 1; }
      function icon(x) { return x.step === "fini" ? "✓" : x.step === "erreur" ? "!" : x.step === "attente" ? "…" : phase(x) === 0 ? "↑" : "⟳"; }
      function paint() {
        if (!hd.isConnected && g.every(function (x) { return x.step === "fini" || x.step === "erreur"; })) return;
        tabs.textContent = "";
        if (g.length > 1) g.forEach(function (x, k) { tabs.appendChild(el("button", { type: "button", class: (k === cur ? "on " : "") + "bst-" + (x.step === "fini" ? "ok" : x.step === "erreur" ? "err" : "run"), on: { click: function () { openTab(k); } } }, [icon(x) + " " + label(x), el("small", { text: " · " + pct(x) })])); });
        var x = g[cur], ph = phase(x), bad = x.step === "erreur";
        steps.textContent = ""; PH.forEach(function (n, i) { steps.appendChild(el("span", { class: "bstep " + (bad && i === ph ? "err" : i < ph || ph === 3 ? "done" : i === ph ? "on" : "") , text: (i < ph || ph === 3 ? "✓ " : bad && i === ph ? "! " : "") + n })); });
        stat.className = "bimpstat" + (bad ? " berr" : x.step === "fini" ? " bok" : "");
        stat.textContent = (g.length > 1 ? "Vidéo " + (cur + 1) + " / " + g.length + " : " : "") + STEP[x.step] + (x.step === "envoi" || x.step === "web" ? " " + pct(x) : "") + (x.err ? " (" + x.err + ")" : "")
          + (x.step === "envoi" || x.step === "attente" ? " · garde cette page ouverte" : x.step !== "fini" && x.step !== "erreur" ? " · tu peux fermer la fenêtre, le robot continue (quelques minutes)" : "");
        bar.value = x.step === "envoi" ? x.up : x.step === "web" ? x.pct / 100 : x.step === "fini" ? 1 : 0; bar.hidden = x.step === "fini";
        if (x.step !== "envoi" && x.step !== "web" && x.step !== "fini") bar.removeAttribute("value"); else bar.value = x.step === "envoi" ? x.up : x.step === "web" ? x.pct / 100 : 1; // barre « en attente » animée
        var left = g.filter(function (y) { return y.step !== "fini" && y.step !== "erreur"; }).length;
        banner.hidden = x.step !== "fini" && !(g.length > 1 && !left);
        banner.textContent = g.length > 1 && !left ? "✓ Les " + g.length + " vidéos sont prêtes dans le video club." : "✓ Vidéo prête : version web, vignette et extrait sont dans le video club.";
      }
      function pct(x) { return x.step === "envoi" ? Math.floor(x.up * 100) + " %" : x.step === "web" ? (x.pct || 0) + " %" : x.step === "fini" ? "✓" : x.step === "erreur" ? "!" : "…"; }
      var tick = setInterval(function () { paint(); if (!hd.isConnected && g.every(function (x) { return x.step === "fini" || x.step === "erreur"; })) clearInterval(tick); }, 1000);
      function credits() { var f = filmOf(g[0].it.key) || {}; var c = {}; ["dir", "prod", "dops", "roles", "types"].forEach(function (k) { if (f[k] !== undefined) c[k] = f[k]; }); return c; }
      function openTab(k) {
        var m = hd.closest(".bmodal"); if (m) m.dispatchEvent(new MouseEvent("click", { bubbles: true })); // ferme (et enregistre) la vidéo affichée
        cur = k; paint();
        setTimeout(function () { var f = filmOf(g[k].it.key); if (f) libEdit(f, { local: g[k].step === "fini" ? null : g[k].local, head: hd, credits: k ? credits() : null }); }, m ? 200 : 0);
      }
      function finish(x, jobs) { // encodage fini : le film reçoit sa version web (encCheck) ; vignette / extrait choisis à la main gardés
        var j = (jobs || []).filter(function (y) { return y.id === x.id; })[0] || {};
        if (!j.answer) { x.step = "erreur"; x.err = j.error || "pas de réponse"; paint(); return; }
        x.step = "fini"; paint();
        encCheck().then(function () {
          var f = filmOf(x.it.key); if (!f) return;
          if (f.snip && f.full && !f.snipVideo && (!f.snip.v || f.snip.vf !== f.full)) { // extrait choisi pendant l'envoi : extrait léger refait
            var sid = encId(), sn = { s: f.snip.s, d: f.snip.d, parts: f.snip.parts };
            encAsk("rapide", [{ id: sid, kind: "snip", src: f.full, s: sn.s, d: sn.d, parts: sn.parts }]).then(function (p) { return encWait(p, 5000, 600000); }).then(function (js) {
              var a = (js[0] || {}).answer; if (a) libPatch(filmOf(x.it.key), { snip: Object.assign({ s: sn.s, d: sn.d, v: a.video, vf: f.full }, sn.parts ? { parts: sn.parts } : {}) });
            }).catch(function () {});
          }
          var ready = g.filter(function (y) { return y.step === "fini"; });
          var m = hd.closest(".bmodal"); if (m && (g[cur] === x || ready.length > 1)) openTab(cur); // fenêtre ouverte : rouverte (version web, lignes sous le film)
        });
      }
      function watch(x) {
        encWait(x.path, 8000, 6 * 3600000, function (d) { var j = (d.jobs || [])[0] || {}; if (j.progress) { x.step = j.progress.step; x.pct = j.progress.pct; } else if (d.startedAt) x.step = "lecture"; paint(); })
          .then(function (jobs) { finish(x, jobs); }, function (e) { x.step = "erreur"; x.err = e.message; paint(); });
      }
      function next(k) {
        if (k >= g.length) return; var x = g[k]; x.step = "envoi"; paint();
        upload(x.file, function (p) { x.up = p; }).then(function (key) {
          x.step = "demande"; paint();
          return savedLib.then(function () { return commit([{ path: x.path, text: json({ jobs: [{ id: x.id, kind: "film", key: key }], at: new Date().toISOString(), by: by }) },
            { path: BIB_LIB, edit: function (t) { var L = t ? JSON.parse(t) : { items: [] }; (L.items || []).forEach(function (y) { if (y.key === x.it.key) { y.mkey = key; if (y.enc) delete y.enc.sending; } }); return json(L); } }],
            "Encodage : demande (admin, " + by + ")"); });
        }).then(function () { x.step = "file"; paint(); watch(x); }, function (e) { x.step = "erreur"; x.err = "envoi interrompu : " + e.message + " (rechoisis le même fichier pour reprendre)"; paint(); })
          .then(function () { next(k + 1); });
      }
      // Fenêtre d'infos tout de suite (films locaux), enregistrement dans le video club en arrière-plan ; la demande d'encodage attend cet enregistrement.
      g.forEach(function (x) { data.films.unshift(localFilm(x.it)); }); draw();
      var savedLib = libSave(g.map(function (x) { return x.it; }));
      savedLib.then(function () { return bibLoad(true); }).then(function (d) { adopt(d); draw(); }, function () {});
      savedLib.catch(function (e) { alert("Pas enregistré : " + e.message); });
      openTab(0); next(0);
    }
    // Suite d'images (Gus 22/11) : on choisit les images, elles sont enregistrées, puis la même fenêtre d'infos s'ouvre (titre,
    // crédits, vignette…). Images réduites dans le navigateur (WebP) → data/bibli/img/<id>/.
    function importImages() {
      var fin = el("input", { type: "file", accept: "image/*", multiple: true }), grid = el("div", { class: "bimggrid" }), out = el("p", { class: "hint" }), bar = el("progress", { max: 1, value: 0, class: "bupprog", hidden: true }), files = [], names = [];
      fin.addEventListener("change", function () {
        var l = Array.from(fin.files).sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
        names = l.map(function (f) { return f.name; }); files = []; grid.textContent = ""; go.disabled = true;
        out.className = "hint bwait"; bar.hidden = false; bar.max = l.length; bar.value = 0;
        out.textContent = "Préparation des images : 0 / " + l.length + "…";
        l.reduce(function (p, f) { return p.then(function () { return compress(f).then(function (c) { files.push(c); grid.appendChild(el("img", { src: c.preview })); bar.value = files.length; out.textContent = "Préparation des images : " + files.length + " / " + l.length + "…"; }); }); }, Promise.resolve())
          .then(function () { bar.hidden = true; out.className = "hint bok"; out.textContent = "✓ " + files.length + " images prêtes (" + Math.round(files.reduce(function (a, c) { return a + c.size; }, 0) / 1e6) + " Mo) · glisse-les pour changer l'ordre après « Continuer »."; go.disabled = false; }, function (e) { bar.hidden = true; out.className = "hint berr"; out.textContent = e.message; });
      });
      var go = el("button", { type: "button", class: "btn primary", text: "Continuer", disabled: true, on: { click: function () {
        if (!canWeb) { out.textContent = "Lecture seule : cette clé ne peut pas ajouter au video club."; return; }
        if (!files.length) return;
        go.disabled = true; out.className = "hint bwait"; out.textContent = "Envoi des images chez Amazon…"; bar.hidden = false; bar.max = files.length; bar.value = 0;
        var id = Date.now().toString(36), dir = imgDir(), urls = files.map(function (c, i) { return imgPut(String(i + 1).padStart(3, "0") + ".webp", c.base64, c.preview, dir); });
        var tickI = setInterval(function () { var left = Math.min(files.length, imgUps.length); bar.value = files.length - left; out.textContent = "Envoi des images chez Amazon : " + (files.length - left) + " / " + files.length + "…"; }, 400);
        var guess = String(names[0] || "").replace(/\.[a-z0-9]+$/i, "").replace(/[\s_.-]*\d+$/, "").replace(/[_]+/g, " ").trim() || "Images";
        var it = { key: "i" + id, kind: "images", title: guess, dops: [], cats: ["Stills"], images: urls, img: urls[0], src: "upload", at: new Date().toISOString(), by: user && user.login || "" };
        // Fenêtre des crédits tout de suite (Gus 26/11) : le film existe déjà en local, l'envoi et l'enregistrement continuent derrière ;
        // un bandeau en haut de la fenêtre montre l'avancement.
        var f0 = localFilm(it); data.films.unshift(f0); draw();
        var hd = el("div", { class: "bimphead" }), hs = el("p", { class: "bimpstat bwait" }), hb = el("progress", { max: files.length, value: 0, class: "bupprog" }), hbn = el("p", { class: "bbanner", hidden: true });
        hd.appendChild(hs); hd.appendChild(hb); hd.appendChild(hbn);
        var finished = false, tickH = setInterval(function () {
          if (finished) return; var left = Math.min(files.length, imgUps.length); hb.value = files.length - left;
          hs.textContent = "↑ Envoi des images : " + (files.length - left) + " / " + files.length + " · tu peux déjà remplir les crédits, garde cette page ouverte";
        }, 300);
        clearInterval(tickI); mo.remove(); libEdit(f0, { head: hd });
        libSave([it]).then(function () { delete it._files; return imgWait(); }).then(function () { return bibLoad(true); }).then(function (d) {
          adopt(d); draw(); var f = filmOf(it.key);
          return shareCreate(f ? [f] : []).catch(function () {});
        }).then(function () {
          finished = true; clearInterval(tickH); hb.hidden = true; hs.hidden = true; hbn.hidden = false; hbn.textContent = "✓ " + files.length + " images envoyées et enregistrées dans le video club.";
        }, function (e) { finished = true; clearInterval(tickH); hb.hidden = true; hs.className = "bimpstat berr"; hs.textContent = "Pas enregistré : " + e.message; });
      } } });
      var mo = modal("Ajouter une suite d'images", [el("span", { class: "label", text: "Images (dans l'ordre des noms de fichiers) ; titre, crédits et vignette juste après" }), fin, grid, bar, out, el("div", { class: "fwbtns" }, [go])]);
    }
    undoReset(); drawBand();
  }
