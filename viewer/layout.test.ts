import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  doorPoint, FOUNDATION_DEPTH, frustum, LANE_GAP, nodeBoxes, PATH_LIFT, pointAt, cumulativeLengths,
  routeLength, STOREY_HEIGHT, tokenRoute,
} from './layout.ts';
import type { Building, SolverResult } from '../contract/types.ts';

test('one box per node, sitting on its level', () => {
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  const elevation = new Map(real.levels.map((l) => [l.id, l.elevation]));
  const boxes = nodeBoxes(real);
  assert.equal(boxes.length, real.nodes.length);
  for (const n of real.nodes) {
    const box = boxes.find((x) => x.id === n.id);
    const floor = elevation.get(n.level) ?? 0;
    assert.deepEqual(box?.center, [n.box.x + n.box.width / 2, floor + STOREY_HEIGHT / 2, n.box.y + n.box.depth / 2], n.id);
    assert.deepEqual(box?.size, [n.box.width, STOREY_HEIGHT, n.box.depth], n.id);
  }
  // A fixed answer from the small fixture below, so a wrong formula still fails and the test
  // does not move when data/building.json does.
  assert.deepEqual(nodeBoxes(b).find((x) => x.id === 'up')?.center, [3, 4 + STOREY_HEIGHT / 2, 2]);
});

// Small two-level building of our own, so these tests do not move when data/building.json does.
// L2 room `up` sits over `low`; `hall` runs along the north side of `low`; `out` is past a 1 m gap.
const b: Building = {
  levels: [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 4 }],
  nodes: [
    { id: 'up', name: 'Up', level: 'L2', type: 'plant', box: { x: 0, y: 0, width: 6, depth: 4 }, is_exit: false },
    { id: 'low', name: 'Low', level: 'L1', type: 'room', box: { x: 0, y: 0, width: 6, depth: 4 }, is_exit: false },
    { id: 'hall', name: 'Hall', level: 'L1', type: 'corridor', box: { x: 0, y: 4, width: 6, depth: 2 }, is_exit: false },
    { id: 'out', name: 'Out', level: 'L1', type: 'street', box: { x: 0, y: 7, width: 6, depth: 3 }, is_exit: true },
  ],
  edges: [
    { id: 'drop', name: 'Drop shaft', from: 'up', to: 'hall', kind: 'shaft', clear_width: 1, clear_height: 3, step_height: 0 },
    { id: 'gate', name: 'Gate', from: 'hall', to: 'out', kind: 'door', clear_width: 2, clear_height: 2.4, step_height: 0 },
  ],
  members: [
    { id: 'f', kind: 'foundation', level: 'L1', supported_by: [], node: 'hall' },
    { id: 'col', kind: 'column', level: 'L1', supported_by: ['f'], node: 'hall' },
    { id: 'beam', kind: 'beam', level: 'L2', supported_by: ['col'], node: 'up' },
  ],
  tokens: [
    { id: 'box', discipline: 'mep', start: 'up', goal: 'out', size: { width: 1, height: 1, length: 1 }, rule: 'clearance' },
    { id: 'load', discipline: 'structure', start: 'beam', goal: null, size: { width: 0, height: 0, length: 0 }, rule: 'downward' },
  ],
};

const result = (r: Partial<SolverResult> & Pick<SolverResult, 'token' | 'status' | 'path'>): SolverResult => ({
  blocked_at: null, reason: null, needed: null, available: null, ...r,
});

const H1 = PATH_LIFT;
const H2 = 4 + PATH_LIFT;

test('door point is the middle of a shared wall, or of the gap between two boxes', () => {
  const [up, , hall, out] = b.nodes.map((n) => n.box);
  assert.deepEqual(doorPoint(up!, hall!), [3, 4]);
  assert.deepEqual(doorPoint(hall!, out!), [3, 6.5]);
});

test('a passing route walks room centres through each door, dropping a level at the door', () => {
  const route = tokenRoute(b, result({ token: 'box', status: 'pass', path: ['up', 'hall', 'out'] }));
  assert.deepEqual(route.points, [
    [3, H2, 2], [3, H2, 4], [3, H1, 4], [3, H1, 5], [3, H1, 6.5], [3, H1, 8.5],
  ]);
  assert.equal(route.blocked, null);
  assert.equal(route.stopAt, routeLength(route.points));
});

test('a route blocked at an edge stops at its door with the red X, then shows one step past it', () => {
  const route = tokenRoute(b, result({
    token: 'box', status: 'fail', path: ['up'], blocked_at: 'drop', reason: 'too_narrow', needed: 1.6, available: 1,
  }));
  assert.deepEqual(route.blocked, [3, H2, 4]);
  assert.equal(route.stopAt, 2);
  assert.deepEqual(route.points, [[3, H2, 2], [3, H2, 4], [3, H1, 4], [3, H1, 5]]);
});

test('each token runs in its own height lane', () => {
  const route = tokenRoute(b, result({ token: 'box', status: 'pass', path: ['hall'] }), 2);
  assert.deepEqual(route.points, [[3, PATH_LIFT + 2 * LANE_GAP, 5]]);
});

test('the load walks members at their node and level, across then down, foundation below', () => {
  const route = tokenRoute(b, result({ token: 'load', status: 'pass', path: ['beam', 'col', 'f'] }));
  assert.deepEqual(route.points, [[3, 4, 2], [3, 4, 5], [3, 0, 5], [3, -FOUNDATION_DEPTH, 5]]);
});

test('a load blocked at a member gets its red X on that member', () => {
  const route = tokenRoute(b, result({ token: 'load', status: 'fail', path: ['beam'], blocked_at: 'beam', reason: 'no_support' }));
  assert.deepEqual(route.blocked, [3, 4, 2]);
  assert.deepEqual(route.points, [[3, 4, 2]]);
});

test('a token with no path (stub solver) waits at its start, with no red X', () => {
  const route = tokenRoute(b, result({ token: 'box', status: 'fail', path: [], reason: 'no_route' }));
  assert.deepEqual(route.points, [[3, H2, 2]]);
  assert.equal(route.blocked, null);
  assert.equal(route.stopAt, 0);
});

test('pointAt walks the route by distance and clamps at both ends', () => {
  const pts: [number, number, number][] = [[0, 0, 0], [2, 0, 0], [2, 3, 0]];
  const cum = cumulativeLengths(pts);
  assert.deepEqual(pointAt(pts, cum, 1), [1, 0, 0]);
  assert.deepEqual(pointAt(pts, cum, 3.5), [2, 1.5, 0]);
  assert.deepEqual(pointAt(pts, cum, -1), [0, 0, 0]);
  assert.deepEqual(pointAt(pts, cum, 99), [2, 3, 0]);
});

test('the view centres the model in the screen left of a side panel, scaled to fit that space', () => {
  // Model reaches 10 m either side of its centre and 5 m up and down; 1000 x 500 px canvas.
  const full = frustum({ hx: 10, hy: 5, width: 1000, height: 500, insetRight: 0, margin: 1 });
  assert.deepEqual(full, { left: -10, right: 10, top: 5, bottom: -5 });
  // A 500 px panel leaves a square 500 x 500 px: the 20 m wide model now sets the scale, and
  // its centre (camera x = 0) lands in the middle of that free space, 250 px from the left.
  const inset = frustum({ hx: 10, hy: 5, width: 1000, height: 500, insetRight: 500, margin: 1 });
  assert.deepEqual(inset, { left: -10, right: 30, top: 10, bottom: -10 });
  const centrePx = ((0 - inset.left) / (inset.right - inset.left)) * 1000;
  assert.equal(centrePx, 250);
});
