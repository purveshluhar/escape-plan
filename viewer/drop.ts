// Pure math for moving tokens by hand: where a drop lands in the building graph, which press
// drags a token and which orbits the camera, and how big a figure is drawn. No three.js here, so
// Node tests can check it. Owner: P2.
import type { Box, Building, BuildingNode, Id, NodeType } from '../contract/types.ts';
import { PATH_LIFT, STOREY_HEIGHT, type Vec3 } from './layout.ts';

// Node types a token can start in: places inside the building. Exits, the street, the truck and
// shafts, stairs, elevators and panels are not rooms a token waits in.
const DROP_TYPES: ReadonlySet<NodeType> = new Set(['room', 'corridor', 'plant', 'lobby', 'terrace', 'kitchen']);

export function droppableNodes(b: Building): BuildingNode[] {
  return b.nodes.filter((n) => !n.is_exit && DROP_TYPES.has(n.type));
}

export interface Ray {
  origin: Vec3; // viewer metres: x = plan x, y = up, z = plan y
  dir: Vec3;
}

export interface DropTarget {
  node: Id;
  level: Id;
}

// Plan distance from a point to a box; 0 inside it.
function planDistance(box: Box, x: number, z: number): number {
  const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
  const dz = Math.max(box.y - z, 0, z - (box.y + box.depth));
  return Math.hypot(dx, dz);
}

const levelsByHeight = (b: Building) => [...b.levels].sort((a, z) => a.elevation - z.elevation);

// Where a ray first enters a box (slab method); null when it misses or the box is behind it.
function enter(ray: Ray, min: Vec3, max: Vec3): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (const i of [0, 1, 2] as const) {
    const o = ray.origin[i];
    const d = ray.dir[i];
    if (Math.abs(d) < 1e-12) {
      if (o < min[i] || o > max[i]) return null;
      continue;
    }
    const t1 = (min[i] - o) / d;
    const t2 = (max[i] - o) / d;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  if (near > far || far < 0) return null;
  return Math.max(near, 0);
}

// Metres from a token spot within which a drop lands exactly on that room.
export const SNAP_METRES = 3;

