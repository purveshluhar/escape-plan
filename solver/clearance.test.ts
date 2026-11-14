import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLEARANCE } from './clearance.ts';
import { walk } from './search.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import type { Building, BuildingNode, Edge, Edit, ExpectedFile, SolverResult, Token } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
// A fresh parse each call, so no test sees what another test did to its input.
const freshDemo = (): Building => read('../data/building.json') as Building;
const demo = freshDemo();
const expected = read('../data/expected.json') as ExpectedFile;

// The chiller as data/building.json has it: 1.6 wide, 2.0 high, 2.4 long, from the plant to the truck.
const chiller: Token = {
  id: 'chiller', discipline: 'mep', start: 's', goal: 'x',
  size: { width: 1.6, height: 2.0, length: 2.4 }, rule: 'clearance',
};
function node(id: string, extra: Partial<BuildingNode> = {}): BuildingNode {
  return { id, name: id, level: 'L1', type: 'room', box: { x: 0, y: 0, width: 4, depth: 4 }, is_exit: false, ...extra };
}
// Start `s` on L2, one edge to the goal `x` on L1 (a shaft or stair changes floor; the core does not care).
function oneEdge(e: Partial<Edge>): Building {
  return {
    levels: [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 4 }],
    nodes: [node('s', { level: 'L2' }), node('x')],
    edges: [{ id: 'e', name: 'e', from: 's', to: 'x', kind: 'shaft', clear_width: 2, clear_height: 3, step_height: 0, ...e }],
    members: [],
    tokens: [chiller],
  };
}
const block = (e: Partial<Edge>) => {
  const r = walk(oneEdge(e), chiller, CLEARANCE);
  return [r.status, r.blocked_at, r.reason, r.needed, r.available];
};
const button = (op: Edit['op'], target: string, value: number | null = null): Edit => ({ op, target, value, source: 'button' });
const chillerOf = (b: Building, edits: readonly Edit[] = []): SolverResult => {
  const r = solve(b, edits).find((x) => x.token === 'chiller');
  assert.ok(r, 'no result for chiller');
  return r;
};

test('clearance is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('clearance'));
});

test('clearance uses door, opening, ramp, step, stair, elevator and shaft, never drain_route or supply', () => {
  assert.deepEqual([...CLEARANCE.kinds].sort(), ['door', 'elevator', 'opening', 'ramp', 'shaft', 'stair', 'step']);
  for (const kind of ['door', 'opening', 'ramp', 'step', 'stair', 'shaft'] as const) {
    assert.equal(walk(oneEdge({ kind }), chiller, CLEARANCE).status, 'pass', kind);
  }
  for (const kind of ['drain_route', 'supply'] as const) {
    assert.deepEqual(block({ kind }), ['fail', null, 'no_route', null, null], kind);
  }
});

test('steps and stairs do not block the chiller', () => {
  assert.equal(walk(oneEdge({ kind: 'step', step_height: 0.15 }), chiller, CLEARANCE).status, 'pass');
  assert.equal(walk(oneEdge({ kind: 'door', step_height: 0.02 }), chiller, CLEARANCE).status, 'pass');
});

test('width: too_narrow with needed = size.width and available = clear_width; equal passes', () => {
  assert.deepEqual(block({ clear_width: 1.2 }), ['fail', 'e', 'too_narrow', 1.6, 1.2]);
  assert.equal(walk(oneEdge({ clear_width: 1.6 }), chiller, CLEARANCE).status, 'pass');
});

test('height: too_low with needed = size.height and available = clear_height; equal passes', () => {
  assert.deepEqual(block({ clear_height: 1.9 }), ['fail', 'e', 'too_low', 2.0, 1.9]);
  assert.equal(walk(oneEdge({ clear_height: 2.0 }), chiller, CLEARANCE).status, 'pass');
});

test('check order: width before height', () => {
  assert.equal(block({ clear_width: 1.0, clear_height: 1.0 })[2], 'too_narrow');
});

test('no corner check: a narrow corner does not stop the chiller', () => {
  assert.equal(walk(oneEdge({ corner_a: 0.1, corner_b: 0.1 }), chiller, CLEARANCE).status, 'pass');
});

test('elevator car: the chiller must fit the car box in plan, either way round', () => {
  const lift = (box: { width: number; depth: number }): Building => ({
    ...oneEdge({}),
    nodes: [node('s', { level: 'L2' }), node('car', { type: 'elevator', box: { x: 0, y: 0, ...box } }), node('x')],
    edges: [
      { id: 'in', name: 'in', from: 's', to: 'car', kind: 'elevator', clear_width: 2, clear_height: 3, step_height: 0 },
      { id: 'out', name: 'out', from: 'car', to: 'x', kind: 'door', clear_width: 2, clear_height: 3, step_height: 0 },
    ],
  });
  assert.equal(walk(lift({ width: 2.4, depth: 1.6 }), chiller, CLEARANCE).status, 'pass');
  const r = walk(lift({ width: 1.5, depth: 3 }), chiller, CLEARANCE);
  assert.deepEqual([r.status, r.path, r.blocked_at, r.reason, r.needed, r.available], ['fail', ['s'], 'car', 'too_narrow', 1.6, 1.5]);
});

test('no route: no_route with blocked_at null, and the chiller stays at its start', () => {
  const b = oneEdge({});
  b.edges = [];
  const r = walk(b, chiller, CLEARANCE);
  assert.deepEqual([r.status, r.path, r.blocked_at, r.reason, r.needed, r.available], ['fail', ['s'], null, 'no_route', null, null]);
});

test('demo building: the plant shaft stops the chiller, 1.6 needed, 1.2 available', () => {
  assert.deepEqual(chillerOf(demo), {
    token: 'chiller', status: 'fail', path: ['plant'], blocked_at: 'plant-shaft', reason: 'too_narrow', needed: 1.6, available: 1.2,
  });
});

test('demo building: widen the plant shaft and the chiller reaches the truck', () => {
  const pass = { token: 'chiller', status: 'pass', path: ['plant', 'corridor', 'street', 'truck'], blocked_at: null, reason: null, needed: null, available: null };
  assert.deepEqual(chillerOf(demo, [button('widen', 'plant-shaft', 2.0)]), pass);
  assert.deepEqual(chillerOf(demo, [button('widen', 'plant-shaft', 1.6)]), pass, 'exactly the chiller width passes');
  const short = chillerOf(demo, [button('widen', 'plant-shaft', 1.5)]);
  assert.deepEqual([short.blocked_at, short.reason, short.needed, short.available], ['plant-shaft', 'too_narrow', 1.6, 1.5]);
  assert.equal(chillerOf(demo, [button('widen', 'plant-shaft', 2.0), button('reset', '')]).status, 'fail', 'reset brings the block back');
});

test('demo building: a low north door gives too_low past the shaft', () => {
  const b = freshDemo();
  b.edges.find((e) => e.id === 'door-north')!.clear_height = 1.9;
  const r = chillerOf(b, [button('widen', 'plant-shaft', 2.0)]);
  assert.deepEqual([r.status, r.path, r.blocked_at, r.reason, r.needed, r.available], ['fail', ['plant', 'corridor'], 'door-north', 'too_low', 2.0, 1.9]);
});

test('every expected chiller case in data/expected.json names the chiller', () => {
  // Guard: the expected cases run in solver.test.ts; this proves there are chiller cases to run.
  const ids = expected.cases.filter((c) => c.expect.some((e) => e.token === 'chiller')).map((c) => c.id);
  assert.deepEqual(ids, ['base', 'widen-shaft', 'widen-shaft-and-transfer-beam', 'full-demo']);
});
