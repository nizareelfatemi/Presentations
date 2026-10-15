"use strict";
// Tout ce qui est publié est chiffré (AES-256-GCM). La clé est dérivée du mot de passe dans le navigateur (PBKDF2).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const KEY_STORE = "sdp.key";

let vault, key, data;

/* ---------- crypto ---------- */
async function deriveRaw(password) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(vault.salt), iterations: vault.iter }, base, 256);
  return new Uint8Array(bits);
}
const toKey = (raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);

async function decryptFile(name) {
  const r = await fetch(`data/${name}`, { cache: "no-cache" });
  if (!r.ok) throw new Error("fichier introuvable");
  const buf = new Uint8Array(await r.arrayBuffer());
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
}

/* ---------- stockage de la clé (jamais le mot de passe) ---------- */
function savedKey() {
  try { return sessionStorage.getItem(KEY_STORE) || localStorage.getItem(KEY_STORE); } catch { return null; }
}
function saveKey(raw, persist) {
  try { (persist ? localStorage : sessionStorage).setItem(KEY_STORE, b64(raw)); } catch {}
}
function clearKey() {
  try { sessionStorage.removeItem(KEY_STORE); localStorage.removeItem(KEY_STORE); } catch {}
}

/* ---------- démarrage / connexion ---------- */
async function unlock(raw) {
  key = await toKey(raw);
  data = JSON.parse(new TextDecoder().decode(await decryptFile("index.bin")));
}

async function boot() {
  try {
    vault = await (await fetch("data/vault.json", { cache: "no-cache" })).json();
  } catch {
    showLogin("Impossible de charger le site (data/vault.json). Le déploiement est-il terminé ?");
    return;
  }
  const saved = savedKey();
  if (saved) {
    try { await unlock(unb64(saved)); showApp(); return; } catch { clearKey(); }
  }
  showLogin();
}

function showLogin(message) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  const err = $("#loginErr");
  err.hidden = !message;
  err.textContent = message || "";
  $("#pw").focus();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#unlockBtn"), err = $("#loginErr");
  btn.disabled = true; btn.textContent = "Déverrouillage…"; err.hidden = true;
  try {
    const raw = await deriveRaw($("#pw").value);
    await unlock(raw);
    saveKey(raw, $("#remember").checked);
    $("#pw").value = "";
    showApp();
  } catch {
    err.textContent = "Mot de passe incorrect.";
    err.hidden = false;
    $("#pw").select();
  } finally {
    btn.disabled = false; btn.textContent = "Déverrouiller";
  }
});

$("#lockBtn").addEventListener("click", () => { clearKey(); location.hash = ""; location.reload(); });

/* ---------- bibliothèque ---------- */
const st = { q: "", dom: "", aud: "", dur: "", sort: "new" };
const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`);
const dfmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const bucket = (m) => (m < 15 ? "s" : m <= 45 ? "m" : "l");

const PATTERNS = [
  "radial-gradient(circle at 85% 20%,#ffffff26 0 22%,transparent 23%)",
  "repeating-linear-gradient(115deg,#ffffff16 0 10px,transparent 10px 22px)",
  "linear-gradient(90deg,#ffffff14 1px,transparent 1px) 0 0/22px 22px",
  "radial-gradient(circle at 15% 85%,#ffffff2a 0 28%,transparent 29%)",
  "radial-gradient(circle at 80% 80%,#ffffff24 0 18%,transparent 19%),radial-gradient(circle at 60% 30%,#ffffff1a 0 10%,transparent 11%)",
  "linear-gradient(45deg,#ffffff16 25%,transparent 25% 50%,#ffffff16 50% 75%,transparent 75%) 0 0/28px 28px",
];
function domainStyle(name) {
  const names = Object.keys(data.domains);
  const c = data.domains[name] || "#475569";
  const pat = PATTERNS[Math.max(0, names.indexOf(name)) % PATTERNS.length];
  return `background:${c};--pat:linear-gradient(0deg,#0007,transparent 65%),${pat}`;
}
const thumb = (p, title) =>
  `<div class="thumb" style="${domainStyle(p.domain)}"><small>${esc(p.domain)}</small><span class="dur">${fmt(p.duration)}</span><b>${esc(title ?? p.title)}</b></div>`;

function showApp() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  const P = data.presentations;
  const auds = [...new Set(P.map((p) => p.audience))].sort((a, b) => a.localeCompare(b, "fr"));
  $("#aud").innerHTML = `<option value="">Toutes audiences</option>` + auds.map((a) => `<option>${esc(a)}</option>`).join("");
  const used = Object.keys(data.domains).filter((d) => P.some((p) => p.domain === d));
  const box = $("#domains");
  box.innerHTML = `<button class="chip" data-d="" aria-pressed="true">Tous</button>` +
    used.map((d) => `<button class="chip" data-d="${esc(d)}" aria-pressed="false"><span class="dot" style="background:${esc(data.domains[d])}"></span>${esc(d)}</button>`).join("");
  box.onclick = (e) => {
    const b = e.target.closest("[data-d]"); if (!b) return;
    st.dom = b.dataset.d;
    box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    render();
  };
  $("#q").oninput = (e) => { st.q = e.target.value.toLowerCase(); render(); };
  $("#aud").onchange = (e) => { st.aud = e.target.value; render(); };
  $("#dur").onchange = (e) => { st.dur = e.target.value; render(); };
  $("#sort").onchange = (e) => { st.sort = e.target.value; render(); };
  render();
  const id = decodeURIComponent(location.hash.slice(1));
  if (id && P.some((p) => p.id === id)) openDrawer(id);
}

