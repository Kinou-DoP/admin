// Admin kinou — édition des fiches des chefs op (data/dps/*.json) dans le repo GitHub Kinou-DoP/admin.
// Lecture et écriture via l'API GitHub (token personnel) ; import des bundles Slate via l'API du site.
// Noyau (ce fichier est chargé en premier) — portée globale partagée avec assets/js/admin/*.js (ordre : index.html).

  var REPO = "Kinou-DoP/admin", BRANCH = "main";
  // Site qui héberge les fonctions Slate (/api/bundle, /api/refresh) et où l'on vérifie le résultat.
  var SITE = "https://kinou-4tv.pages.dev"; // fonctions du site (lecture de Slate, refresh) : Cloudflare Pages (functions/ du dépôt site, 16/11) ;
  // avant : Netlify (beta--kinou-test.netlify.app), coupé depuis le 30/10. Hors service ou trop long → robot GitHub (siteDown).
  var SITE_PAGES = "https://kinou-dop.github.io/site"; // le site lui-même (beta) : GitHub Pages (pages d'aperçu des liens)
  var SITE_VIEW = "https://kinou-4tv.pages.dev"; // bouton « Voir sur le site » : copie Cloudflare de la beta (essai, Gus 16/11)
  var TOKEN_KEY = "kinou-admin-token";
  // Sites dont on prépare les vignettes (service d'images Netlify) après une publication.
  var WARM_SITES = [SITE, "https://kinou-test.netlify.app"];

  var view = document.getElementById("view"), who = document.getElementById("who");
  var bar = document.getElementById("bar"), statusEl = document.getElementById("status");
  var publishBtn = document.getElementById("publish"), seeLink = document.getElementById("see");
  var side = document.getElementById("side");
  var token = null, user = null, index = null;
  // Version de l'admin : si une version plus récente est en ligne (téléphone qui garde l'ancienne en mémoire…), bandeau
  // « Nouvelle version disponible » en haut, et la publication est bloquée tant qu'on n'a pas rechargé : une ancienne version
  // effacerait les réglages qu'elle ne connaît pas (ex. `showcase` de Vadim, effacé depuis un téléphone le 30/10).
  var MY_V = (((document.currentScript && document.currentScript.src) || "").match(/[?&]v=(\d+)/) || [])[1], newer = false;
  function checkVersion() {
    return fetch(location.pathname + "?_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
      var m = t.match(/admin\.js\?v=(\d+)/);
      if (!m || !MY_V || m[1] === MY_V) return;
      if (newer) return;
      newer = true;
      // Bandeau en haut (Gus 30/10) : « Nouvelle version disponible » + Recharger. La publication reste bloquée d'ici là.
      var go = el("button", { type: "button", text: "Recharger" });
      go.addEventListener("click", function () {
        // Modifications non publiées : gardées le temps du rechargement, puis remises dans la nouvelle version (Gus 03/11).
        if (dirty && !saveDraft() && !window.confirm("Vos modifications non publiées n'ont pas pu être gardées et seront perdues. Recharger quand même ?")) return;
        location.replace(location.pathname + "?v=" + m[1] + location.hash);
      });
      document.body.appendChild(el("div", { class: "newver" }, [el("span", { text: "Nouvelle version de l'admin disponible" }), go]));
    }).catch(function () {});
  }
  checkVersion();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkVersion(); });
  // Aussi toutes les minutes et à chaque changement de page (Gus 16/11) : sur les pages enregistrées tout de suite
  // (récupération, festivals, sorties…), on ne publie jamais et l'onglet peut rester ouvert à l'écran des heures.
  setInterval(function () { if (!document.hidden) checkVersion(); }, 60000);
  window.addEventListener("hashchange", function () { checkVersion(); });

  // ---------- Outils ----------
  // Vidéos jouées depuis NOTRE hébergement Amazon (copie de tout Slate le 25/11, au même chemin que sur le CloudFront de Slate) :
  // seul le début de l'adresse change. Les données gardent l'adresse Slate (rien à republier). Fichier absent chez nous (film
  // ajouté sur Slate depuis la copie) : repli automatique sur Slate. Les captures d'image passent toujours par /api/media du site.
  var SLATE_CDN = "https://d1ko11x0ybxl0h.cloudfront.net/", NOTRE_CDN = "https://d3toxii6rvamjf.cloudfront.net/";
  function notreCDN(u) { return typeof u === "string" && u.indexOf(SLATE_CDN) === 0 ? NOTRE_CDN + u.slice(SLATE_CDN.length) : u; }
  var srcMedia = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  Object.defineProperty(HTMLMediaElement.prototype, "src", { configurable: true, enumerable: srcMedia.enumerable, get: srcMedia.get,
    set: function (u) { delete this.dataset.repliSlate; srcMedia.set.call(this, cdnPanne ? u : notreCDN(u)); } });
  // Lecture demandée (play) : relancée après le repli. Notre CloudFront muet (2 replis, rien lu chez nous) : Slate pour la suite.
  var jouerMedia = HTMLMediaElement.prototype.play, cdnOk = false, cdnReplis = 0, cdnPanne = false;
  HTMLMediaElement.prototype.play = function () { this.veutJouer = true; return jouerMedia.apply(this, arguments); };
  document.addEventListener("loadeddata", function (ev) { var u = ev.target.getAttribute && ev.target.getAttribute("src"); if (u && u.indexOf(NOTRE_CDN) === 0) cdnOk = true; }, true);
  document.addEventListener("error", function (ev) {
    var v = ev.target, u = v instanceof HTMLMediaElement && v.getAttribute("src");
    if (!u || u.indexOf(NOTRE_CDN) !== 0 || v.dataset.repliSlate) return;
    if (u.indexOf(NOTRE_CDN + "nous/") === 0) return; // nos vidéos encodées (envoyées depuis l'ordinateur) : pas de copie chez Slate
    if (++cdnReplis >= 2 && !cdnOk) cdnPanne = true;
    ev.stopImmediatePropagation(); // l'échec chez nous ne compte pas comme une erreur de la vidéo
    v.dataset.repliSlate = "1"; srcMedia.set.call(v, SLATE_CDN + u.slice(NOTRE_CDN.length)); // repli : Slate
    if (v.autoplay || v.veutJouer) { var p = jouerMedia.call(v); if (p && p.catch) p.catch(function () {}); }
  }, true);
  // Images pas encore en ligne (Gus 26/11 : vignettes grises) : une image importée ou capturée est enregistrée dans le dépôt quelques
  // secondes plus tard, et raw.githubusercontent garde jusqu'à 5 min le « pas trouvé » demandé avant. En attendant, on affiche la copie
  // locale (imgLocal[adresse] = blob) partout où l'adresse apparaît dans un style (el) ou une image de fond (imgShow).
  var imgLocal = {};
  function imgShow(u) { return (u && imgLocal[u]) || u; }
  function imgStyle(st) { return typeof st === "string" && st.indexOf("url(") > -1 ? st.replace(/url\("([^"]+)"\)/g, function (m, u) { return 'url("' + imgShow(u) + '")'; }) : st; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs && attrs.style) attrs.style = imgStyle(attrs.style);
    if (attrs && attrs.src && tag === "img") attrs.src = imgShow(attrs.src);
    for (var k in attrs || {}) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "src" && e instanceof HTMLMediaElement) { if (attrs[k]) e.src = attrs[k]; } // → notreCDN (ci-dessus)
      else if (k === "on") for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  // Message de la barre du bas. Téléphone : sur une ligne (vide = pas de ligne) ; trop long, il défile doucement (.run).
  // Téléphone : toucher autre chose qu'un champ de texte (curseur, vignette, bouton…) quitte le champ en cours d'édition.
  // Sinon iOS le garde actif : au lâcher d'un curseur, le clavier revenait et la page remontait jusqu'au texte édité.
  document.addEventListener("pointerdown", function (e) {
    var a = document.activeElement, txt = function (n) { return n && (n.tagName === "TEXTAREA" || n.isContentEditable || (n.tagName === "INPUT" && !/^(range|checkbox|radio|button|submit|file|color)$/.test(n.type))); };
    if (e.pointerType !== "mouse" && txt(a) && !txt(e.target)) a.blur();
  }, true);
  function status(msg, kind) {
    statusEl.textContent = ""; statusEl.className = "status" + (kind ? " " + kind : "");
    if (!msg) return;
    var t = el("span", { text: msg }); statusEl.appendChild(t);
    requestAnimationFrame(function () {
      var over = t.scrollWidth - statusEl.clientWidth;
      if (over > 2) { statusEl.classList.add("run"); t.style.setProperty("--over", -over + "px"); t.style.animationDuration = Math.max(4, over / 30 + 3) + "s"; }
    });
  }
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

  // ---------- Enregistrements en cours (Gus 23/11) ----------
  // Tout ce qui s'enregistre tout seul (notes, bandes, infos des films, prix, pages enregistrées tout de suite…) continue en
  // arrière-plan quand on change de page dans l'admin ; un enregistrement prévu (« dans 1 s ») part tout de suite au changement
  // de page (`flushSaves`) ; tant qu'il reste un enregistrement en cours ou prévu, fermer / recharger l'onglet demande
  // confirmation (`beforeunload`). Pastille en bas à gauche (`#saving`) : « Enregistrement… », « Enregistré », « Pas enregistré ».
  // `soon(clé, fn, ms)` remplace les setTimeout des enregistrements automatiques ; `track(promesse)` compte un enregistrement.
  var saves = { n: 0, timers: {}, ok: 0, err: "" }, savesEl = null, savesHide = 0;
  function savesUI() {
    if (!savesEl) { savesEl = el("div", { id: "saving", "aria-live": "polite" }); savesEl.addEventListener("click", function () { saves.err = ""; savesUI(); }); document.body.appendChild(savesEl); }
    var busy = savesPending();
    clearTimeout(savesHide);
    savesEl.className = busy ? "busy" : saves.err ? "err" : saves.ok ? "ok" : "";
    savesEl.textContent = busy ? "Enregistrement…" : saves.err ? "Pas enregistré : " + saves.err : saves.ok ? "Enregistré" : "";
    savesEl.title = saves.err ? "Cliquer pour fermer" : "";
    if (!busy && saves.ok && !saves.err) savesHide = setTimeout(function () { saves.ok = 0; savesUI(); }, 2500);
  }
  function savesPending() { return saves.n > 0 || Object.keys(saves.timers).length > 0; }
  function track(p, quiet) {
    saves.n++; savesUI();
    function end() { saves.n--; savesUI(); }
    p.then(function () { if (!quiet) { saves.ok = 1; } end(); }, function (e) { if (!quiet) saves.err = String(e && e.message || e).slice(0, 140); end(); });
    return p;
  }
  function soon(key, fn, ms) {
    var o = saves.timers[key]; if (o) clearTimeout(o.t);
    o = saves.timers[key] = { fn: fn };
    o.t = setTimeout(function () { if (saves.timers[key] === o) delete saves.timers[key]; runSave(fn); }, ms);
    savesUI();
  }
  function unsoon(key) { var o = saves.timers[key]; if (o) { clearTimeout(o.t); delete saves.timers[key]; savesUI(); } }
  function runSave(fn) { var r; try { r = fn(); } catch (e) { saves.err = e.message; } if (r && r.then) track(r); else savesUI(); }
  function flushSaves() { Object.keys(saves.timers).forEach(function (k) { var o = saves.timers[k]; clearTimeout(o.t); delete saves.timers[k]; runSave(o.fn); }); }

  // ---------- API GitHub ----------
  function gh(path, opts) {
    opts = opts || {};
    if (opts.method && opts.method !== "GET" && !opts.untracked) { var o2 = Object.assign({}, opts, { untracked: true }); return track(gh(path, o2), true); }
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
  // Si un autre commit arrive pendant ce temps (robot GitHub qui répond, autre personne qui publie : « Update is not a fast
  // forward », GitHub 422), on refait le commit par-dessus le nouveau dernier commit, 3 fois au plus (Gus 04/11).
  function commit(files, message, tries) {
    if (tries === undefined) return track(imgWait().then(function () { return commit(files, message, 0); }), true);
    tries = tries || 0;
    return commitOnce(files, message).catch(function (e) {
      if (tries >= 3 || !/GitHub 422/.test(e.message)) throw e;
      return new Promise(function (r) { setTimeout(r, 1200 + tries * 800); }).then(function () { return commit(files, message, tries + 1); });
    });
  }
  function commitOnce(files, message) {
    var base;
    return gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH).then(function (ref) {
      base = ref.object.sha;
      return gh("/repos/" + REPO + "/git/commits/" + base);
    }).then(function (c) {
      return Promise.all(files.map(function (f) {
        // { path, edit: function (texte du fichier dans le dernier commit) → nouveau texte (null = rien à changer) } : le
        // fichier est relu dans le commit de base (pas une copie gardée en mémoire depuis l'ouverture de la page : sinon une
        // publication effaçait les changements faits entre-temps, ex. le genre d'autres chefs op dans index.json, Gus 17/11).
        if (f.edit) return gh("/repos/" + REPO + "/contents/" + f.path + "?ref=" + base, { raw: true, allow404: true }).then(function (t) {
          var n = f.edit(t);
          if (n === null || n === undefined) return null;
          return gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: { content: n, encoding: "utf-8" } }).then(function (b) { return { path: f.path, mode: "100644", type: "blob", sha: b.sha }; });
        });
        if (f.remove) return { path: f.path, mode: "100644", type: "blob", sha: null }; // suppression
        var body = f.base64 !== undefined ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" };
        return gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: body }).then(function (b) { return { path: f.path, mode: "100644", type: "blob", sha: b.sha }; });
      })).then(function (tree) {
        tree = tree.filter(Boolean);
        if (!tree.length) return null; // rien à changer (fichiers `edit` déjà à jour) : pas de commit vide
        return gh("/repos/" + REPO + "/git/trees", { method: "POST", body: { base_tree: c.tree.sha, tree: tree } });
      });
    }).then(function (tree) {
      if (!tree) return null;
      return gh("/repos/" + REPO + "/git/commits", { method: "POST", body: { message: message, tree: tree.sha, parents: [base] } });
    }).then(function (c) {
      if (!c) return null;
      return gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: c.sha } });
    });
  }
  function json(o) { return JSON.stringify(o, null, 2) + "\n"; }

  // Robot GitHub : juste après une publication, il ajoute le film complet des vidéos ajoutées sous un film qui n'en ont pas
  // (« Vidéo · à publier », souvent des vidéos sans extrait sur Slate). Mais il ne peut pas vider le cache du site (son jeton
  // est refusé par /api/refresh) : le site gardait jusqu'à 5 min la version sans film, donc sans la vidéo. On attend son commit
  // (2 min au plus), puis on vide le cache avec la clé de la personne connectée et on reprend ses films complets dans la page.
  function needsRobot(lists) {
    return lists.some(function (l) { return (l || []).some(function (x) { return x && !x.stills && !x.full && x.link; }); });
  }
  function extrasLists(overrides, slides) {
    var l = Object.keys(overrides || {}).map(function (k) { return overrides[k].extras; });
    (slides || []).forEach(function (sl) { l.push(sl.extras); });
    return l;
  }
  // Films complets du fichier relu (src) recopiés dans la page ouverte (dst), vidéo par vidéo (même lien).
  function fullsFrom(dst, src) {
    var got = {};
    extrasLists(src.overrides, src.slides).forEach(function (l) { (l || []).forEach(function (x) { if (x.full && x.link) got[x.link] = x.full; }); });
    extrasLists(dst.overrides, dst.slides).forEach(function (l) { (l || []).forEach(function (x) { if (!x.full && !x.stills && got[x.link]) x.full = got[x.link]; }); });
  }
  // Champs écrits par le robot dans les overrides d'une fiche (l'admin ne les modifie jamais) : repris du fichier en ligne (src).
  var ROBOT_KEYS = ["images", "ratios", "types"];
  function robotFrom(dst, src) {
    var so = src.overrides || {};
    dst.overrides = dst.overrides || {};
    Object.keys(so).forEach(function (id) {
      ROBOT_KEYS.forEach(function (k) {
        if (so[id][k] === undefined) return;
        var d = dst.overrides[id] || (dst.overrides[id] = {});
        d[k] = so[id][k];
      });
    });
    fullsFrom(dst, src);
    sharedMerge(dst.overrides, so);
    awMerge(dst.overrides, so);
  }
  // Films reliés (Gus 17/11) : le robot recopie infos et stills / vidéos d'un film d'une page à l'autre (même id Slate :
  // fiches, fiction, spotlight ; tools/link-films.mjs). Une page ouverte avant cette recopie ne doit pas la défaire en publiant :
  // ce que la page n'a pas touché depuis son ouverture (`ovBase`) est repris de la version en ligne (fusion à trois).
  var SHARED_KEYS = ["info", "extras", "stills", "stillsLink"], ovBase = {};
  function sharedSnap(ov) {
    var r = {};
    Object.keys(ov || {}).forEach(function (id) {
      var p = {}; SHARED_KEYS.forEach(function (k) { if (ov[id][k] !== undefined) p[k] = JSON.parse(JSON.stringify(ov[id][k])); });
      if (Object.keys(p).length) r[id] = p;
    });
    return r;
  }
  function sharedMerge(dst, src) {
    var J = function (x) { return JSON.stringify(x); };
    var ids = {}; [dst, src, ovBase].forEach(function (o) { Object.keys(o || {}).forEach(function (id) { ids[id] = 1; }); });
    Object.keys(ids).forEach(function (id) {
      var base = ovBase[id] || {}, rem = sharedSnap({ x: (src || {})[id] || {} }).x || {}, loc = dst[id] || {}, o = Object.assign({}, loc), ch = false;
      // Infos : clé par clé.
      var bi = base.info || {}, ri = rem.info || {}, li = Object.assign({}, loc.info || {}), ki = {};
      [bi, ri, li].forEach(function (x) { Object.keys(x).forEach(function (k) { ki[k] = 1; }); });
      Object.keys(ki).forEach(function (k) {
        if (/^awards/.test(k)) return; // prix : awMerge s'en charge (lignes ajoutées / retirées)
        if (J(li[k]) === J(bi[k]) && J(ri[k]) !== J(bi[k])) { if (ri[k] === undefined) delete li[k]; else li[k] = ri[k]; ch = true; }
      });
      if (ch) { if (Object.keys(li).length) o.info = li; else delete o.info; }
      SHARED_KEYS.forEach(function (k) {
        if (k === "info") return;
        if (J(loc[k]) === J(base[k]) && J(rem[k]) !== J(base[k])) { if (rem[k] === undefined) delete o[k]; else o[k] = rem[k]; ch = true; }
      });
      if (!ch) return;
      if (Object.keys(o).length) dst[id] = o; else delete dst[id];
    });
  }
  // Prix ajoutés par la synchronisation « Nos sélections » (`info.awardsFrom` = { id de la trouvaille: ligne }) : le fichier en
  // ligne fait foi. Une page ouverte avant la synchronisation les garde donc à la publication (lignes ajoutées ou retirées).
  function awMerge(dst, src) {
    Object.keys(src || {}).forEach(function (id) {
      var sf = (src[id].info || {}).awardsFrom, d = dst[id], df = d && d.info && d.info.awardsFrom;
      if (!sf && !df) return;
      d = dst[id] || (dst[id] = {}); var info = d.info = Object.assign({}, d.info || {}); df = info.awardsFrom || {}; sf = sf || {};
      var lines = String(info.awards || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), hid = (info.awardsHidden || []).slice(), nf = {};
      Object.keys(df).forEach(function (k) {
        if (k in sf) return;
        var i = lines.indexOf(df[k]); if (i > -1) lines.splice(i, 1);
        i = hid.indexOf(df[k]); if (i > -1) hid.splice(i, 1);
      });
      Object.keys(sf).forEach(function (k) {
        if (k in df) { nf[k] = df[k]; return; } // ligne déjà là, peut-être corrigée ou masquée ici : on garde la version de la page
        nf[k] = sf[k]; if (lines.indexOf(sf[k]) < 0 && hid.indexOf(sf[k]) < 0) lines.push(sf[k]);
      });
      info.awards = lines.join("\n"); if (!info.awards) delete info.awards;
      if (hid.length) info.awardsHidden = hid; else delete info.awardsHidden;
      if (Object.keys(nf).length) info.awardsFrom = nf; else delete info.awardsFrom;
    });
  }
  function afterRobot(path, ref, slug, done) {
    var sha = ref && ref.object && ref.object.sha, t0 = Date.now();
    if (!sha) return;
    (function poll() {
      if (Date.now() - t0 > 150000) return;
      setTimeout(function () {
        gh("/repos/" + REPO + "/commits?path=" + path + "&sha=" + BRANCH + "&per_page=1").then(function (l) {
          var c = l && l[0];
          if (!c || c.sha === sha || !/kinou-robot|github-actions/.test(c.commit.author.name || "")) return poll();
          return refreshSite(slug).catch(function () {}).then(function () { return readFile(path); }).then(function (d) { if (d) done(d); });
        }).catch(poll);
      }, 8000);
    })();
  }

  // ---------- API du site (Slate) ----------
  // Lecture de Slate : par les fonctions Netlify du site (SITE) ; si elles ne répondent pas (coupées : « Usage exceeded », 30/10),
  // par le robot GitHub : demande déposée dans data/ask/, réponse écrite dans le même fichier par tools/ask.mjs (environ 1 min).
  // Les demandes faites ensemble (ex. tous les liens de stills d'une fiche) partent dans un seul fichier.
  var siteDown = false, askQ = [], askT = 0;
  function slateWait(fast) { return siteDown ? " (par le robot GitHub : environ 1 min)…" : fast; }
  function siteGet(url, fail) { // rejet { down: true } = fonctions Netlify hors service
    if (siteDown) return Promise.reject({ down: true });
    // 503 « Usage exceeded », site Netlify supprimé (404, page qui n'est pas du JSON) ou injoignable : robot GitHub.
    // Seule une vraie erreur de lecture Slate de la fonction (502 + message JSON) est montrée telle quelle.
    function down() { siteDown = true; throw { down: true }; }
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok && r.status !== 502) down();
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || fail); return d; }, down);
    }, down);
  }
  function orRobot(kind, link) { return function (e) { if (e && e.down) return askRobot(kind, link); throw e; }; }
  function askRobot(kind, link) {
    return new Promise(function (ok, ko) {
      if (!canWeb) return ko(new Error("lecture seule : pas de modification du site avec cette clé"));
      askQ.push({ kind: kind, link: String(link || "").trim(), ok: ok, ko: ko });
      clearTimeout(askT); askT = setTimeout(askSend, 300);
    });
  }
  function askSend() {
    var q = askQ, t0 = Date.now(), who = user && user.login || "";
    var path = "data/ask/" + t0 + "-" + Math.random().toString(36).slice(2, 7) + ".json";
    askQ = [];
    function fail(e) { q.forEach(function (x) { x.ko(e); }); }
    function send(n) { // commit refusé si une autre publication passe au même moment : on réessaie
      return commit([{ path: path, text: json({ items: q.map(function (x) { return { kind: x.kind, link: x.link }; }), at: new Date().toISOString(), by: who }) }],
        "Slate : demande de lecture (admin, " + who + ")").catch(function (e) {
        if (n <= 0) throw e;
        return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return send(n - 1); });
      });
    }
    send(3).then(function () {
      (function poll() {
        setTimeout(function () {
          if (Date.now() - t0 > 300000) return fail(new Error("Le robot GitHub n'a pas répondu (5 min) : réessayez."));
          readFile(path).then(function (d) {
            if (!d || !d.doneAt) return poll();
            q.forEach(function (x, i) { var a = (d.items || [])[i] || {}; if (a.error || !a.answer) x.ko(new Error(a.error || "pas de réponse")); else x.ok(a.answer); });
          }, poll);
        }, 5000);
      })();
    }, fail);
  }
