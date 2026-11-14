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

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
