// Fiche d'un chef op (1/3) : annuler / rétablir, showDP, notes, identité, infos robot
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

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
    Promise.all([index ? index : loadIndex(), slug ? readFile("data/dps/" + slug + ".json") : null, loadProgress().catch(function () { progress = {}; }), vcLoad()]).then(function (r) {
      var entry = slug && index.dps.filter(function (d) { return d.slug === slug; })[0];
      isNew = !r[1]; listed = !!entry; pending = {}; origSlug = listed || !isNew ? slug : null; // adresse actuelle
      state = r[1] || { slug: slug || "", name: entry ? entry.name : "", hue: 0, overrides: {}, about: {} };
      state.overrides = state.overrides || {}; state.about = state.about || {}; dirty = false; histReset(); ovBase = sharedSnap(state.overrides); notesFor = null; // notes relues à chaque ouverture
      slate = state.clips ? { name: state.name, categories: state.categories || [], clips: state.clips } : null;
      curCat = null;
      render();
      if (selOpen && selOpen.slug === slug) { var t0 = selOpen.tab; selOpen = null; selEditor(t0); }
    }).catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }

  // Notes internes d'une fiche (Gus 03/11) : jamais sur le site, et pas dans ce dépôt (public) : dépôt privé Kinou-DoP/notes,
  // un fichier par chef op (dps/<adresse>.md), lu à l'ouverture et enregistré tout seul 1,2 s après la frappe (sans « Publier »).
  // Clé GitHub sans accès à ce dépôt (ou dépôt absent) : message dans le bloc, le reste de la fiche marche normalement.
  var NOTES_REPO = "Kinou-DoP/notes", notesFor = null, notesNode = null, notesPending = {};
  function b64enc(t) { return btoa(unescape(encodeURIComponent(t))); }
  function b64dec(b) { return decodeURIComponent(escape(atob(String(b).replace(/\s/g, "")))); }
  function notesBox(slug) {
    var ta = el("textarea", { class: "nodirty", rows: "3", placeholder: "Notes pour l'équipe (jamais affichées sur le site)…" }), st = el("span", { class: "nst" });
    var box = el("section", { class: "notes" }, [el("div", { class: "nhead" }, [el("span", { class: "label", text: "Notes" }), st]), ta]);
    var path = "/repos/" + NOTES_REPO + "/contents/dps/" + slug + ".md", sha = null, saved = "", t = 0, busy = false, again = false;
    function grow() { ta.style.height = "auto"; ta.style.height = Math.max(ta.scrollHeight, 60) + "px"; }
    ta.disabled = true; st.textContent = "Chargement…";
    // Note de cette fiche encore en cours d'enregistrement (on a quitté puis rouvert la fiche) : on attend qu'il soit fini.
    (notesPending[path] || Promise.resolve()).catch(function () {}).then(function () { return gh(path, { allow404: true }); }).then(function (f) {
      if (f) { sha = f.sha; saved = b64dec(f.content); return; }
      return gh("/repos/" + NOTES_REPO, { allow404: true }).then(function (r) { if (!r) throw new Error("absent"); });
    }).then(function () { ta.value = saved; ta.disabled = false; st.textContent = ""; requestAnimationFrame(grow); },
      function () { box.classList.add("off"); st.textContent = "Indisponibles : le dépôt privé « Kinou-DoP/notes » doit exister et être ajouté à votre clé GitHub."; });
    function put() {
      return gh(path, { method: "PUT", body: { message: "Notes " + (state && state.name || slug) + " (admin, " + (user && user.login || "") + ")", content: b64enc(ta.value), sha: sha || undefined } });
    }
    function save() {
      unsoon(path);
      if (busy) { again = true; return; }
      if (ta.value === saved) { st.textContent = "Enregistré"; return; }
      var v = ta.value; busy = true; st.textContent = "Enregistrement…";
      var p = notesPending[path] = put().catch(function () { // modifiée ailleurs entre-temps (autre personne, autre onglet) : on reprend sa version et on réessaie
        return gh(path, { allow404: true }).then(function (f) { sha = f ? f.sha : null; return put(); });
      }).then(function (r) { sha = r.content.sha; saved = v; st.textContent = "Enregistré"; },
        function (e) { st.textContent = "Pas enregistré : " + e.message; throw e; });
      track(p);
      p.catch(function () {}).then(function () { busy = false; if (notesPending[path] === p) delete notesPending[path]; if (again) { again = false; save(); } });
      return p;
    }
    ta.addEventListener("input", function () { grow(); st.textContent = "…"; soon(path, save, 1200); });
    ta.addEventListener("blur", function () { save(); });
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
    view.appendChild(el("p", { class: "lead", text: isNew ? "Nouvelle fiche — collez le lien du bundle Slate pour commencer." : "Sélection de la page : « Modifier la sélection » (Slate n'est plus lu ; « Réimporter depuis Slate » en option)." }));
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
    var imp = el("button", { class: "btn", text: state.bundle ? "Réimporter depuis Slate" : "Importer" });
    imp.addEventListener("click", function () {
      if (slate && slate.clips && slate.clips.length && !window.confirm("Réimporter depuis Slate remplace la sélection de la page (onglets, films, ordre) par celle du bundle Slate. Les corrections des films sont gardées. Continuer ?")) return;
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
