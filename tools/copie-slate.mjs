// Copie de Slate vers Amazon S3 (compartiment kinou-videos, Stockholm), sans disque : chaque fichier est lu sur le CloudFront
// de Slate et envoyé en flux vers S3 (curl | aws s3 cp -). Lancé par .github/workflows/copie-slate.yml (accès Amazon sans clé,
// rôle kinou-robot-copie). Aucune dépendance npm : fetch natif de Node + l'outil aws installé sur les machines de GitHub.
//
// Pour chaque média Slate (page publique kinou.slateapp.com/work/<id>.id, attribut data-media) : original (original_file),
// versions web (streams), extraits (snippets), vignette choisie (thumbnail). Le chemin est gardé tel quel :
//   https://d1ko11x0ybxl0h.cloudfront.net/<chemin>  →  s3://kinou-videos/<chemin>  →  https://<notre CloudFront>/<chemin>
// + slate/<id>.json : la fiche Slate du média (titre, crédits, adresses), pour la suite.
// Un fichier déjà présent avec la même taille est sauté : relancer le robot ne recopie que ce qui manque ou a changé.
// Ne supprime jamais rien (le rôle n'en a d'ailleurs pas le droit).
//
// Variables : IDS (liste « 108,10666 »), sinon FROM..TO ; MODE tout | originaux | web ; VERIFIER=1 (ne copie rien, liste ce qui
// manque) ; CONC (copies en parallèle, 6) ; MINUTES (temps de travail avant de passer la main, 300).

import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const BUCKET = process.env.BUCKET || "kinou-videos";
const ORIGIN = "https://kinou.slateapp.com";
const SLATE_CDN = "https://d1ko11x0ybxl0h.cloudfront.net/";
const UA = "Mozilla/5.0 (compatible; kinou-admin/1.0; +https://kinou.fr)";
const MODE = process.env.MODE || "tout";
const VERIFIER = process.env.VERIFIER === "1" || process.env.VERIFIER === "true";
const CONC = Math.max(1, parseInt(process.env.CONC || "6", 10));
const PAGES = 4; // pages Slate lues en parallèle (rester poli)
const FIN = Date.now() + parseInt(process.env.MINUTES || "300", 10) * 60000;
const IDS = (process.env.IDS || "").split(/[\s,;]+/).map(Number).filter(Boolean);
const FROM = parseInt(process.env.FROM || "1", 10), TO = parseInt(process.env.TO || "13000", 10);
const liste = IDS.length ? IDS : Array.from({ length: Math.max(0, TO - FROM + 1) }, (_, i) => FROM + i);

