// One run timeline for every token (design/motion.md 2.1). Pure: no three.js, no DOM. Owner: P2.
// Each token travels its route at a steady pace with a gentle start and stop. A decisive moment
// (a calm stop at a door, a sofa jamming at a corner, the first pivot through a corner) plays one at a
// time: while it plays, every other token holds still. At most MOTION.maxBeats of them per run.
import type { Building, Edge, Id, SolverResult } from '../contract/types.ts';
import { MOTION } from '../design/tokens.ts';
import type { Corner, P2 } from './corner.ts';
import { cumulativeLengths, doorPoint, type TokenRoute } from './layout.ts';

export const TIMING = {
  speed: MOTION.travelSpeed,
  minTravel: MOTION.travelMinSeconds,
  maxTravel: MOTION.travelMaxSeconds,
  ramp: MOTION.rampSeconds,
  stagger: MOTION.staggerSeconds,
  pivotSeconds: MOTION.pivotSeconds,
  jamSeconds: MOTION.jamSeconds,
  stopHoldSeconds: MOTION.stopHoldSeconds,
  maxBeats: MOTION.maxBeats,
  turnTau: MOTION.turnTau,
} as const;

// move: travels and arrives. stop: stops at a door that refuses it. jam: stops at a corner it cannot
// turn, then turns until it binds. pivot: turns a corner on the way, then carries on.
export type ItemKind = 'move' | 'stop' | 'jam' | 'pivot';

export interface CornerAt {
  edge: Id;
  at: number; // metres along the drawn route where the token meets the corner (the door point)
  door: P2; // that point in plan (x, z)
  inDir: P2; // unit plan direction the token comes in by
  outDir: P2; // unit plan direction of the leg after the turn, at right angles to inDir
  corner: Corner;
}

export interface RunItem {
  kind: ItemKind;
  distance: number; // metres the token travels: to its stop on a No, the whole route on a Yes
  corner: CornerAt | null; // set for jam and pivot
}

export function travelSeconds(distance: number): number {
  return Math.min(TIMING.maxTravel, Math.max(TIMING.minTravel, distance / TIMING.speed));
}

// Metres covered after t seconds of a trip of `distance` metres that takes T seconds: speed ramps
// up over the first ramp seconds, holds, and ramps down over the last.
export function distanceAt(distance: number, T: number, t: number): number {
  if (distance <= 0) return 0;
  if (T <= 0 || t >= T) return distance;
  if (t <= 0) return 0;
  const r = Math.min(TIMING.ramp, T / 3);
  const v = distance / (T - r);
  if (t < r) return (0.5 * v * t * t) / r;
  if (t < T - r) return v * (t - r / 2);
  return distance - (0.5 * v * (T - t) * (T - t)) / r;
}

const hasCorner = (e: Edge): boolean => typeof e.corner_a === 'number' && typeof e.corner_b === 'number';
// Stairs and lifts carry corner numbers too, but their door points stack on every floor at the same
// plan spot and the drawn route goes straight up there: corner turns are drawn for level edges only,
// and a stair that refuses a sofa shows as a calm stop.
const vertical = (e: Edge): boolean => e.kind === 'stair' || e.kind === 'elevator';
const unit = (x: number, z: number): P2 | null => {
  const l = Math.hypot(x, z);
  return l < 1e-9 ? null : [x / l, z / l];
};

// The corner at route point j: the way in is the last plan move before it, the way out is at right
// angles to it, on the side the route goes on (left when the route runs straight on).
function cornerAt(route: TokenRoute, j: number, edge: Edge, w: number, length: number): CornerAt | null {
  const pts = route.points;
  const p = pts[j]!;
  let inDir: P2 | null = null;
  for (let i = j - 1; i >= 0 && !inDir; i--) inDir = unit(p[0] - pts[i]![0], p[2] - pts[i]![2]);
  let next: P2 | null = null;
  for (let i = j + 1; i < pts.length && !next; i++) next = unit(pts[i]![0] - p[0], pts[i]![2] - p[2]);
  if (!inDir) inDir = next;
  if (!inDir) return null;
  let outDir: P2 = [-inDir[1], inDir[0]];
  if (next && outDir[0] * next[0] + outDir[1] * next[1] < -1e-6) outDir = [-outDir[0], -outDir[1]];
  return {
    edge: edge.id, at: cumulativeLengths(pts)[j]!, door: [p[0], p[2]], inDir, outDir,
    corner: { a: edge.corner_a!, b: edge.corner_b!, w, length },
  };
}

