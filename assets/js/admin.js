// Admin kinou — édition des fiches des chefs op (data/dps/*.json) dans le repo GitHub Kinou-DoP/admin.
// Lecture et écriture via l'API GitHub (token personnel) ; import des bundles Slate via l'API du site.
(function () {
  var REPO = "Kinou-DoP/admin", BRANCH = "main";
  // Site qui héberge les fonctions Slate (/api/bundle, /api/refresh) et où l'on vérifie le résultat.
  var SITE = "https://beta--kinou-test.netlify.app";
  var TOKEN_KEY = "kinou-admin-token";
  // Sites dont on prépare les vignettes (service d'images Netlify) après une publication.
  var WARM_SITES = [SITE, "https://kinou-test.netlify.app"];

  var view = document.getElementById("view"), who = document.getElementById("who");
  var bar = document.getElementById("bar"), statusEl = document.getElementById("status");
  var publishBtn = document.getElementById("publish"), seeLink = document.getElementById("see");
  var side = document.getElementById("side");
  var token = null, user = null, index = null;

  // ---------- Outils ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "on") for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function status(msg, kind) { statusEl.textContent = msg || ""; statusEl.className = "status" + (kind ? " " + kind : ""); }
  function store(get, val) {
    try { if (get) return localStorage.getItem(TOKEN_KEY); if (val) localStorage.setItem(TOKEN_KEY, val); else localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    return null;
  }
  // « Mélodie Preel, AFC » -> « melodie-preel »
  function slugify(name) {
    var map = { "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ß": "ss", "đ": "d", "Đ": "d" };
    return name.split(",")[0].replace(/[łŁøØæÆœŒßđĐ]/g, function (c) { return map[c]; })
      .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function hueOf(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  // Lien de bundle : uuid Slate, ou code d'un lien court shots.re/<code> (résolu par le site).
  function bundleId(s) {
    s = String(s).trim();
    var u = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    if (u) return u[0];
    var c = s.match(/shots\.re\/([A-Za-z0-9]+)/);
    return c ? c[1] : null;
  }
  function surname(name) { var w = name.split(",")[0].trim().split(/\s+/); return slugify(w[w.length - 1] || ""); }

  // ---------- API GitHub ----------
  function gh(path, opts) {
    opts = opts || {};
    var headers = { Authorization: "Bearer " + token, Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json" };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com" + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
      .then(function (r) {
        if (r.status === 404 && opts.allow404) return null;
        if (!r.ok) return r.text().then(function (t) { throw new Error("GitHub " + r.status + " : " + t.slice(0, 160)); });
        return opts.raw ? r.text() : r.json();
      });
  }
  function readFile(path) {
    return gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { raw: true, allow404: true })
      .then(function (t) { return t === null ? null : JSON.parse(t); });
  }
  // Un seul commit pour tous les fichiers : [{ path, text } | { path, base64 }]
  function commit(files, message) {
    var base;
    return gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH).then(function (ref) {
      base = ref.object.sha;
      return gh("/repos/" + REPO + "/git/commits/" + base);
    }).then(function (c) {
      return Promise.all(files.map(function (f) {
        var body = f.base64 !== undefined ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" };
        return gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: body }).then(function (b) { return { path: f.path, mode: "100644", type: "blob", sha: b.sha }; });
      })).then(function (tree) {
        return gh("/repos/" + REPO + "/git/trees", { method: "POST", body: { base_tree: c.tree.sha, tree: tree } });
      });
    }).then(function (tree) {
      return gh("/repos/" + REPO + "/git/commits", { method: "POST", body: { message: message, tree: tree.sha, parents: [base] } });
    }).then(function (c) {
      return gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: c.sha } });
    });
  }
  function json(o) { return JSON.stringify(o, null, 2) + "\n"; }

  // ---------- API du site (Slate) ----------
  function importBundle(link) {
    var id = bundleId(link);
    if (!id) return Promise.reject(new Error("Lien non reconnu : collez un lien shots.re/… ou kinou.slateapp.com/bundles/…"));
    return fetch(SITE + "/api/bundle/" + id, { cache: "no-store" }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "lecture du bundle impossible"); return d; });
    });
  }
  // Demande une fois chaque vignette allégée au site : Netlify la prépare et la garde en cache,
  // le premier visiteur n'attend donc pas sa fabrication.
  function warmThumbs(clips) {
    var seen = {};
    (clips || []).forEach(function (c) {
      if (!c.img || seen[c.img] || !/^https:\/\/images\.slatecdn\.net\//.test(c.img)) return;
      seen[c.img] = true;
      WARM_SITES.forEach(function (site) { new Image().src = site + "/.netlify/images?url=" + encodeURIComponent(c.img) + "&w=800&q=75&fm=webp"; });
    });
  }
  // Galerie de stills d'un film : page Slate « work » lue par le site (/api/stills), URLs signées gardées telles quelles.
  function importStills(link) {
    return fetch(SITE + "/api/stills?link=" + encodeURIComponent(link.trim()), { cache: "no-store" }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "lecture des stills impossible"); return d; });
    });
  }
  function refreshSite(slug) {
    return fetch(SITE + "/api/refresh/" + slug, { method: "POST", headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "mise à jour refusée"); }); });
  }

  // ---------- Connexion ----------
  function login(t) {
    token = t;
    return Promise.all([gh("/repos/" + REPO), gh("/user")]).then(function (r) {
      if (!r[0].permissions || !r[0].permissions.push) throw new Error("Ce token ne peut pas écrire dans " + REPO + ".");
      user = r[1]; store(false, t);
      who.textContent = "";
      who.appendChild(document.createTextNode(user.login));
      who.appendChild(el("button", { text: "Se déconnecter", on: { click: function () { store(false, null); location.hash = "#/"; location.reload(); } } }));
    }, function (e) { token = null; throw e; });
  }
  function showLogin(msg) {
    bar.hidden = true;
    var input = el("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" });
    var st = el("p", { class: "status" + (msg ? " err" : ""), text: msg || "" });
    var go = el("button", { class: "btn primary", text: "Se connecter" });
    function submit() {
      if (!input.value.trim()) return;
      go.disabled = true; st.className = "status"; st.textContent = "Vérification…";
      login(input.value.trim()).then(route, function (e) { go.disabled = false; st.className = "status err"; st.textContent = e.message; });
    }
    go.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    view.textContent = "";
    view.appendChild(el("div", { class: "login" }, [
      el("h1", { text: "Connexion" }),
      el("p", { class: "lead", text: "Collez votre token GitHub personnel. Il reste enregistré dans ce navigateur." }),
      el("label", { class: "label", text: "Token GitHub" }),
      el("div", { class: "row" }, [el("div", { class: "grow" }, [input]), go]), st,
      el("ol", {}, [
        el("li", {}, ["Sur GitHub : Settings → Developer settings → Personal access tokens → ", el("b", { text: "Fine-grained tokens" }), " → Generate new token."]),
        el("li", { text: "Resource owner : Kinou-DoP. Repository access : Only select repositories → admin." }),
        el("li", { text: "Permissions → Repository permissions → Contents : Read and write." }),
        el("li", { text: "Generate token, puis copiez-le ici." })
      ])
    ]));
    input.focus();
  }

  // ---------- Liste des chefs op ----------
  function loadIndex() { return readFile("data/dps/index.json").then(function (d) { index = d || { dps: [] }; return index; }); }
  function showList() {
    bar.hidden = true; editing = false;
    view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([loadIndex(), gh("/repos/" + REPO + "/contents/data/dps?ref=" + BRANCH)]).then(function (r) {
      var files = {}; r[1].forEach(function (f) { files[f.name] = true; });
      var ul = el("ul", { class: "dps" });
      index.dps.forEach(function (d) {
        var has = files[d.slug + ".json"];
        ul.appendChild(el("li", {}, [el("a", { href: "#/dp/" + d.slug, class: has ? "live" : "" }, [d.name, el("small", { text: has ? "Fiche publiée" : "Pas encore de fiche" })])]));
      });
      view.textContent = "";
      view.appendChild(el("div", { class: "list-head" }, [
        el("div", {}, [el("h1", { text: "Chefs opérateurs" }), el("p", { class: "lead", text: index.dps.length + " sur le site · " + Object.keys(files).filter(function (f) { return /\.json$/.test(f) && f !== "index.json"; }).length + " fiches publiées" })]),
        el("a", { class: "btn primary", href: "#/new", text: "+ Ajouter un chef op" })
      ]));
      view.appendChild(ul);
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }

  // ---------- Fiche d'un chef op ----------
  // state : fiche en cours d'édition ; slate : dernier import du bundle (ou copie enregistrée)
  // listed : le chef op figure déjà dans la liste du site (son adresse existe, elle ne change pas).
  var state = null, slate = null, isNew = false, listed = false, pending = {}, curCat = null, flash = "";
  // dirty : modifications faites dans la page mais pas encore publiées.
  var dirty = false;
  function touch() { dirty = true; status("Modifications non publiées : cliquez sur « Publier » pour les mettre en ligne.", "warn"); }
  // Toute saisie dans la fiche compte comme une modification (sauf le champ du lien de bundle).
  // editing : une page modifiable est ouverte (fiche, accueil, contact).
  var editing = false, pagePublish = null;
  view.addEventListener("input", function (e) { if (editing && !e.target.classList.contains("nodirty")) touch(); });

  function showDP(slug) {
    bar.hidden = true;
    view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([index ? index : loadIndex(), slug ? readFile("data/dps/" + slug + ".json") : null]).then(function (r) {
      var entry = slug && index.dps.filter(function (d) { return d.slug === slug; })[0];
      isNew = !r[1]; listed = !!entry; pending = {};
      state = r[1] || { slug: slug || "", name: entry ? entry.name : "", hue: 0, overrides: {}, about: {} };
      state.overrides = state.overrides || {}; state.about = state.about || {}; dirty = false;
      slate = state.clips ? { name: state.name, categories: state.categories || [], clips: state.clips } : null;
      curCat = null;
      render();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }

  function render() {
    view.textContent = ""; editing = true; pagePublish = publish;
    view.appendChild(el("h1", { text: state.name || "Nouveau chef op" }));
    view.appendChild(el("p", { class: "lead", text: isNew ? "Nouvelle fiche — collez le lien du bundle Slate pour commencer." : (state.bundle ? "Films synchronisés avec Slate." : "Fiche sans bundle Slate : les films sont figés.") }));
    view.appendChild(bundleSection());
    view.appendChild(identitySection());
    view.appendChild(filmsSection());
    view.appendChild(aboutSection());
    bar.hidden = false;
    seeLink.href = SITE + "/#" + (state.slug || "");
    seeLink.hidden = isNew;
    if (flash) status(flash, "ok"); else if (dirty) touch(); else status("");
    flash = "";
  }

  function bundleSection() {
    var input = el("input", { type: "url", class: "nodirty", placeholder: "https://shots.re/… ou https://kinou.slateapp.com/bundles/…", value: state.bundle || "" });
    var st = el("p", { class: "hint" });
    var imp = el("button", { class: "btn", text: state.bundle ? "Relire le bundle" : "Importer" });
    imp.addEventListener("click", function () {
      imp.disabled = true; st.textContent = "Lecture du bundle sur Slate (environ 5 s)…";
      importBundle(input.value).then(function (d) {
        // Chef op déjà dans la liste du site (même nom) : on garde son adresse actuelle,
        // et s'il a déjà une fiche, on ouvre celle-ci plutôt que d'en créer une seconde.
        var known = isNew && !listed && index.dps.filter(function (e) { return slugify(e.name) === slugify(state.name || d.name); })[0];
        return (known ? readFile("data/dps/" + known.slug + ".json") : Promise.resolve(null)).then(function (existing) { return [d, known, existing]; });
      }).then(function (r) {
        var d = r[0], known = r[1];
        if (r[2]) { dirty = false; flash = d.name + " a déjà une fiche : la voici. Utilisez « Relire le bundle » pour la mettre à jour."; location.hash = "#/dp/" + known.slug; return; }
        slate = d; state.bundle = d.bundle; dirty = true;
        if (!state.name) state.name = d.name;
        if (known) { state.slug = known.slug; listed = true; }
        if (isNew && !state.slug) state.slug = slugify(state.name);
        if (isNew) state.hue = hueOf(state.slug);
        if (isNew && state.open === undefined) { var f = d.clips.filter(function (c) { return c.featured; }).sort(function (a, b) { return a.featuredOrder - b.featuredOrder; })[0]; if (f) state.open = f.slate; }
        render();
        status((known ? "Déjà sur le site : la fiche reprend son adresse kinou.fr/" + known.slug + ". " : "") + "Bundle importé : " + d.clips.length + " films, " + d.categories.length + " onglets. Vérifiez puis publiez.", "ok");
      }, function (e) { imp.disabled = false; st.textContent = e.message; });
    });
    var kids = [el("h2", { text: "Bundle Slate" }), el("div", { class: "row" }, [el("div", { class: "grow" }, [input]), imp]), st];
    if (!isNew && state.bundle) {
      var ref = el("button", { class: "btn", text: "Mettre à jour le site depuis Slate" });
      ref.addEventListener("click", function () {
        ref.disabled = true; st.textContent = "Mise à jour…";
        if (slate) warmThumbs(slate.clips);
        refreshSite(state.slug).then(function () { st.textContent = "C'est fait : le site relit Slate pour " + state.name + " dès la prochaine visite."; ref.disabled = false; },
          function (e) { st.textContent = "Mise à jour impossible : " + e.message; ref.disabled = false; });
      });
      kids.push(el("div", { class: "row", style: "margin-top:18px" }, [ref]));
      kids.push(el("p", { class: "hint", text: "Le site se met à jour seul toutes les 10 minutes. Ce bouton force la mise à jour tout de suite (après un changement sur Slate)." }));
    }
    return el("section", {}, kids);
  }

  function identitySection() {
    var name = el("input", { type: "text", value: state.name || "", placeholder: "Prénom Nom, AFC" });
    var slug = el("input", { type: "text", value: state.slug || "", readonly: !isNew || listed });
    name.addEventListener("input", function () {
      var auto = slug.value === "" || slug.value === slugify(state.name || "");
      state.name = name.value; view.querySelector("h1").textContent = state.name || "Nouveau chef op";
      if (isNew && !listed && auto) { slug.value = state.slug = slugify(name.value); }
    });
    slug.addEventListener("input", function () { state.slug = slug.value.toLowerCase(); });
    slug.addEventListener("blur", function () { state.slug = slug.value = slugify(slug.value); });
    return el("section", {}, [
      el("h2", { text: "Identité" }),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Nom affiché" }), name, el("p", { class: "hint", text: "Les mentions après la virgule (AFC, SBC…) s'affichent sous le nom." })]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Adresse de la page" }), el("div", { class: "prefix" }, [el("span", { text: "kinou.fr/" }), slug]),
          el("p", { class: "hint", text: isNew && !listed ? "Proposée à partir du nom (sans accents ni majuscules). Modifiable jusqu'à la première publication." : "Définitive : elle ne peut plus changer (référencement)." })])
      ])
    ]);
  }

  // Valeur affichée d'un champ de film : correction si elle existe, sinon Slate.
  function val(c, k) { var o = state.overrides[c.slate]; return o && o[k] !== undefined ? o[k] : (c[k] || ""); }
  function setOverride(c, k, v) {
    var o = state.overrides[c.slate] || {};
    if (v === (c[k] || "") || v === undefined) delete o[k]; else o[k] = v;
    if (Object.keys(o).length) state.overrides[c.slate] = o; else delete state.overrides[c.slate];
  }

  function filmsSection() {
    var sec = el("section", {}, [el("h2", { text: "Films" })]);
    if (!slate) { sec.appendChild(el("p", { class: "empty", text: "Importez le bundle Slate pour voir les films." })); return sec; }
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
    var seen = {};
    var list = slate.clips.filter(function (c) {
      if (curCat === "ALL") { if (seen[c.slate]) return false; seen[c.slate] = true; return true; }
      return curCat === "FEATURED" ? c.featured : c.cat === curCat;
    });
    if (curCat === "FEATURED") list.sort(function (a, b) { return a.featuredOrder - b.featuredOrder; });
    var grid = el("div", { class: "films" });
    list.forEach(function (c) { grid.appendChild(filmCard(c)); });
    sec.appendChild(grid);
    sec.appendChild(el("p", { class: "hint", text: "L'ordre et les catégories viennent de Slate. Les corrections de titre et de crédits restent attachées au film même s'il change de place sur Slate." }));
    return sec;
  }

  // Recadrage d'un extrait (zoom au centre, 100 à 160 %) pour enlever les bandes noires, avec aperçu :
  // l'extrait joue dans la vignette au survol et pendant le réglage. get() : zoom actuel ; set(z) : enregistre (1 = aucun).
  // getT / setT (optionnels) : case « aussi sur la vignette » (sinon seul l'extrait est recadré).
  var zoomStopOther = null; // un seul extrait joue à la fois : lancer un aperçu arrête le précédent
  function zoomCtl(thumb, video, get, set, getT, setT) {
    var range = el("input", { type: "range", min: "100", max: "160", step: "1", class: "nodirty", value: String(Math.round((get() || 1) * 100)) });
    var lab = el("span", { class: "zval" }), v = null, adjusting = false;
    // Pendant le réglage : l'extrait entier, et un cadre rouge fin = la partie gardée (taille de la vignette).
    var frame = el("i", { class: "zframe" });
    function apply() {
      var z = get() || 1, w = 100 / z;
      lab.textContent = z > 1 ? "Recadrage " + Math.round(z * 100) + " %" : "Recadrage : aucun";
      thumb.style.backgroundSize = z > 1 && getT && getT() && !adjusting ? z * 100 + "% auto" : "";
      if (v) v.style.transform = adjusting ? "none" : "scale(" + z + ")";
      frame.style.width = frame.style.height = w + "%";
      frame.style.left = frame.style.top = (100 - w) / 2 + "%";
      frame.hidden = !adjusting;
      if (adjusting && !frame.parentNode) thumb.appendChild(frame);
    }
    function halt() { adjusting = false; if (v) { v.remove(); v = null; } apply(); }
    function play() {
      if (zoomStopOther && zoomStopOther !== halt) zoomStopOther();
      zoomStopOther = halt;
      if (v || !video) return;
      v = el("video", { muted: true, loop: true, playsinline: true, src: video }); v.muted = true;
      thumb.appendChild(v); apply();
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    }
    function stop() { if (v && document.activeElement !== range) { v.remove(); v = null; } }
    range.addEventListener("pointerdown", function () { adjusting = true; play(); apply(); });
    range.addEventListener("input", function () { adjusting = true; var z = parseInt(range.value, 10) / 100; set(z > 1 ? z : undefined); play(); apply(); touch(); });
    range.addEventListener("blur", function () { adjusting = false; apply(); stop(); });
    thumb.addEventListener("mouseenter", play);
    thumb.addEventListener("mouseleave", stop);
    apply();
    var box = el("div", { class: "zoom" }, [lab, range]);
    if (!setT) return box;
    var cb = el("input", { type: "checkbox", class: "nodirty" }); cb.checked = !!getT();
    cb.addEventListener("change", function () { setT(cb.checked || undefined); apply(); touch(); });
    return el("div", {}, [box, el("label", { class: "zthumb" }, [cb, "Aussi sur la vignette"])]);
  }

  function filmCard(c) {
    var card = el("div", { class: "film" });
    var thumb = el("div", { class: "thumb" });
    if (c.img) thumb.style.backgroundImage = 'url("' + c.img + '")';
    var chips = el("div", { class: "chips" });
    thumb.appendChild(chips);
    var title = el("input", { type: "text", value: val(c, "title") });
    var sub = el("textarea", { rows: 2 }); sub.value = val(c, "sub");
    var hide = el("button", {}), reset = el("button", { text: "Rétablir" });
    function sync() {
      var o = state.overrides[c.slate] || {};
      card.className = "film" + (o.hidden ? " hidden" : "") + (o.title !== undefined || o.sub !== undefined ? " edited" : "");
      hide.textContent = o.hidden ? "Afficher" : "Masquer";
      reset.hidden = !(o.title !== undefined || o.sub !== undefined);
      chips.textContent = "";
      if (c.featured) chips.appendChild(el("span", { class: "chip", text: "Featured " + c.featuredOrder }));
      if (!c.full && !c.video) chips.appendChild(el("span", { class: "chip", text: "Sans vidéo" }));
      if (o.stills) chips.appendChild(el("span", { class: "chip", text: "Stills " + o.stills.length }));
      dropStills.hidden = !o.stills;
    }
    // Lien Slate des stills (page « work ») : les images sont lues tout de suite et enregistrées avec la fiche.
    var stillsIn = el("input", { type: "url", class: "stills nodirty", placeholder: "Lien Slate des stills", value: (state.overrides[c.slate] || {}).stillsLink || "" });
    var stillsSt = el("p", { class: "hint" });
    var dropStills = el("button", { text: "Retirer les stills" });
    function loadStills(force) {
      var v = stillsIn.value.trim(), o = state.overrides[c.slate] || {};
      if (!v || (!force && v === o.stillsLink && o.stills)) return; // Entrée : relit toujours Slate
      stillsSt.textContent = "Lecture des stills…";
      importStills(v).then(function (d) {
        setOverride(c, "stills", d.stills); setOverride(c, "stillsLink", d.link); stillsIn.value = d.link;
        stillsSt.textContent = d.stills.length + " images importées (" + d.title + ")."; sync(); touch();
      }, function (e) { stillsSt.textContent = e.message; });
    }
    stillsIn.addEventListener("change", function () { loadStills(false); });
    stillsIn.addEventListener("keydown", function (e) { if (e.key === "Enter") loadStills(true); });
    dropStills.addEventListener("click", function () { setOverride(c, "stills"); setOverride(c, "stillsLink"); stillsIn.value = ""; stillsSt.textContent = ""; sync(); touch(); });
    title.addEventListener("input", function () { setOverride(c, "title", title.value); sync(); });
    sub.addEventListener("input", function () { setOverride(c, "sub", sub.value); sync(); });
    hide.addEventListener("click", function () { setOverride(c, "hidden", (state.overrides[c.slate] || {}).hidden ? undefined : true); sync(); touch(); });
    reset.addEventListener("click", function () { setOverride(c, "title"); setOverride(c, "sub"); title.value = c.title || ""; sub.value = c.sub || ""; sync(); touch(); });
    sync();
    var zoom = zoomCtl(thumb, c.video, function () { return (state.overrides[c.slate] || {}).zoom; }, function (z) { setOverride(c, "zoom", z); sync(); },
      function () { return (state.overrides[c.slate] || {}).zoomThumb; }, function (t) { setOverride(c, "zoomThumb", t); sync(); });
    card.appendChild(thumb); card.appendChild(zoom); card.appendChild(title); card.appendChild(sub);
    card.appendChild(el("div", { class: "acts" }, [hide, reset, dropStills]));
    card.appendChild(stillsIn); card.appendChild(stillsSt);
    return card;
  }

  function paras(a) { return (a || []).join("\n\n"); }
  function unparas(t) { return t.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean); }

  function aboutSection() {
    var a = state.about;
    function text(key, ph) {
      var t = el("textarea", { placeholder: ph }); t.value = paras(a[key]);
      t.addEventListener("input", function () { var v = unparas(t.value); if (v.length) a[key] = v; else delete a[key]; });
      return t;
    }
    function line(key, ph) {
      var i = el("input", { type: "url", value: a[key] || "", placeholder: ph });
      i.addEventListener("input", function () { a[key] = i.value.trim(); });
      return i;
    }
    return el("section", {}, [
      el("h2", { text: "À propos" }),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Bio (français)" }), text("bio", "Un paragraphe par bloc, séparés par une ligne vide."), ]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Bio (anglais, optionnelle)" }), text("bioEn", "Si elle est remplie, le site propose FR / EN.")])
      ]),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Instagram" }), line("instagram", "https://instagram.com/…")]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Site web" }), line("website", "https://…")])
      ]),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Portrait (fond de l'onglet About)" }), portraitDrop(), focalPicker()]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "CV (PDF, téléchargé depuis le site)" }), cvDrop()])
      ])
    ]);
  }

  function dropZone(accept, label, onFile, onClear, filled, bg) {
    var input = el("input", { type: "file", accept: accept });
    var z = el("label", { class: "drop" + (filled ? " has" : "") }, [input, el("span", { text: filled || label })]);
    if (bg) z.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)), url("' + bg + '")';
    if (filled) z.appendChild(el("button", { class: "x", type: "button", text: "×", title: "Retirer", on: { click: function (e) { e.preventDefault(); onClear(); } } }));
    function take(f) { if (f) onFile(f); }
    input.addEventListener("change", function () { take(input.files[0]); });
    z.addEventListener("dragover", function (e) { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", function () { z.classList.remove("over"); });
    z.addEventListener("drop", function (e) { e.preventDefault(); z.classList.remove("over"); take(e.dataTransfer.files[0]); });
    return z;
  }
  function rawURL(path) { return "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + path; }

  function portraitDrop() {
    var a = state.about, p = pending.portrait;
    var bg = p ? p.preview : (a.img ? (/^(https?:|data:)/.test(a.img) ? a.img : null) : null);
    var name = p ? "Nouveau portrait (" + Math.round(p.size / 1024) + " Ko)" : (a.img ? "Portrait actuel : " + a.img.split("/").pop() : "");
    var z = dropZone("image/*", "Glissez une photo ici (ou cliquez)", function (f) {
      status("Compression du portrait…");
      compress(f).then(function (r) { pending.portrait = r; z.replaceWith(portraitDrop()); refreshFocal(); touch(); }, function (e) { status(e.message, "err"); });
    }, function () { delete pending.portrait; delete a.img; z.replaceWith(portraitDrop()); refreshFocal(); touch(); }, name, bg);
    if (!p && a.img && !bg) loadPreview(a.img, z);
    return z;
  }
  // Point de cadrage du portrait (comme sur Squarespace) : un clic (ou un glisser) sur la photo place le point qui doit
  // rester visible ; le site cadre la photo autour (about.pos = "X% Y%", background-position). Aperçus ordinateur et téléphone.
  var focalEl = null, portraitURL = {};
  function refreshFocal() { if (focalEl) focalEl.replaceWith(focalPicker()); }
  function parsePos(pos) {
    var m = String(pos || "center 30%").replace("center", "50%").match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 30];
  }
  function focalPicker() {
    var a = state.about, p = pending.portrait, box = el("div", { class: "focal" });
    focalEl = box;
    if (!p && !a.img) return box;
    var xy = parsePos(a.pos);
    var stage = el("div", { class: "fstage" }), img = el("img", { alt: "" }), dot = el("i", { class: "fdot" });
    // Aperçus : même rendu que le site (cadrage = background-position, zoom = agrandissement vers le point de cadrage).
    var dImg = el("div", { class: "fimg" }), pImg = el("div", { class: "fimg" });
    var desk = el("div", { class: "fprev desk" }, [dImg]), phone = el("div", { class: "fprev phone" }, [pImg]);
    stage.appendChild(img); stage.appendChild(dot);
    var zr = el("input", { type: "range", min: "100", max: "250", step: "1", class: "nodirty", value: String(Math.round((a.zoom || 1) * 100)) });
    var zl = el("span", { class: "zval" });
    function show() {
      var z = a.zoom > 1 ? a.zoom : 1, pos = xy[0] + "% " + xy[1] + "%";
      dot.style.left = xy[0] + "%"; dot.style.top = xy[1] + "%";
      zl.textContent = z > 1 ? "Zoom " + Math.round(z * 100) + " %" : "Zoom : aucun";
      [dImg, pImg].forEach(function (b) { b.style.backgroundPosition = pos; b.style.transformOrigin = pos; b.style.transform = z > 1 ? "scale(" + z + ")" : ""; });
    }
    zr.addEventListener("input", function () { var z = parseInt(zr.value, 10) / 100; if (z > 1) a.zoom = z; else delete a.zoom; show(); touch(); });
    function set(url) { img.src = url; [dImg, pImg].forEach(function (b) { b.style.backgroundImage = 'url("' + url + '")'; }); }
    function place(e) {
      var r = img.getBoundingClientRect(), pt = e.touches ? e.touches[0] : e;
      xy = [Math.round(Math.max(0, Math.min(100, (pt.clientX - r.left) / r.width * 100))), Math.round(Math.max(0, Math.min(100, (pt.clientY - r.top) / r.height * 100)))];
      a.pos = xy[0] + "% " + xy[1] + "%"; show(); touch();
    }
    var drag = false;
    stage.addEventListener("pointerdown", function (e) { drag = true; stage.setPointerCapture(e.pointerId); place(e); });
    stage.addEventListener("pointermove", function (e) { if (drag) place(e); });
    stage.addEventListener("pointerup", function () { drag = false; });
    if (p) set(p.preview);
    else if (portraitURL[a.img]) set(portraitURL[a.img]);
    else fetch("https://api.github.com/repos/" + REPO + "/contents/data/dps/" + a.img + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { if (b) set(portraitURL[a.img] = URL.createObjectURL(b)); });
    var reset = el("button", { type: "button", class: "btn ghost", text: "Recentrer" });
    reset.addEventListener("click", function () { delete a.pos; delete a.zoom; zr.value = "100"; xy = parsePos(); show(); touch(); });
    show();
    box.appendChild(el("p", { class: "hint", text: "Cliquez (ou glissez) sur la photo pour placer le point qui doit toujours rester visible, par exemple le visage." }));
    box.appendChild(el("div", { class: "frow" }, [stage, el("div", { class: "fprevs" }, [
      el("div", {}, [desk, el("span", { class: "label", text: "Ordinateur" })]),
      el("div", {}, [phone, el("span", { class: "label", text: "Téléphone" })])
    ])]));
    box.appendChild(el("div", { class: "zoom fzoom" }, [zl, zr]));
    box.appendChild(reset);
    return box;
  }
  // Aperçu d'un portrait déjà enregistré (repo privé : lecture via l'API GitHub).
  function loadPreview(rel, z) {
    fetch("https://api.github.com/repos/" + REPO + "/contents/data/dps/" + rel + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { if (b) z.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)), url("' + URL.createObjectURL(b) + '")'; });
  }
  // Redimensionne (1600 px max) et compresse en WebP.
  function compress(file) {
    return new Promise(function (ok, ko) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (!b) return ko(new Error("Compression impossible"));
          var fr = new FileReader();
          fr.onload = function () { ok({ base64: fr.result.split(",")[1], size: b.size, preview: URL.createObjectURL(b) }); };
          fr.readAsDataURL(b);
        }, "image/webp", 0.82);
      };
      img.onerror = function () { ko(new Error("Image illisible")); };
      img.src = url;
    });
  }

  function cvDrop() {
    var a = state.about, p = pending.cv;
    var name = p ? "Nouveau CV : " + p.name + " (" + Math.round(p.size / 1024) + " Ko)" : (a.cv && !/^https?:/.test(a.cv) ? "CV actuel : " + a.cv.split("/").pop() : (a.cv ? "Lien actuel : " + a.cv : ""));
    var z = dropZone("application/pdf", "Glissez le CV en PDF ici (ou cliquez)", function (f) {
      if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { status("Le CV doit être un PDF.", "err"); return; }
      if (f.size > 15 * 1024 * 1024) { status("PDF trop lourd (15 Mo maximum).", "err"); return; }
      var fr = new FileReader();
      fr.onload = function () { pending.cv = { base64: fr.result.split(",")[1], size: f.size, name: f.name }; z.replaceWith(cvDrop()); touch(); };
      fr.readAsDataURL(f);
    }, function () { delete pending.cv; a.cv = ""; z.replaceWith(cvDrop()); touch(); }, name);
    return z;
  }

  // ---------- Publication ----------
  function publish() {
    var s = state;
    if (!s.name.trim()) return status("Le nom est obligatoire.", "err");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug || "")) return status("Adresse de page invalide.", "err");
    publishBtn.disabled = true; status("Publication…");
    (isNew ? readFile("data/dps/" + s.slug + ".json") : Promise.resolve(null)).then(function (existing) {
      if (existing && !window.confirm("Une fiche existe déjà à l'adresse « " + s.slug + " » (" + existing.name + "). La remplacer ?")) { publishBtn.disabled = false; status(""); return; }
      doPublish();
    }, function (e) { publishBtn.disabled = false; status(e.message, "err"); });
  }
  function doPublish() {
    var s = state;
    var files = [], about = s.about;
    if (pending.portrait) { about.img = "img/" + s.slug + ".webp"; files.push({ path: "data/dps/img/" + s.slug + ".webp", base64: pending.portrait.base64 }); }
    if (pending.cv) {
      var cvName = "CV-" + s.name.split(",")[0].trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".pdf";
      about.cv = "cv/" + cvName; files.push({ path: "data/dps/cv/" + cvName, base64: pending.cv.base64 });
    }
    var out = {};
    ["slug", "name", "hue", "bundle", "open", "template"].forEach(function (k) { if (s[k] !== undefined && s[k] !== "") out[k] = s[k]; });
    out.name = s.name.trim();
    out.overrides = s.overrides;
    out.about = about;
    if (slate) { out.categories = slate.categories; out.clips = slate.clips; } // copie de secours
    files.push({ path: "data/dps/" + s.slug + ".json", text: json(out) });
    // Liste des DPs : ajout (rangé par nom de famille) ou mise à jour du nom.
    var dps = index.dps.slice(), i = dps.findIndex(function (d) { return d.slug === s.slug; });
    if (i > -1) { if (dps[i].name !== out.name) { dps[i] = Object.assign({}, dps[i], { name: out.name }); } }
    else {
      var k = surname(out.name), at = dps.findIndex(function (d) { return surname(d.name) > k; });
      dps.splice(at < 0 ? dps.length : at, 0, { slug: s.slug, name: out.name });
    }
    if (JSON.stringify(dps) !== JSON.stringify(index.dps)) files.push({ path: "data/dps/index.json", text: json({ dps: dps }) });
    commit(files, (isNew ? "Ajout " : "Mise à jour ") + out.name.split(",")[0] + " (admin, " + user.login + ")").then(function () {
      var wasNew = isNew;
      index.dps = dps; pending = {}; isNew = false; listed = true; state = out; dirty = false;
      flash = "Publié. Le site sera à jour dans une minute environ.";
      if (wasNew) location.hash = "#/dp/" + out.slug; else render();
      refreshSite(out.slug).catch(function () {}); // vide le cache du site (fiche et clips) : visible tout de suite
      warmThumbs(out.clips);
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); })
      .then(function () { publishBtn.disabled = false; });
  }
  publishBtn.addEventListener("click", function () { if (pagePublish) pagePublish(); });

  // ---------- Accueil (data/home.json) ----------
  // Les 10 premiers films d'une bande Slate ; les chefs op crédités sont reliés à leur page par leur nom.
  // overrides (par id Slate) : textes et chefs op corrigés, réappliqués quand on rafraîchit la bande.
  var home = null;
  function importReel(link) {
    return fetch(SITE + "/api/reel?link=" + encodeURIComponent(link.trim()), { cache: "no-store" }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "lecture de la bande impossible"); return d; });
    });
  }
  function dpOf(name) {
    var k = slugify(name), e = index.dps.filter(function (d) { return slugify(d.name) === k; })[0];
    return e ? { name: e.name, slug: e.slug } : { name: name, slug: "" };
  }
  function slideOf(f) {
    var src = { film: f.film, song: f.song, legend: f.legend, dps: f.artists.map(dpOf) };
    var sl = { slate: f.slate, video: f.video, img: f.img, src: src };
    // Film complet (lecteur de l'accueil) ; s'il manque à la lecture de la bande, on garde celui déjà enregistré.
    var prev = (home.slides || []).filter(function (x) { return x.slate === f.slate; })[0];
    if (f.full) sl.full = f.full; else if (prev && prev.full) sl.full = prev.full;
    var o = home.overrides[f.slate] || {};
    ["film", "song", "legend", "dps", "zoom", "stills", "stillsLink"].forEach(function (k) { sl[k] = o[k] !== undefined ? o[k] : src[k]; });
    return sl;
  }
  function showHome() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([index ? index : loadIndex(), readFile("data/home.json")]).then(function (r) {
      home = r[1] || { duration: 7000, slides: [] };
      home.overrides = home.overrides || {}; dirty = false;
      renderHome();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  function renderHome() {
    view.textContent = ""; editing = true; pagePublish = publishHome;
    view.appendChild(el("h1", { text: "Page d'accueil" }));
    view.appendChild(el("p", { class: "lead", text: "Les 10 premiers films d'une bande Slate défilent sur l'accueil, dans l'ordre de la bande." }));
    var input = el("input", { type: "url", class: "nodirty", placeholder: "Lien de la bande Slate (kinou.slateapp.com/… ou shots.re/…)", value: home.reel || "" });
    var imp = el("button", { class: "btn primary", text: home.reel ? "Rafraîchir" : "Importer" }), st = el("p", { class: "hint" });
    function load() {
      if (!input.value.trim()) return;
      imp.disabled = true; st.textContent = "Lecture de la bande…";
      importReel(input.value).then(function (d) {
        home.reel = d.link; home.slides = d.films.map(slideOf);
        var lost = []; home.slides.forEach(function (sl) { sl.dps.forEach(function (x) { if (!x.slug) lost.push(x.name); }); });
        dirty = true; renderHome();
        status(d.films.length + " films importés." + (lost.length ? " Pas de page pour : " + lost.join(", ") + " (nom sans lien)." : "") + " Publiez pour mettre l'accueil à jour.", "warn");
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
    bar.hidden = false; seeLink.href = SITE + "/"; seeLink.hidden = false;
    if (dirty) touch(); else status(flash || "", flash ? "ok" : ""); flash = "";
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
      ["film", "song", "legend", "dps", "zoom", "stills", "stillsLink"].forEach(function (k) { sl[k] = sl.src[k]; });
      card.replaceWith(slideCard(sl)); touch();
    });
    card.appendChild(thumb);
    if (editable) card.appendChild(zoomCtl(thumb, sl.video, function () { return sl.zoom; }, function (z) { setO("zoom", z); }));
    card.appendChild(film); card.appendChild(song); card.appendChild(legend); card.appendChild(dps);
    if (editable) card.appendChild(el("div", { class: "acts" }, [reset]));
    // Stills du film, sous la vidéo dans le lecteur de l'accueil (sans stills ici : ceux de la fiche du chef op, s'il y en a).
    if (editable) {
      var stillsIn = el("input", { type: "url", class: "stills nodirty", placeholder: "Lien Slate des stills", value: sl.stillsLink || "" });
      var stillsSt = el("p", { class: "hint", text: sl.stills ? sl.stills.length + " images." : "" });
      var load = function (force) {
        var v = stillsIn.value.trim();
        if (!v) { if (sl.stills) { setO("stills"); setO("stillsLink"); stillsSt.textContent = "Stills retirés."; touch(); } return; }
        if (!force && v === sl.stillsLink && sl.stills) return;
        stillsSt.textContent = "Lecture des stills…";
        importStills(v).then(function (d) {
          setO("stills", d.stills); setO("stillsLink", d.link); stillsIn.value = d.link;
          stillsSt.textContent = d.stills.length + " images importées (" + d.title + ")."; touch();
        }, function (e) { stillsSt.textContent = e.message; });
      };
      stillsIn.addEventListener("change", function () { load(false); });
      stillsIn.addEventListener("keydown", function (e) { if (e.key === "Enter") load(true); });
      card.appendChild(stillsIn); card.appendChild(stillsSt);
    }
    return card;
  }
  function publishHome() {
    publishBtn.disabled = true; status("Publication…");
    var out = { duration: home.duration || 7000 };
    if (home.reel) out.reel = home.reel;
    out.overrides = home.overrides;
    out.slides = home.slides;
    commit([{ path: "data/home.json", text: json(out) }], "Mise à jour de l'accueil (admin, " + user.login + ")").then(function () {
      home = out; dirty = false; flash = "Publié. L'accueil est à jour sur le site.";
      renderHome();
      refreshSite("home").catch(function () {}); // vide le cache des données du site
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); })
      .then(function () { publishBtn.disabled = false; });
  }

  // ---------- Contact (data/site.json) : pour l'instant, le logo du site ----------
  var conf = null;
  function showContact() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    readFile("data/site.json").then(function (c) { conf = c || {}; pending = {}; dirty = false; renderContact(); })
      .catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  function renderContact() {
    view.textContent = ""; editing = true; pagePublish = publishContact;
    view.appendChild(el("h1", { text: "Contact" }));
    view.appendChild(el("p", { class: "lead", text: "Le contenu de la page contact viendra ici. Pour l'instant : le logo du site." }));
    var size = el("input", { type: "text", inputmode: "numeric", value: String(conf.logoHeight || 36) });
    size.addEventListener("input", function () { var v = parseInt(size.value, 10); if (v > 0) conf.logoHeight = v; drawPreview(); });
    var preview = el("div", { class: "logoprev" });
    function drawPreview() {
      preview.textContent = "";
      var p = pending.logo;
      if (p) preview.appendChild(el("img", { src: p.preview, alt: "logo", style: "height:" + (conf.logoHeight || 36) + "px" }));
      else if (conf.logo) loadImg("data/" + conf.logo, preview);
      else preview.appendChild(el("span", { class: "logotxt", text: "kinou" }));
    }
    function loadImg(path, box) {
      fetch("https://api.github.com/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) { if (b) box.appendChild(el("img", { src: URL.createObjectURL(b), alt: "logo", style: "height:" + (conf.logoHeight || 36) + "px" })); });
    }
    function drop() {
      var p = pending.logo, name = p ? "Nouveau logo : " + p.name : (conf.logo ? "Logo actuel : " + conf.logo.split("/").pop() : "");
      var z = dropZone("image/png,image/webp", "Glissez le logo ici : PNG blanc sur fond transparent (ou cliquez)", function (f) {
        if (!/^image\/(png|webp)$/.test(f.type)) { status("Le logo doit être un PNG (ou WebP).", "err"); return; }
        var fr = new FileReader();
        fr.onload = function () { pending.logo = { name: f.name, ext: f.type === "image/webp" ? "webp" : "png", base64: fr.result.split(",")[1], preview: fr.result }; z.replaceWith(drop()); drawPreview(); touch(); };
        fr.readAsDataURL(f);
      }, function () { delete pending.logo; delete conf.logo; z.replaceWith(drop()); drawPreview(); touch(); }, name);
      return z;
    }
    drawPreview();
    view.appendChild(el("section", {}, [el("h2", { text: "Logo (en haut au milieu du site)" }),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Fichier" }), drop(),
          el("p", { class: "hint", text: "Sans logo, le site affiche « kinou » en texte. Même effet que le texte : il s'inverse sur les fonds clairs." })]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Aperçu" }), preview,
          el("label", { class: "label", text: "Hauteur (px, ordinateur ; 83 % sur téléphone)" }), size])
      ])]));
    bar.hidden = false; seeLink.href = SITE + "/"; seeLink.hidden = false;
    if (dirty) touch(); else status(flash || "", flash ? "ok" : ""); flash = "";
  }
  function publishContact() {
    publishBtn.disabled = true; status("Publication…");
    var files = [], out = Object.assign({}, conf);
    if (pending.logo) {
      // Nom unique à chaque envoi : aucun ancien logo gardé en cache par les navigateurs.
      out.logo = "brand/logo-" + Date.now().toString(36) + "." + pending.logo.ext;
      files.push({ path: "data/" + out.logo, base64: pending.logo.base64 });
    }
    if (!out.logo) delete out.logoHeight;
    files.push({ path: "data/site.json", text: json(out) });
    commit(files, "Mise à jour du logo (admin, " + user.login + ")").then(function () {
      conf = out; pending = {}; dirty = false; flash = "Publié. Rechargez le site pour voir le logo.";
      renderContact();
      refreshSite("home").catch(function () {});
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); })
      .then(function () { publishBtn.disabled = false; });
  }

  function showSoon(title) {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: title }));
    view.appendChild(el("p", { class: "lead", text: "À venir." }));
  }

  // ---------- Navigation ----------
  function route() {
    var h = location.hash;
    document.getElementById("back").hidden = !token || !/^#\/(dp\/|new)/.test(h);
    var page = /^#\/(home|spotlight|fiction|contact)$/.test(h) ? h.slice(2) : "cinematographers";
    side.hidden = !token;
    side.querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.page === page); });
    if (!token) return showLogin();
    if (/^#\/dp\//.test(h)) return showDP(decodeURIComponent(h.slice(5)));
    if (h === "#/new") return showDP(null);
    if (page === "home") return showHome();
    if (page === "contact") return showContact();
    if (page === "spotlight") return showSoon("Spotlight");
    if (page === "fiction") return showSoon("Fiction");
    showList();
  }
  // Quitter la fiche (retour, autre page, rechargement) avec des modifications non publiées : on demande confirmation.
  var here = location.hash;
  window.addEventListener("hashchange", function () {
    if (!token) return;
    if (dirty && !window.confirm("Des modifications ne sont pas publiées. Quitter quand même (elles seront perdues) ?")) { history.replaceState(null, "", here || "#/"); return; }
    dirty = false; here = location.hash; route();
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  var saved = store(true);
  if (saved) login(saved).then(route, function () { store(false, null); showLogin("Token expiré ou révoqué : reconnectez-vous."); });
  else showLogin();
})();
