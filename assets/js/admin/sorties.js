// Sorties fiction
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

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
    var nt = trUnseen().length, nc = sortConflicts(sorties, fic).length, n = nt + nc, b = a.querySelector(".nbadge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = el("span", { class: "nbadge" }); a.appendChild(b); }
    b.textContent = n; b.title = [nt ? nt + " nouvelle(s) bande(s)-annonce(s)" : "", nc ? nc + " date(s) de sortie à vérifier" : ""].filter(Boolean).join(" · ");
  }
  // Source d'une date de sortie, en clair.
  function sortSrc(r) {
    return r.source === "human" ? "confirmée par " + (r.by || "l'équipe") : r.source === "tmdb" ? "TMDB" : r.source === "wikidata" ? "Wikidata"
      : r.source === "claude" ? (/allocine/i.test(r.url || "") ? "AlloCiné (recherche Claude)" : "recherche Claude") : r.source === "fiction" ? "page fiction" : String(r.source || "");
  }
  // Dates de sortie qui ne s'accordent pas (Gus 23/11 : « une notif si un film trouvé a une différence, je confirme une date, et dès
  // qu'une date change tu renvoies une notif »). Films hors page fiction (eux : alerte sur la page fiction, ficAlerts). Par film :
  // - pas de date confirmée et les robots (TMDB, Wikidata, AlloCiné) donnent des dates différentes ;
  // - date confirmée (`source: "human"`) et un robot en donne une autre, pas encore refusée (`seenDates`).
  // Seulement les films dont une date est à venir ou de moins de 30 jours.
  function sortConflicts(so, f0) {
    var lim = sortIso(new Date(Date.now() - 30 * 864e5)), ficT = [];
    ((f0 && f0.films) || []).forEach(function (f) { ficT.push(ficTitle(((f0.overrides || {})[f.slate] || {}).title || f.title)); });
    var groups = {};
    ((so && so.releases) || []).forEach(function (r) {
      if (!r.date || r.source === "youtube" || sortHid(r, so) || ficT.some(function (t) { return sortSame(t, r.title); })) return;
      var k = r.key || sortNrm(r.title); (groups[k] = groups[k] || []).push(r);
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var l = groups[k], hum = l.filter(function (r) { return r.source === "human"; }).sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); })[0];
      var bots = l.filter(function (r) { return r.source !== "human"; });
      if (!l.some(function (r) { return r.date >= lim; })) return;
      var seen = (hum && hum.seenDates) || [], d = {};
      bots.forEach(function (r) { d[r.date] = 1; });
      var pend = hum ? bots.filter(function (r) { return r.date !== hum.date && seen.indexOf(r.date) < 0; }) : [];
      if (hum ? pend.length : Object.keys(d).length > 1) out.push({ key: k, title: (hum || bots[0]).title, human: hum, bots: bots });
    });
    return out.sort(function (a, b) { return a.title.localeCompare(b.title, "fr"); });
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
      var humK = {}; ((sorties && sorties.releases) || []).forEach(function (r) { if (r.source === "human") humK[r.key || nrm(r.title)] = 1; });
      ((sorties && sorties.releases) || []).forEach(function (r) {
        if (r.source !== "human" && humK[r.key || nrm(r.title)]) return; // date confirmée par l'équipe : elle seule dans le calendrier (Gus 23/11)
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
    function match(e) { var w = nrm(st.q).split(" ").filter(Boolean); if (!w.length) return true; var h = hay(e); return h.indexOf(w.join(" ")) > -1; }
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
      // Dates de sortie qui ne s'accordent pas (Gus 23/11) : choisir la bonne (elle devient confirmée), ou garder la nôtre.
      var cf = sortConflicts(sorties, fic);
      if (cf.length) {
        var cb = el("div", { class: "trnew sortcf" }, [el("h3", { text: cf.length > 1 ? cf.length + " dates de sortie à vérifier" : "Date de sortie à vérifier" })]);
        cf.forEach(function (c) {
          var by = {}; c.bots.forEach(function (r) { (by[r.date] = by[r.date] || []).push(r); });
          var hum = c.human, msg = el("span", { class: "fmsg" });
          var rows = Object.keys(by).sort().map(function (d) {
            var rs = by[d], same = hum && hum.date === d;
            return el("div", { class: "sortcfd" }, [el("span", {}, [el("b", { text: fdate(d) }), " — " + rs.map(sortSrc).join(", ") + (rs[0].platform ? " · " + rs[0].platform : "") + (rs[0].country ? " · " + rs[0].country : "") + " "].concat(
                rs.filter(function (r) { return r.url; }).slice(0, 2).map(function (r) { return el("a", { href: r.url, target: "_blank", rel: "noopener", text: "source ↗" }); }))),
              same ? el("span", { class: "hint", text: "= notre date" }) : el("button", { type: "button", class: "btn" + (hum ? "" : " primary"), text: hum ? "Utiliser cette date" : "C'est cette date", on: { click: function (e) {
                e.target.disabled = true; msg.textContent = "Enregistrement…";
                var all = Object.keys(by), r0 = rs[0];
                var y = hum ? JSON.parse(JSON.stringify(hum)) : { id: "s" + Date.now().toString(36), key: c.key, title: c.title, project: r0.project, slate: r0.slate, source: "human", was: r0.source };
                Object.assign(y, { date: d, kind: r0.kind, platform: r0.platform, country: r0.country, url: r0.url, by: user && user.login || "", at: new Date().toISOString() });
                y.seenDates = (y.seenDates || []).concat(all).filter(function (v, i, a) { return a.indexOf(v) === i && v !== d; });
                sortSave(hum || null, y, c.title + " : date " + fdate(d) + " confirmée").then(function () { build(); draw(); }, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
              } } })]);
          });
          var keep = hum ? el("button", { type: "button", class: "btn ghost", text: "Garder la nôtre (" + fdate(hum.date) + ")", on: { click: function (e) {
            e.target.disabled = true; var y = JSON.parse(JSON.stringify(hum));
            y.seenDates = (y.seenDates || []).concat(Object.keys(by)).filter(function (v, i, a) { return a.indexOf(v) === i && v !== hum.date; });
            sortSave(hum, y, c.title + " : date gardée").then(function () { build(); draw(); }, function (er) { e.target.disabled = false; msg.textContent = "Pas enregistré : " + er.message; });
          } } }) : null;
          cb.appendChild(el("div", { class: "tritem sortcfi" }, [el("div", {}, [el("b", { text: c.title }),
            el("span", { class: "hint", text: hum ? "Notre date : " + fdate(hum.date) + " (" + sortSrc(hum) + "). Un robot en a trouvé une autre :" : "Les sources ne sont pas d'accord. Laquelle est la bonne ?" })].concat(rows)),
            el("div", { class: "fwbtns" }, [keep, msg])]));
        });
        box.appendChild(cb);
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
          x.source === "tmdb" || x.source === "claude" || x.source === "wikidata" ? el("button", { type: "button", class: "btn primary", text: "Confirmer", title: "Date vérifiée : gardée pour toujours dans nos archives", on: { click: function (e) {
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
