// Robot d'encodage du video club (Gus 26/11) : fabrique chez Amazon les versions légères des films, à la demande de l'admin.
// L'admin dépose une demande data/encode/<sorte>-<horodatage>.json = { jobs: [...], at, by } (sorte : « film » = long, « rapide »)
// et relit le même fichier, où le robot écrit pour chaque demande `answer` (ou `error`) puis `doneAt`.
//   film  { id, key: "depot/…" (master envoyé depuis l'ordinateur), at?: 0–1 (début de l'extrait, 2/3 par défaut), d?: 5,
//           web?: true (remplacement d'une vidéo : version web seulement, la vignette et l'extrait du film sont gardés) }
//         → version web 1080p H.264 (son AAC, lecture avant la fin du téléchargement), vignette WebP 800 / 1600,
//           extrait 720p sans son → { full, video, img, img1600, snip: { s, d }, thumbT, dur, w, h }
//   snip  { id, src (vidéo : notre CloudFront, Slate, ou mp4 du dépôt), s, d } → extrait 720p sans son → { video }
//   thumb { id, src, t } → image du film à t, WebP 800 / 1600 → { img, img1600 }
// Avancement (films) : `progress: { step: "lecture" | "web" | "extrait" | "vignette", pct }` écrit dans la demande (un commit au plus
// par minute) ; l'admin l'affiche.
// Tout est rangé sous nous/<id>/ dans kinou-videos et servi par notre CloudFront. Accès Amazon sans clé (rôle kinou-robot-copie,
// OIDC, renouvelé par aws-cle.mjs). Les masters de depot/ ne sont jamais effacés (archive). Journaux sans adresse (dépôt public).
// Variables : KINDS (sortes traitées, ex. « film » ou « rapide »).
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.AWS_ROLE_COPIE) { // accès Amazon renouvelé tout seul (voir copie-slate.mjs)
  const dossier = fs.mkdtempSync(join(tmpdir(), "aws-"));
  fs.writeFileSync(join(dossier, "config"), "[profile robot]\nregion = " + (process.env.AWS_REGION || "eu-north-1") +
    "\ncredential_process = node " + join(process.cwd(), "tools", "aws-cle.mjs") + "\n");
  ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"].forEach((k) => delete process.env[k]);
  process.env.AWS_CONFIG_FILE = join(dossier, "config");
  process.env.AWS_PROFILE = "robot";
}
const DIR = "data/encode", BUCKET = "kinou-videos", CDN = "https://d3toxii6rvamjf.cloudfront.net/", SLATE = "https://d1ko11x0ybxl0h.cloudfront.net/";
const KINDS = String(process.env.KINDS || "film,rapide").split(",");
const ID = /^[a-z0-9]{6,32}$/, KEY = /^depot\/[a-z0-9]{8,40}\/[\w.-]{1,120}$/;
const SRC = /^https:\/\/(d3toxii6rvamjf|d1ko11x0ybxl0h)\.cloudfront\.net\/[\w\/.%-]+\.(mp4|mov|m4v)$|^https:\/\/raw\.githubusercontent\.com\/Kinou-DoP\/admin\/main\/data\/bibli\/vid\/[\w-]+\.mp4$/i;

