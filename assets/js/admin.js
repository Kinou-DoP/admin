// Admin kinou — édition des fiches des chefs op (data/dps/*.json) dans le repo GitHub Kinou-DoP/admin.
// Lecture et écriture via l'API GitHub (token personnel) ; import des bundles Slate via l'API du site.
(function () {
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
  // Si un autre commit arrive pendant ce temps (robot GitHub qui répond, autre personne qui publie : « Update is not a fast
  // forward », GitHub 422), on refait le commit par-dessus le nouveau dernier commit, 3 fois au plus (Gus 04/11).
  function commit(files, message, tries) {
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
        input._busy = v; st.textContent = "Lecture du lien" + slateWait("…");
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
    if (siteDown) return Promise.reject(new Error("fonctions du site hors service"));
    return fetch(SITE + "/api/refresh/" + slug, { method: "POST", headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "mise à jour refusée"); }); });
  }

  // ---------- Connexion ----------
  function login(t) {
    token = t;
    // Accès « website » (Gus 17/11) : seulement si la clé peut écrire dans le dépôt admin. Test sans effet : on enregistre un
    // fichier vide (blob jamais relié à un commit, toujours le même). Clé limitée au dépôt notes = festivals, sélections,
    // récupération et sorties seulement (rubrique website cachée) : c'est GitHub qui l'empêche, pas seulement l'admin.
    var canW = gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: { content: "", encoding: "utf-8" } }).then(function () { return true; }, function () { return false; });
    return Promise.all([gh("/user"), canW]).then(function (r) {
      user = r[0]; canWeb = r[1]; store(false, t);
      document.body.classList.toggle("readonly", !canWeb);
      // Prénom (Gus 17/11) : plusieurs personnes peuvent se connecter avec des clés du même compte GitHub (kinou-agency). Le
      // prénom saisi à la connexion (gardé dans ce navigateur) remplace le login partout où l'admin écrit qui a fait quoi :
      // messages des commits « (admin, Prénom) », historique, champs `by` des données. GitHub ne donne pas le nom de la clé.
      user.gh = user.login;
      // Le prénom est aussi lié à la clé (Gus 17/11) : dépôt privé notes, equipe/noms.json = { <empreinte de la clé>: prénom }
      // (empreinte SHA-256, jamais la clé). Même clé collée sur un autre appareil = prénom retrouvé, rien à retaper.
      return nameRemote().then(function (rn) {
        if (rn) setName(rn, true); else if (myName()) nameSave(myName());
        user.login = myName() || user.gh;
        showWho();
      });
    }, function (e) { token = null; throw e; });
  }
  var canWeb = true;
  var NAMES_PATH = "/repos/Kinou-DoP/notes/contents/equipe/noms.json";
  function tokId() {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").slice(0, 24);
    });
  }
  function namesRead() {
    return gh(NAMES_PATH, { allow404: true }).then(function (f) { return f ? { sha: f.sha, map: JSON.parse(b64dec(f.content)) } : { sha: null, map: {} }; });
  }
  function nameRemote() { return Promise.all([tokId(), namesRead()]).then(function (r) { return r[1].map[r[0]] || ""; }).catch(function () { return ""; }); }
  function nameSave(v) {
    return Promise.all([tokId(), namesRead()]).then(function (r) {
      var id = r[0], m = r[1].map;
      if ((m[id] || "") === v) return;
      if (v) m[id] = v; else delete m[id];
      return gh(NAMES_PATH, { method: "PUT", body: { message: "Équipe : prénom lié à une clé (admin, " + (v || "?") + ")", content: b64enc(JSON.stringify(m, null, 2) + "\n"), sha: r[1].sha || undefined } });
    }).catch(function () {});
  }
  var NAME_KEY = "kinou-admin-name";
  function myName() { try { return (localStorage.getItem(NAME_KEY) || "").trim(); } catch (e) { return ""; } }
  function setName(v, local) {
    v = String(v || "").trim().replace(/[()]/g, ""); try { if (v) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY); } catch (e) {}
    if (user && user.gh) { user.login = v || user.gh; if (!local && token) nameSave(v); }
  }
  function showWho() {
    who.textContent = "";
    var me = el("button", { class: "whome", title: "Changer le prénom affiché dans l'historique", text: user.login });
    me.addEventListener("click", function () { var v = window.prompt("Ton prénom (pour l'historique : qui a publié quoi)", myName()); if (v === null) return; setName(v); showWho(); });
    who.appendChild(me);
    who.appendChild(el("button", { text: "Se déconnecter", on: { click: function () { store(false, null); location.hash = "#/"; location.reload(); } } }));
  }
  function showLogin(msg) {
    bar.hidden = true;
    var input = el("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" });
    var st = el("p", { class: "status" + (msg ? " err" : ""), text: msg || "" });
    var go = el("button", { class: "btn primary", text: "Se connecter" });
    var nameIn = el("input", { type: "text", placeholder: "Prénom", autocomplete: "given-name" });
    // Prénom : demandé seulement si la clé n'en a pas encore (sinon retrouvé tout seul, même sur un autre appareil).
    var nameRow = el("div", {}, [el("label", { class: "label", text: "Prénom" }), el("div", { class: "row" }, [el("div", { class: "grow" }, [nameIn])])]);
    nameRow.hidden = true;
    function submit() {
      if (!input.value.trim()) return;
      setName(nameIn.value, true); // nouvelle clé : pas le prénom de la personne connectée avant sur ce navigateur
      go.disabled = true; st.className = "status"; st.textContent = "Vérification…";
      login(input.value.trim()).then(function () {
        if (nameIn.value.trim() && nameIn.value.trim() !== user.login) setName(nameIn.value); // prénom tapé = prénom de cette clé
        if (user.login !== user.gh) return route();
        // Clé encore sans prénom : on le demande (il sera retrouvé ensuite sur tous les appareils).
        go.disabled = false; st.className = "status err"; st.textContent = "Écris ton prénom (il apparaît dans l'historique : qui a publié quoi).";
        nameRow.hidden = false; nameIn.focus();
      }, function (e) { go.disabled = false; st.className = "status err"; st.textContent = e.message; });
    }
    go.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    nameIn.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    view.textContent = "";
    view.appendChild(el("div", { class: "login" }, [
      el("h1", { text: "Connexion" }),
      el("p", { class: "lead", text: "Colle la clé GitHub qu'on t'a donnée. Elle reste enregistrée dans ce navigateur." }),
      nameRow,
      el("label", { class: "label", text: "Token GitHub" }),
      el("div", { class: "row" }, [el("div", { class: "grow" }, [input]), go]), st,
      el("ol", {}, [
        el("li", {}, ["Sur GitHub : Settings → Developer settings → Personal access tokens → ", el("b", { text: "Fine-grained tokens" }), " → Generate new token."]),
        el("li", { text: "Resource owner : Kinou-DoP. Repository access : Only select repositories → admin, site, notes. Expiration : No expiration." }),
        el("li", { text: "Permissions → Repository permissions → Contents : Read and write." }),
        el("li", { text: "Generate token, puis copiez-le ici." })
      ])
    ]));
    input.focus();
  }

  // ---------- Liste des chefs op ----------
  // Liste des chefs op lue dans le dernier commit (la lecture par nom de branche peut rendre une version d'il y a une minute).
  function loadIndex() {
    return gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH).then(function (ref) {
      return gh("/repos/" + REPO + "/contents/data/dps/index.json?ref=" + ref.object.sha, { raw: true, allow404: true });
    }).then(function (t) { index = t ? JSON.parse(t) : { dps: [] }; return index; });
  }
  function showList() {
    bar.hidden = true; editing = false;
    view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([loadIndex(), gh("/repos/" + REPO + "/contents/data/dps?ref=" + BRANCH), loadProgress()]).then(function (r) {
      var files = {}; r[1].forEach(function (f) { files[f.name] = true; });
      var ul = el("ul", { class: "dps" }), entries = [], want = 0; // want : étape choisie dans le tableau de bord (fiches pas encore à cette étape)
      index.dps.forEach(function (d) {
        var has = files[d.slug + ".json"], step = stepOf(d.slug, has);
        var li = el("li", {}, [el("a", { href: "#/dp/" + d.slug, class: (has ? "live" : "") + (d.hidden ? " off" : "") }, [d.name, d.hidden ? el("span", { class: "offtag", text: "hors ligne" }) : null, has ? pips(step) : el("small", { text: "Pas encore de fiche" })])]);
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
  var STEPS = ["Importé", "Snippet", "Recadrage & infos", "Stills"], progress = null;
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
    if (!canWeb) { note.textContent = "Lecture seule"; note.className = "pnote err"; return; }
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
  // Curseur de la fiche : À faire → Importé → Snippet → Recadrage & infos → Stills (ordre changé le 29/10, Gus).
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
    // ROUND 1 : les 4 étapes (importé, snippet, recadrage & infos, stills) ; pas de ROUND 2 pour l'instant (Gus 12/11).
    var N = entries.length || 1, r1 = 0;
    entries.forEach(function (e) { r1 += Math.min(e.step, 4); });
    var p1 = r1 / (N * 4), picked = 0, pickers = [];
    function bar(ratio, cls, n) {
      n = n || 20;
      var b = el("div", { class: "pbar " + (cls || "") }), lit = Math.round(ratio * n);
      b.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
      for (var i = 0; i < n; i++) { var c = el("i", { class: i < lit ? "lit" : "" }); c.style.setProperty("--i", i); b.appendChild(c); }
      return b;
    }
    // Clic = n'afficher que les fiches pas encore à cette étape (k = 1..4) ; un deuxième clic remet tout.
    function pickable(node, k) {
      pickers.push([node, k]);
      node.addEventListener("click", function () {
        picked = picked === k ? 0 : k;
        pickers.forEach(function (x) { x[0].classList.toggle("on", picked === x[1]); });
        board.classList.toggle("filtering", !!picked); onPick(picked);
      });
      return node;
    }
    var board = el("section", { class: "board" });
    board.appendChild(el("div", { class: "bxp" }, [
      el("span", { class: "round", text: "ROUND 1 !" }),
      bar(p1, "xp"),
      el("div", { class: "bnum", text: Math.round(p1 * 100) + " %" + (p1 >= 1 ? " ★" : "") })]));
    var gauges = el("div", { class: "bgauges" });
    STEPS.forEach(function (t, k) {
      var n = entries.filter(function (e) { return e.step > k; }).length;
      gauges.appendChild(pickable(el("button", { type: "button", class: "bgauge s" + (k + 1) + (n === entries.length ? " full" : ""), title: "Voir les fiches pas encore à l'étape « " + t + " »" }, [
        el("span", { class: "bt", text: t }), bar(n / N), el("span", { class: "bn", text: n + " / " + entries.length + (n === entries.length ? " ★" : "") })]), k + 1));
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
  function touch() {
    if (!canWeb) { status("Lecture seule : tu peux tout regarder, mais pas modifier le site.", "warn"); return; }
    dirty = true; status("Modifications non publiées : cliquez sur « Publier » pour les mettre en ligne.", "warn"); record(); }

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
    // Brouillon gardé avant un rechargement (nouvelle version de l'admin) pour cette même page : on le remet.
    if (draft && draft.hash === location.hash) {
      var d = draft; draft = null;
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      setTimeout(function () {
        hist.busy = true; model.set({ data: d.data, refs: d.refs || {} }); hist.busy = false;
        touch(); status("Modifications non publiées reprises après le rechargement : vérifiez, puis publiez.", "warn");
      }, 0);
    }
  }
  // Brouillon de la page ouverte (données + bundle lu + fichiers déposés), gardé dans l'onglet le temps d'un rechargement.
  var DRAFT_KEY = "kinou-admin-draft", draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch (e) {}
  function saveDraft() {
    if (!pageModel) return false;
    var m = pageModel.get(), refs = m.refs || {}, keep = {};
    // Images déposées (portrait, affiches) : leur aperçu « blob: » ne survit pas au rechargement → image en clair (base64).
    function fix(o) {
      if (!o || typeof o !== "object") return o;
      var c = Array.isArray(o) ? [] : {};
      Object.keys(o).forEach(function (k) { c[k] = fix(o[k]); });
      if (c.base64 && /^blob:/.test(c.preview || "")) c.preview = "data:image/webp;base64," + c.base64;
      return c;
    }
    Object.keys(refs).forEach(function (k) { try { keep[k] = JSON.parse(JSON.stringify(fix(refs[k]))); } catch (e) {} });
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ hash: location.hash, data: JSON.stringify(m.data), refs: keep, at: Date.now() })); return true; }
    catch (e) { return false; }
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
      state.overrides = state.overrides || {}; state.about = state.about || {}; dirty = false; histReset(); ovBase = sharedSnap(state.overrides); notesFor = null; // notes relues à chaque ouverture
      slate = state.clips ? { name: state.name, categories: state.categories || [], clips: state.clips } : null;
      curCat = null;
      render();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }

  // Notes internes d'une fiche (Gus 03/11) : jamais sur le site, et pas dans ce dépôt (public) : dépôt privé Kinou-DoP/notes,
  // un fichier par chef op (dps/<adresse>.md), lu à l'ouverture et enregistré tout seul 1,2 s après la frappe (sans « Publier »).
  // Clé GitHub sans accès à ce dépôt (ou dépôt absent) : message dans le bloc, le reste de la fiche marche normalement.
  var NOTES_REPO = "Kinou-DoP/notes", notesFor = null, notesNode = null;
  function b64enc(t) { return btoa(unescape(encodeURIComponent(t))); }
  function b64dec(b) { return decodeURIComponent(escape(atob(String(b).replace(/\s/g, "")))); }
  function notesBox(slug) {
    var ta = el("textarea", { class: "nodirty", rows: "3", placeholder: "Notes pour l'équipe (jamais affichées sur le site)…" }), st = el("span", { class: "nst" });
    var box = el("section", { class: "notes" }, [el("div", { class: "nhead" }, [el("span", { class: "label", text: "Notes" }), st]), ta]);
    var path = "/repos/" + NOTES_REPO + "/contents/dps/" + slug + ".md", sha = null, saved = "", t = 0, busy = false, again = false;
    function grow() { ta.style.height = "auto"; ta.style.height = Math.max(ta.scrollHeight, 60) + "px"; }
    ta.disabled = true; st.textContent = "Chargement…";
    gh(path, { allow404: true }).then(function (f) {
      if (f) { sha = f.sha; saved = b64dec(f.content); return; }
      return gh("/repos/" + NOTES_REPO, { allow404: true }).then(function (r) { if (!r) throw new Error("absent"); });
    }).then(function () { ta.value = saved; ta.disabled = false; st.textContent = ""; requestAnimationFrame(grow); },
      function () { box.classList.add("off"); st.textContent = "Indisponibles : le dépôt privé « Kinou-DoP/notes » doit exister et être ajouté à votre clé GitHub."; });
    function put() {
      return gh(path, { method: "PUT", body: { message: "Notes " + (state && state.name || slug) + " (admin, " + (user && user.login || "") + ")", content: b64enc(ta.value), sha: sha || undefined } });
    }
    function save() {
      if (busy) { again = true; return; }
      if (ta.value === saved) { st.textContent = "Enregistré"; return; }
      var v = ta.value; busy = true; st.textContent = "Enregistrement…";
      put().catch(function () { // modifiée ailleurs entre-temps (autre personne, autre onglet) : on reprend sa version et on réessaie
        return gh(path, { allow404: true }).then(function (f) { sha = f ? f.sha : null; return put(); });
      }).then(function (r) { sha = r.content.sha; saved = v; st.textContent = "Enregistré"; },
        function (e) { st.textContent = "Pas enregistré : " + e.message; })
        .then(function () { busy = false; if (again) { again = false; save(); } });
    }
    ta.addEventListener("input", function () { grow(); st.textContent = "…"; clearTimeout(t); t = setTimeout(save, 1200); });
    ta.addEventListener("blur", function () { clearTimeout(t); save(); });
    return box;
  }
  // Page en ligne ou cachée sur le site (Gus 10/11) : `hidden` de l'entrée de data/dps/index.json (le site ne liste ni n'ouvre une
  // page cachée). Une nouvelle fiche est créée cachée ; on la met en ligne avec l'interrupteur, puis « Publier ».
  // state.hidden = choix pas encore publié (absent : valeur de la liste ; pas de liste = nouvelle fiche = cachée).
  function isHidden() {
    if (state.hidden !== undefined) return state.hidden;
    var e = index && index.dps.filter(function (d) { return d.slug === (origSlug || state.slug); })[0];
    return e ? !!e.hidden : true;
  }
  function onlineCtl() {
    var sw = el("input", { type: "checkbox", class: "nodirty" }); sw.checked = !isHidden();
    var hint = el("small");
    function txt() { hint.textContent = sw.checked ? "La page apparaît dans la liste des chefs op du site." : "Page cachée : absente du site (liste, liens). Activez puis publiez pour la mettre en ligne."; }
    sw.addEventListener("change", function () { state.hidden = !sw.checked; txt(); touch(); });
    txt();
    return el("label", { class: "showsw online" }, [sw, el("i"), el("span", { text: "En ligne sur le site" }), hint]);
  }
  // Genre du chef op (Gus 16/11) : `gender` de l'entrée de data/dps/index.json, "f" = femme, "x" = autre, absent = homme (défaut).
  // Sert aux mails de la rubrique récupération (« notre cheffe opératrice … »). Écrit à la publication, comme `hidden`.
  function curGender() {
    if (state.gender !== undefined) return state.gender;
    var e = index && index.dps.filter(function (d) { return d.slug === (origSlug || state.slug); })[0];
    return e && e.gender || "";
  }
  function genderCtl() {
    var g = curGender(), row = el("div", { class: "gender" }, [el("span", { class: "label", text: "Genre" })]);
    [["", "Homme"], ["f", "Femme"], ["x", "Autre"]].forEach(function (o) {
      row.appendChild(el("button", { type: "button", class: "chip" + (g === o[0] ? " on" : ""), text: o[1], on: { click: function () {
        state.gender = o[0]; row.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c.textContent === o[1]); }); touch();
      } } }));
    });
    row.appendChild(el("small", { text: "Pour les mails de récupération (« notre cheffe opératrice … »)." }));
    return row;
  }
  function render() {
    view.textContent = ""; editing = true; pagePublish = publish;
    histInit({
      get: function () { return { data: state, refs: Object.assign({ slate: slate }, pending) }; },
      set: function (h) { state = JSON.parse(h.data); slate = h.refs.slate; pending = Object.assign({}, h.refs); delete pending.slate; render(); }
    });
    view.appendChild(el("div", { class: "dp-head" }, [el("h1", { text: state.name || "Nouveau chef op" }), isNew ? null : progressCtl()]));
    view.appendChild(onlineCtl());
    view.appendChild(genderCtl());
    view.appendChild(el("p", { class: "lead", text: isNew ? "Nouvelle fiche — collez le lien du bundle Slate pour commencer." : (state.bundle ? "Films synchronisés avec Slate." : "Fiche sans bundle Slate : les films sont figés.") }));
    var nk = origSlug || (!isNew && state.slug); // une fois par fiche ouverte (render est rappelé à chaque changement)
    if (nk) { if (notesFor !== nk) { notesFor = nk; notesNode = notesBox(nk); } view.appendChild(notesNode); }
    view.appendChild(bundleSection());
    view.appendChild(identitySection());
    view.appendChild(filmsSection());
    view.appendChild(aboutSection());
    bar.hidden = false;
    seeLink.href = SITE_VIEW + "/#" + (state.slug || "");
    seeLink.hidden = isNew;
    if (flash) status(flash, "ok"); else if (dirty) touch(); else status("");
    flash = "";
  }

  function bundleSection() {
    var input = el("input", { type: "url", class: "nodirty", placeholder: "https://shots.re/… ou https://kinou.slateapp.com/bundles/…", value: state.bundle || "" });
    var st = el("p", { class: "hint" });
    var imp = el("button", { class: "btn", text: state.bundle ? "Relire le bundle" : "Importer" });
    imp.addEventListener("click", function () {
      imp.disabled = true; st.textContent = "Lecture du bundle sur Slate" + slateWait(" (environ 5 s)…");
      importBundle(input.value).then(function (d) {
        // Chef op déjà dans la liste du site (même nom) : on garde son adresse actuelle,
        // et s'il a déjà une fiche, on ouvre celle-ci plutôt que d'en créer une seconde.
        var known = isNew && !listed && index.dps.filter(function (e) { return slugify(e.name) === slugify(state.name || d.name); })[0];
        return (known ? readFile("data/dps/" + known.slug + ".json") : Promise.resolve(null)).then(function (existing) { return [d, known, existing]; });
      }).then(function (r) {
        var d = r[0], known = r[1];
        if (r[2]) { dirty = false; flash = d.name + " a déjà une fiche : la voici. Utilisez « Relire le bundle » pour la mettre à jour."; location.hash = "#/dp/" + known.slug; return; }
        st.textContent = "Lecture des liens ajoutés sous les films" + slateWait("…");
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
    // Case cochée ou décochée : extrait arrêté, la vignette (recadrée ou non) se voit tout de suite.
    cb.addEventListener("change", function () { setT(cb.checked || undefined); halt(); touch(); });
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

  function filmCard(c) {
    var card = el("div", { class: "film" });
    var thumb = el("div", { class: "thumb" });
    if (c.img) thumb.style.backgroundImage = 'url("' + c.img + '")';
    var chips = el("div", { class: "chips" });
    thumb.appendChild(chips);
    // Snippet Slate (extrait d'aperçu) : petite pastille en haut à droite, pleine = extrait présent, vide = pas encore d'extrait
    // (vidéo à « snipper » sur Slate, puis « Relire le bundle »). Gus 03/11.
    if (c.full || c.video) thumb.appendChild(el("span", { class: "snipmark" + (c.video ? " on" : ""), title: c.video ? "Snippet présent" : "Pas de snippet sur Slate" }));
    var title = el("input", { type: "text", value: val(c, "title") });
    var sub = el("textarea", { rows: 2 }); sub.value = val(c, "sub");
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
    var zoom = state === fic ? scopeCtl(c, thumb, zvid) : zoomCtl(thumb, zvid, function () { return (state.overrides[c.slate] || {}).zoom; }, function (z) { setOverride(c, "zoom", z); sync(); },
      function () { return (state.overrides[c.slate] || {}).zoomPos; }, function (p) { setOverride(c, "zoomPos", p); sync(); },
      function () { return (state.overrides[c.slate] || {}).zoomThumb; }, function (t) { setOverride(c, "zoomThumb", t); sync(); });
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

  function paras(a) { return (a || []).join("\n\n"); }
  function unparas(t) { return t.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean); }

  // Liens en plus de l'onglet About (Gus) : nom du bouton + adresse → about.links = [{ label, url }], dans l'ordre.
  function moreLinks() {
    var box = el("div", { class: "team links" });
    function draw() {
      var a = state.about, list = a.links || [];
      box.textContent = "";
      list.forEach(function (l, i) {
        function inp(k, ph, type) {
          var x = el("input", { type: type || "text", placeholder: ph, value: l[k] || "" });
          x.addEventListener("input", function () { l[k] = x.value.trim(); });
          return x;
        }
        function btn(txt, title, fn, off) { var b = el("button", { class: "xbtn", type: "button", title: title, text: txt }); b.disabled = !!off; b.addEventListener("click", function () { fn(); if (!list.length) delete a.links; draw(); touch(); }); return b; }
        box.appendChild(el("div", { class: "tline" }, [inp("label", "Nom du bouton (ex. IMDb)"), inp("url", "https://…", "url"),
          btn("↑", "Monter", function () { list.splice(i - 1, 0, list.splice(i, 1)[0]); }, i === 0),
          btn("↓", "Descendre", function () { list.splice(i + 1, 0, list.splice(i, 1)[0]); }, i === list.length - 1),
          btn("×", "Retirer", function () { list.splice(i, 1); })]));
      });
      var add = el("button", { class: "btn ghost", type: "button", text: "+ Ajouter un lien" });
      add.addEventListener("click", function () { (a.links = a.links || []).push({ label: "", url: "" }); draw(); touch(); var ins = box.querySelectorAll(".tline input"); if (ins.length) ins[ins.length - 2].focus(); });
      box.appendChild(add);
    }
    draw();
    return box;
  }

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
      el("div", { class: "field" }, [el("label", { class: "label", text: "Autres liens (IMDb, Vimeo…), affichés après Instagram et Website" }), moreLinks()]),
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
    // Noir et blanc (par défaut) ou couleur : about.color = true si l'interrupteur est décoché (Gus).
    var bw = el("input", { type: "checkbox", class: "nodirty" }); bw.checked = !a.color;
    box.classList.toggle("color", !!a.color);
    bw.addEventListener("change", function () { if (bw.checked) delete a.color; else a.color = true; box.classList.toggle("color", !!a.color); touch(); });
    box.appendChild(el("label", { class: "showsw" }, [bw, el("i"), el("span", { text: "Noir et blanc sur le site" })]));
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
  // Image d'aperçu des liens partagés (og:image, WhatsApp, iMessage…) : le portrait en JPEG (mieux lu que le WebP), en noir et blanc
  // comme sur le site, ou en couleur si « Noir et blanc sur le site » est décoché (Gus 06/11) → about.og (+ ogColor). Refaite quand
  // le portrait ou ce choix change, sous un nouveau nom (les messageries gardent les aperçus en cache) ; l'ancienne est supprimée.
  // En cas d'échec, la fiche est publiée quand même (aperçu inchangé).
  function makeOg(slug, a) {
    if (!a.img && !pending.portrait) return Promise.resolve(null);
    if (!pending.portrait && a.og && !!a.ogColor === !!a.color) return Promise.resolve(null);
    var src = pending.portrait ? Promise.resolve("data:image/webp;base64," + pending.portrait.base64)
      : portraitURL[a.img] ? Promise.resolve(portraitURL[a.img])
      : fetch("https://api.github.com/repos/" + REPO + "/contents/data/dps/" + a.img + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
        .then(function (r) { if (!r.ok) throw new Error("portrait illisible"); return r.blob(); }).then(function (b) { return portraitURL[a.img] = URL.createObjectURL(b); });
    return src.then(function (url) {
      return new Promise(function (ok, ko) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = ko; im.src = url; });
    }).then(function (im) {
      var k = Math.min(1, 1200 / im.width), c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      var x = c.getContext("2d"); x.drawImage(im, 0, 0, c.width, c.height);
      if (!a.color) { // noir et blanc (mêmes coefficients que le filtre grayscale du site)
        var px = x.getImageData(0, 0, c.width, c.height), d = px.data;
        for (var i = 0; i < d.length; i += 4) { var y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = y; }
        x.putImageData(px, 0, 0);
      }
      var old = a.og;
      a.og = "img/" + slug + "-og-" + Date.now() + ".jpg";
      if (a.color) a.ogColor = true; else delete a.ogColor;
      return { add: a.og, remove: old && old !== a.og ? old : null, base64: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
    }).catch(function () { return null; });
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
    if (s.showcase && s.showcase.length) out.showcase = s.showcase;
    out.name = s.name.trim();
    out.overrides = s.overrides;
    out.about = about;
    if (slate) { out.categories = slate.categories; out.clips = slate.clips; } // copie de secours
    var ficheFile = { path: "data/dps/" + s.slug + ".json", text: "" }; files.push(ficheFile); // texte écrit après la relecture du fichier en ligne
    if (from && !isNew) files.push({ path: "data/dps/" + from + ".json", remove: true });
    // Nouvelle adresse : les liens de l'accueil vers ce chef op suivent.
    if (from && homeData) {
      var hit = false;
      (homeData.slides || []).forEach(function (sl) { (sl.dps || []).forEach(function (d) { if (d.slug === from) { d.slug = s.slug; hit = true; } }); if (sl.slug === from) { sl.slug = s.slug; hit = true; } });
      Object.keys(homeData.overrides || {}).forEach(function (k) { (homeData.overrides[k].dps || []).forEach(function (d) { if (d.slug === from) { d.slug = s.slug; hit = true; } }); });
      if (hit) files.push({ path: "data/home.json", text: json(homeData) });
    }
    // Liste des DPs : ajout (rangé par nom de famille) ou mise à jour du nom (et de l'adresse).
    // Appliqué à la liste du dernier commit au moment de publier (`edit`), pas à celle gardée en mémoire : seule l'entrée de ce chef op change.
    var hide = isHidden(), gen = curGender(); // nouvelle fiche : cachée tant qu'on ne la met pas en ligne
    function applyIdx(list) {
      var dps = list.slice(), i = dps.findIndex(function (d) { return d.slug === (from || s.slug); });
      if (i > -1) {
        if (dps[i].name !== out.name || dps[i].slug !== s.slug || !!dps[i].hidden !== hide || (dps[i].gender || "") !== gen) {
          dps[i] = Object.assign({}, dps[i], { name: out.name, slug: s.slug }); if (hide) dps[i].hidden = true; else delete dps[i].hidden;
          if (gen) dps[i].gender = gen; else delete dps[i].gender;
        }
      } else {
        var k = surname(out.name), at = dps.findIndex(function (d) { return surname(d.name) > k; }), ne = { slug: s.slug, name: out.name };
        if (hide) ne.hidden = true;
        if (gen) ne.gender = gen;
        dps.splice(at < 0 ? dps.length : at, 0, ne);
      }
      return dps;
    }
    var dps = applyIdx(index.dps);
    // Fiche sans bundle ni films (ex. on règle juste le genre ou « En ligne » d'un chef op pas encore importé, Gus 17/11) : son
    // avancement reste « À faire » (sans entrée, une fiche qui existe compte comme « Importé »).
    if (!(progress && progress[s.slug]) && !out.bundle && !(out.clips || []).length) {
      var p0 = { step: 0, at: new Date().toISOString(), by: user.login };
      files.push({ path: "data/progress.json", edit: function (t) { var p = t ? JSON.parse(t) : {}; if (p[s.slug]) return null; p[s.slug] = p0; return json(p); } });
      if (progress) progress[s.slug] = p0;
    }
    // Fiche sans bundle ni films (ex. on règle juste le genre ou « En ligne » d'un chef op pas encore importé, Gus 17/11) : son
    // avancement reste « À faire » (sans entrée, une fiche qui existe compte comme « Importé »).
    if (!(progress && progress[s.slug]) && !out.bundle && !(out.clips || []).length) {
      var p0 = { step: 0, at: new Date().toISOString(), by: user.login };
      files.push({ path: "data/progress.json", edit: function (t) { var p = t ? JSON.parse(t) : {}; if (p[s.slug]) return null; p[s.slug] = p0; return json(p); } });
      if (progress) progress[s.slug] = p0;
    }
    files.push({ path: "data/dps/index.json", edit: function (t) {
      var cur = t ? JSON.parse(t) : { dps: [] }, n = applyIdx(cur.dps || []);
      dps = n; return JSON.stringify(n) === JSON.stringify(cur.dps) ? null : json({ dps: n });
    } });
    // Ce que le robot écrit (images, proportions, types de contenu, films complets) est repris du fichier en ligne : sinon la
    // publication remettait l'ancienne version (ex. ordre des images d'un projet en images changé sur Slate), puis le robot la
    // corrigeait une minute après, sans pouvoir vider le cache du site.
    var waitRobot = needsRobot(extrasLists(out.overrides));
    readFile("data/dps/" + (from || s.slug) + ".json").then(function (remote) {
      if (remote) robotFrom(out, remote);
      // Image d'aperçu déjà faite en ligne (fiche ouverte avant) : reprise telle quelle.
      var ra = remote && remote.about || {};
      if (!about.og && ra.og && !pending.portrait) { about.og = ra.og; if (ra.ogColor) about.ogColor = true; }
      return makeOg(out.slug, about);
    }).then(function (og) {
      if (og) { files.push({ path: "data/dps/" + og.add, base64: og.base64 }); if (og.remove) files.push({ path: "data/dps/" + og.remove, remove: true }); }
      ficheFile.text = json(out);
      return commit(files, (isNew ? "Ajout " : "Mise à jour ") + out.name.split(",")[0] + " (admin, " + user.login + ")");
    }).then(function (ref) {
      var wasNew = isNew;
      // Après chaque publication : on attend le passage du robot (s'il change quelque chose), on reprend ce qu'il a écrit et on
      // vide le cache du site.
      afterRobot("data/dps/" + out.slug + ".json", ref, out.slug, function (d) {
        if (state !== out) return;
        robotFrom(out, d); if (!dirty) render();
        status(waitRobot ? "Le robot a ajouté les films complets : le site est à jour." : "Le robot a relu Slate : le site est à jour.", "ok");
      });
      index.dps = dps; pending = {}; isNew = false; listed = true; state = out; dirty = false; origSlug = out.slug; histReset(); ovBase = sharedSnap(out.overrides);
      if (homeData && home) home = null; // l'accueil sera relu (liens mis à jour)
      flash = from ? "Publié à la nouvelle adresse kinou.fr/" + out.slug + "." : waitRobot ? "Publié. Le robot ajoute les films complets des vidéos (environ 1 minute)…" : "Publié. Le site sera à jour dans une minute environ.";
      if (wasNew || from) location.hash = "#/dp/" + out.slug; else render();
      refreshSite(out.slug).catch(function () {}); // vide le cache du site (fiche et clips) : visible tout de suite
      warmThumbs(out.clips);
      // Clé sans accès au dépôt du site : pas de message (Gus 29/10) ; l'aperçu est refait à la prochaine mise à jour du site.
      sharePage(out).catch(function (e) { if (window.console) console.warn("Aperçu du lien partagé pas mis à jour : " + e.message); });
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); })
      .then(function () { publishBtn.disabled = false; });
  }
  publishBtn.addEventListener("click", function () {
    checkVersion().then(function () {
      if (newer) return status("Rechargez d'abord l'admin (bandeau en haut) : une ancienne version pourrait effacer des réglages.", "err");
      if (pagePublish) pagePublish();
    });
  });

  // Page d'aperçu du lien partagé (WhatsApp, iMessage… : nom + photo du chef op), écrite dans le dépôt du site (branche beta) à
  // chaque publication d'une fiche : <slug>/index.html. Même contenu que tools/share-pages.mjs du site (à garder identique).
  // Demande une clé GitHub avec accès en écriture au dépôt Kinou-DoP/site ; sinon la fiche est publiée quand même, sans aperçu.
  var SITE_REPO = "Kinou-DoP/site", SITE_URL = SITE_PAGES + "/", RAW_DATA = "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/data/";
  function sharePage(d) {
    function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
    var a = d.about || {}, img = "", slug = d.slug;
    if (a.og) img = RAW_DATA + "dps/" + a.og; // portrait en JPEG, noir et blanc ou couleur comme sur le site (makeOg)
    else if (a.img) img = /^https?:/.test(a.img) ? a.img : RAW_DATA + "dps/" + a.img;
    else if (d.clips) { var c = d.clips.filter(function (x) { return x.featured; }).sort(function (x, y) { return (x.featuredOrder || 0) - (y.featuredOrder || 0); })[0] || d.clips[0]; if (c && c.img) img = c.img; }
    var url = SITE_URL + slug + "/";
    var html = '<!doctype html>\n<!-- Page d\'aperçu de lien, fabriquée par tools/share-pages.mjs : ne pas modifier à la main. -->\n' +
      '<html lang="fr"><head><meta charset="utf-8">\n<title>' + esc(d.name) + ' — kinou</title>\n' +
      '<meta property="og:site_name" content="kinou">\n<meta property="og:type" content="website">\n' +
      '<meta property="og:title" content="' + esc(d.name) + '">\n<meta property="og:description" content="Cinematographer · kinou">\n' +
      '<meta property="og:url" content="' + esc(url) + '">\n' +
      (img ? '<meta property="og:image" content="' + esc(img) + '">\n<meta name="twitter:card" content="summary_large_image">\n' : "") +
      '<link rel="canonical" href="' + esc(url) + '">\n' +
      '<script>location.replace("../" + location.search + "#' + slug + '");</script>\n</head><body></body></html>\n';
    var path = "/repos/" + SITE_REPO + "/contents/" + slug + "/index.html";
    return gh(path + "?ref=beta", { allow404: true }).then(function (cur) {
      var b64 = btoa(unescape(encodeURIComponent(html)));
      if (cur && cur.content && cur.content.replace(/\s/g, "") === b64) return; // déjà à jour
      var body = { message: "Aperçu du lien : " + d.name.split(",")[0] + " (admin, " + user.login + ")", content: b64, branch: "beta" };
      if (cur && cur.sha) body.sha = cur.sha;
      return gh(path, { method: "PUT", body: body });
    });
  }

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
      if (justLink !== true) { flash = "Publié. Le robot relit la bande sur Slate (environ 1 minute)."; renderSpot(); }
      else status("Lien publié.", "ok");
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); throw e; })
      .then(function (r) { publishBtn.disabled = false; return r; }, function (e) { publishBtn.disabled = false; throw e; });
  }

  // ---------- Fiction (data/fiction.json) ----------
  // Comme le spotlight (bande Slate lue en entier par le robot GitHub : `films`), mais les onglets se règlent à la main, film par
  // film (overrides[id]) : status new | soon | past (défaut past), genre (films sortis), date (AAAA-MM-JJ, carré blanc au survol
  // dans NEW RELEASES et COMING SOON), poster (affiche déposée ici → data/fiction/<id>-<horodatage>.webp).
  var fic = null, FIC_STATUS = [["new", "New release"], ["soon", "Coming soon"], ["past", "Past release"]];
  var FIC_GENRES = ["FEATURE FILM", "SERIES", "DOCUMENTARY", "SHORT FILM"];
  function showFic() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    readFile("data/fiction.json").then(function (s) {
      fic = s || { reel: "", overrides: {}, films: [] }; fic.overrides = fic.overrides || {};
      pending = {}; dirty = false; histReset(); ovBase = sharedSnap(fic.overrides); curCat = null; renderFic();
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  var FIC_TABS = { new: "NEW RELEASES", soon: "COMING SOON", past: "PAST RELEASES" };
  function ficSlate() {
    var clips = (fic.films || []).map(function (f, i) {
      var st = (fic.overrides[f.slate] || {}).status || "past";
      return Object.assign({}, f, { cat: FIC_TABS[st], featuredOrder: i + 1 });
    });
    return { name: "Fiction", categories: ["NEW RELEASES", "COMING SOON", "PAST RELEASES"], clips: clips };
  }
  // Infos d'un film (Gus 04/11) : année, épisodes, durée, format d'image, plateformes, caméra, optiques, prix & sélections,
  // synopsis → overrides[<id>].info (texte libre, champs vides absents). Sur le site : dans le lecteur, sous les crédits
  // (et la ligne année | durée | format dans la présentation vidéo + stills). Bloc replié ; son titre dit combien sont remplies.
  var INFO_FIELDS = [["year", "Année", "2025"], ["episodes", "Épisodes", "8 (séries)"], ["runtime", "Durée", "90 min"], ["ratio", "Format d'image", "1.85"],
    ["platforms", "Plateformes", "Netflix, Canal+"], ["camera", "Caméra", "ALEXA 35"], ["lenses", "Optiques", "Cooke S4"],
    ["synopsis", "Synopsis (français)", "Une ligne vide entre deux paragraphes", 5], ["synopsisEn", "Synopsis (anglais)", "Sur le site : l'anglais d'abord, avec un choix EN / FR si les deux sont remplis", 5]];
  // Prix & sélections du film (Gus 17/11), sous la vidéo : une ligne par prix (ajoutées à la main ou depuis « Nos sélections »),
  // texte modifiable, œil = affichée / masquée sur le site (masquées : `info.awardsHidden`, le site ne lit que `info.awards`),
  // × = retirée (une ligne des robots retirée n'est pas remise). Une ligne corrigée garde son lien avec la trouvaille (`awardsFrom`).
  function awardsCtl(c) {
    function cur() { return (state.overrides[c.slate] || {}).info || {}; }
    var box = el("div", { class: "awbox" }), list = el("div", { class: "awlist" });
    function lines() { return String(cur().awards || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function save(vis, hid, ren) {
      var i = Object.assign({}, cur());
      vis = vis.map(function (x) { return x.trim(); }).filter(Boolean); hid = hid.map(function (x) { return x.trim(); }).filter(Boolean);
      if (vis.length) i.awards = vis.join("\n"); else delete i.awards;
      if (hid.length) i.awardsHidden = hid; else delete i.awardsHidden;
      if (ren && i.awardsFrom) { var f = Object.assign({}, i.awardsFrom); Object.keys(f).forEach(function (k) { if (f[k] === ren[0]) f[k] = ren[1]; }); i.awardsFrom = f; }
      setOverride(c, "info", Object.keys(i).length ? i : undefined); touch();
    }
    function draw() {
      list.textContent = "";
      var vis = lines(), hid = (cur().awardsHidden || []).slice(), from = cur().awardsFrom || {}, robot = {};
      Object.keys(from).forEach(function (k) { robot[from[k]] = 1; });
      function row(t, k, hidden) {
        var inp = el("input", { type: "text", value: t, title: t, placeholder: "Prix, Festival 2026" }), last = t;
        inp.addEventListener("change", function () {
          var v = inp.value.trim(), a = lines(), h = (cur().awardsHidden || []).slice(), arr = hidden ? h : a, j = arr.indexOf(last);
          if (j < 0) return; if (v) arr[j] = v; else arr.splice(j, 1);
          save(a, h, v ? [last, v] : null); last = v; if (!v) draw();
        });
        var eye = el("button", { type: "button", class: "aweye" + (hidden ? " off" : ""), title: hidden ? "Masqué sur le site : cliquer pour l'afficher" : "Affiché sur le site : cliquer pour le masquer", text: hidden ? "masqué" : "affiché" });
        eye.addEventListener("click", function () {
          var a = lines(), h = (cur().awardsHidden || []).slice();
          if (hidden) { h.splice(h.indexOf(last), 1); a.push(last); } else { a.splice(a.indexOf(last), 1); h.push(last); }
          save(a, h); draw();
        });
        var del = el("button", { type: "button", class: "awdel", title: "Retirer", text: "×" });
        del.addEventListener("click", function () {
          var a = lines(), h = (cur().awardsHidden || []).slice(), arr = hidden ? h : a, j = arr.indexOf(last);
          if (j > -1) arr.splice(j, 1); save(a, h); draw();
        });
        return el("div", { class: "awrow" + (hidden ? " off" : "") }, [eye, inp, robot[t] ? el("span", { class: "awbot", title: "Ajouté depuis Nos sélections", text: "robot" }) : null, del]);
      }
      vis.forEach(function (t, k) { list.appendChild(row(t, k, false)); });
      hid.forEach(function (t, k) { list.appendChild(row(t, k, true)); });
      head.textContent = "Prix & sélections" + (vis.length + hid.length ? " · " + vis.length + (hid.length ? " (+ " + hid.length + " masqué" + (hid.length > 1 ? "s" : "") + ")" : "") : "");
    }
    var head = el("span", { class: "label" });
    var add = el("button", { type: "button", class: "awadd", text: "+ Ajouter" });
    add.addEventListener("click", function () {
      var v = window.prompt("Prix ou sélection (ex. « Best Cinematography, Festival 2026 »)");
      if (!v || !v.trim()) return; var a = lines(); a.push(v.trim()); save(a, (cur().awardsHidden || []).slice()); draw();
    });
    box.appendChild(el("div", { class: "awhead" }, [head, add])); box.appendChild(list);
    draw();
    return box;
  }
  function infoCtl(c) {
    function cur() { return (state.overrides[c.slate] || {}).info || {}; }
    var sum = el("summary"), grid = el("div", { class: "infogrid" }), box = el("details", { class: "infobox" }, [sum, grid]);
    function count() { var n = Object.keys(cur()).filter(function (k) { return !/^awards/.test(k); }).length; sum.textContent = "Infos du film" + (n ? " · " + n + " renseignée" + (n > 1 ? "s" : "") : ""); }
    INFO_FIELDS.forEach(function (f) {
      if (f[0] === "platforms" && state === fic) return; // fiction : plateformes déjà réglées plus haut (étiquettes)
      var inp = f[3] ? el("textarea", { rows: String(f[3]), placeholder: f[2] }) : el("input", { type: "text", placeholder: f[2] });
      inp.value = cur()[f[0]] || "";
      inp.addEventListener("input", function () {
        var i = Object.assign({}, cur()), v = inp.value.trim();
        if (v) i[f[0]] = v; else delete i[f[0]];
        setOverride(c, "info", Object.keys(i).length ? i : undefined); count();
      });
      grid.appendChild(el("label", { class: "ifield" + (f[3] ? " wide" : "") }, [el("span", { class: "label", text: f[1] }), inp]));
    });
    count();
    return box;
  }
  // NEW RELEASES : 9 films au plus (Gus 04/11). Au-delà, les plus anciens (date de sortie ; sans date = tout juste ajouté, donc
  // gardé) passent tout seuls en Past release. Même règle que le site (ficToDP), qui l'applique aussi à l'affichage.
  var FIC_NEW_MAX = 9;
  function ficNewOrder() {
    var films = fic.films || [];
    return films.map(function (f, i) { return { f: f, i: i, o: fic.overrides[f.slate] || {} }; })
      .filter(function (x) { return x.o.status === "new"; })
      .sort(function (a, b) { return (b.o.date || "9999") < (a.o.date || "9999") ? -1 : (b.o.date || "9999") > (a.o.date || "9999") ? 1 : a.i - b.i; });
  }
  // Film poussé en Past release par cette règle : marqué `autoPast`. Si une place se libère (un New release passe en Coming soon…),
  // le plus récent d'entre eux revient tout seul en New release (Gus 04/11 : sinon 8 New releases après un aller-retour).
  function ficCapNew() {
    var out = ficNewOrder().slice(FIC_NEW_MAX).map(function (x) { setOverride(x.f, "status"); setOverride(x.f, "autoPast", true); return x.f.title; });
    var back = [], n = ficNewOrder().length;
    (fic.films || []).map(function (f, i) { return { f: f, i: i, o: fic.overrides[f.slate] || {} }; })
      .filter(function (x) { return x.o.autoPast && (x.o.status || "past") === "past"; })
      .sort(function (a, b) { return (b.o.date || "9999") < (a.o.date || "9999") ? -1 : (b.o.date || "9999") > (a.o.date || "9999") ? 1 : a.i - b.i; })
      .forEach(function (x) { if (n >= FIC_NEW_MAX) return; setOverride(x.f, "autoPast"); setOverride(x.f, "status", "new"); back.push(x.f.title); n++; });
    var msg = [];
    if (out.length) msg.push("9 New releases au plus : « " + out.join(" », « ") + " » passe" + (out.length > 1 ? "nt" : "") + " en Past release.");
    if (back.length) msg.push("« " + back.join(" », « ") + " » revien" + (back.length > 1 ? "nent" : "t") + " en New release.");
    if (msg.length) flash = msg.join(" ");
    return out.length + back.length;
  }
  // Réglages propres à la fiction, sous le titre d'un film : statut, genre, date de sortie, affiche.
  function ficCtl(c) {
    function o() { return fic.overrides[c.slate] || {}; }
    var stSel = el("select", { class: "nodirty" }), genre = el("select", { class: "nodirty" });
    // Statut : on choisit New release ou Coming soon ; Past release se fait tout seul (plus de 9 New releases), et ne s'affiche
    // que pour les films déjà passés (Gus 04/11).
    FIC_STATUS.forEach(function (x) {
      if (x[0] === "past" && (o().status || "past") !== "past") return;
      var op = el("option", { value: x[0], text: x[1] }); if ((o().status || "past") === x[0]) op.selected = true; stSel.appendChild(op);
    });
    [["", "Genre…"]].concat(FIC_GENRES.map(function (g) { return [g, g.charAt(0) + g.slice(1).toLowerCase()]; })).forEach(function (x) {
      var op = el("option", { value: x[0], text: x[1] }); if ((o().genre || "") === x[0]) op.selected = true; genre.appendChild(op);
    });
    var date = el("input", { type: "date", class: "nodirty", value: o().date || "" });
    stSel.addEventListener("change", function () {
      setOverride(c, "status", stSel.value === "past" ? undefined : stSel.value); setOverride(c, "autoPast"); touch(); // choix à la main : plus « automatique »
      var y = window.scrollY; ficCapNew(); slate = ficSlate(); renderFic(); window.scrollTo(0, y); // le film change d'onglet ; le 10e New release passe en Past release
    });
    genre.addEventListener("change", function () { setOverride(c, "genre", genre.value || undefined); touch(); });
    date.addEventListener("change", function () { setOverride(c, "date", date.value || undefined); touch(); if (o().status === "new" && ficCapNew()) { var y = window.scrollY; slate = ficSlate(); renderFic(); window.scrollTo(0, y); } });
    // Plateformes (Netflix, Canal+…) : un mot + Entrée = une étiquette ; × pour la retirer. Sur le site, en haut à gauche
    // de la vignette après le genre (« FEATURE FILM · NETFLIX »), au survol / à la sélection.
    var plats = el("div", { class: "plats" }), pin = el("input", { type: "text", class: "nodirty", placeholder: "Plateforme + Entrée" });
    function drawPlats() {
      plats.textContent = "";
      (o().platforms || []).forEach(function (w, i) {
        var x = el("button", { type: "button", text: "×", title: "Retirer" });
        x.addEventListener("click", function () { var a = (o().platforms || []).slice(); a.splice(i, 1); setOverride(c, "platforms", a.length ? a : undefined); drawPlats(); touch(); });
        plats.appendChild(el("span", { class: "plat" }, [w, x]));
      });
      plats.appendChild(pin);
    }
    pin.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return; e.preventDefault();
      var w = pin.value.trim(); if (!w) return;
      var a = (o().platforms || []).slice(); if (a.indexOf(w) < 0) a.push(w);
      setOverride(c, "platforms", a); pin.value = ""; drawPlats(); touch(); pin.focus();
    });
    drawPlats();
    function posterDrop() {
      var p = (pending.posters || {})[c.slate], cur = o().poster;
      var z = dropZone("image/*", "Affiche (glissez ou cliquez)", function (f) {
        status("Compression de l'affiche…");
        compress(f).then(function (r) { pending.posters = pending.posters || {}; pending.posters[c.slate] = r; z.replaceWith(posterDrop()); touch(); status(""); }, function (e) { status(e.message, "err"); });
      }, function () { if (pending.posters) delete pending.posters[c.slate]; setOverride(c, "poster"); z.replaceWith(posterDrop()); touch(); },
        p ? "Nouvelle affiche" : cur ? "Affiche" : "", p ? p.preview : null);
      z.classList.add("poster");
      if (!p && cur) fetch("https://api.github.com/repos/" + REPO + "/contents/data/" + cur + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) { if (b) z.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)), url("' + URL.createObjectURL(b) + '")'; });
      return z;
    }
    return el("div", { class: "ficctl" }, [el("div", {}, [el("div", { class: "ficrow" }, [stSel, genre, date]), plats]), posterDrop()]);
  }
  function renderFic() {
    view.textContent = ""; editing = true; pagePublish = publishFic;
    state = fic; slate = ficSlate(); isNew = false; listed = true; // filmCard et setOverride travaillent sur state.overrides
    histInit({ get: function () { return { data: fic, refs: Object.assign({}, pending) }; }, set: function (h) { fic = JSON.parse(h.data); pending = Object.assign({}, h.refs); renderFic(); } });
    view.appendChild(el("h1", { text: "Fiction" }));
    view.appendChild(el("p", { class: "lead", text: "Une bande Slate des films de fiction. Pour chaque film : son onglet (New release, Coming soon, Past release), son genre et ses plateformes (affichés à la sélection), , sa date de sortie (affichée au survol dans New releases et Coming soon), son affiche et ses stills." }));
    var input = el("input", { type: "url", class: "nodirty", placeholder: "Lien de la bande Slate (shots.re/… ou kinou.slateapp.com/…)", value: fic.reel || "" });
    var st = el("p", { class: "hint" });
    st.textContent = fic.readError ? "Dernière lecture impossible : " + fic.readError
      : fic.readAt ? (fic.films || []).length + " films, lus sur Slate le " + new Date(fic.readAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) + "."
      : "Collez le lien de la bande puis cliquez sur « Relire la bande ».";
    var imp = el("button", { class: "btn", text: "Relire la bande" });
    imp.addEventListener("click", function () {
      var v = shortLink(input.value);
      if (!v) { st.textContent = "Collez le lien de la bande."; return; }
      fic.reel = v; imp.disabled = true;
      var before = fic.readAt || "";
      st.textContent = "Publication du lien…";
      publishFic(true).then(function () {
        st.textContent = "Le robot GitHub lit toute la bande sur Slate (environ 1 minute)…";
        var t0 = Date.now();
        (function poll() {
          readFile("data/fiction.json").then(function (s) {
            if (s && s.readAt && s.readAt !== before) {
              if (dirty) { st.textContent = "Bande relue : publiez vos changements puis rechargez la page pour la voir."; imp.disabled = false; return; }
              fic = s; fic.overrides = fic.overrides || {}; histReset(); ovBase = sharedSnap(fic.overrides); renderFic();
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
    view.appendChild((fic.films || []).length ? filmsSection() : el("section", {}, [el("h2", { text: "Films" }), el("p", { class: "empty", text: "Pas encore de films : relisez la bande." })]));
    bar.hidden = false;
    seeLink.href = SITE_VIEW + "/#fiction"; seeLink.hidden = false;
    if (flash) status(flash, "ok"); else if (dirty) touch(); else status("");
    flash = "";
  }
  // Publication : fichier en ligne relu (films du robot gardés) ; on n'y écrit que le lien et les réglages, + les affiches déposées.
  function publishFic(justLink) {
    if (justLink !== true) ficCapNew(); // 9 New releases au plus (ex. 10 en ligne avant cette règle)
    publishBtn.disabled = true; status("Publication…");
    var files = [], stamp = Date.now().toString(36);
    for (var id in pending.posters || {}) {
      var path = "fiction/" + id + "-" + stamp + ".webp";
      files.push({ path: "data/" + path, base64: pending.posters[id].base64 });
      fic.overrides[id] = Object.assign({}, fic.overrides[id], { poster: path });
    }
    return readFile("data/fiction.json").then(function (remote) {
      var out = remote || {};
      sharedMerge(fic.overrides, out.overrides); // films reliés : changé sur une fiche ou le spotlight entre-temps
      awMerge(fic.overrides, out.overrides); // prix ajoutés depuis « Nos sélections » entre-temps
      out.reel = fic.reel; out.overrides = fic.overrides;
      if (justLink === true) out.readAsk = new Date().toISOString(); // fichier changé même avec le même lien → le robot relit la bande
      files.push({ path: "data/fiction.json", text: json(out) });
      return commit(files, "Mise à jour de la page fiction (admin, " + user.login + ")").then(function (ref) { out._ref = ref; return out; });
    }).then(function (out) {
      var ref = out._ref; delete out._ref;
      out.overrides = fic.overrides; fic = out; pending = {}; dirty = false; histReset(); ovBase = sharedSnap(out.overrides);
      if (justLink !== true && needsRobot(extrasLists(out.overrides))) afterRobot("data/fiction.json", ref, "fiction", function (d) {
        if (fic !== out) return;
        fullsFrom(out, d); if (!dirty && pagePublish === publishFic) renderFic();
        status("Le robot a ajouté les films complets : le site est à jour.", "ok");
      });
      refreshSite("fiction").catch(function () {});
      if (justLink !== true) { flash = "Publié. Le robot relit la bande sur Slate (environ 1 minute)."; renderFic(); }
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
    bar.hidden = false; seeLink.href = SITE_VIEW + "/#contact"; seeLink.hidden = false;
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

  // ---------- Pages enregistrées tout de suite (festivals, récupération) : Annuler / Rétablir, modifications en cours ----------
  // Chaque enregistrement garde l'avant et l'après : « Annuler » réenregistre l'avant, « Rétablir » l'après (Gus 17/11).
  // Barre en bas à droite (.immbar) ; ⌘Z / Ctrl+Z, ⌘⇧Z / Ctrl+Y hors champ de texte.
  var imm = { stack: [], i: 0 };
  function immInit(redraw) {
    var u = el("button", { type: "button", class: "btn ghost hbtn", title: "Annuler le dernier enregistrement (⌘Z / Ctrl+Z)", on: { click: function () { immGo(-1); } } }, ["↶", el("span", { class: "lg", text: " Annuler" })]);
    var r = el("button", { type: "button", class: "btn ghost hbtn", title: "Rétablir (⌘⇧Z / Ctrl+Y)", on: { click: function () { immGo(1); } } }, ["↷", el("span", { class: "lg", text: " Rétablir" })]);
    imm = { stack: [], i: 0, redraw: redraw, u: u, r: r, msg: el("span", { class: "immmsg" }) };
    imm.bar = el("div", { class: "immbar" }, [u, r, imm.msg]);
    view.appendChild(imm.bar); immBtns();
  }
  function immBtns() { if (!imm.u) return; imm.u.disabled = imm.busy || imm.i === 0; imm.r.disabled = imm.busy || imm.i >= imm.stack.length; }
  function immPush(e) { imm.stack.length = imm.i; imm.stack.push(e); imm.i++; if (imm.stack.length > 50) { imm.stack.shift(); imm.i--; } immBtns(); if (imm.msg) imm.msg.textContent = "Enregistré : " + e.label; }
  function immGo(k) {
    var e = k < 0 ? imm.stack[imm.i - 1] : imm.stack[imm.i];
    if (!e || imm.busy) return;
    imm.busy = true; immBtns(); imm.msg.textContent = (k < 0 ? "Annulation" : "Rétablissement") + "…";
    (k < 0 ? e.undo() : e.redo()).then(function () {
      imm.i += k; imm.msg.textContent = (k < 0 ? "Annulé : " : "Rétabli : ") + e.label;
      if (imm.redraw) imm.redraw();
    }, function (er) { imm.msg.textContent = "Pas fait : " + er.message; }).then(function () { imm.busy = false; immBtns(); });
  }
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || !bar.hidden || !imm.bar || !imm.bar.isConnected) return;
    var k = e.key.toLowerCase(), t = e.target, typing = t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !/^(range|checkbox|button)$/.test(t.type)));
    if (typing || (k !== "z" && k !== "y")) return;
    e.preventDefault(); immGo(k === "y" || e.shiftKey ? 1 : -1);
  });
  // Formulaire ouvert et modifié mais pas enregistré (festival, film de la récupération, mail) : classe .changed → on prévient avant de quitter.
  ["input", "change"].forEach(function (ev) { view.addEventListener(ev, function (e) { var f = e.target.closest && e.target.closest(".fedit, .rcedit"); if (f) f.classList.add("changed"); }); });
  function formsDirty() { return !!view.querySelector(".fedit.changed, .rcedit.changed"); }

  var festTried = false;
  function showSoon(title, txt) {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: title }));
    view.appendChild(el("p", { class: "lead", text: txt || "À venir." }));
  }

  // ---------- Festivals (Gus 16/11) ----------
  // Calendrier des festivals qui nous intéressent : dates, dates limites d'inscription, liens, et boutons « Nos … » vers le site
  // (spotlight / fiction déjà sur le bon onglet). Données dans le dépôt privé Kinou-DoP/notes (festivals/festivals.json), lues et
  // enregistrées directement (comme les notes, sans « Publier »). Fichier absent : créé avec la liste de départ ci-dessous
  // (dates trouvées sur les sites des festivals le 16/11/2026 ; « est » = estimée d'après l'édition précédente, à vérifier).
  var FEST_PATH = "/repos/" + NOTES_REPO + "/contents/festivals/festivals.json";
  var FEST_TYPES = { feature: "Longs", short: "Courts", "music-video": "Clips", commercial: "Pub", cinematography: "Image", event: "Rencontres" };
  var FEST_OURS = { // boutons vers le site (copie Cloudflare) : onglets du spotlight et de la fiction
    "music-video": ["Nos music videos", "/spotlight/music-video"], commercial: ["Nos pubs", "/spotlight/commercial"],
    feature: ["Nos longs métrages", "/fiction/feature-films"], short: ["Nos courts métrages", "/fiction/short-films"]
  };
  var FEST_SEED = [
    { id: "sundance", name: "Sundance Film Festival", city: "Boulder", country: "États-Unis", types: ["feature", "short"], start: "2027-01-21", end: "2027-01-31",
      deadlines: [{ label: "Courts", date: "2027-08-30", ed: "2028", est: true }, { label: "Longs", date: "2027-09-20", ed: "2028", est: true }],
      submit: "https://filmfreeway.com/Sundance", site: "https://www.sundance.org", note: "Nouveau lieu en 2027 : Boulder (Colorado). Édition 2027 : inscriptions closes (courts fin août, longs 21/09/2026)." },
    { id: "clermont", name: "Festival du court métrage de Clermont-Ferrand", city: "Clermont-Ferrand", country: "France", types: ["short"], start: "2027-01-29", end: "2027-02-06",
      deadlines: [{ label: "Films terminés fin 2026", date: "2027-07-08", ed: "2028", est: true }, { label: "Films de 2027", date: "2027-09-30", ed: "2028", est: true }],
      site: "https://www.lecourt-clermont.org", note: "Inscription gratuite. Édition 2027 : inscriptions closes (9/07, 24/09 international, 1/10/2026 France). Marché du film court du 1er au 4 février." },
    { id: "angers", name: "Festival Premiers Plans", city: "Angers", country: "France", types: ["feature", "short"], start: "2027-01-23", end: "2027-01-31",
      deadlines: [{ label: "Inscriptions", date: "2027-09-30", ed: "2028", est: true }],
      submit: "https://www.premiersplans.org/en/calls-for-projects", site: "https://www.premiersplans.org", note: "Premiers et deuxièmes films européens. Édition 2027 : inscriptions closes le 30/09/2026 (30 € long, 10 € court)." },
    { id: "alpe-d-huez", name: "Festival du film de comédie de l'Alpe d'Huez", city: "L'Alpe d'Huez", country: "France", types: ["feature", "short"], start: "2027-01-18", end: "2027-01-24",
      deadlines: [], site: "https://www.alpedhuez.com/fr/selections-apidae/selection-par-defaut-23334/30e-festival-international-du-film-de-comedie/", note: "30e édition. Dates d'inscription à vérifier." },
    { id: "iffr", name: "IFFR – International Film Festival Rotterdam", city: "Rotterdam", country: "Pays-Bas", types: ["feature", "short"], start: "2027-01-28", end: "2027-02-07",
      deadlines: [{ label: "Early", date: "2027-06-15", ed: "2028", est: true }, { label: "Regular", date: "2027-08-31", ed: "2028", est: true }, { label: "Late", date: "2027-09-15", ed: "2028", est: true }],
      site: "https://iffr.com", note: "Édition 2027 : inscriptions closes le 15/09/2026. Programme complet le 16/12/2026." },
    { id: "berlinale", name: "Berlinale", city: "Berlin", country: "Allemagne", types: ["feature", "short"], start: "2027-02-10", end: "2027-02-21",
      deadlines: [{ label: "Longs", date: "2027-10-20", ed: "2028", est: true }, { label: "Courts", date: "2027-11-03", ed: "2028", est: true }],
      submit: "https://www.berlinale.de/en/film-entry/guidelines/general-guidelines.html", site: "https://www.berlinale.de", note: "Édition 2027 : inscriptions closes (longs 21/10, courts 4/11/2026)." },
    { id: "cannes", name: "Festival de Cannes", city: "Cannes", country: "France", types: ["feature", "short"], start: "2027-05-11", end: "2027-05-22",
      deadlines: [{ label: "La Cinef (écoles)", date: "2027-02-15", ed: "2027" }, { label: "Courts en compétition", date: "2027-03-01", ed: "2027", est: true }, { label: "Quinzaine des cinéastes – courts", date: "2027-03-05", ed: "2027" }],
      submit: "https://www.festival-cannes.com/participer/inscrire-un-film/", site: "https://www.festival-cannes.com", note: "Courts en compétition : moins de 15 min, faits dans les 12 mois avant le festival. Date limite des longs à vérifier." },
    { id: "berlin-mva", name: "Berlin Music Video Awards", city: "Berlin", country: "Allemagne", types: ["music-video"], start: "2027-06-10", end: "2027-06-12",
      deadlines: [{ label: "Early bird", date: "2026-11-15", ed: "2027" }, { label: "Regular", date: "2027-02-07", ed: "2027" }, { label: "Late", date: "2027-03-07", ed: "2027" }],
      submit: "https://www.berlinmva.com/submit/", site: "https://www.berlinmva.com", note: "Clips terminés après le 1/01/2026, 8 min max. Nominations le 7/04/2027. Date « late » peut-être repoussée au 12/03." },
    { id: "london-mva", name: "London Music Video Awards", city: "Londres", country: "Royaume-Uni", types: ["music-video"], start: "2027-06-26", end: "2027-06-26",
      deadlines: [{ label: "Hiver", date: "2026-12-18", ed: "2027" }, { label: "Regular", date: "2027-02-05", ed: "2027" }, { label: "Late", date: "2027-03-05", ed: "2027" }, { label: "Final", date: "2027-03-26", ed: "2027" }],
      submit: "https://filmfreeway.com/LondonMVA", note: "Résultats le 5/04/2027. Date de la cérémonie à confirmer." },
    { id: "angouleme", name: "Festival du film francophone d'Angoulême", city: "Angoulême", country: "France", types: ["feature"], start: "2027-08-23", end: "2027-08-28",
      deadlines: [{ label: "Inscriptions", date: "2027-06-15", ed: "2027", est: true }], site: "https://filmfrancophone.fr", note: "Date limite d'inscription à vérifier (juin en général)." },
    { id: "venise", name: "Mostra de Venise", city: "Venise", country: "Italie", types: ["feature", "short"], start: "2027-09-01", end: "2027-09-11", est: true,
      deadlines: [{ label: "Inscriptions", date: "2027-06-10", ed: "2027", est: true }], site: "https://www.labiennale.org/en/cinema", note: "Dates 2027 pas encore annoncées (2026 : 2–12 septembre)." },
    { id: "tiff", name: "TIFF – Toronto International Film Festival", city: "Toronto", country: "Canada", types: ["feature", "short"], start: "2027-09-09", end: "2027-09-19", est: true,
      deadlines: [{ label: "Date limite standard", date: "2027-05-07", ed: "2027", est: true }], submit: "https://tiff.net/submissions", site: "https://tiff.net", note: "2026 : 10–20 septembre, date limite le 8 mai." },
    { id: "strasbourg", name: "Festival européen du film fantastique de Strasbourg", city: "Strasbourg", country: "France", types: ["feature", "short"], start: "2027-09-24", end: "2027-10-03", est: true,
      deadlines: [{ label: "Inscriptions (ouverture en février)", date: "2027-06-07", ed: "2027", est: true }], submit: "https://filmfreeway.com/festival-feffs", site: "https://strasbourgfestival.com", note: "2026 : 25 sept.–4 oct. ; inscriptions du 15/02 au 7/06." },
    { id: "ciclope", name: "CICLOPE Festival", city: "Berlin", country: "Allemagne", types: ["commercial", "music-video"], start: "2027-10-05", end: "2027-10-07", est: true,
      deadlines: [{ label: "Inscriptions", date: "2027-08-13", ed: "2027", est: true }], submit: "https://awards.ciclopefestival.com", site: "https://www.ciclopefestival.com", note: "Le craft de la pub et des clips. 2026 : 6–8 octobre (HKW), inscriptions jusqu'au 14/08." },
    { id: "arp", name: "Rencontres cinématographiques de l'ARP", city: "Le Touquet-Paris-Plage", country: "France", types: ["event"], start: "2027-11-03", end: "2027-11-05", est: true,
      deadlines: [], site: "https://www.larp.fr", note: "Rencontres professionnelles (débats) : pas d'inscription de films. 2026 : 4–6 novembre." },
    { id: "ukmva", name: "UK Music Video Awards", city: "Londres", country: "Royaume-Uni", types: ["music-video"], start: "2027-11-03", end: "2027-11-03", est: true,
      deadlines: [{ label: "Inscriptions (ouverture en juin)", date: "2027-08-02", ed: "2027", est: true }], site: "https://www.ukmva.com", note: "2026 : cérémonie le 4/11 (Roundhouse), inscriptions du 10/06 au 3/08." },
    { id: "camerimage", name: "Camerimage", city: "Toruń", country: "Pologne", types: ["cinematography", "feature", "short", "music-video"], start: "2027-11-06", end: "2027-11-13", est: true,
      deadlines: [{ label: "Compétition principale (early)", date: "2027-05-31", ed: "2027", est: true }, { label: "Compétition principale (late)", date: "2027-06-30", ed: "2027", est: true }, { label: "Clips, écoles, séries", date: "2027-07-15", ed: "2027", est: true }],
      site: "https://camerimage.pl/en", note: "Le festival de l'image et des chefs op. 2026 : 7–14 novembre." },
    { id: "brest", name: "Festival européen du film court de Brest", city: "Brest", country: "France", types: ["short"], start: "2027-11-09", end: "2027-11-14", est: true,
      deadlines: [], site: "https://www.filmcourt.fr", note: "Premiers films européens (fiction). Date limite à vérifier. 2026 : 10–15 novembre." },
    { id: "les-arcs", name: "Les Arcs Film Festival", city: "Les Arcs", country: "France", types: ["feature"], start: "2026-12-12", end: "2026-12-19",
      deadlines: [{ label: "Appel à films", date: "2027-08-15", ed: "2027", est: true }], site: "https://film.lesarcs-filmfest.com", note: "Cinéma européen. Appel à films 2026 clos le 15/08." }
  ].map(function (f) { f.checked = "2026-11-16"; f.source = "robot"; return f; }); // remplis par Claude (recherche du 16/11), pas par l'équipe

  var fest = null, festSha = null, festErr = "", festBusy = null;
  function festLoad() { // une seule lecture à la fois (menu + page ouverts ensemble : sinon la liste de départ serait écrite deux fois)
    if (!festBusy) festBusy = festRead().then(function (d) { festBusy = null; return d; }, function (e) { festBusy = null; throw e; });
    return festBusy;
  }
  function festRead() {
    return gh(FEST_PATH, { allow404: true }).then(function (f) {
      if (f) { festSha = f.sha; fest = JSON.parse(b64dec(f.content)); return fest; }
      return gh("/repos/" + NOTES_REPO, { allow404: true }).then(function (r) {
        if (!r) throw new Error("absent");
        fest = { festivals: FEST_SEED }; festSha = null;
        return festPut("Festivals : liste de départ").then(function () { return fest; });
      });
    }).then(function (d) { festErr = ""; return d; }, function (e) {
      festErr = e && e.message === "absent" ? "Le dépôt privé « Kinou-DoP/notes » doit exister et être ajouté à votre clé GitHub." : (e && e.message) || "Lecture impossible";
      throw e;
    });
  }
  function festPut(msg) {
    return gh(FEST_PATH, { method: "PUT", body: { message: msg + " (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(fest, null, 2) + "\n"), sha: festSha || undefined } })
      .then(function (r) { festSha = r.content.sha; });
  }
  // Enregistre un festival (ou le supprime) : relit le fichier (autre personne entre-temps), ne remplace que celui-là.
  function festSave(f, remove) {
    return gh(FEST_PATH, { allow404: true }).then(function (cur) {
      if (cur) { festSha = cur.sha; fest = JSON.parse(b64dec(cur.content)); }
      var list = fest.festivals = (fest.festivals || []).filter(function (x) { return x.id !== f.id; });
      if (!remove) list.push(f);
      return festPut((remove ? "Festival supprimé : " : "Festival : ") + f.name);
    });
  }
  // Enregistre (ou supprime) avec Annuler / Rétablir : avant = version d'avant (absente pour un nouveau festival).
  function festSaveLog(f, before, remove, label) {
    var a = JSON.parse(JSON.stringify(f)), b = before ? JSON.parse(JSON.stringify(before)) : null;
    return festSave(a, remove).then(function () {
      immPush({ label: label || f.name,
        undo: function () { return b ? festSave(b) : festSave(a, true); },
        redo: function () { return festSave(a, remove); } });
    });
  }
  // Demande au robot du dépôt notes (festivals/ask/…, workflow festival-ask.yml) : réponse écrite dans le même fichier.
  function festAsk(name, hint) {
    var path = "/repos/" + NOTES_REPO + "/contents/festivals/ask/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + ".json", t0 = Date.now();
    var body = { name: name, hint: hint || undefined, at: new Date().toISOString(), by: user && user.login || "" };
    return gh(path, { method: "PUT", body: { message: "Festivals : demande au robot (admin, " + body.by + ")", content: b64enc(JSON.stringify(body, null, 2) + "\n") } }).then(function () {
      return new Promise(function (ok, ko) {
        (function poll() {
          setTimeout(function () {
            if (Date.now() - t0 > 300000) return ko(new Error("le robot n'a pas répondu (5 min) : réessayez plus tard."));
            gh(path, { allow404: true }).then(function (r) {
              var d = r && JSON.parse(b64dec(r.content));
              if (!d || !d.doneAt) return poll();
              if (d.error || !d.answer) ko(new Error(d.error || "rien trouvé")); else ok(d.answer);
            }, poll);
          }, 5000);
        })();
      });
    });
  }
  // Réponse du robot → champs du formulaire : seulement les champs vides (et les dates « estimées », remplacées par des dates
  // annoncées). Ce que l'équipe a saisi n'est jamais remplacé (Gus 16/11). Renvoie le nombre de champs remplis.
  function festFill(f, a) {
    var n = 0;
    ["city", "country", "submit", "site", "selection", "note"].forEach(function (k) { if (!f[k] && a[k]) { f[k] = a[k]; n++; } });
    if (!f.name && a.name) { f.name = a.name; n++; }
    if (!(f.types || []).length && (a.types || []).length) { f.types = a.types; n++; }
    if ((!f.start || (f.est && !a.est)) && a.start) { f.start = a.start; f.end = a.end || a.start; if (a.est) f.est = true; else delete f.est; n++; }
    var dl = f.deadlines || [], firm = (a.deadlines || []).filter(function (d) { return !d.est; });
    if (!dl.length && (a.deadlines || []).length) { f.deadlines = a.deadlines; n++; }
    else if (dl.length && dl.every(function (d) { return d.est; }) && firm.length) { f.deadlines = a.deadlines; n++; }
    if (n) f.filled = { by: "robot", at: new Date().toISOString(), sources: a.sources || [] };
    return n;
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dOf(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function days(s) { var d = dOf(s); return d ? Math.round((d - today()) / 864e5) : null; }
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function fdate(s, year) { var d = dOf(s); return d ? d.getDate() + " " + MOIS[d.getMonth()] + (year === false ? "" : " " + d.getFullYear()) : ""; }
  function frange(a, b) {
    var x = dOf(a), y = dOf(b || a); if (!x) return "dates à venir";
    if (!y || +x === +y) return fdate(a);
    if (x.getFullYear() === y.getFullYear()) return (x.getMonth() === y.getMonth() ? x.getDate() : fdate(a, false)) + " – " + fdate(b);
    return fdate(a) + " – " + fdate(b);
  }
  function when(n) { return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n > 0 ? "dans " + n + " j" : "passée"; }
  // Notifications : dates limites dans les 14 jours (hors estimées), pastille sur « festivals » dans le menu.
  function festAlerts(list) {
    var out = [];
    (list || []).forEach(function (f) {
      (f.deadlines || []).forEach(function (d) { var n = days(d.date); if (n !== null && n >= 0 && n <= 14 && !d.est) out.push({ f: f, d: d, n: n }); });
    });
    return out;
  }
  function festBadge() {
    var a = side.querySelector('.sgroup[data-group="festivals"]'); if (!a) return;
    var n = fest ? festAlerts(fest.festivals).length + (fest.festivals || []).filter(function (f) { return f.source === "human" && f.check && (f.check.issues || []).some(function (i) { return i.kind !== "page"; }) && f.checkSeen !== f.check.hash; }).length : 0, b = a.querySelector(".nbadge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = el("span", { class: "nbadge" }); a.appendChild(b); }
    b.textContent = n; b.title = "Dates limites d'inscription dans les 14 jours et festivals à vérifier (triangle orange)";
  }

  function showFestivals() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: "Festivals" }));
    view.appendChild(el("p", { class: "lead", text: "Dates des festivals, dates limites d'inscription et liens. Les dates « estimées » viennent de l'édition précédente : à vérifier sur le site du festival." }));
    var box = el("div", {}, [el("p", { class: "hint", text: "Chargement…" })]);
    view.appendChild(box); immInit(function () { festBadge(); draw(); });
    festLoad().then(function () { festBadge(); draw(); }, function () { box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "Indisponible : " + festErr })); });
    var filter = "", fq = "";
    function draw() {
      box.textContent = "";
      var list = (fest.festivals || []).slice();
      // Bientôt : dates limites dans les 45 jours, festivals qui commencent dans les 30 jours (ou en cours).
      var soon = [];
      list.forEach(function (f) {
        // Deux sortes de dates, bien distinguées (Gus 16/11) : dernier jour pour inscrire un film / dates du festival lui-même.
        (f.deadlines || []).forEach(function (d) { var n = days(d.date); if (n !== null && n >= 0 && n <= 45) soon.push({ n: n, f: f, kind: "dl", date: d.date, txt: "Dernier jour pour inscrire un film : " + fdate(d.date) + " · " + d.label + (d.ed ? " (édition " + d.ed + ")" : ""), est: d.est, url: f.submit || f.site, go: "S'inscrire ↗" }); });
        var s = days(f.start), e = days(f.end || f.start);
        if (s !== null && e >= 0 && s <= 30) soon.push({ n: Math.max(s, 0), f: f, kind: "fest", date: f.start, txt: s <= 0 ? "Le festival a lieu en ce moment, jusqu'au " + fdate(f.end) : "Dates du festival : " + frange(f.start, f.end), est: f.est, url: f.selection || f.site, go: "Programme ↗", live: s <= 0 });
      });
      soon.sort(function (a, b) { return a.n - b.n; });
      var sec = el("section", { class: "fsoon" }, [el("h2", { text: "Bientôt" })]);
      if (!soon.length) sec.appendChild(el("p", { class: "hint", text: "Rien dans les semaines qui viennent." }));
      soon.forEach(function (x) {
        sec.appendChild(el("div", { class: "fsrow " + x.kind + (x.n <= 7 ? " hot" : "") + (x.live ? " live" : "") }, [
          el("span", { class: "fswhen" }, [x.live ? "en cours" : when(x.n), el("small", { text: x.live ? "" : fdate(x.date, false) })]),
          el("div", { class: "fstxt" }, [el("span", { class: "fskind", text: x.kind === "dl" ? "Inscriptions" : "Festival" }), el("strong", { text: x.f.name }), el("span", { text: x.txt + (x.est ? " (date estimée)" : "") })]),
          x.url ? el("a", { class: "btn", href: x.url, target: "_blank", rel: "noopener", text: x.go }) : null
        ]));
      });
      box.appendChild(sec);
      // Filtres par type, puis calendrier (prochaine édition d'abord ; éditions passées à la fin, « à mettre à jour »).
      var chips = el("div", { class: "fchips" });
      [["", "Tous"]].concat(Object.keys(FEST_TYPES).map(function (k) { return [k, FEST_TYPES[k]]; })).forEach(function (c) {
        if (c[0] && !list.some(function (f) { return (f.types || []).indexOf(c[0]) > -1; })) return;
        chips.appendChild(el("button", { type: "button", class: "chip" + (filter === c[0] ? " on" : ""), text: c[1], on: { click: function () { filter = c[0]; draw(); } } }));
      });
      chips.appendChild(el("button", { type: "button", class: "btn fadd", text: "+ Ajouter un festival", on: { click: function () { edit({ id: "", name: "", types: [], deadlines: [] }, true); } } }));
      // Recherche (comme la liste des chefs op) : nom, ville, pays, sans accents ; seules les cartes sont refaites (le champ garde la main).
      var find = el("input", { type: "search", class: "find nodirty", placeholder: "Rechercher un festival, une ville, un pays…", value: fq });
      var cards = el("div", {}), none = el("p", { class: "hint", text: "Aucun festival ne correspond." });
      var cal = el("section", { class: "fcal" }, [el("h2", { text: "Calendrier" }), find, chips, cards]);
      function nrm(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
      function fillCards() {
        var w = nrm(fq).split(/\s+/).filter(Boolean); cards.textContent = "";
        var l = list.filter(function (f) { return (!filter || (f.types || []).indexOf(filter) > -1) && w.every(function (x) { return nrm([f.name, f.city, f.country].join(" ")).indexOf(x) > -1; }); })
          .sort(function (a, b) { var pa = days(a.end || a.start) < 0, pb = days(b.end || b.start) < 0; return pa !== pb ? (pa ? 1 : -1) : String(a.start || "9").localeCompare(String(b.start || "9")); });
        l.forEach(function (f) { cards.appendChild(card(f)); });
        if (!l.length) cards.appendChild(none);
      }
      find.addEventListener("input", function () { fq = find.value; fillCards(); });
      find.addEventListener("keydown", function (e) { if (e.key === "Enter") { var c = cards.querySelector(".fcard"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); } });
      fillCards();
      box.appendChild(cal);
    }
    // Robot du matin (dépôt notes, tools/check-festivals.mjs) : f.check.issues = désaccords avec le site du festival. Ce que l'équipe a
    // saisi reste ; un triangle orange le signale tant que personne ne l'a marqué « vu » (checkSeen = check.hash, Gus 16/11).
    // Triangles seulement sur les festivals enregistrés par quelqu'un (source « human ») : ceux du robot sont mis à jour par lui.
    function warnOn(f) {
      var l = f.source === "human" && f.check && f.checkSeen !== f.check.hash ? (f.check.issues || []).filter(function (i) { return i.kind !== "page"; }) : [];
      return l.length ? l : null;
    }
    function tri(title) { return el("span", { class: "ftri", title: title || "Le site du festival indique autre chose", text: "!" }); }
    function card(f) {
      var past = days(f.end || f.start) < 0, warn = warnOn(f);
      var c = el("article", { class: "fcard" + (past ? " past" : ""), "data-id": f.id });
      c.appendChild(el("div", { class: "fhead" }, [
        el("div", {}, [el("h3", {}, [warn ? tri() : null, f.name]), el("p", { class: "fwhere", text: [f.city, f.country].filter(Boolean).join(" · ") })]),
        el("div", { class: "ftags" }, (f.types || []).map(function (t) { return el("span", { class: "ftag", text: FEST_TYPES[t] || t }); }))
      ]));
      var wStart = warn && warn.filter(function (i) { return i.kind === "start" || (i.kind === "new" && !i.label); })[0];
      c.appendChild(el("p", { class: "fdates" }, [el("span", { class: "label", text: "Festival" }), wStart ? tri(wStart.msg) : null, el("strong", { text: frange(f.start, f.end) }),
        f.est ? el("em", { text: "estimé" }) : null, past ? el("em", { class: "old", text: "édition passée : dates à mettre à jour" }) : null]));
      if ((f.deadlines || []).length) {
        var dl = el("ul", { class: "fdl" });
        f.deadlines.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).forEach(function (d) {
          var n = days(d.date), w = warn && warn.filter(function (i) { return i.label && i.date === d.date && i.label === d.label; })[0];
          dl.appendChild(el("li", { class: n !== null && n < 0 ? "gone" : n !== null && n <= 14 ? "hot" : "" }, [
            el("span", { class: "fdlabel" }, [w ? tri(w.msg) : null, d.label + (d.ed ? " · édition " + d.ed : "")]),
            el("span", { class: "fddate", text: fdate(d.date) }),
            el("span", { class: "fdwhen", text: n === null ? "" : (n < 0 ? "passée" : when(n)) + (d.est ? " · estimée" : "") })
          ]));
        });
        c.appendChild(el("div", {}, [el("span", { class: "label", text: "Inscriptions" }), dl]));
      } else c.appendChild(el("p", { class: "hint", text: "Pas de date limite connue." }));
      if (f.note) c.appendChild(el("p", { class: "fnote", text: f.note }));
      if (warn) {
        var wb = el("div", { class: "fwarn" }, [el("strong", {}, [tri(), "Le site du festival ne dit pas la même chose"])]);
        warn.forEach(function (i) {
          var t = (i.label ? i.label + " — " : i.kind !== "deadline" ? "Festival — " : "") + "chez nous : " + fdate(i.date) + (i.kind === "new" ? " (estimée)" : "")
            + " · sur le site : " + (i.dates || []).map(function (d) { return fdate(d); }).join(", ") + ". " + i.msg;
          wb.appendChild(el("p", { text: t }));
        });
        var pg = el("p", { class: "fwpages" }, ["Pages lues : "]);
        (f.check.pages || []).forEach(function (x, k) { if (k) pg.appendChild(document.createTextNode(" · ")); pg.appendChild(el("a", { href: x.url, target: "_blank", rel: "noopener", text: x.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48) + " ↗" })); });
        wb.appendChild(pg);
        wb.appendChild(el("div", { class: "fwbtns" }, [
          el("button", { type: "button", class: "btn", text: "Vu, nos infos sont bonnes", on: { click: function (e) {
            var g = JSON.parse(JSON.stringify(f)); g.checkSeen = f.check.hash; e.target.disabled = true;
            festSaveLog(g, f, false, f.name + " : vu").then(draw, function (er) { e.target.disabled = false; window.alert("Pas enregistré : " + er.message); });
          } } }),
          el("button", { type: "button", class: "btn ghost", text: "Corriger", on: { click: function () { edit(f); } } })
        ]));
        c.appendChild(wb);
      }
      var links = el("div", { class: "flinks" });
      if (f.submit) links.appendChild(el("a", { class: "btn primary", href: f.submit, target: "_blank", rel: "noopener", text: "S'inscrire ↗" }));
      if (f.site) links.appendChild(el("a", { class: "btn", href: f.site, target: "_blank", rel: "noopener", text: "Site ↗" }));
      if (f.selection) links.appendChild(el("a", { class: "btn", href: f.selection, target: "_blank", rel: "noopener", text: "Sélection ↗" }));
      (f.types || []).forEach(function (t) { var o = FEST_OURS[t]; if (o) links.appendChild(el("a", { class: "btn ours", href: SITE_VIEW + o[1], target: "_blank", rel: "noopener", text: o[0] + " ↗" })); });
      c.appendChild(links);
      var who = f.source === "human" ? "Modifié" + (f.editedBy ? " par " + f.editedBy : "") + (f.editedAt ? " le " + fdate(f.editedAt.slice(0, 10)) : "") + " · le robot n'y touche plus"
        : "Rempli par le robot" + (f.filled ? " le " + fdate(f.filled.at.slice(0, 10)) : f.checked ? " le " + fdate(f.checked) : "") + " · mis à jour automatiquement";
      c.appendChild(el("div", { class: "ffoot" }, [el("span", {}, [el("span", { class: "fsrc " + (f.source === "human" ? "h" : "r"), text: f.source === "human" ? "humain" : "robot" }), who + (f.filled && f.source === "human" ? " · complété automatiquement le " + fdate(f.filled.at.slice(0, 10)) : "") + (f.check ? " · vérifié par le robot le " + fdate(f.check.at.slice(0, 10)) : "") + ((f.check && (f.check.issues || []).some(function (i) { return i.kind === "page"; })) ? " (site illisible pour lui)" : "")]),
        el("button", { type: "button", class: "btn ghost", text: "Modifier", on: { click: function () { edit(f); } } })]));
      return c;
    }
    // Formulaire (en place de la carte, ou en haut pour un nouveau festival) ; « Enregistrer » écrit tout de suite.
    function edit(f0, isNew, draft, node) {
      var f = draft || JSON.parse(JSON.stringify(f0)), form = el("article", { class: "fcard fedit" });
      function inp(k, ph, type) {
        var i = el("input", { type: type || "text", class: "nodirty", placeholder: ph || "", value: f[k] || "" });
        i.addEventListener("input", function () { f[k] = i.value.trim(); });
        return el("label", { class: "field" }, [el("span", { class: "label", text: ph }), i]);
      }
      form.appendChild(el("div", { class: "fgrid" }, [inp("name", "Nom"), inp("city", "Ville"), inp("country", "Pays")]));
      // « Compléter automatiquement » : le robot du dépôt notes cherche le festival sur le web (Claude) et remplit les champs vides.
      var amsg = el("span", { class: "fmsg", text: f.autoMsg || "" }); delete f.autoMsg;
      var auto = el("button", { type: "button", class: "btn primary", text: "Compléter automatiquement", on: { click: function () {
        if (!f.name) { amsg.textContent = "Écrivez d'abord le nom du festival."; return; }
        auto.disabled = true; amsg.textContent = "Recherche sur le web par le robot (1 à 2 min)…";
        festAsk(f.name, [f.city, f.country].filter(Boolean).join(", ")).then(function (a) {
          var n = festFill(f, a);
          f.autoMsg = n ? "Complété (" + n + " champ" + (n > 1 ? "s" : "") + ") : vérifiez, puis « Enregistrer »." + (a.sources && a.sources.length ? " Sources : " + a.sources.map(function (u) { return u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]; }).join(", ") : "")
            : "Rien de nouveau trouvé : les champs remplis par l'équipe ne sont jamais remplacés.";
          edit(f0, isNew, f, form);
        }, function (e) { auto.disabled = false; amsg.textContent = "Pas de réponse : " + e.message; });
      } } });
      form.appendChild(el("div", { class: "fauto" }, [auto, amsg]));
      var ty = el("div", { class: "ftypes" });
      Object.keys(FEST_TYPES).forEach(function (k) {
        var cb = el("input", { type: "checkbox", class: "nodirty" }); cb.checked = (f.types || []).indexOf(k) > -1;
        cb.addEventListener("change", function () { f.types = Object.keys(FEST_TYPES).filter(function (t) { return t === k ? cb.checked : (f.types || []).indexOf(t) > -1; }); });
        ty.appendChild(el("label", { class: "check" }, [cb, el("span", { text: FEST_TYPES[k] })]));
      });
      form.appendChild(el("div", { class: "field" }, [el("span", { class: "label", text: "Types (boutons « Nos … » vers le site)" }), ty]));
      var est = el("input", { type: "checkbox", class: "nodirty" }); est.checked = !!f.est;
      est.addEventListener("change", function () { if (est.checked) f.est = true; else delete f.est; });
      form.appendChild(el("div", { class: "fgrid" }, [inp("start", "Début du festival", "date"), inp("end", "Fin", "date"),
        el("label", { class: "check fest" }, [est, el("span", { text: "Dates estimées" })])]));
      var dls = el("div", { class: "fdledit" });
      function drawDl() {
        dls.textContent = "";
        (f.deadlines || []).forEach(function (d, i) {
          var l = el("input", { type: "text", class: "nodirty", placeholder: "Nom (ex. Courts, Early, Late)", value: d.label || "" });
          var t = el("input", { type: "date", class: "nodirty", value: d.date || "" });
          var e = el("input", { type: "text", class: "nodirty", placeholder: "Édition", value: d.ed || "" });
          var s = el("input", { type: "checkbox", class: "nodirty" }); s.checked = !!d.est;
          l.addEventListener("input", function () { d.label = l.value.trim(); }); t.addEventListener("input", function () { d.date = t.value; });
          e.addEventListener("input", function () { d.ed = e.value.trim(); });
          s.addEventListener("change", function () { if (s.checked) d.est = true; else delete d.est; });
          dls.appendChild(el("div", { class: "fdlrow" }, [l, t, e, el("label", { class: "check" }, [s, el("span", { text: "estimée" })]),
            el("button", { type: "button", class: "btn ghost", text: "×", title: "Retirer", on: { click: function () { f.deadlines.splice(i, 1); drawDl(); } } })]));
        });
        dls.appendChild(el("button", { type: "button", class: "btn ghost", text: "+ Ajouter une date limite", on: { click: function () { (f.deadlines = f.deadlines || []).push({ label: "", date: "" }); drawDl(); } } }));
      }
      drawDl();
      form.appendChild(el("div", { class: "field" }, [el("span", { class: "label", text: "Dates limites d'inscription" }), dls]));
      form.appendChild(el("div", { class: "fgrid" }, [inp("submit", "Lien d'inscription", "url"), inp("site", "Site du festival", "url"), inp("selection", "Page de la sélection", "url")]));
      var note = el("textarea", { class: "nodirty", rows: "2", placeholder: "Remarques (conditions, tarifs…)" }); note.value = f.note || "";
      note.addEventListener("input", function () { f.note = note.value.trim(); });
      form.appendChild(el("label", { class: "field" }, [el("span", { class: "label", text: "Remarques" }), note]));
      var msg = el("span", { class: "fmsg" });
      function done() { draw(); }
      var save = el("button", { type: "button", class: "btn primary", text: "Enregistrer", on: { click: function () {
        if (!f.name) { msg.textContent = "Il faut un nom."; return; }
        if (!f.id) f.id = slugify(f.name) + "-" + Date.now().toString(36);
        f.deadlines = (f.deadlines || []).filter(function (d) { return d.date || d.label; });
        f.checked = new Date().toISOString().slice(0, 10);
        f.source = "human"; f.editedBy = user && user.login || ""; f.editedAt = new Date().toISOString(); // enregistré par quelqu'un : le robot n'y touche plus
        if (f.check) f.checkSeen = f.check.hash; // la personne vient de vérifier : désaccords actuels marqués « vus »
        Object.keys(f).forEach(function (k) { if (f[k] === "") delete f[k]; });
        save.disabled = true; msg.textContent = "Enregistrement…";
        festSaveLog(f, isNew ? null : f0).then(function () { festBadge(); done(); }, function (e) { save.disabled = false; msg.textContent = "Pas enregistré : " + e.message; });
      } } });
      var del = isNew ? null : el("button", { type: "button", class: "btn ghost", text: "Supprimer", on: { click: function () {
        if (!window.confirm("Supprimer « " + f0.name + " » du calendrier ?")) return;
        festSaveLog(f0, f0, true, f0.name + " supprimé").then(function () { festBadge(); done(); }, function (e) { msg.textContent = "Pas supprimé : " + e.message; });
      } } });
      form.appendChild(el("div", { class: "ffoot" }, [msg, el("div", {}, [del, el("button", { type: "button", class: "btn ghost", text: "Annuler", on: { click: done } }), save])]));
      if (node) { node.replaceWith(form); return; } // nouvel affichage après « Compléter automatiquement »
      var at = isNew ? box.querySelector(".fcal h2") : null;
      if (at) at.parentNode.insertBefore(form, at.parentNode.querySelector(".fchips").nextSibling);
      else { var mine = box.querySelector('.fcard[data-id="' + f0.id + '"]'); if (mine) mine.replaceWith(form); else box.prepend(form); }
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
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
  function awLine(x) {
    var y = String(x.edition || String(x.date || "").slice(0, 4) || ""), fest = String(x.festName || x.fest || "").trim();
    var where = fest + (y && fest.indexOf(y) < 0 ? " " + y : "");
    if (x.kind === "prize") return (x.prize || "Prize") + (x.image && !/image|photo|cin[eé]matograph/i.test(x.prize || "") ? " (cinematography)" : "") + ", " + where;
    if (x.kind === "nomination") return "Nominated" + (x.prize || x.section ? ", " + (x.prize || x.section) : "") + ", " + where;
    return "Official selection" + (x.section ? " – " + x.section : "") + ", " + where;
  }
  function awApply(ov, id, items) {
    var o = ov[id] || {}, info = Object.assign({}, o.info || {}), from = Object.assign({}, info.awardsFrom || {}), ch = false, want = {};
    var lines = String(info.awards || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), hid = (info.awardsHidden || []).slice();
    items.forEach(function (x) { want[x.id] = 1; });
    Object.keys(from).forEach(function (k) {
      if (want[k]) return;
      var i = lines.indexOf(from[k]); if (i > -1) lines.splice(i, 1);
      i = hid.indexOf(from[k]); if (i > -1) hid.splice(i, 1);
      delete from[k]; ch = true;
    });
    function rk(x) { return x.kind === "prize" ? 0 : x.kind === "nomination" ? 1 : 2; }
    items.slice().sort(function (a, b) { return rk(a) - rk(b) || String(b.edition || b.date || "").localeCompare(String(a.edition || a.date || "")); }).forEach(function (x) {
      if (from[x.id] !== undefined) return;
      var l = awLine(x); if (!lines.concat(hid).some(function (z) { return sortNrm(z) === sortNrm(l); })) lines.push(l);
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
  function awHit(x, title) { return awTitles(x).some(function (t) { return sortSame(ficTitle(title), t); }); }
  // Applique les trouvailles confirmées à un fichier du site (fiche d'un chef op, ou page fiction) ; null = rien à changer.
  function awFile(text, items, fiction) {
    if (!text) return null;
    var d = JSON.parse(text), ov = d.overrides = d.overrides || {}, ch = false, ids = {};
    var list = fiction ? (d.films || []).map(function (f) { return { id: String(f.slate), title: (ov[f.slate] || {}).title || f.title, dops: f.artists || [] }; })
      : (d.clips || []).map(function (c) { return { id: String(c.slate), title: (ov[c.slate] || {}).title || c.title }; });
    list.forEach(function (f) { if (f.id && f.id !== "undefined") ids[f.id] = f; });
    Object.keys(ov).forEach(function (id) { if (ov[id].info && ov[id].info.awardsFrom && !ids[id]) ids[id] = { id: id, title: "" }; });
    Object.keys(ids).forEach(function (id) {
      var f = ids[id], mine = f.title ? items.filter(function (x) { return awHit(x, f.title) && (!fiction || !f.dops.length || sortDop(f.dops, x.dops)); }) : [];
      if (awApply(ov, id, mine)) ch = true;
    });
    return ch ? json(d) : null;
  }
  var awT = 0, awBusy = null;
  function awardsSoon() { clearTimeout(awT); awT = setTimeout(awardsSync, 1500); }
  function awardsSync() {
    if (!canWeb || !sel || awBusy) return awBusy;
    var ok = sel.found.filter(function (x) { return x.status === "ok" && x.title; });
    var note = document.querySelector(".awnote"); if (note) { note.textContent = "Site : mise à jour des prix…"; note.className = "awnote hint"; }
    awBusy = loadIndex().then(function (idx) {
      // Fiches concernées : chefs op crédités sur une trouvaille confirmée, plus celles qui ont déjà des prix ajoutés (retraits).
      var byName = {}; (idx.dps || []).forEach(function (d) { byName[sortNrm(rcBase(d.name))] = d.slug; });
      var slugs = {};
      sel.found.forEach(function (x) { (x.dops || []).forEach(function (n) { var sl = byName[sortNrm(rcBase(n))]; if (sl) slugs[sl] = 1; }); }); // aussi écartées : retrait
      Object.keys(awDone).forEach(function (sl) { slugs[sl] = 1; });
      var files = [{ path: "data/fiction.json", edit: function (t) { return awFile(t, ok, true); } }];
      Object.keys(slugs).forEach(function (sl) {
        var name = ((idx.dps || []).filter(function (d) { return d.slug === sl; })[0] || {}).name || "";
        var mine = ok.filter(function (x) { return (x.dops || []).some(function (n) { return sortNrm(rcBase(n)) === sortNrm(rcBase(name)); }); });
        files.push({ path: "data/dps/" + sl + ".json", edit: function (t) { var r = awFile(t, mine, false); if (r) awDone[sl] = 1; return r; } });
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
    var st = { cat: "", fest: "", dop: "", year: "", q: "", showNo: false, nRec: 30, nAll: 60 };
    var recOpen = true; try { recOpen = localStorage.getItem("kinou-sel-rec") !== "0"; } catch (e) {}
    function prodOf(x) { var p = proj && proj.projects && proj.projects.filter(function (q) { return q.id === x.project; })[0]; return p && p.prod || ""; }
    function more(list, n, key, redraw) { // « Afficher plus » quand la liste dépasse
      if (list.length > n) return el("button", { type: "button", class: "btn ghost rcmore", text: "Afficher plus (" + (list.length - n) + ")", on: { click: function () { st[key] += 100; redraw(); } } });
      return null;
    }
    if (canWeb) view.appendChild(el("p", { class: "awnote hint" }));
    Promise.all([selRead(), festLoad().catch(function () { return null; }), projRead().catch(function () { return null; })]).then(function () { draw(); awardsSoon(); }, function (e) {
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
      // 2. Récent : confirmé, festival dans les 6 derniers mois (ou à venir).
      // Récent = festival (ou prix) des 4 derniers mois, d'après sa date ; sans date exacte : pas dans « Récent » (sauf ajout à la main récent).
      var lim = new Date(Date.now() - 122 * 864e5).toISOString().slice(0, 10);
      function evd(x) { return x.date || (x.manual && x.at ? x.at.slice(0, 10) : ""); }
      var rec = ok.filter(function (x) { return evd(x) >= lim; }).sort(function (a, b) { return evd(b).localeCompare(evd(a)); });
      // Repliable (mémorisé dans ce navigateur), 30 lignes puis « Afficher plus ».
      var s2 = el("section", {}, [el("h2", {}, [el("button", { type: "button", class: "selfold" + (recOpen ? " open" : ""), on: { click: function () {
        recOpen = !recOpen; try { localStorage.setItem("kinou-sel-rec", recOpen ? "1" : "0"); } catch (e) {} draw(); } } }, [(recOpen ? "▾ " : "▸ ") + "Récent · " + rec.length])])]);
      if (recOpen) {
        if (!rec.length) s2.appendChild(el("p", { class: "hint", text: "Rien ces quatre derniers mois." }));
        rec.slice(0, st.nRec).forEach(function (x) { s2.appendChild(line(x)); });
        var m1 = more(rec, st.nRec, "nRec", draw); if (m1) s2.appendChild(m1);
      }
      box.appendChild(s2);
      // 3. Toutes nos sélections : catégories + filtres.
      var s3 = el("section", {}, [el("h2", { text: "Toutes nos sélections · " + ok.length })]);
      var cnt = { "": ok.length, prize: 0, img: 0, sel: 0, nom: 0 };
      ok.forEach(function (x) { var k = kindOf(x); cnt[k]++; if (k === "img") cnt.prize++; });
      s3.appendChild(el("div", { class: "fchips" }, [["", "Tout"], ["prize", "Prix"], ["img", "Prix de l'image"], ["sel", "Sélections"], ["nom", "Nominations"]].map(function (c) {
        return el("button", { type: "button", class: "chip" + (st.cat === c[0] ? " on" : ""), text: c[1] + " · " + cnt[c[0]], on: { click: function () { st.cat = c[0]; draw(); } } });
      })));
      function dd(key, label, vals) {
        var s = el("select", { class: "nodirty" }, [el("option", { value: "", text: label })].concat(vals.map(function (v) { return el("option", { value: v, text: v }); })));
        s.value = st[key]; s.addEventListener("change", function () { st[key] = s.value; draw(); }); return s;
      }
      function uniq(f) { var o = {}; ok.forEach(function (x) { [].concat(f(x)).forEach(function (v) { if (v) o[v] = 1; }); }); return Object.keys(o); }
      var q = el("input", { type: "search", class: "find nodirty", placeholder: "Rechercher un film, un festival, un prix, un chef op, un réalisateur, une production…", value: st.q });
      var list = el("div", {});
      s3.appendChild(el("div", { class: "rcsel" }, [dd("fest", "Tous les festivals", uniq(function (x) { return x.festName; }).sort(function (a, b) { return a.localeCompare(b, "fr"); })),
        dd("dop", "Tous les chefs op", uniq(function (x) { return (x.dops || []).map(rcBase); }).sort(function (a, b) { return a.localeCompare(b, "fr"); })),
        dd("year", "Toutes les années", uniq(function (x) { return x.edition; }).sort().reverse())]));
      s3.appendChild(q); s3.appendChild(list);
      function fillAll() {
        var w = nrm(st.q).split(/\s+/).filter(Boolean); list.textContent = "";
        var l = ok.filter(function (x) {
          var k = kindOf(x);
          if (st.cat && !(st.cat === k || (st.cat === "prize" && k === "img"))) return false;
          if (st.fest && x.festName !== st.fest) return false;
          if (st.dop && (x.dops || []).map(rcBase).indexOf(st.dop) < 0) return false;
          if (st.year && x.edition !== st.year) return false;
          var h = nrm([x.title, x.festName, x.city, x.country, x.section, x.prize, prodOf(x), (x.directors || []).join(" "), (x.dops || []).join(" ")].join(" "));
          return w.every(function (v) { return h.indexOf(v) > -1; });
        }).sort(function (a, b) { return when(b).localeCompare(when(a)) || a.festName.localeCompare(b.festName); });
        if (!l.length) list.appendChild(el("p", { class: "hint", text: ok.length ? "Rien avec ces filtres." : "Aucune sélection confirmée pour l'instant." }));
        l.slice(0, st.nAll).forEach(function (x) { list.appendChild(line(x)); });
        var m2 = more(l, st.nAll, "nAll", fillAll); if (m2) list.appendChild(m2);
      }
      q.addEventListener("input", function () { st.q = q.value; st.nAll = 60; fillAll(); });
      fillAll();
      box.appendChild(s3);
      if (no.length) {
        var s4 = el("section", {}, [el("h2", {}, [el("button", { type: "button", class: "btn ghost", text: (st.showNo ? "Masquer" : "Voir") + " les trouvailles écartées · " + no.length, on: { click: function () { st.showNo = !st.showNo; draw(); } } })])]);
        if (st.showNo) no.forEach(function (x) { s4.appendChild(line(x)); });
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
        el("div", {}, [el("h3", { text: x0.title || "Sans titre" }), el("p", { class: "fwhere", text: [typeOf(x0), (x0.directors || []).length && "réal. " + x0.directors.join(", "), "DoP " + (x0.dops || []).map(rcBase).join(", ")].filter(Boolean).join(" · ") })]),
        el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: "Tout confirmer", on: { click: function (e) { all(e, "ok", "tout confirmé"); } } }),
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
    function line(x) {
      var r = el("div", { class: "selrow ok" + (x.status === "no" ? " no" : "") }, [badge(x),
        el("div", { class: "selwhat" }, [el("strong", { text: (x.title || "Sans titre") }), el("span", { text: festLine(x) + (what(x) ? " — " + what(x) : "") }),
          el("small", { text: [typeOf(x), (x.directors || []).length && "réal. " + x.directors.join(", "), "DoP " + (x.dops || []).map(rcBase).join(", ")].filter(Boolean).join(" · ") })]),
        el("div", { class: "selsrc" }, (x.urls || []).slice(0, 1).map(function (u) { return el("a", { href: u, target: "_blank", rel: "noopener", text: "source ↗" }); })),
        el("div", { class: "fwbtns" }, x.status === "no" ? [el("button", { type: "button", class: "btn ghost", text: "Finalement c'est nous", on: { click: function () { setSt(x, "ok", "confirmé"); } } })]
          : [el("button", { type: "button", class: "btn ghost", text: "Modifier", on: { click: function () { form(x, r); } } })])]);
      return r;
    }
    // Formulaire (ajout à la main ou modification) : film, festival (libre), ville, année, type, prix, section, prix de l'image.
    function form(x0, at) {
      var old = box.querySelector(".seladd"); if (old) old.remove();
      var x = x0 ? JSON.parse(JSON.stringify(x0)) : { kind: "selection", status: "ok", manual: true, edition: String(new Date().getFullYear()) }, chosen = x0 ? { id: x.project } : null;
      var projs = (proj && proj.projects || []).filter(function (p) { return !p.agency && p.title && !p.workTitle; });
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

  // ---------- Sorties fiction (Gus 17/11) ----------
  // Calendrier des sorties de nos longs métrages et séries. Sources, de la plus sûre à la moins sûre :
  //  1. la page fiction du site (data/fiction.json : `overrides[<id>].date`, plateformes, genre) — saisi par l'équipe ;
  //  2. les sorties ajoutées ici à la main et celles trouvées par le robot (dépôt notes, sorties/sorties.json : TMDB, gratuit ;
  //     Claude seulement en dernier recours) = { releases: [{ id, title, project?, slate?, date, kind: cinema | platform | tv,
  //     platform?, country?, source: human | tmdb | claude, url?, by?, at? }], films: { <clé>: { at, found } }, at } ;
  //  3. nos films sans date connue (projets.json : longs, téléfilms, séries) : liste « sans date ».
  var SORT_PATH = "/repos/" + NOTES_REPO + "/contents/sorties/sorties.json", sorties = null, sortSha = null;
  function sortRead() {
    return gh(SORT_PATH, { allow404: true }).then(function (f) {
      if (f) { sortSha = f.sha; sorties = JSON.parse(b64dec(f.content)); } else { sortSha = null; sorties = { releases: [], films: {} }; }
      sorties.releases = sorties.releases || []; return sorties;
    });
  }
  function sortPut(items, msg, remove) {
    return sortRead().then(function () {
      items.forEach(function (x) { sorties.releases = sorties.releases.filter(function (y) { return y.id !== x.id; }); if (!remove) sorties.releases.push(x); });
      return gh(SORT_PATH, { method: "PUT", body: { message: msg + " (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(sorties, null, 2) + "\n"), sha: sortSha || undefined } });
    }).then(function (r) { sortSha = r.content.sha; });
  }
  function sortSave(before, after, label, remove) {
    var b = before && JSON.parse(JSON.stringify(before)), a = JSON.parse(JSON.stringify(after));
    return sortPut([a], "Sorties : " + label, remove).then(function () {
      immPush({ label: label, undo: function () { return b ? sortPut([b], "Sorties : annulé — " + label) : sortPut([a], "Sorties : annulé — " + label, true); },
        redo: function () { return sortPut([a], "Sorties : rétabli — " + label, remove); } });
    });
  }
  // « Les Filles d'Abraham • Bande Annonce » → « Les Filles d'Abraham ».
  function ficTitle(t) {
    return String(t || "").replace(/ /g, " ").split(/\s+[•|]\s*|\s+[-–]\s+(?=(?:bande|trailer|teaser|saison|season|\()|.*bande|.*trailer)/i)[0]
      .replace(/\((?:feature film )?(?:trailer|teaser|bande[- ]annonce)\)/ig, "").replace(/\b(bande[- ]annon?ce|trailer|teaser)\b.*$/i, "").trim();
  }
  var SK = { cinema: "Cinéma", platform: "Plateforme", tv: "Télé" };
  var MOISL = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
  function sortNrm(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function sortIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  // Deux titres du même film (faute de frappe, un mot de différence) : mêmes mots à 60 % au moins, 3 mots au moins.
  function sortSame(a, b) {
    var x = sortNrm(a).split(" ").filter(Boolean), y = sortNrm(b).split(" ").filter(Boolean);
    if (x.join(" ") === y.join(" ")) return true;
    if (x.length < 3 || y.length < 3) return false;
    var n = x.filter(function (w) { return y.indexOf(w) > -1; }).length;
    return n / (x.length + y.length - n) >= 0.6;
  }
  function sortDop(a, b) {
    var y = (b || []).map(function (d) { return sortNrm(rcBase(d)); });
    return (a || []).some(function (d) { return y.indexOf(sortNrm(rcBase(d))) > -1; });
  }
  // Sorties connues (page fiction du site + sorties.json) et films sans date (projets.json) : calendrier et accueil de l'admin.
    // Toutes les sorties connues + films sans date ; infos (réal, chef op, prod) complétées par projets.json et la page fiction.
  function sortBuild(fic, proj, sorties) {
      var nrm = sortNrm, events = [], noDate = [], ficEv = [];
      var byTitle = {}, projs = ((proj && proj.projects) || []).filter(function (p) { return /^(LM|TVF|STV)$/.test(p.type) && !p.agency && p.title && !p.workTitle; });
      projs.forEach(function (p) { byTitle[nrm(p.title)] = p; });
      var seen = {};
      function add(e) { var k = nrm(e.title) + "|" + e.date; if (seen[k]) return; seen[k] = 1; events.push(e); }
      var ov = (fic && fic.overrides) || {};
      ((fic && fic.films) || []).forEach(function (f) {
        var o = ov[f.slate] || {}, t = ficTitle(o.title || f.title), p = byTitle[nrm(t)], sub = String(f.sub || "").split("\n");
        var info = { title: t, slate: f.slate, project: p && p.id, directors: p ? p.directors || [] : sub[0] ? sub[0].split(/,\s*/) : [], dops: f.artists || (p && p.dops) || [],
          prod: (p && p.prod) || sub[1] || "", platforms: o.platforms || [], series: o.genre === "SERIES" || /series/i.test((f.cats || []).join(" ")), img: f.img };
        if (o.date) { var fe = Object.assign({}, info, { date: o.date, kind: (o.platforms || []).length ? "platform" : "cinema", source: "fiction", id: "fic-" + f.slate }); add(fe); ficEv.push(fe); }
        else seen["nd|" + nrm(t)] = info;
        if (p) seen["p|" + p.id] = 1;
      });
      ((sorties && sorties.releases) || []).forEach(function (r) {
        var p = (r.project && projs.filter(function (q) { return q.id === r.project; })[0]) || byTitle[nrm(r.title)];
        // Même film déjà daté par la page fiction sous un titre un peu différent (ex. « Ce qui me mène à toi » dans les projets,
        // « Ce qui nous mène à toi » sur le site, Gus 17/11) : la date de la page fiction l'emporte sur celle du robot.
        var twin = ficEv.filter(function (e) { return sortSame(e.title, r.title) && (r.date === e.date || sortDop(e.dops, p ? p.dops : r.dops)); })[0];
        if (twin && (r.source !== "human" || r.date === twin.date)) { if (p) seen["p|" + p.id] = 1; return; }
        add(Object.assign({ directors: p ? p.directors || [] : [], dops: p ? p.dops || [] : [], prod: p ? p.prod || "" : "", platforms: r.platform ? [r.platform] : [], series: p ? p.type === "STV" : false }, r));
        if (p) seen["p|" + p.id] = 1;
      });
      var dated = {}; events.forEach(function (e) { dated[nrm(e.title)] = 1; });
      function isDated(t) { return dated[nrm(t)] || events.some(function (e) { return sortSame(e.title, t); }); }
      Object.keys(seen).filter(function (k) { return /^nd\|/.test(k); }).forEach(function (k) { if (!isDated(seen[k].title)) noDate.push(seen[k]); });
      projs.forEach(function (p) { if (!seen["p|" + p.id] && !isDated(p.title)) noDate.push({ title: p.title, project: p.id, directors: p.directors || [], dops: p.dops || [], prod: p.prod || "", series: p.type === "STV", start: p.start }); });
      events.sort(function (a, b) { return a.date.localeCompare(b.date); });
      noDate.sort(function (a, b) { return String(b.start || "").localeCompare(String(a.start || "")); });
      return { events: events, noDate: noDate };
  }
  function showSorties() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: "Sorties fiction" }));
    view.appendChild(el("p", { class: "lead", text: "Les sorties de nos longs métrages et séries : cinéma (sortie française d'abord, sinon européenne ou américaine), plateformes, télé. Les dates viennent de la page fiction du site, de l'équipe et du robot." }));
    var box = el("div", {}, [el("p", { class: "hint", text: "Chargement…" })]);
    view.appendChild(box); immInit(function () { build(); draw(); });
    var fic = null, st = { mode: "month", at: today(), q: "", openNoDate: false };
    Promise.all([sortRead(), readFile("data/fiction.json").catch(function () { return null; }), projRead().catch(function () { return null; })]).then(function (r) {
      fic = r[1]; build(); draw();
    }, function (e) { box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "Indisponible : " + e.message })); });
    function nrm(t) { return sortNrm(t); }
    function iso(d) { return sortIso(d); }
    var events = [], noDate = [];
    function build() { var r = sortBuild(fic, proj, sorties); events = r.events; noDate = r.noDate; }
    function hay(e) { return nrm([e.title, (e.directors || []).join(" "), (e.dops || []).join(" "), e.prod, (e.platforms || []).join(" "), e.country, SK[e.kind]].join(" ")); }
    function match(e) { var w = nrm(st.q).split(" ").filter(Boolean); if (!w.length) return true; var h = hay(e); return w.every(function (x) { return h.indexOf(x) > -1; }); }
    function range() {
      var a = new Date(st.at), b;
      if (st.mode === "month") { a = new Date(a.getFullYear(), a.getMonth(), 1); b = new Date(a.getFullYear(), a.getMonth() + 1, 0); }
      else { var d = (a.getDay() + 6) % 7; a = new Date(a.getFullYear(), a.getMonth(), a.getDate() - d); b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6); }
      return [a, b];
    }
    function move(k) {
      var a = new Date(st.at);
      st.at = st.mode === "month" ? new Date(a.getFullYear(), a.getMonth() + k, 1) : new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * k);
      draw();
    }
    // Saut à la sortie précédente / suivante (hors de la période affichée), en tenant compte de la recherche.
    function jump(k) {
      var r = range(), l = events.filter(match);
      var e = k > 0 ? l.filter(function (x) { return x.date > iso(r[1]); })[0] : l.filter(function (x) { return x.date < iso(r[0]); }).pop();
      if (!e) return;
      st.at = dOf(e.date); draw();
    }
    function draw() {
      box.textContent = "";
      var r = range(), l = events.filter(match);
      // Barre : recherche, mois / semaine, flèches, aujourd'hui, saut de sortie en sortie.
      var q = el("input", { type: "search", class: "find nodirty", placeholder: "Rechercher un film, un réalisateur, un chef op, une plateforme, une production…", value: st.q });
      q.addEventListener("input", function () { st.q = q.value; var c = q.selectionStart; draw(); var n = box.querySelector(".find"); n.focus(); n.setSelectionRange(c, c); });
      box.appendChild(q);
      // Recherche : la liste de ce qui correspond, toutes dates, juste sous le champ (au-dessus du calendrier, Gus 16/11).
      if (st.q) {
        var nd = noDate.filter(match), s0 = el("section", { class: "calres" }, [el("h2", { text: "Résultats · " + (l.length + nd.length) })]);
        l.slice().reverse().forEach(function (x) { s0.appendChild(rowOf(x)); });
        nd.forEach(function (x) { s0.appendChild(rowOf(x, true)); });
        if (!l.length && !nd.length) s0.appendChild(el("p", { class: "hint", text: "Rien ne correspond." }));
        box.appendChild(s0);
      }
      var title = st.mode === "month" ? MOISL[r[0].getMonth()] + " " + r[0].getFullYear() : "Semaine du " + r[0].getDate() + " " + MOISL[r[0].getMonth()] + (r[0].getMonth() !== r[1].getMonth() ? " au " + r[1].getDate() + " " + MOISL[r[1].getMonth()] : " au " + r[1].getDate()) + " " + r[1].getFullYear();
      var before = l.filter(function (x) { return x.date < iso(r[0]); }).length, after = l.filter(function (x) { return x.date > iso(r[1]); }).length;
      box.appendChild(el("div", { class: "calbar" }, [
        el("button", { type: "button", class: "btn ghost calj", title: "Sortie précédente", disabled: !before, text: "⇤", on: { click: function () { jump(-1); } } }),
        el("button", { type: "button", class: "btn calm", title: st.mode === "month" ? "Mois précédent" : "Semaine précédente", text: "‹", on: { click: function () { move(-1); } } }),
        el("strong", { class: "caltitle", text: title }),
        el("button", { type: "button", class: "btn calm", title: st.mode === "month" ? "Mois suivant" : "Semaine suivante", text: "›", on: { click: function () { move(1); } } }),
        el("button", { type: "button", class: "btn ghost calj", title: "Sortie suivante", disabled: !after, text: "⇥", on: { click: function () { jump(1); } } }),
        el("button", { type: "button", class: "btn ghost", text: "Aujourd'hui", on: { click: function () { st.at = today(); draw(); } } }),
        el("span", { class: "rcgap" }),
        el("div", { class: "rcmode" }, [["month", "Mois"], ["week", "Semaine"]].map(function (m) { return el("button", { type: "button", class: st.mode === m[0] ? "on" : "", text: m[1], on: { click: function () { st.mode = m[0]; draw(); } } }); })),
        el("button", { type: "button", class: "btn fadd", text: "+ Ajouter une sortie", on: { click: function (e) { form(null, e.target.closest(".calbar")); } } })
      ]));
      // Grille.
      var g = el("div", { class: "cal " + st.mode });
      JOURS.forEach(function (j) { g.appendChild(el("div", { class: "calh", text: j })); });
      var start = new Date(r[0]); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
      var end = new Date(r[1]); end.setDate(end.getDate() + (7 - (end.getDay() + 6) % 7) % 7);
      var td = iso(today());
      for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        var k = iso(d), out = d < r[0] || d > r[1];
        var cell = el("div", { class: "calc" + (out ? " out" : "") + (k === td ? " today" : "") + (d.getDay() === 3 ? " wed" : "") }, [el("span", { class: "cald", text: String(d.getDate()) })]);
        // Jours grisés du mois d'avant / d'après : pas de sortie (sinon un film du 30 septembre apparaît aussi en octobre, Gus 17/11).
        if (!out) l.filter(function (x) { return x.date === k; }).forEach(function (x) {
          var ev = el("button", { type: "button", class: "calev " + (x.kind || "cinema") + (x.series ? " series" : "") }, [el("strong", { text: x.title }),
            el("small", { text: [(x.platforms || []).join(", ") || SK[x.kind || "cinema"], (x.dops || []).map(rcBase).join(", ")].filter(Boolean).join(" · ") })]);
          ev.addEventListener("click", function () { detail(x, ev); });
          cell.appendChild(ev);
        });
        g.appendChild(cell);
      }
      box.appendChild(g);
      box.appendChild(el("p", { class: "hint callegend" }, ["Blanc : cinéma · bleu : plateforme / télé · bord pointillé : série · le mercredi (sorties en salle en France) est souligné. ", before || after ? (before + " sortie" + (before > 1 ? "s" : "") + " avant, " + after + " après cette période" + (st.q ? " (avec la recherche)" : "") + " : ⇤ ⇥ pour y aller.") : ""]));
      // À venir.
      var up = events.filter(function (x) { return x.date >= td; });
      var s1 = el("section", {}, [el("h2", { text: "À venir · " + up.length })]);
      if (!up.length) s1.appendChild(el("p", { class: "hint", text: "Aucune sortie annoncée pour l'instant." }));
      up.forEach(function (x) { s1.appendChild(rowOf(x)); });
      box.appendChild(s1);
      // Sans date connue (repliable).
      var s2 = el("section", {}, [el("h2", {}, [el("button", { type: "button", class: "selfold", on: { click: function () { st.openNoDate = !st.openNoDate; draw(); } } }, [(st.openNoDate ? "▾ " : "▸ ") + "Sans date connue · " + noDate.length])])]);
      if (st.openNoDate) noDate.forEach(function (x) { s2.appendChild(rowOf(x, true)); });
      box.appendChild(s2);
      // Conditions de TMDB (dates trouvées par le robot) : logo + mention, moins visibles que kinou.
      box.appendChild(el("p", { class: "tmdbnote" }, [el("span", { class: "tmdblogo", text: "TMDB" }), "Cet outil utilise TMDB et les API de TMDB, mais n'est ni approuvé, ni certifié, ni soutenu par TMDB. (This product uses the TMDB API but is not endorsed or certified by TMDB.)"]));
    }
    function rowOf(x, nod) {
      var r = el("div", { class: "selrow ok" }, [
        nod ? el("span", { class: "selk", text: "Sans date" }) : el("span", { class: "selk " + (x.kind === "cinema" ? "prize" : "nom"), text: fdate(x.date) }),
        el("div", { class: "selwhat" }, [el("strong", { text: x.title + (x.series ? " (série)" : "") }),
          el("span", { text: nod ? (x.start ? "Tourné en " + x.start.slice(0, 4) : "") : [SK[x.kind || "cinema"], (x.platforms || []).join(", "), x.country].filter(Boolean).join(" · ") }),
          el("small", { text: [(x.directors || []).length && "réal. " + x.directors.join(", "), (x.dops || []).length && "DoP " + x.dops.map(rcBase).join(", "), x.prod].filter(Boolean).join(" · ") })]),
        el("div", { class: "selsrc" }, x.url ? [el("a", { href: x.url, target: "_blank", rel: "noopener", text: /imdb\.com/.test(x.url) ? "IMDb ↗" : "source ↗" })] : []),
        el("div", { class: "fwbtns" }, nod ? [el("button", { type: "button", class: "btn ghost", text: "+ Ajouter une date", on: { click: function () { form({ title: x.title, project: x.project, kind: x.series ? "platform" : "cinema" }, r, true); } } })]
          : [el("button", { type: "button", class: "btn ghost", text: "Voir", on: { click: function () { st.at = dOf(x.date); draw(); var cb = box.querySelector(".calbar"); if (cb) window.scrollTo({ top: cb.getBoundingClientRect().top + window.scrollY - 140, behavior: "smooth" }); } } })])]);
      return r;
    }
    function detail(x, at) {
      var old = box.querySelector(".caldetail"); if (old) { old.remove(); if (old._x === x) return; }
      var srcs = { fiction: "page fiction du site (à changer là-bas)", human: "ajouté par " + (x.by || "l'équipe"), tmdb: "trouvé par le robot (base TMDB, lien IMDb)", claude: "trouvé par le robot (Claude)" };
      var d = el("div", { class: "caldetail fcard" }, [
        el("h3", { text: x.title + (x.series ? " (série)" : "") }),
        el("p", { class: "fwhere", text: [fdate(x.date), SK[x.kind || "cinema"], (x.platforms || []).join(", "), x.country].filter(Boolean).join(" · ") }),
        el("p", { class: "hint", text: [(x.directors || []).length && "Réalisation : " + x.directors.join(", "), (x.dops || []).length && "Image : " + x.dops.map(rcBase).join(", "), x.prod && "Production : " + x.prod].filter(Boolean).join(" · ") }),
        el("p", { class: "hint", text: "Source : " + (srcs[x.source] || x.source || "") }),
        el("div", { class: "fwbtns" }, [x.url ? el("a", { class: "btn", href: x.url, target: "_blank", rel: "noopener", text: /imdb\.com/.test(x.url) ? "IMDb ↗" : "Source ↗" }) : null,
          x.source !== "fiction" ? el("button", { type: "button", class: "btn", text: "Modifier", on: { click: function () { d.remove(); form(x, at.closest(".cal")); } } }) : el("a", { class: "btn", href: "#/fiction", text: "Page fiction" }),
          // Sortie trouvée par le robot : « Confirmer » = vérifiée par l'équipe → gardée pour toujours dans l'archive (plus une donnée TMDB).
          x.source === "tmdb" || x.source === "claude" ? el("button", { type: "button", class: "btn primary", text: "Confirmer", title: "Date vérifiée : gardée pour toujours dans nos archives", on: { click: function (e) {
            var y = JSON.parse(JSON.stringify(x)); ["directors", "dops", "prod", "platforms", "series", "img"].forEach(function (k) { delete y[k]; });
            y.id = "s" + Date.now().toString(36); y.was = x.source; y.source = "human"; y.by = user && user.login || ""; y.at = new Date().toISOString(); delete y.key;
            if (x.platforms && x.platforms[0]) y.platform = x.platforms[0];
            e.target.disabled = true;
            sortSave(null, y, y.title + " : confirmé").then(function () { return sortPut([x], "Sorties : " + x.title + " (robot) remplacé", true); }).then(function () { build(); draw(); });
          } } }) : null,
          el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: function () { d.remove(); } } })])]);
      d._x = x;
      at.closest(".cal").after(d); d.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // Ajout / modification à la main : film (projets + page fiction), date, type, plateforme, pays.
    function form(x0, at, fromNoDate) {
      var old = box.querySelector(".sortadd"); if (old) old.remove();
      var edit = x0 && x0.id && !fromNoDate, x = edit ? JSON.parse(JSON.stringify(x0)) : Object.assign({ kind: "cinema", country: "France" }, x0 || {});
      var titles = {}; events.concat(noDate).forEach(function (e) { titles[e.title] = e; });
      var dl = el("datalist", { id: "sortfilms" }, Object.keys(titles).sort().map(function (t) { return el("option", { value: t }); }));
      function inp(k, ph, type) { var i = el("input", { type: type || "text", class: "nodirty", placeholder: ph, value: x[k] || (k === "platform" && (x.platforms || [])[0]) || "" }); i.addEventListener("input", function () { x[k] = i.value.trim(); }); return el("label", { class: "field" }, [el("span", { class: "label", text: ph }), i]); }
      var ti = inp("title", "Film ou série"); ti.querySelector("input").setAttribute("list", "sortfilms");
      var kinds = el("div", { class: "fchips" });
      ["cinema", "platform", "tv"].forEach(function (k) { kinds.appendChild(el("button", { type: "button", class: "chip" + (x.kind === k ? " on" : ""), "data-k": k, text: SK[k], on: { click: function () { x.kind = k; kinds.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c.dataset.k === k); }); f.classList.add("changed"); } } })); });
      var msg = el("span", { class: "fmsg" });
      var f = el("article", { class: "fcard fedit sortadd" }, [dl, el("div", { class: "fgrid" }, [ti, inp("date", "Date de sortie", "date"), inp("platform", "Plateforme / chaîne (facultatif)")]),
        el("div", { class: "field" }, [el("span", { class: "label", text: "Type de sortie" }), kinds]),
        el("div", { class: "fgrid" }, [inp("country", "Pays"), inp("url", "Lien (facultatif)")]),
        el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: edit ? "Enregistrer" : "Ajouter", on: { click: function (e) {
          if (!x.title || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) { msg.textContent = "Il faut le film et la date."; return; }
          var t = titles[x.title]; if (t && t.project) x.project = t.project;
          var y = { id: edit ? x.id : "s" + Date.now().toString(36), title: x.title, project: x.project, date: x.date, kind: x.kind, platform: x.platform || undefined, country: x.country || undefined, url: x.url || undefined, source: "human", by: user && user.login || "", at: new Date().toISOString() };
          if (edit && x0.source !== "human") y.was = x0.source;
          e.target.disabled = true; msg.textContent = "Enregistrement…";
          sortSave(edit ? x0 : null, y, y.title + " : " + fdate(y.date)).then(function () { st.at = dOf(y.date); build(); draw(); }, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
        } } }),
          edit ? el("button", { type: "button", class: "btn ghost", text: "Supprimer", on: { click: function () { sortSave(x0, x0, x0.title + " : supprimé", true).then(function () { build(); draw(); }); } } }) : null,
          el("button", { type: "button", class: "btn ghost", text: "Annuler", on: { click: function () { f.remove(); } } }), msg])]);
      at.after(f); f.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---------- Récupération (Gus 16/11, remplace l'ancien outil k-recup) ----------
  // Suivi des copies de films à récupérer auprès des productions. Données : dépôt privé Kinou-DoP/notes, projets/projets.json
  // (relevé k-recup + captures), un film (ou un groupe) enregistré tout de suite (fichier relu avant, comme les festivals).
  // p.recup = { statut, dernierContact?, relance?, sortiePrevue?, email?, notes? } ; p.recovered = statut « Récupéré ».
  var PROJ_DIR = "/repos/" + NOTES_REPO + "/contents/projets", PROJ_PATH = PROJ_DIR + "/projets.json";
  var RC_ST = ["Pas commencé", "En cours", "Récupéré", "Impossible !"];
  var RC_LBL = { "Pas commencé": "À demander", "En cours": "En cours", "Récupéré": "Récupéré", "Impossible !": "Impossible" };
  var RC_CLS = { "Pas commencé": "todo", "En cours": "wip", "Récupéré": "ok", "Impossible !": "no" };
  // Familles de types (filtre à cases) : la pub comprend films web et corporate, le long métrage les téléfilms (Gus 16/11).
  var RC_CATS = [["pub", "Pub", "web et corporate compris"], ["clip", "Clip"], ["long", "Long métrage", "téléfilms compris"], ["serie", "Série"], ["court", "Court métrage"], ["moyen", "Moyen métrage"], ["doc", "Documentaire"]];
  var RC_CAT = { PUB: "pub", CLIP: "clip", LM: "long", TVF: "long", STV: "serie", CM: "court", MM: "moyen", DOC: "doc" };
  var RC_URG = { relance: "relance prévue", red: "+3 mois", yellow: "+1 mois" };
  var proj = null, projSha = null, rcGender = {};
  var rcState = { q: "", st: "", types: [], dop: "", ag: true, n: 150, tab: "all", mode: "film", sort: "count", urg: "", fic: false };
  // Types : [] = non-fiction (arrivée, et quand tout est décoché) ; "all" = tous ; "nf" = non-fiction (pub + clip) ; sinon familles cochées.
  function rcNF(p) { var c = RC_CAT[p.type]; return c === "pub" || c === "clip"; }
  function rcTypeOk(p) {
    var t = rcState.types.length ? rcState.types : ["nf"];
    return t.indexOf("all") > -1 || (t.indexOf("nf") > -1 && rcNF(p)) || t.indexOf(RC_CAT[p.type]) > -1;
  }
  function projRead() {
    return Promise.all([gh(PROJ_DIR, { allow404: true }), gh(PROJ_PATH, { raw: true, allow404: true })]).then(function (r) {
      if (!r[1]) throw new Error("projets/projets.json introuvable dans Kinou-DoP/notes (ou clé GitHub sans accès)");
      var f = (r[0] || []).filter(function (x) { return x.name === "projets.json"; })[0];
      projSha = f && f.sha; proj = JSON.parse(r[1]); return proj;
    });
  }
  // Enregistre une liste de films modifiés (par id) par-dessus la dernière version du fichier ; réessaie si quelqu'un a écrit entre-temps.
  function projSave(changed, msg, tries) {
    tries = tries || 0;
    return projRead().then(function () {
      var by = {}; changed.forEach(function (p) { by[p.id] = p; });
      proj.projects = proj.projects.map(function (p) { return by[p.id] || p; });
      return gh(PROJ_PATH, { method: "PUT", body: { message: msg + " (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(proj, null, 2) + "\n"), sha: projSha } });
    }).then(function (r) { projSha = r.content.sha; }, function (e) {
      if (tries < 2 && /GitHub (409|422)/.test(e.message)) return projSave(changed, msg, tries + 1);
      throw e;
    });
  }
  function rcSaveLog(before, after, label) {
    var b = JSON.parse(JSON.stringify(before)), a = JSON.parse(JSON.stringify(after));
    return projSave(a, "Récupération : " + label).then(function () {
      immPush({ label: label, undo: function () { return projSave(b, "Récupération : annulé — " + label); }, redo: function () { return projSave(a, "Récupération : rétabli — " + label); } });
    });
  }
  function rcNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function rcBase(d) { return d.replace(/,? (AFC|SCU|SBC|SASC|FSC|ASK)\b.*$/, ""); }
  function rcSt(p) { return (p.recup && p.recup.statut) || (p.recovered ? "Récupéré" : "Pas commencé"); }
  function rcDop(p) { return (p.dops || []).map(rcBase).join(", "); }
  function rcType(p) {
    var c = RC_CAT[p.type];
    if (c === "pub") return p.genre === "web" ? "Pub · web" : p.genre === "corporate" ? "Pub · corporate" : "Pub";
    if (p.type === "TVF") return "Long · téléfilm";
    return (RC_CATS.filter(function (x) { return x[0] === c; })[0] || [0, p.type])[1];
  }
  function rcGen(name) { return rcGender[rcNorm(rcBase(name)).replace(/[^a-z]/g, "")] || ""; }
  // Urgence (comme k-recup) : relance programmée échue ; rouge = +90 j sans contact (ou jamais) ou sortie dans moins de 30 j ; jaune = 30–90 j.
  function rcUrg(p) {
    var s = rcSt(p), r = p.recup || {};
    if (s === "Récupéré" || s === "Impossible !") return "";
    if (r.relance && days(r.relance) <= 0) return "relance";
    var so = days(r.sortiePrevue);
    if (s === "Pas commencé") return so !== null && so >= 0 && so < 30 ? "red" : "";
    var c = days(r.dernierContact);
    if (c === null || -c > 90 || (so !== null && so >= 0 && so < 30)) return "red";
    if (-c > 30) return "yellow";
    return "";
  }
  // Mail (textes de k-recup) ; FR : « notre chef opérateur / notre cheffe opératrice … » selon le genre de la fiche (Gus 16/11).
  function rcMail(list, lang, relance) {
    var prod = list[0].prod || "", dops = [], films = list.map(function (p) {
      var d = rcDop(p); (p.dops || []).forEach(function (x) { x = rcBase(x); if (dops.indexOf(x) < 0) dops.push(x); });
      return "• " + (p.title || "Sans titre") + (p.directors && p.directors.length ? (lang === "fr" ? ", réalisé par " : ", directed by ") + p.directors.join(", ") : "") + (lang === "fr" ? ", DoP : " : ", DoP: ") + d;
    }).join("\n");
    var one = list.length === 1, p0 = list[0], fr = lang === "fr";
    var g = dops.map(rcGen), allF = g.every(function (x) { return x === "f"; });
    function names(and) { return dops.length > 1 ? dops.slice(0, -1).join(", ") + and + dops[dops.length - 1] : dops[0]; }
    var who = fr ? (dops.length === 1 ? (g[0] === "f" ? "notre cheffe opératrice " : g[0] === "x" ? "" : "notre chef opérateur ") + dops[0]
        : dops.length <= 3 ? names(" et ") : allF ? "nos cheffes opératrices" : "nos chefs opérateurs")
      : (dops.length === 1 ? "our cinematographer " + dops[0] : dops.length <= 3 ? names(" and ") : "our cinematographers");
    var plural = dops.length > 1, rp = p0.directors && p0.directors.length ? (fr ? ", réalisé par " : ", directed by ") + p0.directors.join(", ") + "," : "";
    var t0 = (p0.title || "Sans titre") + rp;
    var subject = one ? (p0.title || "Sans titre") + " | " + ((p0.directors || [])[0] || (fr ? "[Réal]" : "[Dir]")) + " | " + rcDop(p0) : (fr ? "Récupération de films | Kinou" : "Film recovery request | Kinou");
    var body;
    if (fr) body = (one ? "Hello [prénom],\n\n" : "Hello l'équipe " + prod + ",\n\n") + (one
      ? (relance ? "Je me permets de vous relancer concernant le film " + t0 + " sur lequel " + who + " " + (plural ? "ont" : "a") + " travaillé.\nEst-ce que ce serait possible de nous envoyer un lien pour le télécharger ?"
        : "Est-ce que ce serait possible de m'envoyer le film " + t0 + " sur lequel " + who + " " + (plural ? "ont" : "a") + " travaillé ?")
      : (relance ? "Je me permets de vous relancer concernant certains films sur lesquels " + who + " " + (plural ? "ont" : "a") + " travaillé.\nEst-ce que ce serait possible de nous envoyer des liens pour télécharger les films suivants :"
        : "Je cherche à récupérer certains films sur lesquels " + who + " " + (plural ? "ont" : "a") + " travaillé. Ce serait super si vous pouviez m'envoyer le master de ces films :") + "\n\n" + films)
      + "\n\nMerci d'avance pour votre aide !\nBelle journée,";
    else body = (one ? "Hello [first name],\n\n" : "Hi " + prod + " team,\n\n") + (one
      ? (relance ? "I'm following up regarding the film " + t0 + " that " + who + " worked on.\nWould it be possible to send us a link to download it?"
        : "Would it be possible to send me the film " + t0 + " that " + who + " worked on?")
      : (relance ? "I'm following up regarding some films that " + who + " " + (plural ? "have" : "has") + " worked on. Have you had a chance to gather the master files for these:"
        : "I'm looking to recover some films that " + who + " " + (plural ? "have" : "has") + " worked on. It would be great if you could send us the master files for these films:") + "\n\n" + films)
      + "\n\nThank you in advance for your help!\nHave a great day,";
    return { subject: subject, body: body, to: list.map(function (p) { return p.recup && p.recup.email; }).filter(Boolean)[0] || "" };
  }

  function showRecup() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: "Récupération" }));
    view.appendChild(el("p", { class: "lead", text: "Les copies des films de nos chefs op à récupérer auprès des productions : où on en est, qui relancer, et les mails tout prêts. Chaque changement est enregistré tout de suite." }));
    var box = el("div", {}, [el("p", { class: "hint", text: "Chargement…" })]);
    view.appendChild(box); immInit(function () { draw(); });
    Promise.all([projRead(), readFile("data/dps/index.json").catch(function () { return null; })]).then(function (r) {
      rcGender = {}; ((r[1] && r[1].dps) || []).forEach(function (d) { if (d.gender) rcGender[rcNorm(rcBase(d.name)).replace(/[^a-z]/g, "")] = d.gender; });
      draw();
    }, function (e) { box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "Indisponible : " + e.message })); });
    var out, count;
    function draw() {
      box.textContent = "";
      var all = proj.projects.filter(function (p) { return (rcState.ag || !p.agency) && (rcState.fic || rcNF(p)); }), cnt = {};
      RC_ST.forEach(function (s) { cnt[s] = 0; }); all.forEach(function (p) { cnt[rcSt(p)]++; });
      var pct = all.length ? Math.round(cnt["Récupéré"] / all.length * 100) : 0;
      var stats = el("section", { class: "rcstats" }, RC_ST.map(function (s) {
        return el("button", { type: "button", class: "rcstat " + RC_CLS[s] + (rcState.tab === "all" && rcState.st === s ? " on" : ""), on: { click: function () { rcState.tab = "all"; rcState.st = rcState.st === s ? "" : s; rcState.n = 150; draw(); } } },
          [el("strong", { text: String(cnt[s]) }), el("span", { text: RC_LBL[s] })]);
      }));
      stats.appendChild(el("div", { class: "rcbar" }, [el("i", { style: "width:" + pct + "%" }), el("span", { text: pct + " % récupérés" + (rcState.fic ? "" : " · non-fiction (pub, clips)") })]));
      box.appendChild(stats);
      var fic = el("label", { class: "rcfic" }, [el("input", { type: "checkbox", class: "nodirty" }), "Compter aussi la fiction"]);
      fic.firstChild.checked = rcState.fic; fic.firstChild.addEventListener("change", function () { rcState.fic = fic.firstChild.checked; draw(); });
      box.appendChild(fic);
      // Onglets : tous les films (arrivée) | à relancer.
      var nTodo = all.filter(function (p) { return rcUrg(p); }).length;
      box.appendChild(el("div", { class: "rctabs" }, [["all", "Tous les films"], ["todo", "À relancer · " + nTodo]].map(function (t) {
        return el("button", { type: "button", class: rcState.tab === t[0] ? "on" : "", text: t[1], on: { click: function () { rcState.tab = t[0]; rcState.n = 150; draw(); } } });
      })));
      box.appendChild(controls());
      count = el("p", { class: "hint rccount" }); out = el("div", { class: "rclist" });
      box.appendChild(count); box.appendChild(out);
      fill();
    }
    function controls() {
      var c = el("div", { class: "rcctl" });
      var q = el("input", { type: "search", class: "find nodirty", placeholder: "Rechercher un film, une production, un réalisateur, un chef op…", value: rcState.q });
      var tId = 0; q.addEventListener("input", function () { clearTimeout(tId); tId = setTimeout(function () { rcState.q = q.value; rcState.n = 150; fill(); }, 200); });
      c.appendChild(q);
      var chips = el("div", { class: "fchips" });
      if (rcState.tab === "all") [["", "Tous"]].concat(RC_ST.map(function (s) { return [s, RC_LBL[s]]; })).forEach(function (x) {
        chips.appendChild(el("button", { type: "button", class: "chip" + (rcState.st === x[0] ? " on" : ""), text: x[1], on: { click: function () { rcState.st = x[0]; rcState.n = 150; draw(); } } }));
      });
      else [["", "Tous"], ["red", "+3 mois sans réponse"], ["yellow", "+1 mois"], ["relance", "Relances prévues"]].forEach(function (x) {
        chips.appendChild(el("button", { type: "button", class: "chip" + (x[0] ? " u-" + x[0] : "") + (rcState.urg === x[0] ? " on" : ""), text: x[1], on: { click: function () { rcState.urg = x[0]; rcState.n = 150; draw(); } } }));
      });
      c.appendChild(chips);
      // Types : liste déroulante à cases (plusieurs à la fois).
      var dd = el("details", { class: "rcdd" }), sum = el("summary", { class: "nodirty" });
      var OPTS = [["all", "Tous les types"], ["nf", "Non-fiction", "pub + clip"]].concat(RC_CATS);
      function cur() { return rcState.types.length ? rcState.types : ["nf"]; }
      function sumTxt() { sum.textContent = OPTS.filter(function (x) { return cur().indexOf(x[0]) > -1; }).map(function (x) { return x[1]; }).join(", "); }
      sumTxt(); dd.appendChild(sum);
      var pane = el("div", { class: "rcddpane" });
      function sync() { pane.querySelectorAll("input").forEach(function (i) { i.checked = cur().indexOf(i.value) > -1; }); sumTxt(); rcState.n = 150; fill(); }
      OPTS.forEach(function (x, k) {
        var cb = el("input", { type: "checkbox", class: "nodirty", value: x[0] });
        cb.addEventListener("change", function () {
          var t = cur().filter(function (v) { return v !== x[0] && v !== "all"; });
          if (x[0] === "all") t = cb.checked ? ["all"] : [];
          else if (cb.checked) t.push(x[0]);
          rcState.types = t; sync();
        });
        pane.appendChild(el("label", { class: k === 1 ? "sep" : "" }, [cb, x[1], x[2] ? el("small", { text: x[2] }) : null]));
      });
      pane.appendChild(el("button", { type: "button", class: "btn ghost", text: "Revenir à non-fiction", on: { click: function () { rcState.types = []; sync(); } } }));
      setTimeout(sync, 0);
      dd.appendChild(pane);
      document.addEventListener("click", function (e) { if (dd.open && !dd.contains(e.target)) dd.open = false; });
      var dset = {}; proj.projects.forEach(function (p) { (p.dops || []).forEach(function (d) { dset[rcBase(d)] = 1; }); });
      var dp = el("select", { class: "nodirty" }, [el("option", { value: "", text: "Tous les chefs op" })].concat(Object.keys(dset).sort(function (a, b) { return a.localeCompare(b, "fr"); }).map(function (d) { return el("option", { value: d, text: d }); })));
      dp.value = rcState.dop; dp.addEventListener("change", function () { rcState.dop = dp.value; rcState.n = 150; fill(); });
      var ag = el("label", { class: "rcag" }, [el("input", { type: "checkbox", class: "nodirty" }), "Films d'autres agences"]);
      ag.firstChild.checked = rcState.ag; ag.firstChild.addEventListener("change", function () { rcState.ag = ag.firstChild.checked; rcState.n = 150; draw(); });
      // Par film / par production (+ ordre des productions).
      var mode = el("div", { class: "rcmode" }, [["film", "Par film"], ["prod", "Par production"]].map(function (m) {
        return el("button", { type: "button", class: rcState.mode === m[0] ? "on" : "", text: m[1], on: { click: function () { rcState.mode = m[0]; rcState.n = 150; draw(); } } });
      }));
      var sort = el("select", { class: "nodirty" }, [el("option", { value: "count", text: "Plus de films d'abord" }), el("option", { value: "recent", text: "Tournage le plus récent d'abord" })]);
      sort.value = rcState.sort; sort.hidden = rcState.mode !== "prod"; sort.addEventListener("change", function () { rcState.sort = sort.value; fill(); });
      c.appendChild(el("div", { class: "rcsel" }, [dd, dp, ag, el("span", { class: "rcgap" }), mode, sort]));
      return c;
    }
    function filtered() {
      var w = rcNorm(rcState.q).split(/\s+/).filter(Boolean);
      return proj.projects.filter(function (p) {
        if (p.agency && !rcState.ag) return false;
        if (rcState.tab === "todo") { var u = rcUrg(p); if (!u || (rcState.urg && u !== rcState.urg)) return false; }
        else if (rcState.st && rcSt(p) !== rcState.st) return false;
        if (!rcTypeOk(p)) return false;
        if (rcState.dop && rcDop(p).split(", ").indexOf(rcState.dop) < 0) return false;
        var h = rcNorm([p.title, (p.aka || []).join(" "), p.prod, (p.directors || []).join(" "), (p.dops || []).join(" ")].join(" "));
        return w.every(function (x) { return h.indexOf(x) > -1; });
      }).sort(function (a, b) { return String(b.start || "0").localeCompare(String(a.start || "0")); });
    }
    function more(left) {
      if (left > 0) out.appendChild(el("button", { type: "button", class: "btn ghost rcmore", text: "Afficher plus (" + left + ")", on: { click: function () { rcState.n += 300; fill(); } } }));
    }
    function fill() {
      var l = filtered(); out.textContent = "";
      if (rcState.mode === "film") {
        count.textContent = l.length + " film" + (l.length > 1 ? "s" : "");
        l.slice(0, rcState.n).forEach(function (p) { out.appendChild(row(p)); });
        return more(l.length - rcState.n);
      }
      var groups = {}, keys = [];
      l.forEach(function (p) { var k = rcNorm(p.prod || "").replace(/[^a-z0-9]/g, ""); if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(p); });
      var last = function (g) { return g.map(function (p) { return p.start || ""; }).sort().pop() || ""; };
      keys.sort(rcState.sort === "recent" ? function (a, b) { return (b !== "") - (a !== "") || last(groups[b]).localeCompare(last(groups[a])); } : function (a, b) { return (b !== "") - (a !== "") || groups[b].length - groups[a].length || last(groups[b]).localeCompare(last(groups[a])); }); // production inconnue à la fin
      count.textContent = keys.length + " production" + (keys.length > 1 ? "s" : "") + " · " + l.length + " film" + (l.length > 1 ? "s" : "");
      var shown = 0, done = 0; // productions affichées jusqu'à ~150 films, puis « Afficher plus »
      keys.forEach(function (k) { if (shown >= rcState.n) return; shown += groups[k].length; done++; out.appendChild(group(groups[k])); });
      more(l.length - shown);
    }
    function urgTag(u) { return u ? el("span", { class: "rcurg u-" + u, text: RC_URG[u] }) : null; }
    function worst(l) { var u = l.map(rcUrg); return u.indexOf("relance") > -1 ? "relance" : u.indexOf("red") > -1 ? "red" : u.indexOf("yellow") > -1 ? "yellow" : ""; }
    function group(l) {
      var u = worst(l), c = {}; l.forEach(function (p) { var s = rcSt(p); c[s] = (c[s] || 0) + 1; });
      var lastC = l.map(function (p) { return p.recup && p.recup.dernierContact; }).filter(Boolean).sort().pop();
      var films = el("div", { class: "rcgfilms-list" }); films.hidden = true;
      var head = el("div", { class: "rcgtxt" }, [
        el("strong", {}, [l[0].prod || "Production inconnue", urgTag(u)]),
        el("span", { text: l.length + " film" + (l.length > 1 ? "s" : "") + " · " + RC_ST.filter(function (s) { return c[s]; }).map(function (s) { return c[s] + " " + RC_LBL[s].toLowerCase(); }).join(", ") + (lastC ? " · dernier contact le " + fdate(lastC) : "") }),
        el("span", { class: "rcgfilms", text: l.map(function (p) { return (p.title || "Sans titre") + " (" + rcDop(p) + ")"; }).join(" · ") })]);
      var todo = l[0].prod ? l.filter(function (p) { var s = rcSt(p); return s === "Pas commencé" || s === "En cours"; }) : []; // sans production : pas de mail groupé
      var g = el("div", { class: "rcgrp" + (u ? " " + u : "") }, [head, el("div", { class: "rcgbtn" }, todo.length ? [
        el("button", { type: "button", class: "btn", text: "Mail FR", on: { click: function () { mail(g, todo, "fr"); } } }),
        el("button", { type: "button", class: "btn", text: "Mail EN", on: { click: function () { mail(g, todo, "en"); } } })] : [])]);
      head.addEventListener("click", function () {
        films.hidden = !films.hidden; g.classList.toggle("open", !films.hidden);
        if (!films.hidden && !films.firstChild) l.forEach(function (p) { films.appendChild(row(p)); });
      });
      return el("div", { class: "rcgwrap" }, [g, films]);
    }
    // Mail prêt à copier (ou à ouvrir dans la messagerie). Plusieurs films : liste à cocher en haut (tous cochés), le texte suit.
    // Première demande ou relance : au choix (relance d'office si tous les films cochés sont déjà « En cours »).
    // « Envoyé » = films cochés en « En cours » + dernier contact aujourd'hui (+ e-mail si rempli).
    function mail(after, l, lang) {
      var old = after.nextElementSibling; if (old && old.classList.contains("rcmail")) { old.remove(); if (old.dataset.lang === lang) return; }
      var sel = l.slice(), kind = null;
      var subj = el("input", { type: "text", class: "nodirty" }), body = el("textarea", { class: "nodirty" });
      var to = el("input", { type: "email", class: "nodirty", placeholder: "adresse de la production (facultatif, gardée pour la prochaine fois)", value: rcMail(l, lang, false).to });
      var msg = el("span", { class: "fmsg" }), sent;
      var kinds = el("div", { class: "rcmode" });
      function relance() { return kind !== null ? kind : sel.length > 0 && sel.every(function (p) { return rcSt(p) === "En cours"; }); }
      function gen() {
        kinds.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", (b.dataset.k === "r") === relance()); });
        if (!sel.length) { subj.value = ""; body.value = ""; sent.disabled = true; return; }
        var m = rcMail(sel, lang, relance()); subj.value = m.subject; body.value = m.body; body.rows = Math.min(20, m.body.split("\n").length + 1); sent.disabled = false;
        sent.textContent = "Envoyé" + (l.length > 1 ? " (" + sel.length + " film" + (sel.length > 1 ? "s" : "") + ")" : "");
      }
      [["d", "Première demande"], ["r", "Relance"]].forEach(function (k) { kinds.appendChild(el("button", { type: "button", "data-k": k[0], text: k[1], on: { click: function () { kind = k[0] === "r"; gen(); } } })); });
      var pick = null;
      if (l.length > 1) {
        pick = el("div", { class: "rcpick" });
        l.forEach(function (p) {
          var cb = el("input", { type: "checkbox", class: "nodirty" }); cb.checked = true;
          cb.addEventListener("change", function () { sel = l.filter(function (q, i) { return pick.querySelectorAll("input")[i].checked; }); gen(); });
          pick.appendChild(el("label", {}, [cb, el("span", { class: "rcst " + RC_CLS[rcSt(p)], text: RC_LBL[rcSt(p)] }), el("strong", { text: p.title || "Sans titre" }), el("small", { text: [(p.directors || []).join(", "), rcDop(p), p.start ? fdate(p.start).replace(/^\d+ /, "") : ""].filter(Boolean).join(" · ") })]));
        });
      }
      sent = el("button", { type: "button", class: "btn primary", title: "Statut « En cours » et dernier contact aujourd'hui pour les films cochés", on: { click: function (e) {
        var t = new Date(), iso = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
        var ch = sel.map(function (p) { var q = JSON.parse(JSON.stringify(p)), r = q.recup = q.recup || {}; r.statut = rcSt(p) === "Récupéré" ? "Récupéré" : "En cours"; r.dernierContact = iso; delete r.relance; if (to.value.trim()) r.email = to.value.trim(); return q; });
        e.target.disabled = true; msg.textContent = "Enregistrement…";
        rcSaveLog(sel, ch, "relance " + (sel[0].prod || sel[0].title || "")).then(draw, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
      } } });
      var box2 = el("div", { class: "rcmail", "data-lang": lang }, [
        pick ? el("div", { class: "field" }, [el("span", { class: "label", text: "Films dans le mail" }), pick]) : null,
        el("div", { class: "field" }, [el("span", { class: "label", text: "Message" }), kinds]),
        el("label", { class: "field" }, [el("span", { class: "label", text: "À" }), to]),
        el("label", { class: "field" }, [el("span", { class: "label", text: "Objet" }), subj]),
        el("label", { class: "field" }, [el("span", { class: "label", text: "Texte" }), body]),
        el("div", { class: "fwbtns" }, [
          el("button", { type: "button", class: "btn", text: "Copier", on: { click: function () {
            (navigator.clipboard ? navigator.clipboard.writeText(subj.value + "\n\n" + body.value) : Promise.reject()).then(function () { msg.textContent = "Copié."; }, function () { body.select(); msg.textContent = "Sélectionné : ⌘C pour copier."; });
          } } }),
          el("a", { class: "btn", target: "_blank", rel: "noopener", text: "Ouvrir dans la messagerie ↗", on: { click: function (e) { e.currentTarget.href = "mailto:" + encodeURIComponent(to.value.trim()) + "?subject=" + encodeURIComponent(subj.value) + "&body=" + encodeURIComponent(body.value); } } }),
          sent, msg]),
        el("p", { class: "hint", text: "L'admin n'envoie rien : copiez le mail ou ouvrez-le dans votre messagerie. « Envoyé » note ensuite les films cochés en « En cours » avec la date d'aujourd'hui (relance dans 1 mois, puis 3 mois). L'adresse n'est pas obligatoire." })
      ]);
      gen();
      after.after(box2);
    }
    function row(p) {
      var s = rcSt(p), u = rcUrg(p), r = p.recup || {};
      var d = el("div", { class: "rcrow" + (u ? " u-" + u : ""), "data-id": p.id }, [
        el("span", { class: "rcst " + RC_CLS[s], text: RC_LBL[s] }),
        el("div", { class: "rctitle" }, [el("strong", { text: p.title || "Sans titre" }), el("span", { text: [rcType(p), p.prod, (p.directors || []).join(", ")].filter(Boolean).join(" · ") })]),
        el("span", { class: "rcdop", text: rcDop(p) }),
        el("span", { class: "rcwhen", text: p.start ? fdate(p.start).replace(/^\d+ /, "") : r.annee || "" }),
        el("span", { class: "rclast" }, [urgTag(u), r.dernierContact ? "contact " + fdate(r.dernierContact) : r.relance ? "relance " + fdate(r.relance) : s === "En cours" ? "jamais relancé" : ""])
      ]);
      d.addEventListener("click", function () { open(d, p); });
      return d;
    }
    function open(d, p) {
      var nx = d.nextElementSibling; if (nx && nx.classList.contains("rcedit")) { nx.remove(); return; }
      document.querySelectorAll(".rcedit").forEach(function (x) { x.remove(); });
      var q = JSON.parse(JSON.stringify(p)), r = q.recup = q.recup || {}; r.statut = rcSt(p);
      var st = el("div", { class: "fchips" });
      RC_ST.forEach(function (s) { st.appendChild(el("button", { type: "button", class: "chip" + (r.statut === s ? " on" : ""), "data-s": s, text: RC_LBL[s], on: { click: function () { r.statut = s; st.parentNode.classList.add("changed"); st.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c.dataset.s === s); }); } } })); });
      function dt(k, lab) { var i = el("input", { type: "date", class: "nodirty", value: r[k] || "" }); i.addEventListener("input", function () { r[k] = i.value; }); return el("label", { class: "field" }, [el("span", { class: "label", text: lab }), i]); }
      var em = el("input", { type: "email", class: "nodirty", value: r.email || "", placeholder: "contact de la production" }); em.addEventListener("input", function () { r.email = em.value.trim(); });
      var no = el("textarea", { class: "nodirty", rows: 2 }); no.value = r.notes || ""; no.addEventListener("input", function () { r.notes = no.value; });
      var msg = el("span", { class: "fmsg" });
      var info = [p.prod && "Production : " + p.prod, (p.directors || []).length && "Réal. : " + p.directors.join(", "), "Chef op : " + (p.dops || []).join(", "),
        p.start && "Tournage : " + fdate(p.start) + (p.end && p.end !== p.start ? " → " + fdate(p.end) : ""), (p.aka || []).length && "Aussi appelé : " + p.aka.join(", "), p.agency && "Géré par une autre agence"].filter(Boolean).join(" · ");
      var box2 = el("div", { class: "rcedit" }, [el("p", { class: "hint", text: info }), st,
        el("div", { class: "fgrid" }, [dt("dernierContact", "Dernier contact"), dt("relance", "Relance programmée"), dt("sortiePrevue", "Sortie prévue")]),
        el("label", { class: "field" }, [el("span", { class: "label", text: "E-mail de la production" }), em]),
        el("label", { class: "field" }, [el("span", { class: "label", text: "Notes" }), no]),
        el("div", { class: "fwbtns" }, [
          el("button", { type: "button", class: "btn primary", text: "Enregistrer", on: { click: function (e) {
            Object.keys(r).forEach(function (k) { if (r[k] === "" || r[k] == null) delete r[k]; });
            if (r.statut === "Récupéré") q.recovered = true; else delete q.recovered;
            e.target.disabled = true; msg.textContent = "Enregistrement…";
            rcSaveLog([p], [q], (q.title || q.id) + " → " + RC_LBL[r.statut]).then(draw, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
          } } }),
          el("button", { type: "button", class: "btn", text: "Mail FR", on: { click: function () { mail(box2, [p], "fr"); } } }),
          el("button", { type: "button", class: "btn", text: "Mail EN", on: { click: function () { mail(box2, [p], "en"); } } }),
          el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: function () { box2.remove(); } } }), msg])
      ]);
      d.after(box2);
    }
  }

  // ---------- Accueil de l'admin (Gus 17/11) : juste pour sourire. Logo « kinou admin » = cette page ; la liste des chefs op est sur #/dops.
  function showHello() {
    bar.hidden = true; editing = false; view.textContent = "";
    var h = el("h1", { class: "hello", "aria-label": "Hello la Dream Team !" }), n = 0;
    ["Hello", "la", "Dream", "Team\u00a0!"].forEach(function (w, k, all) {
      var word = el("span", { class: "hw" });
      w.split("").forEach(function (c) { word.appendChild(el("span", { class: "hl", style: "--i:" + (n++) + ";--r:" + ((n * 37) % 13 - 6) + "deg", text: c })); });
      h.appendChild(word); if (k === 1) h.appendChild(el("br")); else if (k < all.length - 1) h.appendChild(document.createTextNode(" ")); // « Hello la / Dream Team ! »
    });
    h.addEventListener("animationend", function (e) { var l = e.target; if (e.animationName === "hDrop") l.classList.add("in"); else l.classList.remove("boing"); });
    h.addEventListener("click", function (e) { var l = e.target.closest(".hl"); if (!l) return; l.classList.remove("boing"); void l.offsetWidth; l.classList.add("boing"); });
    view.appendChild(el("div", { class: "hellobox" }, [h]));
    helloNews();
  }
  // Petit mot sous « Hello la Dream Team ! » (Gus 17/11) : nos films qui sortent cette semaine (lundi → dimanche ; page fiction
  // du site + sorties fiction) et les prix trouvés aujourd'hui par les robots (Nos sélections). Rien à dire : rien d'affiché.
  function helloNews() {
    var box = el("div", { class: "hellonews" }); view.appendChild(box);
    var t = today(), mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (t.getDay() + 6) % 7), sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    var a = sortIso(mon), b = sortIso(sun), td = sortIso(t);
    function day(d) { return dOf(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); }
    Promise.all([
      sortRead().catch(function () { return null; }),
      readFile("data/fiction.json").catch(function () { return null; }),
      selRead().catch(function () { return null; })
    ]).then(function (r) {
      if (!document.body.contains(box)) return; // page quittée entre-temps
      var lines = [];
      var wk = sortBuild(r[1], null, r[0]).events.filter(function (e) { return e.date >= a && e.date <= b; });
      if (wk.length) lines.push(el("a", { href: "#/sorties", class: "hn" }, [el("span", { class: "hnk", text: wk.length > 1 ? "Sortent cette semaine" : "Sort cette semaine" }),
        wk.map(function (e) { return e.title + " · " + day(e.date) + (e.platforms && e.platforms.length ? " (" + e.platforms.join(", ") + ")" : ""); }).join("  —  ")]));
      var pz = ((r[2] && r[2].found) || []).filter(function (x) { return x.kind === "prize" && x.status !== "no" && x.foundAt && sortIso(new Date(x.foundAt)) === td; });
      if (pz.length) lines.push(el("a", { href: "#/selections", class: "hn" }, [el("span", { class: "hnk", text: pz.length > 1 ? pz.length + " prix trouvés aujourd'hui" : "Prix trouvé aujourd'hui" }),
        pz.slice(0, 4).map(function (x) { return x.title + " : " + (x.prize || "prix") + (x.festName ? ", " + x.festName : "") + ((x.dops || []).length ? " (" + x.dops.map(rcBase).join(", ") + ")" : ""); }).join("  —  ") + (pz.length > 4 ? "  …" : "")]));
      lines.forEach(function (l) { box.appendChild(l); });
    });
  }

  // ---------- Historique des publications ----------
  // Petite fenêtre (lien « historique » du menu) : derniers commits de data/ sur GitHub = qui a publié quoi et quand.
  // Sur une fiche / l'accueil / le contact : l'historique de ce fichier, avec un bouton pour tout voir.
  var histBox = document.getElementById("hist"), histAll = false;
  // Sources de l'historique : [dépôt, chemin]. Les pages festivals, nos sélections, récupération et sorties fiction enregistrent
  // dans le dépôt privé notes (Gus 17/11 : on ne voyait pas leurs changements) ; une fiche : aussi ses notes internes.
  var HIST_NOTES = ["festivals/festivals.json", "festivals/selections.json", "projets/projets.json", "sorties/sorties.json", "dps"];
  function histPath() {
    var h = location.hash;
    if (/^#\/dp\//.test(h)) { var sl = decodeURIComponent(h.slice(5)); return [[REPO, "data/dps/" + sl + ".json"], [NOTES_REPO, "dps/" + sl + ".md"]]; }
    var one = { "#/home": [REPO, "data/home.json"], "#/contact": [REPO, "data/contact.json"], "#/spotlight": [REPO, "data/spotlight.json"],
      "#/fiction": [REPO, "data/fiction.json"], "#/festivals": [NOTES_REPO, "festivals/festivals.json"], "#/selections": [NOTES_REPO, "festivals/selections.json"],
      "#/recup": [NOTES_REPO, "projets/projets.json"], "#/sorties": [NOTES_REPO, "sorties/sorties.json"] }[h];
    return one ? [one] : null;
  }
  function histAllSrc() { return [[REPO, "data"]].concat(HIST_NOTES.map(function (p) { return [NOTES_REPO, p]; })); }
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
    var src = path || histAllSrc();
    Promise.all(src.map(function (x) {
      return gh("/repos/" + x[0] + "/commits?" + (x[0] === REPO ? "sha=" + BRANCH + "&" : "") + "per_page=40&path=" + encodeURIComponent(x[1]))
        .catch(function () { return []; }); // dépôt notes sans accès : on montre le reste
    })).then(function (all) {
      var seen = {}, cs = [];
      all.forEach(function (l) { (l || []).forEach(function (c) { if (!seen[c.sha]) { seen[c.sha] = 1; cs.push(c); } }); });
      cs.sort(function (a, b) { return b.commit.author.date.localeCompare(a.commit.author.date); });
      list.textContent = "";
      // Demandes au robot et réponses, prénoms des clés : pas des publications.
      cs = cs.filter(function (c) { return !/^(Slate : |Équipe : )|demande au robot|réponse du robot/.test(c.commit.message); }).slice(0, 50);
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
  // Menu en rubriques : clic sur « website » / « festivals » = déroule ses sous-rubriques (une seule rubrique ouverte à la fois).
  function sideOpen(g, only) {
    side.querySelectorAll(".sgroup[data-group], .ssub").forEach(function (x) {
      var me = x.dataset.group === g;
      x.classList.toggle("open", me ? (only ? true : !x.classList.contains("open")) : false);
    });
  }
  side.querySelectorAll("button.sgroup").forEach(function (b) { b.addEventListener("click", function () { sideOpen(b.dataset.group); }); });
  function route() {
    var h = location.hash;
    document.getElementById("back").hidden = !token || !/^#\/(dp\/|new)/.test(h);
    var page = /^#\/(home|spotlight|fiction|press|contact|festivals|selections|sorties|recup)$/.test(h) ? h.slice(2) : /^#\/(dops|dp\/.*|new)$/.test(h) ? "cinematographers" : "hello";
    side.hidden = !token;
    if (token && !festTried) { festTried = true; festLoad().then(festBadge, function () {}); } // pastille du menu (dates limites proches)
    side.querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.page === page); });
    var cur = side.querySelector("a.on"), grp = cur && cur.closest(".ssub");
    if (grp) sideOpen(grp.dataset.group, true);
    if (!token) return showLogin();
    // Clé sans droit d'écriture sur le site (Gus 17/11) : rubrique website visible en lecture seule (champs grisés, pas de
    // « Publier », bandeau « Lecture seule »). Les notes internes d'une fiche (dépôt notes) restent modifiables.
    document.body.classList.toggle("webpage", page === "cinematographers" || /^(home|contact|spotlight|fiction|press)$/.test(page));
    if (/^#\/dp\//.test(h)) return showDP(decodeURIComponent(h.slice(5)));
    if (h === "#/new") return showDP(null);
    if (page === "home") return showHome();
    if (page === "contact") return showContact();
    if (page === "spotlight") return showSpot();
    if (page === "fiction") return showFic();
    if (page === "press") return showSoon("Press");
    if (page === "festivals") return showFestivals();
    if (page === "selections") return showFestSel();
    if (page === "sorties") return showSorties();
    if (page === "recup") return showRecup();
    if (page === "hello") return showHello();
    showList();
  }
  // Quitter la fiche (retour, autre page, rechargement) avec des modifications non publiées : on demande confirmation.
  var here = location.hash;
  window.addEventListener("hashchange", function () {
    if (!token) return;
    if (dirty && !window.confirm("Des modifications ne sont pas publiées. Quitter quand même (elles seront perdues) ?")) { history.replaceState(null, "", here || "#/"); return; }
    if (!dirty && formsDirty() && !window.confirm("Un formulaire ouvert n'est pas enregistré. Quitter quand même (les changements seront perdus) ?")) { history.replaceState(null, "", here || "#/"); return; }
    dirty = false; here = location.hash; route();
  });
  window.addEventListener("beforeunload", function (e) { if (dirty || formsDirty()) { e.preventDefault(); e.returnValue = ""; } });

  var saved = store(true);
  if (saved) login(saved).then(route, function () { store(false, null); showLogin("Token expiré ou révoqué : reconnectez-vous."); });
  else showLogin();
})();
