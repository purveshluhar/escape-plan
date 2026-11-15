// Viewer: draws the building as an isometric cutaway and animates every token. Owner: P2.
// The look is design/look.md (Liquid Glass v2): route dots the token travels over, a figurine
// for each token (figures.ts), a shake and a blinking red X on a No, a calm Yes to all when every answer is yes.
// The building on screen is the real 432 Park backdrop; the graph's own rooms are not drawn.
// A press on a token picks it up: drop it on any floor (drop.ts), or click it to select it.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Building, Discipline, Id, SolverResult } from '../contract/types.ts';
import {
  ACCENT, BACKGROUND, DISCIPLINE_STYLE, FAIL, FAIL_INK, FAIL_TINT, FONT_BODY, FONT_DATA, FONT_STYLESHEET,
  GLASS_STRONG, MOTION, PASS_INK, PATH, TEXT, TEXT_MUTED, WALL,
} from '../design/tokens.ts';
import { dropTarget, figureScale, isMemberStart, movedPastSlop, pickToken, pressIntent } from './drop.ts';
import type { DropTarget, Ray } from './drop.ts';
import { disposeTree, figureLights, loadFigureModels, makeFigure } from './figures.ts';
import type { Figure } from './figures.ts';
import { calloutText, coveredBy, failText, labelSides, labelWidth, roomLabel, stayText, tokenName } from './labels.ts';
import { flashPoint, flashingMembers, memberBoxes } from './members.ts';
import { smokeTints, tintOnShownFloor, tintVisible } from './smoke.ts';
import type { Rect } from './labels.ts';
import {
  cumulativeLengths, easeInOut, frustum, graphMarks, pointAt, tokenRoute, zoomFactor, CAMERA, DEFAULT_VIEW, PATH_LIFT, dragToPan, orbit, panned, viewDirection, type Vec3,
  focusHeight, belowCut, cutLevel, dropCeiling, fadeAt, floorName, floorTagRect, keepFloorTags, planExtent, retarget, revealed, FLOOR_TAG_GAP,
  type Fade, type ScreenRect,
} from './layout.ts';

export interface Viewer {
  show(building: Building, results: SolverResult[]): void;
  // Optional context drawn under everything (for example the Cityweft block), already placed in
  // viewer metres. It never changes the framing, and the building always draws over it. null clears it.
  setBackdrop(object: THREE.Object3D | null): void;
  // The levels drawn as real floors in the backdrop. Zooming in opens the facade only when there are
  // some, and only these levels are cut to and labelled. Default none.
  setFloors(levels: Iterable<Id>): void;
  // Change the right inset (see ViewerOptions) and reframe, for a panel that comes and goes.
  setInsetRight(pixels: number): void;
  // Node ids left out of the frame, because something else (the real tower in the
  // backdrop) stands in for them. No node is drawn as a box; routes still run through every node.
  // Redraws at once.
  setCovered(ids: Iterable<Id>): void;
  // Pick a token up from outside the model (a dock chip), from a pointerdown already under way.
  // The drop ends as onDrop, onRefuse, or nothing when it is let go outside the model.
  startDrag(token: Id, event: PointerEvent): void;
  // Whether a press on a token picks it up (false while a run plays). Default true.
  setDragEnabled(on: boolean): void;
  // The selected token gets an accent rim and `caption` under it; null clears the selection.
  select(token: Id | null, caption: string | null): void;
  // A ring that grows and fades where an edit landed: a door, a shaft or a member by id. Nothing for
  // an id the building does not have.
  flash(target: Id): void;
  // The smoke's spread as a tint on each node of the slice it has reached: `steps` is the step the
  // smoke reaches each node, and a node shows `secondsPerStep` seconds per step after `delaySeconds` (when the people start) from show(). All at
  // once on reduced motion. null clears it. Tower floors the backdrop stands in for get no tint.
  setSmoke(spread: { steps: ReadonlyMap<Id, number>; secondsPerStep: number; delaySeconds?: number } | null): void;
}

export interface ViewerOptions {
  // Pixels on the right of the container covered by a floating panel. The model and LEVEL COMPLETE
  // centre in the space left of it. Default 0.
  insetRight?: number;
  // Called with the zoom factor (1 = framed on the model) each time the mouse wheel changes it.
  onZoom?: (zoom: number) => void;
  // Zoomed in past REVEAL_ZOOM (layout.ts) the outside of the building opens: called each frame the
  // amount changes, from 0 (facade solid, city at full strength) to 1 (facade gone, city dimmed),
  // easing both ways. `cut` is the elevation of the top floor to draw (Infinity at amount 0): the
  // floors above it are cut away so its plan shows. The viewer labels each floor in view itself.
  onReveal?: (amount: number, cut: number) => void;
  // Elements of the app drawn over the model that take no pointer events (a banner, for example):
  // floor labels keep clear of them as they do of every panel.
  avoid?: () => Element[];
  // A token was dropped on a room or core: the app makes that node its start.
  onDrop?: (token: Id, node: Id) => void;
  // A token was dropped where no room takes it; the viewer has already said so on screen.
  onRefuse?: (token: Id) => void;
  // A click on a token (its id) or on empty space (null).
  onSelect?: (token: Id | null) => void;
}

