// Récupération
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

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
        return h.indexOf(w.join(" ")) > -1;
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