const unit = (v: Vec3): Vec3 => {
  const len = Math.hypot(...v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

// A node's storey: its plan box, from its floor up to the next level.
function storeys(b: Building): Map<Id, { min: Vec3; max: Vec3 }> {
  const levels = levelsByHeight(b);
  const band = new Map(levels.map((l, i) => [l.id, [l.elevation, levels[i + 1]?.elevation ?? l.elevation + STOREY_HEIGHT] as const]));
  const out = new Map<Id, { min: Vec3; max: Vec3 }>();
  for (const n of b.nodes) {
    const y = band.get(n.level);
    if (y) out.set(n.id, { min: [n.box.x, y[0], n.box.y], max: [n.box.x + n.box.width, y[1], n.box.y + n.box.depth] });
  }
  return out;
}

const inside = (p: Vec3, box: { min: Vec3; max: Vec3 }): boolean =>
  [0, 1, 2].every((i) => p[i]! >= box.min[i]! - 1e-9 && p[i]! <= box.max[i]! + 1e-9);

// Where a drop lands. The figures and floor marks are drawn over the facade, so a player aims at
// what is drawn: a drop within `snap` metres of a room's token spot (plan centre, PATH_LIFT over its
// floor), in a storey the ray passes through, lands on that room. Anywhere else on the building, the
// level is the storey where the ray enters it (the floor on the facade under the pointer), and the
// room is the one on that level nearest to where the ray meets its floor. Null, a refused drop, when
// the ray misses the building, enters it through an exit (the street) or meets a level with no room.
// On an orthographic camera a distance to the ray is a distance on screen, so `snap` can come from pixels.
export function dropTarget(b: Building, ray: Ray, snap = SNAP_METRES): DropTarget | null {
  const dir = unit(ray.dir);
  const r: Ray = { origin: ray.origin, dir };
  const rooms = droppableNodes(b);
  const boxes = storeys(b);
  const levelOf = new Map(b.levels.map((l) => [l.id, l.elevation]));

  let best: { n: BuildingNode; miss: number; t: number } | null = null;
  for (const n of rooms) {
    const box = boxes.get(n.id);
    if (!box || enter(r, box.min, box.max) === null) continue;
    const y0 = levelOf.get(n.level)!;
    const rel: Vec3 = [n.box.x + n.box.width / 2 - r.origin[0], y0 + PATH_LIFT - r.origin[1], n.box.y + n.box.depth / 2 - r.origin[2]];
    const t = rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2];
    const miss = Math.hypot(rel[0] - dir[0] * t, rel[1] - dir[1] * t, rel[2] - dir[2] * t);
    if (!best || miss < best.miss - 1e-9 || (Math.abs(miss - best.miss) <= 1e-9 && t < best.t)) best = { n, miss, t };
  }
  if (best && best.miss <= snap) return { node: best.n.id, level: best.n.level };

  // The building as one block: the plan extent of every room, from the lowest floor to the top.
  const levels = levelsByHeight(b);
  if (rooms.length === 0 || levels.length === 0) return null;
  const min: Vec3 = [Math.min(...rooms.map((n) => n.box.x)), levels[0]!.elevation, Math.min(...rooms.map((n) => n.box.y))];
  const max: Vec3 = [
    Math.max(...rooms.map((n) => n.box.x + n.box.width)), levels[levels.length - 1]!.elevation + STOREY_HEIGHT,
    Math.max(...rooms.map((n) => n.box.y + n.box.depth)),
  ];
  const t = enter(r, min, max);
  if (t === null) return null;
  const p: Vec3 = [r.origin[0] + dir[0] * t, r.origin[1] + dir[1] * t, r.origin[2] + dir[2] * t];
  const taken = new Set(rooms.map((n) => n.id));
  if (b.nodes.some((n) => !taken.has(n.id) && n.is_exit && boxes.has(n.id) && inside(p, boxes.get(n.id)!))) return null;
  const level = levels.filter((l) => l.elevation <= p[1] + 1e-9).pop() ?? levels[0]!;
  const here = rooms.filter((n) => n.level === level.id);
  if (here.length === 0) return null;
  // Where the ray meets this level's floor; a level ray never does, so its entry point stands in.
  const tf = Math.abs(dir[1]) < 1e-12 ? t : Math.max(t, (level.elevation - r.origin[1]) / dir[1]);
  return { node: nearest(here, r.origin[0] + dir[0] * tf, r.origin[2] + dir[2] * tf).id, level: level.id };
}

function nearest(nodes: BuildingNode[], x: number, z: number): BuildingNode {
  let best = nodes[0]!;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = planDistance(n.box, x, z);
    if (d < bestD - 1e-9) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

// The keyboard way to move a token: one level up (1) or down (-1), skipping levels with no room,
// to the room nearest the same plan spot. Null at the top or the bottom.
export function stepLevel(b: Building, from: Id, dir: 1 | -1): Id | null {
  const node = b.nodes.find((n) => n.id === from);
  if (!node) return null;
  const levels = levelsByHeight(b);
  const rooms = droppableNodes(b);
  const cx = node.box.x + node.box.width / 2;
  const cz = node.box.y + node.box.depth / 2;
  for (let i = levels.findIndex((l) => l.id === node.level) + dir; i >= 0 && i < levels.length; i += dir) {
    const here = rooms.filter((n) => n.level === levels[i]!.id);
    if (here.length > 0) return nearest(here, cx, cz).id;
  }
  return null;
}

// ---------- Pointer input ----------

export type PressIntent = 'token' | 'rotate' | 'pan';

// A left press that starts on a token drags the token; every other press works the camera as
// before: right or shift drag pans, left drag orbits.
export function pressIntent(p: { button: number; shiftKey: boolean; onToken: Id | null; canDrag: boolean }): PressIntent {
  if (p.button === 2 || p.shiftKey) return 'pan';
  return p.button === 0 && p.onToken !== null && p.canDrag ? 'token' : 'rotate';
}

// Pixels a pointer may move and still count as a click.
export const CLICK_SLOP = 8; // a tap on a touch screen wobbles a few pixels
export const movedPastSlop = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > CLICK_SLOP;

// The token nearest the pointer within `radius` pixels of its screen spot, or null.
export function pickToken(spots: readonly { id: Id; x: number; y: number }[], px: number, py: number, radius: number): Id | null {
  let best: Id | null = null;
  let bestD = radius;
  for (const s of spots) {
    const d = Math.hypot(s.x - px, s.y - py);
    if (d <= bestD) {
      best = s.id;
      bestD = d;
    }
  }
  return best;
}

// ---------- Figure size ----------

// Scale for a figure `height` metres tall: real size when that is at least `minPixels` on screen,
// else just big enough to be `minPixels` tall, so it reads when zoomed out.
export function figureScale(metresPerPixel: number, height: number, minPixels: number): number {
  const pixels = height / metresPerPixel;
  return pixels >= minPixels ? 1 : (minPixels * metresPerPixel) / height;
}
