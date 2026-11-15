// The follow camera: while a run plays, the view keeps the moving figures in frame, and when it
// ends it settles on the answer (where a figure got stuck, or where every one ended). Pure: no
// three.js, no DOM. viewer/index.ts owns when it runs and when a person takes the camera back.
import type { Phase } from './timeline.ts';
import { viewDirection, type OrbitView, type Vec3 } from './layout.ts';

// The zoom the follow camera closes in to (1 = framed on the whole model). Closer than REVEAL_ZOOM
// (layout.ts), so the facade is open and the floor the figure is on shows as a plan.
export const FOLLOW_ZOOM = 0.5;
// Metres kept around the figures framed, so a figure never touches the edge of the view.
export const FOLLOW_MARGIN = 4;
// Each second the view covers this share of the way to the frame, in e-folds: slower than the floor
// glide (layout.ts GLIDE_RATE), so the camera trails the figure calmly instead of snapping to it.
export const FOLLOW_RATE = 3;
const SNAP_PAN = 0.01; // metres: this near the frame it lands on it
const SNAP_ZOOM = 1e-3;

export interface FollowEntry {
  at: Vec3; // where the figure is now
  phase: Phase; // its place on its own timeline (timeline.ts localState)
  fail: boolean; // its answer is No
}

// What to frame: the figures on the move while any is; before any moves, the figures about to set
// off; once all have ended, the places a figure got stuck, or, when every answer is yes, where each
// one ended (the exits).
export function followSet(entries: readonly FollowEntry[]): Vec3[] {
  const moving = entries.filter((e) => e.phase === 'travel' || e.phase === 'turn');
  if (moving.length) return moving.map((e) => e.at);
  const waiting = entries.filter((e) => e.phase === 'wait');
  if (waiting.length) return waiting.map((e) => e.at);
  const stuck = entries.filter((e) => e.fail);
  return (stuck.length ? stuck : entries).map((e) => e.at);
}

export interface FollowInput {
  points: readonly Vec3[]; // followSet
  centre: Vec3; // the framed centre (the view with no pan looks at it)
  view: OrbitView;
  baseHalf: number; // half the view height at zoom 1, metres
  aspect: number; // width over height of the free view (between the panels)
  userZoom: number; // the zoom the person had before the run
}

export interface CameraFrame {
  pan: { x: number; y: number }; // metres in the camera plane (layout.ts panned)
  zoom: number;
}

// The pan that puts the middle of the points in the middle of the free view, and the zoom that holds
// them all with FOLLOW_MARGIN to spare: FOLLOW_ZOOM, or closer when the person was already closer,
// wider when the points are far apart. A group too wide for the framed view would leave the camera on
// the empty middle, so then only the lead (the first point) is framed. null: no points.
export function followFrame(input: FollowInput): CameraFrame | null {
  const { points, centre, view, baseHalf, aspect, userZoom } = input;
  if (points.length === 0) return null;
  // The camera's right and up, as three's lookAt makes them (world up is y).
  const [dx, dy, dz] = viewDirection(view.azimuth, view.elevation);
  const rl = Math.hypot(dz, dx) || 1;
  const right: Vec3 = [dz / rl, 0, -dx / rl];
  const up: Vec3 = [dy * right[2] - dz * right[1], dz * right[0] - dx * right[2], dx * right[1] - dy * right[0]];
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of points) {
    const rel: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const x = dot(rel, right);
    const y = dot(rel, up);
    [minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
  }
  const half = Math.max((maxY - minY) / 2 + FOLLOW_MARGIN, ((maxX - minX) / 2 + FOLLOW_MARGIN) / Math.max(aspect, 1e-6));
  const close = Math.min(FOLLOW_ZOOM, userZoom);
  const needed = half / Math.max(baseHalf, 1e-6);
  if (needed > 1 + 1e-9 && points.length > 1) return followFrame({ ...input, points: [points[0]!] });
  return { pan: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, zoom: Math.min(1, Math.max(close, needed)) };
}

// One frame of the camera easing towards `target`, `dt` seconds on: the pan in metres, the zoom in
// log steps so closing in feels as steady as pulling out. Reduced motion cuts straight to it.
export function followStep(current: CameraFrame, target: CameraFrame, dt: number, reduced: boolean): CameraFrame {
  if (reduced) return { pan: { ...target.pan }, zoom: target.zoom };
  const k = 1 - Math.exp(-FOLLOW_RATE * Math.max(0, dt));
  const ease = (a: number, b: number, snap: number): number => {
    const n = a + (b - a) * k;
    return Math.abs(b - n) < snap ? b : n;
  };
  const z = Math.exp(Math.log(current.zoom) + (Math.log(target.zoom) - Math.log(current.zoom)) * k);
  return {
    pan: { x: ease(current.pan.x, target.pan.x, SNAP_PAN), y: ease(current.pan.y, target.pan.y, SNAP_PAN) },
    zoom: Math.abs(target.zoom - z) < SNAP_ZOOM ? target.zoom : z,
  };
}

// Who has the camera. 'run': the follow camera, from a run's start (paused: the person moved the view
// during it, and the Follow button shows); 'back': the run's routes went, so it eases back to the
// camera the person had (`before`); 'off': the person's.
export interface FollowState {
  mode: 'off' | 'run' | 'back';
  paused: boolean;
  before: CameraFrame | null;
}

// The viewer shows new answers. With routes, the follow camera takes over and keeps the camera the
// person had (over runs in a row, the first one). Without (the objects parked again), it goes back to
// that camera, unless the person took it during the run.
export function followOnShow(s: FollowState, routes: boolean, camera: CameraFrame): FollowState {
  if (routes) return { mode: 'run', paused: false, before: s.mode === 'off' || s.paused || !s.before ? camera : s.before };
  if (s.mode === 'run' && !s.paused && s.before) return { mode: 'back', paused: false, before: s.before };
  return { mode: 'off', paused: false, before: null };
}

// The person moved the view (a drag, the wheel, a double-click, a floor glide). While the run still
// plays the follow pauses; after it, or while going back, the camera is simply theirs.
export function followOnPause(s: FollowState, playing: boolean): FollowState {
  if (s.mode === 'run' && playing) return { ...s, paused: true };
  return s.mode === 'off' ? s : { mode: 'off', paused: false, before: null };
}

// The Follow button: the follow camera takes over again.
export function followOnResume(s: FollowState): FollowState {
  return s.mode === 'run' ? { ...s, paused: false } : s;
}

export const followButton = (s: FollowState): boolean => s.mode === 'run' && s.paused;
