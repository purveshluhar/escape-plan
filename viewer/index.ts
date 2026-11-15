// Viewer: draws the building as an isometric cutaway and animates every token. Owner: P2.
// The look is design/look.md (Liquid Glass v2): a pale building, route dots the token travels
// over, a tile token with its glyph, a shake and a blinking red X on fail, LEVEL COMPLETE and an
// outline blink on win.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Building, Id, SolverResult } from '../contract/types.ts';
import {
  ACCENT, BACKGROUND, DISCIPLINE_STYLE, FAIL, FAIL_INK, FONT_BODY, FONT_DISPLAY, FONT_STYLESHEET,
  GLASS_STRONG, GRID, MOTION, PATH, SCORE, TEXT, TEXT_MUTED, WALL, WALL_INNER,
} from '../design/tokens.ts';
import { failText, labelSides, labelWidth, roomLabel, tokenName } from './labels.ts';
import {
  cumulativeLengths, easeInOut, frustum, nodeBoxes, pointAt, STOREY_HEIGHT, tokenRoute, uncovered, zoomFactor, CAMERA, dragToPan, panned, type Vec3,
} from './layout.ts';

export interface Viewer {
  show(building: Building, results: SolverResult[]): void;
  // Optional context drawn under everything (for example the Cityweft block), already placed in
  // viewer metres. It never changes the framing, and the building always draws over it. null clears it.
  setBackdrop(object: THREE.Object3D | null): void;
  // Change the right inset (see ViewerOptions) and reframe, for a panel that comes and goes.
  setInsetRight(pixels: number): void;
  // Node ids whose boxes are not drawn, because something else (a real floor plan in the backdrop)
  // stands in for them. Routes still run through them. Redraws at once.
  setCovered(ids: Iterable<Id>): void;
}

export interface ViewerOptions {
  // Pixels on the right of the container covered by a floating panel. The model and LEVEL COMPLETE
  // centre in the space left of it. Default 0.
  insetRight?: number;
  // Called with the zoom factor (1 = framed on the model) each time the mouse wheel changes it.
  onZoom?: (zoom: number) => void;
}

const FILL_OPACITY = 0.5; // pale frosted wall faces
const FLAT_HEIGHT: Partial<Record<string, number>> = { street: 0.15, truck: 2.6 }; // not storey boxes
const VIEW_MARGIN = 1.2;
const CAMERA_DIR = new THREE.Vector3(1, 1, 1).normalize(); // fixed isometric angle
const SHAKE_METRES = 0.25;
// The stopped token sits on blocked_at, so the red X floats just above it instead of hiding under it.
const X_LIFT = -48; // pixels
const LABEL_GAP = 36; // pixels from the X centre to its label
const LABEL_HEIGHT = 56; // pixels, about two lines of label
const ROOM_LABEL_HEIGHT = 16; // pixels, one line of room name
const roomLabelWidth = (text: string): number => text.length * 8.4; // 11 px caps with 1.2 px tracking
const UP = new THREE.Vector3(0, 1, 0);
const WIN_FLASH_OFF = '#ffffff'; // the outline blinks ACCENT <-> white on LEVEL COMPLETE (look.md)

interface Pellet { d: number; core: THREE.Mesh; glow: THREE.Mesh }
interface TrailPiece { from: number; len: number; core: THREE.Mesh; glow: THREE.Mesh }

interface Run {
  points: Vec3[];
  cum: number[];
  total: number;
  stopAt: number;
  fail: boolean;
  delay: number; // seconds after show() before this token starts
  pellets: Pellet[];
  trail: TrailPiece[];
  token: THREE.Group;
  x: { obj: CSS2DObject; at: THREE.Vector3; width: number } | null;
  reachedAt: number | null; // token-local seconds when it reached its stop
}

