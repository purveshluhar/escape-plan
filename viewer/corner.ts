// Pure geometry for a long object (sofa, glass panel) turning a 90-degree corner, for the pivot
// and the jam the viewer plays at an edge with `corner_a` and `corner_b` (design/motion.md 2.2).
// No three.js here, so it is easy to test. Owner: P2.
//
// Corner frame, plan metres: the inner corner is O = (0, 0). Leg A (before the turn, width a) runs
// towards -x; its outer wall is y = a. Leg B (after the turn, width b) runs towards -y; its outer wall
// is x = b. u is the turn of the object's long axis from leg A's axis, 0 to 90 degrees.
// The object is O + s d + r n for r in [0, w], s in [start, start + length], with its axis
// d = (cos u, -sin u) and its side n = (sin u, cos u): its inner long edge passes through O.
import { lMax } from '../solver/corner-turn.ts';

export interface Corner {
  a: number; // corner_a: leg A's width, metres
  b: number; // corner_b: leg B's width
  w: number; // the object's width
  length: number; // the object's length
}

export type P2 = [number, number];

const RAD = Math.PI / 180;
// The solver samples t = 0.1 ... 89.9 deg; u = 90 deg - t falls on the same grid.
const SAMPLES = Array.from({ length: 899 }, (_, i) => ((i + 1) / 10) * RAD);

// The longest object of this width that fits the corner at turn u (the solver's formula, with its
// t = 90 deg - u).
export function fitLength(c: Corner, u: number): number {
  const s = Math.sin(u), k = Math.cos(u);
  return c.b / k + c.a / s - c.w / (s * k);
}

// The tightest turn and the length that fits there: the solver's own L_max.
export function worstTurn(c: Corner): { u: number; length: number } {
  let u = Math.PI / 4;
  let min = Infinity;
  for (const x of SAMPLES) {
    const f = fitLength(c, x);
    if (f < min) {
      min = f;
      u = x;
    }
  }
  return { u, length: lMax(c.a, c.b, c.w) };
}

// The largest turn the object reaches from 0 before it touches both outer walls and the inner
// corner (it binds), or null when it turns the whole corner. An object wider than a leg binds at 0.
export function bindTurn(c: Corner): number | null {
  if (c.w > Math.min(c.a, c.b)) return 0;
  for (let i = 0; i < SAMPLES.length; i++) {
    if (fitLength(c, SAMPLES[i]!) < c.length) return i === 0 ? 0 : SAMPLES[i - 1]!;
  }
  return null;
}

export interface Pose {
  centre: P2;
  axis: P2; // unit long axis
  corners: [P2, P2, P2, P2]; // inner rear, inner front, outer rear, outer front
}

// The object's pose at turn u. At 0 deg its front outer corner is on leg B's outer wall; at 90 deg
// its rear outer corner is on leg A's outer wall; in between it slides by a blend of the two
// (a closed form of (s1 - length) cos^2 u + s0 sin^2 u, finite at both ends). It is inside the
// corner exactly when fitLength(c, u) >= c.length.
export function bodyPose(c: Corner, u: number): Pose {
  const k = Math.cos(u), s = Math.sin(u);
  const start = (c.b - c.w * s) * k - c.length * k * k - (c.a - c.w * k) * s;
  const at = (sv: number, r: number): P2 => [sv * k + r * s, -sv * s + r * k];
  return {
    centre: at(start + c.length / 2, c.w / 2),
    axis: [k, -s],
    corners: [at(start, 0), at(start + c.length, 0), at(start, c.w), at(start + c.length, c.w)],
  };
}

// Where the object touches at turn u: its rear outer corner (on leg A's outer wall at the bind),
// the inner corner, and its front outer corner (on leg B's outer wall).
export function contacts(c: Corner, u: number): [P2, P2, P2] {
  const p = bodyPose(c, u);
  return [p.corners[2], [0, 0], p.corners[3]];
}

// The longest thing that fits, drawn at the tightest turn: the outer long edge from leg A's outer
// wall to leg B's outer wall, with the inner edge through the inner corner.
export function longestLine(c: Corner): { from: P2; to: P2; length: number } {
  const { u } = worstTurn(c);
  const k = Math.cos(u), s = Math.sin(u);
  const s0 = -(c.a - c.w * k) / s;
  const s1 = (c.b - c.w * s) / k;
  const at = (sv: number): P2 => [sv * k + c.w * s, -sv * s + c.w * k];
  return { from: at(s0), to: at(s1), length: s1 - s0 };
}

// A corner frame placed in plan (x, z): the way in and the way out are unit plan vectors at right
// angles. The frame is placed so that the object at 0 deg stands at `door`, where the route meets
// the edge, so the token arrives in it without a jump.
export interface Frame {
  origin: P2;
  inDir: P2; // frame +x
  outDir: P2; // frame -y
}

export function cornerFrame(door: P2, inDir: P2, outDir: P2, c: Corner): Frame {
  const [cx, cy] = bodyPose(c, 0).centre;
  return {
    origin: [door[0] - cx * inDir[0] + cy * outDir[0], door[1] - cx * inDir[1] + cy * outDir[1]],
    inDir, outDir,
  };
}

// A frame point in plan (x, z).
export function toPlan(f: Frame, [x, y]: P2): P2 {
  return [f.origin[0] + x * f.inDir[0] - y * f.outDir[0], f.origin[1] + x * f.inDir[1] - y * f.outDir[1]];
}
