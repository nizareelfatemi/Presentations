// Build : valide les présentations, les chiffre (AES-256-GCM, clé PBKDF2) et assemble dist/.
// Usage : SITE_PASSWORD=... node scripts/build.mjs        (build complet)
//         node scripts/build.mjs --check                 (validation seule, sans mot de passe)
import { createCipheriv, createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const ITERATIONS = 600_000;
const MIN_PASSWORD = 12;
const checkOnly = process.argv.includes("--check");

const domains = JSON.parse(await readFile(path.join(ROOT, "config/domains.json"), "utf8"));
const salt = Buffer.from((await readFile(path.join(ROOT, "config/salt.txt"), "utf8")).trim(), "base64");

const errors = [];
const warnings = [];
const fail = (id, msg) => errors.push(`  ✗ ${id} : ${msg}`);

// ---------- lecture + validation ----------
const entries = [];
const presDir = path.join(ROOT, "presentations");
const dirs = (await readdir(presDir, { withFileTypes: true })).filter((d) => d.isDirectory());

for (const d of dirs) {
  const id = d.name;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(id, "nom de dossier invalide (minuscules, chiffres et tirets uniquement)");
  const metaPath = path.join(presDir, id, "meta.json");
  const htmlPath = path.join(presDir, id, "index.html");
  if (!existsSync(metaPath)) { fail(id, "meta.json manquant"); continue; }
  if (!existsSync(htmlPath)) { fail(id, "index.html manquant"); continue; }

  let meta;
  try { meta = JSON.parse(await readFile(metaPath, "utf8")); }
  catch (e) { fail(id, `meta.json illisible (${e.message})`); continue; }

  for (const k of ["title", "summary", "domain", "audience"])
    if (typeof meta[k] !== "string" || !meta[k].trim()) fail(id, `champ « ${k} » manquant ou vide`);
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) fail(id, "« duration » doit être un nombre de minutes > 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? "")) fail(id, "« date » doit être au format AAAA-MM-JJ");
  if (meta.domain && !(meta.domain in domains))
    fail(id, `domaine « ${meta.domain} » inconnu. Autorisés : ${Object.keys(domains).join(", ")} (voir config/domains.json)`);
  for (const k of ["tags", "outline"])
    if (meta[k] !== undefined && !(Array.isArray(meta[k]) && meta[k].every((x) => typeof x === "string")))
      fail(id, `« ${k} » doit être une liste de textes`);
  if (meta.slides !== undefined && !(Number.isInteger(meta.slides) && meta.slides > 0)) fail(id, "« slides » doit être un entier > 0");
  if (meta.shareRev !== undefined && !(Number.isInteger(meta.shareRev) && meta.shareRev >= 0)) fail(id, "« shareRev » doit être un entier >= 0");

  const html = await readFile(htmlPath);
  const local = [...html.toString("utf8").matchAll(/(?:src|href)\s*=\s*["'](?!https?:|data:|#|\/\/|mailto:|blob:|javascript:)([^"']+)["']/gi)].map((m) => m[1]);
  if (local.length) warnings.push(`  ! ${id} : références locales non embarquées (${[...new Set(local)].slice(0, 3).join(", ")}) — la présentation doit être un seul fichier autonome`);

  entries.push({
    id, html,
    meta: {
      id,
      title: meta.title, summary: meta.summary, domain: meta.domain, audience: meta.audience,
      duration: meta.duration, date: meta.date,
      level: meta.level ?? "", language: meta.language ?? "fr",
      tags: meta.tags ?? [], slides: meta.slides ?? null, outline: meta.outline ?? [],
      shareRev: meta.shareRev ?? 0, pptx: false,
    },
  });
}

warnings.forEach((w) => console.warn(w));
if (errors.length) {
  console.error(`\nValidation échouée :\n${errors.join("\n")}\n`);
  process.exit(1);
}
console.log(`✓ ${entries.length} présentation(s) valide(s)`);
if (checkOnly) process.exit(0);

// ---------- chiffrement ----------
// Mot de passe de secours : utilisé uniquement si le secret SITE_PASSWORD n'est pas défini.
// Il est public (présent dans ce code) : il ne protège rien. Définis le secret SITE_PASSWORD.
const FALLBACK_PASSWORD = "12345678";
let password = process.env.SITE_PASSWORD ?? "";
if (!password) {
  password = FALLBACK_PASSWORD;
  console.warn("\n⚠ SITE_PASSWORD non défini : mot de passe de secours public (12345678) utilisé. Le site n'est PAS réellement protégé tant que tu n'as pas défini le secret.\n");
} else if (password.length < MIN_PASSWORD) {
  console.error(`\nSITE_PASSWORD trop court (minimum ${MIN_PASSWORD} caractères).\n`);
  process.exit(1);
}
const key = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");

// Format : IV (12 octets) || texte chiffré || tag GCM (16 octets), compatible WebCrypto.
// Clé de partage : dérivée du mot de passe + identifiant + révision, propre à CHAQUE présentation.
// Elle ne permet ni de retrouver la clé principale ni d'ouvrir une autre présentation.
// Elle est stable d'un déploiement à l'autre : un lien déjà envoyé continue de fonctionner.
// Pour révoquer un lien : incrémenter « shareRev » dans meta.json (ou changer le mot de passe pour tous).
const shareKey = (id, rev) => createHmac("sha256", key).update(`share|${id}|${rev}`).digest();

function encrypt(buf, k = key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]);
}
const fileName = (id) => createHash("sha256").update(salt).update(id).digest("hex").slice(0, 32);

