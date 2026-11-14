import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_STEPS } from './no-steps.ts';
import { walk } from './search.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import type { Building, Edge, Token } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const demo = read('../data/building.json') as Building;

const wheelchair: Token = {
  id: 'wheelchair', discipline: 'accessibility', start: 's', goal: null,
  size: { width: 0.7, height: 1.3, length: 1.2 }, rule: 'no_steps',
};
// Start `s` on L1, one edge to the exit `x`. A stair goes up to L2 (3 m); every other kind stays on L1.
function oneEdge(e: Partial<Edge>): Building {
  return {
    levels: [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 3 }],
    nodes: [
      { id: 's', name: 's', level: 'L1', type: 'room', box: { x: 0, y: 0, width: 2, depth: 2 }, is_exit: false },
      { id: 'x', name: 'x', level: e.kind === 'stair' ? 'L2' : 'L1', type: 'street', box: { x: 0, y: 0, width: 2, depth: 2 }, is_exit: true },
    ],
    edges: [{ id: 'e', name: 'e', from: 's', to: 'x', kind: 'door', clear_width: 1, clear_height: 2.4, step_height: 0, ...e }],
    members: [],
    tokens: [wheelchair],
  };
}
const block = (e: Partial<Edge>) => {
  const r = walk(oneEdge(e), wheelchair, NO_STEPS);
  return [r.status, r.blocked_at, r.reason, r.needed, r.available];
};

test('no_steps is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('no_steps'));
});

test('a rule string that names an Object member gets the unsolved placeholder', () => {
  for (const rule of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const b = { ...demo, tokens: [{ ...wheelchair, start: 'terrace', rule: rule as Token['rule'] }] };
    assert.deepEqual(solve(b), [{ token: 'wheelchair', status: 'fail', path: [], blocked_at: null, reason: 'no_route', needed: null, available: null }], rule);
  }
});

test('no_steps uses door, opening, ramp, elevator, step and stair, never shaft', () => {
  assert.deepEqual([...NO_STEPS.kinds].sort(), ['door', 'elevator', 'opening', 'ramp', 'stair', 'step']);
  assert.equal(walk(oneEdge({ kind: 'shaft' }), wheelchair, NO_STEPS).reason, 'no_route');
});

test('a step edge blocks: needed 0, available its step_height', () => {
  assert.deepEqual(block({ kind: 'step', step_height: 0.15 }), ['fail', 'e', 'step', 0, 0.15]);
  assert.deepEqual(block({ kind: 'step', step_height: 0 }), ['fail', 'e', 'step', 0, 0]);
});

test('a stair blocks: available is the elevation difference of its two levels', () => {
  assert.deepEqual(block({ kind: 'stair' }), ['fail', 'e', 'step', 0, 3]);
  // Walked down, between two levels that are both above 0: from L3 (5 m) to an exit on L2 (3 m).
  const down = oneEdge({ kind: 'stair' });
  down.levels.push({ id: 'L3', elevation: 5 });
  down.nodes[0]!.level = 'L3';
  down.edges[0] = { ...down.edges[0]!, from: 'x', to: 's' };
  const r = walk(down, wheelchair, NO_STEPS);
  assert.deepEqual([r.reason, r.needed, r.available], ['step', 0, 2]);
});

test('any edge with step_height > 0 blocks; a level ramp, door or opening passes', () => {
  assert.deepEqual(block({ kind: 'door', step_height: 0.02 }), ['fail', 'e', 'step', 0, 0.02]);
  for (const kind of ['ramp', 'door', 'opening'] as const) {
    assert.equal(walk(oneEdge({ kind }), wheelchair, NO_STEPS).status, 'pass', kind);
  }
});

test('check order: step before width and height', () => {
  assert.equal(block({ kind: 'step', step_height: 0.1, clear_width: 0.1, clear_height: 0.1 })[2], 'step');
  assert.deepEqual(block({ clear_width: 0.6 }), ['fail', 'e', 'too_narrow', 0.7, 0.6]);
  assert.deepEqual(block({ clear_height: 1.2 }), ['fail', 'e', 'too_low', 1.3, 1.2]);
});

test('demo building: the wheelchair is stopped by the terrace step', () => {
  const got = solve(demo).find((r) => r.token === 'wheelchair');
  assert.deepEqual(got, {
    token: 'wheelchair', status: 'fail', path: ['terrace'], blocked_at: 'terrace-door', reason: 'step', needed: 0, available: 0.15,
  });
});

test('demo building: a ramp at the terrace door lets the wheelchair out to the street', () => {
  const got = solve(demo, [{ op: 'add_ramp', target: 'terrace-door', value: null, source: 'button' }]).find((r) => r.token === 'wheelchair');
  assert.deepEqual(got, {
    token: 'wheelchair', status: 'pass', path: ['terrace', 'lobby', 'corridor', 'street'],
    blocked_at: null, reason: null, needed: null, available: null,
  });
});
