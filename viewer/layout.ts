// Pure layout math: building nodes to 3D boxes, solver paths to 3D routes. No three.js here,
// so it is easy to test.
import type { Box, Building, Id, Level, SolverResult } from '../contract/types.ts';
import { EASE_GLASS, MOTION } from '../design/tokens.ts';

export const STOREY_HEIGHT = 3.5; // metres drawn per level box
export const PATH_LIFT = 0.5; // metres above the floor where token routes run
// Each token runs in its own height lane, so routes that share a door do not draw on top of each other.
export const LANE_GAP = 0.3;
export const FOUNDATION_DEPTH = 1; // metres below its level where a foundation is drawn

export type Vec3 = [number, number, number]; // three.js axes: x = plan x, y = up, z = plan y

export interface BoxSpec {
  id: string;
  center: Vec3;
  size: Vec3;
}

export function nodeBoxes(b: Building): BoxSpec[] {
  const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
  return b.nodes.map((n) => {
    const { x, y, width, depth } = n.box;
    const floor = elevation.get(n.level) ?? 0;
    return {
      id: n.id,
      center: [x + width / 2, floor + STOREY_HEIGHT / 2, y + depth / 2],
      size: [width, STOREY_HEIGHT, depth],
    };
  });
}

// Boxes minus the nodes something else already draws (a real floor plan stands in for them).
export function uncovered(boxes: BoxSpec[], covered: ReadonlySet<Id>): BoxSpec[] {
  return boxes.filter((b) => !covered.has(b.id));
}

// What the viewer draws for the building graph itself. The graph's rooms are self-made, so none is
// drawn as a box (the real 432 Park plans and facade in the backdrop are the building on screen).
// The uncovered boxes still give the frame the camera fits, and each exit gets a
// label at its floor, so players see where the tokens are going. `frame` is null when every node is covered.
export interface GraphMarks {
  frame: { min: Vec3; max: Vec3 } | null;
  labels: { id: Id; at: Vec3 }[];
}

export function graphMarks(b: Building, covered: ReadonlySet<Id>): GraphMarks {
  const boxes = uncovered(nodeBoxes(b), covered);
  const exits = new Set(b.nodes.filter((n) => n.is_exit).map((n) => n.id));
  const lo = (box: BoxSpec, i: number): number => box.center[i]! - box.size[i]! / 2;
  const hi = (box: BoxSpec, i: number): number => box.center[i]! + box.size[i]! / 2;
  const axis = [0, 1, 2] as const;
  const frame = boxes.length === 0 ? null : {
    min: axis.map((i) => Math.min(...boxes.map((box) => lo(box, i)))) as Vec3,
    max: axis.map((i) => Math.max(...boxes.map((box) => hi(box, i)))) as Vec3,
  };
  const labels = boxes.filter((box) => exits.has(box.id))
    .map((box) => ({ id: box.id, at: [box.center[0], lo(box, 1), box.center[2]] as Vec3 }));
  return { frame, labels };
}