const TYPES = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", json: "application/json" };
const typeDe = (k) => TYPES[(k.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
const go = (n) => (n / 1e9).toFixed(2) + " Go";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, entree) {
  return new Promise((resolve) => {
    var p = spawn(cmd, args, { stdio: [entree == null ? "ignore" : "pipe", "pipe", "pipe"] }), out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    if (entree != null) p.stdin.end(entree);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|quot|amp|lt|gt|apos);/gi, function (m, e) {
    var k = e.toLowerCase();
    if (k === "quot") return '"'; if (k === "amp") return "&"; if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "apos") return "'";
    return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

// Page d'un média : null si Slate répond 404 (numéro inexistant ou supprimé).
async function media(id) {
  for (var essai = 0; essai < 4; essai++) {
    try {
      var r = await fetch(ORIGIN + "/work/" + id + ".id", { headers: { "User-Agent": UA, "Accept": "text/html,*/*" } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("Slate " + r.status);
      var html = await r.text(), blocs = [...html.matchAll(/data-media="([^"]*)"/g)];
      for (var b of blocs) {
        var d = JSON.parse(decode(b[1]));
        var m = (Array.isArray(d) ? d : [d]).find((x) => x && Number(x.id) === id);
        if (m) return m;
      }
      return null;
    } catch (e) { await pause(2000 * (essai + 1)); }
  }
  throw new Error("page illisible");
}

// Fichiers d'un média, selon MODE : [{ url, cle, taille, role }].
function fichiers(m) {
  var l = [];
  function ajoute(f, role) {
    if (!f || !f.remote_address || !f.remote_address.startsWith(SLATE_CDN)) return;
    var cle = decodeURIComponent(new URL(f.remote_address).pathname).slice(1);
    if (!l.some((x) => x.cle === cle)) l.push({ url: f.remote_address, cle, taille: Number(f.size) || 0, role });
  }
  // Image (illustration) : pas d'original_file, l'image elle-même est la vignette.
  if (MODE !== "web") ajoute(m.original_file || (m.type === "illustration" ? m.thumbnail : null), "original");
  if (MODE !== "originaux") {
    Object.values(m.streams || {}).forEach((s) => ajoute(s && s.file, "web"));
    Object.values(m.snippets || {}).forEach((s) => ajoute(s && s.file, "extrait"));
    ajoute(m.thumbnail, "vignette"); // la vignette choisie seulement (pas la vingtaine d'images proposées par Slate)
  }
  return l;
}

// Ce qui est déjà dans le compartiment : clé → taille.
async function existants() {
  var r = await run("aws", ["s3api", "list-objects-v2", "--bucket", BUCKET, "--query", "Contents[].[Key,Size]", "--output", "json"]);
  if (r.code !== 0) throw new Error("liste du compartiment impossible : " + r.err.trim());
  var m = new Map();
  (JSON.parse(r.out || "null") || []).forEach((x) => m.set(x[0], x[1]));
  return m;
}

async function taille(cle) {
  var r = await run("aws", ["s3api", "head-object", "--bucket", BUCKET, "--key", cle, "--query", "ContentLength", "--output", "text"]);
  return r.code === 0 ? Number(r.out.trim()) : -1;
}

// Copie en flux d'un fichier ; vérifie la taille à l'arrivée (un envoi coupé est recopié au passage suivant).
async function copie(f) {
  var script = 'set -o pipefail; curl -sSfL --retry 3 -A "$UA" "$URL" | aws s3 cp - "s3://$BUCKET/$CLE" --only-show-errors' +
    ' --storage-class INTELLIGENT_TIERING --content-type "$TYPE"' + (f.taille ? ' --expected-size "$TAILLE"' : "");
  for (var essai = 0; essai < 3; essai++) {
    var r = await new Promise((resolve) => {
      var p = spawn("bash", ["-c", script], { stdio: ["ignore", "ignore", "pipe"],
        env: Object.assign({}, process.env, { UA, URL: f.url, BUCKET, CLE: f.cle, TYPE: typeDe(f.cle), TAILLE: String(f.taille) }) });
      var err = ""; p.stderr.on("data", (d) => (err += d)); p.on("close", (code) => resolve({ code, err }));
    });
    if (r.code === 0 && (!f.taille || (await taille(f.cle)) === f.taille)) return true;
    f.erreur = (r.err || "taille différente à l'arrivée").trim().slice(0, 200);
    await pause(5000 * (essai + 1));
  }
  return false;
}

async function fiche(id, m, deja) {
  var cle = "slate/" + id + ".json", corps = JSON.stringify(m);
  if (deja.get(cle) === Buffer.byteLength(corps)) return;
  var r = await run("aws", ["s3", "cp", "-", "s3://" + BUCKET + "/" + cle, "--only-show-errors", "--content-type", "application/json"], corps);
  if (r.code !== 0) throw new Error("fiche " + id + " : " + r.err.trim());
}

const stats = { pages: 0, absents: 0, illisibles: [], aCopier: 0, copies: 0, octets: 0, sautes: 0, erreurs: [], manquants: [] };
var suite = null; // premier numéro pas traité (passage suivant)

const deja = await existants();
console.log("Déjà dans " + BUCKET + " : " + deja.size + " fichiers. Médias à voir : " + liste.length + (VERIFIER ? " (vérification seule)" : ""));

// File de copies, alimentée par la lecture des pages.
const file = [];
var lecture = true;
async function copieur() {
  while (lecture || file.length) {
    var f = file.shift();
    if (!f) { await pause(300); continue; }
    if (await copie(f)) { stats.copies++; stats.octets += f.taille; console.log("✓ " + f.cle + " (" + go(f.taille) + ")"); }
    else { stats.erreurs.push(f.id + " " + f.cle + " : " + f.erreur); console.log("✗ " + f.cle + " : " + f.erreur); }
  }
}
const copieurs = VERIFIER ? [] : Array.from({ length: CONC }, copieur);

var i = 0;
async function lecteur() {
  while (i < liste.length) {
    if (Date.now() > FIN || file.length >= CONC * 2) { if (Date.now() > FIN) { suite = suite == null ? liste[i] : Math.min(suite, liste[i]); return; } await pause(1000); continue; }
    var id = liste[i++], m;
    try { m = await media(id); } catch (e) { stats.illisibles.push(id); continue; }
    if (!m) { stats.absents++; continue; }
    stats.pages++;
    if (!VERIFIER) { try { await fiche(id, m, deja); } catch (e) { stats.erreurs.push(String(e.message)); } }
    for (var f of fichiers(m)) {
      if (deja.has(f.cle) && (!f.taille || deja.get(f.cle) === f.taille)) { stats.sautes++; continue; }
      stats.aCopier++; f.id = id;
      if (VERIFIER) stats.manquants.push(id + " " + f.role + " " + f.cle + " (" + go(f.taille) + ")");
      else file.push(f);
    }
  }
}
await Promise.all(Array.from({ length: PAGES }, lecteur));
lecture = false;
await Promise.all(copieurs);
if (suite != null && IDS.length) suite = null; // liste fixe : pas de reprise automatique

const res = [
  "## Copie Slate → Amazon (" + (VERIFIER ? "vérification" : "copie") + ", mode " + MODE + ")",
  "- Médias lus : " + stats.pages + " (numéros inexistants : " + stats.absents + ", pages illisibles : " + stats.illisibles.length + ")",
  "- Fichiers déjà présents : " + stats.sautes + " ; " + (VERIFIER ? "manquants : " + stats.aCopier : "copiés : " + stats.copies + " / " + stats.aCopier + " (" + go(stats.octets) + ")"),
  "- Erreurs : " + stats.erreurs.length,
  suite != null ? "- Temps écoulé : reprise au numéro " + suite + " (passage suivant lancé tout seul)" : "- Terminé pour cette liste.",
];
if (stats.illisibles.length) res.push("", "Pages illisibles : " + stats.illisibles.join(", "));
if (stats.erreurs.length) res.push("", "### Erreurs", ...stats.erreurs.slice(0, 100).map((e) => "- " + e));
if (stats.manquants.length) res.push("", "### Manquants" + (stats.manquants.length > 300 ? " (300 premiers)" : ""), ...stats.manquants.slice(0, 300).map((e) => "- " + e));
console.log(res.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, res.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "suite=" + (suite == null ? "" : suite) + "\n");
writeFileSync("copie-resultat.json", JSON.stringify({ suite, stats: Object.assign({}, stats, { manquants: stats.manquants.length }) }));
process.exit(stats.erreurs.length && !stats.copies && !VERIFIER ? 1 : 0);
