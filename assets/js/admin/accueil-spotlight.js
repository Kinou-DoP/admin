// Pages du site : accueil (home.json) et spotlight
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Accueil (data/home.json) ----------
  // Les 10 premiers films d'une bande Slate ; les chefs op crédités sont reliés à leur page par leur nom.
  // overrides (par id Slate) : textes et chefs op corrigés, réappliqués quand on rafraîchit la bande.
  var home = null;
  function importReel(link) {
    link = shortLink(link);
    return siteGet(SITE + "/api/reel?link=" + encodeURIComponent(link.trim()), "lecture de la bande impossible").catch(orRobot("reel", link.trim()));
  }
  function dpOf(name) {
    var k = slugify(name), e = index.dps.filter(function (d) { return slugify(d.name) === k; })[0];
    return e ? { name: e.name, slug: e.slug } : { name: name, slug: "" };
  }
  // Film du video club → film de spotlight / fiction (même forme que ce qu'écrivait le robot depuis la bande Slate).
  function pageFilm(f) {
    var o = { slate: f.slate, title: f.title || "" }, sub = [f.dir, f.prod].filter(Boolean).join("\n");
    if (sub) o.sub = sub; if (f.video) o.video = f.video; if (f.full) o.full = f.full; if (f.img) o.img = f.img;
    o.cats = (f.types || []).slice(); o.artists = (f.dops || []).slice();
    if (f.images && f.images.length && !f.video && !f.full) o.images = f.images.slice();
    return o;
  }
  function pageSel(title, list, set, publishFn, renderFn, top) { // « Modifier la sélection » d'une page à liste unique (Gus 26/11)
    selEditor(null, { title: title, tab: title.toUpperCase(), items: list, top: !!top, apply: function (ids, film) {
      set(ids.map(function (id) { var o = list.filter(function (x) { return x.slate === id; })[0]; return o || film(id); }));
      dirty = true; renderFn(); publishFn();
    } });
  }
  function slideOf(f) {
    var src = { film: f.film, song: f.song, legend: f.legend, dps: f.artists.map(dpOf) };
    var sl = { slate: f.slate, video: f.video, img: f.img, src: src };
    // Film complet (lecteur de l'accueil) ; s'il manque à la lecture de la bande, on garde celui déjà enregistré.
    var prev = (home.slides || []).filter(function (x) { return x.slate === f.slate; })[0];
    if (f.full) sl.full = f.full; else if (prev && prev.full) sl.full = prev.full;
    var o = home.overrides[f.slate] || {};
    ["film", "song", "legend", "dps", "zoom", "zoomPos", "phoneX", "phoneZoom", "start", "parts", "stills", "stillsLink", "extras"].forEach(function (k) { sl[k] = o[k] !== undefined ? o[k] : src[k]; });
    return sl;
  }
  function showHome() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([index ? index : loadIndex(), readFile("data/home.json")]).then(function (r) {
      home = r[1] || { duration: 7000, slides: [] };
      home.overrides = home.overrides || {}; dirty = false; histReset();
      renderHome();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  function renderHome() {
    view.textContent = ""; editing = true; pagePublish = publishHome;
    histInit({ get: function () { return { data: home }; }, set: function (h) { home = JSON.parse(h.data); renderHome(); } });
    view.appendChild(el("h1", { text: "Page d'accueil" }));
    view.appendChild(el("button", { type: "button", class: "btn primary selbtn", text: "Modifier la sélection", on: { click: function () {
      pageSel("Accueil", (home.slides || []).map(function (sl) { return Object.assign({ title: sl.film }, sl); }), function (l) {
        home.slides = l.map(function (x) {
          if (x.src) { var y = Object.assign({}, x); delete y.title; delete y.cat; return y; }
          var dps = (x.dops || []).map(dpOf), src = { film: x.title || "", song: "", legend: "", dps: dps };
          var sl = { slate: x.slate, video: x.video, img: x.img, src: src, film: src.film, song: "", legend: "", dps: dps }; if (x.full) sl.full = x.full; return sl;
        });
        delete home.reel;
      }, publishHome, renderHome);
    } } }));
    view.appendChild(el("p", { class: "lead", text: "Les 10 premiers films d'une bande Slate défilent sur l'accueil, dans l'ordre de la bande." }));
    var input = el("input", { type: "url", class: "nodirty", placeholder: "Lien de la bande Slate (kinou.slateapp.com/… ou shots.re/…)", value: home.reel || "" });
    var imp = el("button", { class: "btn primary", text: home.reel ? "Rafraîchir" : "Importer" }), st = el("p", { class: "hint" });
    function load() {
      if (!input.value.trim()) return;
      imp.disabled = true; st.textContent = "Lecture de la bande" + slateWait("…");
      importReel(input.value).then(function (d) {
        st.textContent = "Lecture des liens ajoutés sous les films" + slateWait("…");
        return relinkAll(Object.keys(home.overrides).map(function (k) { return home.overrides[k]; })).then(function (rl) { return [d, rl]; });
      }).then(function (r) {
        var d = r[0];
        home.reel = d.link; home.slides = d.films.map(slideOf);
        var lost = []; home.slides.forEach(function (sl) { sl.dps.forEach(function (x) { if (!x.slug) lost.push(x.name); }); });
        dirty = true; renderHome(); histCommit();
        status(d.films.length + " films importés." + relinkMsg(r[1]) + (lost.length ? " Pas de page pour : " + lost.join(", ") + " (nom sans lien)." : "") + " Publiez pour mettre l'accueil à jour.", "warn");
      }, function (e) { imp.disabled = false; st.textContent = e.message; });
    }
    imp.addEventListener("click", load);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") load(); });
    input.addEventListener("input", function () { imp.textContent = input.value.trim() === home.reel ? "Rafraîchir" : "Importer"; });
    view.appendChild(el("section", {}, [el("h2", { text: "Bande Slate" }),
      el("div", { class: "row" }, [el("div", { class: "grow" }, [input]), imp]), st,
      el("p", { class: "hint", text: "« Rafraîchir » relit la bande (ordre, films) en gardant vos corrections." })]));
    var sec = el("section", {}, [el("h2", { text: "Films de l'accueil" })]), grid = el("div", { class: "films" });
    if (!home.slides.length) sec.appendChild(el("p", { class: "empty", text: "Importez une bande Slate." }));
    else if (!home.reel) sec.appendChild(el("p", { class: "hint", text: "Accueil actuel (saisi à la main) : importez une bande Slate pour le remplacer." }));
    home.slides.forEach(function (sl) { grid.appendChild(slideCard(sl)); });
    sec.appendChild(grid); view.appendChild(sec);
    bar.hidden = false; seeLink.href = SITE_VIEW + "/"; seeLink.hidden = false;
    if (dirty) touch(); else status(flash || "", flash ? "ok" : ""); flash = "";
  }
  // Extrait HD de l'accueil : passage du film complet (1080p) choisi ici, à la place de l'extrait Slate (plus compressé).
  // Durée = celle d'un projet sur l'accueil ; on choisit le début (« start », en secondes, dans les overrides de la slide).
  function hdCtl(sl, setO, D) {
    var btn = el("button", { type: "button", class: "pbtn", text: "Extrait HD" });
    var wrap = el("div", { class: "pctl" }, [btn]);
    if (!sl.full) {
      btn.disabled = true;
      wrap.appendChild(el("p", { class: "hint", text: "Film complet pas encore connu : publiez, il est ajouté en une minute environ, puis rechargez la page." }));
      return wrap;
    }
    var box = el("div", { class: "pframe hd" }); box.hidden = true;
    var stage = el("div", { class: "pstage" }), v = null;
    var range = el("input", { type: "range", min: "0", max: "0", step: "0.1", class: "nodirty", value: String(sl.start || 0) });
    var lab = el("span", { class: "zval" });
    var back = el("button", { type: "button", class: "zcenter", text: "Revenir à l'extrait Slate" });
    var t = fmtT, scrub = false, want = null;
    // Montage de l'extrait (Gus 27/11) : plusieurs blocs de la vidéo, durée EXACTE d'un projet, cadrage téléphone propre à chaque bloc (sl.parts = [{ s, d, x }]).
    var mont = el("button", { type: "button", class: "btn primary montbtn" });
    mont.addEventListener("click", function () { mont.disabled = true; var old = mont.textContent; mont.textContent = "Chargement de la vidéo…"; homeMontage(sl, setO, D, function () { mont.disabled = false; mont.textContent = old; label(); }, function () { if (v) v.pause(); }); });
    function label() {
      var np = sl.parts && sl.parts.length > 1 ? sl.parts.length : 0;
      lab.textContent = np ? "Montage de " + np + " blocs" : sl.start !== undefined ? t(sl.start) + " → " + t(sl.start + D) : "Extrait Slate";
      back.hidden = sl.start === undefined;
      btn.textContent = np ? "Extrait HD : montage de " + np + " blocs" : sl.start !== undefined ? "Extrait HD : " + t(sl.start) + " → " + t(sl.start + D) : "Extrait HD";
      mont.textContent = np ? "✂ Modifier le montage (" + np + " blocs, " + String(D).replace(".", ",") + " s)" : "✂ Montage de l'extrait (plusieurs blocs, " + String(D).replace(".", ",") + " s pile)";
    }
    function close() { box.hidden = true; if (v) { v.remove(); v = null; } }
    btn.addEventListener("click", function () {
      if (!box.hidden) { close(); return; }
      if (zoomStopOther && zoomStopOther !== close) zoomStopOther();
      zoomStopOther = close;
      box.hidden = false;
      v = el("video", { muted: true, playsinline: true, autoplay: true, poster: sl.img, preload: "auto", src: sl.full + "#t=" + (sl.start || 0) }); v.muted = true;
      v.addEventListener("loadedmetadata", function () { range.max = String(Math.max(0, Math.floor((v.duration - D) * 10) / 10)); range.value = String(sl.start || 0); });
      // Le passage choisi tourne en boucle, comme il sera lu sur l'accueil (le temps d'un projet).
      v.addEventListener("timeupdate", function () { if (scrub) return; var a = sl.start || 0; if (v.currentTime >= a + D || v.currentTime < a - .5) v.currentTime = a; });
      // Une image à la fois pendant qu'on déplace le curseur : la suivante quand la précédente est affichée.
      v.addEventListener("seeked", function () { if (want !== null && Math.abs(v.currentTime - want) > .05) v.currentTime = want; want = null; });
      stage.appendChild(v);
    });
    // Pendant qu'on déplace le curseur : la vidéo est en pause sur l'image choisie ; au lâcher, le passage est lu.
    function seek(a) { if (!v) return; if (v.seeking) want = a; else v.currentTime = a; }
    function hold() { if (scrub || !v) return; scrub = true; v.pause(); }
    function release() {
      if (!scrub) return; scrub = false; want = null;
      if (v) { v.currentTime = sl.start || 0; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
    }
    range.addEventListener("pointerdown", hold);
    range.addEventListener("input", function () {
      var a = Math.round(parseFloat(range.value) * 10) / 10;
      hold(); setO("start", a); if (sl.parts) setO("parts", undefined); label(); touch(); seek(a);
    });
    range.addEventListener("change", release);
    range.addEventListener("pointerup", release);
    range.addEventListener("pointercancel", release);
    back.addEventListener("click", function () { setO("start", undefined); setO("parts", undefined); label(); touch(); if (v) v.currentTime = 0; });
    box.appendChild(mont);
    box.appendChild(el("p", { class: "hint", text: "Ou, plus simple pour un seul passage : choisissez le début : le passage de " + String(D).replace(".", ",") + " s qui suit est lu sur l'accueil, en qualité du film complet, sans le son." }));
    box.appendChild(stage);
    box.appendChild(el("div", { class: "zoom" }, [lab, range]));
    box.appendChild(back);
    label();
    wrap.appendChild(box);
    wrap._open = function () { if (box.hidden) btn.click(); };
    return wrap;
  }
  // Montage de l'extrait de l'accueil (Gus 27/11) : fenêtre `montageWin` en mode « home » ; ouverte directement par « Éditer la vidéo » (le recadrage et le cadrage
  // téléphone se règlent dedans). done() : à la fermeture (enregistré ou non) ; before() : juste avant l'ouverture.
  function homeMontage(sl, setO, D, done, before) {
    var tv = el("video", { preload: "metadata", muted: true });
    tv.addEventListener("loadedmetadata", function () {
      var dur = tv.duration || 0; tv.removeAttribute("src"); if (!dur) { alert("Durée de la vidéo illisible."); done(); return; }
      if (before) before();
      var parts0 = sl.parts && sl.parts.length ? sl.parts : [{ s: Math.min(sl.start || 0, Math.max(0, dur - D)), d: Math.min(D, dur), x: sl.phoneX }];
      montageWin([{ key: "home" + sl.slate, title: sl.film || "Film", full: sl.full, dur: dur }], { mode: "home", exact: D, parts: parts0, phoneX: sl.phoneX, zoom: sl.zoom, phoneZoom: sl.phoneZoom, zoomPos: sl.zoomPos, name: sl.film, onClose: done,
        onSave: function (parts, zz) {
          if (zz) { setO("zoom", zz.zoom > 1 ? Math.round(zz.zoom * 100) / 100 : undefined); setO("phoneZoom", zz.phoneZoom === undefined ? undefined : Math.round(zz.phoneZoom * 100) / 100);
            if (zz.zoomPos) setO("zoomPos", zz.zoomPos[0] === 50 && zz.zoomPos[1] === 50 ? undefined : zz.zoomPos[0] + "% " + zz.zoomPos[1] + "%"); }
          setO("parts", parts.length > 1 ? parts : undefined); setO("start", parts[0].s); if (parts.length === 1) setO("phoneX", parts[0].x === 50 ? undefined : parts[0].x); touch(); } });
    });
    tv.addEventListener("error", function () { alert("La vidéo ne se lit pas : montage impossible."); done(); });
    tv.src = sl.full;
  }
  function fmtT(x) { var m = Math.floor(x / 60), s = (x - m * 60).toFixed(1); return m + ":" + (s < 10 ? "0" : "") + s.replace(".", ","); }

  // Éditeur en grand d'une vidéo de l'accueil (bouton « Éditer la vidéo ») : extrait HD, recadrage ordinateur, téléphone,
  // un onglet à la fois (une seule vidéo joue). Fermeture : « Terminé », Échap ou clic hors du cadre.
  function videoEditor(sl, setO, D, media, onClose) {
    var big = el("div", { class: "thumb" });
    if (sl.img) big.style.backgroundImage = 'url("' + sl.img + '")';
    var zc = zoomCtl(big, media, function () { return sl.zoom; }, function (z) { setO("zoom", z); },
      function () { return sl.zoomPos; }, function (p) { setO("zoomPos", p); });
    var hd = hdCtl(sl, setO, D);
    var ph = phoneCtl({
      label: "Cadrage téléphone", poster: sl.img, media: media,
      hint: "Faites glisser la bande rouge : c'est la partie de la vidéo visible sur l'accueil en téléphone.",
      get: function (k) { return sl[k]; }, setX: function (v) { setO("phoneX", v); }
    });
    var panels = {
      hd: el("div", { class: "vpanel" }, [hd]),
      zoom: el("div", { class: "vpanel film" }, [el("p", { class: "hint", text: "Bougez le curseur, puis faites glisser le cadre rouge : c'est la partie gardée sur l'accueil (ordinateur). Cliquez à côté pour voir le résultat, sur l'image pour revenir au réglage." }), big, zc]),
      phone: el("div", { class: "vpanel" }, [ph])
    };
    var names = { hd: "Extrait HD", zoom: "Recadrage ordinateur", phone: "Téléphone" }, tabs = el("div", { class: "tabs" }), btns = {};
    function show(k) {
      if (zoomStopOther) zoomStopOther();
      Object.keys(panels).forEach(function (n) { panels[n].hidden = n !== k; btns[n].className = n === k ? "on" : ""; });
      if (k === "hd") hd._open(); else if (k === "phone") ph._open(); else zc._show();
    }
    Object.keys(panels).forEach(function (k) { btns[k] = el("button", { type: "button", text: names[k], on: { click: function () { show(k); } } }); tabs.appendChild(btns[k]); });
    var done = el("button", { type: "button", class: "btn primary", text: "Terminé" });
    var box = el("div", { class: "vbox" }, [el("div", { class: "vhead" }, [el("h2", { text: sl.film || "Vidéo" }), done]), tabs,
      panels.hd, panels.zoom, panels.phone]);
    var ov = el("div", { class: "vedit" }, [box]);
    function close() {
      if (zoomStopOther) zoomStopOther(); zoomStopOther = null;
      document.removeEventListener("keydown", key); ov.remove(); document.body.classList.remove("vedit-on"); onClose();
    }
    function key(e) { if (e.key === "Escape") close(); }
    done.addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", key);
    document.body.appendChild(ov); document.body.classList.add("vedit-on");
    show(sl.full ? "hd" : "zoom");
  }

  function slideCard(sl) {
    var card = el("div", { class: "film" }), thumb = el("div", { class: "thumb" });
    if (sl.img) thumb.style.backgroundImage = 'url("' + sl.img + '")';
    var editable = !!sl.src; // anciennes slides (saisies à la main) : lecture seule
    function setO(k, v) {
      var o = home.overrides[sl.slate] || {};
      sl[k] = v;
      if (JSON.stringify(v) === JSON.stringify(sl.src[k])) delete o[k]; else o[k] = v;
      if (Object.keys(o).length) home.overrides[sl.slate] = o; else delete home.overrides[sl.slate];
      reset.hidden = !home.overrides[sl.slate];
    }
    var film = el("input", { type: "text", value: sl.film || "", placeholder: "Titre" });
    var song = el("input", { type: "text", class: "song", value: sl.song || "", placeholder: "Sous-titre (morceau, campagne…)" });
    var legend = el("textarea", { rows: 2, placeholder: "Réalisateur\nProduction" }); legend.value = sl.legend || "";
    var dps = el("div", { class: "dpsel" });
    var reset = el("button", { text: "Rétablir" });
    function drawDps() {
      dps.textContent = "";
      (sl.dps || [{ name: sl.dp, slug: sl.slug }]).forEach(function (d, k) {
        var sel = el("select", { disabled: !editable });
        sel.appendChild(el("option", { value: "", text: d.slug ? "— sans lien —" : d.name + " (pas de page)" }));
        index.dps.forEach(function (e) { var o = el("option", { value: e.slug, text: e.name }); if (e.slug === d.slug) o.selected = true; sel.appendChild(o); });
        if (!d.slug) sel.value = "";
        sel.addEventListener("change", function () {
          var list = sl.dps.slice(), e = index.dps.filter(function (x) { return x.slug === sel.value; })[0];
          list[k] = e ? { name: e.name, slug: e.slug } : { name: (sl.src.dps[k] || d).name, slug: "" };
          setO("dps", list); drawDps();
        });
        dps.appendChild(sel);
      });
    }
    drawDps();
    [film, song, legend].forEach(function (f) { f.disabled = !editable; });
    film.addEventListener("input", function () { setO("film", film.value); });
    song.addEventListener("input", function () { setO("song", song.value); });
    legend.addEventListener("input", function () { setO("legend", legend.value); });
    reset.hidden = !home.overrides[sl.slate];
    reset.addEventListener("click", function () {
      delete home.overrides[sl.slate];
      ["film", "song", "legend", "dps", "zoom", "zoomPos", "phoneX", "phoneZoom", "start", "parts", "stills", "stillsLink", "extras"].forEach(function (k) { sl[k] = sl.src[k]; });
      card.replaceWith(slideCard(sl)); touch();
    });
    card.appendChild(thumb);
    // Ce qui est lu sur l'accueil : le passage HD choisi (film complet, à partir de « start »), sinon l'extrait Slate.
    var D = (home.duration || 7000) / 1000;
    function media() { return sl.full && sl.start !== undefined ? { src: sl.full, start: sl.start, end: sl.start + D, parts: sl.parts && sl.parts.length > 1 ? sl.parts : undefined } : sl.video; }
    if (editable) {
      // Aperçu au survol : ce qui sera lu sur l'accueil (passage HD ou extrait Slate, recadré).
      var hv = null;
      var hstop = function () { if (hv) { hv.remove(); hv = null; } };
      thumb.addEventListener("mouseenter", function () {
        var m = media(); if (hv || !m) return;
        if (zoomStopOther && zoomStopOther !== hstop) zoomStopOther();
        zoomStopOther = hstop;
        hv = mkVid(m, sl.img);
        if (sl.zoom > 1) { hv.style.transform = "scale(" + sl.zoom + ")"; hv.style.transformOrigin = sl.zoomPos || "50% 50%"; }
        thumb.appendChild(hv);
      });
      thumb.addEventListener("mouseleave", hstop);
      var sum = [sl.start !== undefined ? "Extrait HD " + fmtT(sl.start) + " → " + fmtT(sl.start + D) : "Extrait Slate"];
      if (sl.zoom > 1) sum.push("recadrage " + Math.round(sl.zoom * 100) + " %");
      if (sl.phoneX !== undefined) sum.push("cadrage téléphone");
      var edit = el("button", { type: "button", class: "btn", text: "Éditer la vidéo" });
      edit.addEventListener("click", function () { hstop(); var again = function () { card.replaceWith(slideCard(sl)); }; if (sl.full) homeMontage(sl, setO, D, again); else videoEditor(sl, setO, D, media, again); }); // film complet connu : on arrive directement dans le montage
      card.appendChild(el("div", { class: "vsum" }, [edit, el("span", { class: "zval", text: sum.join(" · ") })]));
    }
    card.appendChild(film); card.appendChild(song); card.appendChild(legend); card.appendChild(dps);
    if (editable) card.appendChild(el("div", { class: "acts" }, [reset]));
    // Sous la vidéo dans le lecteur de l'accueil : stills et autres vidéos (sans rien ici : ceux de la fiche du chef op, s'il y en a).
    if (editable) card.appendChild(extrasCtl(function () { return sl; }, function (list) {
      setO("extras", list.length ? list : undefined); setO("stills"); setO("stillsLink");
    }, "Lien Slate de stills ou d'une vidéo, à afficher sous le film"));
    return card;
  }
  function publishHome() {
    publishBtn.disabled = true; status("Publication…");
    var out = { duration: home.duration || 7000 };
    if (home.reel) out.reel = home.reel;
    out.overrides = home.overrides;
    out.slides = home.slides;
    commit([{ path: "data/home.json", text: json(out) }], "Mise à jour de l'accueil (admin, " + user.login + ")").then(function (ref) {
      home = out; dirty = false; histReset(); flash = "Publié. L'accueil est à jour sur le site.";
      if (needsRobot(extrasLists(out.overrides, out.slides))) afterRobot("data/home.json", ref, "home", function (d) {
        if (home !== out) return;
        fullsFrom(out, d); if (!dirty && pagePublish === publishHome) renderHome();
        status("Le robot a ajouté les films complets : le site est à jour.", "ok");
      });
      renderHome();
      refreshSite("home").catch(function () {}); // vide le cache des données du site
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); })
      .then(function () { publishBtn.disabled = false; });
  }

  // ---------- Spotlight (data/spotlight.json) ----------
  // Une bande Slate de films de tous les chefs op. Les fonctions Netlify (figées) n'en lisent que 10 films, sans catégories :
  // c'est le robot GitHub qui lit toute la bande (films, catégories = types de contenu Slate, film complet, photos) à chaque
  // publication de spotlight.json. Ici : le lien de la bande, les onglets, et les mêmes réglages par film que sur une fiche
  // (la page réutilise filmsSection / filmCard : `state` = le spotlight, `slate` = ses films rangés par catégorie).
  var spot = null, SPOT_CATS = ["COMMERCIAL", "MUSIC VIDEO", "ART VIDEO"];
  function showSpot() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    readFile("data/spotlight.json").then(function (s) {
      spot = s || { reel: "", categories: SPOT_CATS.slice(), overrides: {}, films: [] };
      spot.overrides = spot.overrides || {}; spot.categories = spot.categories || SPOT_CATS.slice();
      dirty = false; histReset(); ovBase = sharedSnap(spot.overrides); curCat = null; renderSpot();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  function spotSlate() {
    var cats = spot.categories.map(function (c) { return String(c).trim().toUpperCase(); }).filter(Boolean), clips = [];
    (spot.films || []).forEach(function (f, i) {
      var fc = (f.cats || []).map(function (c) { c = String(c).trim().toUpperCase(); return c === "ART FILM" ? "ART VIDEO" : c; }); // « Art Film » sur Slate = ART VIDEO (comme sur le site)
      var mine = cats.filter(function (c) { return fc.indexOf(c) > -1; });
      (mine.length ? mine : [""]).forEach(function (c, k) {
        var e = Object.assign({}, f, { cat: c }); if (!k) { e.featured = true; e.featuredOrder = i + 1; }
        clips.push(e);
      });
    });
    return { name: "Spotlight", categories: cats, clips: clips };
  }
  function renderSpot() {
    view.textContent = ""; editing = true; pagePublish = publishSpot;
    state = spot; slate = spotSlate(); isNew = false; listed = true; // filmCard et setOverride travaillent sur state.overrides
    histInit({ get: function () { return { data: spot }; }, set: function (h) { spot = JSON.parse(h.data); renderSpot(); } });
    view.appendChild(el("h1", { text: "Spotlight" }));
    view.appendChild(el("button", { type: "button", class: "btn primary selbtn", text: "Modifier la sélection", on: { click: function () {
      pageSel("Spotlight", spot.films || [], function (l) { spot.films = l.map(function (f) { return f.cats ? f : pageFilm(f); }); delete spot.reel; delete spot.readError; }, publishSpot, renderSpot, true); // films ajoutés en haut (Gus 26/11)
    } } }));
    view.appendChild(el("p", { class: "lead", text: "Une bande Slate de films de tous les chefs op, sur la page Spotlight du site : onglet ALL (tous les films, dans l'ordre de la bande) puis un onglet par catégorie." }));
    // Bande Slate
    var input = el("input", { type: "url", class: "nodirty", placeholder: "Lien de la bande Slate (shots.re/… ou kinou.slateapp.com/…)", value: spot.reel || "https://shots.re/206850" });
    var st = el("p", { class: "hint" });
    var info = spot.readError ? "Dernière lecture impossible : " + spot.readError
      : spot.readAt ? (spot.films || []).length + " films, lus sur Slate le " + new Date(spot.readAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) + "."
      : "Pas encore lue : cliquez sur « Relire la bande ».";
    st.textContent = info;
    var imp = el("button", { class: "btn", text: "Relire la bande" });
    imp.addEventListener("click", function () {
      var v = shortLink(input.value);
      if (!v) { st.textContent = "Collez le lien de la bande."; return; }
      spot.reel = v; imp.disabled = true;
      var before = spot.readAt || "";
      st.textContent = "Publication du lien…";
      publishSpot(true).then(function () {
        st.textContent = "Le robot GitHub lit toute la bande sur Slate (environ 1 minute)…";
        var t0 = Date.now();
        (function poll() {
          readFile("data/spotlight.json").then(function (s) {
            if (s && s.readAt && s.readAt !== before) {
              if (dirty) { st.textContent = "Bande relue : publiez vos changements puis rechargez la page pour la voir."; imp.disabled = false; return; }
              spot = s; spot.overrides = spot.overrides || {}; histReset(); ovBase = sharedSnap(spot.overrides); renderSpot();
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
    // Onglets
    var catsIn = el("input", { type: "text", value: spot.categories.join(", ") });
    catsIn.addEventListener("input", function () {
      spot.categories = catsIn.value.split(",").map(function (c) { return c.trim().toUpperCase(); }).filter(Boolean);
    });
    catsIn.addEventListener("change", function () { curCat = null; slate = spotSlate(); var f = view.querySelector(".spotfilms"); if (f) f.replaceWith(spotFilms()); });
    view.appendChild(el("section", {}, [el("h2", { text: "Onglets" }), el("label", { class: "label", text: "Catégories, dans l'ordre (ALL est toujours le premier)" }), catsIn,
      el("p", { class: "hint", text: "Chaque film va dans les onglets dont le nom figure dans ses types de contenu sur Slate (ex. Commercial, Music Video, Art Video). Un film sans catégorie reconnue n'apparaît que dans ALL." })]));
    view.appendChild(spotFilms());
    bar.hidden = false;
    seeLink.href = SITE_VIEW + "/#spotlight"; seeLink.hidden = false;
    if (flash) status(flash, "ok"); else if (dirty) touch(); else status("");
    flash = "";
  }
  function spotFilms() {
    if (!(spot.films || []).length) return el("div", { class: "spotfilms" }, [el("section", {}, [el("h2", { text: "Films" }), el("p", { class: "empty", text: "Pas encore de films : relisez la bande." })])]);
    return el("div", { class: "spotfilms" }, [filmsSection()]);
  }
  // Publication : on repart du fichier en ligne (films lus par le robot entre-temps) et on n'y écrit que le lien, les onglets
  // et les corrections. justLink : publication lancée par « Relire la bande ».
  function publishSpot(justLink) {
    publishBtn.disabled = true; status("Publication…");
    return readFile("data/spotlight.json").then(function (remote) {
      var out = remote || {};
      sharedMerge(spot.overrides, out.overrides); awMerge(spot.overrides, out.overrides); // films reliés / prix changés ailleurs entre-temps
      out.reel = spot.reel; out.categories = spot.categories; out.overrides = spot.overrides;
      if (!spot.reel) { delete out.reel; delete out.readError; out.films = spot.films || []; } // sélection faite dans l'admin (sans Slate)
      // « Relire la bande » avec le même lien : sans ce changement le fichier serait identique, le commit vide
      // et le robot GitHub (lancé seulement quand data/spotlight.json change) ne relirait pas la bande.
      if (justLink === true) out.readAsk = new Date().toISOString();
      return commit([{ path: "data/spotlight.json", text: json(out) }], "Mise à jour du Spotlight (admin, " + user.login + ")").then(function (ref) { out._ref = ref; return out; });
    }).then(function (out) {
      var ref = out._ref; delete out._ref;
      out.overrides = spot.overrides; spot = out; dirty = false; histReset(); ovBase = sharedSnap(out.overrides);
      if (justLink !== true && needsRobot(extrasLists(out.overrides))) afterRobot("data/spotlight.json", ref, "spotlight", function (d) {
        if (spot !== out) return;
        fullsFrom(out, d); if (!dirty && pagePublish === publishSpot) renderSpot();
        status("Le robot a ajouté les films complets : le site est à jour.", "ok");
      });
      refreshSite("spotlight").catch(function () {});
      if (justLink !== true) { flash = spot.reel ? "Publié. Le robot relit la bande sur Slate (environ 1 minute)." : "Publié. Le site est à jour."; renderSpot(); }
      else status("Lien publié.", "ok");
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); throw e; })
      .then(function (r) { publishBtn.disabled = false; return r; }, function (e) { publishBtn.disabled = false; throw e; });
  }