// Where two plan boxes meet: per axis, the middle of their overlap, or of the gap between them.
// For boxes that share a wall this is the middle of that wall, which is where the door is drawn.
export function doorPoint(a: Box, b: Box): [number, number] {
  const mid = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
    (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2;
  return [mid(a.x, a.x + a.width, b.x, b.x + b.width), mid(a.y, a.y + a.depth, b.y, b.y + b.depth)];
}

export interface TokenRoute {
  points: Vec3[]; // the whole drawn route; for a fail, one step past the red X
  stopAt: number; // distance along `points` where the token stops (the red X on a fail)
  blocked: Vec3 | null; // where the red X goes; null on pass or when the solver gave no place
}

interface Stop {
  box: Box;
  height: number;
}

const centre = (s: Stop): Vec3 => [s.box.x + s.box.width / 2, s.height, s.box.y + s.box.depth / 2];

export function tokenRoute(b: Building, result: SolverResult, lane = 0): TokenRoute {
  const token = b.tokens.find((t) => t.id === result.token);
  const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
  const nodes = new Map(b.nodes.map((n) => [n.id, n]));
  const members = new Map(b.members.map((m) => [m.id, m]));
  const lift = PATH_LIFT + lane * LANE_GAP;

  const nodeStop = (id: Id | undefined): Stop | null => {
    const n = id === undefined ? undefined : nodes.get(id);
    return n ? { box: n.box, height: (elevation.get(n.level) ?? 0) + lift } : null;
  };
  // A member is drawn at its node's plan centre, at its own level; a foundation sits below it.
  const memberStop = (id: Id | undefined): Stop | null => {
    const m = id === undefined ? undefined : members.get(id);
    const n = m?.node === undefined ? undefined : nodes.get(m.node);
    if (!m || !n) return null;
    const depth = m.kind === 'foundation' ? FOUNDATION_DEPTH : 0;
    return { box: n.box, height: (elevation.get(m.level) ?? 0) - depth };
  };

  const byMember = token?.rule === 'downward';
  const stopOf = byMember ? memberStop : nodeStop;
  const ids = result.path.length > 0 ? result.path : token ? [token.start] : [];
  const stops = ids.map(stopOf).filter((s): s is Stop => s !== null);

  const points: Vec3[] = [];
  const push = (p: Vec3): void => {
    const last = points[points.length - 1];
    if (!last || last.some((v, i) => Math.abs(v - p[i]!) > 1e-9)) points.push(p);
  };
  // Rooms are joined through the door between them; a change of level drops straight down there.
  // Members are joined across first, then down, so the load reads as falling to its support.
  const walk = (from: Stop, to: Stop): void => {
    if (byMember) {
      const [x, , z] = centre(to);
      push([x, from.height, z]);
    } else {
      const [x, z] = doorPoint(from.box, to.box);
      push([x, from.height, z]);
      push([x, to.height, z]);
    }
    push(centre(to));
  };

  if (stops[0]) push(centre(stops[0]));
  for (let i = 1; i < stops.length; i++) walk(stops[i - 1]!, stops[i]!);

  let blocked: Vec3 | null = null;
  const last = stops[stops.length - 1];
  const edge = b.edges.find((e) => e.id === result.blocked_at);
  if (result.status === 'fail' && last && edge) {
    // Stop at the door of the blocked edge, then show one dim step through it.
    const lastId = ids[ids.length - 1];
    const far = nodeStop(edge.from === lastId ? edge.to : edge.from);
    const [x, z] = doorPoint(last.box, far?.box ?? last.box);
    blocked = [x, last.height, z];
    push(blocked);
    const stopAt = routeLength(points);
    if (far) walk({ box: last.box, height: last.height }, far);
    return { points, stopAt, blocked };
  }
  if (result.status === 'fail' && result.blocked_at !== null) {
    const at = stopOf(result.blocked_at);
    if (at) {
      blocked = centre(at);
      push(blocked);
    }
  }
  return { points, stopAt: routeLength(points), blocked };
}

export function cumulativeLengths(points: Vec3[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const p = points[i]!;
    out.push(out[i - 1]! + Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]));
  }
  return out;
}

export function routeLength(points: Vec3[]): number {
  return cumulativeLengths(points)[points.length - 1] ?? 0;
}

// The point `d` metres along the route, clamped to its ends.
export function pointAt(points: Vec3[], cum: number[], d: number): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  for (let i = 1; i < points.length; i++) {
    if (d <= cum[i]! || i === points.length - 1) {
      const a = points[i - 1]!;
      const p = points[i]!;
      const seg = cum[i]! - cum[i - 1]! || 1;
      const t = Math.min(1, Math.max(0, (d - cum[i - 1]!) / seg));
      return [a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t, a[2] + (p[2] - a[2]) * t];
    }
  }
  return points[0]!;
}

export interface FrustumInput {
  hx: number; // how far the model reaches left and right of its centre, in camera metres
  hy: number; // and up and down
  width: number; // canvas, pixels
  height: number;
  insetRight: number; // pixels on the right covered by a panel
  insetLeft?: number; // pixels on the left covered by a panel (default 0)
  margin: number; // 1 = touching the edges
}

// Orthographic camera bounds that fit the model into the canvas between `insetLeft` and
// `insetRight`, with the model's centre (camera x = 0) in the middle of that free space.
export function frustum({ hx, hy, width, height, insetRight, insetLeft = 0, margin }: FrustumInput):
  { left: number; right: number; top: number; bottom: number } {
  const free = Math.max(width - insetRight - insetLeft, 1);
  const half = Math.max(hy, hx / (free / height)) * margin;
  const left = (-(2 * insetLeft + free) * half) / height;
  return { left, right: left + (2 * half * width) / height, top: half, bottom: -half };
}

// The orthographic camera sits this far from the model centre, looking down the (1,1,1) diagonal.
// Depth is linear, so a long range costs no precision. The camera must be further back than the
// tallest thing it should show: the 425 m tower rises 245 m closer to it, and the backdrop reaches
// about 350 m either side, so anything nearer than the camera would be cut by the near plane.
export const CAMERA = { distance: 1500, near: 1, far: 3200 };

// Mouse-wheel zoom as a view-size multiplier: 1 = framed on the model, below 1 = closer, above 1 =
// further out to see the city. Scrolling down (positive deltaY) zooms out.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 60;
export function zoomFactor(current: number, deltaY: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * Math.exp(deltaY * 0.001)));
}

