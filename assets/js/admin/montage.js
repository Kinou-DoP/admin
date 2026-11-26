// Montage / bout à bout (Gus 26/11) : fenêtre pour assembler des vidéos du video club (les vidéos liées d'un même import, pour commencer).
// - On travaille sur les versions web (« Encodage 1 ») : légères, pas de lag ; à l'export le robot (job `edit` de tools/encodage.mjs) recoupe dans les ORIGINAUX
//   (gardés chez Amazon) ou, au choix, dans les versions web, et fabrique un film 1080p avec le son = un nouveau projet du video club (renommable, extraits, vignettes…).
// - Frise : un bloc par morceau, largeur proportionnelle à sa durée, glisser pour réordonner ; le bloc choisi se règle sur la frise de sa vidéo (début / fin),
//   touches I / O (début / fin à l'image affichée), S (couper en deux à l'image affichée), Suppr (retirer le morceau), espace (lecture), ← → (image par image, Maj = 1 s).
// - Limite de 10 Go d'originaux (facture Amazon) : au-delà, message « utiliser la version compressée ».
// films : [{ key, title, full (version web), dur, size (octets de l'original), mkey (clé du master), dir, prod, dops, types, client }] ; opt : { name, onCreated(item) }.
var MONT_MAX = 10e9;
function montageWin(films, opt) {
  opt = opt || {};
  var pool = films.filter(function (f) { return f.full && f.dur; }), uid = 0;
  if (!pool.length) { alert("Aucune vidéo encodée à assembler pour l'instant."); return; }
  var blocks = pool.map(function (f) { return { id: ++uid, f: f, s: 0, d: f.dur }; }), sel = 0, cur = 0, playing = false, seqT = 0, loadedSrc = "", quality = "original";
  var r3 = function (x) { return Math.round(x * 1000) / 1000; }, fmt = function (t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2).replace(".", ","); };
  var ov = el("div", { class: "bmodal bmont" }), box = el("div", { class: "bmbox bmontbox" });
  var vid = el("video", { playsinline: true, preload: "auto" }), nameI = el("input", { type: "text", value: opt.name || "Bout à bout — " + (pool[0].client ? pool[0].client + " " : "") + (pool[0].title || "").slice(0, 40), placeholder: "Nom du montage" });
  var bar = el("div", { class: "hbar" }), wrap = el("div", { class: "hbwrap" }, [bar]), ph = el("i", { class: "hbph" }); wrap.appendChild(ph);
  var det = el("div", { class: "hdet" }), info = el("p", { class: "hint" }), exp = el("div", { class: "hexp" }), poolBox = el("div", { class: "hpool" });
  function total() { return blocks.reduce(function (a, b) { return a + b.d; }, 0); }
  function tbefore(i) { var t = 0; for (var k = 0; k < i; k++) t += blocks[k].d; return t; }
  // ---------- lecture ----------
  function load(i, t, andPlay) { // affiche le morceau i à l'instant t de sa vidéo
    cur = i; var b = blocks[i], src = b.f.full;
    function go() { vid.currentTime = Math.max(0, Math.min(t, b.f.dur - 0.05)); if (andPlay) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } }
    if (loadedSrc !== src) { loadedSrc = src; vid.src = src; vid.addEventListener("loadedmetadata", function f() { vid.removeEventListener("loadedmetadata", f); go(); }); } else go();
  }
  function pause() { playing = false; vid.pause(); }
  function play() {
    var b = blocks[cur] || blocks[0]; playing = true;
    if (loadedSrc === b.f.full && vid.currentTime >= b.s && vid.currentTime < b.s + b.d - .05) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
    else load(blocks.indexOf(b), b.s, true);
  }
  (function tick() {
    if (!ov.isConnected) return;
    if (playing && loadedSrc) {
      var b = blocks[cur];
      if (b && vid.currentTime >= b.s + b.d - .03) { if (cur + 1 < blocks.length) load(cur + 1, blocks[cur + 1].s, true); else { pause(); load(0, blocks[0].s, false); } }
    }
    var bb = blocks[cur]; if (bb && loadedSrc === bb.f.full) { var el0 = Math.max(0, Math.min(bb.d, vid.currentTime - bb.s)); ph.style.left = (tbefore(cur) + el0) / total() * 100 + "%"; seqT = tbefore(cur) + el0; }
    drawDetHead(); requestAnimationFrame(tick);
  })();
  // ---------- frise ----------
  function drawBar() {
    bar.textContent = ""; var tot = total();
    blocks.forEach(function (b, i) {
      var w = el("div", { class: "hb" + (i === sel ? " on" : ""), style: "flex:0 0 " + b.d / tot * 100 + "%", title: (b.f.title || "") + " · " + fmt(b.s) + " → " + fmt(b.s + b.d) }, [
        el("b", { text: String(i + 1) }), el("span", { text: (b.f.title || "").replace(/^.*? - /, "") }), el("small", { text: b.d.toFixed(1).replace(".", ",") + " s" }),
        blocks.length > 1 ? el("button", { type: "button", class: "hbx", text: "×", title: "Retirer ce morceau", on: { click: function (e) { e.stopPropagation(); removeAt(i); } } }) : null]);
      w.style.setProperty("--hue", (blocks.indexOf(b) * 47 + 20) % 360);
      w.addEventListener("click", function () { if (bar._dragged) return; select(i); });
      bar.appendChild(w);
    });
    info.textContent = blocks.length + " morceau" + (blocks.length > 1 ? "x" : "") + " · durée du montage " + fmt(tot) + " · I / O : début / fin du morceau choisi · S : couper en deux · Suppr : retirer · espace : lecture";
    drawDet(); drawExp(); drawPool();
  }
  hReorder(bar, function (from, to) { var cb = blocks[sel], x = blocks.splice(from, 1)[0]; blocks.splice(to, 0, x); sel = blocks.indexOf(cb); drawBar(); });
  function select(i) { sel = i; drawBar(); load(i, blocks[i].s, false); }
  function removeAt(i) { if (blocks.length < 2) return; blocks.splice(i, 1); sel = Math.min(sel, blocks.length - 1); cur = Math.min(cur, blocks.length - 1); drawBar(); load(sel, blocks[sel].s, false); }
  function splitHere() {
    var b = blocks[cur], t = vid.currentTime; if (!b || loadedSrc !== b.f.full || t < b.s + .2 || t > b.s + b.d - .2) return;
    var n = { id: ++uid, f: b.f, s: r3(t), d: r3(b.s + b.d - t) }; b.d = r3(t - b.s); blocks.splice(cur + 1, 0, n); sel = cur; drawBar();
  }
  // ---------- frise du morceau choisi : sa vidéo en entier, début / fin glissables ----------
  var dTrack = el("div", { class: "hdtrack" }), dReg = el("i", { class: "hdreg" }), dIn = el("b", { class: "hdh in", title: "Début du morceau" }), dOut = el("b", { class: "hdh out", title: "Fin du morceau" }), dPh = el("i", { class: "hdph" }), dLab = el("div", { class: "hdlab" });
  dTrack.appendChild(dReg); dTrack.appendChild(dPh); dTrack.appendChild(dIn); dTrack.appendChild(dOut);
  det.appendChild(dTrack); det.appendChild(dLab);
  function drawDet() { dTrack.parentNode && drawDetHead(true); }
  function drawDetHead(force) {
    var b = blocks[sel]; if (!b) return; var D = b.f.dur, key = b.s + "|" + b.d + "|" + sel;
    if (force !== true && dTrack._k === key && !(loadedSrc === b.f.full)) { /* rien */ }
    dReg.style.left = b.s / D * 100 + "%"; dReg.style.width = b.d / D * 100 + "%"; dIn.style.left = b.s / D * 100 + "%"; dOut.style.left = (b.s + b.d) / D * 100 + "%";
    dPh.hidden = loadedSrc !== b.f.full; if (!dPh.hidden) dPh.style.left = Math.max(0, Math.min(100, vid.currentTime / D * 100)) + "%";
    dLab.textContent = (b.f.title || "") + " · morceau " + (sel + 1) + " : " + fmt(b.s) + " → " + fmt(b.s + b.d) + " (" + b.d.toFixed(1).replace(".", ",") + " s) sur " + fmt(D);
  }
  function tOf(e) { var r = dTrack.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * blocks[sel].f.dur; }
  function dragH(h, which) {
    h.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId); pause();
      function mv(ev) {
        var b = blocks[sel], t = tOf(ev), end = b.s + b.d;
        if (which === "in") { t = Math.min(t, end - .2); b.s = r3(Math.max(0, t)); b.d = r3(end - b.s); } else { t = Math.max(t, b.s + .2); b.d = r3(Math.min(b.f.dur, t) - b.s); }
        load(sel, which === "in" ? b.s : b.s + b.d - .05, false); drawDetHead(true); drawBarSoft();
      }
      function up() { h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); drawBar(); }
      h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up);
    });
  }
  dragH(dIn, "in"); dragH(dOut, "out");
  function drawBarSoft() { var tot = total(); [].forEach.call(bar.children, function (w, i) { w.style.flex = "0 0 " + blocks[i].d / tot * 100 + "%"; }); }
  dTrack.addEventListener("pointerdown", function (e) { if (e.target !== dTrack && e.target !== dReg) return; pause(); load(sel, tOf(e), false); });
  // ---------- export ----------
  function sources() { var seen = {}, l = []; blocks.forEach(function (b) { if (!seen[b.f.key]) { seen[b.f.key] = 1; l.push(b.f); } }); return l; }
  function gb(n) { return (n / 1e9).toFixed(1).replace(".", ",") + " Go"; }
  function drawExp() {
    exp.textContent = ""; var src = sources(), sum = src.reduce(function (a, f) { return a + (f.size || 0); }, 0), hasM = src.every(function (f) { return f.mkey && f.size; }), over = sum > MONT_MAX;
    var canOrig = hasM && !over; if (!canOrig) quality = "web";
    var rO = el("input", { type: "radio", name: "mq", disabled: canOrig ? null : true }), rW = el("input", { type: "radio", name: "mq" });
    rO.checked = quality === "original"; rW.checked = quality === "web";
    rO.addEventListener("change", function () { quality = "original"; }); rW.addEventListener("change", function () { quality = "web"; });
    exp.appendChild(el("span", { class: "label", text: "Export" }));
    exp.appendChild(el("label", { class: "bck" + (canOrig ? "" : " off") }, [rO, " Depuis les originaux (meilleure qualité) · " + (hasM ? gb(sum) + " d'originaux" : "originaux pas retrouvés")]));
    exp.appendChild(el("label", { class: "bck" }, [rW, " Depuis les versions compressées (plus rapide, qualité des versions web)"]));
    if (over) exp.appendChild(el("p", { class: "hint berr", text: "Plus de 10 Go d'originaux (" + gb(sum) + ") : utiliser la version compressée (la limite évite une facture Amazon plus élevée)." }));
    exp.appendChild(el("p", { class: "hint", text: "Sortie : 1080p avec le son. Le robot met environ autant de temps que la durée du montage ; le nouveau projet apparaît dans le video club (« encodage en cours ») et se renomme comme les autres." }));
    var go = el("button", { type: "button", class: "btn primary", text: "Exporter le montage", on: { click: function () { doExport(go); } } }); exp.appendChild(go);
  }
  function doExport(btn) {
    var name = nameI.value.trim() || "Montage"; btn.disabled = true; btn.textContent = "Envoi au robot…";
    var q = quality, id = encId(), by = user && user.login || "", f0 = blocks[0].f, parts = blocks.map(function (b) { var p = { s: r3(b.s), d: r3(b.d) }; if (q === "original") p.key = b.f.mkey; else p.src = b.f.full; return p; });
    var req = encFile("film", [{ id: id, kind: "edit", quality: q, parts: parts }]);
    var item = { key: "e" + id, kind: "video", title: name, dir: f0.dir || "", prod: f0.prod || "", dops: (f0.dops || []).slice(), types: (f0.types || []).slice(), cats: [], src: "montage", at: new Date().toISOString(), by: by,
      enc: { path: req.path, id: id }, montage: { from: sources().map(function (f) { return f.key; }), quality: q, parts: blocks.map(function (b) { return { from: b.f.key, s: r3(b.s), d: r3(b.d) }; }) } };
    if (f0.client) item.client = f0.client;
    commit([req, { path: BIB_LIB, edit: function (t) { var L = t ? JSON.parse(t) : { items: [] }; L.items = (L.items || []).filter(function (x) { return x.key !== item.key; }); L.items.push(item); return json(L); } }],
      "Montage : export (admin, " + by + ")").then(function () { ov.remove(); document.removeEventListener("keydown", onKey, true); if (opt.onCreated) opt.onCreated(item); alert("Montage « " + name + " » envoyé au robot. Il apparaîtra dans le video club (⟳ encodage en cours) dans quelques minutes."); },
      function (e) { btn.disabled = false; btn.textContent = "Exporter le montage"; alert("Pas envoyé : " + e.message); });
  }
  // ---------- ajouter une vidéo de la liste ----------
  function drawPool() {
    poolBox.textContent = ""; var used = {}; blocks.forEach(function (b) { used[b.f.key] = 1; }); var rest = pool.filter(function (f) { return !used[f.key]; });
    if (!rest.length) return; poolBox.appendChild(el("span", { class: "label", text: "Ajouter une vidéo liée" }));
    rest.forEach(function (f) { poolBox.appendChild(el("button", { type: "button", class: "btn ghost", text: "+ " + (f.title || f.key).slice(0, 48), on: { click: function () { blocks.push({ id: ++uid, f: f, s: 0, d: f.dur }); sel = blocks.length - 1; drawBar(); load(sel, 0, false); } } })); });
  }
  // ---------- clavier ----------
  function onKey(e) {
    if (!ov.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
    if (e.target && e.target.matches && e.target.matches("input:not([type=radio]):not([type=checkbox]), textarea")) return;
    var k = e.key, b = blocks[sel];
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (k === " ") { e.preventDefault(); e.stopPropagation(); if (playing) pause(); else play(); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); e.stopPropagation(); removeAt(sel); return; }
    if (/^[sS]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); splitHere(); return; }
    if (/^[iIoO]$/.test(k) && !e.ctrlKey && !e.metaKey && b) {
      e.preventDefault(); e.stopPropagation(); if (loadedSrc !== b.f.full) return; var t = vid.currentTime, end = b.s + b.d;
      if (/i/i.test(k)) { b.s = r3(Math.max(0, Math.min(t, b.f.dur - .2))); b.d = r3(Math.max(.2, (t > end - .2 ? Math.min(b.f.dur, t + 1) : end) - b.s)); }
      else { b.d = r3(Math.max(.2, Math.min(b.f.dur, t) - b.s)); if (t < b.s + .2) { b.s = r3(Math.max(0, t - .2)); b.d = .2; } }
      drawBar(); return;
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && b) { e.preventDefault(); e.stopPropagation(); pause(); var st = (e.shiftKey ? 1 : 1 / 25) * (k === "ArrowLeft" ? -1 : 1); if (loadedSrc === b.f.full) vid.currentTime = Math.max(0, Math.min(b.f.dur, vid.currentTime + st)); }
  }
  document.addEventListener("keydown", onKey, true);
  function close() { pause(); document.removeEventListener("keydown", onKey, true); ov.remove(); }
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  // ---------- assemblage de la fenêtre ----------
  box.appendChild(el("div", { class: "hhead" }, [el("span", { class: "label", text: "Bout à bout" }), nameI, el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: close } })]));
  box.appendChild(el("div", { class: "hmain" }, [el("div", { class: "hvid" }, [vid, el("div", { class: "hctl" }, [
    el("button", { type: "button", class: "btn ghost", text: "▶ / ❚❚", title: "Lecture du montage (espace)", on: { click: function () { if (playing) pause(); else play(); } } }),
    el("button", { type: "button", class: "btn ghost", text: "✂ Couper ici (S)", on: { click: splitHere } })])]), exp]));
  box.appendChild(wrap); box.appendChild(det); box.appendChild(info); box.appendChild(poolBox);
  ov.appendChild(box); document.body.appendChild(ov);
  drawBar(); load(0, blocks[0].s, false);
}
