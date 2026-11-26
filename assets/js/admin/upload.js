// Envoi chez Amazon, encodage, import de bundles / stills, relier les films, réglages « extras »
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Envoi chez Amazon et encodage (Gus 26/11) ----------
  // Envoi d'un fichier de l'ordinateur directement dans notre compartiment Amazon (dossier depot/), en morceaux de 16 Mo (3 à la
  // fois) : la fonction /api/depot du site signe les adresses d'envoi (clé de dépôt rangée dans Cloudflare, jamais ici). Coupure :
  // chaque morceau est réessayé ; page rechargée : le même fichier choisi de nouveau reprend où il en était (localStorage).
  var UP_PART = 16 * 1024 * 1024;
  function depot(body) {
    return fetch(SITE + "/api/depot", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || d.error) throw new Error(d.error || "envoi refusé (" + r.status + ")"); return d; }, function () { throw new Error("envoi refusé (" + r.status + ")"); }); });
  }
  // Images (stills, vignettes importées ou capturées, suites d'images ; Gus 25/11) : envoyées chez Amazon (depot/<dossier>/<nom>,
  // en une fois, signé par /api/depot op « img ») au lieu du dépôt GitHub (raw.githubusercontent : cache 5 min, lent). imgPut rend tout
  // de suite l'adresse définitive sur notre CloudFront (copie locale affichée en attendant : imgLocal) ; commit() attend la fin des
  // envois en cours avant d'écrire les données qui les citent (imgWait). 3 essais, puis alerte.
  var NOUS_CDN = "https://d3toxii6rvamjf.cloudfront.net/", imgUps = [];
  function imgDir() { var a = new Uint8Array(20); crypto.getRandomValues(a); return [].map.call(a, function (x) { return "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]; }).join(""); }
  function imgPut(name, base64, preview, dir) {
    var key = "depot/" + (dir || imgDir()) + "/" + name, url = NOUS_CDN + key, type = /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : "image/webp";
    if (preview) imgLocal[url] = preview;
    var bin = atob(base64), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var body = new Blob([bytes], { type: type });
    function once() {
      return depot({ op: "img", key: key }).then(function (d) {
        return fetch(d.url, { method: "PUT", body: body, headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } })
          .then(function (r) { if (!r.ok) throw new Error("Amazon " + r.status); });
      });
    }
    var p = track(once().catch(function () { return new Promise(function (r) { setTimeout(r, 1500); }).then(once); })
      .catch(function () { return new Promise(function (r) { setTimeout(r, 4000); }).then(once); }), true);
    imgUps.push(p);
    p.then(function () { imgUps = imgUps.filter(function (x) { return x !== p; }); }, function (e) { imgUps = imgUps.filter(function (x) { return x !== p; }); alert("Image pas envoyée chez Amazon (" + name + ") : " + e.message); });
    return url;
  }
  function imgWait() { return Promise.all(imgUps.map(function (p) { return p.catch(function () {}); })); }
  function upload(f, prog) {
    var sk = "kinou-up:" + f.name + ":" + f.size + ":" + f.lastModified, st = null, n = Math.max(1, Math.ceil(f.size / UP_PART)), etags = {}, urls = {}, live = {}, base = 0;
    function size(k) { return k < n ? UP_PART : f.size - (n - 1) * UP_PART; }
    function report() { var s = base; Object.keys(live).forEach(function (k) { s += live[k]; }); if (prog) prog(Math.min(1, s / f.size)); }
    try { st = JSON.parse(localStorage.getItem(sk) || "null"); } catch (e) {}
    var begin = st ? depot({ op: "list", key: st.key, uploadId: st.uploadId }).then(function (d) {
      (d.parts || []).forEach(function (p) { if (p.size === size(p.n)) { etags[p.n] = p.etag; base += p.size; } }); return st;
    }, function () { etags = {}; base = 0; return null; }) : Promise.resolve(null);
    return track(begin.then(function (s) {
      return s || depot({ op: "start", name: f.name, size: f.size }).then(function (d) { var x = { key: d.key, uploadId: d.uploadId }; try { localStorage.setItem(sk, JSON.stringify(x)); } catch (e) {} return x; });
    }).then(function (s) {
      st = s; report();
      var todo = []; for (var k = 1; k <= n; k++) if (!etags[k]) todo.push(k);
      function url(k) { // adresses d'envoi demandées 20 par 20, au fur et à mesure
        if (urls[k]) return Promise.resolve(urls[k]);
        var ask = todo.filter(function (x) { return x >= k && !urls[x] && !etags[x]; }).slice(0, 20);
        return depot({ op: "parts", key: st.key, uploadId: st.uploadId, numbers: ask }).then(function (d) { Object.assign(urls, d.urls); return urls[k]; });
      }
      function send(k, tries) {
        return url(k).then(function (u) {
          return new Promise(function (ok, ko) {
            var x = new XMLHttpRequest(); x.open("PUT", u);
            x.upload.onprogress = function (e) { live[k] = e.loaded; report(); };
            x.onload = function () { delete live[k]; if (x.status === 200 && x.getResponseHeader("ETag")) { etags[k] = x.getResponseHeader("ETag"); base += size(k); report(); ok(); } else ko(new Error("Amazon a refusé un morceau (" + x.status + ")")); };
            x.onerror = function () { delete live[k]; report(); ko(new Error("connexion coupée")); };
            x.send(f.slice((k - 1) * UP_PART, (k - 1) * UP_PART + size(k)));
          });
        }).catch(function (e) {
          if (tries >= 6) throw e;
          if (/40[03]/.test(e.message)) delete urls[k]; // adresse expirée : une nouvelle
          return new Promise(function (r) { setTimeout(r, 2000 * (tries + 1)); }).then(function () { return send(k, tries + 1); });
        });
      }
      var i = 0;
      function worker() { if (i >= todo.length) return Promise.resolve(); var k = todo[i++]; return send(k, 0).then(worker); }
      return Promise.all([worker(), worker(), worker()]);
    }).then(function () {
      return depot({ op: "complete", key: st.key, uploadId: st.uploadId, parts: Object.keys(etags).map(function (k) { return { n: +k, etag: etags[k] }; }) });
    }).then(function (d) { try { localStorage.removeItem(sk); } catch (e) {} return d.key; }), true);
  }
  // Demande au robot d'encodage (data/encode/<film|rapide>-….json, workflow encodage.yml) ; encWait relit le fichier jusqu'à la réponse.
  var encBusy = {}; // encodages déjà attendus dans cette page (par id)
  function encId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function encFile(kind, jobs) {
    var path = "data/encode/" + kind + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + ".json";
    return { path: path, text: json({ jobs: jobs, at: new Date().toISOString(), by: user && user.login || "" }) };
  }
  function encAsk(kind, jobs) {
    var f = encFile(kind, jobs);
    return commit([f], "Encodage : demande (admin, " + (user && user.login || "") + ")").then(function () { return f.path; });
  }
  function encWait(path, every, max, onPoll) { // onPoll(demande) à chaque lecture (avancement du robot)
    var t0 = Date.now();
    return new Promise(function (ok, ko) {
      (function poll() {
        setTimeout(function () {
          if (Date.now() - t0 > (max || 900000)) return ko(new Error("le robot d'encodage n'a pas répondu"));
          readFile(path).then(function (d) { if (d && d.doneAt) ok(d.jobs || []); else { if (d && onPoll) onPoll(d); poll(); } }, poll);
        }, every || 6000);
      })();
    });
  }
  function importBundle(link) {
    var id = bundleId(link);
    if (!id) return Promise.reject(new Error("Lien non reconnu : collez un lien shots.re/… ou kinou.slateapp.com/bundles/…"));
    return siteGet(SITE + "/api/bundle/" + id, "lecture du bundle impossible").catch(orRobot("bundle", /^[0-9a-f-]{36}$/.test(id) ? id : "https://shots.re/" + id));
  }
  // Demande une fois chaque vignette allégée au site : Netlify la prépare et la garde en cache,
  // le premier visiteur n'attend donc pas sa fabrication.
  function warmThumbs(clips) {
    if (siteDown) return; // Netlify hors service : rien à préparer
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
    function get(api) { return siteGet(SITE + api + encodeURIComponent(link.trim()), "lecture du lien impossible"); }
    return get("/api/stills?link=").catch(function (e) {
      if (e && e.down) throw e;
      return get("/api/reel?link=").then(function (d) {
        // Certaines vidéos Slate n'ont pas d'extrait (seulement le film complet) : on les garde quand même,
        // le robot GitHub ajoute leur film complet à la publication.
        var f = d.films && d.films[0];
        if (!f) throw e;
        return { link: d.link, title: f.title, full: f.full, video: f.video, img: f.img };
      }, function (e2) { throw e2 && e2.down ? e2 : e; });
    }).catch(orRobot("stills", link));
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
          if (x.cols && !n.stills) n.cols = x.cols;
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
    // Robot GitHub (Netlify hors service) : toutes les lectures d'un coup, pour qu'elles partent dans une seule demande.
    var all = siteDown ? jobs.map(function (job) { return job().catch(function () { failed++; }); }) : [worker(), worker(), worker(), worker()];
    return Promise.all(all).then(function () { return { links: jobs.length, failed: failed }; });
  }
  function relinkMsg(r) {
    if (!r.links) return "";
    return " " + (r.links - r.failed) + " lien" + (r.links - r.failed > 1 ? "s" : "") + " sous les films relu" + (r.links - r.failed > 1 ? "s" : "") + (r.failed ? " (" + r.failed + " sans réponse, ancienne version gardée)" : "") + ".";
  }
  // Mise en page en vigueur pour la vidéo n° i (son réglage, sinon celui de la dernière vidéo réglée au-dessus sans stills entre deux).
  function layOf(list, i) {
    for (var j = i; j >= 0; j--) { var y = list[j]; if (!y || y.stills) return null; if (y.cols) return { d: y.cols.d || 1, m: y.cols.m || 1 }; }
    return null;
  }
  // Film du video club (ou d'une bande) → ligne « sous le film » (Gus 26/11 : ajouter par recherche ou par lien de nos bandes).
  function extraFromFilm(f) {
    var vid = f.snipVideo || (f.snip && f.snip.v) || f.video || "";
    var n = (f.images && f.images.length && !f.full && !vid) ? { title: f.title, stills: f.images.slice() } : { title: f.title, full: f.full, video: vid, img: f.img };
    n.key = f.key; if (f.extras && !n.stills) { /* les lignes sous ce film ne suivent pas */ }
    Object.keys(n).forEach(function (k) { if (n[k] === undefined || n[k] === "" || n[k] === null) delete n[k]; });
    return n;
  }
  // Lien d'une de nos bandes ou d'un film partagé (…/b/<code>) → films. Un film seul est retrouvé par son code (notes/bandes/films.json),
  // une bande par son fichier (notes/bandes/<code>.json). Renvoie null si ce n'est pas un lien de chez nous.
  function ourCode(link) { var m = /\/b\/\??([a-z0-9]{9})(?![a-z0-9])/i.exec(String(link || "")); return m && !/shots\.re|slt\.re|slateapp/i.test(link) ? m[1].toLowerCase() : null; }
  function ourLinkFilms(link) {
    var code = ourCode(link); if (!code) return null;
    return nGet(BAND_NOTES + "films.json").then(function (t) {
      var m = t ? JSON.parse(t) : {}, key = Object.keys(m).filter(function (k) { return m[k].code === code; })[0];
      if (key) return bibLoad().then(function (d) { var f = d.films.filter(function (x) { return x.key === key; })[0]; if (!f) throw new Error("Ce film n'est plus dans le video club"); return [f]; });
      return nGet(BAND_NOTES + code + ".json").then(function (t2) {
        if (!t2) throw new Error("Lien inconnu : ni un film partagé ni une bande du video club");
        var b = JSON.parse(t2); return (b.items || []).filter(function (i) { return i.section === undefined; });
      });
    });
  }
  // Lien collé sous un film : Slate / shots.re, ou lien de nos bandes → liste de lignes.
  function extrasFromLink(link) {
    var o = ourLinkFilms(link);
    if (o) return o.then(function (l) { if (!l.length) throw new Error("Rien dans ce lien"); return l.map(function (f) { var n = extraFromFilm(f); n.link = link.trim(); return n; }); });
    return importStills(link).then(function (d) { return [extraOf(d)]; });
  }
  // Masquer au cas par cas (Gus 26/11) : `hide: [lieu, …]` sur une ligne ; lieux : « club » (video club et bandes), « fiction »,
  // « spotlight », ou l'adresse d'un chef op. Une ligne masquée ici reste visible ailleurs.
  function xHidden(x, ctx) { return !!(x && x.hide && x.hide.indexOf(ctx) > -1); }
  function xToggleHide(x, ctx) {
    var l = (x.hide || []).slice(), i = l.indexOf(ctx); if (i > -1) l.splice(i, 1); else l.push(ctx);
    if (l.length) x.hide = l; else delete x.hide;
  }
  // Glisser-déposer des lignes « sous le film » : poignée ⠿ (déplacer), et films déposés depuis la recherche. Les lignes portent data-xi.
  function xGrip(row, i) {
    var g = el("span", { class: "xgrip", draggable: "true", title: "Glisser pour changer l'ordre", text: "⠿" });
    g.addEventListener("dragstart", function (e) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-kinou-row", String(i)); try { e.dataTransfer.setDragImage(row, 12, 12); } catch (x) {} row.classList.add("xdrag"); });
    g.addEventListener("dragend", function () { row.classList.remove("xdrag"); });
    return g;
  }
  function xDropZone(box, onMove, onFilm) {
    function pos(e) { // numéro de la ligne avant laquelle on dépose (nombre de lignes = à la fin)
      var rows = [].filter.call(box.children, function (c) { return c.dataset && c.dataset.xi !== undefined; });
      box.querySelectorAll(".xover").forEach(function (r) { r.classList.remove("xover"); });
      for (var k = 0; k < rows.length; k++) { var r = rows[k].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { rows[k].classList.add("xover"); return +rows[k].dataset.xi; } }
      if (rows.length) rows[rows.length - 1].classList.add("xoverend");
      return rows.length;
    }
    function has(e, t) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types, t) > -1; }
    box.addEventListener("dragover", function (e) { if (has(e, "text/x-kinou-row") || (onFilm && has(e, "text/x-kinou-film"))) { e.preventDefault(); pos(e); } });
    box.addEventListener("dragleave", function (e) { if (!box.contains(e.relatedTarget)) box.querySelectorAll(".xover,.xoverend").forEach(function (r) { r.classList.remove("xover", "xoverend"); }); });
    box.addEventListener("drop", function (e) {
      var at = pos(e); box.querySelectorAll(".xover,.xoverend").forEach(function (r) { r.classList.remove("xover", "xoverend"); });
      if (has(e, "text/x-kinou-row")) { e.preventDefault(); var from = +e.dataTransfer.getData("text/x-kinou-row"); if (from !== at && from + 1 !== at) onMove(from, at > from ? at - 1 : at); }
      else if (onFilm && has(e, "text/x-kinou-film")) { e.preventDefault(); onFilm(e.dataTransfer.getData("text/x-kinou-film"), at); }
    });
  }
  // Recherche dans le video club (Gus 26/11) : fenêtre au centre, mêmes suggestions et filtres que le video club (chef op, réal, prod, client,
  // type, catégorie) ; clic = ajouter (la fenêtre reste ouverte pour en ajouter plusieurs), ou glisser un film vers la liste derrière.
  // Se ferme avec « Fermer », Échap ou un clic sur le fond.
  function bibPicker(title, pick) {
    var old = document.querySelector(".bpickm"); if (old) old.remove();
    var chips = [], inp = el("input", { type: "search", class: "find", placeholder: "Chef op, réal, prod, client, type, catégorie, titre…", autocomplete: "off" }), sugBox = el("div", { class: "bibsug", hidden: true }), chipsBox = el("div", { class: "bibchips" });
    var list = el("div", { class: "bpl" }), info = el("p", { class: "hint", text: "Chargement du video club…" }), data = null, si = -1;
    var ov = el("div", { class: "bmodal bpickm" }), box = el("div", { class: "bmbox" }, [el("span", { class: "label", text: title || "Rechercher dans le video club" }), el("div", { class: "bpwrap2" }, [inp, sugBox]), chipsBox, info, list,
      el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: close } })])]);
    function close() { document.removeEventListener("keydown", esc, true); ov.remove(); }
    function esc(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", esc, true);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.appendChild(box); document.body.appendChild(ov);
    function shown() { var words = bnrm(inp.value).split(/\s+/).filter(Boolean); return data.films.filter(function (f) { return chips.every(function (c) { return bibMatch(f, c); }) && words.every(function (w) { return f.hay.indexOf(w) > -1; }); }); }
    function suggest() {
      sugBox.textContent = ""; si = -1; var v = bnrm(inp.value); if (!data || !v) { sugBox.hidden = true; return; }
      var words = v.split(/\s+/), per = {};
      var hits = data.sug.filter(function (x) { var n = bnrm(x.value); return words.every(function (w) { return n.indexOf(w) > -1; }) && !chips.some(function (c) { return c.type === x.type && bnrm(c.value) === bnrm(x.value); }); })
        .sort(function (a, b) { return BIB_ORDER.indexOf(a.type) - BIB_ORDER.indexOf(b.type) || b.n - a.n; }).filter(function (x) { per[x.type] = (per[x.type] || 0) + 1; return per[x.type] <= 4; }).slice(0, 12);
      hits.forEach(function (x) { sugBox.appendChild(el("button", { type: "button", on: { mousedown: function (e) { e.preventDefault(); }, click: function () { chips.push({ type: x.type, value: x.value }); inp.value = ""; sugBox.hidden = true; draw(); inp.focus(); } } },
        [el("span", { class: "bst t-" + x.type, text: BIB_T[x.type] }), el("span", { text: x.value }), el("span", { class: "bsn", text: x.n + " film" + (x.n > 1 ? "s" : "") })])); });
      sugBox.hidden = !hits.length;
    }
    function draw() {
      chipsBox.textContent = ""; chips.forEach(function (c, i) { chipsBox.appendChild(el("button", { type: "button", class: "bchip", title: "Retirer ce filtre", on: { click: function () { chips.splice(i, 1); draw(); } } }, [el("span", { class: "bst t-" + c.type, text: BIB_T[c.type] }), c.value + " ×"])); });
      if (!data) return; var all = shown(), l = all.slice(0, 60);
      list.textContent = ""; info.textContent = all.length ? all.length + " film" + (all.length > 1 ? "s" : "") + " · clique pour ajouter, ou glisse vers la liste" : "Aucun film";
      l.forEach(function (f) {
        var th = el("i", { class: "bpth" }); if (f.img) th.style.backgroundImage = 'url("' + imgShow(f.img) + '")';
        var r = el("div", { class: "bpr", draggable: "true", title: "Cliquer pour ajouter · glisser pour placer" }, [th, el("span", { class: "bpt" }, [f.title || "(sans titre)", el("small", { text: [bibDirs(f).join(", "), f.dops.join(" & ")].filter(Boolean).join(" · ") })])]);
        r.addEventListener("click", function () { pick(f); r.classList.add("bpdone"); });
        r.addEventListener("dragstart", function (e) { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/x-kinou-film", f.key); });
        list.appendChild(r);
      });
    }
    inp.addEventListener("input", function () { suggest(); draw(); });
    inp.addEventListener("keydown", function (e) {
      var b = sugBox.querySelectorAll("button");
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && b.length) { e.preventDefault(); si = (si + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length; b.forEach(function (x, k) { x.classList.toggle("on", k === si); }); }
      else if (e.key === "Enter" && si > -1 && b[si]) { e.preventDefault(); b[si].click(); }
      else if (e.key === "Backspace" && !inp.value && chips.length) { chips.pop(); draw(); }
    });
    bibLoad().then(function (d) { data = d; draw(); inp.focus(); }, function (e) { info.textContent = "Video club indisponible : " + e.message; });
    return ov;
  }
  function extrasCtl(get, set, label, ctx) {
    var box = el("div", { class: "extras" }), openLay = -1; // réglage de colonnes ouvert (reste ouvert après un choix)
    function save(list) { set(list); touch(); draw(); }
    function kind(x) { return x.stills ? "Stills · " + x.stills.length : x.full || x.video ? "Vidéo" : "Vidéo · à publier"; }
    function row(x, i, list) {
      var input = el("input", { type: "url", class: "stills nodirty", placeholder: label, value: x ? x.link || x.title || "" : "" });
      if (x && !x.link && x.key) { input.readOnly = true; input.title = "Vidéo du video club (pas de lien) : on peut la déplacer, la masquer ou la retirer"; }
      var st = el("p", { class: "hint" });
      function load(force) {
        var v = input.value.trim();
        if (!v) { if (x) { list.splice(i, 1); save(list); } return; }
        if (x && !force && v === x.link) return; // Entrée : relit toujours Slate
        if (input._busy === v) return; // Entrée déclenche aussi « change »
        input._busy = v; st.textContent = "Lecture du lien" + slateWait("…");
        extrasFromLink(v).then(function (ns) {
          var n = ns[0];
          if (x && x.cols && !n.stills) n.cols = x.cols; // mise en page gardée quand on relit le lien
          if (x) list.splice.apply(list, [i, 1].concat(ns.map(function (y, k) { return k ? y : n; }))); else ns.forEach(function (y) { list.push(y); });
          save(list);
        }, function (e) { input._busy = null; st.textContent = e.message; });
      }
      input.addEventListener("change", function () { load(false); });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") load(true); });
      if (!x) {
        var find = el("button", { type: "button", class: "xbtn xfind", title: "Chercher un film dans le video club et l'ajouter", text: "🔍 Rechercher", on: { click: function () {
          bibPicker("Ajouter sous le film", function (f) { list.push(extraFromFilm(f)); save(list); });
        } } });
        return el("div", { class: "xrow add" }, [el("div", { class: "xline" }, [input, find]), st]);
      }
      function move(k) { var j = i + k; if (j < 0 || j >= list.length) return; list.splice(j, 0, list.splice(i, 1)[0]); save(list); }
      var up = el("button", { type: "button", class: "xbtn", title: "Monter", text: "↑", on: { click: function () { move(-1); } } });
      var down = el("button", { type: "button", class: "xbtn", title: "Descendre", text: "↓", on: { click: function () { move(1); } } });
      var del = el("button", { type: "button", class: "xbtn", title: "Retirer", text: "×", on: { click: function () { list.splice(i, 1); save(list); } } });
      up.disabled = i === 0; down.disabled = i === list.length - 1;
      // Mise en page des vidéos (Gus 18/11) : « + » = nombre de colonnes sur ordinateur et sur téléphone (1 à 3) → `cols: { d, m }`.
      // Les vidéos suivantes sans réglage suivent la même mise en page, jusqu'à des stills ou une vidéo qui a son propre réglage
      // (ex. 3 vidéos en ligne puis une grande : 3 colonnes sur la 1re, 1 colonne sur la 4e).
      var lay = null, lbtn = null;
      if (!x.stills) {
        var eff = layOf(list, i), own = !!x.cols;
        lbtn = el("button", { type: "button", class: "xbtn xlay" + (own ? " on" : eff ? " inh" : ""), title: "Affichage : colonnes sur ordinateur et sur téléphone",
          text: own ? eff.d + "·" + eff.m : eff ? "↳" + eff.d + "·" + eff.m : "+" });
        lbtn.addEventListener("click", function () { openLay = openLay === i ? -1 : i; lay.hidden = openLay !== i; });
        lay = el("div", { class: "xlaybox" }); lay.hidden = openLay !== i;
        var cur = x.cols || eff || { d: 1, m: 1 };
        [["d", "Colonnes ordi"], ["m", "Colonnes tél."]].forEach(function (k) {
          var g = el("div", { class: "xlayg" }, [el("span", { class: "label", text: k[1] })]);
          [1, 2, 3].forEach(function (n) {
            g.appendChild(el("button", { type: "button", class: "chip" + (own && cur[k[0]] === n ? " on" : ""), text: String(n), title: n + (n > 1 ? " colonnes" : " colonne"), on: { click: function () {
              var c = Object.assign({ d: cur.d, m: cur.m }, x.cols || {}); c[k[0]] = n; x.cols = c; save(list);
            } } }));
          });
          lay.appendChild(g);
        });
        lay.appendChild(el("p", { class: "hint", text: own ? "Les vidéos suivantes suivent ce réglage, jusqu'à des stills ou une vidéo qui a le sien." : eff ? "Suit le réglage d'une vidéo au-dessus (" + eff.d + " col. ordinateur, " + eff.m + " col. téléphone). Choisir ici = nouveau réglage à partir de cette vidéo." : "Par défaut : en grand, une par ligne." }));
        if (own) lay.appendChild(el("button", { type: "button", class: "btn ghost", text: "Retirer ce réglage", on: { click: function () { delete x.cols; save(list); } } }));
      }
      var eye = ctx ? el("button", { type: "button", class: "xbtn xeye" + (xHidden(x, ctx) ? " on" : ""), text: xHidden(x, ctx) ? "⊘" : "◉", title: xHidden(x, ctx) ? "Masquée sur cette page : cliquer pour la montrer de nouveau (visible ailleurs)" : "Masquer sur cette page seulement (visible ailleurs)", on: { click: function () { xToggleHide(x, ctx); save(list); } } }) : null;
      var tag = el("span", { class: "xkind", text: kind(x) });
      if (!x.stills && !x.full && !x.video) tag.title = "Pas d'extrait sur Slate : le film complet est ajouté par le robot GitHub environ 1 min après la publication.";
      if (x.img || (x.stills && x.stills[0])) tag.style.backgroundImage = 'url("' + (x.img || x.stills[0]) + '")';
      var rowEl = el("div", { class: "xrow" + (ctx && xHidden(x, ctx) ? " xhid" : ""), "data-xi": String(i) }, [el("div", { class: "xline" }, [xGrip(null, i), tag, input, lbtn || "", eye || "", up, down, del]), lay || "", st]);
      rowEl.querySelector(".xgrip").replaceWith(xGrip(rowEl, i));
      return rowEl;
    }
    function draw() {
      box.textContent = "";
      var list = extrasOf(get());
      list.forEach(function (x, i) { box.appendChild(row(x, i, list)); });
      box.appendChild(row(null, list.length, list));
    }
    xDropZone(box, function (from, to) { var l = extrasOf(get()); l.splice(to, 0, l.splice(from, 1)[0]); save(l); }, function (key, at) {
      bibLoad().then(function (d) { var f = d.films.filter(function (y) { return y.key === key; })[0]; if (!f) return; var l = extrasOf(get()); l.splice(at, 0, extraFromFilm(f)); save(l); });
    });
    draw();
    return box;
  }
  function refreshSite(slug) {
    if (siteDown) return Promise.reject(new Error("fonctions du site hors service"));
    return fetch(SITE + "/api/refresh/" + slug, { method: "POST", headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "mise à jour refusée"); }); });
  }
