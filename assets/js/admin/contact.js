// Page du site : contact
// (Portée globale partagée avec les autres fichiers de assets/js/ ; ordre de chargement : voir index.html.)

  // ---------- Contact : data/contact.json (page contact du site) + data/site.json (logo du site) ----------
  var conf = null, ctc = null;
  function showContact() {
    bar.hidden = true; editing = false; view.textContent = "";
    view.appendChild(el("p", { class: "status", text: "Chargement…" }));
    Promise.all([readFile("data/site.json"), readFile("data/contact.json")]).then(function (r) {
      conf = r[0] || {}; ctc = r[1] || {};
      ctc.team = ctc.team || []; ctc.address = ctc.address || []; ctc.social = ctc.social || {};
      pending = {}; dirty = false; histReset(); renderContact();
    })
      .catch(function (e) { view.textContent = ""; view.appendChild(el("p", { class: "status err", text: e.message })); });
  }
  function renderContact() {
    view.textContent = ""; editing = true; pagePublish = publishContact;
    histInit({ get: function () { return { data: { conf: conf, ctc: ctc }, refs: Object.assign({}, pending) }; }, set: function (h) { var d = JSON.parse(h.data); conf = d.conf; ctc = d.ctc; pending = Object.assign({}, h.refs); renderContact(); } });
    view.appendChild(el("h1", { text: "Contact" }));
    view.appendChild(el("p", { class: "lead", text: "La page contact du site (lien « contact » de l'en-tête), présentée comme un générique de fin : le rôle à gauche, le nom à droite. Le rôle est écrit sur chaque ligne." }));
    // Équipe : une ligne par personne, dans l'ordre du site.
    var team = el("div", { class: "team" });
    function drawTeam() {
      team.textContent = "";
      ctc.team.forEach(function (t, i) {
        function inp(k, ph, type) {
          var x = el("input", { type: type || "text", placeholder: ph, value: t[k] || "" });
          x.addEventListener("input", function () { t[k] = x.value.trim(); });
          return x;
        }
        function btn(txt, title, fn, off) { var b = el("button", { class: "xbtn", type: "button", title: title, text: txt }); b.disabled = !!off; b.addEventListener("click", function () { fn(); drawTeam(); touch(); }); return b; }
        team.appendChild(el("div", { class: "tline" }, [inp("role", "Rôle (ex. Commercials)"), inp("name", "Prénom"), inp("email", "E-mail", "email"), inp("phone", "Téléphone", "tel"),
          btn("↑", "Monter", function () { ctc.team.splice(i - 1, 0, ctc.team.splice(i, 1)[0]); }, i === 0),
          btn("↓", "Descendre", function () { ctc.team.splice(i + 1, 0, ctc.team.splice(i, 1)[0]); }, i === ctc.team.length - 1),
          btn("×", "Retirer", function () { ctc.team.splice(i, 1); })]));
      });
      var add = el("button", { class: "btn ghost", type: "button", text: "+ Ajouter une personne" });
      add.addEventListener("click", function () { ctc.team.push({ role: "", name: "", email: "", phone: "" }); drawTeam(); touch(); var ins = team.querySelectorAll(".tline input"); if (ins.length) ins[ins.length - 4].focus(); });
      team.appendChild(add);
    }
    drawTeam();
    view.appendChild(el("section", {}, [el("h2", { text: "Équipe" }), team]));
    // Adresse, newsletter, réseaux
    var addr = el("textarea", { rows: "3", placeholder: "Une ligne par ligne d'adresse" }); addr.value = ctc.address.join("\n"); addr.style.minHeight = "0";
    addr.addEventListener("input", function () { ctc.address = addr.value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean); });
    var news = el("input", { type: "url", placeholder: "http://eepurl.com/…", value: ctc.newsletter || "" });
    news.addEventListener("input", function () { ctc.newsletter = news.value.trim(); });
    var newsL = el("input", { type: "text", placeholder: "Subscribe to the newsletter", value: ctc.newsletterLabel || "" });
    newsL.addEventListener("input", function () { ctc.newsletterLabel = newsL.value.trim(); });
    var soc = el("div", { class: "cols" });
    [["instagram", "Instagram"], ["vimeo", "Vimeo"], ["imdb", "IMDb"], ["facebook", "Facebook"]].forEach(function (x) {
      var i = el("input", { type: "url", placeholder: "https://…", value: ctc.social[x[0]] || "" });
      i.addEventListener("input", function () { ctc.social[x[0]] = i.value.trim(); });
      soc.appendChild(el("div", { class: "field" }, [el("label", { class: "label", text: x[1] }), i]));
    });
    view.appendChild(el("section", {}, [el("h2", { text: "Adresse et liens" }),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Adresse (cliquable sur le site : ouvre le plan)" }), addr]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Lien d'inscription à la newsletter" }), news,
          el("label", { class: "label", text: "Texte du bouton (entre crochets sur le site)" }), newsL])]),
      el("label", { class: "label", text: "Réseaux (un lien vide n'est pas affiché)" }), soc]));
    // Mentions légales
    var legal = el("textarea", { rows: "8", placeholder: "Texte des mentions légales (une ligne vide entre deux paragraphes)" }); legal.value = ctc.legal || "";
    legal.addEventListener("input", function () { ctc.legal = legal.value; });
    view.appendChild(el("section", {}, [el("h2", { text: "Mentions légales" }), legal,
      el("p", { class: "hint", text: "Obligatoires pour un site professionnel : nom de la société, forme juridique et capital, adresse du siège, numéro RCS (ou SIRET), numéro de TVA intracommunautaire, directeur de la publication, contact, et l'hébergeur du site (nom, adresse, téléphone). Une ligne seule et courte (« Éditeur », « Cookies »…) devient un titre. Vide = pas de lien « Mentions légales » sur le site." })]));
    var size = el("input", { type: "text", inputmode: "numeric", value: String(conf.logoHeight || 36) });
    size.addEventListener("input", function () { var v = parseInt(size.value, 10); if (v > 0) conf.logoHeight = v; drawPreview(); });
    var preview = el("div", { class: "logoprev" });
    function drawPreview() {
      preview.textContent = "";
      var p = pending.logo;
      if (p) preview.appendChild(el("img", { src: p.preview, alt: "logo", style: "height:" + (conf.logoHeight || 36) + "px" }));
      else if (conf.logo) loadImg("data/" + conf.logo, preview);
      else preview.appendChild(el("span", { class: "logotxt", text: "kinou" }));
    }
    function loadImg(path, box) {
      fetch("https://api.github.com/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" } })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) { if (b) box.appendChild(el("img", { src: URL.createObjectURL(b), alt: "logo", style: "height:" + (conf.logoHeight || 36) + "px" })); });
    }
    function drop() {
      var p = pending.logo, name = p ? "Nouveau logo : " + p.name : (conf.logo ? "Logo actuel : " + conf.logo.split("/").pop() : "");
      var z = dropZone("image/png,image/webp", "Glissez le logo ici : PNG blanc sur fond transparent (ou cliquez)", function (f) {
        if (!/^image\/(png|webp)$/.test(f.type)) { status("Le logo doit être un PNG (ou WebP).", "err"); return; }
        var fr = new FileReader();
        fr.onload = function () { pending.logo = { name: f.name, ext: f.type === "image/webp" ? "webp" : "png", base64: fr.result.split(",")[1], preview: fr.result }; z.replaceWith(drop()); drawPreview(); touch(); };
        fr.readAsDataURL(f);
      }, function () { delete pending.logo; delete conf.logo; z.replaceWith(drop()); drawPreview(); touch(); }, name);
      return z;
    }
    drawPreview();
    view.appendChild(el("section", {}, [el("h2", { text: "Logo (en haut au milieu du site)" }),
      el("div", { class: "cols" }, [
        el("div", { class: "field" }, [el("label", { class: "label", text: "Fichier" }), drop(),
          el("p", { class: "hint", text: "Sans logo, le site affiche « kinou » en texte. Même effet que le texte : il s'inverse sur les fonds clairs." })]),
        el("div", { class: "field" }, [el("label", { class: "label", text: "Aperçu" }), preview,
          el("label", { class: "label", text: "Hauteur (px, ordinateur ; 83 % sur téléphone)" }), size])
      ])]));
    bar.hidden = false; seeLink.href = SITE_VIEW + "/#contact"; seeLink.hidden = false;
    if (dirty) touch(); else status(flash || "", flash ? "ok" : ""); flash = "";
  }
  function publishContact() {
    publishBtn.disabled = true; status("Publication…");
    var files = [], out = Object.assign({}, conf);
    if (pending.logo) {
      // Nom unique à chaque envoi : aucun ancien logo gardé en cache par les navigateurs.
      out.logo = "brand/logo-" + Date.now().toString(36) + "." + pending.logo.ext;
      files.push({ path: "data/" + out.logo, base64: pending.logo.base64 });
    }
    if (!out.logo) delete out.logoHeight;
    files.push({ path: "data/site.json", text: json(out) });
    ctc.team = ctc.team.filter(function (t) { return t.name || t.email || t.phone; });
    files.push({ path: "data/contact.json", text: json(ctc) });
    commit(files, "Mise à jour du contact (admin, " + user.login + ")").then(function () {
      conf = out; pending = {}; dirty = false; histReset(); flash = "Publié. Rechargez le site pour voir les changements.";
      renderContact();
      refreshSite("home").catch(function () {});
    }).catch(function (e) { status("Échec de la publication : " + e.message, "err"); })
      .then(function () { publishBtn.disabled = false; });
  }