const VIEW_MARGIN = 1.2;
const SHAKE_METRES = 0.25;
// The stopped token sits on blocked_at, so the red X floats just above it instead of hiding under it.
const X_LIFT = -48; // pixels
const LABEL_GAP = 36; // pixels from the X centre to its label
const LABEL_HEIGHT = 56; // pixels, about two lines of label
const LABEL_HEIGHT_CALLOUT = 88; // pixels, and the measurement chip under the title
const MEMBER_OPACITY = 0.9;
const ROOM_LABEL_HEIGHT = 16; // pixels, one line of room name
const roomLabelWidth = (text: string): number => text.length * 8.4; // 11 px caps with 1.2 px tracking
const UP = new THREE.Vector3(0, 1, 0);
const HIT_PIXELS = 36; // a press this close to a figure's middle picks it up
const SNAP_PIXELS = 56; // a drop this close to a room's token spot lands on that room
const SMOKE_COLOR = '#6b7686'; // the smoke figure's grey (figures.ts), a little deeper so it reads on the daylight model
const REFUSED = 'Not placed: drop it on a floor of the tower';

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
  id: Id;
  discipline: Discipline;
  token: THREE.Group;
  figure: Figure;
  x: { obj: CSS2DObject; at: THREE.Vector3; width: number; callout: boolean; card?: { w: number; h: number } } | null;
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
  banner.textContent = 'Yes to all';
  banner.style.right = `${insetRight}px`;
  container.appendChild(banner);
  // Under the pointer while a token is carried: where it would land, or that it cannot land there.
  const hint = document.createElement('div');
  hint.className = 'ep-hint';
  container.appendChild(hint);
  const toast = document.createElement('div');
  toast.className = 'ep-toast';
  toast.setAttribute('aria-hidden', 'true'); // the app says it in its own live region
  container.appendChild(toast);

  const rooms = new THREE.Scene(); // room name labels, under the tokens and fail cards
  const fx = new THREE.Scene(); // routes and tokens, drawn over the building so they always read
  const marks = new THREE.Scene(); // short-lived rings (the edit flash); kept when show() redraws
  const carry = new THREE.Scene(); // the carried token and the floor it would land on, over everything
  carry.add(...figureLights());
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA.near, CAMERA.far);
  const backdrop = new THREE.Scene(); // context under the model; lit, unlike the model
  backdrop.add(new THREE.HemisphereLight('#ffffff', '#d9dde3', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(-60, 120, 40);
  backdrop.add(sun);
  let backdropObject: THREE.Object3D | null = null;
  let covered: ReadonlySet<Id> = new Set();
  let zoom = 1; // mouse wheel: 1 = framed on the model, below 1 = closer, above = further out
  const pan = { x: 0, y: 0 }; // metres, set by right-drag
  let view = { ...DEFAULT_VIEW }; // orbit angles, set by left-drag
  let shown: { building: Building; results: SolverResult[] } | null = null;
  let fade: Fade = { from: 0, to: 0, start: 0 }; // facade open amount over time (layout.ts)
  let opened = 0; // its value this frame
  let cut = Infinity; // elevation of the level nearest the middle of the view
  let told = { amount: 0, cut: Infinity }; // last onReveal
  let floorLevels: ReadonlySet<Id> = new Set(); // setFloors
  let pointer: { x: number; y: number } | null = null; // last carry position, client pixels
  let hintSize: { text: string; w: number; h: number } | null = null; // measured once per text
  let toastAt: { x: number; y: number; until: number; w: number; h: number } | null = null; // until its fade ends
  let pickCeiling = Infinity; // dropCeiling at the current cut
  let chromeStale = false; // floor labels moved since the last panel check
  let smokeSpread: { steps: ReadonlyMap<Id, number>; secondsPerStep: number; delaySeconds?: number } | null = null;
  let haze: { group: THREE.Group; blocks: { mesh: THREE.Mesh; step: number; floor: number }[] } | null = null;

  const dimMat = new THREE.MeshBasicMaterial({ color: TEXT_MUTED, transparent: true, opacity: 0.3 });
  const geo = {
    pellet: new THREE.SphereGeometry(PATH.pelletRadius, 12, 8),
    pelletGlow: new THREE.SphereGeometry(PATH.pelletRadius * 2.5, 12, 8),
    trail: new THREE.CylinderGeometry(PATH.trailWidth / 2, PATH.trailWidth / 2, 1, 8).translate(0, 0.5, 0),
    trailGlow: new THREE.CylinderGeometry(PATH.trailWidth * 1.5, PATH.trailWidth * 1.5, 1, 8).translate(0, 0.5, 0),
  };
  const shared = new Set<object>([dimMat, ...Object.values(geo)]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bounds = new THREE.Box3();
  let runs: Run[] = [];
  // Members drawn over the building, with their height: hidden with the floors when the facade opens.
  let memberMarks: { objs: THREE.Object3D[]; y: number }[] = [];
  let beating: THREE.MeshLambertMaterial[] = []; // members drawn red: they blink after the run, then stay red
  let roomTags: { obj: CSS2DObject; text: string }[] = [];
  // A label per level ("Level 10"), pinned left of its floor plate; shown only while the facade is open.
  interface FloorTag { obj: CSS2DObject; text: string; elevation: number; rect: ScreenRect | null; free: boolean; w?: number }
  let floorTags: FloorTag[] = []; // highest first: the open floor wins a clash
  let exitRects: ScreenRect[] = []; // exit names on screen, kept by fit()
  let failSides: ('left' | 'right' | 'above')[] = [];
  let extent = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let chromeCheckedAt = 0;
  let avoidBoxes: ScreenRect[] = []; // options.avoid, measured with the panels
  let selected: { id: Id; caption: string | null } | null = null;
  let dragEnabled = true;
  let t0 = performance.now();
  let allDone = 0;
  let win = false;

  // The graph's rooms are self-made, so they are not drawn, and there is no ground grid either: the
  // real plans, facade and city in the backdrop are the building and its ground. The rooms' extent
  // still frames the camera; exits get a label.
  function drawBuilding(b: Building): void {
    clear(rooms, shared);
    roomTags = [];
    const nodes = new Map(b.nodes.map((n) => [n.id, n]));
    const marks = graphMarks(b, covered);
    for (const { id, at } of marks.labels) {
      const node = nodes.get(id)!;
      const el = document.createElement('div');
      el.className = 'ep-room';
      el.textContent = roomLabel(node.name, node.is_exit);
      const label = new CSS2DObject(el);
      label.position.set(...at);
      rooms.add(label);
      roomTags.push({ obj: label, text: el.textContent });
    }
    if (marks.frame) bounds.set(new THREE.Vector3(...marks.frame.min), new THREE.Vector3(...marks.frame.max));
    else bounds.makeEmpty();

    drawFloorTags(b);
  }

  // A label for each level drawn as a real floor (setFloors), all hidden until the facade opens.
  function drawFloorTags(b: Building): void {
    for (const tag of floorTags) {
      tag.obj.element.remove();
      tag.obj.removeFromParent();
    }
    floorTags = [];
    extent = planExtent(b);
    for (const level of [...b.levels].filter((l) => floorLevels.has(l.id)).sort((x, y) => y.elevation - x.elevation)) {
      const el = document.createElement('div');
      el.className = 'ep-floor';
      el.append(document.createElement('span'));
      el.firstElementChild!.textContent = floorName(level.id);
      const obj = new CSS2DObject(el);
      obj.visible = false;
      rooms.add(obj);
      floorTags.push({ obj, text: floorName(level.id), elevation: level.elevation, rect: null, free: false });
    }
  }

  // The structure: footing, column and beam, in slate; a transfer beam in the structure violet; a
  // member the load has lost its support at, in red. Drawn with the routes, over the building.
  function drawMembers(b: Building, results: SolverResult[]): void {
    const red = new Set(flashingMembers(results));
    beating = [];
    memberMarks = [];
    for (const m of memberBoxes(b)) {
      const color = red.has(m.id) ? FAIL : m.kind === 'transfer_beam' ? DISCIPLINE_STYLE.structure.color : WALL;
      const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: MEMBER_OPACITY });
      if (red.has(m.id)) beating.push(mat);
      const geometry = new THREE.BoxGeometry(...m.size);
      const mesh = new THREE.Mesh(geometry, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: TEXT }));
      for (const o of [mesh, edges]) {
        o.position.set(...m.center);
        o.rotation.y = m.yaw;
        fx.add(o);
      }
      memberMarks.push({ objs: [mesh, edges], y: m.center[1] });
    }
  }

  // A member on a hidden floor goes with it (tokens and their routes stay drawn, as always).
  function cutMembers(): void {
    for (const { objs, y } of memberMarks) for (const o of objs) o.visible = opened <= 0 || y < pickCeiling;
  }

  function buildRuns(b: Building, results: SolverResult[]): void {
    for (const run of runs) run.figure.dispose();
    clear(fx, shared);
    fx.add(...figureLights());
    drawMembers(b, results);
    cutMembers();
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
      const figure = makeFigure(token.id, token.discipline);
      tokenGroup.add(figure.object);
      tokenGroup.position.set(...(route.points[0] ?? [0, 0, 0]));
      tokenGroup.visible = !(carried?.moving && carried.id === token.id); // a redraw while it is carried
      fx.add(tokenGroup);

      let x: Run['x'] = null;
      const words = failText(b, r);
      // A fail with no place in it (no route out) gets its red X where the token stands.
      const xAt = route.blocked ?? (r.status === 'fail' ? route.points[0] ?? null : null);
      if (xAt && words) {
        const el = document.createElement('div');
        el.className = 'ep-fail side-right';
        const callout = calloutText(r);
        el.innerHTML = `<div class="ep-x"></div><div class="ep-card"><b></b>${callout ? '<div class="ep-callout"></div>' : ''}<span></span></div>`;
        el.querySelector('b')!.textContent = words.title;
        if (callout) el.querySelector('.ep-callout')!.textContent = callout;
        el.querySelector('span')!.textContent = words.detail;
        const obj = new CSS2DObject(el);
        obj.position.set(...xAt);
        obj.visible = false;
        fx.add(obj);
        x = { obj, at: new THREE.Vector3(...xAt), width: labelWidth(words), callout: callout !== null };
      }

      // A run's route stays in frame; a parked token (no path yet) never moves the camera, so a drop
      // on a high floor does not reframe the view under the player's hand.
      if (r.path.length > 0) for (const p of route.points) bounds.expandByPoint(new THREE.Vector3(...p));
      runs.push({
        points: route.points, cum, total, stopAt: route.stopAt, fail: r.status === 'fail',
        delay: runs.length * MOTION.staggerSeconds, pellets, trail, id: token.id, discipline: token.discipline, token: tokenGroup, figure, x,
        reachedAt: null,
      });
    });
    markSelected();
    allDone = Math.max(0, runs.length - 1) * MOTION.staggerSeconds + MOTION.secondsPerToken;
  }

  // The smoke tint (smoke.ts): one translucent block per reached node of the slice, drawn with the
  // routes. Rebuilt whenever the building, the covered set or the spread changes.
  function drawSmoke(): void {
    if (haze) {
      disposeTree(haze.group, shared);
      fx.remove(haze.group);
      haze = null;
    }
    if (!smokeSpread || !shown) return;
    const group = new THREE.Group();
    const blocks = smokeTints(shown.building, covered, smokeSpread.steps).map((t) => {
      const material = new THREE.MeshBasicMaterial({ color: SMOKE_COLOR, transparent: true, opacity: t.opacity, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...t.size), material);
      mesh.position.set(...t.center);
      mesh.renderOrder = 1;
      group.add(mesh);
      return { mesh, step: t.step, floor: t.floor };
    });
    fx.add(group);
    haze = { group, blocks };
  }

  function setSmoke(spread: { steps: ReadonlyMap<Id, number>; secondsPerStep: number; delaySeconds?: number } | null): void {
    smokeSpread = spread;
    drawSmoke();
  }

  function fit(): void {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    if (bounds.isEmpty()) return;
    const centre = bounds.getCenter(new THREE.Vector3());
    camera.position.copy(centre).addScaledVector(new THREE.Vector3(...viewDirection(view.azimuth, view.elevation)), CAMERA.distance);
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

    // The level in the middle of the free view stays the top one drawn.
    const drawn = shown ? shown.building.levels.filter((l) => floorLevels.has(l.id)) : [];
    cut = cutLevel(drawn, focusHeight(centre.y, view, pan));
    pickCeiling = dropCeiling(drawn, cut);

    // Each floor at or under the cut is labelled at the plate corner furthest left on screen.
    for (const tag of floorTags) {
      const was = tag.rect;
      tag.rect = null;
      if (tag.elevation > cut + 1e-6) continue;
      let best: { at: THREE.Vector3; x: number; y: number } | null = null;
      for (const cx of [extent.minX, extent.maxX]) for (const cz of [extent.minZ, extent.maxZ]) {
        const at = new THREE.Vector3(cx, tag.elevation, cz);
        const v = at.clone().project(camera);
        const p = { at, x: (v.x + 1) * w / 2, y: (1 - v.y) * h / 2 };
        if (!best || p.x < best.x) best = p;
      }
      tag.obj.position.copy(best!.at);
      const span = tag.obj.element.firstElementChild as HTMLElement;
      if (tag.w === undefined && span.offsetWidth > 0) tag.w = span.offsetWidth;
      const rect = floorTagRect(best!, tag.text, tag.w);
      span.style.right = `${FLOOR_TAG_GAP - rect.shift}px`;
      if (rect.top >= 0 && rect.bottom <= h && rect.right <= w - insetRight) tag.rect = rect;
      // A label that moved waits for the next panel check (within 100 ms) before it shows again.
      if (!was || was.left !== rect.left || was.top !== rect.top) tag.free = false;
    }
    chromeStale = true;

    // Exit labels that would overlap on screen: keep the first.
    const kept: { x: number; y: number; w: number }[] = [];
    for (const tag of roomTags) {
      const v = tag.obj.position.clone().project(camera);
      const at = { x: (v.x + 1) * w / 2, y: (1 - v.y) * h / 2, w: roomLabelWidth(tag.text) };
      const clash = kept.some((k) => Math.abs(k.x - at.x) < (k.w + at.w) / 2 + 6 && Math.abs(k.y - at.y) < ROOM_LABEL_HEIGHT);
      tag.obj.visible = !clash;
      if (!clash) kept.push(at);
    }
    exitRects = kept.map((k) => ({ left: k.x - k.w / 2, right: k.x + k.w / 2, top: k.y - ROOM_LABEL_HEIGHT / 2, bottom: k.y + ROOM_LABEL_HEIGHT / 2 }));

    const xs = runs.flatMap((r) => (r.x ? [r.x] : []));
    const sides = labelSides(xs.map(({ at, width }) => {
      const v = at.clone().project(camera);
      return { x: (v.x + 1) * w / 2, y: (1 - v.y) * h / 2 + X_LIFT, width };
    }), { height: xs.some((x) => x.callout) ? LABEL_HEIGHT_CALLOUT : LABEL_HEIGHT, gap: LABEL_GAP, minX: 8, maxX: w - insetRight - 8 });
    xs.forEach(({ obj }, i) => {
      for (const side of ['left', 'right', 'above']) obj.element.classList.toggle(`side-${side}`, sides[i] === side);
    });
    failSides = sides;
  }

  // A floor label is free when nothing outside the model (the dock, a panel, the status line) sits
  // over any part of it. The label layer takes no pointer events, so the canvas answers where it is open.
  // It runs from reveal() only while open: within 100 ms of a move, else every 250 ms, 5 hit tests a label.
  function checkChrome(): void {
    chromeCheckedAt = performance.now();
    chromeStale = false;
    if (opened <= 0 && fade.to === 0) return;
    const r = canvas.getBoundingClientRect();
    avoidBoxes = (options.avoid?.() ?? []).flatMap((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 ? [{ left: b.left - r.left, right: b.right - r.left, top: b.top - r.top, bottom: b.bottom - r.top }] : [];
    });
    for (const tag of floorTags) {
      const box = tag.rect;
      // Sampled 4 px outside the label, so it never sits flush against a panel edge.
      const m = 4;
      tag.free = box !== null && [[box.left - m, box.top - m], [box.right + m, box.top - m], [box.left - m, box.bottom + m],
        [box.right + m, box.bottom + m], [(box.left + box.right) / 2, (box.top + box.bottom) / 2]]
        .every(([x, y]) => document.elementFromPoint(r.left + x!, r.top + y!) === canvas);
    }
  }

  // Everything else that writes on the model this frame, in container pixels: exit names, red X
  // cards, the selected token's caption and the carry hint or refusal under the pointer.
  function textOnModel(): ScreenRect[] {
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 600;
    const toScreen = (p: THREE.Vector3): { x: number; y: number } => {
      const v = p.clone().project(camera);
      return { x: (v.x + 1) * w / 2, y: (1 - v.y) * h / 2 };
    };
    const out = [...exitRects];
    // failSides lines up with the runs that have a red X (fit() places them in that order).
    runs.filter((run) => run.x).forEach((run, i) => {
      if (!run.x!.obj.visible) return;
      const { x, y: y0 } = toScreen(run.x!.at);
      const y = y0 + X_LIFT;
      // The card's own size, read once it is laid out; the estimate stands in until then.
      const el = run.x!.obj.element.querySelector<HTMLElement>('.ep-card');
      if (!run.x!.card && el && el.offsetWidth > 0) run.x!.card = { w: el.offsetWidth, h: el.offsetHeight };
      const wd = run.x!.card?.w ?? run.x!.width;
      const ht = run.x!.card?.h ?? LABEL_HEIGHT + 8;
      const side = failSides[i] ?? 'right';
      const card = side === 'right' ? { left: x + LABEL_GAP, right: x + LABEL_GAP + wd, top: y - ht / 2, bottom: y + ht / 2 }
        : side === 'left' ? { left: x - LABEL_GAP - wd, right: x - LABEL_GAP, top: y - ht / 2, bottom: y + ht / 2 }
          : { left: x - wd / 2, right: x + wd / 2, top: y - 32 - ht, bottom: y - 32 };
      out.push({ left: Math.min(card.left, x - 30), right: Math.max(card.right, x + 30), top: Math.min(card.top, y - 30), bottom: Math.max(card.bottom, y + 30) });
    });
    const run = runs.find((r) => r.id === selected?.id);
    if (run && captionObj?.visible && selected?.caption) {
      const { x, y } = toScreen(run.token.getWorldPosition(new THREE.Vector3()));
      const span = captionObj.element.firstElementChild as HTMLElement;
      if (!captionSize && span.offsetWidth > 0) captionSize = { w: span.offsetWidth, h: span.offsetHeight };
      const half = (captionSize?.w ?? selected.caption.length * 9 + 26) / 2;
      out.push({ left: x - half, right: x + half, top: y + 10, bottom: y + 14 + (captionSize?.h ?? 32) + 4 });
    }
    // The hint and the refusal: measured once per text, placed from the pointer (no layout read a frame).
    const box = container.getBoundingClientRect();
    if (pointer && hint.classList.contains('on')) {
      if (hintSize?.text !== hint.textContent) hintSize = { text: hint.textContent ?? '', w: hint.offsetWidth, h: hint.offsetHeight };
      const x = pointer.x - box.left + 18;
      const y = pointer.y - box.top + 18;
      out.push({ left: x, right: x + hintSize.w, top: y, bottom: y + hintSize.h });
    }
    if (toastAt && performance.now() < toastAt.until) {
      if (toastAt.w === 0) Object.assign(toastAt, { w: toast.offsetWidth, h: toast.offsetHeight });
      const { x, y, w: tw, h: th } = toastAt;
      out.push({ left: x - tw / 2, right: x + tw / 2, top: y - 1.4 * th, bottom: y - 0.4 * th });
    }
    if (avoidBoxes.length) out.push(...avoidBoxes);
    return out;
  }

  // The facade's open amount this frame: tell the app, and show the floor labels that fit.
  function reveal(now: number): void {
    opened = fadeAt(fade, now);
    const cutNow = opened > 0 ? cut : Infinity;
    if (opened !== told.amount || cutNow !== told.cut) {
      told = { amount: opened, cut: cutNow };
      options.onReveal?.(opened, cutNow);
      cutMembers();
    }
    if (opened <= 0) {
      for (const tag of floorTags) tag.obj.visible = false;
      return;
    }
    if (now - chromeCheckedAt > (chromeStale ? 100 : 250)) checkChrome();
    const keep = keepFloorTags(floorTags.map((t) => ({ rect: t.rect ?? { left: 0, right: 0, top: 0, bottom: 0 }, free: t.rect !== null && t.free })), textOnModel());
    const opacity = String(opened);
    floorTags.forEach((tag, i) => {
      tag.obj.visible = keep[i]!;
      if (keep[i] && tag.obj.element.style.opacity !== opacity) tag.obj.element.style.opacity = opacity;
    });
  }

  function setZoom(z: number): void {
    zoom = z;
    fade = retarget(fade, floorLevels.size > 0 && revealed(zoom) ? 1 : 0, performance.now(), reduced);
    options.onZoom?.(zoom);
    fit();
    // A token carried while the wheel turns: what it would land on may have been cut away.
    if (carried?.moving && pointer) {
      const at = pointer;
      carried.target = { node: '', level: '' }; // no real node: carryTo redraws the floor mark
      carryTo(at.x, at.y);
    }
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
    // Walk (or roll) while on the way; idle when parked, arrived or stopped.
    run.figure.setMotion(local >= 0 && run.reachedAt === null && run.total > 1e-6 ? 'moving' : 'idle');
    const since = run.reachedAt === null ? Infinity : (local - run.reachedAt) * 1000;
    if (run.fail && since < MOTION.failShakeMs && !reduced) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      run.token.position.addScaledVector(right, Math.sin((since / MOTION.failShakeMs) * Math.PI * 4) * SHAKE_METRES);
    }
  }

  // Figures keep their real size close up and grow to stay readable further out.
  function scaleFigures(): void {
    const mpp = (camera.top - camera.bottom) / (canvas.clientHeight || 600);
    for (const run of runs) run.figure.object.scale.setScalar(figureScale(mpp, run.figure.size, run.figure.minPixels));
    if (carried) carried.figure.object.scale.setScalar(figureScale(mpp, carried.figure.size, carried.figure.minPixels));
  }

  let lastFrame = 0;
  function frame(now: number): void {
    const t = reduced ? allDone + 60 : (now - t0) / 1000;
    const dt = reduced || !lastFrame ? 0 : Math.min(0.1, (now - lastFrame) / 1000); // clips hold still on reduced motion
    lastFrame = now;
    for (const run of runs) update(run, t - run.delay);
    if (haze && smokeSpread) for (const b of haze.blocks) {
      // On when its step has come and its floor is not one the open facade hides.
      b.mesh.visible = tintVisible(b.step, smokeSpread.secondsPerStep, t, reduced, smokeSpread.delaySeconds) && tintOnShownFloor(b.floor, opened > 0, pickCeiling);
    }
    for (const run of runs) run.figure.tick(dt);
    carried?.figure.tick(dt);
    scaleFigures();
    if (beating.length > 0) {
      // A member without support blinks as often as the red X (MOTION.failBlinkHz, failBlinkCount) once the run ends, then stays red.
      const since = t - allDone;
      const blinking = !reduced && since >= 0 && since < MOTION.failBlinkCount / MOTION.failBlinkHz;
      const pale = blinking && Math.floor(since * MOTION.failBlinkHz * 2) % 2 === 1;
      for (const mat of beating) mat.color.set(pale ? FAIL_TINT : FAIL);
    }
    if (win && t >= allDone) {
      const since = t - allDone;
      banner.classList.add('on');
      banner.classList.toggle('small', reduced || since >= MOTION.bannerHoldSeconds);
    }
    reveal(now);
    renderer.clear();
    if (backdropObject) {
      renderer.render(backdrop, camera);
      renderer.clearDepth();
    }
    renderer.render(fx, camera);
    if (carried) {
      renderer.clearDepth();
      renderer.render(carry, camera);
    }
    labels.render(rooms, camera);
    labels.render(fx, camera);
    labels.render(marks, camera);
    hideCoveredRooms();
  }

  // A room label under the selection caption hides while the caption is there (labels.ts coveredBy).
  function hideCoveredRooms(): void {
    const box = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom };
    };
    // The caption anchor (.ep-tag) is zero-size; its span is the box people see.
    const face = captionObj?.visible && captionObj.element.isConnected ? captionObj.element.firstElementChild : null;
    const shown = face ? box(face) : null;
    const tags = roomTags.filter((tag) => tag.obj.visible);
    const hidden = coveredBy(shown, tags.map((tag) => box(tag.obj.element)));
    tags.forEach((tag, i) => (tag.obj.element.style.visibility = hidden[i] ? 'hidden' : ''));
  }

  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(zoomFactor(zoom, e.deltaY));
  }, { passive: false });

  // ---------- Selection ----------

  let captionObj: CSS2DObject | null = null;
  let captionSize: { w: number; h: number } | null = null; // measured once it is laid out
  function markSelected(): void {
    captionSize = null;
    captionObj?.element.remove();
    captionObj?.removeFromParent();
    captionObj = null;
    for (const run of runs) run.figure.ring.color.set(run.id === selected?.id ? ACCENT : run.figure.color);
    const run = runs.find((r) => r.id === selected?.id);
    if (!run || !selected?.caption) return;
    const el = document.createElement('div');
    el.className = 'ep-tag';
    el.append(document.createElement('span'));
    el.firstElementChild!.textContent = selected.caption;
    captionObj = new CSS2DObject(el);
    run.token.add(captionObj);
  }

  // ---------- Carrying a token (drag and drop) ----------

  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  interface Carried {
    id: Id;
    pointerId: number;
    x0: number;
    y0: number;
    moving: boolean; // past the click slop: a drag, not a click
    figure: Figure;
    target: DropTarget | null;
  }
  let carried: Carried | null = null;

  function rayAt(clientX: number, clientY: number): Ray {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const { origin, direction } = raycaster.ray;
    return { origin: [origin.x, origin.y, origin.z], dir: [direction.x, direction.y, direction.z] };
  }

  const overModel = (x: number, y: number): boolean => {
    const el = document.elementFromPoint(x, y);
    return el !== null && container.contains(el);
  };

  // Screen spots of the drawn figures, at their middles, in container pixels. A figure drawn larger
  // than the hit circle (zoomed in) can be picked anywhere within half its drawn size.
  function tokenAt(clientX: number, clientY: number): Id | null {
    const r = canvas.getBoundingClientRect();
    const mpp = (camera.top - camera.bottom) / (canvas.clientHeight || 600);
    const spots = runs.filter((run) => run.token.visible).map((run) => {
      const scale = run.figure.object.scale.y;
      const mid = run.token.position.clone();
      mid.y += (run.figure.height * scale) / 2;
      const v = mid.project(camera);
      return { id: run.id, x: ((v.x + 1) * r.width) / 2, y: ((1 - v.y) * r.height) / 2, r: (run.figure.size * scale) / mpp / 2 };
    });
    return pickToken(spots, clientX - r.left, clientY - r.top, HIT_PIXELS);
  }

  function carryTo(clientX: number, clientY: number): void {
    const c = carried;
    if (!c || !shown) return;
    const b = shown.building;
    const over = overModel(clientX, clientY);
    const mpp = (camera.top - camera.bottom) / (canvas.clientHeight || 600);
    // The load starts on a beam, not in a room: it is never dropped on a floor (stayText says why).
    const stay = isMemberStart(b, c.id) ? stayText(b, c.id) : null;
    // While the facade is open the floors above the cut are not drawn, so a drop cannot land on them.
    const cutting = fade.to > 0 || opened > 0; // the floors above the cut are hidden, or about to be
    const target = over && stay === null ? dropTarget(cutting ? belowCut(b, pickCeiling) : b, rayAt(clientX, clientY), SNAP_PIXELS * mpp) : null;
    const r = container.getBoundingClientRect();
    pointer = { x: clientX, y: clientY };
    hint.style.transform = `translate(${clientX - r.left + 18}px, ${clientY - r.top + 18}px)`;
    hint.classList.add('on');
    // Red only over the model where nothing takes the token; over the dock a release just cancels.
    hint.classList.toggle('no', over && target === null);
    const node = target ? b.nodes.find((n) => n.id === target.node) : undefined;
    const what = tokenName(c.id);
    hint.textContent = node ? `${what}: drop in ${node.name}` : stay ?? (over ? `${what}: not a floor, drop it on the tower` : `${what}: drop it on a floor of the tower`);
    if (target?.node === c.target?.node) return;
    c.target = target;
    // Free the old floor mark; the carried figure is kept and moved.
    for (const o of carry.children.filter((x) => x instanceof THREE.Mesh || x instanceof THREE.LineSegments)) {
      o.removeFromParent();
      (o as THREE.Mesh).geometry.dispose();
      ((o as THREE.Mesh).material as THREE.Material).dispose();
    }
    c.figure.object.removeFromParent();
    if (!node) return;
    const floor = b.levels.find((l) => l.id === node.level)?.elevation ?? 0;
    const color = DISCIPLINE_STYLE[b.tokens.find((t) => t.id === c.id)?.discipline ?? 'accessibility'].color;
    const plane = new THREE.PlaneGeometry(node.box.width, node.box.depth).rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthTest: false }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plane), new THREE.LineBasicMaterial({ color, depthTest: false }));
    for (const o of [fill, edge]) o.position.set(node.box.x + node.box.width / 2, floor + 0.05, node.box.y + node.box.depth / 2);
    c.figure.object.position.set(node.box.x + node.box.width / 2, floor + PATH_LIFT, node.box.y + node.box.depth / 2);
    carry.add(fill, edge, c.figure.object);
  }

  function pickUp(id: Id, e: PointerEvent, moving: boolean): void {
    const token = shown?.building.tokens.find((t) => t.id === id);
    if (!token) return;
    endCarry();
    carried = { id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moving, figure: makeFigure(id, token.discipline), target: null };
    if (moving) beginMoving(e);
  }

  function beginMoving(e: PointerEvent): void {
    if (!carried) return;
    carried.moving = true;
    for (const run of runs) if (run.id === carried.id) run.token.visible = false;
    if (captionObj) captionObj.visible = false;
    document.body.classList.add('ep-carrying');
    carryTo(e.clientX, e.clientY);
  }

  function endCarry(): void {
    if (!carried) return;
    for (const run of runs) run.token.visible = true;
    if (captionObj) captionObj.visible = true;
    carried.figure.dispose();
    carry.add(carried.figure.object); // so clear() frees it even when it was never shown
    clear(carry, shared);
    carry.add(...figureLights());
    hint.classList.remove('on', 'no');
    document.body.classList.remove('ep-carrying');
    carried = null;
  }

  let toastTimer = 0;
  function refuse(clientX: number, clientY: number, id: Id): void {
    const r = container.getBoundingClientRect();
    toast.textContent = (shown ? stayText(shown.building, id) : null) ?? REFUSED;
    toast.style.transform = `translate(${clientX - r.left}px, ${clientY - r.top}px) translate(-50%, -140%)`;
    toastAt = { x: clientX - r.left, y: clientY - r.top, until: performance.now() + 2200 + 400, w: 0, h: 0 }; // shown, then a 0.4 s fade
    toast.classList.remove('on');
    void toast.offsetWidth;
    toast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('on'), 2200);
  }

  window.addEventListener('pointermove', (e) => {
    if (!carried || e.pointerId !== carried.pointerId) return;
    if (!carried.moving) {
      if (movedPastSlop(e.clientX - carried.x0, e.clientY - carried.y0)) beginMoving(e);
      return;
    }
    carryTo(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', (e) => {
    if (!carried || e.pointerId !== carried.pointerId) return;
    const { id, moving } = carried;
    const target = moving ? carried.target : null;
    const over = overModel(e.clientX, e.clientY);
    endCarry();
    if (!moving) options.onSelect?.(id);
    else if (target) options.onDrop?.(id, target.node);
    else if (over) {
      refuse(e.clientX, e.clientY, id);
      options.onRefuse?.(id);
    }
    // Let go over the dock or the other panels: the token stays where it was, nothing to say.
  });
  window.addEventListener('pointercancel', (e) => {
    if (carried && e.pointerId === carried.pointerId) endCarry();
  });

  // ---------- Camera: left-drag orbits, right-drag (or shift-drag) pans, double-click resets ----------

  // `token`: the token under a press that cannot pick it up (a run is playing); a click still selects it.
  let drag: { x: number; y: number; x0: number; y0: number; mode: 'rotate' | 'pan'; token: Id | null } | null = null;
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    const onToken = e.button === 0 ? tokenAt(e.clientX, e.clientY) : null;
    const intent = pressIntent({ button: e.button, shiftKey: e.shiftKey, onToken, canDrag: dragEnabled });
    canvas.setPointerCapture(e.pointerId);
    if (intent === 'token' && onToken) {
      pickUp(onToken, e, false);
      return;
    }
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mode: intent === 'pan' ? 'pan' : 'rotate', token: onToken };
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (carried) return;
    if (!drag) {
      canvas.style.cursor = dragEnabled && tokenAt(e.clientX, e.clientY) ? 'move' : 'grab';
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.mode === 'rotate') {
      view = orbit(view, dx, dy);
    } else {
      const viewBounds = { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom };
      const d = dragToPan(viewBounds, canvas.clientWidth || 800, canvas.clientHeight || 600, dx, dy);
      pan.x += d.x;
      pan.y += d.y;
    }
    drag = { ...drag, x: e.clientX, y: e.clientY };
    fit();
  });
  const endDrag = (e: PointerEvent): void => {
    // A press that did not move is a click: it selects the token under it, or clears the selection.
    if (drag && e.type === 'pointerup' && e.button === 0 && !movedPastSlop(e.clientX - drag.x0, e.clientY - drag.y0)) options.onSelect?.(drag.token);
    drag = null;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => {
    pan.x = 0;
    pan.y = 0;
    view = { ...DEFAULT_VIEW };
    setZoom(1);
  });
  new ResizeObserver(fit).observe(container);
  renderer.setAnimationLoop(frame);

  // The figure models load once, in the background. Until then (or if a file fails) each figure
  // uses its stand-in shapes; when they arrive, the stand-ins on screen are swapped in place, so a
  // run in progress carries on.
  function swapIn(old: Figure, id: Id, discipline: Discipline): Figure {
    if (old.source !== 'fallback') return old;
    const next = makeFigure(id, discipline);
    if (next.source === 'fallback') {
      next.dispose();
      return old;
    }
    next.object.position.copy(old.object.position);
    old.object.parent?.add(next.object);
    old.object.removeFromParent();
    old.dispose();
    return next;
  }
  void loadFigureModels().then(() => {
    for (const run of runs) run.figure = swapIn(run.figure, run.id, run.discipline);
    const c = carried;
    const discipline = c && shown?.building.tokens.find((t) => t.id === c.id)?.discipline;
    if (c && discipline) c.figure = swapIn(c.figure, c.id, discipline);
    markSelected();
  });

  function show(building: Building, results: SolverResult[]): void {
    shown = { building, results };
    drawBuilding(building);
    buildRuns(building, results);
    drawSmoke();
    win = results.length > 0 && results.every((r) => r.status === 'pass');
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

  function setFloors(levels: Iterable<Id>): void {
    floorLevels = new Set(levels);
    if (shown) drawFloorTags(shown.building);
    setZoom(zoom);
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

  function startDrag(token: Id, event: PointerEvent): void {
    if (dragEnabled) pickUp(token, event, true);
  }

  function setDragEnabled(on: boolean): void {
    dragEnabled = on;
    if (!on) endCarry();
  }

  function select(token: Id | null, caption: string | null): void {
    if (selected?.id === token && selected?.caption === caption) return;
    selected = token === null ? null : { id: token, caption };
    markSelected();
  }

  function flash(target: Id): void {
    const at = shown ? flashPoint(shown.building, target) : null;
    if (!at) return;
    const el = document.createElement('div');
    el.className = 'ep-flash';
    const ring = new CSS2DObject(el);
    ring.position.set(...at);
    marks.add(ring);
    window.setTimeout(() => {
      el.remove();
      ring.removeFromParent();
    }, MOTION.showMs);
  }

  return { show, setBackdrop, setFloors, setInsetRight, setCovered, startDrag, setDragEnabled, select, flash, setSmoke };
}

// Empty a scene, freeing GPU memory for everything that is not shared, and removing label elements
// (three only removes a label's element when the label itself, not its parent, is removed).
// The figure models' shared data is never freed (disposeTree), and skinned figures free their bones.
function clear(scene: THREE.Scene, shared: Set<object>): void {
  scene.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
  });
  disposeTree(scene, shared);
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
.ep-fail, .ep-tag { width: 0; height: 0; }
.ep-floor { width: 0; height: 0; }
/* Floor names while the facade is open: a calm pill left of the plate corner, under every other text. */
.ep-floor { z-index: 0 !important; }
.ep-floor span { position: absolute; right: ${FLOOR_TAG_GAP}px; transform: translateY(-50%); white-space: nowrap;
  font: 600 13px/1 ${FONT_BODY}; color: ${TEXT}; background: ${GLASS_STRONG}; border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 999px; padding: 5px 10px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1); }
