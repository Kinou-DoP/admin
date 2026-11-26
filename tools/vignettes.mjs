// Vignettes réduites chez nous (Gus 26/11) : remplace le service d'images de Slate (images.slatecdn.net, qui réduit les images à la
// volée). Pour chaque image copiée de Slate dans le compartiment kinou-videos (vignettes des films, photos des galeries, stills des
// fiches : liste privée `prive-…/liste.json`, voir copie-slate.mjs), deux versions WebP légères : 800 et 1600 px de large au plus,
// rangées sous `thumbs/<chemin de l'image sans extension>-<largeur>.webp` → https://d3toxii6rvamjf.cloudfront.net/thumbs/…
// Le site (thumb() d'app.js) retrouve le chemin de l'image dans l'adresse signée de Slate (base64) et prend la nôtre, Slate en secours.
// Déjà faite = sautée (relancer ne refait que ce qui manque). Rien n'est supprimé. Journaux sans adresses (dépôt public).
// Variables : CONC (en parallèle, 16), MINUTES (temps de travail, 300), MAX (nombre d'images au plus, pour un essai).
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync, mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.AWS_ROLE_COPIE) { // accès Amazon renouvelé tout seul (voir copie-slate.mjs)
  const dossier = mkdtempSync(join(tmpdir(), "aws-"));
  writeFileSync(join(dossier, "config"), "[profile robot]\nregion = " + (process.env.AWS_REGION || "eu-north-1") +
    "\ncredential_process = node " + join(process.cwd(), "tools", "aws-cle.mjs") + "\n");
  ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"].forEach((k) => delete process.env[k]);
  process.env.AWS_CONFIG_FILE = join(dossier, "config");
  process.env.AWS_PROFILE = "robot";
}
const BUCKET = process.env.BUCKET || "kinou-videos", W = [800, 1600];
const CONC = Math.max(1, parseInt(process.env.CONC || "16", 10)), FIN = Date.now() + parseInt(process.env.MINUTES || "300", 10) * 60000;
const MAX = parseInt(process.env.MAX || "0", 10);
const IMG = /\.(jpe?g|png|webp|gif|tiff?)$/i;

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d)); p.on("close", (code) => resolve({ code, out, err }));
  });
}
async function liste() {
  let r = await run("aws", ["s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", "prive-", "--delimiter", "/", "--query", "CommonPrefixes[].Prefix", "--output", "json"]);
  const d = r.code === 0 ? JSON.parse(r.out || "null") || [] : [];
  if (d.length !== 1) throw new Error("liste privée introuvable");
  r = await run("aws", ["s3", "cp", "s3://" + BUCKET + "/" + d[0] + "liste.json", "-", "--only-show-errors"]);
  if (r.code !== 0) throw new Error("liste privée illisible");
  const cles = new Set();
  JSON.parse(r.out).medias.forEach((m) => m.fichiers.forEach((f) => { if (IMG.test(f.cle)) cles.add(f.cle); }));
  if (existsSync("tools/copie-liste.json")) JSON.parse(readFileSync("tools/copie-liste.json", "utf8")).forEach((f) => { if (IMG.test(f.cle)) cles.add(f.cle); }); // fichiers ajoutés depuis (robot copie-liste)
  return [...cles];
}
async function faites() {
  const r = await run("aws", ["s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", "thumbs/", "--query", "Contents[].Key", "--output", "json"]);
  if (r.code !== 0) throw new Error("liste des vignettes impossible : " + r.err.trim().slice(0, 200));
  return new Set(JSON.parse(r.out || "null") || []);
}
const nom = (cle, w) => "thumbs/" + cle.replace(/\.[a-z0-9]+$/i, "") + "-" + w + ".webp";

