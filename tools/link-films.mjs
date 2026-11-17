// Films reliés (Gus 17/11) : un même film (même id Slate) peut être sur la page fiction, le spotlight et la fiche d'un chef op.
// Après une publication, ce qui a changé sur l'un est recopié sur les autres : infos du film (`info` : année, durée, caméra,
// synopsis, prix…) et stills / vidéos sous le film (`extras`, ancien `stills` + `stillsLink`). Le reste (titre corrigé, masqué,
// recadrage, affiche, statut, date, plateformes de la fiction…) reste propre à chaque page.
// Lancé par .github/workflows/home-full.yml, avant fill-home.mjs : CHANGED = fichiers du commit publié.
import fs from "node:fs";
import { execSync } from "node:child_process";

const SHARED = ["info", "extras", "stills", "stillsLink"];
const files = ["data/fiction.json", "data/spotlight.json"].concat(
  fs.readdirSync("data/dps").filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => "data/dps/" + f));
const changed = String(process.env.CHANGED || "").split(/\s+/).filter((f) => files.includes(f));
if (!changed.length && !process.env.ALL_LINK) { console.log("Films reliés : rien à faire."); process.exit(0); }

const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const before = (f) => { try { return JSON.parse(execSync(`git show HEAD~1:${f}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
// Ids des films d'un fichier : films de la bande (fiction, spotlight) ou copie des clips (fiche).
const idsOf = (d) => new Set([...(d && (d.films || d.clips) || [])].map((c) => String(c.slate)).filter((x) => x && x !== "undefined"));
const pick = (o) => { const r = {}; for (const k of SHARED) if (o && o[k] !== undefined) r[k] = o[k]; return r; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Changement d'un film dans un fichier = « patch » : clés d'`info` changées (nouvelle valeur, ou null si effacée) et autres champs
// partagés changés (valeur entière). Seul ce qui a changé est recopié : les infos saisies ailleurs (ex. synopsis sur la fiche,
// prix sur la fiction) ne sont pas effacées.
function patchOf(a, b) { // a = maintenant, b = avant
  const p = {};
  const ia = (a && a.info) || {}, ib = (b && b.info) || {};
  for (const k of new Set([...Object.keys(ia), ...Object.keys(ib)])) if (!same(ia[k], ib[k])) (p.info = p.info || {})[k] = ia[k] === undefined ? null : ia[k];
  for (const k of SHARED) if (k !== "info" && !same(a && a[k], b && b[k])) p[k] = a && a[k] !== undefined ? a[k] : null;
  return Object.keys(p).length ? p : null;
}
function applyPatch(o, p) {
  o = Object.assign({}, o || {});
  if (p.info) {
    const i = Object.assign({}, o.info || {});
    for (const [k, v] of Object.entries(p.info)) { if (v === null) delete i[k]; else i[k] = v; }
    if (Object.keys(i).length) o.info = i; else delete o.info;
  }
  for (const k of SHARED) if (k !== "info" && k in p) { if (p[k] === null) delete o[k]; else o[k] = p[k]; }
  return o;
}
const ALL = !!process.env.ALL_LINK; // mise en commun complète (une fois) : voir plus bas

const wants = {}; // id -> [{ file, patch }]
for (const f of ALL ? [] : changed) {
  const now = read(f), old = before(f);
  if (!now) continue;
  const ov = now.overrides || {}, oo = (old && old.overrides) || {};
  for (const id of new Set([...Object.keys(ov), ...Object.keys(oo)])) {
    const p = patchOf(pick(ov[id]), pick(oo[id]));
    if (p) (wants[id] = wants[id] || []).push({ file: f, patch: p });
  }
}
// Mise en commun complète (ALL_LINK=1, lancée une fois le 17/11) : pour chaque film présent sur plusieurs pages, chaque info
// renseignée d'un seul côté (ou identique) est recopiée partout ; les stills / vidéos aussi s'il n'y en a que d'un côté.
// Valeurs différentes des deux côtés : laissées telles quelles (signalées).
if (ALL) {
  const where = {};
  for (const f of files) { const d = read(f); if (!d) continue; for (const id of idsOf(d)) (where[id] = where[id] || []).push(f); }
  for (const [id, fl] of Object.entries(where)) {
    if (fl.length < 2) continue;
    const vals = fl.map((f) => pick(((read(f) || {}).overrides || {})[id]));
    const p = {};
    const keys = new Set(vals.flatMap((v) => Object.keys(v.info || {})));
    for (const k of keys) {
      const got = [...new Set(vals.map((v) => (v.info || {})[k]).filter((x) => x !== undefined && x !== "").map((x) => JSON.stringify(x)))];
      if (got.length === 1) (p.info = p.info || {})[k] = JSON.parse(got[0]);
      else if (got.length > 1) console.log(`Film ${id} : « ${k} » différent selon la page, laissé.`);
    }
    for (const k of SHARED) {
      if (k === "info") continue;
      const got = [...new Set(vals.map((v) => v[k]).filter((x) => x !== undefined && !(Array.isArray(x) && !x.length)).map((x) => JSON.stringify(x)))];
      if (got.length === 1) p[k] = JSON.parse(got[0]);
      else if (got.length > 1) console.log(`Film ${id} : « ${k} » différent selon la page, laissé.`);
    }
    if (Object.keys(p).length) wants[id] = [{ file: "(mise en commun)", patch: p }];
  }
}
let n = 0, skipped = 0;
const cache = {};
for (const [id, list] of Object.entries(wants)) {
  // Changé différemment sur deux pages dans la même publication : on ne choisit pas.
  if (list.some((x) => !same(x.patch, list[0].patch))) { skipped++; console.log(`Film ${id} : changé différemment sur ${list.map((x) => x.file).join(", ")}, pas recopié.`); continue; }
  const patch = list[0].patch, from = list.map((x) => x.file);
  for (const f of files) {
    if (from.includes(f)) continue;
    const d = cache[f] || (cache[f] = read(f));
    if (!d || !idsOf(d).has(id)) continue;
    d.overrides = d.overrides || {};
    const o = applyPatch(d.overrides[id], patch);
    if (same(o, d.overrides[id] || {})) continue;
    if (Object.keys(o).length) d.overrides[id] = o; else delete d.overrides[id];
    d._dirty = true; n++;
    console.log(`Film ${id} : ${from[0]} → ${f}`);
  }
}
for (const [f, d] of Object.entries(cache)) {
  if (!d || !d._dirty) continue;
  delete d._dirty;
  fs.writeFileSync(f, JSON.stringify(d, null, 2) + "\n");
}
console.log(`Films reliés : ${n} recopie(s)${skipped ? `, ${skipped} film(s) laissé(s) (changés différemment)` : ""}.`);