function render() {
  const P = data.presentations;
  const r = P.filter((p) =>
    (!st.dom || p.domain === st.dom) && (!st.aud || p.audience === st.aud) && (!st.dur || bucket(p.duration) === st.dur) &&
    (!st.q || [p.title, p.summary, p.domain, p.audience, ...p.tags].join(" ").toLowerCase().includes(st.q)));
  r.sort((a, b) => st.sort === "new" ? b.date.localeCompare(a.date) : st.sort === "short" ? a.duration - b.duration : a.title.localeCompare(b.title, "fr"));
  const total = P.reduce((s, p) => s + p.duration, 0);
  const last = P.map((p) => p.date).sort().pop();
  $("#stats").textContent = P.length
    ? `${r.length}/${P.length} présentations · ${fmt(total)} de contenu · dernière ajoutée le ${dfmt(last)}`
    : "Aucune présentation";
  $("#grid").innerHTML = r.length ? r.map((p) =>
    `<button class="card" data-id="${esc(p.id)}">${thumb(p)}<div class="meta"><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p>
     <div class="facts"><span>${esc(p.audience)}</span>${p.level ? `<span>${esc(p.level)}</span>` : ""}${p.slides ? `<span>${p.slides} slides</span>` : ""}</div></div></button>`).join("")
    : `<div class="empty">${P.length ? "Aucune présentation ne correspond. Retire un filtre pour élargir la recherche." : "La bibliothèque est vide. Demande à Claude d’ajouter une présentation, puis fais un git push."}</div>`;
}
$("#grid").addEventListener("click", (e) => { const c = e.target.closest(".card"); if (c) openDrawer(c.dataset.id); });

/* ---------- fiche ---------- */
function openDrawer(id) {
  const p = data.presentations.find((x) => x.id === id); if (!p) return;
  const d = $("#drawer");
  d.innerHTML = `<button class="close" id="dc" aria-label="Fermer">✕</button>${thumb(p, p.domain)}
  <div class="dbody"><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p>
  <div class="go"><button class="btn primary" id="present">▶ Présenter</button></div>
  <dl><dt>Domaine</dt><dd>${esc(p.domain)}</dd><dt>Audience</dt><dd>${esc(p.audience)}</dd>
  <dt>Durée</dt><dd>${fmt(p.duration)}${p.slides ? ` · ${p.slides} slides` : ""}</dd>
  ${p.level ? `<dt>Niveau</dt><dd>${esc(p.level)}</dd>` : ""}<dt>Langue</dt><dd>${esc(p.language.toUpperCase())}</dd>
  <dt>Ajoutée</dt><dd>${dfmt(p.date)}</dd>
  ${p.tags.length ? `<dt>Tags</dt><dd>${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</dd>` : ""}
  ${p.outline.length ? `<dt>Plan</dt><dd><ol class="outline">${p.outline.map((o) => `<li>${esc(o)}</li>`).join("")}</ol></dd>` : ""}
  <dt>Source</dt><dd class="muted" style="font:400 12px var(--f-mono)">presentations/${esc(p.id)}/</dd></dl></div>`;
  d.classList.add("on"); $("#scrim").classList.add("on"); d.setAttribute("aria-hidden", "false");
  history.replaceState(null, "", "#" + encodeURIComponent(id));
  $("#dc").onclick = closeDrawer;
  $("#present").onclick = () => present(p);
}
function closeDrawer() {
  $("#drawer").classList.remove("on"); $("#scrim").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true");
  history.replaceState(null, "", location.pathname + location.search);
}
$("#scrim").onclick = closeDrawer;

/* ---------- mode présentation ---------- */
let tick = null, blobUrl = null;
async function present(p) {
  const stage = $("#stage"), frame = $("#frame");
  stage.hidden = false; stage.classList.remove("mini");
  $("#stTitle").textContent = p.title; $("#stPlan").textContent = fmt(p.duration);
  $("#stClock").textContent = "00:00"; $("#stProg").style.width = "0"; $("#stProg").classList.remove("over");
  $("#stLoad").hidden = false; frame.hidden = true;
  try {
    const html = new TextDecoder().decode(await decryptFile(`${p.file}.bin`));
    blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    // sandbox sans allow-same-origin : la présentation ne peut pas lire la clé stockée par l’app.
    frame.onload = () => { $("#stLoad").hidden = true; frame.hidden = false; frame.focus(); };
    frame.src = blobUrl;
  } catch {
    $("#stLoad").textContent = "Impossible de déchiffrer cette présentation. Reconnecte-toi."; return;
  }
  const t0 = Date.now(), plan = p.duration * 60000;
  clearInterval(tick);
  tick = setInterval(() => {
    const e = Date.now() - t0, s = Math.floor(e / 1000);
    $("#stClock").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    $("#stProg").style.width = Math.min(100, (e / plan) * 100) + "%";
    $("#stProg").classList.toggle("over", e > plan);
  }, 500);
}
function exitStage() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  clearInterval(tick);
  $("#frame").src = "about:blank";
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = null;
  $("#stLoad").textContent = "Déchiffrement…";
  $("#stage").hidden = true;
}
$("#exit").onclick = exitStage;
$("#mini").onclick = () => { const s = $("#stage"); s.classList.toggle("mini"); $("#mini").textContent = s.classList.contains("mini") ? "▾" : "▴"; };
$("#fs").onclick = () => { document.fullscreenElement ? document.exitFullscreen() : $("#stage").requestFullscreen?.(); };
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#stage").hidden) exitStage(); else closeDrawer();
});

boot();