const tout = await liste(), deja = await faites();
let file = tout.filter((c) => W.some((w) => !deja.has(nom(c, w))));
console.log("Images : " + tout.length + " ; déjà faites : " + (tout.length - file.length) + " ; à faire : " + file.length + (MAX ? " (essai : " + MAX + " au plus)" : ""));
// D'abord les images affichées par le site (fiches, accueil, spotlight, fiction, video club : data/ de ce dépôt) : sans elles, le
// site charge l'image de Slate (PNG jusqu'à 2 Mo) après un essai raté chez nous (Gus 25/11 : vignettes très lentes).
function duSite() {
  const vus = new Set(), fichiers = [];
  const lire = (d) => { if (!existsSync(d)) return; for (const n of readdirSync(d, { withFileTypes: true })) { const c = join(d, n.name);
    if (n.isDirectory()) { if (!/^(img|encode|ask|b)$/.test(n.name)) lire(c); } else if (n.name.endsWith(".json")) fichiers.push(c); } };
  lire("data");
  for (const f of fichiers) {
    const txt = readFileSync(f, "utf8"), re = /https:\/\/images\.slatecdn\.net\/[^/"]+\/([^"]+)/g; let m;
    while ((m = re.exec(txt))) {
      const b = m[1].split(/[?#]/)[0].split("/").filter((x) => !x.includes(":")).join("").replace(/\.[a-z0-9]+$/i, "");
      try {
        const o = Buffer.from(b.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
        const k = /(kinou\/production\/.+)\.[a-z0-9]+$/i.exec(decodeURIComponent(new URL(o).pathname));
        if (k) vus.add(k[1]);
      } catch (e) {}
    }
  }
  return vus;
}
const site = duSite(), sansExt = (c) => c.replace(/\.[a-z0-9]+$/i, "");
file.sort((a, b) => (site.has(sansExt(b)) ? 1 : 0) - (site.has(sansExt(a)) ? 1 : 0));
console.log("Images du site à faire en premier : " + file.filter((c) => site.has(sansExt(c))).length);
if (MAX) file = file.slice(0, MAX);
const stats = { faites: 0, erreurs: [], octets: 0 };
let i = 0, suite = false;
async function ouvrier() {
  const dir = mkdtempSync(join(tmpdir(), "v-"));
  while (i < file.length) {
    if (Date.now() > FIN) { suite = true; break; }
    const k = i++, cle = file[k], src = join(dir, "src");
    try {
      let r = await run("aws", ["s3", "cp", "s3://" + BUCKET + "/" + cle, src, "--only-show-errors"]);
      if (r.code !== 0) throw new Error("lecture : " + r.err.trim().slice(0, 120));
      for (const w of W) {
        if (deja.has(nom(cle, w))) continue;
        const out = join(dir, "o" + w + ".webp");
        r = await run("convert", [src + "[0]", "-auto-orient", "-resize", w + "x" + w * 2 + ">", "-strip", "-quality", "80", "webp:" + out]);
        if (r.code !== 0) throw new Error("réduction : " + r.err.trim().slice(0, 120));
        r = await run("aws", ["s3", "cp", out, "s3://" + BUCKET + "/" + nom(cle, w), "--only-show-errors", "--content-type", "image/webp",
          "--cache-control", "public, max-age=31536000, immutable"]);
        if (r.code !== 0) throw new Error("envoi : " + r.err.trim().slice(0, 120));
      }
      stats.faites++;
      if (stats.faites % 250 === 0) console.log(new Date().toISOString().slice(11, 19) + " " + stats.faites + " / " + file.length);
    } catch (e) { stats.erreurs.push("image n° " + (k + 1) + " : " + String(e.message).split(cle).join("<image>")); }
  }
  rmSync(dir, { recursive: true, force: true });
}
await Promise.all(Array.from({ length: CONC }, ouvrier));
const res = ["## Vignettes réduites (800 et 1600 px, WebP)", "- Images : " + tout.length + " ; faites ce passage : " + stats.faites + " / " + file.length,
  "- Erreurs : " + stats.erreurs.length, suite ? "- Temps écoulé : passage suivant lancé tout seul" : "- Terminé."];
if (stats.erreurs.length) res.push("", ...stats.erreurs.slice(0, 50).map((e) => "- " + e));
console.log(res.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, res.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "suite=" + (suite ? "1" : "") + "\n");
process.exit(stats.erreurs.length > stats.faites ? 1 : 0);
