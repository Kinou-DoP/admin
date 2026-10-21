// Robot GitHub (Actions) : ajoute à data/home.json le film complet (`full`) des slides qui n'en ont pas,
// en le lisant sur la bande Slate de l'accueil (`reel`). Même lecture que readReel (repo site, netlify/functions/slate.mjs) :
// playlist du lecteur (attribut data-media), stream de plus grande hauteur. Les adresses viennent de Slate, rien n'est inventé.
import fs from "fs";

const FILE = "data/home.json", ORIGIN = "https://kinou.slateapp.com";

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

var home = JSON.parse(fs.readFileSync(FILE, "utf8"));
var missing = (home.slides || []).filter(function (s) { return s.slate && !s.full; });
if (!home.reel || !missing.length) { console.log("Rien à compléter."); process.exit(0); }

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
if (n) fs.writeFileSync(FILE, JSON.stringify(home, null, 2) + "\n");
console.log(n + " film(s) complet(s) ajouté(s) sur " + missing.length + " manquant(s).");
