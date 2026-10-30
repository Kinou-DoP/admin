// Robot GitHub (Actions) : lit Slate pour l'admin, à la place des fonctions Netlify du site (coupées : « Usage exceeded », 30/10).
// L'admin dépose une demande dans data/ask/<horodatage>.json = { items: [{ kind, link }], at, by } ;
// kind = "bundle" (fiche : « Relire le bundle », import), "stills" (lien de stills ou de vidéo sous un film), "reel" (bande de l'accueil).
// Le robot écrit la réponse dans le même fichier (items[].answer ou items[].error, doneAt) ; l'admin la relit.
// Chaque passage traite toutes les demandes sans réponse et supprime celles qui ont plus d'un jour.
import fs from "fs";
import { readBundle, readStills, readReel } from "./slate.mjs";

const DIR = "data/ask";

async function bundle(link) {
  var s = String(link || "").trim(), id = (s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];
  if (!id) {
    var c = s.match(/(?:shots\.re|slt\.re)\/([A-Za-z0-9]{3,20})/) || s.match(/^([A-Za-z0-9]{3,20})$/);
    if (!c) throw new Error("lien invalide");
    var r = await fetch("https://shots.re/" + c[1]);
    id = (r.url.match(/\/bundles\/([0-9a-f-]{36})/) || [])[1];
    if (!id) throw new Error("ce lien shots.re ne mène pas à un bundle Slate");
  }
  var d = await readBundle(id);
  d.bundle = "https://kinou.slateapp.com/bundles/" + id;
  return d;
}
async function read(x) {
  if (x.kind === "bundle") return bundle(x.link);
  if (x.kind === "stills") return readStills(x.link);
  if (x.kind === "reel") return readReel(x.link, x.max || 10);
  throw new Error("demande inconnue : " + x.kind);
}

if (fs.existsSync(DIR)) {
  for (var f of fs.readdirSync(DIR).filter(function (n) { return n.endsWith(".json"); })) {
    var p = DIR + "/" + f, d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { fs.unlinkSync(p); continue; }
    if (d.doneAt) { if (Date.now() - Date.parse(d.doneAt) > 86400000) fs.unlinkSync(p); continue; }
    for (var x of d.items || []) {
      try { x.answer = await read(x); } catch (e) { x.error = String(e.message || e); }
      console.log(x.kind + " " + x.link + " : " + (x.error || "ok"));
    }
    d.doneAt = new Date().toISOString();
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
  }
}
