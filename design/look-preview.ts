// Look preview: a fake 2D maze driven by the real values in design/tokens.ts. Owner: P4.
// Not part of the game. It shows P2 and P3 what design/look.md means: pellet trails, the fail
// moment and the LEVEL COMPLETE moment. Open /design/look-preview.html under `npm run dev`.
import type { Discipline } from '../contract/types.ts';
import {
  BACKGROUND, DISCIPLINE_STYLE, FAIL, FONT_BODY, FONT_DISPLAY, FONT_STYLESHEET, GRID, MOTION, PASS,
  PATH, PELLET, SCORE, TEXT, TEXT_MUTED, WALL, WALL_INNER,
} from './tokens.ts';

const SVG = 'http://www.w3.org/2000/svg';
const PX = 40; // pixels per metre in this preview
const DIM = '#3a3f5c';

type Pt = [number, number];

interface Room { name: string; x: number; y: number; w: number; h: number }
interface Run { discipline: Discipline; points: Pt[] }
interface Outcome { blockIdx?: number; reason?: string; numbers?: string; left?: boolean; below?: boolean }
interface Scenario { name: string; outcomes: Outcome[] }

// Fake building, in preview pixels.
const ROOMS: Room[] = [
  { name: 'PLANT', x: 40, y: 40, w: 180, h: 140 },
  { name: 'SHAFT', x: 240, y: 40, w: 60, h: 330 },
  { name: 'CORRIDOR', x: 320, y: 40, w: 320, h: 80 },
  { name: 'TERRACE', x: 580, y: 160, w: 180, h: 100 },
  { name: 'LOBBY', x: 320, y: 160, w: 240, h: 210 },
  { name: 'STREET', x: 20, y: 410, w: 760, h: 50 },
];

const RUNS: Run[] = [
  { discipline: 'mep', points: [[130, 110], [240, 110], [270, 110], [270, 435], [80, 435]] },
  { discipline: 'logistics', points: [[610, 80], [380, 80], [380, 300], [380, 435], [200, 435]] },
  { discipline: 'accessibility', points: [[710, 210], [580, 210], [480, 210], [480, 435], [700, 435]] },
  { discipline: 'structure', points: [[285, 60], [285, 230], [285, 400]] },
];

const SCENARIOS: Record<string, Scenario> = {
  base: {
    name: 'Escape! on the base building',
    outcomes: [
      { blockIdx: 1, reason: 'TOO NARROW', numbers: 'needs 1.8 m, has 1.2 m', left: true, below: true },
      { blockIdx: 1, reason: 'CANNOT TURN', numbers: 'needs 1.6 m, has 1.2 m' },
      { blockIdx: 1, reason: 'STEP', numbers: 'step 0.15 m, needs level', left: true },
      {},
    ],
  },
  shaft: {
    name: 'Widen the plant shaft to 2 m',
    outcomes: [
      {},
      { blockIdx: 1, reason: 'CANNOT TURN', numbers: 'needs 1.6 m, has 1.2 m' },
      { blockIdx: 1, reason: 'STEP', numbers: 'step 0.15 m, needs level', left: true },
      { blockIdx: 1, reason: 'NO SUPPORT', numbers: 'beam B2 cut by the wider shaft', below: true },
    ],
  },
  win: { name: 'Transfer beam, ramp and wider lobby door', outcomes: [{}, {}, {}, {}] },
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.appendChild(n);
  return n;
}