await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, "data"), { recursive: true });
await cp(path.join(ROOT, "site"), DIST, { recursive: true });

// Identifiant de déploiement : versionne app.js / style.css et permet au site de détecter un cache périmé.
const buildId = Date.now().toString(36);
const stamp = async (file, pairs) => {
  const p = path.join(DIST, file);
  let s = await readFile(p, "utf8");
  for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(`${file} : « ${a} » introuvable`); s = s.replace(a, b); }
  await writeFile(p, s);
};
await stamp("index.html", [['src="app.js"', `src="app.js?v=${buildId}"`], ['href="style.css"', `href="style.css?v=${buildId}"`]]);
await stamp("app.js", [['const BUILD = "dev";', `const BUILD = "${buildId}";`]]);

// Export PPTX (fidélité visuelle maximale, vidéos lisibles) : nécessite Playwright + Chromium (npm install).
// Désactivable avec EXPORT_PPTX=0. Si l'outil est absent, le site est construit sans bouton d'export.
let exportPptx = null;
if (process.env.EXPORT_PPTX !== "0") {
  try {
    const { chromium } = await import("playwright");
    if (!existsSync(chromium.executablePath())) throw new Error("Chromium non installé (npx playwright install chromium)");
    exportPptx = (await import("./export-pptx.mjs")).exportPptx;
  } catch (err) {
    console.warn(`\n⚠ Export PPTX désactivé : ${err.message.split("\n")[0]}\n`);
  }
}

for (const e of entries) {
  e.meta.file = fileName(e.id);
  const k = shareKey(e.id, e.meta.shareRev);
  await writeFile(path.join(DIST, "data", `${e.meta.file}.bin`), encrypt(e.html, k));
  if (exportPptx) {
    try {
      const t0 = Date.now();
      const r = await exportPptx(e.html.toString("utf8"), { title: e.meta.title, log: console.warn });
      await writeFile(path.join(DIST, "data", `${e.meta.file}.pptx.bin`), encrypt(r.buffer, k));
      e.meta.pptx = true;
      console.log(`✓ ${e.id} : PPTX ${r.slides} slides, ${(r.buffer.length / 1048576).toFixed(1)} Mo (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch (err) {
      console.warn(`⚠ ${e.id} : export PPTX impossible (${err.message.split("\n")[0]})`);
    }
  }
}
const index = {
  built: new Date().toISOString(),
  domains,
  presentations: entries.map((e) => e.meta),
};
await writeFile(path.join(DIST, "data/index.bin"), encrypt(Buffer.from(JSON.stringify(index))));
await writeFile(path.join(DIST, "data/vault.json"), JSON.stringify({ v: 1, iter: ITERATIONS, salt: salt.toString("base64"), build: buildId }));
await writeFile(path.join(DIST, "robots.txt"), "User-agent: *\nDisallow: /\n");
await writeFile(path.join(DIST, ".nojekyll"), "");

console.log(`✓ dist/ prêt : ${entries.length} présentation(s) chiffrée(s)`);
