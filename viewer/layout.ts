// Pure layout math: building nodes to 3D boxes, solver paths to 3D routes. No three.js here,
// so it is easy to test.
import type { Box, Building, Id, SolverResult } from '../contract/types.ts';

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
  margin: number; // 1 = touching the edges
}

// Orthographic camera bounds that fit the model into the canvas left of `insetRight`, with the
// model's centre (camera x = 0) in the middle of that free space.
export function frustum({ hx, hy, width, height, insetRight, margin }: FrustumInput):
  { left: number; right: number; top: number; bottom: number } {
  const free = Math.max(width - insetRight, 1);
  const half = Math.max(hy, hx / (free / height)) * margin;
  const left = (-free * half) / height;
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

export const easeInOut =(t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