/* Exit names: quiet caps at street level, always under tokens and fail cards. */
.ep-room { z-index: 0 !important; transform-origin: center; white-space: nowrap; font: 600 11px/1 ${FONT_BODY};
  letter-spacing: 1.2px; text-transform: uppercase; color: ${TEXT_MUTED}; text-shadow: 0 0 3px #ffffff, 0 0 6px #ffffff;
  transition: opacity 0.3s; }
/* CSS2DRenderer stacks labels by distance; a red X and its label must never hide behind a token. */
.ep-fail { z-index: 100000 !important; }
/* The selected token's line sits under its figure: fail labels never go below a token. */
.ep-tag { z-index: 99999 !important; }
.ep-tag span { position: absolute; transform: translate(-50%, 14px); white-space: nowrap; font: 700 14px/1 ${FONT_BODY};
  color: ${TEXT}; background: ${GLASS_STRONG}; border: 2px solid ${ACCENT}; border-radius: 999px; padding: 7px 11px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.14); }
.ep-hint, .ep-toast { position: absolute; left: 0; top: 0; pointer-events: none; white-space: nowrap; z-index: 100002;
  font: 700 14px/1 ${FONT_BODY}; color: ${TEXT}; background: ${GLASS_STRONG}; border: 2px solid ${ACCENT};
  border-radius: 999px; padding: 8px 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14); opacity: 0; }
