// Robot de la bibliothèque de l'admin (Gus 22/11) : relit les bundles Slate des fiches, de la fiction, du spotlight et des
// imports de la bibliothèque, et écrit dans data/bibli/meta.json le client, les types de contenu, les mots-clés et la date de
// chaque film (par id Slate) : suggestions « Client » et « Type de contenu » de la recherche. Ne touche à rien d'autre.
import fs from "fs";
import { readMeta, shortBundle } from "./slate.mjs";

const OUT = "data/bibli/meta.json";
function json(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }
var links = [];
function add(l) { l = String(l || "").trim(); if (l && links.indexOf(l) < 0) links.push(l); }
for (var d of (json("data/dps/index.json") || {}).dps || []) { var f = json("data/dps/" + d.slug + ".json"); if (f && f.bundle) add(f.bundle); }
for (var p of ["data/fiction.json", "data/spotlight.json"]) { var x = json(p); if (x && x.reel) add(x.reel); }
for (var it of (json("data/bibli/library.json") || {}).items || []) if (/\/bundles\/|shots\.re\//.test(it.link || "")) add(it.link);

var meta = (json(OUT) || {}).films || {}, ok = 0, bad = 0;
for (var l of links) {
  try {
    var id = (l.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];
    if (!id) { var c = l.match(/(?:shots|slt)\.re\/([A-Za-z0-9]{3,20})/); id = c && await shortBundle(c[1]); }
    if (!id) throw new Error("bundle introuvable");
    var m = await readMeta(id);
    Object.keys(m).forEach(function (k) { meta[k] = m[k]; });
    ok++;
  } catch (e) { bad++; console.log(l + " : " + (e.message || e)); }
}
console.log(ok + " bundles lus, " + bad + " en erreur, " + Object.keys(meta).length + " films");
if (ok) fs.mkdirSync("data/bibli", { recursive: true }), fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), films: meta }) + "\n");
