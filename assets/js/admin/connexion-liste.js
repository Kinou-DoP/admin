// Connexion, liste des chefs op, avancement des fiches
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Connexion ----------
  function login(t) {
    token = t;
    // Accès « website » (Gus 17/11) : seulement si la clé peut écrire dans le dépôt admin. Test sans effet : on enregistre un
    // fichier vide (blob jamais relié à un commit, toujours le même). Clé limitée au dépôt notes = festivals, sélections,
    // récupération et sorties seulement (rubrique website cachée) : c'est GitHub qui l'empêche, pas seulement l'admin.
    var canW = gh("/repos/" + REPO + "/git/blobs", { method: "POST", untracked: true, body: { content: "", encoding: "utf-8" } }).then(function () { return true; }, function () { return false; });
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
      // Source des vidéos (Gus 27/11) : en haut à gauche ; Slate = secours en cas de panne chez nous (site + admin), Cloudflare plus tard.
      var srcSel = el("select", { class: "srcsel", title: "D'où le site et l'admin lisent les vidéos et les images" }, [
        el("option", { value: "nous", text: "Video club (Amazon)" }), el("option", { value: "slate", text: "Slate (secours)" }), el("option", { value: "cf", text: "Cloudflare (bientôt)", disabled: true })]);
      srcSel.value = srcVideo; var srcNote = el("span", { class: "hint", text: canWeb ? "" : "lecture seule" }); srcSel.disabled = !canWeb;
      srcSel.addEventListener("change", function () {
        var v = srcSel.value; srcNote.textContent = "Enregistrement…";
        commit([{ path: "data/source.json", text: json({ video: v, at: new Date().toISOString(), by: user && user.login || "" }) }], "Source des vidéos : " + (v === "slate" ? "Slate" : "video club") + " (admin, " + (user && user.login || "") + ")")
          .then(function () { setSource(v); srcNote.textContent = "Enregistré : le site lira les vidéos " + (v === "slate" ? "chez Slate" : "chez nous") + " (compter 5 minutes)."; }, function (e) { srcSel.value = srcVideo; srcNote.textContent = "Pas enregistré : " + e.message; });
      });
      view.insertBefore(el("div", { class: "srcrow" }, [el("label", { class: "label", text: "Source vidéo" }), srcSel, srcNote]), view.firstChild);
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