function run(cmd, args, onOut) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = "";
    p.stdout.on("data", (d) => { if (onOut) onOut(String(d)); else out += d; }); p.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on("close", (code) => resolve({ code, out, err }));
  });
}
async function must(cmd, args, what, onOut) {
  const r = await run(cmd, args, onOut);
  if (r.code !== 0) throw new Error(what + " : échec (" + (r.err.trim().split("\n").pop() || r.code).slice(0, 200) + ")");
  return r;
}
async function put(file, key, type) {
  await must("aws", ["s3", "cp", file, "s3://" + BUCKET + "/" + key, "--only-show-errors", "--content-type", type,
    "--cache-control", "public, max-age=31536000, immutable"], "dépôt chez Amazon");
  return CDN + key;
}
// Vidéo à lire : la copie chez nous d'abord (même chemin que Slate), Slate si elle manque.
async function source(src) {
  if (!SRC.test(src || "")) throw new Error("adresse de vidéo refusée");
  if (src.startsWith(SLATE)) {
    const ours = CDN + src.slice(SLATE.length);
    try { const r = await fetch(ours, { method: "HEAD" }); if (r.ok) return ours; } catch (e) {}
  }
  return src;
}
async function probe(file) {
  const r = await must("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], "lecture du film");
  const d = JSON.parse(r.out), s = (d.streams || [])[0] || {};
  return { dur: +((d.format || {}).duration) || 0, w: s.width || 0, h: s.height || 0 };
}
const r3 = (x) => Math.round(x * 1000) / 1000;
// Extrait : 720p au plus (1280 de large), sans son, léger (~1–2 Mo pour 5 s), lisible avant la fin du téléchargement.
async function snippet(src, s, d, out) {
  await must("ffmpeg", ["-y", "-v", "error", "-ss", String(s), "-i", src, "-t", String(d), "-an", "-map", "0:v:0",
    "-vf", "scale='min(1280,iw)':-2:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "24",
    "-maxrate", "3M", "-bufsize", "6M", "-movflags", "+faststart", out], "extrait");
}
async function frames(src, t, dir) {
  const png = join(dir, "img.png");
  await must("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", src, "-frames:v", "1", png], "image du film");
  const o = {};
  for (const w of [800, 1600]) {
    const f = join(dir, "img-" + w + ".webp");
    await must("ffmpeg", ["-y", "-v", "error", "-i", png, "-vf", "scale='min(" + w + ",iw)':-2:flags=lanczos", "-c:v", "libwebp", "-quality", "82", f], "vignette");
    o[w] = f;
  }
  return o;
}

async function film(j, dir, tell) {
  if (!KEY.test(j.key || "")) throw new Error("master introuvable");
  const master = join(dir, "master"); tell("lecture", 0);
  await must("aws", ["s3", "cp", "s3://" + BUCKET + "/" + j.key, master, "--only-show-errors"], "lecture du master");
  const p = await probe(master);
  if (!p.dur) throw new Error("vidéo illisible");
  console.log("  master : " + Math.round(fs.statSync(master).size / 1e6) + " Mo, " + p.w + "×" + p.h + ", " + Math.round(p.dur) + " s");
  const web = join(dir, "web.mp4"), t0 = Date.now(); tell("web", 0);
  await must("ffmpeg", ["-y", "-v", "error", "-progress", "pipe:1", "-nostats", "-i", master, "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-maxrate", "12M", "-bufsize", "24M",
    "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-movflags", "+faststart", web], "version web",
    (t) => { const m = t.match(/out_time_us=(\d+)/g); if (m) tell("web", Math.min(99, Math.round(+m[m.length - 1].split("=")[1] / 1e6 / p.dur * 100))); });
  console.log("  version web : " + Math.round(fs.statSync(web).size / 1e6) + " Mo en " + Math.round((Date.now() - t0) / 1000) + " s");
  const base = "nous/" + j.id + "/", a = {};
  a.full = await put(web, base + "web.mp4", "video/mp4");
  if (j.web) return Object.assign(a, { dur: r3(p.dur), w: p.w, h: p.h }); // remplacement : vignette et extrait du film gardés
  tell("extrait", 0);
  const at = j.at >= 0 && j.at < 1 ? j.at : 2 / 3, d = Math.max(0.5, Math.min(j.d || 5, 10, p.dur));
  const s = r3(Math.max(0, Math.min(p.dur * at, p.dur - d)));
  const ex = join(dir, "extrait.mp4");
  await snippet(web, s, d, ex);
  a.video = await put(ex, base + "extrait-" + Math.round(s * 1000) + ".mp4", "video/mp4");
  a.snip = { s, d: r3(d) }; a.thumbT = r3(Math.min(p.dur - 0.05, s + Math.min(1, d / 2))); tell("vignette", 0);
  const im = await frames(web, a.thumbT, dir);
  a.img = await put(im[800], base + "vignette-800.webp", "image/webp");
  a.img1600 = await put(im[1600], base + "vignette-1600.webp", "image/webp");
  Object.assign(a, { dur: r3(p.dur), w: p.w, h: p.h });
  return a;
}
async function snip(j, dir) {
  const src = await source(j.src), s = Math.max(0, +j.s || 0), d = Math.max(0.5, Math.min(+j.d || 5, 10));
  const ex = join(dir, "extrait.mp4");
  await snippet(src, s, d, ex);
  return { video: await put(ex, "nous/" + j.id + "/extrait-" + Math.round(s * 1000) + ".mp4", "video/mp4"), snip: { s: r3(s), d: r3(d) } };
}
async function thumb(j, dir) {
  const src = await source(j.src), t = Math.max(0, +j.t || 0), im = await frames(src, t, dir);
  const base = "nous/" + j.id + "/vignette-" + Math.round(t * 1000);
  return { img: await put(im[800], base + "-800.webp", "image/webp"), img1600: await put(im[1600], base + "-1600.webp", "image/webp"), thumbT: r3(t) };
}
const WORK = { film, snip, thumb };