// What the viewer plays for one token's result on its drawn route.
export function runItem(b: Building, r: SolverResult, route: TokenRoute): RunItem {
  const cum = cumulativeLengths(route.points);
  const total = cum[cum.length - 1] ?? 0;
  const token = b.tokens.find((t) => t.id === r.token);
  if (r.path.length === 0 || total < 1e-6 || !token) return { kind: 'move', distance: 0, corner: null };
  const turns = token.rule === 'corner_turn';
  const { width: w, length } = token.size;
  if (r.status === 'fail') {
    const edge = b.edges.find((e) => e.id === r.blocked_at);
    if (turns && r.reason === 'cannot_turn' && edge && hasCorner(edge) && !vertical(edge)) {
      const j = route.points.findIndex((_, i) => Math.abs(cum[i]! - route.stopAt) < 1e-6);
      const corner = j >= 0 ? cornerAt(route, j, edge, w, length) : null;
      if (corner) return { kind: 'jam', distance: route.stopAt, corner };
    }
    return { kind: 'stop', distance: route.stopAt, corner: null };
  }
  if (turns) {
    const nodes = new Map(b.nodes.map((n) => [n.id, n]));
    for (let i = 0; i + 1 < r.path.length; i++) {
      const [from, to] = [r.path[i]!, r.path[i + 1]!];
      const edge = b.edges.find((e) => hasCorner(e) && !vertical(e)
        && ((e.from === from && e.to === to) || (e.from === to && e.to === from)));
      const fb = nodes.get(from)?.box, tb = nodes.get(to)?.box;
      if (!edge || !fb || !tb) continue;
      const [dx, dz] = doorPoint(fb, tb); // where the route meets this edge
      const j = route.points.findIndex((p) => Math.abs(p[0] - dx) < 1e-6 && Math.abs(p[2] - dz) < 1e-6);
      const corner = j >= 0 ? cornerAt(route, j, edge, w, length) : null;
      if (corner) return { kind: 'pivot', distance: total, corner };
    }
  }
  return { kind: 'move', distance: total, corner: null };
}

export type Phase = 'wait' | 'travel' | 'turn' | 'stopped' | 'done';

export interface LocalState {
  phase: Phase;
  d: number; // metres along the drawn route
  k: number; // 0 to 1 through the turn (turn), 1 after it, 0 before
  after: number; // seconds since a pivot ended (Infinity before or without one)
}

const turnSeconds = (it: RunItem): number =>
  it.kind === 'pivot' ? TIMING.pivotSeconds : it.kind === 'jam' ? TIMING.jamSeconds : 0;

// Where one token is t seconds into its own timeline.
export function localState(it: RunItem, t: number): LocalState {
  const D = it.distance;
  const T = travelSeconds(D);
  if (D < 1e-6) return { phase: 'done', d: 0, k: 0, after: Infinity };
  if (t < 0) return { phase: 'wait', d: 0, k: 0, after: Infinity };
  if (it.kind === 'pivot' && it.corner) {
    const dc = it.corner.at;
    const T1 = (T * dc) / D, T2 = T - T1, P = TIMING.pivotSeconds;
    if (t < T1) return { phase: 'travel', d: distanceAt(dc, T1, t), k: 0, after: Infinity };
    if (t < T1 + P) return { phase: 'turn', d: dc, k: (t - T1) / P, after: Infinity };
    const s = t - T1 - P;
    if (s < T2) return { phase: 'travel', d: dc + distanceAt(D - dc, T2, s), k: 1, after: s };
    return { phase: 'done', d: D, k: 1, after: s };
  }
  if (t < T) return { phase: 'travel', d: distanceAt(D, T, t), k: 0, after: Infinity };
  if (it.kind === 'jam') {
    const J = TIMING.jamSeconds;
    return t < T + J ? { phase: 'turn', d: D, k: (t - T) / J, after: Infinity } : { phase: 'stopped', d: D, k: 1, after: Infinity };
  }
  return { phase: it.kind === 'stop' ? 'stopped' : 'done', d: D, k: 0, after: Infinity };
}

