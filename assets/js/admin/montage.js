// Montage / bout à bout (Gus 26/11) : fenêtre pour assembler des morceaux de vidéos du video club (les vidéos liées d'un même import, ou une seule vidéo pour « edit moi si tu peux »).
// Même principe que les extraits : on règle une SÉLECTION sur la vidéo source (poignées début / fin, touches I / O), « + Ajouter ce bloc » (ou Entrée) la range dans le montage ; on peut
// prendre plusieurs parties de la même vidéo ; les blocs du montage se réordonnent en glissant, se modifient en cliquant dessus (un 2e clic les désélectionne), se retirent avec ×.
// - On travaille sur les versions web (« Encodage 1 ») : légères, pas de lag ; à l'export le robot (job `edit` de tools/encodage.mjs) recoupe dans les ORIGINAUX (gardés chez Amazon)
//   ou, au choix, dans les versions web, et fabrique un film 1080p avec le son = un nouveau projet du video club (ou, en mode « version », une nouvelle version « Edit n » de la vidéo).
// - Curseur : un trait suit la souris sur la frise de la source et sur la règle du montage (avec l'heure) ; cliquer-glisser dessus balade la vidéo.
// - Limite de 10 Go d'originaux (facture Amazon) : au-delà, message « utiliser la version compressée ».
// opt.mode === "version" : montage d'UNE vidéo → une nouvelle version « Edit n » (opt.onVersion(version)) ; opt.parts = morceaux de départ ; opt.name ; opt.onCreated(item) (projet).
// films : [{ key, title, full (version web), dur, size (octets de l'original), mkey (clé du master), dir, prod, dops, types, client }].
var MONT_MAX = 10e9;
function montageWin(films, opt) {
  opt = opt || {};
  var pool = films.filter(function (f) { return f.full && f.dur; }), uid = 0;
  if (!pool.length) { alert("Aucune vidéo encodée à assembler pour l'instant."); return; }
  var blocks = opt.parts && opt.parts.length ? opt.parts.map(function (p) { return { id: ++uid, f: pool[0], s: p.s, d: p.d }; }) : pool.map(function (f) { return { id: ++uid, f: f, s: 0, d: f.dur }; });
  var sel = -1, src = blocks[0].f, selMem = {}, mode = "src", playing = false, cur = 0, loaded = "", quality = "original";
  var MIND = .2;
  var r3 = function (x) { return Math.round(x * 1000) / 1000; }, clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var fmt = function (t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2).replace(".", ","); };
  var ov = el("div", { class: "bmodal bmont" }), box = el("div", { class: "bmbox bmontbox" });
  var vid = el("video", { playsinline: true, preload: "auto" }), nameI = el("input", { type: "text", value: opt.name || "Bout à bout — " + (pool[0].title || "").slice(0, 40), placeholder: "Nom du montage" });
  var bar = el("div", { class: "hbar" }), ruler = el("div", { class: "hruler" }), ph = el("i", { class: "hbph" }), wrap = el("div", { class: "hbwrap" }, [ruler, bar, ph]);
  var det = el("div", { class: "hdet" }), info = el("p", { class: "hint" }), exp = el("div", { class: "hexp" }), srcTabs = el("div", { class: "hsrc" });
  function total() { return blocks.reduce(function (a, b) { return a + b.d; }, 0); }
  function before(i) { var t = 0; for (var k = 0; k < i; k++) t += blocks[k].d; return t; }
  // Sélection : celle du bloc en modification, sinon la sélection libre de la vidéo source.
  function selFree() { return selMem[src.key] || (selMem[src.key] = { s: 0, d: r3(Math.min(5, src.dur)) }); }
  function act() { return sel >= 0 && blocks[sel] ? blocks[sel] : selFree(); }
  // ---------- lecture ----------
  function load(f, t, andPlay) { // affiche la vidéo f à l'instant t
    function go() { vid.currentTime = clamp(t, 0, f.dur - .04); if (andPlay) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } }
    if (loaded !== f.full) { loaded = f.full; vid.src = f.full; vid.addEventListener("loadedmetadata", function w() { vid.removeEventListener("loadedmetadata", w); go(); }); } else go();
  }
  function pause() { playing = false; vid.pause(); }
  function playSrc() { mode = "src"; playing = true; var t = loaded === src.full ? vid.currentTime : act().s; load(src, t, true); ph.hidden = true; }
  function playSeq(from) {
    if (!blocks.length) return; mode = "seq"; playing = true; cur = from === undefined ? (mode === "seq" && loaded ? cur : 0) : from; cur = clamp(cur, 0, blocks.length - 1);
    var b = blocks[cur]; if (loaded === b.f.full && vid.currentTime >= b.s && vid.currentTime < b.s + b.d - .05) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } else load(b.f, b.s, true);
  }
  function seekSeq(t) { // un instant du montage (règle) : on se place dans le bon bloc
    if (!blocks.length) return; pause(); mode = "seq"; t = clamp(t, 0, total() - .01); var i = 0; while (i < blocks.length - 1 && before(i + 1) <= t) i++;
    cur = i; load(blocks[i].f, blocks[i].s + (t - before(i)), false); drawCursor();
  }
  function tick() {
    if (!ov.isConnected) return;
    if (playing && mode === "seq" && blocks[cur]) {
      var b = blocks[cur];
      if (loaded === b.f.full && vid.currentTime >= b.s + b.d - .03) { if (cur + 1 < blocks.length) { cur++; load(blocks[cur].f, blocks[cur].s, true); } else { pause(); cur = 0; load(blocks[0].f, blocks[0].s, false); } }
    }
    drawCursor(); requestAnimationFrame(tick);
  }
  function drawCursor() { // repères de lecture : sur la frise de la source, et sur la règle du montage (mode montage)
    var D = src.dur; dPh.hidden = loaded !== src.full || mode === "seq" && blocks[cur] && blocks[cur].f !== src; if (!dPh.hidden) dPh.style.left = clamp(vid.currentTime / D * 100, 0, 100) + "%";
    var b = blocks[cur]; ph.hidden = !(mode === "seq" && b && loaded === b.f.full); if (!ph.hidden) ph.style.left = (before(cur) + clamp(vid.currentTime - b.s, 0, b.d)) / total() * 100 + "%";
    tcur.textContent = (loaded === src.full ? fmt(vid.currentTime) : "") + (mode === "seq" && b ? " · montage " + fmt(before(cur) + clamp(vid.currentTime - b.s, 0, b.d)) + " / " + fmt(total()) : "");
  }
  // ---------- frise des blocs du montage ----------
  function drawBar() {
    bar.textContent = ""; var tot = total() || 1;
    blocks.forEach(function (b, i) {
      var w = el("div", { class: "hb" + (i === sel ? " on" : ""), style: "flex:0 0 " + b.d / tot * 100 + "%", title: (b.f.title || "") + " · " + fmt(b.s) + " → " + fmt(b.s + b.d) + " · clique pour le modifier" }, [
        el("b", { text: String(i + 1) }), el("span", { text: (b.f.title || "").replace(/^.*? - /, "") }), el("small", { text: b.d.toFixed(1).replace(".", ",") + " s" }),
        el("button", { type: "button", class: "hbp", text: "▶", title: "Voir ce bloc", on: { click: function (e) { e.stopPropagation(); playSeq(i); } } }),
        el("button", { type: "button", class: "hbx", text: "×", title: "Retirer ce bloc", on: { click: function (e) { e.stopPropagation(); removeAt(i); } } })]);
      w.style.setProperty("--hue", (pool.indexOf(b.f) * 47 + 20) % 360);
      w.addEventListener("click", function () { if (bar._dragged) return; selectBlock(i === sel ? -1 : i); });
      bar.appendChild(w);
    });
    if (!blocks.length) bar.appendChild(el("span", { class: "hint hbempty", text: "Aucun bloc : règle une sélection sur la vidéo ci-dessus puis « + Ajouter ce bloc »." }));
    drawRuler(); info.textContent = blocks.length + " bloc" + (blocks.length > 1 ? "s" : "") + " · durée du montage " + fmt(total()) + " · I / O : début / fin de la sélection · Entrée : ajouter le bloc · S : couper le bloc choisi · Suppr : retirer · espace : lecture";
    drawDet(); drawExp(); drawAdd();
  }
  hReorder(bar, function (from, to) { var cb = sel >= 0 ? blocks[sel] : null, x = blocks.splice(from, 1)[0]; blocks.splice(to, 0, x); sel = cb ? blocks.indexOf(cb) : -1; drawBar(); });
  function drawRuler() { // règle du montage : graduations toutes les 5 s (ou 10 / 30 / 60 s si long) ; le curseur de la souris y est affiché, cliquer-glisser balade le montage
    ruler.textContent = ""; var tot = total(); if (!tot) return; var step = tot > 600 ? 60 : tot > 240 ? 30 : tot > 90 ? 10 : 5;
    for (var t = step; t < tot; t += step) ruler.appendChild(el("i", { class: "hrt", style: "left:" + t / tot * 100 + "%" }, [el("span", { text: fmt(t).replace(/,\d+$/, "") })]));
  }
  function selectBlock(i) { sel = i; if (i >= 0) { src = blocks[i].f; drawBar(); load(src, blocks[i].s, false); } else { drawBar(); load(src, selFree().s, false); } }
  function removeAt(i) { blocks.splice(i, 1); if (sel === i) sel = -1; else if (sel > i) sel--; cur = clamp(cur, 0, Math.max(0, blocks.length - 1)); drawBar(); }
  function addBlock() { // « + Ajouter ce bloc » : la sélection devient un bloc du montage ; la suivante démarre juste après
    if (sel >= 0) { selectBlock(-1); return; }
    var s = selFree(); blocks.push({ id: ++uid, f: src, s: r3(s.s), d: r3(s.d) });
    var ns = Math.min(s.s + s.d, Math.max(0, src.dur - MIND)); selMem[src.key] = { s: r3(ns), d: r3(Math.max(MIND, Math.min(5, src.dur - ns))) };
    drawBar(); load(src, selMem[src.key].s, false);
  }
  function splitHere() { // coupe le bloc choisi en deux à l'image affichée
    var b = sel >= 0 ? blocks[sel] : null, t = vid.currentTime; if (!b || loaded !== b.f.full || t < b.s + .2 || t > b.s + b.d - .2) return;
    var n = { id: ++uid, f: b.f, s: r3(t), d: r3(b.s + b.d - t) }; b.d = r3(t - b.s); blocks.splice(sel + 1, 0, n); drawBar();
  }
  // ---------- vidéo source : frise entière, sélection (début / fin glissables), curseur ----------
  var dTrack = el("div", { class: "hdtrack" }), dReg = el("i", { class: "hdreg" }), dIn = el("b", { class: "hdh in", title: "Début" }), dOut = el("b", { class: "hdh out", title: "Fin" }), dPh = el("i", { class: "hdph" }), dLab = el("div", { class: "hdlab" });
  var dBlk = el("div", { class: "hdblks" }), tcur = el("span", { class: "hdtime" });
  dTrack.appendChild(dBlk); dTrack.appendChild(dReg); dTrack.appendChild(dPh); dTrack.appendChild(dIn); dTrack.appendChild(dOut);
  det.appendChild(srcTabs); det.appendChild(dTrack); det.appendChild(dLab);
  function drawDet() {
    var D = src.dur, a = act(); dBlk.textContent = ""; // les parties déjà prises dans cette vidéo, en repères clairs
    blocks.forEach(function (b, i) { if (b.f === src && i !== sel) dBlk.appendChild(el("i", { class: "tlblk", style: "left:" + b.s / D * 100 + "%;width:" + Math.max(.3, b.d / D * 100) + "%", title: "Bloc " + (i + 1) })); });
    dReg.className = "hdreg" + (sel >= 0 ? " blk" : ""); dReg.style.left = a.s / D * 100 + "%"; dReg.style.width = a.d / D * 100 + "%"; dIn.style.left = a.s / D * 100 + "%"; dOut.style.left = (a.s + a.d) / D * 100 + "%";
    dLab.textContent = (src.title || "") + " · " + (sel >= 0 ? "bloc " + (sel + 1) + " (en modification)" : "sélection") + " : " + fmt(a.s) + " → " + fmt(a.s + a.d) + " (" + a.d.toFixed(1).replace(".", ",") + " s) sur " + fmt(D);
    dLab.appendChild(tcur);
  }
  function drawAdd() {
    srcTabs.textContent = "";
    if (pool.length > 1) pool.forEach(function (f) { srcTabs.appendChild(el("button", { type: "button", class: "btn ghost" + (f === src ? " on" : ""), text: (f.title || f.key).replace(/^.*? - /, "").slice(0, 36), title: f.title, on: { click: function () { sel = -1; src = f; drawBar(); load(f, selFree().s, false); } } })); });
    srcTabs.appendChild(el("button", { type: "button", class: "btn primary", text: sel >= 0 ? "+ Nouvelle sélection" : "+ Ajouter ce bloc", title: sel >= 0 ? "Quitte la modification du bloc (ou clique à nouveau le bloc)" : "Range la sélection dans le montage (Entrée)", on: { click: addBlock } }));
  }
  function tOf(e, track, a, b) { var r = track.getBoundingClientRect(); return a + clamp((e.clientX - r.left) / r.width, 0, 1) * (b - a); }
  function dragH(h, which) {
    h.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId); pause(); mode = "src";
      function mv(ev) {
        var a = act(), t = tOf(ev, dTrack, 0, src.dur), end = a.s + a.d;
        if (which === "in") { t = Math.min(t, end - MIND); a.s = r3(Math.max(0, t)); a.d = r3(end - a.s); } else { t = Math.max(t, a.s + MIND); a.d = r3(Math.min(src.dur, t) - a.s); }
        load(src, which === "in" ? a.s : a.s + a.d - .05, false); drawDet(); if (sel >= 0) drawBarSoft();
      }
      function up() { h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); drawBar(); }
      h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up);
    });
  }
  dragH(dIn, "in"); dragH(dOut, "out");
  function drawBarSoft() { var tot = total() || 1; [].forEach.call(bar.querySelectorAll(".hb"), function (w, i) { if (blocks[i]) w.style.flex = "0 0 " + blocks[i].d / tot * 100 + "%"; }); }
  // Curseur qui suit la souris (trait + heure) et balade : cliquer-glisser sur la frise = la vidéo suit.
  function hoverCursor(track, timeAt) {
    var line = el("i", { class: "hcur", hidden: true }), tip = el("span", { class: "hcurt" }); line.appendChild(tip); track.appendChild(line);
    track.addEventListener("pointermove", function (e) { var r = track.getBoundingClientRect(), x = clamp(e.clientX - r.left, 0, r.width); line.hidden = false; line.style.left = x + "px"; tip.textContent = fmt(timeAt(e)); });
    track.addEventListener("pointerleave", function () { line.hidden = true; });
  }
  function scrubber(track, onSeek, skip) {
    track.addEventListener("pointerdown", function (e) {
      if (skip && skip(e)) return; if (e.button) return; pause(); onSeek(e); try { track.setPointerCapture(e.pointerId); } catch (x) {}
      function mv(ev) { onSeek(ev); } function up() { track.removeEventListener("pointermove", mv); track.removeEventListener("pointerup", up); }
      track.addEventListener("pointermove", mv); track.addEventListener("pointerup", up);
    });
  }
  hoverCursor(dTrack, function (e) { return tOf(e, dTrack, 0, src.dur); });
  scrubber(dTrack, function (e) { mode = "src"; load(src, tOf(e, dTrack, 0, src.dur), false); }, function (e) { return e.target.closest(".hdh"); });
  hoverCursor(wrap, function (e) { return tOf(e, wrap, 0, total()); }); // le curseur traverse la règle et la frise des blocs
  scrubber(ruler, function (e) { seekSeq(tOf(e, ruler, 0, total())); });
  // ---------- export ----------
  function sources() { var seen = {}, l = []; blocks.forEach(function (b) { if (!seen[b.f.key]) { seen[b.f.key] = 1; l.push(b.f); } }); return l; }
  function gb(n) { return (n / 1e9).toFixed(1).replace(".", ",") + " Go"; }
  function drawExp() {
    exp.textContent = ""; var sr = sources(), sum = sr.reduce(function (a, f) { return a + (f.size || 0); }, 0), hasM = sr.every(function (f) { return f.mkey && f.size; }), over = sum > MONT_MAX;
    var canOrig = hasM && !over; if (!canOrig) quality = "web";
    var rO = el("input", { type: "radio", name: "mq", disabled: canOrig ? null : true }), rW = el("input", { type: "radio", name: "mq" });
    rO.checked = quality === "original"; rW.checked = quality === "web";
    rO.addEventListener("change", function () { quality = "original"; }); rW.addEventListener("change", function () { quality = "web"; });
    exp.appendChild(el("span", { class: "label", text: "Export" }));
    exp.appendChild(el("label", { class: "bck" + (canOrig ? "" : " off") }, [rO, " Depuis les originaux (meilleure qualité) · " + (hasM ? gb(sum) + " d'originaux" : "originaux pas retrouvés")]));
    exp.appendChild(el("label", { class: "bck" }, [rW, " Depuis les versions compressées (plus rapide, qualité des versions web)"]));
    if (over) exp.appendChild(el("p", { class: "hint berr", text: "Plus de 10 Go d'originaux (" + gb(sum) + ") : utiliser la version compressée (la limite évite une facture Amazon plus élevée)." }));
    exp.appendChild(el("p", { class: "hint", text: "Sortie : 1080p avec le son. Le robot met environ autant de temps que la durée du montage." + (opt.mode === "version" ? " La nouvelle version « Edit n » apparaît sous la vidéo (encodage en cours)." : " Le nouveau projet apparaît dans le video club (« encodage en cours ») et se renomme comme les autres.") }));
    var go = el("button", { type: "button", class: "btn primary", text: opt.mode === "version" ? "Exporter comme nouvelle version" : "Exporter le montage", disabled: blocks.length ? null : true, on: { click: function () { doExport(go); } } }); exp.appendChild(go);
  }
  function doExport(btn) {
    var name = nameI.value.trim() || "Montage", lab0 = btn.textContent; btn.disabled = true; btn.textContent = "Envoi au robot…";
    var q = quality, id = encId(), by = user && user.login || "", parts = blocks.map(function (b) { var p = { s: r3(b.s), d: r3(b.d) }; if (q === "original") p.key = b.f.mkey; else p.src = b.f.full; return p; });
    var fail = function (e) { btn.disabled = false; btn.textContent = lab0; alert("Pas envoyé : " + e.message); };
    if (opt.mode === "version") { // nouvelle version de la même vidéo : le robot ne refait que le fichier (pas d'extrait ni de vignette), la demande est suivie dans la fiche
      var reqV = encFile("film", [{ id: id, kind: "edit", quality: q, web: true, parts: parts }]);
      commit([reqV], "Edit : export (admin, " + by + ")").then(function () {
        ov.remove(); document.removeEventListener("keydown", onKey, true);
        if (opt.onVersion) opt.onVersion({ id: "v" + id, name: name, parts: blocks.map(function (b) { return { s: r3(b.s), d: r3(b.d) }; }), quality: q, enc: { path: reqV.path, id: id }, at: new Date().toISOString(), by: by });
      }, fail);
      return;
    }
    var f0 = blocks[0].f, req = encFile("film", [{ id: id, kind: "edit", quality: q, parts: parts }]);
    var item = { key: "e" + id, kind: "video", title: name, dir: f0.dir || "", prod: f0.prod || "", dops: (f0.dops || []).slice(), types: (f0.types || []).slice(), cats: [], src: "montage", at: new Date().toISOString(), by: by,
      enc: { path: req.path, id: id }, montage: { from: sources().map(function (f) { return f.key; }), quality: q, parts: blocks.map(function (b) { return { from: b.f.key, s: r3(b.s), d: r3(b.d) }; }) } };
    if (f0.client) item.client = f0.client;
    commit([req, { path: BIB_LIB, edit: function (t) { var L = t ? JSON.parse(t) : { items: [] }; L.items = (L.items || []).filter(function (x) { return x.key !== item.key; }); L.items.push(item); return json(L); } }], "Montage : export (admin, " + by + ")")
      .then(function () { ov.remove(); document.removeEventListener("keydown", onKey, true); if (opt.onCreated) opt.onCreated(item); alert("Montage « " + name + " » envoyé au robot. Il apparaîtra dans le video club (⟳ encodage en cours) dans quelques minutes."); }, fail);
  }
  // ---------- clavier ----------
  function onKey(e) {
    if (!ov.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
    if (e.target && e.target.matches && e.target.matches("input:not([type=radio]):not([type=checkbox]), textarea")) return;
    var k = e.key;
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (k === " ") { e.preventDefault(); e.stopPropagation(); if (playing) pause(); else if (mode === "seq") playSeq(); else playSrc(); return; }
    if (k === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) addBlock(); return; }
    if ((k === "Delete" || k === "Backspace") && sel >= 0) { e.preventDefault(); e.stopPropagation(); removeAt(sel); return; }
    if (/^[sS]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); splitHere(); return; }
    if (/^[iIoO]$/.test(k) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation(); if (loaded !== src.full) return; var t = vid.currentTime, a = act(), end = a.s + a.d;
      if (/i/i.test(k)) { a.s = r3(clamp(t, 0, src.dur - MIND)); a.d = r3(Math.max(MIND, (t > end - MIND ? Math.min(src.dur, t + 1) : end) - a.s)); }
      else { a.d = r3(Math.max(MIND, Math.min(src.dur, t) - a.s)); if (t < a.s + MIND) { a.s = r3(Math.max(0, t - MIND)); a.d = MIND; } }
      drawBar(); return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); e.stopPropagation(); pause(); var st = (e.shiftKey ? 1 : 1 / 25) * (k === "ArrowLeft" ? -1 : 1); if (loaded === src.full) vid.currentTime = clamp(vid.currentTime + st, 0, src.dur); }
  }
  document.addEventListener("keydown", onKey, true);
  function close() { pause(); document.removeEventListener("keydown", onKey, true); ov.remove(); }
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  // ---------- assemblage de la fenêtre ----------
  box.appendChild(el("div", { class: "hhead" }, [el("span", { class: "label", text: opt.mode === "version" ? "Edit de la vidéo" : "Bout à bout" }), nameI, el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: close } })]));
  box.appendChild(el("div", { class: "hmain" }, [el("div", { class: "hvid" }, [vid, el("div", { class: "hctl" }, [
    el("button", { type: "button", class: "btn ghost", text: "▶ / ❚❚ Source", title: "Lire la vidéo source (espace)", on: { click: function () { if (playing && mode === "src") pause(); else playSrc(); } } }),
    el("button", { type: "button", class: "btn ghost", text: "▶ Montage", title: "Lire le montage, blocs bout à bout", on: { click: function () { if (playing && mode === "seq") pause(); else playSeq(0); } } }),
    el("button", { type: "button", class: "btn ghost", text: "✂ Couper le bloc ici (S)", on: { click: splitHere } })])]), exp]));
  box.appendChild(det); box.appendChild(el("span", { class: "label hmlab", text: "Montage · glisse un bloc pour changer l'ordre, clique-glisse sur la règle pour balader la lecture" })); box.appendChild(wrap); box.appendChild(info);
  ov.appendChild(box); document.body.appendChild(ov);
  drawBar(); load(src, selFree().s, false); tick();
}
