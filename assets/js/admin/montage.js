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
// Navigation d'une frise zoomée (partagée avec la fenêtre d'edit) : petite barre sous la frise dont la poignée montre la partie affichée ; on la tire pour se déplacer.
// get() -> [début, fin] ou null (pas de zoom), set([début, fin] ou null), dur() -> durée totale.
function tlNav(get, set, dur) {
  var th = el("i", { title: "Partie affichée : tire pour te déplacer dans la frise" }), nv = el("div", { class: "tlnav", hidden: true }, [th]);
  function draw() { var w = get(), D = dur(); nv.hidden = !w || !D; if (nv.hidden) return; th.style.left = w[0] / D * 100 + "%"; th.style.width = (w[1] - w[0]) / D * 100 + "%"; }
  function move(a) { var w = get(), D = dur(); if (!w) return; var sp = w[1] - w[0]; a = Math.max(0, Math.min(D - sp, a)); set([a, a + sp]); }
  nv.addEventListener("pointerdown", function (e) {
    var w = get(), D = dur(); if (!w || e.button) return; e.preventDefault(); e.stopPropagation(); var r = nv.getBoundingClientRect(), x0 = e.clientX, a0 = w[0];
    if (e.target !== th) { a0 = (e.clientX - r.left) / r.width * D - (w[1] - w[0]) / 2; move(a0); }
    try { nv.setPointerCapture(e.pointerId); } catch (x) {}
    function mv(ev) { move(a0 + (ev.clientX - x0) / r.width * D); } function up() { nv.removeEventListener("pointermove", mv); nv.removeEventListener("pointerup", up); }
    nv.addEventListener("pointermove", mv); nv.addEventListener("pointerup", up);
  });
  return { el: nv, draw: draw, pan: function (e) { var w = get(); if (!w) return false; var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; move(w[0] + d / 600 * (w[1] - w[0])); return true; } };
}
var TL_RATES = [1, 2, 4]; // vitesses des touches E (avant) et Z / J (arrière) : 1 appui = normal, 2 = ×2, 3 = ×4 (pas plus)
// opt.mode === "home" (Gus 27/11) : extrait de l'accueil = montage de DURÉE EXACTE opt.exact (10 s) : les poignées ne peuvent pas dépasser le temps restant, « Enregistrer » ne s'ouvre que
// quand le total est pile la durée, et chaque bloc a son cadrage téléphone (bande rouge sur la vidéo, `x` en %, opt.phoneX par défaut) ; opt.onSave([{ s, d, x }]).
function hueFor(n) { return (n * 83 + 15) % 360; } // couleur propre à chaque bloc (même teinte dans la frise des blocs et sur la frise de la source)
function montageWin(films, opt) {
  opt = opt || {}; var EX = opt.mode === "home" ? (+opt.exact || 10) : 0;
  var SNIP = opt.mode === "snip", MAXT = SNIP ? (+opt.max || 30) : 0; // extrait d'une vidéo du video club : jusqu'à MAXT secondes (pas de durée exacte), sans le son
  var pool = films.filter(function (f) { return f.full && f.dur; }), uid = 0;
  if (!pool.length) { alert("Aucune vidéo encodée à assembler pour l'instant."); return; }
  var blocks = opt.parts && opt.parts.length ? opt.parts.map(function (p) { return { id: ++uid, f: pool[0], s: p.s, d: p.d, x: p.x, hue: hueFor(uid) }; }) : pool.map(function (f) { return { id: ++uid, f: f, s: 0, d: f.dur }; });
  var sel = EX ? 0 : -1, src = blocks[0].f, selMem = {}, mode = "src", playing = false, cur = 0, loaded = "", quality = "original";
  var MIND = .2, zw = null, revOn = false, revRaf = 0; // zw : partie visible de la frise de la source (zoom Option + molette) ; revOn : lecture à l'envers
  function zwin() { return zw || [0, src.dur]; }
  function pcz(t) { var w = zwin(); return (t - w[0]) / (w[1] - w[0]) * 100; }
  var r3 = function (x) { return Math.round(x * 1000) / 1000; }, clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var fmt = function (t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2).replace(".", ","); };
  var ov = el("div", { class: "bmodal bmont" + (EX ? " bmhome" : "") }), box = el("div", { class: "bmbox bmontbox" });
  var vid = el("video", { playsinline: true, preload: "auto" }), nameI = el("input", { type: "text", value: opt.name || "Bout à bout — " + (pool[0].title || "").slice(0, 40), placeholder: "Nom du montage" });
  var zm = EX ? Math.max(1, +opt.zoom || 1) : 1, zph = EX && opt.phoneZoom !== undefined ? Math.max(1, +opt.phoneZoom) : zm, split = EX && opt.phoneZoom !== undefined && Math.abs(zph - zm) > .001;
  var zpos = (/^([\d.]+)% ([\d.]+)%$/.exec(opt.zoomPos || "") || [0, 50, 50]).slice(1).map(function (v) { return +v / 100; }); // point de cadrage (zoomPos), 0..1
  var phoneCv = el("canvas", { class: "hmphone", width: 180, height: Math.round(180 / PHONE_A) }), zbox = el("div", { class: "hzoomrow" });
  function drawZoom() { // « Recadrage » : un curseur pour les deux écrans, ou un par écran une fois séparés
    if (!EX) return; zbox.textContent = "";
    function slider(label, get, set) { var r = el("input", { type: "range", min: "1", max: "2.5", step: "0.01", value: String(get()) }), v = el("span", { class: "zval", text: "× " + get().toFixed(2).replace(".", ",") });
      r.addEventListener("input", function () { set(+r.value); v.textContent = "× " + (+r.value).toFixed(2).replace(".", ","); applyZoom(); }); return el("label", { class: "hzl" }, [el("span", { text: label }), r, v]); }
    if (split) { zbox.appendChild(slider("Ordinateur", function () { return zm; }, function (v) { zm = v; })); zbox.appendChild(slider("Téléphone", function () { return zph; }, function (v) { zph = v; })); }
    else zbox.appendChild(slider("Recadrage (ordinateur et téléphone)", function () { return zm; }, function (v) { zm = zph = v; }));
    zbox.appendChild(el("button", { type: "button", class: "btn ghost", text: split ? "Rassembler" : "Séparer", title: split ? "Le même recadrage sur ordinateur et sur téléphone" : "Un recadrage différent sur ordinateur et sur téléphone", on: { click: function () { split = !split; if (!split) zph = zm; drawZoom(); applyZoom(); } } }));
  }
  function applyZoom() { vid.style.transform = zm > 1 ? "scale(" + zm + ")" : ""; vid.style.transformOrigin = zpos[0] * 100 + "% " + zpos[1] * 100 + "%"; drawPhone(); }
  function phoneX(b) { return !b ? (opt.phoneX === undefined ? 50 : opt.phoneX) : b.x === undefined ? (opt.phoneX === undefined ? 50 : opt.phoneX) : b.x; }
  function drawPhoneScreen() { // écran de téléphone : ce que verra le téléphone (bloc en lecture ou choisi), avec son cadrage et son zoom
    if (!EX || !vid.videoWidth) return; var b = mode === "seq" && playing ? blocks[cur] : sel >= 0 ? blocks[sel] : mode === "seq" ? blocks[cur] : null, cx = phoneCv.getContext("2d"), vw = vid.videoWidth, vh = vid.videoHeight, z = zph;
    var w0 = vh * PHONE_A, x0 = Math.max(0, (vw - w0)) * phoneX(b) / 100, sw = w0 / z, sh = vh / z, sx = x0 + w0 * (zpos[0] - zpos[0] / z), sy = vh * (zpos[1] - zpos[1] / z);
    try { cx.drawImage(vid, sx, sy, sw, sh, 0, 0, phoneCv.width, phoneCv.height); } catch (e) {}
  }
  vid.addEventListener("pointerdown", function (e) { // vidéo agrandie : on la fait glisser pour choisir la partie gardée (point de cadrage)
    if (!EX || zm <= 1 || e.button) return; e.preventDefault(); var r = vid.parentNode.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, p0 = zpos.slice(); try { vid.setPointerCapture(e.pointerId); } catch (x) {}
    function mv(ev) { zpos = [clamp(p0[0] - (ev.clientX - x0) / r.width / (zm - 1), 0, 1), clamp(p0[1] - (ev.clientY - y0) / r.height / (zm - 1), 0, 1)]; applyZoom(); }
    function up() { vid.removeEventListener("pointermove", mv); vid.removeEventListener("pointerup", up); }
    vid.addEventListener("pointermove", mv); vid.addEventListener("pointerup", up);
  });
  var pband = el("i", { class: "hphone", title: "Cadrage téléphone de ce bloc : glisse" }); pband.hidden = true;
  if (EX || SNIP) vid.muted = true; // extrait de l'accueil : sans le son (comme sur le site) ; bout à bout et edit gardent le son
  var bar = el("div", { class: "hbar" }), ruler = el("div", { class: "hruler" }), ph = el("i", { class: "hbph" }), wrap = el("div", { class: "hbwrap" }, [ruler, bar, ph]);
  var det = el("div", { class: "hdet" }), info = el("p", { class: "hint" }), exp = el("div", { class: "hexp" }), srcTabs = el("div", { class: "hsrc" });
  // Annuler / rétablir (Cmd / Ctrl + Z, Maj + Cmd / Ctrl + Z ou Y, boutons ↶ ↷) : photo des blocs avant chaque changement.
  // Image par image (Gus 27/11) : poignées, curseurs, I / O et coupes tombent toujours sur une image. Cadence mesurée sur la vidéo (24, 25, 30, 50, 60…), 25 par défaut.
  var FR = 1 / 25, FPS = [24000 / 1001, 24, 25, 30000 / 1001, 30, 50, 60000 / 1001, 60];
  function sn(t) { return r3(Math.round(t / FR) * FR); }
  if (vid.requestVideoFrameCallback) { var lastMT = null, fcb = function (now, m) { if (lastMT !== null) { var d = Math.abs(m.mediaTime - lastMT); if (d > .008 && d < .06) { var f = 1 / d, best = FPS.reduce(function (a, c) { return Math.abs(c - f) < Math.abs(a - f) ? c : a; }, FPS[0]); if (Math.abs(best - f) / best < .12) FR = 1 / best; } } lastMT = m.mediaTime; if (ov.isConnected) vid.requestVideoFrameCallback(fcb); }; vid.requestVideoFrameCallback(fcb); }
  var hist = [], redoS = [];
  function cap() { return { sel: sel, blocks: blocks.map(function (b) { return { id: b.id, f: b.f, s: b.s, d: b.d, x: b.x, hue: b.hue }; }) }; }
  function snap() { hist.push(cap()); if (hist.length > 100) hist.shift(); redoS = []; undoBtns(); }
  function restore(st) { blocks = st.blocks.map(function (b) { return { id: b.id, f: b.f, s: b.s, d: b.d, x: b.x, hue: b.hue }; }); sel = st.sel < blocks.length ? st.sel : -1; loopI = -1; cur = clamp(cur, 0, Math.max(0, blocks.length - 1)); if (sel >= 0) { src = blocks[sel].f; load(src, blocks[sel].s, false); } drawBar(); undoBtns(); }
  function undo() { if (!hist.length) return; pause(); redoS.push(cap()); restore(hist.pop()); }
  function redo() { if (!redoS.length) return; pause(); hist.push(cap()); restore(redoS.pop()); }
  var undoB = el("button", { type: "button", class: "btn ghost", text: "↶", title: "Annuler (Cmd / Ctrl + Z)", on: { click: undo } }), redoB = el("button", { type: "button", class: "btn ghost", text: "↷", title: "Rétablir (Maj + Cmd / Ctrl + Z)", on: { click: redo } });
  function undoBtns() { undoB.disabled = !hist.length; redoB.disabled = !redoS.length; }
  var loopI = -1; // bloc lu en boucle (▶ d'un bloc de la frise du bas)
  function total() { return blocks.reduce(function (a, b) { return a + b.d; }, 0); }
  function before(i) { var t = 0; for (var k = 0; k < i; k++) t += blocks[k].d; return t; }
  // Sélection : celle du bloc en modification, sinon la sélection libre de la vidéo source.
  function room() { var L = EX || MAXT; return L ? r3(L - (total() - (sel >= 0 && blocks[sel] ? blocks[sel].d : 0))) : 1e9; } // durée que la sélection active peut encore prendre
  function selFree() { return selMem[src.key] || (selMem[src.key] = { s: 0, d: r3(Math.min(5, src.dur)) }); }
  function act() { return sel >= 0 && blocks[sel] ? blocks[sel] : selFree(); }
  // ---------- lecture ----------
  function load(f, t, andPlay) { // affiche la vidéo f à l'instant t
    function go() { vid.currentTime = clamp(t + FR * .25, 0, f.dur - .04); /* + un quart d'image : on tombe à coup sûr sur l'image qui commence à t */ if (andPlay) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } }
    if (loaded !== f.full) { loaded = f.full; vid.src = f.full; vid.addEventListener("loadedmetadata", function w() { vid.removeEventListener("loadedmetadata", w); go(); }); } else go();
  }
  var lvl = 0; // vitesse de lecture : 0 = normale, 1..3 = TL_RATES
  function setSpd(n) { lvl = n; vid.defaultPlaybackRate = vid.playbackRate = TL_RATES[n - 1] || 1; }
  function stopRev() { revOn = false; cancelAnimationFrame(revRaf); }
  function pause() { stopRev(); setSpd(0); playing = false; vid.pause(); }
  // Lecture à l'envers (Z / J) : le navigateur ne sait pas, on recule l'image à chaque rafraîchissement.
  function startRev(n) {
    if (loaded !== src.full && !(blocks[cur] && loaded === blocks[cur].f.full)) return; pause(); setSpd(n || 1); revOn = true; var t0 = performance.now(), from = vid.currentTime;
    (function step() { if (!revOn || !ov.isConnected) return; var t = from - (performance.now() - t0) / 1000 * TL_RATES[lvl - 1]; if (t <= 0) { vid.currentTime = 0; stopRev(); return; } if (!vid.seeking) vid.currentTime = t; revRaf = requestAnimationFrame(step); })();
  }
  function playSrc() { stopRev(); loopI = -1; mode = "src"; playing = true; var t = loaded === src.full ? vid.currentTime : act().s; load(src, t, true); ph.hidden = true; }
  function playSeq(from) {
    if (!blocks.length) return; stopRev(); mode = "seq"; playing = true; cur = from === undefined ? (mode === "seq" && loaded ? cur : 0) : from; cur = clamp(cur, 0, blocks.length - 1);
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
      if (loaded === b.f.full && vid.currentTime >= b.s + b.d - .03) { if (loopI === cur) { vid.currentTime = b.s; } else if (cur + 1 < blocks.length) { cur++; load(blocks[cur].f, blocks[cur].s, true); } else if (EX || SNIP) { cur = 0; load(blocks[0].f, blocks[0].s, true); } /* extrait : le montage tourne en boucle */ else { pause(); cur = 0; load(blocks[0].f, blocks[0].s, false); } }
    }
    drawCursor(); requestAnimationFrame(tick);
  }
  function phoneBlock() { return !EX ? null : sel >= 0 && !(mode === "seq" && playing) ? blocks[sel] : null; } // bande rouge : seulement pour régler un bloc (pas pendant le montage)
  function drawPhone() {
    var b = phoneBlock(); pband.hidden = !b; if (!b) return;
    var x = phoneX(b), a = PHONE_A, z = zph, left0 = x / 100 * (1 - a / VID_A), w0 = a / VID_A;
    // zone vue par le téléphone dans la vidéo (fractions de l'image) puis, comme l'image est agrandie par le zoom ordinateur, son emplacement à l'écran
    var L = left0 + w0 * (zpos[0] - zpos[0] / z), W = w0 / z, T = zpos[1] * (1 - 1 / z), H = 1 / z, m = zm;
    pband.style.left = (zpos[0] + (L - zpos[0]) * m) * 100 + "%"; pband.style.width = W * m * 100 + "%";
    pband.style.top = (zpos[1] + (T - zpos[1]) * m) * 100 + "%"; pband.style.height = H * m * 100 + "%"; pband.style.bottom = "auto";
  }
  pband.addEventListener("pointerdown", function (e) {
    var b = phoneBlock(); if (!b) return; e.preventDefault(); pband.setPointerCapture(e.pointerId);
    var x0 = e.clientX, p0 = phoneX(b), w = pband.parentNode.getBoundingClientRect().width * zm;
    function mv(ev) { b.x = Math.round(clamp(p0 + (ev.clientX - x0) / w * VID_A / (VID_A - PHONE_A) * 100, 0, 100) * 10) / 10; drawPhone(); }
    function up() { pband.removeEventListener("pointermove", mv); pband.removeEventListener("pointerup", up); }
    pband.addEventListener("pointermove", mv); pband.addEventListener("pointerup", up);
  });
  function drawCursor() {
    drawPhone(); drawPhoneScreen(); // repères de lecture : sur la frise de la source, et sur la règle du montage (mode montage)
    var pp = pcz(vid.paused ? sn(vid.currentTime) : vid.currentTime); dPh.hidden = loaded !== src.full || mode === "seq" && blocks[cur] && blocks[cur].f !== src || pp < 0 || pp > 100; if (!dPh.hidden) dPh.style.left = pp + "%";
    var b = blocks[cur]; ph.hidden = !(mode === "seq" && b && loaded === b.f.full); if (!ph.hidden) ph.style.left = (before(cur) + clamp(vid.currentTime - b.s, 0, b.d)) / total() * 100 + "%";
    tcur.textContent = (lvl ? (revOn ? "◀◀ ×" : "▶▶ ×") + TL_RATES[lvl - 1] + " · " : "") + (loaded === src.full ? fmt(vid.paused ? sn(vid.currentTime) : vid.currentTime) : "") + (mode === "seq" && b ? " · montage " + fmt(before(cur) + clamp(vid.currentTime - b.s, 0, b.d)) + " / " + fmt(total()) : "");
  }
  // ---------- frise des blocs du montage ----------
  function drawBar() {
    bar.textContent = ""; var tot = total() || 1;
    blocks.forEach(function (b, i) {
      var w = el("div", { class: "hb" + (i === sel ? " on" : ""), style: "flex:0 0 " + b.d / tot * 100 + "%", title: (b.f.title || "") + " · " + fmt(b.s) + " → " + fmt(b.s + b.d) + " · clique pour le modifier" }, [
        el("b", { text: String(i + 1) }), el("span", { text: (b.f.title || "").replace(/^.*? - /, "") }), el("small", { text: b.d.toFixed(1).replace(".", ",") + " s" }),
        el("button", { type: "button", class: "hbp", text: "▶", title: "Voir ce bloc en boucle", on: { click: function (e) { e.stopPropagation(); loopI = i; playSeq(i); } } }),
        el("button", { type: "button", class: "hbx", text: "×", title: "Retirer ce bloc", on: { click: function (e) { e.stopPropagation(); removeAt(i); } } })]);
      w.style.setProperty("--hue", b.hue);
      w.addEventListener("click", function () {
        if (bar._dragged) return; loopI = -1;
        if (i === sel && !(loaded === b.f.full && Math.abs(vid.currentTime - b.s) < .06)) { pause(); mode = "src"; load(b.f, b.s, false); return; } // curseur ailleurs : retour au début du bloc ; déjà au début : désélection
        selectBlock(i === sel ? -1 : i);
      });
      bar.appendChild(w);
    });
    if (!blocks.length) bar.appendChild(el("span", { class: "hint hbempty", text: "Aucun bloc : règle une sélection sur la vidéo ci-dessus puis « + Ajouter ce bloc »." }));
    drawRuler(); info.textContent = blocks.length + " bloc" + (blocks.length > 1 ? "s" : "") + " · durée du montage " + fmt(total()) + " · I / O : début / fin de la sélection · Entrée : ajouter le bloc · S : couper le bloc choisi · Suppr : retirer · espace : lecture · E : avant (1 à 3 appuis = plus vite) · Z ou J : arrière (idem) · K : pause · L : lecture";
    drawDet(); drawExp(); drawAdd();
  }
  hReorder(bar, function (from, to) { snap(); var cb = sel >= 0 ? blocks[sel] : null, x = blocks.splice(from, 1)[0]; blocks.splice(to, 0, x); sel = cb ? blocks.indexOf(cb) : -1; drawBar(); });
  function drawRuler() { // règle du montage : graduations toutes les 5 s (ou 10 / 30 / 60 s si long) ; le curseur de la souris y est affiché, cliquer-glisser balade le montage
    ruler.textContent = ""; var tot = total(); if (!tot) return; var step = tot > 600 ? 60 : tot > 240 ? 30 : tot > 90 ? 10 : 5;
    for (var t = step; t < tot; t += step) ruler.appendChild(el("i", { class: "hrt", style: "left:" + t / tot * 100 + "%" }, [el("span", { text: fmt(t).replace(/,\d+$/, "") })]));
  }
  function selectBlock(i) { sel = i; if (i >= 0) { src = blocks[i].f; drawBar(); load(src, blocks[i].s, false); } else { drawBar(); load(src, selFree().s, false); } }
  function removeAt(i) { snap(); loopI = -1; blocks.splice(i, 1); if (sel === i) sel = -1; else if (sel > i) sel--; cur = clamp(cur, 0, Math.max(0, blocks.length - 1)); drawBar(); }
  function addBlock() { // « + Ajouter ce bloc » : la sélection devient un bloc du montage ; la suivante démarre juste après
    if (sel >= 0) { selectBlock(-1); return; }
    snap(); var s = selFree(); if (EX || MAXT) { var rest = r3((EX || MAXT) - total()); if (rest < MIND) { hist.pop(); alert("Le montage fait déjà " + (EX || MAXT) + " s : raccourcis un bloc (poignées) pour faire de la place."); return; } s.d = r3(Math.min(s.d, rest)); }
    blocks.push({ id: ++uid, f: src, s: r3(s.s), d: r3(s.d), x: opt.phoneX, hue: hueFor(uid + 1) });
    var ns = Math.min(s.s + s.d, Math.max(0, src.dur - MIND)); selMem[src.key] = { s: r3(ns), d: r3(Math.max(MIND, Math.min(5, src.dur - ns))) };
    drawBar(); load(src, selMem[src.key].s, false);
  }
  function splitHere() { // coupe le bloc choisi en deux à l'image affichée
    var b = sel >= 0 ? blocks[sel] : null, t = sn(vid.currentTime); if (!b || loaded !== b.f.full || t < b.s + .2 || t > b.s + b.d - .2) return; snap();
    var n = { id: ++uid, f: b.f, s: r3(t), d: r3(b.s + b.d - t), x: b.x, hue: hueFor(uid + 1) }; b.d = r3(t - b.s); blocks.splice(sel + 1, 0, n); drawBar();
  }
  // ---------- vidéo source : frise entière, sélection (début / fin glissables), curseur ----------
  var dTrack = el("div", { class: "hdtrack" }), dReg = el("i", { class: "hdreg" }), dIn = el("b", { class: "hdh in", title: "Début" }), dOut = el("b", { class: "hdh out", title: "Fin" }), dPh = el("i", { class: "hdph" }), dLab = el("div", { class: "hdlab" });
  var dBlk = el("div", { class: "hdblks" }), tcur = el("span", { class: "hdtime" }), endL = el("i", { class: "tlend l", title: "Début de la vidéo" }), endR = el("i", { class: "tlend r", title: "Fin de la vidéo" });
  dTrack.appendChild(dBlk); dTrack.appendChild(endL); dTrack.appendChild(endR); dTrack.appendChild(dReg); dTrack.appendChild(dPh); dTrack.appendChild(dIn); dTrack.appendChild(dOut);
  var nav = tlNav(function () { return zw; }, function (w) { zw = w; drawDet(); }, function () { return src.dur; });
  det.appendChild(srcTabs); det.appendChild(dTrack); det.appendChild(nav.el); det.appendChild(dLab);
  function seg(el0, s0, d0) { var l = clamp(pcz(s0), 0, 100), r = clamp(pcz(s0 + d0), 0, 100); el0.hidden = r <= l; el0.style.left = l + "%"; el0.style.width = Math.max(0, r - l) + "%"; }
  // Règle de la frise source (Gus 27/11) : traits = images ; en zoomant, ils s'écartent ; en dézoomant on n'affiche pas toutes les images : un trait toutes les 2, 5, 10 images, puis chaque seconde, etc.
  function drawTicks() {
    var W = dTrack.clientWidth, w = zwin(), span = w[1] - w[0]; if (!W || span <= 0) return;
    var fps = Math.round(1 / FR), steps = [FR, FR * 2, FR * 5, FR * 10, 1, 2, 5, 10, 30, 60, 120, 300, 600];
    var i = 0; while (i < steps.length - 2 && steps[i] / span * W < 7) i++;
    var minor = steps[i], major = steps[Math.min(i + 1, steps.length - 1)]; if (major <= minor * 1.01) major = steps[Math.min(i + 2, steps.length - 1)];
    var px = function (st) { return st / span * W; }, off = function (st) { return -((w[0] % st) / span * W); };
    dTrack.style.backgroundImage = "linear-gradient(90deg, rgba(255,252,235,.34) 0 1px, transparent 1px), linear-gradient(90deg, rgba(255,252,235,.14) 0 1px, transparent 1px)";
    dTrack.style.backgroundSize = px(major) + "px 100%, " + px(minor) + "px 100%";
    dTrack.style.backgroundPosition = off(major) + "px 0, " + off(minor) + "px 0";
  }
  var zsrc = null;
  function drawDet() {
    drawTicks();
    if (zsrc !== src) { zsrc = src; zw = null; }
    var D = src.dur, a = act(), w = zwin(); dBlk.textContent = ""; // les parties déjà prises dans cette vidéo, en repères clairs
    blocks.forEach(function (b, i) { if (b.f === src && i !== sel) { var m = el("i", { class: "tlblk", title: "Bloc " + (i + 1) }); m.style.background = "hsla(" + b.hue + ",65%,55%,.38)"; m.style.borderColor = "hsl(" + b.hue + ",70%,62%)"; seg(m, b.s, b.d); dBlk.appendChild(m); } });
    dReg.className = "hdreg" + (sel >= 0 ? " blk" : ""); seg(dReg, a.s, a.d);
    dReg.style.background = sel >= 0 ? "hsla(" + blocks[sel].hue + ",70%,55%,.5)" : ""; dReg.style.outline = sel >= 0 ? "1px solid hsl(" + blocks[sel].hue + ",75%,65%)" : "";
    dIn.style.left = pcz(a.s) + "%"; dOut.style.left = pcz(a.s + a.d) + "%"; dIn.hidden = a.s < w[0] || a.s > w[1]; dOut.hidden = a.s + a.d < w[0] || a.s + a.d > w[1];
    endL.hidden = w[0] > 0; endR.hidden = w[1] < D - .001; // traits vifs : le début / la fin de la vidéo sont visibles (pas zoomé au maximum de ce côté)
    dLab.textContent = (src.title || "") + " · " + (sel >= 0 ? "bloc " + (sel + 1) + " (en modification)" : "sélection") + " : " + fmt(a.s) + " → " + fmt(a.s + a.d) + " (" + a.d.toFixed(1).replace(".", ",") + " s) sur " + fmt(D) + (zw ? " · zoom × " + (D / (w[1] - w[0])).toFixed(1).replace(".", ",") : "") + " · Option / Alt + molette = zoom";
    dLab.appendChild(tcur); nav.draw();
  }
  function drawAdd() {
    srcTabs.textContent = "";
    if (pool.length > 1) pool.forEach(function (f) { srcTabs.appendChild(el("button", { type: "button", class: "btn ghost" + (f === src ? " on" : ""), text: (f.title || f.key).replace(/^.*? - /, "").slice(0, 36), title: f.title, on: { click: function () { sel = -1; src = f; drawBar(); load(f, selFree().s, false); } } })); });
    srcTabs.appendChild(el("button", { type: "button", class: sel >= 0 ? "btn orange" : "btn primary", text: sel >= 0 ? "+ Nouvelle sélection" : "+ Ajouter ce bloc", title: sel >= 0 ? "Quitte la modification du bloc (ou clique à nouveau le bloc)" : "Range la sélection dans le montage (Entrée)", on: { click: addBlock } }));
  }
  function tOf(e, track, a, b) { var r = track.getBoundingClientRect(); return sn(a + clamp((e.clientX - r.left) / r.width, 0, 1) * (b - a)); }
  function dragH(h, which) {
    h.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); try { h.setPointerCapture(e.pointerId); } catch (x) {} pause(); mode = "src"; if (sel >= 0) snap();
      function mv(ev) {
        if (EX && sel < 0 && room() < MIND) return; // montage plein : raccourcir un bloc d'abord
        var a = act(), t = tOf(ev, dTrack, zwin()[0], zwin()[1]), end = a.s + a.d;
        if (which === "in") { t = Math.min(t, end - MIND); a.s = r3(Math.max(0, t)); a.d = r3(end - a.s); if (a.d > room()) { a.d = room(); a.s = r3(end - a.d); } } else { t = Math.max(t, a.s + MIND); a.d = r3(Math.min(src.dur, t) - a.s); if (a.d > room()) a.d = room(); }
        load(src, which === "in" ? a.s : a.s + a.d - FR, false); /* sortie : on montre la dernière image du bloc */ drawDet(); if (sel >= 0) drawBarSoft();
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
  hoverCursor(dTrack, function (e) { return tOf(e, dTrack, zwin()[0], zwin()[1]); });
  scrubber(dTrack, function (e) { mode = "src"; load(src, tOf(e, dTrack, zwin()[0], zwin()[1]), false); }, function (e) { return e.target.closest(".hdh"); });
  dTrack.addEventListener("wheel", function (e) { // Option / Alt + molette : zoom autour de la souris ; Cmd / Ctrl + molette : déplacement dans la frise zoomée
    if ((e.metaKey || e.ctrlKey) && !e.altKey) { e.preventDefault(); e.stopPropagation(); nav.pan(e); return; }
    if (!e.altKey) return; e.preventDefault(); e.stopPropagation(); var D = src.dur, w = zwin(), r = dTrack.getBoundingClientRect(), t = w[0] + clamp((e.clientX - r.left) / r.width, 0, 1) * (w[1] - w[0]);
    var span = clamp((w[1] - w[0]) * Math.exp((e.deltaY || e.deltaX) * .002), Math.min(1, D), D), f = (t - w[0]) / (w[1] - w[0]), a = clamp(t - f * span, 0, D - span);
    zw = span >= D - .001 ? null : [a, a + span]; drawDet();
  }, { passive: false });
  hoverCursor(wrap, function (e) { return tOf(e, wrap, 0, total()); }); // le curseur traverse la règle et la frise des blocs
  scrubber(ruler, function (e) { seekSeq(tOf(e, ruler, 0, total())); });
  // ---------- export ----------
  function sources() { var seen = {}, l = []; blocks.forEach(function (b) { if (!seen[b.f.key]) { seen[b.f.key] = 1; l.push(b.f); } }); return l; }
  function gb(n) { return (n / 1e9).toFixed(1).replace(".", ",") + " Go"; }
  function drawExpHome() {
    exp.textContent = ""; var tot = total(), ok = Math.abs(tot - EX) < .06, diff = r3(EX - tot), fr = function (x) { return x.toFixed(1).replace(".", ","); };
    exp.appendChild(el("span", { class: "label", text: "Extrait de l'accueil" }));
    exp.appendChild(el("p", { class: ok ? "hint bok" : "hint berr", text: ok ? "✔ " + fr(tot) + " s : pile la durée d'un projet de l'accueil." : (diff > 0 ? "Il manque " + fr(diff) + " s" : "Il y a " + fr(-diff) + " s de trop") + " (durée voulue : " + fr(EX) + " s)." }));
    var fill = el("button", { type: "button", class: "btn ghost", text: "Compléter avec le dernier bloc", title: "Rallonge (ou raccourcit) le dernier bloc pour tomber pile sur " + fr(EX) + " s", disabled: ok || !blocks.length ? true : null, on: { click: function () {
      var b = blocks[blocks.length - 1], d = r3(b.d + diff); if (d < MIND || b.s + d > b.f.dur + .001) { alert(diff > 0 ? "Le dernier bloc va déjà jusqu'à la fin de la vidéo : prends plutôt une sélection de plus." : "Le dernier bloc deviendrait trop court."); return; } snap(); b.d = d; drawBar(); } } });
    var save = el("button", { type: "button", class: "btn primary", text: "Enregistrer pour l'accueil", disabled: ok ? null : true, on: { click: function () {
      var parts = blocks.map(function (b) { return { s: r3(b.s), d: r3(b.d), x: b.x === undefined ? (opt.phoneX === undefined ? 50 : opt.phoneX) : b.x }; });
      if (opt.onSave) opt.onSave(parts, { zoom: zm, phoneZoom: split ? zph : undefined, zoomPos: [Math.round(zpos[0] * 1000) / 10, Math.round(zpos[1] * 1000) / 10] }); close(); } } });
    exp.appendChild(fill); exp.appendChild(save);
    exp.appendChild(el("p", { class: "hint", text: "Cadrage téléphone : clique un bloc, puis glisse la bande rouge sur la vidéo. Chaque bloc a le sien." }));
  }
  function drawExpSnip() {
    exp.textContent = ""; var tot = total(), ok = tot > 0 && tot <= MAXT + .01, fr = function (x) { return x.toFixed(1).replace(".", ","); };
    exp.appendChild(el("span", { class: "label", text: "Extrait de la vidéo" }));
    exp.appendChild(el("p", { class: ok ? "hint bok" : "hint berr", text: tot ? fr(tot) + " s sur " + MAXT + " s au plus" + (ok ? "" : " : trop long") : "Aucun bloc." }));
    exp.appendChild(el("button", { type: "button", class: "btn primary", text: "Valider l'extrait", disabled: ok ? null : true, on: { click: function () {
      var parts = blocks.map(function (b) { return { s: r3(b.s), d: r3(b.d) }; }); if (opt.onSave) opt.onSave(parts); close(); } } }));
    exp.appendChild(el("p", { class: "hint", text: "L'extrait est lu en boucle sur le site et dans les bandes, sans le son." }));
  }
  function drawExp() {
    if (EX) { drawExpHome(); return; } if (SNIP) { drawExpSnip(); return; }
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
        ov.remove(); window.removeEventListener("keydown", onKey, true);
        if (opt.onVersion) opt.onVersion({ id: "v" + id, name: name, parts: blocks.map(function (b) { return { s: r3(b.s), d: r3(b.d) }; }), quality: q, enc: { path: reqV.path, id: id }, at: new Date().toISOString(), by: by });
      }, fail);
      return;
    }
    var f0 = blocks[0].f, req = encFile("film", [{ id: id, kind: "edit", quality: q, parts: parts }]);
    var item = { key: "e" + id, kind: "video", title: name, dir: f0.dir || "", prod: f0.prod || "", dops: (f0.dops || []).slice(), types: (f0.types || []).slice(), cats: [], src: "montage", at: new Date().toISOString(), by: by,
      enc: { path: req.path, id: id }, montage: { from: sources().map(function (f) { return f.key; }), quality: q, parts: blocks.map(function (b) { return { from: b.f.key, s: r3(b.s), d: r3(b.d) }; }) } };
    if (f0.client) item.client = f0.client;
    commit([req, { path: BIB_LIB, edit: function (t) { var L = t ? JSON.parse(t) : { items: [] }; L.items = (L.items || []).filter(function (x) { return x.key !== item.key; }); L.items.push(item); return json(L); } }], "Montage : export (admin, " + by + ")")
      .then(function () { ov.remove(); window.removeEventListener("keydown", onKey, true); if (opt.onCreated) opt.onCreated(item); alert("Montage « " + name + " » envoyé au robot. Il apparaîtra dans le video club (⟳ encodage en cours) dans quelques minutes."); }, fail);
  }
  // ---------- clavier ----------
  function onKey(e) {
    if (!ov.isConnected) { window.removeEventListener("keydown", onKey, true); return; }
    var k = e.key;
    if (e.target && e.target.matches && e.target.matches("input:not([type=radio]):not([type=checkbox]), textarea") && !box.contains(e.target)) e.target.blur(); // champ de recherche du dessous
    if (e.target && e.target.matches && e.target.matches("input:not([type=radio]):not([type=checkbox]), textarea") && box.contains(e.target)) { if (k === "Enter" || k === "Escape") { e.stopImmediatePropagation(); e.target.blur(); } else e.stopImmediatePropagation(); return; }
    if ((e.ctrlKey || e.metaKey) && /^[zZyY]$/.test(k)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (/^[yY]$/.test(k) || e.shiftKey) redo(); else undo(); return; } // annuler / rétablir ici (et pas dans la fenêtre du dessous)
    if (/^[zZjJ]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (!e.repeat) startRev(revOn ? Math.min(3, lvl + 1) : 1); return; }
    if (/^[eE]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (e.repeat) return; if (playing && !revOn) setSpd(Math.min(3, lvl + 1)); else { stopRev(); setSpd(0); if (mode === "seq") playSeq(); else playSrc(); setSpd(1); } return; }
    if (/^[kK]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); pause(); return; }
    if (/^[lL]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); setSpd(0); if (!playing || revOn) { if (mode === "seq") playSeq(); else playSrc(); } return; }
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); close(); return; }
    if (k === " ") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (revOn) { pause(); return; } if (playing) pause(); else if (mode === "seq") playSeq(); else playSrc(); return; }
    if (k === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (!e.repeat) addBlock(); return; }
    if ((k === "Delete" || k === "Backspace") && sel >= 0) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); removeAt(sel); return; }
    if (/^[sS]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); splitHere(); return; }
    if (/^[iIoO]$/.test(k) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (loaded !== src.full || (EX && sel < 0 && room() < MIND)) return; var t = sn(vid.currentTime), a = act(), end = a.s + a.d; if (sel >= 0) snap();
      if (/i/i.test(k)) { a.s = r3(clamp(t, 0, src.dur - MIND)); a.d = r3(Math.max(MIND, (t > end - MIND ? Math.min(src.dur, t + 1) : end) - a.s)); }
      else { var e1 = Math.min(src.dur, t + FR); a.d = r3(Math.max(MIND, e1 - a.s)); if (e1 < a.s + MIND) { a.s = r3(Math.max(0, e1 - MIND)); a.d = MIND; } } // sortie : l'image sous le curseur est comprise (le bloc va jusqu'au trait de l'image d'après, comme dans un logiciel de montage)
      if (a.d > room()) a.d = r3(Math.max(MIND, room()));
      drawBar(); return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); pause(); var st = (e.shiftKey ? 1 : FR) * (k === "ArrowLeft" ? -1 : 1); if (loaded === src.full) vid.currentTime = clamp(sn(vid.currentTime + st), 0, src.dur); }
  }
  window.addEventListener("keydown", onKey, true);
  function close() { pause(); window.removeEventListener("keydown", onKey, true); ov.remove(); if (opt.onClose) { var f = opt.onClose; opt.onClose = null; f(); } }
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  box.addEventListener("click", function (e) { // clic dans le vide de la fenêtre : le bloc choisi est désélectionné
    if (sel < 0 || e.target.closest("button, input, select, label, .hb, .hdtrack, .hdh, .hphone, video, canvas, .tlnav, .hbwrap, .hmphone")) return; selectBlock(-1);
  });
  // ---------- assemblage de la fenêtre ----------
  box.appendChild(el("div", { class: "hhead" }, [el("span", { class: "label", text: opt.mode === "version" ? "Edit de la vidéo" : EX ? "Extrait de l'accueil" : SNIP ? "Extrait (" + MAXT + " s au plus)" : "Bout à bout" }), nameI, undoB, redoB, el("button", { type: "button", class: "btn ghost", text: "Fermer", on: { click: close } })]));
  box.appendChild(el("div", { class: "hmain" }, [el("div", { class: "hvid" + (EX ? " hvhome" : "") }, [EX ? zbox : "", el("div", { class: EX ? "hvrow" : "" }, [EX ? phoneCv : "", el("div", { class: "hvw" }, [vid, pband])]), el("div", { class: "hctl" }, [
    el("button", { type: "button", class: "btn ghost", text: "▶ / ❚❚ Source", title: "Lire la vidéo source (espace)", on: { click: function () { if (playing && mode === "src") pause(); else playSrc(); } } }),
    el("button", { type: "button", class: "btn ghost", text: "▶ Montage", title: "Lire le montage, blocs bout à bout", on: { click: function () { if (playing && mode === "seq") pause(); else { loopI = -1; playSeq(0); } } } }),
    el("button", { type: "button", class: "btn ghost", text: "✂ Couper le bloc ici (S)", on: { click: splitHere } })])]), exp]));
  box.appendChild(det); box.appendChild(el("span", { class: "label hmlab", text: "Montage · glisse un bloc pour changer l'ordre, clique-glisse sur la règle pour balader la lecture" })); box.appendChild(wrap); box.appendChild(info);
  ov.appendChild(box); document.body.appendChild(ov);
  undoBtns(); drawZoom(); applyZoom(); drawBar(); load(src, act().s, false); tick();
}
