// Admin kinou — édition des fiches des chefs op (data/dps/*.json) dans le repo GitHub Kinou-DoP/admin.
// Lecture et écriture via l'API GitHub (token personnel) ; import des bundles Slate via l'API du site.
(function () {
  var REPO = "Kinou-DoP/admin", BRANCH = "main";
  // Site qui héberge les fonctions Slate (/api/bundle, /api/refresh) et où l'on vérifie le résultat.
  var SITE = "https://beta--kinou-test.netlify.app"; // fonctions du site (Slate, données) : Netlify, figées depuis le 21/10
  var SITE_PAGES = "https://kinou-dop.github.io/site"; // le site lui-même (beta) : GitHub Pages ; bouton « Voir sur le site »
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
  // Liens courts Slate : slt.re/<code> = shots.re/<code> (les fonctions du site ne connaissent que shots.re).
  function shortLink(s) { return String(s || "").trim().replace(/^(https?:\/\/)?(www\.)?slt\.re\//i, "https://shots.re/"); }
  function bundleId(s) {
    s = shortLink(s);
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
  // Un seul commit pour tous les fichiers : [{ path, text } | { path, base64 } | { path, remove: true }]
  function commit(files, message) {
    var base;
    return gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH).then(function (ref) {
      base = ref.object.sha;
      return gh("/repos/" + REPO + "/git/commits/" + base);
    }).then(function (c) {
      return Promise.all(files.map(function (f) {
        if (f.remove) return { path: f.path, mode: "100644", type: "blob", sha: null }; // suppression
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
  // Page d'une vidéo : les fonctions Netlify sont figées (crédits épuisés) et /api/stills n'y lit que les images ;
  // on lit alors la page comme une bande (/api/reel, 1er film) : titre, extrait et vignette. Le film complet (`full`)
  // est ajouté juste après la publication par le robot GitHub (tools/fill-home.mjs).
  function importStills(link) {
    link = shortLink(link);
    function get(api) {
      return fetch(SITE + api + encodeURIComponent(link.trim()), { cache: "no-store" }).then(function (r) {
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "lecture du lien impossible"); return d; });
      });
    }
    return get("/api/stills?link=").catch(function (e) {
      return get("/api/reel?link=").then(function (d) {
        // Certaines vidéos Slate n'ont pas d'extrait (seulement le film complet) : on les garde quand même,
        // le robot GitHub ajoute leur film complet à la publication.
        var f = d.films && d.films[0];
        if (!f) throw e;
        return { link: d.link, title: f.title, full: f.full, video: f.video, img: f.img };
      }, function () { throw e; });
    });
  }
  // Sous un film, dans le lecteur du site : galeries de stills et autres vidéos (liens Slate « work » ou shots.re),
  // dans l'ordre choisi ici. Une case vide en bas pour ajouter un lien de plus ; flèches pour réordonner.
  // get() -> { extras, stills, stillsLink } (ancien format : stills seuls) ; set(liste) enregistre `extras`.
  function extrasOf(o) {
    if (o.extras) return o.extras.slice();
    return o.stills ? [{ link: o.stillsLink || "", stills: o.stills }] : [];
  }
  function extraOf(d) {
    var n = d.stills ? { link: d.link, title: d.title, stills: d.stills } : { link: d.link, title: d.title, full: d.full, video: d.video, img: d.img };
    Object.keys(n).forEach(function (k) { if (n[k] === undefined || n[k] === "") delete n[k]; });
    return n;
  }
  // « Relire le bundle » / « Rafraîchir » : relit aussi sur Slate tous les liens ajoutés sous les films (stills, vidéos
  // complémentaires, extrait au survol) de ces overrides, en gardant l'ordre ; un lien qui ne répond plus garde l'ancienne
  // version. Le film complet déjà ajouté par le robot est gardé si la vidéo n'a pas changé. -> Promise { links, failed }
  function relinkAll(holders) {
    var jobs = [], failed = 0;
    holders.forEach(function (o) {
      if (!o) return;
      (o.extras || []).forEach(function (x, i) {
        if (!x.link) return;
        jobs.push(function () { return importStills(x.link).then(function (d) {
          var n = extraOf(d);
          if (!n.full && x.full && n.video && n.video === x.video) n.full = x.full;
          o.extras[i] = n;
        }); });
      });
      if (!o.extras && o.stills && o.stillsLink) jobs.push(function () { return importStills(o.stillsLink).then(function (d) { if (d.stills) o.stills = d.stills; }); });
      if (o.hover && o.hover.link) jobs.push(function () { return importStills(o.hover.link).then(function (d) {
        if (!d.video) return;
        var h = { link: d.link, title: d.title, video: d.video }; if (d.img) h.img = d.img; o.hover = h;
      }); });
    });
    var next = 0;
    function worker() { // 4 lectures à la fois
      if (next >= jobs.length) return Promise.resolve();
      var job = jobs[next++];
      return job().catch(function () { failed++; }).then(worker);
    }
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () { return { links: jobs.length, failed: failed }; });
  }
  function relinkMsg(r) {
    if (!r.links) return "";
    return " " + (r.links - r.failed) + " lien" + (r.links - r.failed > 1 ? "s" : "") + " sous les films relu" + (r.links - r.failed > 1 ? "s" : "") + (r.failed ? " (" + r.failed + " sans réponse, ancienne version gardée)" : "") + ".";
  }
  function extrasCtl(get, set, label) {
    var box = el("div", { class: "extras" });
    function save(list) { set(list); touch(); draw(); }
    function kind(x) { return x.stills ? "Stills · " + x.stills.length : x.full || x.video ? "Vidéo" : "Vidéo · à publier"; }
    function row(x, i, list) {
      var input = el("input", { type: "url", class: "stills nodirty", placeholder: label, value: x ? x.link || "" : "" });
      var st = el("p", { class: "hint" });
      function load(force) {
        var v = input.value.trim();
        if (!v) { if (x) { list.splice(i, 1); save(list); } return; }
        if (x && !force && v === x.link) return; // Entrée : relit toujours Slate
        if (input._busy === v) return; // Entrée déclenche aussi « change »
        input._busy = v; st.textContent = "Lecture du lien…";
        importStills(v).then(function (d) {
          var n = extraOf(d);
          if (x) list[i] = n; else list.push(n);
          save(list);
        }, function (e) { input._busy = null; st.textContent = e.message; });
      }
      input.addEventListener("change", function () { load(false); });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") load(true); });
      if (!x) return el("div", { class: "xrow add" }, [el("div", { class: "xline" }, [input]), st]);
      function move(k) { var j = i + k; if (j < 0 || j >= list.length) return; list.splice(j, 0, list.splice(i, 1)[0]); save(list); }
      var up = el("button", { type: "button", class: "xbtn", title: "Monter", text: "↑", on: { click: function () { move(-1); } } });
      var down = el("button", { type: "button", class: "xbtn", title: "Descendre", text: "↓", on: { click: function () { move(1); } } });
      var del = el("button", { type: "button", class: "xbtn", title: "Retirer", text: "×", on: { click: function () { list.splice(i, 1); save(list); } } });
      up.disabled = i === 0; down.disabled = i === list.length - 1;
      var tag = el("span", { class: "xkind", text: kind(x) });
      if (!x.stills && !x.full && !x.video) tag.title = "Pas d'extrait sur Slate : le film complet est ajouté par le robot GitHub environ 1 min après la publication.";
      if (x.img || (x.stills && x.stills[0])) tag.style.backgroundImage = 'url("' + (x.img || x.stills[0]) + '")';
      return el("div", { class: "xrow" }, [el("div", { class: "xline" }, [tag, input, up, down, del]), st]);
    }
    function draw() {
      box.textContent = "";
      var list = extrasOf(get());
      list.forEach(function (x, i) { box.appendChild(row(x, i, list)); });
      box.appendChild(row(null, list.length, list));
    }
    draw();
    return box;
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
    Promise.all([loadIndex(), gh("/repos/" + REPO + "/contents/data/dps?ref=" + BRANCH), loadProgress()]).then(function (r) {
      var files = {}; r[1].forEach(function (f) { files[f.name] = true; });
      var ul = el("ul", { class: "dps" }), entries = [], want = 0; // want : étape choisie dans le tableau de bord (fiches pas encore à cette étape)
      index.dps.forEach(function (d) {
        var has = files[d.slug + ".json"], step = stepOf(d.slug, has);
        var li = el("li", {}, [el("a", { href: "#/dp/" + d.slug, class: has ? "live" : "" }, [d.name, has ? pips(step) : el("small", { text: "Pas encore de fiche" })])]);
        li._key = slugify(d.name).replace(/-/g, " ") + " " + d.slug.replace(/-/g, " "); li._step = step;
        entries.push({ step: step });
        ul.appendChild(li);
      });
      // Recherche : filtre la liste au fil de la frappe (sans accents ni majuscules) ; Entrée ouvre le 1er résultat.
      var find = el("input", { type: "search", class: "find", placeholder: "Rechercher un chef op…", autocomplete: "off" });
      var none = el("p", { class: "empty", text: "Aucun chef op ne correspond." }); none.hidden = true;
      function filter() {
        var q = slugify(find.value).replace(/-/g, " ").trim(), n = 0;
        [].forEach.call(ul.children, function (li) { var ok = (!q || li._key.indexOf(q) > -1) && (!want || li._step < want); li.hidden = !ok; if (ok) n++; });
        none.hidden = n > 0;
      }
      find.addEventListener("input", filter);
      find.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { find.value = ""; filter(); }
        if (e.key !== "Enter") return;
        var first = [].filter.call(ul.children, function (li) { return !li.hidden; })[0];
        if (first) location.hash = first.firstChild.getAttribute("href");
      });
      view.textContent = "";
      view.appendChild(el("div", { class: "list-head" }, [
        el("div", {}, [el("h1", { text: "Chefs opérateurs" }), el("p", { class: "lead", text: index.dps.length + " sur le site · " + Object.keys(files).filter(function (f) { return /\.json$/.test(f) && f !== "index.json"; }).length + " fiches publiées" })]),
        el("a", { class: "btn primary", href: "#/new", text: "+ Ajouter un chef op" })
      ]));
      view.appendChild(progressBoard(entries, function (k) { want = k; filter(); }));
      view.appendChild(find); view.appendChild(none); view.appendChild(ul);
      if (window.matchMedia("(hover: hover)").matches) find.focus({ preventScroll: true });
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }

  // ---------- Avancement des fiches (data/progress.json : { <slug>: { step, at, by } }) ----------
  // Suivi interne de l'équipe (n'apparaît pas sur le site) : curseur en haut à droite d'une fiche, tableau de bord sur la liste.
  // step : 0 = à faire, 1..4 = dernière étape faite. Sans entrée : 1 si la fiche est publiée (bundle importé), sinon 0.
  // Enregistré tout seul (sans « Publier ») : fichier relu juste avant, seule la ligne de ce chef op est changée.
  var STEPS = ["Importé", "Recadrage & noms", "Snippet", "Stills"], progress = null;
  function loadProgress() { return readFile("data/progress.json").then(function (p) { progress = p || {}; return progress; }); }
  function stepOf(slug, has) { var p = progress && progress[slug]; return p && typeof p.step === "number" ? p.step : (has ? 1 : 0); }
  function pips(step) {
    var s = el("small", { class: "pips" });
    STEPS.forEach(function (t, i) { s.appendChild(el("i", { class: i < step ? "on s" + (i + 1) : "", title: t })); });
    s.appendChild(document.createTextNode(step ? (step === 4 ? "Terminée ★" : STEPS[step - 1]) : "À faire"));
    return s;
  }
  var progT = 0, progQ = Promise.resolve();
  function saveStep(slug, name, step, note) {
    progress[slug] = { step: step, at: new Date().toISOString(), by: user.login };
    var entry = progress[slug];
    clearTimeout(progT); note.textContent = "…"; note.className = "pnote";
    progT = setTimeout(function () {
      progQ = progQ.then(function () {
        return readFile("data/progress.json").then(function (remote) {
          var out = remote || {}; out[slug] = entry;
          return commit([{ path: "data/progress.json", text: json(out) }], "Avancement " + name + " : " + (step ? STEPS[step - 1] : "à faire") + " (admin, " + user.login + ")");
        }).then(function () { note.textContent = "Enregistré"; note.className = "pnote ok"; },
          function (e) { note.textContent = "Échec : " + e.message; note.className = "pnote err"; });
      });
    }, 700);
  }
  // Curseur de la fiche : À faire → Importé → Recadrage & noms → Snippet → Stills.
  function progressCtl() {
    var slug = state.slug, cur = stepOf(slug, true);
    var range = el("input", { type: "range", min: "0", max: "4", step: "1", class: "nodirty", value: String(cur), "aria-label": "Avancement de la fiche" });
    var labels = el("div", { class: "plabels" }), note = el("span", { class: "pnote" });
    ["À faire"].concat(STEPS).forEach(function (t, i) {
      var b = el("button", { type: "button", text: t }); b.style.setProperty("--k", i);
      b.addEventListener("click", function () { if (+range.value === i) return; range.value = i; upd(true); });
      labels.appendChild(b);
    });
    var box = el("div", { class: "progress" }, [el("div", { class: "phead" }, [el("span", { class: "label", text: "Avancement" }), note]), el("div", { class: "ptrack" }, [range]), labels]);
    function upd(save) {
      var v = +range.value;
      box.style.setProperty("--p", v / 4); box.dataset.step = v;
      [].forEach.call(labels.children, function (b, i) { b.classList.toggle("done", i > 0 && i <= v); b.classList.toggle("on", i === v); });
      if (save) {
        saveStep(slug, state.name || slug, v, note);
        if (v === 4) { box.classList.remove("win"); void box.offsetWidth; box.classList.add("win"); }
      }
    }
    range.addEventListener("input", function () { upd(false); });
    range.addEventListener("change", function () { upd(true); });
    upd(false);
    return box;
  }
  // Tableau de bord de la liste, façon jeu vidéo : progression globale (somme des étapes / 4 × nombre de chefs op), une jauge
  // par étape (nombre de fiches qui l'ont passée) ; clic sur une jauge = n'afficher que les fiches qui ne l'ont pas encore passée.
  function progressBoard(entries, onPick) {
    var N = entries.length || 1, done = 0, max = N * 4;
    entries.forEach(function (e) { done += e.step; });
    var pct = done / max;
    function bar(ratio, cls) {
      var b = el("div", { class: "pbar " + (cls || "") }), lit = Math.round(ratio * 20);
      for (var i = 0; i < 20; i++) { var c = el("i", { class: i < lit ? "lit" : "" }); c.style.setProperty("--i", i); b.appendChild(c); }
      return b;
    }
    var board = el("section", { class: "board" });
    board.appendChild(el("div", { class: "bxp" }, [
      el("span", { class: "bt", text: "Progression globale" }),
      bar(pct, "xp"),
      el("div", { class: "bnum", text: Math.round(pct * 100) + " %" + (pct >= 1 ? " ★" : "") })]));
    var gauges = el("div", { class: "bgauges" }), picked = 0;
    STEPS.forEach(function (t, k) {
      var n = entries.filter(function (e) { return e.step > k; }).length;
      var g = el("button", { type: "button", class: "bgauge s" + (k + 1) + (n === entries.length ? " full" : ""), title: "Voir les fiches pas encore à l'étape « " + t + " »" }, [
        el("span", { class: "bt", text: t }), bar(n / N), el("span", { class: "bn", text: n + " / " + entries.length + (n === entries.length ? " ★" : "") })]);
      g.addEventListener("click", function () {
        picked = picked === k + 1 ? 0 : k + 1;
        [].forEach.call(gauges.children, function (x, i) { x.classList.toggle("on", picked === i + 1); });
        board.classList.toggle("filtering", !!picked); onPick(picked);
      });
      gauges.appendChild(g);
    });
    board.appendChild(gauges);
    return board;
  }

  // ---------- Fiche d'un chef op ----------
  // state : fiche en cours d'édition ; slate : dernier import du bundle (ou copie enregistrée)
  // listed : le chef op figure déjà dans la liste du site (son adresse existe, elle ne change pas).
  var state = null, slate = null, isNew = false, listed = false, origSlug = null, pending = {}, curCat = null, flash = "";
  // dirty : modifications faites dans la page mais pas encore publiées.
  var dirty = false;
  function touch() { dirty = true; status("Modifications non publiées : cliquez sur « Publier » pour les mettre en ligne.", "warn"); record(); }

  // ---------- Annuler / Rétablir ----------
  // Instantanés de la page ouverte (fiche, accueil ou contact), pris à chaque modification (saisie regroupée :
  // un instantané après 0,4 s de calme). pageModel : { get() -> { data, refs }, set(instantané) } posé par chaque page ;
  // data = l'objet enregistré (JSON), refs = objets gardés tels quels (bundle lu sur Slate, fichiers déposés).
  var pageModel = null, hist = null, histT = 0, hids = new WeakMap(), hidN = 0;
  var undoBtn = document.getElementById("undo"), redoBtn = document.getElementById("redo");
  function oid(o) { if (!o || typeof o !== "object") return 0; if (!hids.has(o)) hids.set(o, ++hidN); return hids.get(o); }
  function snapNow() {
    var m = pageModel.get(), refs = m.refs || {}, data = JSON.stringify(m.data);
    return { data: data, refs: Object.assign({}, refs), key: data + "|" + Object.keys(refs).sort().map(function (k) { return k + ":" + oid(refs[k]); }).join(",") };
  }
  function histBtns() {
    undoBtn.disabled = !hist || hist.i === 0;
    redoBtn.disabled = !hist || hist.i >= hist.stack.length - 1;
  }
  function histInit(model) { // à l'ouverture d'une page (pas à chaque réaffichage)
    pageModel = model;
    if (!hist) hist = { stack: [snapNow()], i: 0, d0: dirty };
    histBtns();
  }
  function histReset() { hist = null; clearTimeout(histT); histT = 0; histBtns(); }
  function histCommit() {
    clearTimeout(histT); histT = 0;
    if (!hist || !pageModel) return;
    var s = snapNow();
    if (s.key === hist.stack[hist.i].key) return;
    hist.stack.length = hist.i + 1; hist.stack.push(s); hist.i++;
    if (hist.stack.length > 100) { hist.stack.shift(); hist.i--; }
    histBtns();
  }
  function record() { if (!hist || hist.busy) return; clearTimeout(histT); histT = setTimeout(histCommit, 400); }
  function histGo(k) {
    if (!hist) return;
    if (histT) histCommit();
    var j = hist.i + k; if (j < 0 || j >= hist.stack.length) return;
    hist.i = j; var y = window.scrollY;
    dirty = j > 0 || hist.d0;
    hist.busy = true; pageModel.set(hist.stack[j]); hist.busy = false;
    if (dirty) status("Modifications non publiées : cliquez sur « Publier » pour les mettre en ligne.", "warn"); else status("");
    window.scrollTo(0, y); histBtns();
  }
  undoBtn.addEventListener("click", function () { histGo(-1); });
  redoBtn.addEventListener("click", function () { histGo(1); });
  // Raccourcis : ⌘Z / Ctrl+Z, ⌘⇧Z / Ctrl+Y ; dans un champ de texte, on laisse l'annulation du navigateur.
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || !hist || bar.hidden) return;
    var k = e.key.toLowerCase(), t = e.target, typing = t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(range|checkbox|button)$/.test(t.type)));
    if (typing || (k !== "z" && k !== "y")) return;
    e.preventDefault(); histGo(k === "y" || e.shiftKey ? 1 : -1);
  });
  // Toute saisie dans la fiche compte comme une modification (sauf le champ du lien de bundle).
  // editing : une page modifiable est ouverte (fiche, accueil, contact).
  var editing = false, pagePublish = null;
  view.addEventListener("input", function (e) { if (editing && !e.target.classList.contains("nodirty")) touch(); });

  function showDP(slug) {
    bar.hidden = true;
    view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([index ? index : loadIndex(), slug ? readFile("data/dps/" + slug + ".json") : null, loadProgress().catch(function () { progress = {}; })]).then(function (r) {
      var entry = slug && index.dps.filter(function (d) { return d.slug === slug; })[0];
      isNew = !r[1]; listed = !!entry; pending = {}; origSlug = listed || !isNew ? slug : null; // adresse actuelle
      state = r[1] || { slug: slug || "", name: entry ? entry.name : "", hue: 0, overrides: {}, about: {} };
      state.overrides = state.overrides || {}; state.about = state.about || {}; dirty = false; histReset();
      slate = state.clips ? { name: state.name, categories: state.categories || [], clips: state.clips } : null;
      curCat = null;
      render();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }

  function render() {
    view.textContent = ""; editing = true; pagePublish = publish;
    histInit({
      get: function () { return { data: state, refs: Object.assign({ slate: slate }, pending) }; },
      set: function (h) { state = JSON.parse(h.data); slate = h.refs.slate; pending = Object.assign({}, h.refs); delete pending.slate; render(); }
    });
    view.appendChild(el("div", { class: "dp-head" }, [el("h1", { text: state.name || "Nouveau chef op" }), isNew ? null : progressCtl()]));
    view.appendChild(el("p", { class: "lead", text: isNew ? "Nouvelle fiche — collez le lien du bundle Slate pour commencer." : (state.bundle ? "Films synchronisés avec Slate." : "Fiche sans bundle Slate : les films sont figés.") }));
    view.appendChild(bundleSection());
    view.appendChild(identitySection());
    view.appendChild(filmsSection());
    view.appendChild(aboutSection());
    bar.hidden = false;
    seeLink.href = SITE_PAGES + "/#" + (state.slug || "");
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
        st.textContent = "Lecture des liens ajoutés sous les films…";
        return relinkAll(Object.keys(state.overrides).map(function (k) { return state.overrides[k]; })).then(function (rl) { r[3] = rl; return r; });
      }).then(function (r) {
        if (!r) return;
        var d = r[0], known = r[1];
        slate = d; state.bundle = d.bundle; dirty = true;
        if (!state.name) state.name = d.name;
        if (known) { state.slug = origSlug = known.slug; listed = true; }
        if (isNew && !state.slug) state.slug = slugify(state.name);
        if (isNew) state.hue = hueOf(state.slug);
        if (isNew && state.open === undefined) { var f = d.clips.filter(function (c) { return c.featured; }).sort(function (a, b) { return a.featuredOrder - b.featuredOrder; })[0]; if (f) state.open = f.slate; }
        render();
        status((known ? "Déjà sur le site : la fiche reprend son adresse kinou.fr/" + known.slug + ". " : "") + "Bundle importé : " + d.clips.length + " films, " + d.categories.length + " onglets." + relinkMsg(r[3]) + " Vérifiez puis publiez.", "ok");
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
    var slug = el("input", { type: "text", value: state.slug || "" });
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
          el("p", { class: "hint", text: !origSlug ? "Proposée à partir du nom (sans accents ni majuscules)." : "Modifiable : à la publication, la fiche passe à la nouvelle adresse (liste des chefs op et liens de l'accueil suivent) ; l'ancienne adresse ne marche plus." })])
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

  // Recadrage d'un extrait (zoom 100 à 250 % ; 4:3 et bandes noires épaisses) pour enlever les bandes noires, avec aperçu :
  // l'extrait joue dans la vignette au survol et pendant le réglage. get() : zoom actuel ; set(z) : enregistre (1 = aucun).
  // getP / setP : position du cadre, "X% Y%" (absent = centre) ; le site s'en sert comme transform-origin / background-position.
  // getT / setT (optionnels) : case « aussi sur la vignette » (sinon seul l'extrait est recadré).
  var zoomStopOther = null; // un seul extrait joue à la fois : lancer un aperçu arrête le précédent
  function zoomCtl(thumb, video, get, set, getP, setP, getT, setT) {
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
      play(); apply(); touch();
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
      setP(x === 50 && y === 50 ? undefined : x + "% " + y + "%"); apply(); touch();
    });
    function endDrag() { if (!drag) return; drag = null; range.focus({ preventScroll: true }); } // le réglage continue
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);
    center.addEventListener("click", function () { setP(undefined); apply(); touch(); });
    thumb.addEventListener("mouseenter", play);
    thumb.addEventListener("mouseleave", stop);
    // Clic sur l'image : réglage (extrait entier + cadre rouge), comme en touchant le curseur.
    thumb.addEventListener("pointerdown", function () { if (adjusting) return; adjusting = true; play(); apply(); setTimeout(function () { range.focus({ preventScroll: true }); }); });
    apply();
    var box = el("div", { class: "zoom" }, [lab, range, center]);
    box._show = function () { adjusting = true; play(); apply(); range.focus({ preventScroll: true }); };
    if (!setT) return box;
    var cb = el("input", { type: "checkbox", class: "nodirty" }); cb.checked = !!getT();
    cb.addEventListener("change", function () { setT(cb.checked || undefined); apply(); touch(); });
    return el("div", {}, [box, el("label", { class: "zthumb" }, [cb, "Aussi sur la vignette"])]);
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
      if (state === spot) { if (c.artists && c.artists.length) chips.appendChild(el("span", { class: "chip", text: c.artists.join(" & ") })); } // spotlight : chef op crédité
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
        hin._busy = v; hst.textContent = "Lecture du lien…";
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
    var extras = extrasCtl(function () { return state.overrides[c.slate] || {}; }, function (list) {
      setOverride(c, "extras", list.length ? list : undefined); setOverride(c, "stills"); setOverride(c, "stillsLink"); sync();
    }, "Lien Slate de stills ou d'une vidéo, à afficher sous le film");
    title.addEventListener("input", function () { setOverride(c, "title", title.value); sync(); });
    sub.addEventListener("input", function () { setOverride(c, "sub", sub.value); sync(); });
    hide.addEventListener("click", function () { setOverride(c, "hidden", (state.overrides[c.slate] || {}).hidden ? undefined : true); sync(); touch(); });
    reset.addEventListener("click", function () { setOverride(c, "title"); setOverride(c, "sub"); title.value = c.title || ""; sub.value = c.sub || ""; sync(); touch(); });
    sync();
    // Projet en stills : le recadrage se règle sur l'extrait choisi pour le survol.
    var zvid = c.video || function () { var h = (state.overrides[c.slate] || {}).hover; return h && h.video; };
    var zoom = zoomCtl(thumb, zvid, function () { return (state.overrides[c.slate] || {}).zoom; }, function (z) { setOverride(c, "zoom", z); sync(); },
      function () { return (state.overrides[c.slate] || {}).zoomPos; }, function (p) { setOverride(c, "zoomPos", p); sync(); },
      function () { return (state.overrides[c.slate] || {}).zoomThumb; }, function (t) { setOverride(c, "zoomThumb", t); sync(); });
    card.appendChild(thumb); card.appendChild(zoom);
    if (state !== spot && (bgFilm() || {}).slate === c.slate) card.appendChild(filmPhoneCtl(c)); // 1er film FEATURED seulement (fiches)
    card.appendChild(title); card.appendChild(sub);
    card.appendChild(el("div", { class: "acts" }, [hide, reset]));
    if (hoverBox) card.appendChild(hoverBox);
    card.appendChild(extras);
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
    var moved = origSlug && s.slug !== origSlug;
    if (moved && index.dps.some(function (d) { return d.slug === s.slug; })) return status("L'adresse « " + s.slug + " » est déjà celle d'un autre chef op.", "err");
    publishBtn.disabled = true; status("Publication…");
    Promise.all([isNew || moved ? readFile("data/dps/" + s.slug + ".json") : null, moved ? readFile("data/home.json") : null]).then(function (r) {
      var existing = r[0];
      if (existing && moved) { publishBtn.disabled = false; return status("Une fiche existe déjà à l'adresse « " + s.slug + " » (" + existing.name + ").", "err"); }
      if (existing && !window.confirm("Une fiche existe déjà à l'adresse « " + s.slug + " » (" + existing.name + "). La remplacer ?")) { publishBtn.disabled = false; status(""); return; }
      doPublish(moved ? r[1] : null);
    }, function (e) { publishBtn.disabled = false; status(e.message, "err"); });
  }
  function doPublish(homeData) {
    var s = state, from = origSlug && s.slug !== origSlug ? origSlug : null; // changement d'adresse
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
    if (from && !isNew) files.push({ path: "data/dps/" + from + ".json", remove: true });
    // Nouvelle adresse : les liens de l'accueil vers ce chef op suivent.
    if (from && homeData) {
      var hit = false;
      (homeData.slides || []).forEach(function (sl) { (sl.dps || []).forEach(function (d) { if (d.slug === from) { d.slug = s.slug; hit = true; } }); if (sl.slug === from) { sl.slug = s.slug; hit = true; } });
      Object.keys(homeData.overrides || {}).forEach(function (k) { (homeData.overrides[k].dps || []).forEach(function (d) { if (d.slug === from) { d.slug = s.slug; hit = true; } }); });
      if (hit) files.push({ path: "data/home.json", text: json(homeData) });
    }
    // Liste des DPs : ajout (rangé par nom de famille) ou mise à jour du nom (et de l'adresse).
    var dps = index.dps.slice(), i = dps.findIndex(function (d) { return d.slug === (from || s.slug); });
    if (i > -1) { if (dps[i].name !== out.name || dps[i].slug !== s.slug) { dps[i] = Object.assign({}, dps[i], { name: out.name, slug: s.slug }); } }
    else {
      var k = surname(out.name), at = dps.findIndex(function (d) { return surname(d.name) > k; });
      dps.splice(at < 0 ? dps.length : at, 0, { slug: s.slug, name: out.name });
    }
    if (JSON.stringify(dps) !== JSON.stringify(index.dps)) files.push({ path: "data/dps/index.json", text: json({ dps: dps }) });
    commit(files, (isNew ? "Ajout " : "Mise à jour ") + out.name.split(",")[0] + " (admin, " + user.login + ")").then(function () {
      var wasNew = isNew;
      index.dps = dps; pending = {}; isNew = false; listed = true; state = out; dirty = false; origSlug = out.slug; histReset();
      if (homeData && home) home = null; // l'accueil sera relu (liens mis à jour)
      flash = from ? "Publié à la nouvelle adresse kinou.fr/" + out.slug + "." : "Publié. Le site sera à jour dans une minute environ.";
      if (wasNew || from) location.hash = "#/dp/" + out.slug; else render();
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
    link = shortLink(link);
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
    ["film", "song", "legend", "dps", "zoom", "zoomPos", "phoneX", "start", "stills", "stillsLink", "extras"].forEach(function (k) { sl[k] = o[k] !== undefined ? o[k] : src[k]; });
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
    view.appendChild(el("p", { class: "lead", text: "Les 10 premiers films d'une bande Slate défilent sur l'accueil, dans l'ordre de la bande." }));
    var input = el("input", { type: "url", class: "nodirty", placeholder: "Lien de la bande Slate (kinou.slateapp.com/… ou shots.re/…)", value: home.reel || "" });
    var imp = el("button", { class: "btn primary", text: home.reel ? "Rafraîchir" : "Importer" }), st = el("p", { class: "hint" });
    function load() {
      if (!input.value.trim()) return;
      imp.disabled = true; st.textContent = "Lecture de la bande…";
      importReel(input.value).then(function (d) {
        st.textContent = "Lecture des liens ajoutés sous les films…";
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
    bar.hidden = false; seeLink.href = SITE_PAGES + "/"; seeLink.hidden = false;
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
    function label() {
      lab.textContent = sl.start !== undefined ? t(sl.start) + " → " + t(sl.start + D) : "Extrait Slate";
      back.hidden = sl.start === undefined;
      btn.textContent = sl.start !== undefined ? "Extrait HD : " + t(sl.start) + " → " + t(sl.start + D) : "Extrait HD";
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
      hold(); setO("start", a); label(); touch(); seek(a);
    });
    range.addEventListener("change", release);
    range.addEventListener("pointerup", release);
    range.addEventListener("pointercancel", release);
    back.addEventListener("click", function () { setO("start", undefined); label(); touch(); if (v) v.currentTime = 0; });
    box.appendChild(el("p", { class: "hint", text: "Choisissez le début : le passage de " + String(D).replace(".", ",") + " s qui suit est lu sur l'accueil, en qualité du film complet, sans le son." }));
    box.appendChild(stage);
    box.appendChild(el("div", { class: "zoom" }, [lab, range]));
    box.appendChild(back);
    label();
    wrap.appendChild(box);
    wrap._open = function () { if (box.hidden) btn.click(); };
    return wrap;
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
      ["film", "song", "legend", "dps", "zoom", "zoomPos", "phoneX", "start", "stills", "stillsLink", "extras"].forEach(function (k) { sl[k] = sl.src[k]; });
      card.replaceWith(slideCard(sl)); touch();
    });
    card.appendChild(thumb);
    // Ce qui est lu sur l'accueil : le passage HD choisi (film complet, à partir de « start »), sinon l'extrait Slate.
    var D = (home.duration || 7000) / 1000;
    function media() { return sl.full && sl.start !== undefined ? { src: sl.full, start: sl.start, end: sl.start + D } : sl.video; }
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
      edit.addEventListener("click", function () { hstop(); videoEditor(sl, setO, D, media, function () { card.replaceWith(slideCard(sl)); }); });
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
    commit([{ path: "data/home.json", text: json(out) }], "Mise à jour de l'accueil (admin, " + user.login + ")").then(function () {
      home = out; dirty = false; histReset(); flash = "Publié. L'accueil est à jour sur le site.";
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
      dirty = false; histReset(); curCat = null; renderSpot();
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
              spot = s; spot.overrides = spot.overrides || {}; histReset(); renderSpot();
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
    seeLink.href = SITE_PAGES + "/#spotlight"; seeLink.hidden = false;
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
      out.reel = spot.reel; out.categories = spot.categories; out.overrides = spot.overrides;
      // « Relire la bande » avec le même lien : sans ce changement le fichier serait identique, le commit vide
      // et le robot GitHub (lancé seulement quand data/spotlight.json change) ne relirait pas la bande.
      if (justLink === true) out.readAsk = new Date().toISOString();
      return commit([{ path: "data/spotlight.json", text: json(out) }], "Mise à jour du Spotlight (admin, " + user.login + ")").then(function () { return out; });
    }).then(function (out) {
      out.overrides = spot.overrides; spot = out; dirty = false; histReset();
      refreshSite("spotlight").catch(function () {});
      if (justLink !== true) { flash = "Publié. Le robot relit la bande sur Slate (environ 1 minute)."; renderSpot(); }
      else status("Lien publié.", "ok");
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); throw e; })
      .then(function (r) { publishBtn.disabled = false; return r; }, function (e) { publishBtn.disabled = false; throw e; });
  }

  // ---------- Contact : data/contact.json (page contact du site) + data/site.json (logo du site) ----------
  var conf = null, ctc = null;
  function showContact() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([readFile("data/site.json"), readFile("data/contact.json")]).then(function (r) {
      conf = r[0] || {}; ctc = r[1] || {};
      ctc.team = ctc.team || []; ctc.address = ctc.address || []; ctc.social = ctc.social || {};
      pending = {}; dirty = false; histReset(); renderContact();
    })
      .catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  function renderContact() {
    view.textContent = ""; editing = true; pagePublish = publishContact;
    histInit({ get: function () { return { data: { conf: conf, ctc: ctc }, refs: Object.assign({}, pending) }; }, set: function (h) { var d = JSON.parse(h.data); conf = d.conf; ctc = d.ctc; pending = Object.assign({}, h.refs); renderContact(); } });
    view.appendChild(el("h1", { text: "Contact" }));
    view.appendChild(el("p", { class: "lead", text: "La page contact du site (lien « contact » de l'en-tête), présentée comme un générique de fin : le rôle à gauche, le nom à droite. Le rôle est écrit sur chaque ligne." }));
    // Équipe : une ligne par personne, dans l'ordre du site.
    var team = el("div", { class: "team" });
    function drawTeam() {
      team.textContent = "";
      ctc.team.forEach(function (t, i) {
        function inp(k, ph, type) {
          var x = el("input", { type: type || "text", placeholder: ph, value: t[k] || "" });
          x.addEventListener("input", function () { t[k] = x.value.trim(); });
          return x;
        }
        function btn(txt, title, fn, off) { var b = el("button", { class: "xbtn", type: "button", title: title, text: txt }); b.disabled = !!off; b.addEventListener("click", function () { fn(); drawTeam(); touch(); }); return b; }
        team.appendChild(el("div", { class: "tline" }, [inp("role", "Rôle (ex. Commercials)"), inp("name", "Prénom"), inp("email", "E-mail", "email"), inp("phone", "Téléphone", "tel"),
          btn("↑", "Monter", function () { ctc.team.splice(i - 1, 0, ctc.team.splice(i, 1)[0]); }, i === 0),
          btn("↓", "Descendre", function () { ctc.team.splice(i + 1, 0, ctc.team.splice(i, 1)[0]); }, i === ctc.team.length - 1),
          btn("×", "Retirer", function () { ctc.team.splice(i, 1); })]));
      });
      var add = el("button", { class: "btn ghost", type: "button", text: "+ Ajouter une personne" });
      add.addEventListener("click", function () { ctc.team.push({ role: "", name: "", email: "", phone: "" }); drawTeam(); touch(); var ins = team.querySelectorAll(".tline input"); if (ins.length) ins[ins.length - 4].focus(); });
      team.appendChild(add);
    }
    drawTeam();
    view.appendChild(el("section", {}, [el("h2", { text: "Équipe" }), team]));
    // Adresse, newsletter, réseaux
    var addr = el("textarea", { rows: "3", placeholder: "Une ligne par ligne d'adresse" }); addr.value = ctc.address.join("\n"); addr.style.minHeight = "0";
    addr.addEventListener("input", function () { ctc.address = addr.value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean); });
    var news = el("input", { type: "url", placeholder: "http://eepurl.com/…", value: ctc.newsletter || "" });
    news.addEventListener("input", function () { ctc.newsletter = news.value.trim(); });
    var newsL = el("input", { type: "text", placeholder: "Subscribe to the newsletter", value: ctc.newsletterLabel || "" });
    newsL.addEventListener("input", function () { ctc.newsletterLabel = newsL.value.trim(); });
    var soc = el("div", { class: "cols" });
    [["instagram", "Instagram"], ["vimeo", "Vimeo"], ["imdb", "IMDb"], ["facebook", "Facebook"]].forEach(function (x) {
      var i = el("input", { type: "url", placeholder: "https://…", value: ctc.social[x[0]] || "" });
      i.addEventListener("input", function () { ctc.social[x[0]] = i.value.trim(); });
      soc.appendChild(el("div", { class: "field" }, [el("label", { class: "label", text: x[1] }), i]));
    });
    view.appendChild(el("section", {}, [el("h2", { text: "Adresse et liens" }),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Adresse (cliquable sur le site : ouvre le plan)" }), addr]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Lien d'inscription à la newsletter" }), news,
          el("label", { class: "label", text: "Texte du bouton (entre crochets sur le site)" }), newsL])]),
      el("label", { class: "label", text: "Réseaux (un lien vide n'est pas affiché)" }), soc]));
    // Mentions légales
    var legal = el("textarea", { rows: "8", placeholder: "Texte des mentions légales (une ligne vide entre deux paragraphes)" }); legal.value = ctc.legal || "";
    legal.addEventListener("input", function () { ctc.legal = legal.value; });
    view.appendChild(el("section", {}, [el("h2", { text: "Mentions légales" }), legal,
      el("p", { class: "hint", text: "Obligatoires pour un site professionnel : nom de la société, forme juridique et capital, adresse du siège, numéro RCS (ou SIRET), numéro de TVA intracommunautaire, directeur de la publication, contact, et l'hébergeur du site (nom, adresse, téléphone). Une ligne seule et courte (« Éditeur », « Cookies »…) devient un titre. Vide = pas de lien « Mentions légales » sur le site." })]));
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
    bar.hidden = false; seeLink.href = SITE_PAGES + "/#contact"; seeLink.hidden = false;
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
    ctc.team = ctc.team.filter(function (t) { return t.name || t.email || t.phone; });
    files.push({ path: "data/contact.json", text: json(ctc) });
    commit(files, "Mise à jour du contact (admin, " + user.login + ")").then(function () {
      conf = out; pending = {}; dirty = false; histReset(); flash = "Publié. Rechargez le site pour voir les changements.";
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

  // ---------- Historique des publications ----------
  // Petite fenêtre (lien « historique » du menu) : derniers commits de data/ sur GitHub = qui a publié quoi et quand.
  // Sur une fiche / l'accueil / le contact : l'historique de ce fichier, avec un bouton pour tout voir.
  var histBox = document.getElementById("hist"), histAll = false;
  function histPath() {
    var h = location.hash;
    if (/^#\/dp\//.test(h)) return "data/dps/" + decodeURIComponent(h.slice(5)) + ".json";
    if (h === "#/home") return "data/home.json";
    if (h === "#/contact") return "data/contact.json";
    if (h === "#/spotlight") return "data/spotlight.json";
    return null;
  }
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
    gh("/repos/" + REPO + "/commits?sha=" + BRANCH + "&per_page=40&path=" + encodeURIComponent(path || "data")).then(function (cs) {
      list.textContent = "";
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
  function route() {
    var h = location.hash;
    document.getElementById("back").hidden = !token || !/^#\/(dp\/|new)/.test(h);
    var page = /^#\/(home|spotlight|fiction|press|contact)$/.test(h) ? h.slice(2) : "cinematographers";
    side.hidden = !token;
    side.querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.page === page); });
    if (!token) return showLogin();
    if (/^#\/dp\//.test(h)) return showDP(decodeURIComponent(h.slice(5)));
    if (h === "#/new") return showDP(null);
    if (page === "home") return showHome();
    if (page === "contact") return showContact();
    if (page === "spotlight") return showSpot();
    if (page === "fiction") return showSoon("Fiction");
    if (page === "press") return showSoon("Press");
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