.ep-hint.on { opacity: 1; }
.ep-hint.no, .ep-toast { border-color: ${FAIL}; color: ${FAIL_INK}; }
.ep-toast { transition: opacity 0.4s; }
.ep-toast.on { opacity: 1; animation: ep-nudge 0.3s ease-out; }
body.ep-carrying, body.ep-carrying * { cursor: grabbing !important; user-select: none; }
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
.ep-callout { margin-top: 6px; width: max-content; font: 700 20px/1 ${FONT_DATA}; color: ${FAIL_INK}; background: ${FAIL_TINT};
  border-radius: 8px; padding: 5px 9px; }
.ep-flash { width: 0; height: 0; z-index: 100000 !important; }
.ep-flash::before { content: ''; position: absolute; left: -32px; top: -32px; width: 64px; height: 64px; box-sizing: border-box;
  border-radius: 50%; border: 5px solid ${ACCENT}; animation: ep-ring ${MOTION.showMs}ms ease-out forwards; }
.ep-card b { display: block; font: 700 14px/1.3 ${FONT_BODY}; letter-spacing: 1px; color: ${FAIL_INK}; white-space: pre; }
.ep-card span { display: block; margin-top: 4px; font: 600 15px/1.3 ${FONT_BODY}; color: ${TEXT}; }
.ep-banner { position: absolute; left: 0; right: 0; top: 50%; text-align: center; pointer-events: none; z-index: 100001;
  font: 700 clamp(24px, 4vw, 48px) ${FONT_BODY}; color: ${PASS_INK};
  opacity: 0; transform: translateY(-50%) scale(0.6); transition: opacity 0.3s, transform 0.3s, top 0.4s, font-size 0.4s; }
.ep-banner.on { opacity: 1; transform: translateY(-50%) scale(1); }
.ep-banner.on.small { top: 32px; font-size: 20px; }
@keyframes ep-pop { from { transform: scale(0); } 60% { transform: scale(1.35); } to { transform: scale(1); } }
@keyframes ep-blink { 50% { opacity: 0; } }
@keyframes ep-fade { from { opacity: 0; } }
@keyframes ep-ring { from { transform: scale(0.3); opacity: 1; } to { transform: scale(1.7); opacity: 0; } }
@keyframes ep-nudge { 0%, 100% { margin-left: 0; } 25% { margin-left: -8px; } 75% { margin-left: 8px; } }
@media (prefers-reduced-motion: reduce) { .ep-x, .ep-card, .ep-toast.on { animation: none; } .ep-flash::before { animation: none; opacity: 0.8; } .ep-banner, .ep-toast { transition: none; } }
`;
  document.head.appendChild(style);
}
