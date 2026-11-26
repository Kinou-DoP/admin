// Bibliothèque / video club (1/2) : données, bandes chiffrées, glisser (bibFly)
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

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
  var BIB_EDITS = "data/bibli/edits.json", BIB_EK = ["title", "dir", "prod", "dops", "roles", "types", "full", "video", "images", "img", "snip", "snipVideo", "thumbT", "hist", "crop", "extras", "awards", "enc", "pend", "client", "cshow", "scrop", "ipos", "ihide", "grp", "gi"];
  var BIB_SLATE = "bibli/slate.json"; // dépôt notes : tous les films de Slate (liste privée, 25/11)
  var BIB_LIB = "data/bibli/library.json", BIB_META = "bibli/meta.json", BANDS = "data/bandes/", BAND_PUB = "data/b/", BAND_KEY = "kinou-bande-draft";
  var BAND_NOTES = "bandes/", BAND_SALT = "kinou-bande-v1", BAND_IT = 150000;
  var bibCache = null, bibKey = null, edUndo = new WeakMap();
  document.addEventListener("keydown", function (e) { if (bibKey) bibKey(e); });
  // Aperçu d'un film avec navigation (Gus 26/11) : ‹ › = film d'avant / d'après dans la liste affichée (flèches du clavier aussi),
  // « + » au milieu = ajouter à la bande active (video club) ou à l'onglet ouvert (« Modifier la sélection »). Échap / clic à côté.
  // o = { add(f), has(f), addLabel }
  function navPlayer(list, i, o) {
    list = list && list.length ? list : []; i = Math.max(0, Math.min(list.length - 1, i || 0));
    var ov = el("div", { class: "bmodal bplayer" }), v = null;
    function close() { if (v) v.pause(); ov.classList.add("out"); setTimeout(function () { ov.remove(); }, 160); document.removeEventListener("keydown", key, true); }
    function key(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !(e.target && e.target.matches && e.target.matches("input, textarea"))) { e.preventDefault(); e.stopPropagation(); go(e.key === "ArrowLeft" ? -1 : 1); }
    }
    function go(d) { var j = i + d; if (j < 0 || j >= list.length) return; i = j; draw(); }
    function draw() {
      if (v) v.pause(); ov.textContent = "";
      var f = list[i], src = f.full || f.video; v = src ? el("video", { controls: true, autoplay: true, playsinline: true, poster: f.img || null }) : null; if (v) v.src = src;
      var dops = f.dops || [], ro = f.roles || {}, main = dops.filter(function (d) { return !ro[d]; }), oth = dops.filter(function (d) { return ro[d]; });
      var cred = [f.dir ? "Directed by " + f.dir : "", f.prod, main.length ? "DoP " + main.join(" & ") : ""].concat(oth.map(function (d) { return ro[d] + " " + d; })).filter(Boolean);
      var meta = [f.client ? "Client : " + f.client : "", (f.types || []).join(", "), f.at ? String(f.at).slice(0, 10) : ""].filter(Boolean).join(" · ");
      var gal = (f.images || []).length && !src ? el("div", { class: "bimggrid" }, f.images.map(function (u) { return el("img", { src: u, loading: "lazy" }); })) : null;
      // « + Ajouter à la bande » devient « − Retirer de la bande » (Gus 26/11) ; seul le bouton change : la vidéo ne repart plus (avant, tout était redessiné).
      var addB = null;
      if (o && o.add) {
        addB = el("button", { type: "button", class: "btn" });
        var paintB = function () {
          var h = !!(o.has && o.has(f)); addB.className = "btn" + (h ? " ghost" : " primary");
          addB.textContent = h ? (o.remove ? "− " + (o.removeLabel || "Retirer de la bande") : "✓ " + (o.inLabel || "Déjà ajouté")) : "+ " + (o.addLabel || "Ajouter"); addB.disabled = h && !o.remove ? true : null;
        };
        addB.repaint = function () { paintB(); };
        addB.addEventListener("click", function () { if (o.has && o.has(f)) { if (o.remove) o.remove(f); } else o.add(f, addB); paintB(); });
        paintB();
      }
      // Onglets (Gus 26/11) : petits boutons « onglet » (ajouter / retirer) et « + » (créer un onglet avec ce film), sans quitter l'aperçu ni relancer la vidéo.
      var tabsRow = null;
      if (o && o.tabs) {
        tabsRow = el("div", { class: "bptabs" });
        var drawT = function () {
          tabsRow.textContent = ""; tabsRow.appendChild(el("span", { text: "Onglets" }));
          o.tabs.list(f).forEach(function (t, k) { tabsRow.appendChild(el("button", { type: "button", class: t.on ? "on" : "", title: (t.on ? "Retirer de « " : "Ajouter à « ") + t.name + " »", text: (t.on ? "✓ " : "+ ") + t.name, on: { click: function () { o.tabs.toggle(k, f); drawT(); if (addB && addB.repaint) addB.repaint(); } } })); });
          tabsRow.appendChild(el("button", { type: "button", class: "bpnew", title: "Créer un onglet avec ce film", text: "+", on: { click: function () { if (o.tabs.create(f)) drawT(); } } }));
        };
        drawT();
      }
      var nav = el("div", { class: "bpnav" }, [
        el("button", { type: "button", class: "btn ghost", text: "‹", title: "Film d'avant (←)", disabled: i ? null : true, on: { click: function () { go(-1); } } }),
        addB || el("span"), el("span", { class: "bpcount", text: (i + 1) + " / " + list.length }),
        el("button", { type: "button", class: "btn ghost", text: "›", title: "Film d'après (→)", disabled: i < list.length - 1 ? null : true, on: { click: function () { go(1); } } })]);
      ov.appendChild(el("div", { class: "bpwrap" }, [el("div", { class: "bpbox" }, [el("div", { class: "bphead" }, [el("strong", { text: f.title || "" }),
        el("button", { type: "button", class: "bx", text: "×", title: "Fermer", on: { click: close } })]), tabsRow, v || gal || el("div", { class: "bthumb", style: 'background-image:url("' + (f.img || "") + '")' }),
        el("p", { class: "hint", text: cred.join(" · ") }), meta ? el("p", { class: "hint bpmeta", text: meta }) : null, nav])]));
    }
    document.addEventListener("keydown", key, true);
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.classList.contains("bpwrap")) close(); });
    draw(); document.body.appendChild(ov);
  }
  function bnrm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ł/g, "l").replace(/\s+/g, " ").trim(); }
  // Une seule lecture à la fois (Gus 26/11 : le bouton « edit » d'une fiche mettait du temps) : la page d'un chef op la lance en avance, le bouton « edit » la réutilise.
  var bibPend = null;
  function bibLoad(force) {
    if (bibCache && !force) return Promise.resolve(bibCache);
    if (bibPend && !force) return bibPend;
    var p = bibLoadRaw(force), clr = function () { if (bibPend === p) bibPend = null; }; bibPend = p; p.then(clr, clr); return p;
  }
  function bibLoadRaw(force) {
    if (bibCache && !force) return Promise.resolve(bibCache);
    var map = {}, order = [], pages = [];
    function add(f, from) {
      if (f.slate && !/^\d+$/.test(f.slate)) f = Object.assign({}, f, { key: f.slate, slate: null }); // import du video club placé dans une page
      var k = f.slate ? "s" + f.slate : f.key || "u" + (f.full || f.video || f.img || f.title); // imports d'images : leur clé « i… »
      var o = map[k];
      if (!o) { o = map[k] = { key: k, slate: f.slate || null, title: "", dir: "", prod: "", dops: [], cats: [], types: [], video: "", full: "", img: "", images: null, pages: [], at: "" }; order.push(o); }
      ["title", "dir", "prod", "video", "full", "img", "at", "link", "client"].forEach(function (x) { if (!o[x] && f[x]) o[x] = f[x]; });
      if (!o.images && f.images && f.images.length) o.images = f.images;
      if (!o.extras && f.extras && f.extras.length) o.extras = f.extras; // stills et vidéos sous le film (lecteur)
      if (!o.awards && f.awards) o.awards = f.awards; // prix et sélections (une ligne chacun)
      if (!o.crop && f.crop) o.crop = f.crop; // recadrage réglé sur la page (point de départ dans les bandes)
      if (!o.snip && f.snip) o.snip = f.snip; // extrait d'un film envoyé depuis l'ordinateur (encodage, { s, d, v })
      ['size', 'ws', 'os', 'dur', 'w', 'h', 'by', 'mkey', 'montage', 'src'].forEach(function (x) { if (f[x] !== undefined && o[x] === undefined) o[x] = f[x]; }); // fichier : poids, durée, taille, qui l'a importé
      if (f.grp && !o.grp) { o.grp = f.grp; o.gi = f.gi || 0; } // vidéos importées ensemble
      if (f.enc && !o.full) o.enc = f.enc; // film envoyé depuis l'ordinateur, encodage pas encore terminé
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
    return Promise.all([loadIndex(), raw("fiction.json"), raw("spotlight.json"), raw("home.json"), readFile(BIB_LIB).catch(function () { return null; }), raw(BIB_META), readFile(BIB_EDITS).catch(function () { return null; }),
      // Tous les films de Slate (Gus 25/11), y compris ceux qui ne sont sur aucune page : liste privée du dépôt notes
      // (bibli/slate.json : titres, crédits, clients, adresses ; jamais dans ce dépôt public). Sans accès à notes : pages seules.
      gh("/repos/" + NOTES_REPO + "/contents/" + BIB_SLATE, { raw: true, allow404: true }).then(function (t) { return t ? JSON.parse(t) : null; }).catch(function () { return null; })]).then(function (r) {
      var idx = r[0], lib = r[4], meta = (r[5] && r[5].films) || {}, edits = (r[6] && r[6].films) || {};
      ((lib && lib.items) || []).slice().reverse().forEach(function (it) { add(it, null); });
      return Promise.all((idx.dps || []).map(function (d) { return raw("dps/" + d.slug + ".json").then(function (f) { return [d, f]; }); })).then(function (fs) {
        fs.forEach(function (x) {
          var d = x[0], f = x[1]; if (!f) return;
          var ov = f.overrides || {};
          // Page du site = bundle de la filmothèque, chaque onglet = une bande (Gus 25/11) : liste pour « Bundles » / « Bandes existantes ».
          pages.push({ slug: d.slug, name: d.name, hidden: !!d.hidden, tabs: (f.categories || []).map(function (cat) {
            var l = (f.clips || []).filter(function (c) { return cat === "FEATURED" ? c.featured : c.cat === cat; });
            if (cat === "FEATURED") l.sort(function (a, b) { return a.featuredOrder - b.featuredOrder; });
            return { name: cat, n: l.length, img: l[0] && l[0].img };
          }) });
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
        // Puis tous les films de Slate : ne complète que ce que les pages n'ont pas (les infos des pages restent prioritaires).
        ((r[7] && r[7].films) || []).forEach(function (f) { add(f, null); if (f.client && map["s" + f.slate] && !map["s" + f.slate].client) map["s" + f.slate].client = f.client; });
        // Infos de Slate (robot) : client, types de contenu, mots-clés (recherche libre seulement).
        order.forEach(function (f) {
          var m = f.slate && meta[f.slate]; if (!m) return;
          if (m.client) f.client = m.client;
          if (m.date) f.date = m.date; // date sur Slate
          add({ slate: f.slate, types: m.types || [] }, null);
          f.tags = m.tags || [];
        });
        // Infos retouchées dans la bibliothèque (edits.json) par-dessus celles des pages ; _orig garde celles des pages.
        order.forEach(function (f) { if (edits[f.key]) bibApply(f, edits[f.key]); });
        bibGroups(order);
        // Les plus récents en haut (Gus 22/11) : imports sans id Slate (images) d'abord, puis id Slate décroissant (= ordre d'ajout sur Slate).
        order.sort(function (a, b) { return (b.slate ? 0 : 1) - (a.slate ? 0 : 1) || (b.slate || 0) - (a.slate || 0) || String(b.at).localeCompare(String(a.at)); });
        // Index des suggestions : chef op, réal, prod, client, type de contenu, catégorie (pas les films, Gus 22/11).
        var sug = {};
        function put(type, v) { v = String(v || "").trim(); if (!v || v.length < 2) return; var k = type + "|" + bnrm(v); (sug[k] = sug[k] || { type: type, value: v, n: 0 }).n++; }
        order.forEach(function (f) {
          bibHay(f);
          f.dops.forEach(function (d) { put("dop", d); });
          bibDirs(f).forEach(function (d) { put("dir", d); });
          bibProds(f).forEach(function (x) { put("prod", x); }); put("client", f.client); f.types.forEach(function (c) { put("type", c); }); f.cats.forEach(function (c) { put("cat", c); });
        });
        bibCache = { films: order, sug: Object.keys(sug).map(function (k) { return sug[k]; }), lib: lib || { items: [] }, pages: pages };
        return bibCache;
      });
    });
  }
  // Vidéos importées ensemble (Gus 26/11) : chacune montre sous elle toutes celles du lot, dans le même ordre pour toutes ; sa propre ligne est
  // marquée `self` (visible dans la fenêtre d'infos, pas montrée sur le site). Recalculé à chaque lecture (titres et vignettes à jour) tant que
  // les lignes n'ont pas été modifiées à la main (lignes `auto`).
  function bibGroups(order) {
    var gs = {}; order.forEach(function (f) { if (f.grp) (gs[f.grp] = gs[f.grp] || []).push(f); });
    Object.keys(gs).forEach(function (g) {
      var ms = gs[g].sort(function (a, b) { return (a.gi || 0) - (b.gi || 0); }); if (ms.length < 2) return;
      ms.forEach(function (m) {
        var prev = {}; (m.extras || []).forEach(function (e) { if (e.key) prev[e.key] = e; });
        var ex = ms.map(function (z) { var n = extraFromFilm(z); n.auto = true; if (z === m) n.self = true; if (prev[z.key] && prev[z.key].hide) n.hide = prev[z.key].hide.slice(); return n; }).filter(function (n) { return n.full || n.video || n.self; }); // « masqué ici » gardé
        if (ex.length < 2) return;
        // Lignes réglées à la main (ajoutées, retirées, ou à vous) : gardées. Mêmes films que le lot (même si l'ordre diffère) : lien repris, ordre du lot.
        var cur = m.extras || [];
        if (cur.length && !(cur.every(function (e) { return e.key; }) && cur.map(function (e) { return e.key; }).sort().join() === ex.map(function (n) { return n.key; }).sort().join())) return;
        m.extras = ex; if (m._orig) m._orig.extras = JSON.parse(JSON.stringify(ex.map(function (n) { var c = Object.assign({}, n); delete c.hide; return c; })));
      });
    });
  }
  // Petit logo « lien » (Gus 26/11) : vidéos importées ensemble = liées. Liste du video club et fenêtre d'un film.
  function linkIcon(n) {
    var x = document.createElementNS("http://www.w3.org/2000/svg", "svg"); x.setAttribute("viewBox", "0 0 24 24"); x.setAttribute("width", "13"); x.setAttribute("height", "13");
    x.setAttribute("fill", "none"); x.setAttribute("stroke", "currentColor"); x.setAttribute("stroke-width", "2"); x.setAttribute("stroke-linecap", "round"); x.setAttribute("stroke-linejoin", "round");
    x.innerHTML = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
    var w = document.createElement("span"); w.className = "blinkic"; w.title = "Liée à " + (n - 1) + " autre" + (n > 2 ? "s" : "") + " vidéo" + (n > 2 ? "s" : "") + " (importées ensemble)"; w.appendChild(x); return w;
  }
  function grpCount(f) { return f.grp && bibCache ? bibCache.films.filter(function (x) { return x.grp === f.grp; }).length : 0; }
  function bibHay(f) { f.hay = bnrm([f.title, f.dir, f.prod, f.client, f.dops.join(" "), f.cats.join(" "), f.types.join(" "), (f.tags || []).join(" ")].join(" ")); }
  function bibApply(f, e) {
    if (!f._orig) { f._orig = {}; BIB_EK.forEach(function (k) { f._orig[k] = f[k] === undefined ? undefined : JSON.parse(JSON.stringify(f[k])); }); }
    BIB_EK.forEach(function (k) { if (e[k] !== undefined) f[k] = JSON.parse(JSON.stringify(e[k])); });
    f.dops = f.dops || []; f.types = f.types || []; f.libEdited = true;
  }
  // Extrait en cours de réglage pas encore validé (Gus 22/11 : « Valider ») : jamais enregistré, on garde l'extrait validé.
  function snipOk(x, c) { if (x._snipTmp) { if (x._snipSaved) c.snip = x._snipSaved; else delete c.snip; } return c; }
  function bibDirs(f) { return String(f.dir || "").split(/\s*,\s*|\s+&\s+/).filter(Boolean); }
  function bibProds(f) { return String(f.prod || "").split(/\s*,\s*/).filter(Boolean); } // plusieurs prods = séparées par une virgule
  var BIB_T = { dop: "Chef op", dir: "Réal", prod: "Prod", client: "Client", type: "Type de contenu", cat: "Catégorie" };
  var BIB_ORDER = ["dop", "dir", "prod", "client", "type", "cat"];
  function bibMatch(f, c) {
    var v = bnrm(c.value);
    if (c.type === "dop") return f.dops.some(function (d) { return bnrm(d) === v; });
    if (c.type === "dir") return bibDirs(f).some(function (d) { return bnrm(d) === v; });
    if (c.type === "prod") return bibProds(f).some(function (x) { return bnrm(x) === v; });
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
    if (f.images && f.images.length && (f.ihide || []).indexOf("club") < 0) o.images = f.images.slice();
    if (f.extras && f.extras.length) o.extras = JSON.parse(JSON.stringify(f.extras)).filter(function (x) { return !xHidden(x, "club") && !x.self; }).map(function (x) { delete x.hide; return x; }); // lignes masquées dans le video club : pas dans les bandes
    if (f.awards) o.awards = f.awards;
    if (f.crop) o.crop = Object.assign({}, f.crop);
    if (f.snip) o.snip = Object.assign({}, f.snip);
    if (f.snipVideo) o.snipVideo = f.snipVideo;
    if (f.thumbT !== undefined) o.thumbT = f.thumbT;
    if (f.client && f.cshow !== false) o.client = f.client; // client affiché avant le titre (sauf case décochée)
    if (f.scrop) o.scrop = JSON.parse(JSON.stringify(f.scrop));
    if (f.ipos) o.ipos = f.ipos;
    if (f.hist) o.hist = JSON.parse(JSON.stringify(f.hist));
    if (f.roles) o.roles = Object.assign({}, f.roles);
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
    if (tries === undefined) return track(nPut(path, text, msg, 0), true);
    return gh("/repos/" + NOTES_REPO + "/contents/" + path, { method: "PUT", body: { message: msg, content: b64enc(text), sha: nSha[path] || undefined } })
      .then(function (r) { nSha[path] = r.content.sha; }, function (e) {
        if ((tries || 0) >= 2 || !/GitHub (409|422)/.test(e.message)) throw e;
        return nGet(path).then(function () { return nPut(path, text, msg, (tries || 0) + 1); });
      });
  }
  function nEdit(path, fn, msg, tries) { // relit puis modifie (liste des bandes : plusieurs personnes)
    if (tries === undefined) return track(nEdit(path, fn, msg, 0), true);
    return nGet(path).then(function (t) {
      var n = fn(t); if (n === null) return;
      return nPut(path, n, msg, 2).catch(function (e) { if ((tries || 0) >= 2 || !/GitHub (409|422)/.test(e.message)) throw e; return nEdit(path, fn, msg, (tries || 0) + 1); });
    });
  }
  // Ghost qui suit la souris avec un petit effet physique (ressort, penche selon la vitesse) ; plusieurs films = un paquet d'images.
  function bibFly(ev, imgs, n) {
    var fly = el("div", { class: "bfly" }), cards = [], x = ev.clientX, y = ev.clientY;
    imgs.slice(0, 3).forEach(function (u, i) {
      var c = el("div", { class: "bflyc" }); if (u) c.style.backgroundImage = 'url("' + imgShow(u) + '")';
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
