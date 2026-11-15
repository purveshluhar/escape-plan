// Legibility check: drives the running app through its main states at default, close and far zoom, and
// reports (1) text that overlaps other text from a different panel or label, (2) text cut off by the
// screen edge, and (3) text under WCAG AA contrast against the pixels behind it (4.5:1, or 3:1 for text
// 18.66 px bold or 24 px and up), with "busy" when the pixels behind a plate-less label vary a lot.
//
// Not part of `npm run check`: it needs a browser, and Playwright is not a dependency of this repo.
// It runs with a Playwright that is already on the host. How to run:
//   npm run dev                      (or any served build)
//   PLAYWRIGHT_DIR=<folder that holds node_modules/playwright> \
//   CHROMIUM=<path to a chromium binary, optional> \
//   node tools/legibility-check.mjs http://127.0.0.1:5173/ out-dir
// It writes out-dir/legibility.json and one PNG per state, and exits 1 when it finds a problem.
// It uses reduced motion, so each state shows its end at once. Owner: P1.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [url = 'http://127.0.0.1:5173/', out = 'legibility-out'] = process.argv.slice(2);
const dir = process.env.PLAYWRIGHT_DIR;
if (!dir) {
  console.error('Set PLAYWRIGHT_DIR to a folder whose node_modules has playwright (see the header of this file).');
  process.exit(2);
}
const { chromium } = createRequire(path.join(dir, 'node_modules', 'x.js'))('playwright');
fs.mkdirSync(out, { recursive: true });

const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }];
const ZOOMS = { default: 0, close: -3, far: 8 }; // wheel steps of 300 px (negative is in)

// Each state starts from a fresh page. Keys: 1-6 ask a question, Space is Show me.
const STATES = {
  empty: [],
  sofa: ['2', 'Space'],
  six: ['1', '2', '3', '4', '5', '6', 'Space'],
  conflict: ['4', '5', 'Space', { fix: 'Widen plant shaft' }],
  smoke: ['6', 'Space', { fix: 'Widen office door' }],
  strip: ['2', 'Space', '/', { type: 'make it bigger' }],
  hint: ['2', 'Space', { hint: true }],
  yes: ['2', 'Space', { fix: 'Widen lobby door' }, { wait: 3000 }],
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const decoder = await browser.newPage(); // decodes screenshots to pixels, so no PNG library is needed

const settle = (page) => page.waitForFunction(() => !document.querySelector('#dock')?.classList.contains('slim'), null, { timeout: 30000 })
  .then(() => page.waitForTimeout(500));

async function drive(page, steps) {
  for (const s of steps) {
    if (typeof s === 'string') { await page.keyboard.press(s); await page.waitForTimeout(250); if (s === 'Space') await settle(page); continue; }
    if (s.fix) { await page.locator('#sheet .fixbtn', { hasText: s.fix }).first().click(); await page.waitForTimeout(300); await settle(page); }
    if (s.type) { await page.fill('#editInput', s.type); await page.keyboard.press('Enter'); await page.waitForTimeout(3000); }
    if (s.hint) { await page.locator('#hint button', { hasText: /Hint/ }).first().click(); await page.waitForTimeout(400); }
    if (s.wait) await page.waitForTimeout(s.wait);
  }
}

// Every visible run of text on the page: its box, size, weight, colour and the label or panel it is in.
function collect() {
  const owners = '.glass, .ep-fail, .ep-room, .ep-floor, .ep-tag, .ep-toast, .ep-hint, .ep-banner, .ep-flash, [class*="caption"]';
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    if (!text) continue;
    const el = n.parentElement;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    let hidden = false;
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || Number(s.opacity) < 0.05 || a.hidden) { hidden = true; break; }
    }
    if (hidden) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const owner = el.closest(owners);
    let plate = false;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor;
      const alpha = bg.startsWith('rgba') ? Number(bg.split(',')[3]) : bg === 'transparent' ? 0 : 1;
      if (alpha > 0.5 || getComputedStyle(a).backdropFilter !== 'none') { plate = true; break; }
    }
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      out.push({
        text: text.slice(0, 60), x: r.left, y: r.top, w: r.width, h: r.height,
        size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400, color: cs.color,
        owner: owner ? (owner.id || owner.className.toString().split(' ')[0]) + '#' + [...document.querySelectorAll(owners)].indexOf(owner) : 'page', plate,
      });
    }
  }
  return out;
}

