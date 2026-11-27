// Pages enregistrées tout de suite (imm) + festivals
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

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
  // Empreinte des champs saisissables : sert à savoir si quelqu'un a modifié ce que le robot a rempli (sinon la fiche reste « robot »).
  function festSnap(f) {
    return JSON.stringify(["name", "city", "country", "types", "est", "start", "end", "submit", "site", "selection", "note"].map(function (k) { return f[k] || ""; }).concat([(f.deadlines || []).filter(function (d) { return d.date || d.label; })]));
  }
  function festFill(f, a) {
    var n = 0;
    ["city", "country", "submit", "site", "selection", "note"].forEach(function (k) { if (!f[k] && a[k]) { f[k] = a[k]; n++; } });
    if (!f.name && a.name) { f.name = a.name; n++; }
    if (!(f.types || []).length && (a.types || []).length) { f.types = a.types; n++; }
    if ((!f.start || (f.est && !a.est)) && a.start) { f.start = a.start; f.end = a.end || a.start; if (a.est) f.est = true; else delete f.est; n++; }
    var dl = f.deadlines || [], firm = (a.deadlines || []).filter(function (d) { return !d.est; });
    if (!dl.length && (a.deadlines || []).length) { f.deadlines = a.deadlines; n++; }
    else if (dl.length && dl.every(function (d) { return d.est; }) && firm.length) { f.deadlines = a.deadlines; n++; }
    if (n) { f.filled = { by: "robot", at: new Date().toISOString(), sources: a.sources || [] }; if (f.source !== "human") f._snap = festSnap(f); } // _snap : jamais enregistré
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
        var untouched = f._snap && f._snap === festSnap(f) && f.source !== "human"; delete f._snap;
        if (untouched) { f.source = "robot"; delete f.editedBy; delete f.editedAt; } // rempli par le robot et rien changé : reste « robot »
        else { f.source = "human"; f.editedBy = user && user.login || ""; f.editedAt = new Date().toISOString(); } // modifié par quelqu'un : le robot n'y touche plus
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