function lengths(points: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    out.push(out[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return out;
}

function pointAt(points: Pt[], cum: number[], d: number): Pt {
  for (let i = 1; i < points.length; i++) {
    if (d <= cum[i]! || i === points.length - 1) {
      const [ax, ay] = points[i - 1]!;
      const [bx, by] = points[i]!;
      const seg = cum[i]! - cum[i - 1]! || 1;
      const t = Math.min(1, Math.max(0, (d - cum[i - 1]!) / seg));
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
  }
  return points[0]!;
}

function trailPoints(points: Pt[], cum: number[], d: number): string {
  const out: Pt[] = [points[0]!];
  for (let i = 1; i < points.length && cum[i]! < d; i++) out.push(points[i]!);
  out.push(pointAt(points, cum, d));
  return out.map((p) => p.join(',')).join(' ');
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------- Page setup ----------

const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = FONT_STYLESHEET;
document.head.appendChild(fontLink);
document.body.style.background = BACKGROUND;
document.body.style.color = TEXT;
document.body.style.fontFamily = FONT_BODY;
document.getElementById('title')!.style.fontFamily = FONT_DISPLAY;
document.getElementById('title')!.style.color = SCORE;
for (const b of document.querySelectorAll<HTMLButtonElement>('.controls button')) {
  b.style.fontFamily = FONT_DISPLAY;
  b.style.color = SCORE;
  b.style.border = `2px solid ${WALL}`;
}

const svg = document.getElementById('maze') as unknown as SVGSVGElement;
const board = document.getElementById('board')!;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const swatches: [string, string][] = [
  ['Background', BACKGROUND], ['Wall', WALL], ['Wall inner', WALL_INNER], ['Pellet', PELLET],
  ['Text', TEXT], ['Muted text', TEXT_MUTED], ['Score', SCORE], ['Pass', PASS], ['Fail', FAIL],
  ...Object.values(DISCIPLINE_STYLE).map((s): [string, string] => [`${s.glyph} ${s.label}`, s.color]),
];
document.getElementById('swatches')!.replaceChildren(...swatches.map(([name, c]) => {
  const d = document.createElement('div');
  d.className = 'sw';
  const i = document.createElement('i');
  i.style.background = c;
  const t = document.createElement('span');
  t.textContent = name;
  const s = document.createElement('small');
  s.textContent = c;
  t.appendChild(s);
  d.append(i, t);
  return d;
}));

// ---------- Drawing ----------

let frame = 0;
let walls: SVGRectElement[] = [];

function drawMaze(): void {
  svg.replaceChildren();
  el('rect', { x: 0, y: 0, width: 800, height: 480, fill: BACKGROUND }, svg);
  const grid = el('g', { stroke: GRID, 'stroke-width': 1 }, svg);
  for (let x = 0; x <= 800; x += PX) el('line', { x1: x, y1: 0, x2: x, y2: 480 }, grid);
  for (let y = 0; y <= 480; y += PX) el('line', { x1: 0, y1: y, x2: 800, y2: y }, grid);
  const glow = el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, el('defs', {}, svg));
  el('feGaussianBlur', { stdDeviation: 3 * PATH.glow + 1, result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);
  walls = [];
  const gap = 0.15 * PX;
  for (const r of ROOMS) {
    el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, fill: WALL_INNER, 'fill-opacity': 0.25 }, svg);
    walls.push(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, fill: 'none', stroke: WALL, 'stroke-width': 3 }, svg));
    el('rect', { x: r.x + gap, y: r.y + gap, width: r.w - 2 * gap, height: r.h - 2 * gap, rx: 5, fill: 'none', stroke: WALL_INNER, 'stroke-width': 2 }, svg);
    const label = el('text', { x: r.x + 12, y: r.y + 22, fill: TEXT_MUTED, 'font-size': 9, 'font-family': FONT_DISPLAY }, svg);
    label.textContent = r.name;
  }
  // Beam B2 crosses the shaft.
  el('line', { x1: 232, y1: 230, x2: 308, y2: 230, stroke: TEXT_MUTED, 'stroke-width': 4, 'stroke-dasharray': '6 4' }, svg);
  const b2 = el('text', { x: 312, y: 234, fill: TEXT_MUTED, 'font-size': 8, 'font-family': FONT_DISPLAY }, svg);
  b2.textContent = 'B2';
  // Neutral decoration pellets along the street, away from routes.
  for (let x = 560; x <= 760; x += PATH.pelletSpacing * PX) {
    el('circle', { cx: x, cy: 452, r: PATH.pelletRadius * PX * 0.8, fill: PELLET }, svg);
  }
}

