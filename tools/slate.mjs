// Copie de netlify/functions/slate.mjs du dépôt site (à garder identique) : lecture de Slate par le robot GitHub (tools/ask.mjs),
// depuis que les fonctions Netlify du site sont coupées (« Usage exceeded », 30/10).
// Lecture d'un bundle Slate : liste des showreels (#featured, #categorie…) puis, pour chaque
// showreel, la playlist du lecteur (attribut data-media) et les vignettes signées de la grille.
// Aucune dépendance : fetch natif de Node.

const ORIGIN = "https://kinou.slateapp.com";
const ALIASES = { MUSICVIDEO: "MUSIC VIDEO" };

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|quot|amp|lt|gt|apos);/gi, function (m, e) {
    var k = e.toLowerCase();
    if (k === "quot") return '"'; if (k === "amp") return "&"; if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "apos") return "'";
    return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}
async function page(url) {
  var r = await fetch(url);
  if (!r.ok) throw new Error("Slate " + r.status + " " + url);
  return r.text();
}
function catName(title) {
  var t = title.split("#").pop().trim().toUpperCase();
  return ALIASES[t.replace(/\s+/g, "")] || t;
}
function names(m, k) {
  return (m[k] || []).map(function (x) { return String(x.value).trim(); }).filter(Boolean).join(", ");
}
function clip(m, img, cat) {
  var sub = [names(m, "director"), names(m, "production")].filter(Boolean).join("\n");
  var streams = Object.values(m.streams || {}).filter(function (s) { return s.file && s.file.remote_address; });
  streams.sort(function (a, b) { return b.stream_type.y_size - a.stream_type.y_size; });
  var sn = m.snippets && m.snippets.small && m.snippets.small.file;
  var c = { title: String(m.title).trim() };
  if (sub) c.sub = sub;
  if (sn) c.video = sn.remote_address;
  if (streams[0]) c.full = streams[0].file.remote_address;
  if (img) c.img = img;
  // Projet en images seulement (type « illustration » sur Slate) : ses images = galerie de stills du lecteur.
  var ims = (m.images || []).map(function (im) { return im.image_player_url; }).filter(Boolean);
  if (ims.length && !c.video && !c.full) c.stills = ims;
  c.cat = cat;
  c.slate = m.id;
  return c;
}
function showreel(html) {
  var i = html.indexOf('data-media="');
  if (i < 0) throw new Error("playlist Slate introuvable");
  i += 12;
  var media = JSON.parse(decode(html.slice(i, html.indexOf('"', i))));
  // Vignette signée de chaque film : première image qui suit son repère data-playlist-item
  // (grille, ou grand visuel unique quand le showreel ne contient qu'un film).
  var imgs = {};
  html.split('data-playlist-item="').slice(1).forEach(function (chunk) {
    var n = parseInt(chunk, 10), m = chunk.match(/<img[^>]*?\ssrc="([^"]+)"/);
    if (!isNaN(n) && !imgs[n] && m) imgs[n] = decode(m[1]);
  });
  return media.map(function (m, k) {
    return { m: m, img: imgs[k] || (m.thumbnail && m.thumbnail.image_player_url) || null };
  });
}

// bundle : "https://kinou.slateapp.com/bundles/<uuid>" ou "<uuid>" -> { name, categories, clips }
export async function readBundle(bundle) {
  var id = (String(bundle).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/) || [])[1];
  if (!id) throw new Error("lien de bundle invalide");
  var root = await page(ORIGIN + "/bundles/" + id);
  var reels = [], re = new RegExp('href="/bundles/' + id + '/(\\d+)"[\\s\\S]*?<h2>([\\s\\S]*?)</h2>', "g"), m;
  while ((m = re.exec(root))) reels.push({ n: m[1], title: decode(m[2].trim()) });
  if (!reels.length) throw new Error("aucun showreel dans le bundle");
  var pages = await Promise.all(reels.map(function (r) { return page(ORIGIN + "/bundles/" + id + "/" + r.n).then(showreel); }));
  // L'ordre des onglets suit l'ordre des showreels dans le bundle (FEATURED compris).
  var categories = [], clips = [], byId = {}, featured = [];
  reels.forEach(function (r, k) {
    var cat = catName(r.title);
    if (categories.indexOf(cat) < 0) categories.push(cat);
    if (cat === "FEATURED") { featured = pages[k]; return; }
    // Un film peut figurer dans plusieurs catégories : une entrée par catégorie.
    pages[k].forEach(function (x) {
      if (clips.some(function (c) { return c.slate === x.m.id && c.cat === cat; })) return;
      var c = clip(x.m, x.img, cat);
      clips.push(c); if (!byId[x.m.id]) byId[x.m.id] = c;
    });
  });
  featured.forEach(function (x, k) {
    var c = byId[x.m.id];
    if (!c) clips.push(c = byId[x.m.id] = clip(x.m, x.img, ""));
    c.featured = true; c.featuredOrder = k + 1;
  });
  // Nom du chef op : celui qui est crédité (« Cinematographer ») sur le plus de films du bundle,
  // chaque film n'étant compté qu'une fois même s'il figure dans plusieurs showreels.
  var count = {}, artists = {};
  pages.forEach(function (p) { p.forEach(function (x) {
    if (artists[x.m.id]) return;
    artists[x.m.id] = (x.m.artists_names || []).map(function (n) { return String(n).trim(); }).filter(Boolean);
    artists[x.m.id].forEach(function (n) { count[n] = (count[n] || 0) + 1; });
  }); });
  var name = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0] || "";
  // Les autres chefs op crédités sur un film sont ajoutés en dernière ligne des crédits.
  clips.forEach(function (c) {
    var others = (artists[c.slate] || []).filter(function (n) { return n !== name; });
    if (others.length) c.sub = (c.sub ? c.sub + "\n" : "") + "co-DoP " + others.join(", ");
  });
  return { name: name, categories: categories, clips: clips };
}