export interface Beat {
  owner: number; // index into the run items
  wall: number; // seconds after the run starts
  seconds: number;
}

export interface Plan {
  starts: number[]; // each token's start offset, seconds
  beats: Beat[]; // in time order, never overlapping
  end: number; // seconds until every token has finished
  // Seconds until every answer is on screen: each No token stopped (its red X up), each Yes token
  // arrived. A calm stop's hold can still play after it, with nothing moving.
  answered: number;
}

// A token's own clock: wall time minus the time it spent holding still for other tokens' beats.
export function tokenClock(plan: Pick<Plan, 'beats'>, k: number, wall: number): number {
  let held = 0;
  for (const b of plan.beats) if (b.owner !== k) held += Math.min(b.seconds, Math.max(0, wall - b.wall));
  return wall - held;
}

// The wall time at which token k's clock reads `clock`, given the beats so far (in time order).
function wallFor(beats: Beat[], k: number, clock: number): number {
  let w = clock;
  for (const b of beats) if (b.owner !== k && b.wall <= w) w += b.seconds;
  return w;
}

// Which moments get the stage when there are more than maxBeats: a jam first (the corner the
// question is about), then the first pivot, then calm stops, each group in the order tokens get there.
const RANK: Record<ItemKind, number> = { jam: 0, pivot: 1, stop: 2, move: 3 };

export function planRun(items: readonly RunItem[]): Plan {
  const starts = items.map((_, i) => i * TIMING.stagger);
  // Each token's decisive moment, on its own clock: a stop or jam on arrival, a pivot at the corner.
  const moments = items.flatMap((it, k) => {
    if (it.distance < 1e-6 || it.kind === 'move') return [];
    const T = travelSeconds(it.distance);
    const at = it.kind === 'pivot' && it.corner ? (T * it.corner.at) / it.distance : T;
    const seconds = it.kind === 'stop' ? TIMING.stopHoldSeconds : turnSeconds(it);
    return [{ k, clock: starts[k]! + at, seconds, kind: it.kind }];
  }).sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.clock - b.clock);
  // Only the first pivot is a decisive moment; later pivots turn in their own time, others moving on.
  const firstPivot = moments.find((m) => m.kind === 'pivot');
  const pending = moments.filter((m) => m.kind !== 'pivot' || m === firstPivot).slice(0, TIMING.maxBeats);
  // Place the chosen moments in time: each one holds every other token still while it plays.
  const beats: Beat[] = [];
  while (pending.length > 0) {
    let best = 0;
    let bestWall = Infinity;
    pending.forEach((p, i) => {
      const w = wallFor(beats, p.k, p.clock);
      if (w < bestWall) [best, bestWall] = [i, w];
    });
    const [p] = pending.splice(best, 1);
    beats.push({ owner: p!.k, wall: bestWall, seconds: p!.seconds });
  }
  let answered = 0;
  items.forEach((it, k) => {
    if (it.distance < 1e-6) return;
    const local = travelSeconds(it.distance) + turnSeconds(it);
    answered = Math.max(answered, wallFor(beats, k, starts[k]! + local));
  });
  let end = answered;
  for (const b of beats) end = Math.max(end, b.wall + b.seconds);
  return { starts, beats, end, answered };
}

// Token k's walk at `wall` seconds, in units of `unit` seconds for its whole trip: 0 as it sets off,
// `unit` as it arrives (or stops), and still while another token's moment plays. The smoke spread
// counts its steps on this clock, so the smoke meets the people where the solver says it does.
export function walkClock(plan: Plan, k: number, item: RunItem, wall: number, unit: number): number {
  return ((tokenClock(plan, k, wall) - (plan.starts[k] ?? 0)) / travelSeconds(item.distance)) * unit;
}

// The yaw (rotation about y) that turns +x onto the plan direction (dx, dz).
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

// One step of an eased turn from `current` towards `target`, the short way round.
export function turnToward(current: number, target: number, dt: number, tau: number): number {
  let diff = (target - current) % (2 * Math.PI);
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return current + diff * (1 - Math.exp(-dt / tau));
}
