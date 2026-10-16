// Export d'une présentation HTML en PPTX à fidélité visuelle maximale.
// Chaque slide est photographiée par un vrai navigateur (Chromium) en 2560×1440 et placée en plein écran dans le PPTX.
// Les vidéos (balises <video>) sont insérées comme de vraies vidéos PowerPoint, avec leurs contrôles natifs,
// exactement à l'emplacement de la vidéo sur la slide.
//
// Convention pour une présentation avec vidéo :
//   - la balise <video> doit avoir un id ;
//   - window.__PPTX_VIDEOS__ = { "<id de la vidéo>": "<MP4 H.264 en base64>" } (PowerPoint ne lit pas le WebM) ;
//   - les éléments à masquer dans l'export (barre de contrôle, nav…) portent la classe « noexport ».
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const VIEW_W = 1280, VIEW_H = 720, SCALE = 2;          // → images 2560×1440
const SLIDE_W_IN = 13.333, SLIDE_H_IN = 7.5;

export async function exportPptx(html, { title = "Présentation", log = () => {} } = {}) {
  const { chromium } = await import("playwright");
  const { default: PptxGenJS } = await import("pptxgenjs");
  const dir = await mkdtemp(path.join(tmpdir(), "pptx-"));
  const file = path.join(dir, "index.html");
  await writeFile(file, html);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: SCALE })).newPage();
    await page.goto("file://" + file, { waitUntil: "load" });
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}.noexport,.nav{display:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
    if (!total) throw new Error("aucun élément .slide trouvé");

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";            // 13.333 × 7.5 in (16:9)
    pptx.title = title;

    for (let i = 0; i < total; i++) {
      if (i > 0) { await page.keyboard.press("ArrowRight"); }
      await page.waitForTimeout(250);
      // prépare les vidéos : pause + image représentative
      const vids = await page.evaluate(async () => {
        const active = document.querySelector(".slide.on") || document.body;
        const out = [];
        for (const v of active.querySelectorAll("video")) {
          try { v.pause(); } catch {}
          if (v.readyState < 1) await new Promise((r) => { v.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 4000); });
          const d = v.duration || 0;
          if (d) {
            await new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = d * 0.3; setTimeout(r, 3000); });
          }
          const r = v.getBoundingClientRect();
          out.push({ id: v.id || null, x: r.x, y: r.y, w: r.width, h: r.height, mp4: (window.__PPTX_VIDEOS__ || {})[v.id] || null });
        }
        return out;
      });
      if (vids.length) await page.waitForTimeout(400);
      const text = await page.evaluate(() => {
        const a = document.querySelector(".slide.on") || document.body;
        const skip = "script,style,svg,video,.noexport,.ghost,.foot,.nav";
        const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest(skip)) || !n.textContent.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const out = [];
        while (w.nextNode()) out.push(w.currentNode.textContent.replace(/\s+/g, " ").trim());
        return out.join("\n");
      });
      const shot = await page.screenshot({ type: "jpeg", quality: 95, clip: { x: 0, y: 0, width: VIEW_W, height: VIEW_H } });
      const slide = pptx.addSlide();
      slide.background = { color: "000000" };
      slide.addImage({ data: "image/jpeg;base64," + shot.toString("base64"), x: 0, y: 0, w: SLIDE_W_IN, h: SLIDE_H_IN, altText: text.split("\n")[0] || `Slide ${i + 1}` });
      if (text) slide.addNotes(text);
      for (const v of vids) {
        if (!v.mp4) { log(`  ! slide ${i + 1} : vidéo « ${v.id} » sans MP4 dans window.__PPTX_VIDEOS__ — non insérée`); continue; }
        const cover = await page.screenshot({ type: "png", clip: { x: v.x, y: v.y, width: v.w, height: v.h } });
        slide.addMedia({
          type: "video", data: "video/mp4;base64," + v.mp4, extn: "mp4",
          cover: "data:image/png;base64," + cover.toString("base64"),
          x: v.x / VIEW_W * SLIDE_W_IN, y: v.y / VIEW_H * SLIDE_H_IN, w: v.w / VIEW_W * SLIDE_W_IN, h: v.h / VIEW_H * SLIDE_H_IN,
          objectName: v.id || "Vidéo",
        });
      }
    }
    const buf = await pptx.write({ outputType: "nodebuffer" });
    return { buffer: Buffer.from(buf), slides: total };
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
}
