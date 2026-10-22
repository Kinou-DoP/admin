// Robot GitHub (Actions) : ajoute le film complet (`full`) qui manque, lu sur Slate :
// - slides de data/home.json, sur la bande Slate de l'accueil (`reel`) ;
// - vidéos ajoutées sous un film (`extras`, accueil et data/dps/*.json), sur leur page Slate (`link`) ;
// - images des projets en images seulement (`overrides[<id>].images`), sur le bundle Slate du chef op.
// (Les fonctions Netlify du site sont figées faute de crédits : l'admin ne reçoit que l'extrait de ces vidéos.) Même lecture que readReel (repo site, netlify/functions/slate.mjs) :
// playlist du lecteur (attribut data-media), stream de plus grande hauteur. Les adresses viennent de Slate, rien n'est inventé.
import fs from "fs";

const FILE = "data/home.json", DPS = "data/dps", ORIGIN = "https://kinou.slateapp.com";

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
function playlist(html) {
  var i = html.indexOf('data-media="');
  if (i < 0) return null;
  i += 12;
  return JSON.parse(decode(html.slice(i, html.indexOf('"', i))));
}
function full(m) {
  var streams = Object.values(m.streams || {}).filter(function (s) { return s.file && s.file.remote_address; });
  streams.sort(function (a, b) { return b.stream_type.y_size - a.stream_type.y_size; });
  return streams[0] ? streams[0].file.remote_address : "";
}

// Vidéos sous un film : page Slate « work » de la vidéo -> stream de plus grande hauteur.
async function fillExtras(list) {
  var n = 0;
  for (var x of list || []) {
    if (x.full || x.stills || !x.link || !/^https:\/\/kinou\.slateapp\.com\/work\//.test(x.link)) continue;
    try {
      var m = playlist(await page(x.link)), f = m && m[0] && full(m[0]);
      if (f) { x.full = f; n++; }
    } catch (e) { console.log("Lecture impossible : " + x.link + " (" + e.message + ")"); }
  }
  return n;
}
// Projets en images seulement (type « illustration » sur Slate) : leurs images, lues sur le bundle du chef op,
// vont dans overrides[<id>].images (galerie du lecteur) ; elles suivent Slate à chaque passage du robot.
async function fillImages(dp) {
  var id = (String(dp.bundle || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];
  if (!id) return 0;
  var root = await page(ORIGIN + "/bundles/" + id), re = new RegExp('href="/bundles/' + id + '/(\\d+)"', "g"), m, nums = [];
  while ((m = re.exec(root))) if (nums.indexOf(m[1]) < 0) nums.push(m[1]);
  var found = {};
  for (var n of nums) (playlist(await page(ORIGIN + "/bundles/" + id + "/" + n)) || []).forEach(function (x) {
    var ims = (x.images || []).map(function (im) { return im.image_player_url; }).filter(Boolean);
    if (ims.length && !Object.keys(x.streams || {}).length) found[x.id] = ims;
  });
  var k = 0;
  dp.overrides = dp.overrides || {};
  Object.keys(found).forEach(function (sid) {
    var o = dp.overrides[sid] || {};
    if (JSON.stringify(o.images) === JSON.stringify(found[sid])) return;
    o.images = found[sid]; dp.overrides[sid] = o; k++;
  });
  return k;
}
// Fiches à relire : celles du dernier envoi (CHANGED, liste de chemins), ou toutes (lancement manuel, ALL=1).
var changedList = (process.env.CHANGED || "").split(/\s+/).filter(Boolean);
var total = 0, imgs = 0;
for (var name of fs.readdirSync(DPS).filter(function (f) { return f.endsWith(".json") && f !== "index.json"; })) {
  var path = DPS + "/" + name, dp = JSON.parse(fs.readFileSync(path, "utf8")), k = 0;
  if (process.env.ALL || changedList.indexOf(path) > -1) {
    try { var ki = await fillImages(dp); k += ki; imgs += ki; } catch (e) { console.log("Bundle illisible pour " + name + " : " + e.message); }
  }
  for (var id in dp.overrides || {}) k += await fillExtras(dp.overrides[id].extras);
  if (k) { fs.writeFileSync(path, JSON.stringify(dp, null, 2) + "\n"); total += k; }
}

var home = JSON.parse(fs.readFileSync(FILE, "utf8")), changed = false;
for (var s0 of home.slides || []) if (await fillExtras(s0.extras)) changed = true;
for (var id0 in home.overrides || {}) if (await fillExtras(home.overrides[id0].extras)) changed = true;
var missing = (home.slides || []).filter(function (s) { return s.slate && !s.full; });
if (home.reel && missing.length) {
  var html = await page(home.reel), media = playlist(html);
  if (!media) { // bundle : on prend son premier showreel (comme l'admin)
    var b = html.match(/href="(\/bundles\/[0-9a-f-]{36}\/\d+)"/);
    if (b) media = playlist(await page(ORIGIN + b[1]));
  }
  if (!media) throw new Error("aucun film sur la bande " + home.reel);
  var byId = {};
  media.forEach(function (m) { var f = full(m); if (f) byId[m.id] = f; });
  var n = 0;
  missing.forEach(function (s) { if (byId[s.slate]) { s.full = byId[s.slate]; n++; } });
  if (n) changed = true;
  console.log(n + " film(s) complet(s) de l'accueil ajouté(s) sur " + missing.length + " manquant(s).");
}
if (changed) fs.writeFileSync(FILE, JSON.stringify(home, null, 2) + "\n");
console.log(total + " modification(s) dans les fiches, dont " + imgs + " projet(s) en images." + (changed ? " Accueil modifié." : ""));
