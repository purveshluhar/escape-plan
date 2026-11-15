// Pure math for moving tokens by hand: where a drop lands in the building graph, which press
// drags a token and which orbits the camera, and how big a figure is drawn. No three.js here, so
// Node tests can check it. Owner: P2.
import type { Box, Building, BuildingNode, Id, NodeType } from '../contract/types.ts';
import { STOREY_HEIGHT, type Vec3 } from './layout.ts';

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

// The building as the player sees it is one block: the plan extent of every node a token can take,
// from the lowest floor to one storey over the highest. A drop picks the level where the pointer's
// ray enters that block (the storey on the facade under the pointer), then the room on that level
// nearest to where the ray meets its floor. Null when the ray misses the block, or when that level
// has no room a token can take: the drop is refused.
export function dropTarget(b: Building, ray: Ray): DropTarget | null {
  const rooms = droppableNodes(b);
  const levels = levelsByHeight(b);
  if (rooms.length === 0 || levels.length === 0) return null;
  const min: Vec3 = [
    Math.min(...rooms.map((n) => n.box.x)), levels[0]!.elevation, Math.min(...rooms.map((n) => n.box.y)),
  ];
  const max: Vec3 = [
    Math.max(...rooms.map((n) => n.box.x + n.box.width)), levels[levels.length - 1]!.elevation + STOREY_HEIGHT,
    Math.max(...rooms.map((n) => n.box.y + n.box.depth)),
  ];
  const t = enter(ray, min, max);
  if (t === null) return null;
  const y = ray.origin[1] + ray.dir[1] * t;
  const level = levels.filter((l) => l.elevation <= y + 1e-9).pop() ?? levels[0]!;
  const here = rooms.filter((n) => n.level === level.id);
  if (here.length === 0) return null;
  // Where the ray meets this level's floor; a level ray never does, so its entry point stands in.
  const tf = Math.abs(ray.dir[1]) < 1e-12 ? t : Math.max(t, (level.elevation - ray.origin[1]) / ray.dir[1]);
  const x = ray.origin[0] + ray.dir[0] * tf;
  const z = ray.origin[2] + ray.dir[2] * tf;
  return { node: nearest(here, x, z).id, level: level.id };
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
export const CLICK_SLOP = 5;
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
