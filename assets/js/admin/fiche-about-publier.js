// Fiche d'un chef op (3/3) : about, portrait, CV, publication, partage
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

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
    ["slug", "name", "hue", "bundle", "open", "template", "featuredName"].forEach(function (k) { if (s[k] !== undefined && s[k] !== "") out[k] = s[k]; });
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