// Enregistrement d'une demande (réponse, avancement) : un commit par-dessus la dernière version de main. On repart toujours de
// main (fetch + reset) et on réécrit le fichier depuis la mémoire : jamais de rebase qui reste coincé (bug du 25/11 : identité git
// manquante → commit raté → rebase à moitié fait → plus aucune réponse enregistrée, film « en cours d'encodage » pour toujours).
const GIT_ENV = Object.assign({}, process.env, { GIT_AUTHOR_NAME: "kinou-robot", GIT_COMMITTER_NAME: "kinou-robot",
  GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com", GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com" });
const git = (args, quiet) => execSync("git " + args, { stdio: quiet ? "ignore" : "inherit", env: GIT_ENV });
let pasEnregistre = 0;
function save(path, d, msg) {
  const txt = JSON.stringify(d, null, 2) + "\n";
  for (let i = 0; i < 6; i++) {
    try {
      try { git("rebase --abort", true); } catch (e) {}
      git("fetch -q origin main"); git("reset -q --hard origin/main");
      fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path, txt);
      git("add " + JSON.stringify(path));
      try { git("diff --cached --quiet", true); return true; } catch (e) {} // rien de changé
      git("commit -q -m " + JSON.stringify(msg)); git("push -q origin HEAD:main"); return true;
    } catch (e) { execSync("sleep " + (2 + i * 2)); }
  }
  console.log("  enregistrement impossible"); pasEnregistre++;
  return false;
}

if (fs.existsSync(DIR)) {
  const files = fs.readdirSync(DIR).filter((n) => n.endsWith(".json") && KINDS.some((k) => n.startsWith(k + "-"))).sort();
  let erreurs = 0;
  for (const f of files) {
    const path = DIR + "/" + f;
    let d; try { d = JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { continue; }
    if (d.doneAt) continue;
    if (f.startsWith("film-")) d.startedAt = new Date().toISOString();
    for (const j of d.jobs || []) {
      if (j.answer || j.error) continue;
      const dir = fs.mkdtempSync(join(tmpdir(), "enc-")), t0 = Date.now();
      try {
        if (!ID.test(j.id || "") || !WORK[j.kind]) throw new Error("demande inconnue");
        let last = 0, lastP = -100;
        const tell = (step, pct) => { // avancement : un commit au plus par minute (ou à chaque nouvelle étape)
          const ch = !j.progress || j.progress.step !== step;
          if (!ch && (Date.now() - last < 60000 || pct - lastP < 5)) return;
          j.progress = { step, pct }; last = Date.now(); lastP = pct; save(path, d, "Encodage : " + step + " " + pct + " %");
        };
        j.answer = await WORK[j.kind](j, dir, f.startsWith("film-") ? tell : () => {});
        delete j.progress;
      } catch (e) { j.error = String(e.message || e); erreurs++; }
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(j.kind + " " + (j.id || "?") + " : " + (j.error || "ok") + " (" + Math.round((Date.now() - t0) / 1000) + " s)");
    }
    d.doneAt = new Date().toISOString();
    save(path, d, "Encodage : " + (d.jobs || []).length + " fait" + ((d.jobs || []).length > 1 ? "s" : ""));
  }
  if (erreurs || pasEnregistre) process.exitCode = 1;
}