// Galerie de stills ou vidéo : page Slate « work » (https://kinou.slateapp.com/work/<adresse>) ou lien court shots.re.
// Les images viennent de la playlist (data-media → images[].image_player_url), URLs signées copiées telles quelles.
export async function readStills(link) {
  var s = String(link || "").trim(), url;
  var w = s.match(/^https?:\/\/kinou\.slateapp\.com\/work\/([a-z0-9-]+)\/?(?:[?#].*)?$/i);
  var c = s.match(/^(?:https?:\/\/)?shots\.re\/([A-Za-z0-9]{3,20})\/?$/);
  if (w) url = ORIGIN + "/work/" + w[1].toLowerCase();
  else if (c) {
    var r = await fetch("https://shots.re/" + c[1]);
    var m = r.url.match(/^https:\/\/kinou\.slateapp\.com\/work\/([a-z0-9-]+)/i);
    if (!m) throw new Error("ce lien shots.re ne mène pas à une page de stills Slate");
    url = ORIGIN + "/work/" + m[1].toLowerCase();
  } else throw new Error("lien invalide : attendu https://kinou.slateapp.com/work/…");
  var html = await page(url), i = html.indexOf('data-media="');
  if (i < 0) throw new Error("images introuvables sur cette page Slate");
  i += 12;
  var media = JSON.parse(decode(html.slice(i, html.indexOf('"', i))))[0] || {};
  var title = String(media.title || "").trim();
  var stills = (media.images || []).map(function (im) { return im.image_player_url; }).filter(Boolean);
  if (stills.length) return { link: url, title: title, stills: stills };
  // Page d'une vidéo : film complet (1080p), extrait et image d'aperçu, pour l'afficher sous un autre film.
  var c = clip(media, media.thumbnail && media.thumbnail.image_player_url, "");
  if (c.full || c.video) return { link: url, title: title, full: c.full, video: c.video, img: c.img };
  throw new Error("ni images ni vidéo sur cette page Slate");
}

// Bande de l'accueil : n'importe quelle page Slate avec une playlist (showreel, page d'un bundle) ou un bundle
// (on prend alors son premier showreel), ou un lien shots.re. Renvoie les `max` premiers films.
export async function readReel(link, max) {
  var s = String(link || "").trim(), url;
  var c = s.match(/^(?:https?:\/\/)?shots\.re\/([A-Za-z0-9]{3,20})\/?$/);
  if (c) url = (await fetch("https://shots.re/" + c[1])).url;
  else url = s;
  var u = url.match(/^https:\/\/kinou\.slateapp\.com(\/[\w\/-]+)\/?(?:[?#].*)?$/);
  if (!u) throw new Error("lien invalide : attendu un lien kinou.slateapp.com ou shots.re");
  url = ORIGIN + u[1];
  var html = await page(url);
  if (html.indexOf('data-media="') < 0) {
    var b = html.match(/href="(\/bundles\/[0-9a-f-]{36}\/\d+)"/);
    if (!b) throw new Error("aucun film sur cette page Slate");
    html = await page(ORIGIN + b[1]);
  }
  var films = showreel(html).slice(0, max || 10).map(function (x) {
    var c = clip(x.m, x.img, ""), t = c.title, k = t.search(/\s[•·\-–—|]\s/);
    return {
      slate: c.slate, title: t,
      film: k > -1 ? t.slice(0, k).trim() : t, song: k > -1 ? t.slice(k + 3).trim() : "",
      legend: c.sub || "", video: c.video || "", full: c.full || "", img: c.img || "",
      artists: (x.m.artists_names || []).map(function (n) { return String(n).trim(); }).filter(Boolean)
    };
  });
  return { link: url, films: films };
}