export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// The view moved by `pan` metres in the camera's own plane (x right, y up).
export function panned(f: ViewBounds, pan: { x: number; y: number }): ViewBounds {
  return { left: f.left + pan.x, right: f.right + pan.x, top: f.top + pan.y, bottom: f.bottom + pan.y };
}

// Metres to pan for a pointer drag of dx, dy pixels: the picture follows the pointer, so the camera
// moves the other way horizontally and the same way vertically (screen y runs down).
export function dragToPan(f: ViewBounds, widthPx: number, heightPx: number, dx: number, dy: number): { x: number; y: number } {
  return { x: 0 - (dx * (f.right - f.left)) / widthPx, y: (dy * (f.top - f.bottom)) / heightPx };
}

// Orbit: the camera circles the model at a fixed distance. Azimuth turns it around the vertical axis
// (0 looks from +z, a quarter turn from +x); elevation is the angle above the ground. The default is
// the isometric look down the (1,1,1) diagonal.
export interface OrbitView {
  azimuth: number; // radians
  elevation: number; // radians
}
export const DEFAULT_VIEW: OrbitView = { azimuth: Math.PI / 4, elevation: Math.asin(1 / Math.sqrt(3)) };
export const MIN_ELEVATION = 0.1; // never level with the ground
export const MAX_ELEVATION = 1.5; // never straight down, so the view cannot flip over
export const ORBIT_SPEED = 0.006; // radians per pixel dragged

// The unit vector from the model centre to the camera.
export function viewDirection(azimuth: number, elevation: number): Vec3 {
  const c = Math.cos(elevation);
  return [c * Math.sin(azimuth), Math.sin(elevation), c * Math.cos(azimuth)];
}

// A drag of dx, dy pixels: the picture follows the pointer, so dragging right swings the camera left
// and dragging down lifts it.
export function orbit(view: OrbitView, dx: number, dy: number): OrbitView {
  return {
    azimuth: view.azimuth - dx * ORBIT_SPEED,
    elevation: Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, view.elevation + dy * ORBIT_SPEED)),
  };
}

export const easeInOut =(t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------- Zoomed in: the facade opens to the floor plans ----------

// Closer than this zoom the facade fades out, the city dims and the floors above the level in the
// middle of the view are cut away, each floor in view labelled. Three mouse-wheel notches in from the
// framed view (1, 0.90, 0.82, 0.74) cross it; the framed view and a double-click reset (zoom 1) do not.
export const REVEAL_ZOOM = 0.8;
export const REVEAL_MS = 2 * MOTION.quickMs; // the facade fade, both ways

export const revealed = (zoom: number): boolean => zoom < REVEAL_ZOOM;

// EASE_GLASS (a CSS cubic-bezier) as a function of time 0..1, for motion drawn in three.js.
const [B1X, B1Y, B2X, B2Y] = EASE_GLASS.match(/-?[\d.]+/g)!.map(Number) as [number, number, number, number];
const bez = (p1: number, p2: number, s: number): number => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
export function easeGlass(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(B1X, B2X, mid) < t) lo = mid;
    else hi = mid;
  }
  return bez(B1Y, B2Y, (lo + hi) / 2);
}

// A fade from one amount to another (0 = facade solid, 1 = open), started at `start` milliseconds.
export interface Fade {
  from: number;
  to: number;
  start: number;
}

export function fadeAt(f: Fade, now: number, ms = REVEAL_MS): number {
  return f.from + (f.to - f.from) * easeGlass((now - f.start) / ms);
}

// Head for `to` from wherever the fade is now, so turning round mid-fade never jumps. Reduced
// motion switches at once.
export function retarget(f: Fade, to: number, now: number, reduced: boolean): Fade {
  if (f.to === to) return f;
  return reduced ? { from: to, to, start: now } : { from: fadeAt(f, now), to, start: now };
}

// The height at which the ray through the middle of the view crosses the vertical line through the
// framed centre: the floor seen there. With no pan that ray runs through the centre itself, so an
// orbit never changes it. A sideways pan keeps the crossing height; a pan of y metres up the screen
// raises it by y / cos(elevation) (the camera's up climbs cos per metre, the ray falls back sin).
// Looking steeply down that factor runs away (14 at the steepest), so it is capped at 2 (60 degrees):
// a small pan there never jumps the open floor many levels.
export const FOCUS_GAIN_MAX = 2;
export function focusHeight(centreY: number, view: OrbitView, pan: { x: number; y: number }): number {
  return centreY + pan.y / Math.max(Math.cos(view.elevation), 1 / FOCUS_GAIN_MAX);
}