interface Live {
  run: Run;
  out: Outcome;
  cum: number[];
  total: number;
  stop: number;
  pellets: { c: SVGCircleElement; d: number }[];
  trail: SVGPolylineElement;
  token: SVGGElement;
  x?: SVGGElement;
  shown: boolean;
}

function play(key: string): void {
  cancelAnimationFrame(frame);
  const sc = SCENARIOS[key]!;
  drawMaze();
  const lives: Live[] = RUNS.map((run, i) => {
    const out = sc.outcomes[i] ?? {};
    const color = DISCIPLINE_STYLE[run.discipline].color;
    const cum = lengths(run.points);
    const total = cum[cum.length - 1]!;
    const stop = out.blockIdx !== undefined ? cum[out.blockIdx]! : total;
    const layer = el('g', {}, svg);
    const pellets: Live['pellets'] = [];
    const step = PATH.pelletSpacing * PX;
    for (let d = step; d < total - 2; d += step) {
      const [cx, cy] = pointAt(run.points, cum, d);
      pellets.push({ d, c: el('circle', { cx, cy, r: PATH.pelletRadius * PX, fill: color, filter: 'url(#glow)' }, layer) });
    }
    const trail = el('polyline', {
      points: '', fill: 'none', stroke: color, 'stroke-width': PATH.trailWidth * PX,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#glow)',
    }, layer);
    const token = el('g', {}, svg);
    el('circle', { r: PATH.tokenRadius * PX, fill: color, filter: 'url(#glow)' }, token);
    const g = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: BACKGROUND, 'font-size': 12, 'font-family': FONT_DISPLAY }, token);
    g.textContent = DISCIPLINE_STYLE[run.discipline].glyph;
    return { run, out, cum, total, stop, pellets, trail, token, shown: false };
  });

  renderBoard(lives, false);
  const t0 = performance.now();
  const travel = MOTION.secondsPerToken * 1000;
  const allDone = MOTION.staggerSeconds * 1000 * (lives.length - 1) + travel;
  let finishedAt = 0;

  const tick = (now: number): void => {
    const el0 = reduced ? allDone + 10_000 : now - t0;
    for (const [i, L] of lives.entries()) {
      const local = Math.max(0, el0 - i * MOTION.staggerSeconds * 1000);
      const d = Math.min(L.stop, ease(Math.min(1, local / travel)) * L.total);
      const reached = d >= L.stop - 0.5;
      const [x, y] = pointAt(L.run.points, L.cum, d);
      let shake = 0;
      if (L.out.blockIdx !== undefined && reached) {
        if (!L.shown) { L.shown = true; showFail(L, x, y, now); }
        const since = now - (L.x ? Number(L.x.dataset.t) : now);
        if (since < MOTION.failShakeMs && !reduced) shake = Math.sin((since / MOTION.failShakeMs) * Math.PI * 4) * 5;
        if (L.x) {
          const blinkMs = 1000 / MOTION.failBlinkHz;
          const blinking = since < blinkMs * MOTION.failBlinkCount && !reduced;
          L.x.style.opacity = blinking && since % blinkMs > blinkMs / 2 ? '0' : '1';
        }
      }
      L.token.setAttribute('transform', `translate(${x + shake} ${y})`);
      L.trail.setAttribute('points', trailPoints(L.run.points, L.cum, d));
      for (const p of L.pellets) {
        const eaten = p.d <= d;
        p.c.style.display = eaten ? 'none' : '';
        if (p.d > L.stop && reached) { p.c.setAttribute('fill', DIM); p.c.removeAttribute('filter'); }
      }
    }
    if (el0 >= allDone) {
      if (!finishedAt) { finishedAt = now; renderBoard(lives, true); }
      if (lives.every((L) => L.out.blockIdx === undefined)) win(now - finishedAt);
      else if (now - finishedAt > 3000) return;
    }
    if (reduced && finishedAt) return;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

function showFail(L: Live, x: number, y: number, now: number): void {
  const g = el('g', { transform: `translate(${x} ${y})` }, svg);
  g.dataset.t = String(now);
  const s = 16;
  el('path', { d: `M${-s},${-s} L${s},${s} M${s},${-s} L${-s},${s}`, stroke: FAIL, 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
  const style = DISCIPLINE_STYLE[L.run.discipline];
  const flip = L.out.left ? -1 : 1;
  const box = el('g', { transform: `translate(${flip * 24} ${L.out.below ? 22 : -62})` }, g);
  const w = 210;
  el('rect', { x: flip > 0 ? 0 : -w, y: 0, width: w, height: 40, rx: 4, fill: BACKGROUND, stroke: FAIL, 'stroke-width': 2 }, box);
  const t1 = el('text', { x: flip > 0 ? 8 : -w + 8, y: 16, fill: FAIL, 'font-size': 9, 'font-family': FONT_DISPLAY }, box);
  t1.textContent = `${style.label.toUpperCase()} ${L.out.reason ?? ''}`;
  const t2 = el('text', { x: flip > 0 ? 8 : -w + 8, y: 32, fill: TEXT, 'font-size': 12, 'font-family': FONT_BODY }, box);
  t2.textContent = L.out.numbers ?? '';
  L.x = g;
}

let banner: SVGTextElement | null = null;
function win(since: number): void {
  const half = 1000 / MOTION.winFlashHz / 2;
  const flashing = !reduced && since < (1000 / MOTION.winFlashHz) * MOTION.winFlashCount;
  const on = flashing && Math.floor(since / half) % 2 === 0;
  for (const w of walls) w.setAttribute('stroke', on ? TEXT : WALL);
  if (!banner || !banner.isConnected) {
    banner = el('text', { x: 400, y: 250, 'text-anchor': 'middle', fill: SCORE, 'font-family': FONT_DISPLAY, filter: 'url(#glow)' }, svg);
    banner.textContent = 'LEVEL COMPLETE';
  }
  const big = reduced || since < MOTION.bannerHoldSeconds * 1000;
  banner.setAttribute('font-size', big ? '38' : '16');
  banner.setAttribute('y', big ? '250' : '28');
}

function renderBoard(lives: Live[], final: boolean): void {
  board.replaceChildren(...lives.map((L) => {
    const style = DISCIPLINE_STYLE[L.run.discipline];
    const pass = L.out.blockIdx === undefined;
    const li = document.createElement('li');
    li.style.borderColor = final ? (pass ? PASS : FAIL) : WALL_INNER;
    const disc = document.createElement('span');
    disc.className = 'disc';
    disc.style.background = style.color;
    disc.style.fontFamily = FONT_DISPLAY;
    disc.textContent = style.glyph;
    const body = document.createElement('div');
    const top = document.createElement('div');
    top.className = 'row-top';
    top.style.fontFamily = FONT_DISPLAY;
    const name = document.createElement('span');
    name.textContent = style.label.toUpperCase();
    name.style.color = style.color;
    const word = document.createElement('span');
    word.textContent = final ? (pass ? 'PASS' : 'FAIL') : 'READY!';
    word.style.color = final ? (pass ? PASS : FAIL) : SCORE;
    top.append(name, word);
    const detail = document.createElement('div');
    detail.className = 'row-detail';
    detail.style.color = TEXT_MUTED;
    detail.textContent = !final ? '' : pass ? 'escaped' : `${L.out.reason?.toLowerCase()}: ${L.out.numbers}`;
    body.append(top, detail);
    li.append(disc, body);
    return li;
  }));
}

document.getElementById('play-base')!.addEventListener('click', () => play('base'));
document.getElementById('play-shaft')!.addEventListener('click', () => play('shaft'));
document.getElementById('play-win')!.addEventListener('click', () => play('win'));
play('base');