const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// The pixels in each box: the most common colour far from the text colour is the background.
async function backgrounds(png, boxes) {
  return decoder.evaluate(async ({ b64, boxes }) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return boxes.map((bx) => {
      const x = Math.max(0, Math.floor(bx.x)), y = Math.max(0, Math.floor(bx.y));
      const w = Math.min(img.width - x, Math.ceil(bx.w)), h = Math.min(img.height - y, Math.ceil(bx.h));
      if (w <= 0 || h <= 0) return null;
      const d = g.getImageData(x, y, w, h).data;
      const counts = new Map();
      let sum = 0, sum2 = 0, k = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
        const far = Math.abs(r - bx.fg[0]) + Math.abs(gg - bx.fg[1]) + Math.abs(b - bx.fg[2]) > 60;
        if (!far) continue;
        const key = ((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const l = 0.3 * r + 0.59 * gg + 0.11 * b; sum += l; sum2 += l * l; k++;
      }
      if (k === 0) return { bg: bx.fg, spread: 0 };
      let best = 0, top = -1;
      for (const [key, n] of counts) if (n > top) { top = n; best = key; }
      const bg = [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4];
      return { bg, spread: Math.sqrt(Math.max(0, sum2 / k - (sum / k) ** 2)) };
    });
  }, { b64: png.toString('base64'), boxes });
}

const findings = [];
for (const vp of VIEWPORTS) {
  for (const [state, steps] of Object.entries(STATES)) {
    for (const [zoom, wheel] of Object.entries(ZOOMS)) {
      const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(url);
      // The city and the floor plans are in once the loading note goes.
      await page.waitForFunction(() => !document.querySelector('#loading')?.classList.contains('on'), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(800);
      await drive(page, steps);
      if (wheel) {
        await page.mouse.move(vp.width * 0.45, vp.height * 0.45);
        for (let i = 0; i < Math.abs(wheel); i++) { await page.mouse.wheel(0, Math.sign(wheel) * 300); await page.waitForTimeout(120); }
        await page.waitForTimeout(1500);
      }
      const name = `${vp.width}x${vp.height}-${state}-${zoom}`;
      const texts = await page.evaluate(collect);
      await page.evaluate(() => { const e = document.activeElement; if (e && 'blur' in e) e.blur(); });
      const png = await page.screenshot({ path: path.join(out, `${name}.png`) });
      const bgs = await backgrounds(png, texts.map((t) => ({ ...t, fg: parse(t.color) })));
      const here = [];
      // (1) text over text from another owner
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i], b = texts[j];
        if (a.owner === b.owner) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) here.push({ kind: 'overlap', a: `${a.owner}: ${a.text}`, b: `${b.owner}: ${b.text}`, px: Math.round(ox * oy) });
      }
      texts.forEach((t, i) => {
        // (2) cut off by the screen edge
        if (t.x < -1 || t.y < -1 || t.x + t.w > vp.width + 1 || t.y + t.h > vp.height + 1) here.push({ kind: 'offscreen', a: `${t.owner}: ${t.text}` });
        // (3) contrast against the pixels behind it
        const bg = bgs[i];
        if (!bg) return;
        const need = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700) ? 3 : 4.5;
        const r = ratio(parse(t.color), bg.bg);
        if (r < need) here.push({ kind: 'contrast', a: `${t.owner}: ${t.text}`, ratio: Math.round(r * 100) / 100, need });
        if (!t.plate && bg.spread > 40) here.push({ kind: 'busy', a: `${t.owner}: ${t.text}`, spread: Math.round(bg.spread) });
      });
      findings.push({ name, texts: texts.length, problems: here });
      console.log(name, here.length ? `${here.length} problem(s)` : 'clean', here.slice(0, 4).map((p) => `${p.kind}: ${p.a}${p.b ? ' / ' + p.b : ''}${p.ratio ? ' ' + p.ratio : ''}`).join(' | '));
      await ctx.close();
    }
  }
}
fs.writeFileSync(path.join(out, 'legibility.json'), JSON.stringify(findings, null, 2));
await browser.close();
const total = findings.reduce((n, f) => n + f.problems.length, 0);
console.log(`${findings.length} states, ${total} problem(s)`);
process.exit(total ? 1 : 0);