// The pan (metres up the screen) that puts a level at `height` in the middle of the view: the inverse
// of focusHeight, with the same cap, so the floor the view reads back is the one asked for.
export function panForFocus(height: number, centreY: number, view: OrbitView): number {
  return (height - centreY) * Math.max(Math.cos(view.elevation), 1 / FOCUS_GAIN_MAX);
}

// A glide to a new pan: each frame covers a fixed share of what is left, so a target that moves while
// it runs (a dragged scroller) never restarts a curve. 14 a second covers 97 percent in a quarter second.
export const GLIDE_RATE = 14;
export const GLIDE_SNAP = 0.02; // metres: this near the target it lands on it
export function glideStep(current: number, target: number, dt: number, rate = GLIDE_RATE): number {
  const next = current + (target - current) * (1 - Math.exp(-rate * Math.max(dt, 0)));
  return Math.abs(target - next) < GLIDE_SNAP ? target : next;
}

// The elevation of the level nearest `height`: the top floor left standing. Infinity with no levels.
export function cutLevel(levels: readonly Level[], height: number): number {
  if (!Number.isFinite(height)) return Infinity;
  let best = Infinity;
  for (const l of levels) if (best === Infinity || Math.abs(l.elevation - height) < Math.abs(best - height)) best = l.elevation;
  return best;
}

// Drops go to every level under the next drawn floor above the cut: the floors that are hidden. A
// level with nothing drawn between them (the slice's plant level) stays reachable. Infinity: none hidden.
export function dropCeiling(drawn: readonly Level[], cut: number): number {
  const above = drawn.filter((l) => l.elevation > cut + 1e-6).map((l) => l.elevation);
  return above.length ? Math.min(...above) - 1e-3 : Infinity;
}

// The building as drawn when cut: no level above `cut` and no node on one, so a drop cannot land on
// a floor that is not on screen. Edges are left as they are (drop picking does not read them).
export function belowCut(b: Building, cut: number): Building {
  const levels = b.levels.filter((l) => l.elevation <= cut + 1e-6);
  const kept = new Set(levels.map((l) => l.id));
  return { ...b, levels, nodes: b.nodes.filter((n) => kept.has(n.level)) };
}

// A level's name on screen: its number from the id (L2 and T10 read "Level 2" and "Level 10"),
// or the id itself when it has no number.
export function floorName(levelId: Id): string {
  const n = /^[A-Z]+(\d+)$/.exec(levelId);
  return n ? `Level ${Number(n[1])}` : levelId;
}

// The plan extent of the building's own rooms (not the street, an exit or the truck outside), where
// the floor labels are pinned.
export function planExtent(b: Building): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const rooms = b.nodes.filter((n) => !n.is_exit && n.type !== 'street' && n.type !== 'truck');
  if (rooms.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    minX: Math.min(...rooms.map((n) => n.box.x)), maxX: Math.max(...rooms.map((n) => n.box.x + n.box.width)),
    minZ: Math.min(...rooms.map((n) => n.box.y)), maxZ: Math.max(...rooms.map((n) => n.box.y + n.box.depth)),
  };
}

export interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const FLOOR_TAG_GAP = 12; // pixels between a floor label and the plate corner it names
const FLOOR_TAG_HEIGHT = 26; // pixels: 13 px type, 5 px padding and a 1 px border, each side
const floorTagWidth = (text: string): number => text.length * 8 + 24;

// A floor label's box on screen: left of the plate corner at `anchor`, centred on it vertically,
// `width` wide when measured (an estimate from the text otherwise). When that would run off the left
// edge it slides right to `minLeft`, onto the plate, so a close zoom keeps the label; `shift` says how far.
export function floorTagRect(anchor: { x: number; y: number }, text: string, width = floorTagWidth(text), minLeft = 8):
  ScreenRect & { shift: number } {
  const right = anchor.x - FLOOR_TAG_GAP;
  const shift = Math.max(0, minLeft - (right - width));
  return { left: right - width + shift, right: right + shift, top: anchor.y - FLOOR_TAG_HEIGHT / 2, bottom: anchor.y + FLOOR_TAG_HEIGHT / 2, shift };
}

const clash = (a: ScreenRect, b: ScreenRect, pad = 4): boolean =>
  a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;

// Which floor labels to show, in order of priority: one is dropped when a panel covers it (`free`
// false), or when it would touch other text on screen (`taken`) or a label already kept.
export function keepFloorTags(tags: { rect: ScreenRect; free: boolean }[], taken: ScreenRect[]): boolean[] {
  const kept: ScreenRect[] = [];
  return tags.map(({ rect, free }) => {
    const ok = free && !taken.some((t) => clash(rect, t)) && !kept.some((k) => clash(rect, k));
    if (ok) kept.push(rect);
    return ok;
  });
}