export function createViewer(container: HTMLElement, options: ViewerOptions = {}): Viewer {
  let insetRight = options.insetRight ?? 0;
  injectStyles();
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  // Transparent canvas, so the page backdrop (with its colour washes) shows behind the model.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(BACKGROUND, 0);
  renderer.autoClear = false;
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'ep-labels';
  container.appendChild(labels.domElement);
  const banner = document.createElement('div');
  banner.className = 'ep-banner';
  banner.textContent = 'LEVEL COMPLETE';
  banner.style.right = `${insetRight}px`;
  container.appendChild(banner);

  const world = new THREE.Scene(); // building and grid
  const rooms = new THREE.Scene(); // room name labels, under the tokens and fail cards
  const fx = new THREE.Scene(); // routes and tokens, drawn over the building so they always read
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA.near, CAMERA.far);
  const backdrop = new THREE.Scene(); // context under the model; lit, unlike the model
  backdrop.add(new THREE.HemisphereLight('#ffffff', '#d9dde3', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(-60, 120, 40);
  backdrop.add(sun);
  let backdropObject: THREE.Object3D | null = null;
  let covered: ReadonlySet<Id> = new Set();
  let zoom = 1; // mouse wheel: 1 = framed on the model, below 1 = closer, above = further out
  const pan = { x: 0, y: 0 }; // metres, set by dragging
  let shown: { building: Building; results: SolverResult[] } | null = null;

  const wallMat = new THREE.LineBasicMaterial({ color: WALL });
  const fillMat = new THREE.MeshBasicMaterial({ color: WALL_INNER, transparent: true, opacity: FILL_OPACITY, depthWrite: false });
  const dimMat = new THREE.MeshBasicMaterial({ color: TEXT_MUTED, transparent: true, opacity: 0.3 });
  const geo = {
    pellet: new THREE.SphereGeometry(PATH.pelletRadius, 12, 8),
    pelletGlow: new THREE.SphereGeometry(PATH.pelletRadius * 2.5, 12, 8),
    trail: new THREE.CylinderGeometry(PATH.trailWidth / 2, PATH.trailWidth / 2, 1, 8).translate(0, 0.5, 0),
    trailGlow: new THREE.CylinderGeometry(PATH.trailWidth * 1.5, PATH.trailWidth * 1.5, 1, 8).translate(0, 0.5, 0),
    tokenGlow: new THREE.SphereGeometry(PATH.tokenRadius * 2, 20, 14),
  };
  const shared = new Set<object>([wallMat, fillMat, dimMat, ...Object.values(geo)]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bounds = new THREE.Box3();
  let runs: Run[] = [];
  let roomTags: { obj: CSS2DObject; text: string; priority: number }[] = [];
  let t0 = performance.now();
  let allDone = 0;
  let win = false;

  function drawBuilding(b: Building): void {
    clear(world, shared);
    clear(rooms, shared);
    roomTags = [];
    const starts = new Set(b.tokens.map((t) => t.start));
    const nodes = new Map(b.nodes.map((n) => [n.id, n]));
    for (const box of uncovered(nodeBoxes(b), covered)) {
      const flat = FLAT_HEIGHT[nodes.get(box.id)?.type ?? ''];
      const [w, , d] = box.size;
      const h = flat ?? STOREY_HEIGHT;
      const y = box.center[1] - STOREY_HEIGHT / 2 + h / 2;
      const outer = new THREE.BoxGeometry(w, h, d);
      const fill = new THREE.Mesh(outer, fillMat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(outer), wallMat);
      for (const o of [fill, edges]) o.position.set(box.center[0], y, box.center[2]);
      world.add(fill, edges);
      const node = nodes.get(box.id);
      if (node) {
        const el = document.createElement('div');
        el.className = 'ep-room';
        el.textContent = roomLabel(node.name, node.is_exit);
        const label = new CSS2DObject(el);
        label.position.set(box.center[0], y + h / 2, box.center[2]); // on the roof of its box
        rooms.add(label);
        roomTags.push({ obj: label, text: el.textContent, priority: node.is_exit || starts.has(node.id) ? 0 : 1 });
      }
    }
    bounds.setFromObject(world);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = 2 * Math.ceil((Math.max(size.x, size.z) + 12) / 2);
    const grid = new THREE.GridHelper(span, span, GRID, GRID);
    grid.position.set(Math.round(centre.x), -0.01, Math.round(centre.z));
    world.add(grid);
  }

  function buildRuns(b: Building, results: SolverResult[]): void {
    clear(fx, shared);
    runs = [];
    results.forEach((r, i) => {
      const token = b.tokens.find((t) => t.id === r.token);
      if (!token) return;
      const style = DISCIPLINE_STYLE[token.discipline];
      const route = tokenRoute(b, r, i);
      const cum = cumulativeLengths(route.points);
      const total = cum[cum.length - 1] ?? 0;
      const color = new THREE.Color(style.color);
      const core = new THREE.MeshBasicMaterial({ color });
      const glow = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: PATH.glow * 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      glow.visible = PATH.glow > 0;

      const pellets: Pellet[] = [];
      for (let d = PATH.pelletSpacing; d < total - 1e-6; d += PATH.pelletSpacing) {
        const p = pointAt(route.points, cum, d);
        const pellet = { d, core: new THREE.Mesh(geo.pellet, core), glow: new THREE.Mesh(geo.pelletGlow, glow) };
        pellet.core.position.set(...p);
        pellet.glow.position.set(...p);
        fx.add(pellet.core, pellet.glow);
        pellets.push(pellet);
      }

      const trail: TrailPiece[] = [];
      for (let s = 0; s + 1 < route.points.length; s++) {
        const a = new THREE.Vector3(...route.points[s]!);
        const dir = new THREE.Vector3(...route.points[s + 1]!).sub(a);
        const len = dir.length();
        if (len < 1e-6) continue;
        const piece = { from: cum[s]!, len, core: new THREE.Mesh(geo.trail, core), glow: new THREE.Mesh(geo.trailGlow, glow) };
        for (const m of [piece.core, piece.glow]) {
          m.position.copy(a);
          m.quaternion.setFromUnitVectors(UP, dir.normalize());
          m.visible = false;
          fx.add(m);
        }
        trail.push(piece);
      }

      const tokenGroup = new THREE.Group();
      tokenGroup.add(new THREE.Mesh(geo.tokenGlow, glow));
      const disc = document.createElement('div');
      disc.className = 'ep-token';
      disc.innerHTML = `<i style="--c:${style.color};--ink:${style.glyphInk}" title="${tokenName(token.id)}">${style.glyph}</i>`;
      tokenGroup.add(new CSS2DObject(disc));
      tokenGroup.position.set(...(route.points[0] ?? [0, 0, 0]));
      fx.add(tokenGroup);

      let x: Run['x'] = null;
      const words = failText(b, r);
      if (route.blocked && words) {
        const el = document.createElement('div');
        el.className = 'ep-fail side-right';
        el.innerHTML = '<div class="ep-x"></div><div class="ep-card"><b></b><span></span></div>';
        el.querySelector('b')!.textContent = words.title;
        el.querySelector('span')!.textContent = words.detail;
        const obj = new CSS2DObject(el);
        obj.position.set(...route.blocked);
        obj.visible = false;
        fx.add(obj);
        x = { obj, at: new THREE.Vector3(...route.blocked), width: labelWidth(words) };
      }

      for (const p of route.points) bounds.expandByPoint(new THREE.Vector3(...p));
      runs.push({
        points: route.points, cum, total, stopAt: route.stopAt, fail: r.status === 'fail',
        delay: runs.length * MOTION.staggerSeconds, pellets, trail, token: tokenGroup, x, reachedAt: null,
      });
    });
    allDone = Math.max(0, runs.length - 1) * MOTION.staggerSeconds + MOTION.secondsPerToken;
  }

  function fit(): void {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    if (bounds.isEmpty()) return;
    const centre = bounds.getCenter(new THREE.Vector3());
    camera.position.copy(centre).addScaledVector(CAMERA_DIR, CAMERA.distance);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    let hx = 0;
    let hy = 0;
    const { min, max } = bounds;
    for (const cx of [min.x, max.x]) for (const cy of [min.y, max.y]) for (const cz of [min.z, max.z]) {
      const v = new THREE.Vector3(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse);
      hx = Math.max(hx, Math.abs(v.x));
      hy = Math.max(hy, Math.abs(v.y));
    }
    Object.assign(camera, panned(frustum({ hx, hy, width: w, height: h, insetRight, margin: VIEW_MARGIN * zoom }), pan));
    camera.updateProjectionMatrix();

    // Room labels that would overlap on screen (stacked storeys): keep exits and start rooms first.
    const kept: { x: number; y: number; w: number }[] = [];
    for (const tag of [...roomTags].sort((a, b) => a.priority - b.priority)) {
      const v = tag.obj.position.clone().project(camera);
      const at = { x: (v.x + 1) * w / 2, y: (1 - v.y) * h / 2, w: roomLabelWidth(tag.text) };
      const clash = kept.some((k) => Math.abs(k.x - at.x) < (k.w + at.w) / 2 + 6 && Math.abs(k.y - at.y) < ROOM_LABEL_HEIGHT);
      tag.obj.visible = !clash;
      if (!clash) kept.push(at);
    }

    const xs = runs.flatMap((r) => (r.x ? [r.x] : []));
    const sides = labelSides(xs.map(({ at, width }) => {
      const v = at.clone().project(camera);
      return { x: (v.x + 1) * w / 2, y: (1 - v.y) * h / 2 + X_LIFT, width };
    }), { height: LABEL_HEIGHT, gap: LABEL_GAP, minX: 8, maxX: w - insetRight - 8 });
    xs.forEach(({ obj }, i) => {
      for (const side of ['left', 'right', 'above']) obj.element.classList.toggle(`side-${side}`, sides[i] === side);
    });
  }

  function update(run: Run, local: number): void {
    const p = Math.min(1, Math.max(0, local / MOTION.secondsPerToken));
    const along = easeInOut(p) * run.total;
    const d = Math.min(run.stopAt, along);
    if (run.reachedAt === null && local >= 0 && (p >= 1 || along >= run.stopAt - 1e-6)) {
      run.reachedAt = local;
      if (run.fail) {
        if (run.x) run.x.obj.visible = true;
        for (const pellet of run.pellets) {
          if (pellet.d > run.stopAt + 1e-6) {
            pellet.core.material = dimMat;
            pellet.glow.visible = false;
          }
        }
      }
    }
    for (const pellet of run.pellets) {
      const ahead = pellet.d > d;
      pellet.core.visible = ahead;
      pellet.glow.visible = ahead && pellet.core.material !== dimMat;
    }
    for (const piece of run.trail) {
      const len = Math.min(piece.len, Math.max(0, d - piece.from));
      for (const m of [piece.core, piece.glow]) {
        m.visible = len > 1e-4;
        m.scale.y = Math.max(len, 1e-4);
      }
    }
    run.token.position.set(...pointAt(run.points, run.cum, d));
    const since = run.reachedAt === null ? Infinity : (local - run.reachedAt) * 1000;
    if (run.fail && since < MOTION.failShakeMs && !reduced) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      run.token.position.addScaledVector(right, Math.sin((since / MOTION.failShakeMs) * Math.PI * 4) * SHAKE_METRES);
    }
  }

  function frame(now: number): void {
    const t = reduced ? allDone + 60 : (now - t0) / 1000;
    for (const run of runs) update(run, t - run.delay);
    if (win && t >= allDone) {
      const since = t - allDone;
      const period = 1 / MOTION.winFlashHz;
      const flashing = !reduced && since < period * MOTION.winFlashCount;
      wallMat.color.set(flashing ? (since % period < period / 2 ? ACCENT : WIN_FLASH_OFF) : WALL);
      banner.classList.add('on');
      banner.classList.toggle('small', reduced || since >= MOTION.bannerHoldSeconds);
    }
    renderer.clear();
    if (backdropObject) {
      renderer.render(backdrop, camera);
      renderer.clearDepth();
    }
    renderer.render(world, camera);
    renderer.clearDepth();
    renderer.render(fx, camera);
    labels.render(rooms, camera);
    labels.render(fx, camera);
  }

  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = zoomFactor(zoom, e.deltaY);
    options.onZoom?.(zoom);
    fit();
  }, { passive: false });
  // Drag to pan; double-click to go back to the framed view.
  const canvas = renderer.domElement;
  let drag: { x: number; y: number } | null = null;
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const view = { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom };
    const d = dragToPan(view, canvas.clientWidth || 800, canvas.clientHeight || 600, e.clientX - drag.x, e.clientY - drag.y);
    pan.x += d.x;
    pan.y += d.y;
    drag = { x: e.clientX, y: e.clientY };
    fit();
  });
  const endDrag = (): void => {
    drag = null;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => {
    zoom = 1;
    pan.x = 0;
    pan.y = 0;
    options.onZoom?.(zoom);
    fit();
  });
  new ResizeObserver(fit).observe(container);
  renderer.setAnimationLoop(frame);

  function show(building: Building, results: SolverResult[]): void {
    shown = { building, results };
    drawBuilding(building);
    buildRuns(building, results);
    win = results.length > 0 && results.every((r) => r.status === 'pass');
    // During and after a run the routes and fail cards lead; the room names step back.
    labels.domElement.classList.toggle('ep-run', results.some((r) => r.path.length > 0));
    wallMat.color.set(WALL);
    banner.classList.remove('on', 'small');
    fit();
    t0 = performance.now();
  }

  function setBackdrop(object: THREE.Object3D | null): void {
    if (backdropObject) backdrop.remove(backdropObject);
    backdropObject = object;
    if (object) backdrop.add(object);
    renderer.localClippingEnabled = object !== null; // a backdrop may cut itself with clipping planes
  }

  function setInsetRight(pixels: number): void {
    if (pixels === insetRight) return;
    insetRight = pixels;
    banner.style.right = `${insetRight}px`;
    fit();
  }

  function setCovered(ids: Iterable<Id>): void {
    covered = new Set(ids);
    if (shown) show(shown.building, shown.results);
  }

  return { show, setBackdrop, setInsetRight, setCovered };
}

