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
  function extrasCtl(get, set, label) {
    var box = el("div", { class: "extras" }), openLay = -1; // réglage de colonnes ouvert (reste ouvert après un choix)
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
          if (x && x.cols && !n.stills) n.cols = x.cols; // mise en page gardée quand on relit le lien
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
      var tag = el("span", { class: "xkind", text: kind(x) });
      if (!x.stills && !x.full && !x.video) tag.title = "Pas d'extrait sur Slate : le film complet est ajouté par le robot GitHub environ 1 min après la publication.";
      if (x.img || (x.stills && x.stills[0])) tag.style.backgroundImage = 'url("' + (x.img || x.stills[0]) + '")';
      return el("div", { class: "xrow" }, [el("div", { class: "xline" }, [tag, input, lbtn || "", up, down, del]), lay || "", st]);
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
        // Snippet absent sur Slate mais présent dans la fiche (Gus 19/11 : la remise en état de Slate après sa panne a effacé des
        // snippets, ex. 68 chez Matias Boucard) : l'ancien extrait est gardé (même film, même id Slate ; le fichier existe toujours).
        var kept = 0, oldV = {};
        (slate && slate.clips || []).forEach(function (c) { if (c.video) oldV[c.slate] = c.video; });
        d.clips.forEach(function (c) { if (!c.video && oldV[c.slate]) { c.video = oldV[c.slate]; kept++; } });
        if (kept) r[3] = Object.assign({}, r[3] || {}, { keptSnips: kept });
        slate = d; state.bundle = d.bundle; dirty = true;
        if (!state.name) state.name = d.name;
        if (known) { state.slug = origSlug = known.slug; listed = true; }
        if (isNew && !state.slug) state.slug = slugify(state.name);
        if (isNew) state.hue = hueOf(state.slug);
        if (isNew && state.open === undefined) { var f = d.clips.filter(function (c) { return c.featured; }).sort(function (a, b) { return a.featuredOrder - b.featuredOrder; })[0]; if (f) state.open = f.slate; }
        render();
        status((known ? "Déjà sur le site : la fiche reprend son adresse kinou.fr/" + known.slug + ". " : "") + "Bundle importé : " + d.clips.length + " films, " + d.categories.length + " onglets." + relinkMsg(r[3]) + ((r[3] || {}).keptSnips ? " " + r[3].keptSnips + " snippet" + (r[3].keptSnips > 1 ? "s" : "") + " absent" + (r[3].keptSnips > 1 ? "s" : "") + " sur Slate gardé" + (r[3].keptSnips > 1 ? "s" : "") + " (anciens extraits)." : "") + " Vérifiez puis publiez.", "ok");
      }, function (e) { imp.disabled = false; st.textContent = e.message; });
    });
    var kids = [el("h2", { text: "Bundle Slate" }), el("div", { class: "row" }, [el("div", { class: "grow" }, [input]), imp]), st];
    // Plus de bouton « Mettre à jour le site depuis Slate » (Gus 19/11) : le site ne lit plus Slate en direct, il affiche la copie
    // publiée de la fiche ; pour reprendre un changement fait sur Slate : « Relire le bundle » puis Publier.
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

  // « Compléter les infos des films » (Gus 18/11) : demande au robot du dépôt notes (infos/ask/<adresse>-<horodatage>.json, workflow
  // film-infos.yml : Claude + recherche web, 6 films par recherche) ; réponse relue toutes les 10 s, avancement affiché ; puis
  // « Appliquer » = seuls les champs VIDES des infos sont remplis (ce que l'équipe ou Slate a écrit passe en priorité), marqués
  // « à vérifier » (`info.auto` = champs remplis par le robot, `info.autoSrc` = pages lues ; ignorés par le site), puis Publier.
  var INFO_ASK = "/repos/" + NOTES_REPO + "/contents/infos/ask", INFO_KEYS = ["year", "episodes", "runtime", "ratio", "platforms", "camera", "lenses", "starring"]; // pas de synopsis (Gus 18/11)
  var infoAskCur = null, infoAskTimer = 0;
  function infoAskLoad(slug) {
    return gh(INFO_ASK, { allow404: true }).then(function (l) {
      var f = (l || []).filter(function (x) { return x.name.indexOf(slug + "-") === 0 && /\.json$/.test(x.name); }).sort(function (a, b) { return a.name < b.name ? 1 : -1; })[0];
      if (!f) return null;
      return gh(INFO_ASK + "/" + f.name, {}).then(function (g) { var q = JSON.parse(b64dec(g.content)); q._path = INFO_ASK + "/" + f.name; q._sha = g.sha; return q; });
    });
  }
  function infoRobotCtl() {
    var box = el("div", { class: "inforobot" }), slug = state.slug;
    var btn = el("button", { type: "button", class: "btn", text: "Compléter les infos des films (robot)" }), st = el("span", { class: "hint" });
    box.appendChild(btn); box.appendChild(st);
    // Seulement les films des onglets fiction (Gus 18/11) : Narrative, Documentaries, Short film(s), Feature film(s), Series… (variantes et
    // fautes de frappe comprises) ; pas les pubs ni les clips (sinon des dizaines de recherches dans le vide sur un chef op pub / clip).
    // + onglets 2nd unit / cam op / camera operator / cadreur (Gus 19/11).
    var FIC_TAB = /narr?at|fiction|docu|short|court|feature|featured? ?films?$|long|metrage|s[eé]ri|tele|t[eé]l[eé]film|tv|movie|cinema|2n?d|second|unit|unite|cam ?op|camera ?op|operat|cadr/;
    function ficTab(cat) {
      var c = String(cat || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      return c !== "featured" && FIC_TAB.test(c) && !/commercial|advert|\bpub|\btvc\b|clip|music/.test(c); // « TV commercial », « TVC » : de la pub
    }
    function films() {
      var seen = {}, out = [], ok = {};
      (slate && slate.clips || []).forEach(function (c) { if (ficTab(c.cat)) ok[String(c.slate)] = true; });
      (slate && slate.clips || []).forEach(function (c) {
        var id = String(c.slate || ""); if (!id || seen[id] || !ok[id]) return; seen[id] = true;
        var o = state.overrides[id] || {}; if (o.hidden) return;
        var info = o.info || {}, have = INFO_KEYS.filter(function (k) { return String(info[k] || "").trim(); });
        if (have.length === INFO_KEYS.length) return;
        out.push({ id: id, title: o.title || c.title, sub: o.sub || c.sub || "", cat: c.cat || "", types: o.types || [], have: have });
      });
      return out;
    }
    function show(q) {
      clearTimeout(infoAskTimer); infoAskCur = q; st.textContent = ""; btn.disabled = false;
      var old = box.querySelector(".irapply"); if (old) old.remove();
      if (!q) { st.textContent = "Films des onglets Narrative, Documentaries, Short film, Feature film, Series (pas les pubs ni les clips) : le robot cherche année, épisodes, durée, format, plateformes, caméra, optiques et starring ; seuls les champs vides seront remplis."; return; }
      if (!q.doneAt) {
        btn.disabled = true;
        st.textContent = "Recherche en cours… " + (q.total ? (q.done || 0) + " / " + q.total + " films" : "démarrage (1 à 2 min)") + " — vous pouvez quitter la page, la réponse sera gardée.";
        infoAskTimer = setTimeout(function () { if (state.slug === slug && box.isConnected) infoAskLoad(slug).then(show, function () {}); }, 10000);
        return;
      }
      var n = Object.keys(q.answer || {}).length;
      if (q.error && !n) { st.textContent = "Recherche impossible : " + q.error; return; }
      if (q.appliedAt) { st.textContent = "Dernière recherche appliquée le " + new Date(q.appliedAt).toLocaleDateString("fr-FR") + " (" + n + " films). Les champs remplis par le robot sont marqués « à vérifier »."; return; }
      st.textContent = n ? "Infos trouvées pour " + n + " film" + (n > 1 ? "s" : "") + (q.error ? " (recherche interrompue : " + q.error + ")" : "") + "." : "Le robot n'a rien trouvé de plus.";
      if (!n) return;
      var ap = el("button", { type: "button", class: "btn primary irapply", text: "Appliquer (champs vides seulement)" });
      ap.addEventListener("click", function () {
        var nf = 0, nk = 0;
        Object.keys(q.answer).forEach(function (id) {
          var v = q.answer[id], o = state.overrides[id] || {}, info = Object.assign({}, o.info || {}), added = [];
          INFO_KEYS.forEach(function (k) { if (v[k] && !String(info[k] || "").trim()) { info[k] = String(v[k]).trim(); added.push(k); } });
          if (!added.length) return;
          info.auto = (info.auto || []).concat(added.filter(function (k) { return (info.auto || []).indexOf(k) < 0; }));
          if (v.sources && v.sources.length) info.autoSrc = v.sources.slice(0, 4);
          state.overrides[id] = Object.assign({}, o, { info: info }); nf++; nk += added.length;
        });
        touch();
        q.appliedAt = new Date().toISOString(); q.appliedBy = user && user.login || "";
        var body = Object.assign({}, q); delete body._path; delete body._sha;
        gh(q._path, { method: "PUT", body: { message: "Infos des films : appliquées (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(body, null, 2) + "\n"), sha: q._sha } }).catch(function () {});
        var sec = box.closest("section"); if (sec) sec.replaceWith(filmsSection());
        flash = nk + " info" + (nk > 1 ? "s" : "") + " ajoutée" + (nk > 1 ? "s" : "") + " sur " + nf + " film" + (nf > 1 ? "s" : "") + " (marquées « à vérifier »). Vérifiez puis Publier.";
        status(flash, "ok"); flash = "";
      });
      box.appendChild(ap);
    }
    btn.addEventListener("click", function () {
      var l = films();
      if (!l.length) { st.textContent = "Rien à chercher : pas de film dans les onglets Narrative, Documentaries, Short film, Feature film ou Series, ou ils ont déjà toutes leurs infos."; return; }
      if (!confirm("Lancer la recherche pour " + l.length + " film" + (l.length > 1 ? "s" : "") + " ? (environ " + Math.max(2, Math.ceil(l.length / 6) * 3) + " min, sur l'abonnement Claude)")) return;
      btn.disabled = true; st.textContent = "Envoi de la demande…";
      var stamp = new Date().toISOString().replace(/[:.]/g, "-"), q = { slug: slug, name: state.name || "", films: l, at: new Date().toISOString(), by: user && user.login || "" };
      gh(INFO_ASK + "/" + slug + "-" + stamp + ".json", { method: "PUT", body: { message: "Infos des films : demande (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(q, null, 2) + "\n") } })
        .then(function () { show(Object.assign(q, { _path: INFO_ASK + "/" + slug + "-" + stamp + ".json" })); },
          function (e) { btn.disabled = false; st.textContent = "Demande impossible : " + e.message; });
    });
    st.textContent = "…";
    infoAskLoad(slug).then(show, function (e) { st.textContent = "Robot indisponible : " + e.message; });
    return box;
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
    Promise.all([readFile("data/fiction.json"), sortRead().catch(function () { return null; })]).then(function (r) {
      var s = r[0]; ficSort = r[1];
      fic = s || { reel: "", overrides: {}, films: [] }; fic.overrides = fic.overrides || {};
      ficAutoOut();
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
    ["starring", "Starring (acteurs)", "Noms séparés par des virgules", 0, true], // Gus 18/11 : sur le site, ligne STARRING avant caméra / optiques
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
    function count() { var n = Object.keys(cur()).filter(function (k) { return !/^(awards|auto)/.test(k); }).length; sum.textContent = "Infos du film" + (n ? " · " + n + " renseignée" + (n > 1 ? "s" : "") : ""); }
    INFO_FIELDS.forEach(function (f) {
      if (f[0] === "platforms" && state === fic) return; // fiction : plateformes déjà réglées plus haut (étiquettes)
      var inp = f[3] ? el("textarea", { rows: String(f[3]), placeholder: f[2] }) : el("input", { type: "text", placeholder: f[2] });
      inp.value = cur()[f[0]] || "";
      var lab = el("span", { class: "label", text: f[1] });
      if ((cur().auto || []).indexOf(f[0]) > -1) { inp.classList.add("auto"); lab.appendChild(el("em", { class: "autotag", text: " · robot, à vérifier" })); }
      inp.addEventListener("input", function () {
        var i = Object.assign({}, cur()), v = inp.value.trim();
        if (v) i[f[0]] = v; else delete i[f[0]];
        if (i.auto) { i.auto = i.auto.filter(function (k) { return k !== f[0]; }); if (!i.auto.length) { delete i.auto; delete i.autoSrc; } } // modifié à la main = vérifié
        inp.classList.remove("auto"); var tg = lab.querySelector(".autotag"); if (tg) tg.remove();
        setOverride(c, "info", Object.keys(i).length ? i : undefined); count();
      });
      grid.appendChild(el("label", { class: "ifield" + (f[3] || f[4] ? " wide" : "") }, [lab, inp]));
    });
    if ((cur().auto || []).length) { // infos remplies par le robot : sources + « tout est bon »
      var src = cur().autoSrc || [], ok = el("button", { type: "button", class: "btn ghost", text: "Vérifié, tout est bon" });
      ok.addEventListener("click", function () { var i = Object.assign({}, cur()); delete i.auto; delete i.autoSrc; setOverride(c, "info", i); touch(); box.replaceWith(infoCtl(c)); });
      grid.appendChild(el("div", { class: "ifield wide autobox" }, [el("span", { class: "hint", text: "Champs en orange : trouvés par le robot, à vérifier." + (src.length ? " Sources : " : "") }),
        el("span", {}, src.map(function (u, i) { return el("a", { href: u, target: "_blank", rel: "noopener", text: (i ? " · " : "") + u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] + " ↗" }); })), ok]));
      box.open = true;
    }
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
  // Date de sortie trouvée par les robots (Sorties fiction : TMDB, Claude) ou ajoutée au calendrier, différente de celle de la page
  // fiction, pour un film Coming soon (ou New release à venir) : avertissement sous le film + pastille sur « fiction » (Gus 18/11).
  // La page fiction ne change jamais toute seule : « Utiliser cette date » ou « Garder la nôtre » (`dateSeen` = date vue, pas sur le site).
  var ficSort = null;
  function ficAlerts(f0, so) {
    if (!f0 || !so) return [];
    var ov = f0.overrides || {}, out = [], today = sortIso(new Date());
    (f0.films || []).forEach(function (f) {
      var o = ov[f.slate] || {}, st = o.status || "past";
      if (!(st === "soon" || (st === "new" && o.date && o.date > today))) return;
      var t = ficTitle(f.title), hits = (so.releases || []).filter(function (r) { return r.date && (String(r.slate || "") === String(f.slate) || sortSame(t, r.title)); });
      if (!hits.length) return;
      hits.sort(function (a, b) { return ((a.country || "France") === "France" ? 0 : 1) - ((b.country || "France") === "France" ? 0 : 1) || (a.date < b.date ? -1 : 1); });
      var r = hits[0];
      if (r.date !== o.date && o.dateSeen !== r.date) out.push({ slate: f.slate, title: t, r: r });
    });
    return out;
  }
  function ficBadge() {
    var n = ficAlerts(fic, ficSort).length;
    ['a[data-page="fiction"]', '.sgroup[data-group="website"]'].forEach(function (q) {
      var a = side.querySelector(q); if (!a) return;
      var b = a.querySelector(".nbadge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = el("span", { class: "nbadge" }); a.appendChild(b); }
      b.textContent = n; b.title = "Fiction : date de sortie différente trouvée dans Sorties fiction";
    });
  }
  function ficBadgeLoad() {
    Promise.all([readFile("data/fiction.json"), sortRead()]).then(function (r) { if (!fic) fic = r[0]; ficSort = r[1]; ficBadge(); sortBadge(); }, function () {});
  }
  function ficDateWarn(c) {
    var a = ficAlerts(fic, ficSort).filter(function (x) { return String(x.slate) === String(c.slate); })[0];
    if (!a) return null;
    var r = a.r, o = fic.overrides[c.slate] || {}, src = r.source === "human" ? "ajoutée par " + (r.by || "l'équipe") : r.source === "tmdb" ? "TMDB" : "recherche Claude";
    var use = el("button", { type: "button", class: "btn", text: "Utiliser cette date" }), keep = el("button", { type: "button", class: "btn ghost", text: o.date ? "Garder la nôtre" : "Ignorer" });
    use.addEventListener("click", function () { setOverride(c, "date", r.date); setOverride(c, "dateSeen"); touch(); var y = window.scrollY; ficCapNew(); slate = ficSlate(); renderFic(); window.scrollTo(0, y); ficBadge(); });
    keep.addEventListener("click", function () { setOverride(c, "dateSeen", r.date); touch(); box.remove(); ficBadge(); });
    var box = el("div", { class: "fdwarn" }, [
      el("p", {}, [el("b", { text: "! " }), (o.date ? "Autre date trouvée : " : "Date trouvée : ") + fdate(r.date) + " (" + (SK[r.kind] || r.kind || "") + (r.platform ? " · " + r.platform : "") + (r.country ? ", " + r.country : "") + " ; " + src + ")" + (o.date ? ". Chez nous : " + fdate(o.date) + "." : ".") + " ",
        r.url ? el("a", { href: r.url, target: "_blank", rel: "noopener", text: "Source ↗" }) : ""]),
      el("div", { class: "fdbtns" }, [use, keep])]);
    return box;
  }
  // Coming soon → New release tout seul le jour de la sortie, dès 9 h (heure de Paris) : le site le fait de lui-même (ficStatus
  // dans app.js) ; l'admin l'applique à l'ouverture de la page fiction et l'écrit à la prochaine publication (Gus 18/11).
  function ficOut(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return false;
    var now; try { now = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).format(new Date()); } catch (e) { now = new Date().toISOString().slice(0, 13).replace("T", " "); }
    return now.slice(0, 10) > d || (now.slice(0, 10) === d && +now.slice(11, 13) >= 9);
  }
  function ficAutoOut() {
    state = fic; // setOverride travaille sur state.overrides
    var out = (fic.films || []).filter(function (f) { var o = fic.overrides[f.slate] || {}; return o.status === "soon" && ficOut(o.date); })
      .map(function (f) { setOverride(f, "status", "new"); setOverride(f, "autoPast"); return f.title; });
    if (!out.length) return;
    ficCapNew();
    flash = "Sorti" + (out.length > 1 ? "s" : "") + " : « " + out.join(" », « ") + " » passe" + (out.length > 1 ? "nt" : "") + " en New release (déjà le cas sur le site ; écrit à la prochaine publication)." + (flash ? " " + flash : "");
  }
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
    var warn = null;
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
    date.addEventListener("change", function () {
      setOverride(c, "date", date.value || undefined); touch();
      var w2 = ficDateWarn(c); if (warn) warn.replaceWith(w2 || el("span")); warn = w2; ficBadge(); // avertissement « autre date trouvée » à jour
      if (o().status === "new" && ficCapNew()) { var y = window.scrollY; slate = ficSlate(); renderFic(); window.scrollTo(0, y); }
    });
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
    warn = ficDateWarn(c);
    return el("div", { class: "ficctl" }, [el("div", {}, [el("div", { class: "ficrow" }, [stSel, genre, date]), warn || "", plats]), posterDrop()]);
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
    seeLink.href = SITE_VIEW + "/#fiction"; seeLink.hidden = false; ficBadge();
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
  // Taper des lettres n'importe où sur une page qui a un champ de recherche (récupération, sorties, sélections, festivals, chefs op)
  // = écrire dans la recherche, comme dans la liste des chefs op (Gus 18/11). Pas pendant une saisie, un formulaire ouvert ou un raccourci.
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.defaultPrevented) return;
    var t = document.activeElement;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (view.querySelector(".fedit, .rcedit, .sortadd, .seladd") || document.querySelector(".vedit") || (histBox && !histBox.hidden)) return;
    var f = [].filter.call(view.querySelectorAll("input.find"), function (x) { return x.offsetParent; })[0];
    if (!f) return;
    f.focus({ preventScroll: true }); var n = f.value.length; try { f.setSelectionRange(n, n); } catch (er) {} // la lettre s'écrit à la fin du champ
  });
  // Formulaire ouvert et modifié mais pas enregistré (festival, film de la récupération, mail) : classe .changed → on prévient avant de quitter.
  ["input", "change"].forEach(function (ev) { view.addEventListener(ev, function (e) { var f = e.target.closest && e.target.closest(".fedit, .rcedit"); if (f) f.classList.add("changed"); }); });
  function formsDirty() { return !!view.querySelector(".fedit.changed, .rcedit.changed"); }

  var festTried = false, ficTried = false;
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
  function awardsSoon() { clearTimeout(awT); awT = setTimeout(awardsSync, 1500); }
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
      var w = el("p", { class: "hint seladd", text: "Chargement de la bibliothèque…" }); at.after(w);
      bibLoad().then(function (b) { bib = b; w.remove(); linkForm(xs, at); }, function (e) { w.textContent = "Bibliothèque indisponible : " + e.message; });
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
        if (!l.length) res.appendChild(el("p", { class: "hint", text: "Aucun film de la bibliothèque ne correspond." }));
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
        el("label", { class: "field" }, [el("span", { class: "label", text: "Relier « " + label + " » à un ou plusieurs films de notre bibliothèque" }), q, res]),
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
  // Bandes-annonces trouvées par le robot des sorties (Gus 18/11) : `sorties.trailers`, `seen` = vue par l'équipe (partagé).
  // Pas encore vues = pastille sur « sorties fiction », encadré en haut du calendrier, ligne sur l'accueil de l'admin.
  // Films masqués dans Sorties fiction (Gus 19/11, ex. film où notre chef op n'est que cadreur) : `sorties.hidden` =
  // [{ key (titre normalisé), title, project?, slate?, by, at }] ; ni dans le calendrier, ni bandes-annonces, ni recherche du robot.
  function sortHid(x, so) {
    var k = sortNrm(x.title);
    return ((so || sorties || {}).hidden || []).some(function (h) { return h.key === k || (h.project && x.project === h.project) || (h.slate && (String(x.slate) === String(h.slate) || String(x.ficSlate) === String(h.slate))); });
  }
  function sortHide(x, on) {
    var h = { key: sortNrm(x.title), title: x.title, project: x.project || undefined, slate: x.slate || x.ficSlate || undefined };
    function put(v, label) {
      return sortRead().then(function () {
        sorties.hidden = (sorties.hidden || []).filter(function (y) { return y.key !== h.key; });
        if (v) sorties.hidden.push(Object.assign({}, h, { by: user && user.login || "", at: new Date().toISOString() }));
        return gh(SORT_PATH, { method: "PUT", body: { message: "Sorties : " + label + " (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(sorties, null, 2) + "\n"), sha: sortSha || undefined } });
      }).then(function (r) { sortSha = r.content.sha; sortBadge(); });
    }
    var label = x.title + (on ? " masqué" : " réaffiché");
    return put(on, label).then(function () {
      immPush({ label: label, undo: function () { return put(!on, "annulé — " + label); }, redo: function () { return put(on, "rétabli — " + label); } });
    });
  }
  function trUnseen() { return ((sorties && sorties.trailers) || []).filter(function (t) { return !t.seen && !sortHid(t); }).sort(function (a, b) { return String(b.foundAt).localeCompare(String(a.foundAt)); }); }
  function trSeen(ids) {
    return sortRead().then(function () {
      var by = { by: user && user.login || "", at: new Date().toISOString() };
      (sorties.trailers || []).forEach(function (t) { if (ids.indexOf(t.id) > -1) t.seen = by; });
      return gh(SORT_PATH, { method: "PUT", body: { message: "Sorties : bande-annonce vue (admin, " + (user && user.login || "") + ")", content: b64enc(JSON.stringify(sorties, null, 2) + "\n"), sha: sortSha || undefined } });
    }).then(function (r) { sortSha = r.content.sha; sortBadge(); });
  }
  function sortBadge() {
    var a = side.querySelector('a[data-page="sorties"]'); if (!a) return;
    var n = trUnseen().length, b = a.querySelector(".nbadge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = el("span", { class: "nbadge" }); a.appendChild(b); }
    b.textContent = n; b.title = "Nouvelles bandes-annonces";
  }
  function trLabel(t) { return [t.name, t.kind === "teaser" ? "teaser" : "", t.lang ? t.lang.toUpperCase() : "", t.channel ? "chaîne " + t.channel : "", t.published ? "publiée le " + fdate(t.published) : t.when || "", t.source === "youtube" ? "trouvée sur YouTube, à vérifier" : ""].filter(Boolean).join(" · "); }
  // « Les Filles d'Abraham • Bande Annonce » → « Les Filles d'Abraham ».
  function ficTitle(t) {
    return String(t || "").replace(/ /g, " ").split(/\s+[•|]\s*|\s+[-–]\s+(?=(?:bande|trailer|teaser|saison|season|\()|.*bande|.*trailer)/i)[0]
      .replace(/\((?:feature film )?(?:trailer|teaser|bande[- ]annonce)\)/ig, "").replace(/\b(bande[- ]annon?ce|trailer|teaser)\b.*$/i, "").trim();
  }
  var SK = { cinema: "Cinéma", platform: "Plateforme", tv: "Télé" };
  var MOISC = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
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
      var nrm = sortNrm, events = [], noDate = [], ficEv = [], ficAll = [];
      var byTitle = {}, projs = ((proj && proj.projects) || []).filter(function (p) { return /^(LM|TVF|STV)$/.test(p.type) && p.title && !p.workTitle; }); // autres agences comprises (Gus 18/11)
      projs.forEach(function (p) { byTitle[nrm(p.title)] = p; });
      var seen = {};
      function add(e) { var k = nrm(e.title) + "|" + e.date; if (seen[k]) return; seen[k] = 1; events.push(e); }
      var ov = (fic && fic.overrides) || {};
      ((fic && fic.films) || []).forEach(function (f) {
        var o = ov[f.slate] || {}, t = ficTitle(o.title || f.title), p = byTitle[nrm(t)], sub = String(f.sub || "").split("\n");
        var info = { title: t, slate: f.slate, project: p && p.id, directors: p ? p.directors || [] : sub[0] ? sub[0].split(/,\s*/) : [], dops: f.artists || (p && p.dops) || [],
          prod: (p && p.prod) || sub[1] || "", platforms: o.platforms || [], series: o.genre === "SERIES" || /series/i.test((f.cats || []).join(" ")), img: f.img };
        ficAll.push(info);
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
        // Même film sur la page fiction (sans date là-bas) : lien vers sa vidéo sur le site (Gus 18/11).
        var fm = ficAll.filter(function (e) { return sortSame(e.title, r.title) && (!e.dops.length || sortDop(e.dops, p ? p.dops : r.dops) || sortNrm(e.title) === sortNrm(r.title)); })[0];
        if (fm) r = Object.assign({}, r, { ficSlate: fm.slate });
        add(Object.assign({ directors: p ? p.directors || [] : [], dops: p ? p.dops || [] : [], prod: p ? p.prod || "" : "", platforms: r.platform ? [r.platform] : [], series: p ? p.type === "STV" : false }, r));
        if (p) seen["p|" + p.id] = 1;
      });
      var dated = {}; events.forEach(function (e) { dated[nrm(e.title)] = 1; });
      function isDated(t) { return dated[nrm(t)] || events.some(function (e) { return sortSame(e.title, t); }); }
      Object.keys(seen).filter(function (k) { return /^nd\|/.test(k); }).forEach(function (k) { if (!isDated(seen[k].title)) noDate.push(seen[k]); });
      projs.forEach(function (p) { if (!seen["p|" + p.id] && !isDated(p.title)) noDate.push({ title: p.title, project: p.id, directors: p.directors || [], dops: p.dops || [], prod: p.prod || "", series: p.type === "STV", start: p.start }); });
      events = events.filter(function (e) { return !sortHid(e, sorties); }); noDate = noDate.filter(function (e) { return !sortHid(e, sorties); });
      events.sort(function (a, b) { return a.date.localeCompare(b.date); });
      noDate.sort(function (a, b) { return String(b.start || "").localeCompare(String(a.start || "")); });
      return { events: events, noDate: noDate };
  }
  function showSorties() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("h1", { text: "Sorties fiction" }));
    view.appendChild(el("p", { class: "lead", text: "Les sorties de nos longs métrages et séries : cinéma (sortie française d'abord, sinon européenne ou américaine), plateformes, télé. Les dates viennent de la page fiction du site, de l'équipe et du robot." }));
    var box = el("div", { class: "calbox" }, [el("p", { class: "hint", text: "Chargement…" })]);
    view.appendChild(box); immInit(function () { build(); draw(); });
    var fic = null, st = { mode: "month", at: today(), q: "", openNoDate: false };
    Promise.all([sortRead(), readFile("data/fiction.json").catch(function () { return null; }), projRead().catch(function () { return null; })]).then(function (r) {
      fic = r[1]; build(); draw();
    }, function (e) { box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "Indisponible : " + e.message })); });
    function nrm(t) { return sortNrm(t); }
    function iso(d) { return sortIso(d); }
    var events = [], noDate = [];
    function build() { var r = sortBuild(fic, proj, sorties); events = r.events; noDate = r.noDate; }
    // Film de la page fiction : lien vers le site (pas l'admin), lecteur ouvert sur le film, dans son onglet (Gus 18/11).
    function ficLink(x) {
      var id = x.source === "fiction" ? x.slate : x.ficSlate, o = (fic && fic.overrides && fic.overrides[id]) || {};
      var tab = o.status === "new" ? "featured" : o.status === "soon" ? "coming-soon" : "past-releases";
      return SITE_VIEW + "/fiction/" + tab + "/" + encodeURIComponent(id);
    }
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
      box.textContent = ""; sortBadge();
      var tn = trUnseen();
      if (tn.length) {
        var tb = el("div", { class: "trnew" }, [el("h3", { text: tn.length > 1 ? tn.length + " nouvelles bandes-annonces" : "Nouvelle bande-annonce" })]);
        tn.forEach(function (t) {
          var vu = el("button", { type: "button", class: "btn ghost", text: "Vu" });
          vu.addEventListener("click", function () { vu.disabled = true; trSeen([t.id]).then(draw, function (e) { vu.disabled = false; alert("Pas enregistré : " + e.message); }); });
          tb.appendChild(el("div", { class: "tritem" }, [el("div", {}, [el("b", { text: t.title }), el("span", { class: "hint", text: trLabel(t) })]),
            el("div", { class: "fwbtns" }, [el("a", { class: "btn primary", href: t.url, target: "_blank", rel: "noopener", text: /vimeo/.test(t.url) ? "Voir / télécharger ↗" : "Voir sur YouTube ↗" }), vu])]));
        });
        if (tn.length > 1) { var all = el("button", { type: "button", class: "btn ghost", text: "Tout marquer comme vu" }); all.addEventListener("click", function () { all.disabled = true; trSeen(tn.map(function (t) { return t.id; })).then(draw); }); tb.appendChild(all); }
        box.appendChild(tb);
      }
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
      var title = st.mode === "month" ? MOISL[r[0].getMonth()] + " " + r[0].getFullYear() : (r[0].getMonth() !== r[1].getMonth() ? r[0].getDate() + " " + MOISC[r[0].getMonth()] + " – " + r[1].getDate() + " " + MOISC[r[1].getMonth()] : r[0].getDate() + " – " + r[1].getDate() + " " + MOISC[r[1].getMonth()]) + " " + r[1].getFullYear(); // semaine : court, flèches sur la même ligne (Gus 18/11)
      var before = l.filter(function (x) { return x.date < iso(r[0]); }).length, after = l.filter(function (x) { return x.date > iso(r[1]); }).length;
      box.appendChild(el("div", { class: "calbar" }, [
        el("button", { type: "button", class: "btn ghost calj", title: "Sortie précédente", disabled: !before, text: "⇤", on: { click: function () { jump(-1); } } }),
        el("button", { type: "button", class: "btn calm", title: st.mode === "month" ? "Mois précédent" : "Semaine précédente", text: "‹", on: { click: function () { move(-1); } } }),
        el("strong", { class: "caltitle" }, [title.replace(/ \d{4}$/, ""), el("span", { class: "caly", text: " " + r[1].getFullYear() })]),
        el("button", { type: "button", class: "btn calm", title: st.mode === "month" ? "Mois suivant" : "Semaine suivante", text: "›", on: { click: function () { move(1); } } }),
        el("button", { type: "button", class: "btn ghost calj", title: "Sortie suivante", disabled: !after, text: "⇥", on: { click: function () { jump(1); } } }),
        el("button", { type: "button", class: "btn ghost caltoday", text: "Aujourd'hui", on: { click: function () { st.at = today(); draw(); } } }),
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
      // Téléphone : balayer le calendrier vers la gauche / la droite = période suivante / précédente (Gus 18/11).
      // Le calendrier suit le doigt, puis glisse hors de l'écran et le suivant arrive du côté opposé (Gus 18/11).
      var tx = null, horiz = null;
      g.addEventListener("touchstart", function (e) { var t = e.touches[0]; tx = e.touches.length === 1 ? [t.clientX, t.clientY] : null; horiz = null; g.style.transition = "none"; }, { passive: true });
      g.addEventListener("touchmove", function (e) {
        if (!tx) return; var t = e.touches[0], dx = t.clientX - tx[0], dy = t.clientY - tx[1];
        if (horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horiz = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (horiz) { g.style.transform = "translateX(" + dx + "px)"; g.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / 600)); }
      }, { passive: true });
      g.addEventListener("touchend", function (e) {
        if (!tx) return; var t = e.changedTouches[0], dx = t.clientX - tx[0], dy = t.clientY - tx[1]; tx = null;
        g.style.transition = "transform .22s ease, opacity .22s ease";
        if (horiz && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          var k = dx < 0 ? 1 : -1;
          g.style.transform = "translateX(" + (-k * 110) + "%)"; g.style.opacity = "0";
          setTimeout(function () { st.enter = k; move(k); }, 200);
        } else { g.style.transform = ""; g.style.opacity = ""; }
      });
      if (st.enter) { // arrivée de la nouvelle période, depuis le côté opposé
        var k0 = st.enter; st.enter = 0;
        g.style.transition = "none"; g.style.transform = "translateX(" + (k0 * 60) + "%)"; g.style.opacity = "0";
        requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transition = "transform .26s cubic-bezier(.2,.7,.2,1), opacity .26s ease"; g.style.transform = ""; g.style.opacity = ""; }); });
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
      // Films masqués (repliable) : « Réafficher ».
      var hid = (sorties && sorties.hidden) || [];
      if (hid.length) {
        var s3 = el("section", {}, [el("h2", {}, [el("button", { type: "button", class: "selfold", on: { click: function () { st.openHid = !st.openHid; draw(); } } }, [(st.openHid ? "▾ " : "▸ ") + "Masqués · " + hid.length])])]);
        if (st.openHid) hid.forEach(function (h) {
          s3.appendChild(el("div", { class: "selrow no" }, [el("span", { class: "selk", text: "Masqué" }),
            el("div", { class: "selwhat" }, [el("strong", { text: h.title }), el("small", { text: "par " + (h.by || "l'équipe") + (h.at ? " le " + fdate(h.at.slice(0, 10)) : "") })]),
            el("div", { class: "selsrc" }), el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn ghost", text: "Réafficher", on: { click: function (e) { e.target.disabled = true; sortHide(h, false).then(function () { build(); draw(); }); } } })])]));
        });
        box.appendChild(s3);
      }
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
        el("div", { class: "fwbtns" }, nod ? [el("button", { type: "button", class: "btn ghost", text: "+ Ajouter une date", on: { click: function () { form({ title: x.title, project: x.project, kind: x.series ? "platform" : "cinema" }, r, true); } } }), hideBtn(x)]
          : [el("button", { type: "button", class: "btn ghost", text: "Voir", on: { click: function () { st.at = dOf(x.date); draw(); var cb = box.querySelector(".calbar"); if (cb) window.scrollTo({ top: cb.getBoundingClientRect().top + window.scrollY - 140, behavior: "smooth" }); } } })])]);
      return r;
    }
    // « Masquer » : film qui n'est pas vraiment le nôtre (ex. notre chef op cadreur ou 2e équipe, Gus 19/11) : retiré du calendrier,
    // des bandes-annonces et des recherches du robot ; réaffichable en bas de la page (« Masqués »).
    function hideBtn(x) {
      return el("button", { type: "button", class: "btn ghost", text: "Masquer", title: "Pas une sortie à suivre (ex. notre chef op n'était que cadreur) : retiré du calendrier et des recherches du robot",
        on: { click: function (e) { e.target.disabled = true; var d = box.querySelector(".caldetail"); if (d) d.remove(); sortHide(x, true).then(function () { build(); draw(); }, function (er) { e.target.disabled = false; alert("Pas enregistré : " + er.message); }); } } });
    }
    function detail(x, at) {
      var old = box.querySelector(".caldetail"); if (old) { old.remove(); if (old._x === x) return; }
      var srcs = { fiction: "page fiction du site (à changer là-bas)", human: "ajouté par " + (x.by || "l'équipe"), tmdb: "trouvé par le robot (base TMDB, lien IMDb)", claude: "trouvé par le robot (Claude)" };
      var d = el("div", { class: "caldetail fcard" }, [
        el("h3", { text: x.title + (x.series ? " (série)" : "") }),
        el("p", { class: "fwhere", text: [fdate(x.date), SK[x.kind || "cinema"], (x.platforms || []).join(", "), x.country].filter(Boolean).join(" · ") }),
        el("p", { class: "hint", text: [(x.directors || []).length && "Réalisation : " + x.directors.join(", "), (x.dops || []).length && "Image : " + x.dops.map(rcBase).join(", "), x.prod && "Production : " + x.prod].filter(Boolean).join(" · ") }),
        el("p", { class: "hint", text: "Source : " + (srcs[x.source] || x.source || "") }),
        (function () { // bandes-annonces du film (robot)
          var tl = ((sorties && sorties.trailers) || []).filter(function (t) { return t.key === nrm(x.title) || sortSame(t.title, x.title); });
          return tl.length ? el("p", { class: "hint" }, ["Bandes-annonces : "].concat(tl.map(function (t, i) { return el("span", {}, [i ? " · " : "", el("a", { href: t.url, target: "_blank", rel: "noopener", text: (t.name || "Bande-annonce") + (t.lang ? " (" + t.lang.toUpperCase() + ")" : "") + " ↗" })]); }))) : null;
        })(),
        el("div", { class: "fwbtns" }, [x.url ? el("a", { class: "btn", href: x.url, target: "_blank", rel: "noopener", text: /imdb\.com/.test(x.url) ? "IMDb ↗" : "Source ↗" }) : null,
          x.source !== "fiction" ? el("button", { type: "button", class: "btn", text: "Modifier", on: { click: function () { d.remove(); form(x, at.closest(".cal")); } } }) : null,
          x.source === "fiction" || x.ficSlate ? el("a", { class: "btn", href: ficLink(x), target: "_blank", rel: "noopener", text: "Page fiction ↗" }) : null,
          // Sortie trouvée par le robot : « Confirmer » = vérifiée par l'équipe → gardée pour toujours dans l'archive (plus une donnée TMDB).
          x.source === "tmdb" || x.source === "claude" ? el("button", { type: "button", class: "btn primary", text: "Confirmer", title: "Date vérifiée : gardée pour toujours dans nos archives", on: { click: function (e) {
            var y = JSON.parse(JSON.stringify(x)); ["directors", "dops", "prod", "platforms", "series", "img"].forEach(function (k) { delete y[k]; });
            y.id = "s" + Date.now().toString(36); y.was = x.source; y.source = "human"; y.by = user && user.login || ""; y.at = new Date().toISOString(); delete y.key;
            if (x.platforms && x.platforms[0]) y.platform = x.platforms[0];
            e.target.disabled = true;
            sortSave(null, y, y.title + " : confirmé").then(function () { return sortPut([x], "Sorties : " + x.title + " (robot) remplacé", true); }).then(function () { build(); draw(); });
          } } }) : null,
          x.source !== "fiction" ? hideBtn(x) : null,
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
      + (one ? "\n\nMerci d'avance !\nBonne journée," : "\n\nMerci d'avance pour votre aide !\nBonne journée,"); // Gus 18/11
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
      // Ordre et taille = importance (Gus 19/11) : sorties de la semaine en grand, puis dates de fiction et bandes-annonces,
      // puis les prix (plus petits : souvent des prix anciens retrouvés par les robots).
      var wk = sortBuild(r[1], null, r[0]).events.filter(function (e) { return e.date >= a && e.date <= b; });
      if (wk.length) lines.push(el("a", { href: "#/sorties", class: "hn hn1" }, [el("span", { class: "hnk", text: wk.length > 1 ? "Sortent cette semaine" : "Sort cette semaine" }),
        wk.map(function (e) { return e.title + " · " + day(e.date) + (e.platforms && e.platforms.length ? " (" + e.platforms.join(", ") + ")" : ""); }).join("  —  ")]));
      var fa = ficAlerts(r[1], r[0]); // date de sortie trouvée ou changée pour un Coming soon de la page fiction
      if (fa.length) lines.push(el("a", { href: "#/fiction", class: "hn hn2" }, [el("span", { class: "hnk", text: fa.length > 1 ? fa.length + " nouvelles dates de sortie" : "Nouvelle date de sortie" }),
        fa.slice(0, 4).map(function (a) { return a.title + " : " + fdate(a.r.date) + " (à vérifier dans fiction)"; }).join("  —  ")]));
      var tn = ((r[0] && r[0].trailers) || []).filter(function (t) { return !t.seen; });
      if (tn.length) lines.push(el("a", { href: "#/sorties", class: "hn hn2" }, [el("span", { class: "hnk", text: tn.length > 1 ? tn.length + " nouvelles bandes-annonces" : "Nouvelle bande-annonce" }),
        tn.slice(0, 4).map(function (t) { return t.title + (t.name ? " : " + t.name : ""); }).join("  —  ") + (tn.length > 4 ? "  …" : "")]));
      var pz = ((r[2] && r[2].found) || []).filter(function (x) { return x.kind === "prize" && x.status !== "no" && x.foundAt && sortIso(new Date(x.foundAt)) === td; });
      if (pz.length) lines.push(el("a", { href: "#/selections", class: "hn hn3" }, [el("span", { class: "hnk", text: pz.length > 1 ? pz.length + " prix trouvés aujourd'hui" : "Prix trouvé aujourd'hui" }),
        pz.slice(0, 4).map(function (x) { return x.title + " : " + (x.prize || "prix") + (x.festName ? ", " + x.festName : "") + (x.edition ? " " + x.edition : "") + ((x.dops || []).length ? " (" + x.dops.map(rcBase).join(", ") + ")" : ""); }).join("  —  ") + (pz.length > 4 ? "  …" : "")]));
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
      cs = cs.filter(function (c) { return !/^(Slate : |Équipe : |Bande : |Bandes : )|demande au robot|réponse du robot/.test(c.commit.message); }).slice(0, 50);
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
    subX();
  }
  // Téléphone (menu à l'horizontale) : la ligne des sous-rubriques commence sous sa rubrique (Gus 18/11), pas au bord gauche.
  function subX() {
    // Ligne des sous-rubriques placée juste sous la ligne de sa rubrique (pas sous toutes les rubriques) : ce qui est sur les lignes
    // suivantes passe après elle (ordre CSS), Gus 18/11.
    var kids = [].slice.call(side.children), narrow = matchMedia("(max-width: 900px)").matches;
    kids.forEach(function (k) { k.style.order = k.classList.contains("ssub") ? "99" : ""; });
    var open = narrow && side.querySelector(".ssub.open"), ob = open && side.querySelector("button.sgroup[data-group='" + open.dataset.group + "']");
    if (ob) {
      var top = ob.offsetTop;
      kids.forEach(function (k) { if (!k.classList.contains("ssub")) k.style.order = k.classList.contains("histlink") ? "40" : k.offsetTop > top + 4 ? "30" : "0"; });
      open.style.order = "10";
    } else if (!narrow) kids.forEach(function (k) { k.style.order = ""; });
    side.querySelectorAll(".ssub").forEach(function (x) {
      var b = side.querySelector("button.sgroup[data-group='" + x.dataset.group + "']");
      var dx = b ? b.getBoundingClientRect().left - side.getBoundingClientRect().left - parseFloat(getComputedStyle(side).paddingLeft || 0) : 0;
      x.style.setProperty("--subx", Math.max(0, Math.min(dx, side.clientWidth * .45)) + "px");
    });
  }
  window.addEventListener("resize", subX);
  side.querySelectorAll("button.sgroup").forEach(function (b) { b.addEventListener("click", function () { sideOpen(b.dataset.group); }); });
  // ---------- Bibliothèque (Gus 19/11, d'après la « Library » de Slate ; 2e version 22/11) ----------
  // Tous nos films connus (fiches des chefs op, page fiction, spotlight, accueil, imports), les plus récents en haut (id Slate),
  // recherche avec suggestions (chef op, réal, prod, client, type de contenu, catégorie ; jamais les films) et filtres en
  // étiquettes ; à droite, une bande à composer en glissant les films (sections = bundle), enregistrée toute seule à chaque
  // changement, réglages de la bande et retouches film par film (titre, crédits, vignette, extrait, recadrage : pour cette bande
  // seulement). Client / types de contenu : data/bibli/meta.json, écrit chaque nuit par le robot bibli-meta (branche main).
  // Bandes (Gus 22/11) : lien court SITE_VIEW/b/<code> (9 caractères au hasard, impossible à deviner, pas un numéro qui se
  // suit comme chez Slate). La page publique est CHIFFRÉE (data/b/<empreinte>.json) : sans le lien (et le mot de passe s'il y en
  // a un), le fichier du dépôt public est illisible et son nom ne dit rien. L'original et la liste des bandes (avec les mots de
  // passe) sont dans le dépôt privé notes (bandes/<code>.json, bandes/index.json). Chiffrement : bandSeal (même code dans
  // b/index.html du site). Anciennes bandes (19/11, data/bandes/, en clair) : lues encore, converties au premier changement.
  var BIB_LIB = "data/bibli/library.json", BIB_META = "bibli/meta.json", BANDS = "data/bandes/", BAND_PUB = "data/b/", BAND_KEY = "kinou-bande-draft";
  var BAND_NOTES = "bandes/", BAND_SALT = "kinou-bande-v1", BAND_IT = 150000;
  var bibCache = null, bibKey = null;
  document.addEventListener("keydown", function (e) { if (bibKey) bibKey(e); });
  function bnrm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ł/g, "l").replace(/\s+/g, " ").trim(); }
  function bibLoad(force) {
    if (bibCache && !force) return Promise.resolve(bibCache);
    var map = {}, order = [];
    function add(f, from) {
      var k = f.slate ? "s" + f.slate : "u" + (f.full || f.video || f.img || f.title);
      var o = map[k];
      if (!o) { o = map[k] = { key: k, slate: f.slate || null, title: "", dir: "", prod: "", dops: [], cats: [], types: [], video: "", full: "", img: "", images: null, pages: [], at: "" }; order.push(o); }
      ["title", "dir", "prod", "video", "full", "img", "at", "link"].forEach(function (x) { if (!o[x] && f[x]) o[x] = f[x]; });
      if (!o.images && f.images && f.images.length) o.images = f.images;
      if (!o.extras && f.extras && f.extras.length) o.extras = f.extras; // stills et vidéos sous le film (lecteur)
      if (!o.awards && f.awards) o.awards = f.awards; // prix et sélections (une ligne chacun)
      if (!o.crop && f.crop) o.crop = f.crop; // recadrage réglé sur la page (point de départ dans les bandes)
      (f.dops || []).forEach(function (d) { d = rcBase(d); if (d && !o.dops.some(function (x) { return bnrm(x) === bnrm(d); })) o.dops.push(d); });
      (f.cats || []).forEach(function (c) { c = String(c || "").trim(); if (c && !/^featured$/i.test(c) && !o.cats.some(function (x) { return bnrm(x) === bnrm(c); })) o.cats.push(c); });
      (f.types || []).forEach(function (c) { c = String(c || "").trim(); if (c && !o.types.some(function (x) { return bnrm(x) === bnrm(c); })) o.types.push(c); });
      if (from && !o.pages.some(function (p) { return p.slug === from.slug; })) o.pages.push(from);
    }
    function subOf(sub) { // « Réal\nProd\nco-DoP Nom » -> { dir, prod, dops }
      var l = String(sub || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean), r = { dir: "", prod: "", dops: [] };
      l = l.filter(function (x) { var m = /^(?:co-)?dop\s+(.+)$/i.exec(x); if (m) { r.dops = r.dops.concat(m[1].split(/\s*[,&]\s*/)); return false; } return true; });
      r.dir = l[0] || ""; r.prod = l[1] || ""; return r;
    }
    // Recadrage d'une page (overrides : zoom, zoomPos « x% y% », zoomThumb) → { z, x, y, t } des bandes (Gus 22/11) ;
    // t = la vignette aussi (sinon seulement l'extrait, comme sur le site).
    function cropOf(o) {
      if (!(o && +o.zoom > 1)) return null;
      var m = String(o.zoomPos || "").match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
      return { z: +o.zoom, x: m ? +m[1] : 50, y: m ? +m[2] : 50, t: !!o.zoomThumb };
    }
    function raw(p) { return fetch(RAW_DATA + p, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    return Promise.all([loadIndex(), raw("fiction.json"), raw("spotlight.json"), raw("home.json"), readFile(BIB_LIB).catch(function () { return null; }), raw(BIB_META)]).then(function (r) {
      var idx = r[0], lib = r[4], meta = (r[5] && r[5].films) || {};
      ((lib && lib.items) || []).slice().reverse().forEach(function (it) { add(it, null); });
      return Promise.all((idx.dps || []).map(function (d) { return raw("dps/" + d.slug + ".json").then(function (f) { return [d, f]; }); })).then(function (fs) {
        fs.forEach(function (x) {
          var d = x[0], f = x[1]; if (!f) return;
          var ov = f.overrides || {};
          (f.clips || []).forEach(function (c) {
            var o = ov[c.slate] || {}, s = subOf(o.sub !== undefined ? o.sub : c.sub);
            add({ slate: c.slate, title: o.title || c.title, dir: s.dir, prod: s.prod, dops: [d.name].concat(s.dops), cats: [c.cat], types: o.types || [],
              video: (o.hover && o.hover.video) || c.video, full: c.full, img: c.img, images: o.images || c.stills, extras: extrasOf(o), awards: o.info && o.info.awards, crop: cropOf(o) }, { slug: d.slug, name: d.name });
          });
        });
        [[r[1], "fiction", "Fiction"], [r[2], "spotlight", "Spotlight"]].forEach(function (p) {
          var d = p[0]; if (!d) return; var ov = d.overrides || {};
          (d.films || []).forEach(function (c) {
            var o = ov[c.slate] || {}, s = subOf(o.sub !== undefined ? o.sub : c.sub);
            add({ slate: c.slate, title: o.title || c.title, dir: s.dir, prod: s.prod, dops: (c.artists || []).concat(s.dops), cats: c.cats || [], types: o.genre ? [o.genre] : [],
              video: c.video, full: c.full, img: c.img, images: c.images, extras: extrasOf(o), awards: o.info && o.info.awards, crop: cropOf(o) }, { slug: p[1], name: p[2] });
          });
        });
        ((r[3] && r[3].slides) || []).forEach(function (s) { add({ slate: s.slate, title: s.film, video: s.video, full: s.full, img: s.img, dops: (s.dps || []).map(function (x) { return x.name; }) }, null); });
        // Infos de Slate (robot) : client, types de contenu, mots-clés (recherche libre seulement).
        order.forEach(function (f) {
          var m = f.slate && meta[f.slate]; if (!m) return;
          if (m.client) f.client = m.client;
          add({ slate: f.slate, types: m.types || [] }, null);
          f.tags = m.tags || [];
        });
        // Les plus récents en haut (Gus 22/11) : imports sans id Slate (images) d'abord, puis id Slate décroissant (= ordre d'ajout sur Slate).
        order.sort(function (a, b) { return (b.slate ? 0 : 1) - (a.slate ? 0 : 1) || (b.slate || 0) - (a.slate || 0) || String(b.at).localeCompare(String(a.at)); });
        // Index des suggestions : chef op, réal, prod, client, type de contenu, catégorie (pas les films, Gus 22/11).
        var sug = {};
        function put(type, v) { v = String(v || "").trim(); if (!v || v.length < 2) return; var k = type + "|" + bnrm(v); (sug[k] = sug[k] || { type: type, value: v, n: 0 }).n++; }
        order.forEach(function (f) {
          f.dops.forEach(function (d) { put("dop", d); });
          bibDirs(f).forEach(function (d) { put("dir", d); });
          put("prod", f.prod); put("client", f.client); f.types.forEach(function (c) { put("type", c); }); f.cats.forEach(function (c) { put("cat", c); });
          f.hay = bnrm([f.title, f.dir, f.prod, f.client, f.dops.join(" "), f.cats.join(" "), f.types.join(" "), (f.tags || []).join(" ")].join(" "));
        });
        bibCache = { films: order, sug: Object.keys(sug).map(function (k) { return sug[k]; }), lib: lib || { items: [] } };
        return bibCache;
      });
    });
  }
  function bibDirs(f) { return String(f.dir || "").split(/\s*,\s*|\s+&\s+/).filter(Boolean); }
  var BIB_T = { dop: "Chef op", dir: "Réal", prod: "Prod", client: "Client", type: "Type de contenu", cat: "Catégorie" };
  var BIB_ORDER = ["dop", "dir", "prod", "client", "type", "cat"];
  function bibMatch(f, c) {
    var v = bnrm(c.value);
    if (c.type === "dop") return f.dops.some(function (d) { return bnrm(d) === v; });
    if (c.type === "dir") return bibDirs(f).some(function (d) { return bnrm(d) === v; });
    if (c.type === "prod") return bnrm(f.prod) === v;
    if (c.type === "client") return bnrm(f.client) === v;
    if (c.type === "type") return f.types.some(function (x) { return bnrm(x) === v; });
    if (c.type === "cat") return f.cats.some(function (x) { return bnrm(x) === v; });
    return true;
  }
  function bandNew() {
    var d = new Date();
    return { code: null, title: "Bande (" + d.getDate() + " " + MOISC[d.getMonth()] + " " + d.getFullYear() + ")", description: "", artists: "", items: [], cols: 3,
      hide: { dir: false, dop: false, prod: false, types: false }, expires: "", download: false, pw: "" };
  }
  function bandItem(f) { // copie d'un film dans la bande : la bande ne dépend plus de la bibliothèque (retouches propres à la bande)
    var o = { key: f.key, slate: f.slate, title: f.title, dir: f.dir, prod: f.prod, dops: f.dops.slice(), cats: f.cats.slice(), types: (f.types || []).slice(), video: f.video, full: f.full, img: f.img };
    if (f.images && f.images.length) o.images = f.images.slice();
    if (f.extras && f.extras.length) o.extras = JSON.parse(JSON.stringify(f.extras));
    if (f.awards) o.awards = f.awards;
    if (f.crop) o.crop = Object.assign({}, f.crop);
    Object.keys(o).forEach(function (k) { if (o[k] === "" || o[k] === null || o[k] === undefined || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; });
    return o;
  }
  function bandURL(code) { return SITE_VIEW + "/b/" + code; }
  function bandCode() { var a = "abcdefghijkmnpqrstuvwxyz23456789"; return Array.from(crypto.getRandomValues(new Uint8Array(9))).map(function (x) { return a[x % 32]; }).join(""); }
  // Chiffrement d'une bande (identique dans b/index.html du site) : PBKDF2-SHA256 (150 000 tours) du code → nom du fichier
  // (16 octets) + clé AES-GCM (32 octets) ; avec un mot de passe, la clé vient de « code + mot de passe » (sel au hasard).
  function u8b64(u) { var s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function b64u8(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function pbkdf(text, salt, bits) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(text), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: typeof salt === "string" ? enc.encode(salt) : salt, iterations: BAND_IT }, k, bits);
    }).then(function (b) { return new Uint8Array(b); });
  }
  function bandKeys(code) { return pbkdf(code, BAND_SALT, 384).then(function (b) { return { id: Array.from(b.slice(0, 16)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""), key: b.slice(16, 48) }; }); }
  function bandSeal(code, pw, exp, payload) {
    return bandKeys(code).then(function (k) {
      var salt = pw ? crypto.getRandomValues(new Uint8Array(16)) : null;
      return (pw ? pbkdf(code + "\n" + pw, salt, 256) : Promise.resolve(k.key)).then(function (raw) {
        return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
      }).then(function (key) {
        var iv = crypto.getRandomValues(new Uint8Array(12));
        return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(JSON.stringify(payload))).then(function (d) {
          return { id: k.id, text: JSON.stringify({ v: 1, exp: exp || "", pw: salt ? { s: u8b64(salt) } : null, iv: u8b64(iv), d: u8b64(new Uint8Array(d)) }) + "\n" };
        });
      });
    });
  }
  // Dépôt privé notes : lecture / écriture d'un fichier (empreinte gardée ; un autre enregistrement entre-temps → on relit et on refait).
  var nSha = {};
  function nGet(path) {
    return gh("/repos/" + NOTES_REPO + "/contents/" + path, { allow404: true }).then(function (f) { if (!f) { delete nSha[path]; return null; } nSha[path] = f.sha; return b64dec(f.content); });
  }
  function nPut(path, text, msg, tries) {
    return gh("/repos/" + NOTES_REPO + "/contents/" + path, { method: "PUT", body: { message: msg, content: b64enc(text), sha: nSha[path] || undefined } })
      .then(function (r) { nSha[path] = r.content.sha; }, function (e) {
        if ((tries || 0) >= 2 || !/GitHub (409|422)/.test(e.message)) throw e;
        return nGet(path).then(function () { return nPut(path, text, msg, (tries || 0) + 1); });
      });
  }
  function nEdit(path, fn, msg, tries) { // relit puis modifie (liste des bandes : plusieurs personnes)
    return nGet(path).then(function (t) {
      var n = fn(t); if (n === null) return;
      return nPut(path, n, msg, 2).catch(function (e) { if ((tries || 0) >= 2 || !/GitHub (409|422)/.test(e.message)) throw e; return nEdit(path, fn, msg, (tries || 0) + 1); });
    });
  }
  // Ghost qui suit la souris avec un petit effet physique (ressort, penche selon la vitesse) ; plusieurs films = un paquet d'images.
  function bibFly(ev, imgs, n) {
    var fly = el("div", { class: "bfly" }), cards = [], x = ev.clientX, y = ev.clientY;
    imgs.slice(0, 3).forEach(function (u, i) {
      var c = el("div", { class: "bflyc" }); if (u) c.style.backgroundImage = 'url("' + u + '")';
      cards.push({ e: c, x: x, y: y, vx: 0, vy: 0, k: .22 - i * .05, r: [0, -7, 6][i] }); fly.insertBefore(c, fly.firstChild);
    });
    if (n > 1) fly.appendChild(el("span", { class: "bflyn", text: String(n) }));
    document.body.appendChild(fly);
    var tx = x, ty = y, raf = 0, dead = false;
    function step() {
      cards.forEach(function (c) {
        c.vx = (c.vx + (tx - c.x) * c.k) * .62; c.vy = (c.vy + (ty - c.y) * c.k) * .62; c.x += c.vx; c.y += c.vy;
        var tilt = Math.max(-28, Math.min(28, c.vx * 1.1)) + c.r;
        c.e.style.transform = "translate(" + (c.x - 60) + "px," + (c.y - 34) + "px) rotate(" + tilt + "deg) scale(" + (1 + Math.min(.12, Math.abs(c.vy) / 200)) + ")";
      });
      var b = fly.querySelector(".bflyn"); if (b) b.style.transform = "translate(" + (cards[0].x + 46) + "px," + (cards[0].y - 46) + "px)";
      if (!dead) raf = requestAnimationFrame(step);
    }
    step();
    return {
      move: function (e) { tx = e.clientX; ty = e.clientY; },
      end: function (to) { // to = rectangle d'arrivée (dépôt) ou null (retour au départ)
        dead = true; cancelAnimationFrame(raf);
        fly.classList.add(to ? "drop" : "back");
        cards.forEach(function (c, i) {
          var X = to ? to.left + to.width / 2 : x, Y = to ? to.top + Math.min(to.height, 40) / 2 : y;
          c.e.style.transition = "transform " + (to ? .32 : .45) + "s cubic-bezier(.2,.8,.2,1) " + (i * 30) + "ms, opacity .35s " + (i * 30) + "ms";
          c.e.style.transform = "translate(" + (X - 60) + "px," + (Y - 34) + "px) rotate(0deg) scale(" + (to ? .35 : .9) + ")"; c.e.style.opacity = "0";
        });
        setTimeout(function () { fly.remove(); }, 520);
      }
    };
  }

  function showBibli() {
    bar.hidden = true; editing = false; view.textContent = "";
    document.body.classList.add("bibpage");
    // En arrivant : toujours une nouvelle bande vide (Gus 22/11), sauf une bande pas encore enregistrée (enregistrement raté).
    var band; try { band = JSON.parse(localStorage.getItem(BAND_KEY) || "null"); } catch (e) {}
    if (!band || !band.items || band.code || !band.items.length) band = bandNew();
    var st = { q: "", chips: [], n: 60, sel: {}, sugI: -1, tab: "new", last: null };
    var wrap = el("div", { class: "bib" }), left = el("div", { class: "bibl" }), right = el("aside", { class: "bibr" });
    wrap.appendChild(left); wrap.appendChild(right); view.appendChild(wrap);
    var head = el("div", { class: "bibhead" }, [el("h1", { text: "Bibliothèque" }), el("div", { class: "bibadd" }, [
      el("button", { type: "button", class: "btn primary", text: "+ Vidéo", on: { click: function () { importVideo(); } } }),
      el("button", { type: "button", class: "btn primary", text: "+ Images", on: { click: function () { importImages(); } } })])]);
    left.appendChild(head);
    var q = el("input", { type: "search", class: "find bibq", placeholder: "Chercher : chef op, réal, prod, client, type de contenu, catégorie, titre…", autocomplete: "off" });
    var sugBox = el("div", { class: "bibsug", hidden: true }), chipsBox = el("div", { class: "bibchips" });
    var info = el("p", { class: "hint bibinfo", text: "Chargement de tous nos films…" }), list = el("div", { class: "biblist" });
    left.appendChild(el("div", { class: "bibsearch" }, [q, sugBox])); left.appendChild(chipsBox); left.appendChild(info); left.appendChild(list);
    var data = null;
    bibLoad().then(function (d) { data = d; draw(); }, function (e) { info.textContent = "Indisponible : " + e.message; });
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
      }
      list.textContent = "";
      l.slice(0, st.n).forEach(function (f, i) { list.appendChild(row(f, i)); });
      if (l.length > st.n) list.appendChild(el("button", { type: "button", class: "btn ghost rcmore", text: "Afficher plus (" + (l.length - st.n) + ")", on: { click: function () { st.n += 120; draw(); } } }));
    }
    function row(f, i) {
      var th = el("div", { class: "bthumb" }); if (f.img) th.style.backgroundImage = 'url("' + f.img + '")';
      if (f.images && !f.video && !f.full) th.appendChild(el("span", { class: "bimgs", text: f.images.length + " images" }));
      var v = null;
      th.addEventListener("mouseenter", function () { if (!f.video || v || document.body.classList.contains("bdragging")) return; v = el("video", { muted: true, autoplay: true, loop: true, playsinline: true }); v.muted = true; v.src = f.video; th.appendChild(v); });
      th.addEventListener("mouseleave", function () { if (v) { v.remove(); v = null; } });
      var cb = el("input", { type: "checkbox" }); cb.checked = !!st.sel[f.key];
      cb.addEventListener("click", function (e) { // Maj + clic : toute la plage depuis la dernière case cochée
        if (e.shiftKey && st.last && st.shown) {
          var a = st.shown.indexOf(st.last), b = st.shown.indexOf(f); if (a > -1 && b > -1) { st.shown.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (x) { st.sel[x.key] = 1; }); }
        }
      });
      cb.addEventListener("change", function () { if (cb.checked) st.sel[f.key] = 1; else delete st.sel[f.key]; st.last = f; draw(); });
      function lnk(type, v) { return el("button", { type: "button", class: "blink", text: v, title: "Filtrer : " + BIB_T[type] + " " + v, on: { click: function (e) { e.stopPropagation(); st.chips.push({ type: type, value: v }); draw(); } } }); }
      var add = el("button", { type: "button", class: "btn ghost badd", text: inBand(f) ? "✓" : "+", title: "Ajouter à la bande", on: { click: function (e) { e.stopPropagation(); addKeys([f.key], band.items.length, th); } } });
      var r = el("div", { class: "brow" + (st.sel[f.key] ? " sel" : "") + (inBand(f) ? " inband" : "") }, [
        el("span", { class: "bnum", text: String(i + 1) }), cb, th,
        el("div", { class: "bt" }, [el("strong", { text: f.title || "(sans titre)" }), el("small", {}, f.pages.map(function (p, j) { return el("span", {}, [j ? " · " : "", p.name]); }))]),
        el("div", { class: "bc" }, f.dops.map(function (d) { return lnk("dop", d); })),
        el("div", { class: "bc" }, f.cats.slice(0, 2).map(function (c) { return lnk("cat", c); }).concat(f.types.filter(function (t) { return !f.cats.some(function (c) { return bnrm(c) === bnrm(t); }); }).slice(0, 3).map(function (c) { return lnk("type", c); }))),
        el("div", { class: "bc" }, (f.prod ? [lnk("prod", f.prod)] : []).concat(f.client ? [lnk("client", f.client)] : [])),
        el("div", { class: "bc" }, bibDirs(f).map(function (d) { return lnk("dir", d); })), add]);
      r.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button, input, a")) return;
        var keys = st.sel[f.key] ? Object.keys(st.sel) : [f.key];
        dragStart(e, { kind: "add", keys: keys, imgs: keys.map(function (k) { var x = filmOf(k); return x && x.img; }), from: r });
      });
      return r;
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
          fly = bibFly(ev, d.imgs, d.kind === "add" ? d.keys.length : 1);
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
    function keep() { try { localStorage.setItem(BAND_KEY, JSON.stringify(band, function (k, v) { return k === "_file" ? undefined : v; })); } catch (e) {} }
    function changed() { keep(); clearTimeout(save.t); setState("wait"); save.t = setTimeout(saveBand, 1200); undoMark(); }
    // Annuler / Rétablir (Gus 22/11 : une bande vidée par erreur…) : instantanés de la bande, un par moment de calme (0,6 s).
    var undo = { l: [], i: -1, t: 0 };
    function snap() { return JSON.stringify(band, function (k, v) { return k === "_file" ? undefined : v; }); }
    function undoReset() { undo.l = [snap()]; undo.i = 0; undoBtns(); }
    function undoMark() { clearTimeout(undo.t); undo.t = setTimeout(function () { var s = snap(); if (s === undo.l[undo.i]) return; undo.l = undo.l.slice(0, undo.i + 1); undo.l.push(s); if (undo.l.length > 80) undo.l.shift(); undo.i = undo.l.length - 1; undoBtns(); }, 600); }
    function undoGo(d) {
      clearTimeout(undo.t); var s = snap();
      if (s !== undo.l[undo.i]) { undo.l = undo.l.slice(0, undo.i + 1); undo.l.push(s); undo.i++; } // changement pas encore noté
      var j = undo.i + d; if (j < 0 || j >= undo.l.length) return;
      undo.i = j; var code = band.code, created = band.created; band = JSON.parse(undo.l[j]); band.code = code; band.created = created;
      keep(); clearTimeout(save.t); setState("wait"); save.t = setTimeout(saveBand, 1200);
      drawBand(); if (data) draw();
    }
    function undoBtns() { var u = right.querySelector(".bundo"), r = right.querySelector(".bredo"); if (u) u.disabled = undo.i <= 0; if (r) r.disabled = undo.i >= undo.l.length - 1; }
    bibKey = function (e) { // Ctrl / Cmd + Z, Maj + Ctrl / Cmd + Z (hors champs de texte)
      if (!document.body.classList.contains("bibpage") || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.target.closest("input, textarea") || document.querySelector(".bmodal")) return;
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
      var items = b.items.map(function (x) { var c = Object.assign({}, x); delete c._file; delete c.key; return c; });
      var pub = { title: b.title.trim() || "Bande", description: (b.description || "").trim(), artists: artists, cols: b.cols, hide: b.hide, download: !!b.download, items: items, at: now };
      var files = save.files.splice(0);
      var by = user && user.login || "";
      bandSeal(b.code, b.pw || "", b.expires, pub).then(function (s) {
        var cf = [{ path: BAND_PUB + s.id + ".json", text: s.text }].concat(files);
        if (save.legacy === b.code) { // ancienne bande en clair (19/11) : supprimée au passage
          cf.push({ path: BANDS + b.code + ".json", remove: true });
          cf.push({ path: BANDS + "index.json", edit: function (t) { var ix = t ? JSON.parse(t) : { bandes: [] }; ix.bandes = (ix.bandes || []).filter(function (x) { return x.code !== b.code; }); return json(ix); } });
        }
        return commit(cf, "Bande : " + pub.title + " (admin, " + by + ")").then(function () {
          save.legacy = null;
          var src = Object.assign({}, b, { at: now, by: by, created: b.created || now, items: items.map(function (x, i) { return Object.assign({ key: b.items[i].key }, x); }) });
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
        clearTimeout(save.t); save.t = setTimeout(function () { saveBand(b); }, 8000); // nouvel essai tout seul
      });
    }
    function flash(x) { if (!x) return; x.classList.remove("flash"); void x.offsetWidth; x.classList.add("flash"); }

    // ---------- Bande (panneau de droite) ----------
    var foot = null;
    function drawBand(popAt, popN) {
      right.textContent = "";
      right.appendChild(el("div", { class: "btabs" }, [
        // Revenir de « Bandes existantes » = une nouvelle bande vide, comme en rechargeant la page (Gus 22/11) ; la bande en cours reste enregistrée.
        el("button", { type: "button", class: st.tab === "new" ? "on" : "", text: band.code && st.tab === "new" ? "Bande" : "Nouvelle bande", on: { click: function () {
          if (st.tab === "old") { if (save.busy || save.state === "wait") { clearTimeout(save.t); saveBand(); } band = bandNew(); save.meta = null; save.legacy = null; save.state = ""; keep(); undoReset(); if (data) draw(); }
          st.tab = "new"; drawBand();
        } } }),
        el("button", { type: "button", class: st.tab === "old" ? "on" : "", text: "Bandes existantes", on: { click: function () { st.tab = "old"; drawBand(); } } })]));
      if (st.tab === "old") return drawOld();
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
          var marks = [it.crop ? "recadré" : "", it.snip ? "extrait" : "", it.edited ? "retouché" : ""].filter(Boolean);
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
          if (save.busy || save.state === "wait") { clearTimeout(save.t); saveBand(); }
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
      var box = el("div", { class: "bold" }, [el("p", { class: "hint", text: "Chargement…" })]); right.appendChild(box);
      Promise.all([nGet(BAND_NOTES + "index.json").then(function (t) { return t ? JSON.parse(t).bandes || [] : []; }), readFile(BANDS + "index.json").catch(function () { return null; })]).then(function (r) {
        box.textContent = "";
        var l = r[0].concat(((r[1] && r[1].bandes) || []).map(function (b) { return Object.assign({ legacy: true }, b); }))
          .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
        if (!l.length) box.appendChild(el("p", { class: "hint", text: "Aucune bande enregistrée pour l'instant." }));
        var today = new Date().toISOString().slice(0, 10);
        l.forEach(function (b, i) {
          var exp = b.expires && b.expires < today;
          var th = el("div", { class: "bithumb" }); if (b.img) th.appendChild(el("i", { style: 'background-image:url("' + b.img + '")' }));
          // Clic n'importe où sur la bande = l'ouvrir (Gus 22/11) ; seulement son nom, pas les chefs op.
          box.appendChild(el("div", { class: "boldrow" + (exp ? " exp" : ""), style: "--i:" + i, title: "Ouvrir cette bande", on: { click: function (e) { if (!e.target.closest("a, button")) openBand(b); } } }, [th, el("div", { class: "boldt" }, [el("strong", { text: b.title }),
            el("small", { text: [b.n + " film" + (b.n > 1 ? "s" : ""), fdate(String(b.at).slice(0, 10)), b.by, b.pw ? "mot de passe" : "", b.expires ? (exp ? "expirée le " : "jusqu'au ") + fdate(b.expires) : "", b.legacy ? "ancien lien" : ""].filter(Boolean).join(" · ") })]),
            el("div", { class: "fwbtns" }, [
              el("a", { class: "btn ghost", title: "Voir la page envoyée", href: b.legacy ? SITE_VIEW + "/b/?" + b.code : bandURL(b.code), target: "_blank", rel: "noopener", text: "↗" }),
              b.legacy ? null : el("button", { type: "button", class: "btn ghost", text: "×", title: "Supprimer cette bande (le lien ne marchera plus)", on: { click: function () { delBand(b); } } })])]));
        });
      }, function (e) { box.textContent = "Indisponible : " + e.message + " (la clé doit avoir accès au dépôt notes)"; });
    }
    function openBand(b) {
      if (save.busy || save.state === "wait") { clearTimeout(save.t); saveBand(); } // la bande affichée garde ses derniers changements
      var p = b.legacy ? readFile(BANDS + b.code + ".json") : nGet(BAND_NOTES + b.code + ".json").then(function (t) { return t ? JSON.parse(t) : null; });
      p.then(function (d) {
        if (!d) return;
        band = { code: d.code, title: d.title, description: d.description || "", artists: Array.isArray(d.artists) ? (b.legacy ? "" : d.artists.join(", ")) : (d.artists || ""), items: d.items || [], cols: d.cols || 3,
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
      function drawCols() { cols.textContent = ""; [1, 2, 3].forEach(function (n) { cols.appendChild(el("button", { type: "button", class: "btn" + (band.cols === n ? " primary" : ""), text: n + " colonne" + (n > 1 ? "s" : ""), on: { click: function () { band.cols = n; changed(); drawCols(); } } })); }); }
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
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: "OK", on: { click: close } })]));
      ov.appendChild(box); document.body.appendChild(ov);
    }

    // ---------- Retouches d'un film pour cette bande seulement (Gus 22/11) ----------
    // Titre, crédits, chefs op, types de contenu ; vignette (une image du film ou un still) ; extrait (début choisi dans le film,
    // 10 s) ; recadrage (zoom + point de cadrage). La bibliothèque et les fiches ne changent pas.
    function editItem(i) {
      var it = band.items[i], orig = filmOf(it.key);
      var ov = el("div", { class: "bmodal" }), box = el("div", { class: "bmbox bedit" });
      function close() { ov.classList.add("out"); setTimeout(function () { ov.remove(); }, 160); drawBand(); }
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      function fld(label, get, set, ph) {
        var x = el("input", { type: "text", value: get() || "", placeholder: ph || "" });
        x.addEventListener("input", function () { set(x.value); it.edited = true; changed(); prevMeta(); });
        return [el("span", { class: "label", text: label }), x];
      }
      var list2 = function (s) { return String(s || "").split(/\s*,\s*/).filter(Boolean); };
      // Aperçu : comme sur la page envoyée (vignette, extrait au survol, recadrage)
      var pv = el("div", { class: "bpv" }), pin = el("div", { class: "bpvin" }), pmeta = el("div", { class: "bpvm" });
      pv.appendChild(pin); pv.appendChild(pmeta);
      var pvid = null;
      function prevImg() {
        pin.style.backgroundImage = it.img ? 'url("' + it.img + '")' : "";
        // Recadrage : l'extrait toujours ; la vignette seulement si « vignette aussi » (t), comme sur les pages.
        var c = it.crop || { z: 1, x: 50, y: 50 }, all = !it.crop || it.crop.t !== false;
        pin.style.transform = all ? "scale(" + c.z + ")" : ""; pin.style.transformOrigin = c.x + "% " + c.y + "%";
        if (pvid) { pvid.style.transform = all ? "" : "scale(" + c.z + ")"; pvid.style.transformOrigin = c.x + "% " + c.y + "%"; }
        if (thumbCk) { thumbCk.checked = !it.crop || it.crop.t !== false; thumbCk.disabled = !it.crop; }
      }
      function prevMeta() { pmeta.textContent = ""; pmeta.appendChild(el("strong", { text: it.title || "" })); pmeta.appendChild(el("span", { text: (it.types || it.cats || []).join(" · ") })); }
      pv.addEventListener("mouseenter", function () {
        var src = it.snip ? it.full : it.video; if (!src || pvid) return;
        pvid = el("video", { muted: true, playsinline: true, autoplay: true, loop: !it.snip }); pvid.muted = true;
        pvid.src = src + (it.snip ? "#t=" + it.snip.s : "");
        if (it.snip) pvid.addEventListener("timeupdate", function () { if (pvid && pvid.currentTime > it.snip.s + it.snip.d) pvid.currentTime = it.snip.s; });
        pin.appendChild(pvid); prevImg();
      });
      pv.addEventListener("mouseleave", function () { if (pvid) { pvid.remove(); pvid = null; } });
      // Recadrage : zoom + glisser dans l'aperçu
      var zoom = el("input", { type: "range", min: "100", max: "200", step: "1", value: String(Math.round((it.crop ? it.crop.z : 1) * 100)) });
      var zl = el("span", { class: "hint", text: "" }), thumbCk = el("input", { type: "checkbox" });
      thumbCk.addEventListener("change", function () { if (!it.crop) return; it.crop.t = thumbCk.checked; prevImg(); changed(); });
      function zlab() { zl.textContent = zoom.value + " %" + (+zoom.value > 100 ? " · glissez l'image pour choisir le cadrage" : ""); }
      zoom.addEventListener("input", function () {
        var z = +zoom.value / 100; if (z <= 1) delete it.crop; else it.crop = { z: z, x: it.crop ? it.crop.x : 50, y: it.crop ? it.crop.y : 50, t: it.crop ? it.crop.t !== false : true };
        zlab(); prevImg(); changed();
      });
      var dragC = null;
      pv.addEventListener("pointerdown", function (e) { if (!it.crop) return; e.preventDefault(); pv.setPointerCapture(e.pointerId); dragC = { x: e.clientX, y: e.clientY, cx: it.crop.x, cy: it.crop.y, w: pv.clientWidth, h: pv.clientHeight }; });
      pv.addEventListener("pointermove", function (e) {
        if (!dragC) return; var k = 100 / (it.crop.z - 1);
        it.crop.x = Math.round(Math.max(0, Math.min(100, dragC.cx - (e.clientX - dragC.x) / dragC.w * k)));
        it.crop.y = Math.round(Math.max(0, Math.min(100, dragC.cy - (e.clientY - dragC.y) / dragC.h * k)));
        prevImg();
      });
      pv.addEventListener("pointerup", function () { if (dragC) { dragC = null; changed(); } });
      // Lecteur du film (Gus 22/11) : image par image avec les flèches (Maj = 1 s), pour la vignette et pour l'extrait.
      // Extrait = un début et une fin (0,5 à 10 s) : poignées sur la frise de détail (30 s autour de l'extrait) ; pendant qu'on
      // bouge une poignée la vidéo montre l'image sans bouger, dès qu'on lâche (ou 0,7 s après la dernière flèche) l'extrait joue en boucle.
      var player = null, pout = el("p", { class: "hint" }), tools = el("div", { class: "tltools" }), tl = null;
      var src = it.full || it.video;
      function fmtF(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2).replace(".", ","); }
      if (src) {
        player = el("video", { playsinline: true, preload: "auto", muted: true }); player.muted = true; player.src = src;
        var FR = 1 / 25, dur = 0, act = "play", loopOn = false, kT = 0, WIN = 30;
        var oReg = el("i", { class: "tlreg" }), oPh = el("i", { class: "tlph" }), over = el("div", { class: "tlo", title: "Tout le film : cliquez ou glissez" }, [oReg, oPh]);
        var dReg = el("i", { class: "tlreg" }), dPh = el("i", { class: "tlph" }), hIn = el("b", { class: "tlh in", title: "Début de l'extrait" }), hOut = el("b", { class: "tlh out", title: "Fin de l'extrait" });
        var dLab = el("div", { class: "tllab" }), det = el("div", { class: "tld" }, [dReg, dPh, hIn, hOut]);
        var time = el("span", { class: "tlt" }), playB = el("button", { type: "button", class: "btn ghost", text: "▶", title: "Lecture / pause (espace)" });
        tl = el("div", { class: "tl" }, [over, det, dLab]);
        var clamp = function (t) { return Math.max(0, Math.min(dur || 0, t)); };
        var win = function () { var c = it.snip ? it.snip.s + it.snip.d / 2 : player.currentTime, a = Math.max(0, Math.min(Math.max(0, dur - WIN), c - WIN / 2)); return [a, Math.min(dur, a + WIN)]; };
        var pc = function (t, a, b) { return Math.max(0, Math.min(100, (t - a) / (b - a || 1) * 100)) + "%"; };
        var draw = function () {
          if (!dur) return; var t = player.currentTime, w = win();
          oPh.style.left = pc(t, 0, dur); time.textContent = fmtF(t) + " / " + fmtF(dur);
          det.hidden = dLab.hidden = !it.snip; oReg.hidden = !it.snip;
          if (it.snip) {
            var s = it.snip.s, e = s + it.snip.d;
            oReg.style.left = pc(s, 0, dur); oReg.style.width = Math.max(.4, it.snip.d / dur * 100) + "%";
            dReg.style.left = pc(s, w[0], w[1]); dReg.style.width = (it.snip.d / (w[1] - w[0]) * 100) + "%";
            hIn.style.left = pc(s, w[0], w[1]); hOut.style.left = pc(e, w[0], w[1]); dPh.style.left = pc(t, w[0], w[1]);
            dPh.hidden = t < w[0] || t > w[1];
            hIn.classList.toggle("on", act === "in"); hOut.classList.toggle("on", act === "out");
            dLab.textContent = "Extrait : " + fmtF(s) + " → " + fmtF(e) + " (" + it.snip.d.toFixed(1).replace(".", ",") + " s)" + (act === "play" ? "" : " · flèches : " + (act === "in" ? "début" : "fin") + " image par image") + " · espace : lire la boucle";
          }
        };
        var seek = function (t) { loopOn = false; player.pause(); player.currentTime = clamp(t); draw(); };
        var playSnip = function () { if (!it.snip) return; loopOn = true; player.currentTime = it.snip.s; player.play().catch(function () {}); };
        var setSnip = function (s, e, which) { // 0,5 s au moins, 10 s au plus : la poignée tirée s'arrête, l'autre ne bouge pas (Gus 22/11)
          s = Math.round(s * 1000) / 1000; e = Math.round(e * 1000) / 1000;
          if (which === "in") s = Math.max(0, e - 10, Math.min(s, e - .5));
          else if (which === "out") e = Math.min(dur, s + 10, Math.max(e, s + .5));
          else { s = Math.max(0, Math.min(s, dur - .5)); e = Math.min(dur, Math.max(s + .5, Math.min(e, s + 10))); }
          it.snip = { s: Math.max(0, s), d: Math.round((Math.min(dur, e) - Math.max(0, s)) * 1000) / 1000 }; it.edited = true;
        };
        var moveHandle = function (which, t) { var s = it.snip.s, e = s + it.snip.d; if (which === "in") setSnip(t, e, "in"); else setSnip(s, t, "out"); seek(which === "in" ? it.snip.s : it.snip.s + it.snip.d); };
        player.addEventListener("loadedmetadata", function () { dur = player.duration || 0; if (it.snip) player.currentTime = it.snip.s; draw(); });
        player.addEventListener("timeupdate", draw);
        player.addEventListener("seeked", draw);
        player.addEventListener("play", function () { playB.textContent = "❚❚"; });
        player.addEventListener("pause", function () { playB.textContent = "▶"; });
        (function tick() { // boucle de l'extrait + mesure de la cadence (image par image exact)
          if (dur && !player.isConnected) return; // fenêtre fermée
          if (loopOn && it.snip && !player.paused && (player.currentTime >= it.snip.s + it.snip.d || player.currentTime < it.snip.s - .1)) player.currentTime = it.snip.s;
          if (!player.paused) draw();
          requestAnimationFrame(tick);
        })();
        if (player.requestVideoFrameCallback) { var lastMT = null; var fcb = function (now, m) { if (lastMT !== null) { var d = m.mediaTime - lastMT; if (d > .015 && d < .05) FR = d; } lastMT = m.mediaTime; if (player.isConnected) player.requestVideoFrameCallback(fcb); }; player.requestVideoFrameCallback(fcb); }
        // Lecture : s'il y a un extrait, toujours en boucle entre le début et la fin (Gus 22/11) ; sinon le film.
        var toggle = function () {
          if (!player.paused) { player.pause(); return; }
          if (it.snip) { var t = player.currentTime; loopOn = true; if (t < it.snip.s || t >= it.snip.s + it.snip.d - .05) player.currentTime = it.snip.s; player.play().catch(function () {}); }
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
        var hw = null;
        [[hIn, "in"], [hOut, "out"]].forEach(function (h) {
          drag(h[0], function (e) { act = h[1]; if (!hw) hw = win(); moveHandle(h[1], tAt(e, det, hw[0], hw[1])); }, function () { hw = null; changed(); prevSnip(); playSnip(); });
        });
        // Raccourcis valables où que soit le clic dans la fenêtre (Gus 22/11) : écoutés avant tout le reste (capture), sauf dans un
        // champ de texte. Espace = lecture / pause ; flèches = image par image (la vidéo s'arrête, pas de reprise toute seule).
        var onKey = function (e) {
          if (!document.body.contains(box)) { document.removeEventListener("keydown", onKey, true); return; }
          if (e.target && e.target.matches && e.target.matches("textarea, input:not([type=range]):not([type=checkbox])")) return;
          if (e.key === " ") { e.preventDefault(); e.stopPropagation(); if (document.activeElement && document.activeElement.blur && box.contains(document.activeElement)) document.activeElement.blur(); if (!e.repeat) toggle(); return; }
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault(); e.stopPropagation(); var st2 = (e.shiftKey ? 1 : FR) * (e.key === "ArrowLeft" ? -1 : 1);
          if (act === "play" || !it.snip) seek(player.currentTime + st2);
          else { moveHandle(act, (act === "in" ? it.snip.s : it.snip.s + it.snip.d) + st2); clearTimeout(kT); kT = setTimeout(function () { changed(); prevSnip(); }, 500); }
        };
        document.addEventListener("keydown", onKey, true);
        tools.appendChild(el("div", { class: "tlrow" }, [
          el("button", { type: "button", class: "btn ghost", text: "◀ 1 image", title: "Image précédente (←, Maj + ← = 1 s)", on: { click: function (e) { e.currentTarget.blur(); onKey({ key: "ArrowLeft", target: player, preventDefault: function () {}, stopPropagation: function () {} }); } } }),
          playB,
          el("button", { type: "button", class: "btn ghost", text: "1 image ▶", title: "Image suivante (→, Maj + → = 1 s)", on: { click: function (e) { e.currentTarget.blur(); onKey({ key: "ArrowRight", target: player, preventDefault: function () {}, stopPropagation: function () {} }); } } }),
          time]));
        tools.appendChild(el("div", { class: "tlrow" }, [
          el("button", { type: "button", class: "btn", text: "Cette image = vignette", on: { click: grab } }),
          it.full ? el("button", { type: "button", class: "btn", text: "Extrait à partir d'ici", title: "Début = image affichée ; réglez ensuite le début et la fin (10 s au plus)", on: { click: function () {
            var s = player.currentTime, d = it.snip ? it.snip.d : 5; act = "in"; setSnip(s, s + d, "new"); changed(); prevSnip(); draw(); playSnip(); drawSnip();
          } } }) : null]));
      }
      var snipLine = el("p", { class: "hint" });
      function prevSnip() { if (pvid) { pvid.remove(); pvid = null; } }
      function drawSnip() {
        snipLine.textContent = "";
        if (it.snip) snipLine.appendChild(el("span", {}, [el("button", { type: "button", class: "blink", text: "Revenir à l'extrait d'origine", on: { click: function () { delete it.snip; act = "play"; changed(); drawSnip(); if (tl) { loopOn = false; draw(); } } } })]));
        else snipLine.textContent = it.video ? "Extrait d'origine (Slate)." : "Pas d'extrait.";
      }
      function fmtT(t) { return fmtF(t); }
      // Capture d'une image du film : la vidéo de Slate n'autorise pas la copie d'image ; on la relit par la fonction /api/media du site.
      function grab() {
        if (!player) return; var t = player.currentTime; pout.textContent = "Capture de l'image…";
        var v = el("video", { muted: true, playsinline: true, preload: "auto" }); v.crossOrigin = "anonymous"; v.muted = true;
        var done = false;
        v.addEventListener("loadedmetadata", function () { v.currentTime = t; });
        v.addEventListener("seeked", function () {
          if (done) return; done = true;
          try {
            var w = Math.min(1600, v.videoWidth), c = document.createElement("canvas"); c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth);
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            c.toBlob(function (bl) {
              var fr = new FileReader();
              fr.onload = function () {
                var path = "data/bibli/img/b/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ".webp";
                save.files.push({ path: path, base64: fr.result.split(",")[1] });
                it.img = rawURL(path); it.edited = true; prevImg(); changed(); drawThumbs();
                pout.textContent = "Vignette remplacée par l'image à " + fmtT(t) + ".";
              };
              fr.readAsDataURL(bl);
            }, "image/webp", .85);
          } catch (e) { pout.textContent = "Capture impossible : " + e.message; }
        });
        v.addEventListener("error", function () { if (!done) pout.textContent = "Capture impossible (la fonction /api/media du site ne répond pas)."; done = true; });
        v.src = SITE + "/api/media?u=" + encodeURIComponent(src);
      }
      // Vignettes possibles : vignette d'origine + stills du film
      var thumbs = el("div", { class: "bthumbs" });
      function drawThumbs() {
        thumbs.textContent = "";
        var l = [orig && orig.img].concat(it.images || (orig && orig.images) || []).filter(Boolean).filter(function (u, k, a) { return a.indexOf(u) === k; }).slice(0, 18);
        if (it.img && l.indexOf(it.img) < 0) l.unshift(it.img);
        l.forEach(function (u) { thumbs.appendChild(el("button", { type: "button", class: u === it.img ? "on" : "", style: 'background-image:url("' + u + '")', title: "Prendre comme vignette", on: { click: function () { it.img = u; it.edited = true; changed(); prevImg(); drawThumbs(); } } })); });
      }
      drawThumbs(); prevImg(); prevMeta(); zlab(); drawSnip();
      // Sous le film (comme sur les pages des chefs op) : galeries de stills et autres vidéos, liens Slate « work » ou shots.re.
      var exBox = el("div", { class: "bexs" }), exIn = el("input", { type: "text", placeholder: "Lien Slate (page de stills ou d'une vidéo, shots.re)" }), exOut = el("p", { class: "hint" });
      function drawEx() {
        exBox.textContent = "";
        (it.extras || []).forEach(function (x, j) {
          var th = el("div", { class: "bithumb" }), u = x.img || (x.stills && x.stills[0]); if (u) th.appendChild(el("i", { style: 'background-image:url("' + u + '")' }));
          exBox.appendChild(el("div", { class: "bit bex" }, [th, el("span", { class: "bitt" }, [x.title || x.link || "", el("small", { text: x.stills ? x.stills.length + " images" : "vidéo" })]),
            el("button", { type: "button", class: "bx", text: "↑", title: "Monter", disabled: j ? null : true, on: { click: function () { var a = it.extras.splice(j, 1)[0]; it.extras.splice(j - 1, 0, a); changed(); drawEx(); } } }),
            el("button", { type: "button", class: "bx", text: "×", title: "Retirer de cette bande", on: { click: function () { it.extras.splice(j, 1); if (!it.extras.length) delete it.extras; changed(); drawEx(); } } })]));
        });
      }
      var exGo = el("button", { type: "button", class: "btn", text: "Ajouter", on: { click: function () {
        var v = exIn.value.trim(); if (!v) return; exGo.disabled = true; exOut.textContent = "Lecture sur Slate" + slateWait("…");
        importStills(v).then(function (d) { (it.extras = it.extras || []).push(extraOf(d)); it.edited = true; exIn.value = ""; exOut.textContent = ""; exGo.disabled = false; changed(); drawEx(); },
          function (e) { exGo.disabled = false; exOut.textContent = "Lecture impossible : " + (e.message || "Slate ne répond pas"); });
      } } });
      exIn.addEventListener("keydown", function (e) { if (e.key === "Enter") exGo.click(); });
      drawEx();
      var aw = el("textarea", { rows: 3, placeholder: "Une ligne par prix ou sélection (ex. Best Cinematography, Camerimage 2026)" }); aw.value = it.awards || "";
      aw.addEventListener("input", function () { it.awards = aw.value.trim(); if (!it.awards) delete it.awards; it.edited = true; changed(); });
      box.appendChild(el("span", { class: "label", text: "Retouches pour cette bande seulement · enregistrées toutes seules" }));
      box.appendChild(el("div", { class: "bmgrid" }, [
        el("div", {}, [].concat(
          fld("Titre", function () { return it.title; }, function (v) { it.title = v; }),
          fld("Réal", function () { return it.dir; }, function (v) { it.dir = v; }),
          fld("Prod", function () { return it.prod; }, function (v) { it.prod = v; }),
          fld("Chefs op", function () { return (it.dops || []).join(", "); }, function (v) { it.dops = list2(v); }, "séparés par des virgules"),
          fld("Types de contenu", function () { return (it.types || it.cats || []).join(", "); }, function (v) { it.types = list2(v); }, "ex. Commercial, Beauty"),
          [orig ? el("button", { type: "button", class: "btn ghost", text: "Tout remettre comme dans la bibliothèque", on: { click: function () {
            var keepKey = it.key; band.items[i] = bandItem(orig); band.items[i].key = keepKey; changed(); close();
          } } }) : null])),
        el("div", {}, [el("span", { class: "label", text: "Aperçu (survol = extrait)" }), pv, el("span", { class: "label", text: "Recadrage" }), zoom, zl, el("label", { class: "bck", title: "Comme la case de recadrage des pages : sinon seulement l'extrait" }, [thumbCk, " Recadrer aussi la vignette"]),
          el("span", { class: "label", text: "Vignette" }), thumbs])]));
      box.appendChild(el("div", { class: "bmgrid" }, [
        el("div", {}, [el("span", { class: "label", text: "Sous le film : stills et autres vidéos" }), exBox, el("div", { class: "row" }, [el("div", { class: "grow" }, [exIn]), exGo]), exOut]),
        el("div", {}, [el("span", { class: "label", text: "Prix et sélections" }), aw])]));
      if (player) box.appendChild(el("div", { class: "bplay" }, [el("span", { class: "label", text: "Le film : image par image avec les flèches ← → (Maj = 1 s) · vignette, début et fin de l'extrait" }), player, tl, tools, pout, snipLine]));
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn primary", text: "OK", on: { click: close } })]));
      ov.appendChild(box); document.body.appendChild(ov);
    }

    // ---------- Imports ----------
    function modal(title, kids) {
      var ov = el("div", { class: "bmodal" }), box = el("div", { class: "bmbox small" }, [el("span", { class: "label", text: title })].concat(kids));
      ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
      box.appendChild(el("div", { class: "fwbtns" }, [el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: function () { ov.remove(); } } })]));
      ov.appendChild(box); document.body.appendChild(ov); return ov;
    }
    function libSave(items, msgEl) {
      return commit([{ path: BIB_LIB, edit: function (t) {
        var l = t ? JSON.parse(t) : { items: [] }; l.items = l.items || [];
        items.forEach(function (it) { var c = Object.assign({}, it); delete c._files; l.items = l.items.filter(function (x) { return x.key !== c.key; }); l.items.push(c); });
        return json(l);
      } }].concat(items.reduce(function (a, it) { return a.concat(it._files || []); }, [])), "Bibliothèque : " + items.length + " ajout" + (items.length > 1 ? "s" : "") + " (admin, " + (user && user.login || "") + ")");
    }
    function importVideo() {
      var link = el("input", { type: "text", placeholder: "Lien Slate : bundle, shots.re, page d'une vidéo ou de stills" }), out = el("p", { class: "hint" });
      var go = el("button", { type: "button", class: "btn primary", text: "Lire le lien", on: { click: function () {
        if (!canWeb) { out.textContent = "Lecture seule : cette clé ne peut pas ajouter à la bibliothèque."; return; }
        var v = link.value.trim(); if (!v) return; go.disabled = true; out.textContent = "Lecture sur Slate" + slateWait("…");
        var isBundle = /\/bundles\//.test(v) || /^(https?:\/\/)?(shots|slt)\.re\//i.test(v);
        (isBundle ? importBundle(v).then(function (d) { return (d.clips || []).map(function (c) { return { slate: c.slate, title: c.title, sub: c.sub, video: c.video, full: c.full, img: c.img, cats: [c.cat].concat(c.types || []), dops: c.artists || (d.name ? [d.name] : []) }; }); })
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
            return libSave(items).then(function () { out.textContent = items.length + " film" + (items.length > 1 ? "s" : "") + " ajouté" + (items.length > 1 ? "s" : "") + " à la bibliothèque."; go.disabled = false; return bibLoad(true); }).then(function (d) { data = d; draw(); });
          }).catch(function (e) { go.disabled = false; out.textContent = "Lecture impossible : " + (e.message || "Slate ne répond pas"); });
      } } });
      // Fichier depuis l'ordinateur : vérifié ici (poids, durée, taille, lisible par les navigateurs) ; l'envoi attend l'hébergement.
      var fin = el("input", { type: "file", accept: "video/*" }), chk = el("div", { class: "bchk" });
      fin.addEventListener("change", function () {
        var f = fin.files[0]; chk.textContent = ""; if (!f) return;
        var lines = [f.name + " · " + (f.size / 1e9 >= 1 ? (f.size / 1e9).toFixed(2) + " Go" : Math.round(f.size / 1e6) + " Mo")];
        if (f.size > 10e9) lines.push("✗ Plus de 10 Go : trop lourd pour le robot d'encodage.");
        else if (f.size > 2e9) lines.push("! Plus de 2 Go (votre limite habituelle).");
        var vid = el("video", { muted: true, playsinline: true, preload: "metadata" }), url = URL.createObjectURL(f);
        vid.addEventListener("loadedmetadata", function () {
          lines.push("Durée " + Math.floor(vid.duration / 60) + " min " + String(Math.round(vid.duration % 60)).padStart(2, "0") + " · " + vid.videoWidth + " × " + vid.videoHeight + " · débit moyen ≈ " + (f.size * 8 / vid.duration / 1e6).toFixed(1) + " Mb/s");
          vid.currentTime = Math.min(3, vid.duration / 3);
        });
        vid.addEventListener("seeked", function () {
          var c = document.createElement("canvas"); c.width = 320; c.height = Math.round(320 * vid.videoHeight / vid.videoWidth) || 180;
          c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height); chk.appendChild(c); done();
        });
        vid.addEventListener("error", function () { lines.push("Pas lisible par les navigateurs (ProRes, HEVC… ?) : le robot d'encodage le convertira."); done(); });
        function done() { chk.insertBefore(el("p", { class: "hint" }, lines.map(function (t, i) { return el("span", {}, [i ? el("br") : null, t]); })), chk.firstChild);
          chk.appendChild(el("p", { class: "hint", text: "Envoi des vidéos depuis l'ordinateur : pas encore branché (il faut d'abord l'hébergement des vidéos, étude « remplacer Slate »). Pour l'instant : vérification seulement." })); }
        vid.src = url;
      });
      modal("Ajouter une vidéo", [el("span", { class: "label", text: "Depuis Slate" }), el("div", { class: "row" }, [el("div", { class: "grow" }, [link]), go]), out,
        el("span", { class: "label", text: "Depuis l'ordinateur" }), fin, chk]);
    }
    function importImages() {
      var title = el("input", { type: "text", placeholder: "Titre de la série (ex. Fatherland | Stills)" }), dop = el("input", { type: "text", placeholder: "Chef op", list: "bibdops" });
      var dl = el("datalist", { id: "bibdops" }, (data ? data.sug.filter(function (s) { return s.type === "dop"; }) : []).map(function (s) { return el("option", { value: s.value }); }));
      var fin = el("input", { type: "file", accept: "image/*", multiple: true }), grid = el("div", { class: "bimggrid" }), out = el("p", { class: "hint" }), files = [];
      fin.addEventListener("change", function () {
        var l = Array.from(fin.files).sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
        out.textContent = "Compression de " + l.length + " images…";
        l.reduce(function (p, f) { return p.then(function () { return compress(f).then(function (c) { files.push(c); grid.appendChild(el("img", { src: c.preview })); }); }); }, Promise.resolve())
          .then(function () { out.textContent = files.length + " images prêtes (" + Math.round(files.reduce(function (a, c) { return a + c.size; }, 0) / 1e6) + " Mo)."; }, function (e) { out.textContent = e.message; });
      });
      var save = el("button", { type: "button", class: "btn primary", text: "Enregistrer la série", on: { click: function () {
        if (!canWeb) { out.textContent = "Lecture seule : cette clé ne peut pas ajouter à la bibliothèque."; return; }
        if (!files.length || !title.value.trim()) { out.textContent = "Il faut un titre et des images."; return; }
        save.disabled = true; out.textContent = "Envoi…";
        var id = Date.now().toString(36), base = "data/bibli/img/" + id + "/", urls = files.map(function (c, i) { return rawURL(base + String(i + 1).padStart(3, "0") + ".webp"); });
        var it = { key: "i" + id, kind: "images", title: title.value.trim(), dops: dop.value.trim() ? [dop.value.trim()] : [], cats: ["Stills"], images: urls, img: urls[0], src: "upload", at: new Date().toISOString(), by: user && user.login || "",
          _files: files.map(function (c, i) { return { path: base + String(i + 1).padStart(3, "0") + ".webp", base64: c.base64 }; }) };
        var keepF = it._files;
        libSave([it]).then(function () { delete it._files; out.textContent = "Série enregistrée (" + keepF.length + " images)."; return bibLoad(true); }).then(function (d) { data = d; draw(); }, function (e) { save.disabled = false; out.textContent = "Pas enregistré : " + e.message; });
      } } });
      modal("Ajouter une suite d'images", [dl, el("span", { class: "label", text: "Titre" }), title, el("span", { class: "label", text: "Chef op" }), dop, el("span", { class: "label", text: "Images (dans l'ordre des noms de fichiers)" }), fin, grid, out, el("div", { class: "fwbtns" }, [save])]);
    }
    undoReset(); drawBand();
  }

  function route() {
    var h = location.hash;
    document.getElementById("back").hidden = !token || !/^#\/(dp\/|new)/.test(h);
    var page = /^#\/(home|spotlight|fiction|press|contact|festivals|selections|sorties|recup|bibli)$/.test(h) ? h.slice(2) : /^#\/(dops|dp\/.*|new)$/.test(h) ? "cinematographers" : "hello";
    side.hidden = !token;
    document.body.classList.remove("bibpage");
    if (token && !festTried) { festTried = true; festLoad().then(festBadge, function () {}); } if (token && !ficTried) { ficTried = true; ficBadgeLoad(); } // pastille « fiction » : autre date de sortie trouvée // pastille du menu (dates limites proches)
    side.querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.page === page); });
    var cur = side.querySelector("a.on"), grp = cur && cur.closest(".ssub");
    // Rubrique de la page ouverte : dépliée et sélectionnée ; page hors rubrique (sorties, récupération…) : tout est replié (Gus 18/11).
    sideOpen(grp ? grp.dataset.group : null, true);
    side.querySelectorAll("button.sgroup").forEach(function (b) { b.classList.toggle("on", !!grp && b.dataset.group === grp.dataset.group); });
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
    if (page === "bibli") return showBibli();
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
