// The follow camera's pure parts: what it frames and the pan and zoom that frame it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VIEW } from './layout.ts';
import { FOLLOW_ZOOM, followFrame, followSet, followStep } from './follow.ts';
import type { FollowInput } from './follow.ts';

// followFrame for inputs that have points: never null.
const frame = (input: FollowInput) => {
  const f = followFrame(input);
  assert.ok(f);
  return f;
};

const near = (a: number, b: number, eps = 1e-3): void => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('followSet: the figures on the move, while any is moving', () => {
  const set = followSet([
    { at: [0, 0, 0], phase: 'travel', fail: false },
    { at: [5, 0, 0], phase: 'done', fail: false },
    { at: [9, 3, 1], phase: 'turn', fail: true },
  ]);
  assert.deepEqual(set, [[0, 0, 0], [9, 3, 1]]);
});

test('followSet: before anything moves, the figures about to set off', () => {
  assert.deepEqual(followSet([
    { at: [1, 2, 3], phase: 'wait', fail: false },
    { at: [4, 0, 0], phase: 'done', fail: false },
  ]), [[1, 2, 3]]);
});

test('followSet: at the end, the places they got stuck when any did', () => {
  assert.deepEqual(followSet([
    { at: [0, 0, 0], phase: 'done', fail: false },
    { at: [7, 9, 2], phase: 'stopped', fail: true },
  ]), [[7, 9, 2]]);
});

test('followSet: at the end with every answer yes, where each one ended (the exits)', () => {
  assert.deepEqual(followSet([
    { at: [0, 0, 0], phase: 'done', fail: false },
    { at: [3, 0, 4], phase: 'done', fail: false },
  ]), [[0, 0, 0], [3, 0, 4]]);
  assert.deepEqual(followSet([]), []);
});

test('followFrame: one figure 10 m above the framed centre pans the view up by 10 cos(elevation)', () => {
  const f = frame({ points: [[0, 10, 0]], centre: [0, 0, 0], view: DEFAULT_VIEW, baseHalf: 20, aspect: 1.5, userZoom: 1 });
  near(f.pan.x, 0);
  near(f.pan.y, 8.165);
  assert.equal(f.zoom, FOLLOW_ZOOM);
});

test('followFrame: a sideways offset pans along the camera right', () => {
  // (1, 0, -1) is the camera right in the default isometric view.
  const f = frame({ points: [[3, 0, -3]], centre: [0, 0, 0], view: DEFAULT_VIEW, baseHalf: 20, aspect: 1.5, userZoom: 1 });
  near(f.pan.x, 4.243);
  near(f.pan.y, 0);
});

test('followFrame: figures far apart widen the view to hold both', () => {
  const a = 20 / Math.SQRT2; // 20 m either side along the camera right
  const f = frame({ points: [[a, 0, -a], [-a, 0, a]], centre: [0, 0, 0], view: DEFAULT_VIEW, baseHalf: 20, aspect: 1.5, userZoom: 1 });
  near(f.pan.x, 0);
  near(f.zoom, 0.8); // (20 + 4 m margin) / 1.5 aspect / 20 m
});

test('followFrame: a person already zoomed in closer keeps that zoom; never past the framed view', () => {
  assert.equal(frame({ points: [[0, 0, 0]], centre: [0, 0, 0], view: DEFAULT_VIEW, baseHalf: 20, aspect: 1.5, userZoom: 0.3 }).zoom, 0.3);
  const a = 80 / Math.SQRT2;
  assert.equal(frame({ points: [[a, 0, -a], [-a, 0, a]], centre: [0, 0, 0], view: DEFAULT_VIEW, baseHalf: 20, aspect: 1.5, userZoom: 1 }).zoom, 1);
});

test('followFrame: nothing to frame, no change', () => {
  assert.equal(followFrame({ points: [], centre: [0, 0, 0], view: DEFAULT_VIEW, baseHalf: 20, aspect: 1.5, userZoom: 1 }), null);
});

test('followStep: eases a share of the way each frame, and lands when close', () => {
  const s = followStep({ pan: { x: 0, y: 0 }, zoom: 1 }, { pan: { x: 10, y: -10 }, zoom: 0.25 }, 0.25, false);
  near(s.pan.x, 5.276); // 1 - e^(-3 * 0.25) of the way
  near(s.pan.y, -5.276);
  near(s.zoom, 0.4812); // the same share of the way in log zoom: 0.25 ^ 0.5276
  const landed = followStep({ pan: { x: 9.999, y: 0 }, zoom: 0.5 }, { pan: { x: 10, y: 0 }, zoom: 0.5 }, 0.016, false);
  assert.deepEqual(landed, { pan: { x: 10, y: 0 }, zoom: 0.5 });
});

test('followStep: reduced motion cuts straight to the frame', () => {
  assert.deepEqual(followStep({ pan: { x: 0, y: 0 }, zoom: 1 }, { pan: { x: 10, y: -10 }, zoom: 0.25 }, 0, true), { pan: { x: 10, y: -10 }, zoom: 0.25 });
});