// Empty a scene, freeing GPU memory for everything that is not shared, and removing label elements
// (three only removes a label's element when the label itself, not its parent, is removed).
function clear(scene: THREE.Scene, shared: Set<object>): void {
  scene.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      if (!shared.has(o.geometry)) o.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (!shared.has(m)) m.dispose();
    }
  });
  scene.clear();
}

let styled = false;
function injectStyles(): void {
  if (styled) return;
  styled = true;
  if (!document.querySelector(`link[href="${FONT_STYLESHEET}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_STYLESHEET;
    document.head.appendChild(link);
  }
  const style = document.createElement('style');
  style.textContent = `
.ep-labels { position: absolute; inset: 0; pointer-events: none; }
.ep-token, .ep-fail { width: 0; height: 0; }
/* Room names: quiet caps on each roof, always under tokens and fail cards. */
.ep-room { z-index: 0 !important; transform-origin: center; white-space: nowrap; font: 600 11px/1 ${FONT_BODY};
  letter-spacing: 1.2px; text-transform: uppercase; color: ${TEXT_MUTED}; text-shadow: 0 0 3px #ffffff, 0 0 6px #ffffff;
  transition: opacity 0.3s; }
.ep-run .ep-room { opacity: 0.35; }
/* CSS2DRenderer stacks labels by distance; a red X and its label must never hide behind a token. */
.ep-fail { z-index: 100000 !important; }
.ep-token i { position: absolute; transform: translate(-50%, -50%); width: 38px; height: 38px;
  display: grid; place-items: center; background: var(--c); color: var(--ink); font: 700 18px ${FONT_BODY};
  font-style: normal; border-radius: 10px; box-shadow: 0 0 0 2px #ffffff, 0 4px 10px rgba(15, 23, 42, 0.18); }
.ep-x { position: absolute; top: ${X_LIFT}px; width: 0; height: 0; animation: ep-pop 0.25s ease-out,
  ep-blink ${1 / MOTION.failBlinkHz}s steps(1, end) 0.25s ${MOTION.failBlinkCount}; }
.ep-x::before, .ep-x::after { content: ''; position: absolute; width: 50px; height: 9px; border-radius: 5px;
  background: ${FAIL}; box-shadow: 0 0 0 2px #ffffff; transform: translate(-50%, -50%) rotate(45deg); }
.ep-x::after { transform: translate(-50%, -50%) rotate(-45deg); }
.ep-card { position: absolute; top: ${X_LIFT}px; transform: translateY(-50%); white-space: nowrap; background: ${GLASS_STRONG};
  border: 2px solid ${FAIL}; border-radius: 10px; padding: 8px 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  animation: ep-fade 0.25s ease-out; }
.side-right .ep-card { left: ${LABEL_GAP}px; }
.side-left .ep-card { right: ${LABEL_GAP}px; }
.side-above .ep-card { left: 0; top: ${X_LIFT - 32}px; transform: translate(-50%, -100%); }
.ep-card b { display: block; font: 700 14px/1.3 ${FONT_BODY}; letter-spacing: 1px; color: ${FAIL_INK}; white-space: pre; }
.ep-card span { display: block; margin-top: 4px; font: 600 15px/1.3 ${FONT_BODY}; color: ${TEXT}; }
.ep-banner { position: absolute; left: 0; right: 0; top: 50%; text-align: center; pointer-events: none; z-index: 100001;
  font: clamp(24px, 5vw, 64px) ${FONT_DISPLAY}; color: ${SCORE};
  opacity: 0; transform: translateY(-50%) scale(0.6); transition: opacity 0.3s, transform 0.3s, top 0.4s, font-size 0.4s; }
.ep-banner.on { opacity: 1; transform: translateY(-50%) scale(1); }
.ep-banner.on.small { top: 32px; font-size: 20px; }
@keyframes ep-pop { from { transform: scale(0); } 60% { transform: scale(1.35); } to { transform: scale(1); } }
@keyframes ep-blink { 50% { opacity: 0; } }
@keyframes ep-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ep-x, .ep-card { animation: none; } .ep-banner { transition: none; } }
`;
  document.head.appendChild(style);
}
