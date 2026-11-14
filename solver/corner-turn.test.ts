import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORNER_TURN, lMax } from './corner-turn.ts';
import { walk } from './search.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import type { Building, Edge, Token } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const demo = read('../data/building.json') as Building;

// The ticket's sofa: 0.9 m wide. Its length changes per test. P5 adds the real token to data/.
const sofa = (length = 2.2): Token => ({
  id: 'sofa', discipline: 'logistics', start: 's', goal: null,
  size: { width: 0.9, height: 1.0, length }, rule: 'corner_turn',
});
// Start `s`, one edge to the exit `x`. The edge turns a corner: 1.2 m before, 1.5 m after (lobby-door).
function oneEdge(e: Partial<Edge>, token = sofa()): Building {
  return {
    levels: [{ id: 'L1', elevation: 0 }],
    nodes: [
      { id: 's', name: 's', level: 'L1', type: 'room', box: { x: 0, y: 0, width: 3, depth: 3 }, is_exit: false },
      { id: 'x', name: 'x', level: 'L1', type: 'street', box: { x: 0, y: 0, width: 3, depth: 3 }, is_exit: true },
    ],
    edges: [{ id: 'e', name: 'e', from: 's', to: 'x', kind: 'door', clear_width: 1, clear_height: 2.4, step_height: 0, corner_a: 1.2, corner_b: 1.5, ...e }],
    members: [],
    tokens: [token],
  };
}
const record = (e: Partial<Edge>, token = sofa()) => {
  const r = walk(oneEdge(e, token), token, CORNER_TURN);
  return [r.status, r.blocked_at, r.reason, r.needed, r.available];
};
const near = (got: number, want: number, tol: number, what: string) =>
  assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, want ${want} +- ${tol}`);

test('corner_turn is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('corner_turn'));
});

test('L_max with w = 0 matches (a^(2/3) + b^(2/3))^(3/2): 3.8105 for 1.2 and 1.5', () => {
  const closed = (a: number, b: number) => (a ** (2 / 3) + b ** (2 / 3)) ** 1.5;
  assert.equal(lMax(1.2, 1.5, 0).toFixed(4), '3.8105');
  for (const [a, b] of [[1.2, 1.5], [1.6, 1.6], [1, 2.5]] as const) near(lMax(a, b, 0), closed(a, b), 1e-4, `${a}, ${b}`);
});

test('L_max counts the width: glass and sofa numbers from the plan', () => {
  near(lMax(1.2, 1.5, 0.05), 3.7102, 0.0005, 'glass at lobby-door');
  near(lMax(1.6, 1.6, 0.05), 4.4255, 0.0005, 'glass after widen 1.6');
  near(lMax(1.2, 1.5, 0.9), 1.997, 0.0005, 'sofa at lobby-door');
  assert.ok(lMax(1.2, 1.5, 0.9) < lMax(1.2, 1.5, 0.5), 'a wider token has a shorter L_max');
});

test('L_max is 0, not below, when the token is wider than a leg of the corner', () => {
  assert.equal(lMax(1.2, 1.5, 1.6), 0);
  assert.equal(lMax(1.2, 0.5, 0.9), 0);
  assert.equal(lMax(0, 1.5, 0.1), 0);
  // Just past the 1.2 m leg, the samples alone would still give about 0.35.
  assert.equal(lMax(1.2, 1.5, 1.202), 0);
  assert.ok(lMax(1.2, 1.5, 1.2) > 0, 'exactly as wide as the leg is not wider');
});

test('L_max is the minimum over the 0.1 degree samples, not the exact minimum', () => {
  // The exact minimum for a 0.9 m sofa is about 1.9967345; the sampled one about 1.9967350.
  assert.ok(lMax(1.2, 1.5, 0.9) > 1.9967348);
  assert.equal(record({}, sofa(1.9967348))[0], 'pass');
});

test('a sofa that is too long for the corner fails cannot_turn: needed its length, available L_max', () => {
  const [status, at, reason, needed, available] = record({}, sofa(2.0));
  assert.deepEqual([status, at, reason, needed], ['fail', 'e', 'cannot_turn', 2.0]);
  near(available as number, 1.997, 0.0005, 'available');
  assert.equal(record({}, sofa(2.2))[2], 'cannot_turn');
  assert.equal(record({}, sofa(1.99))[0], 'pass');
});

test('a length equal to L_max passes', () => {
  assert.equal(record({}, sofa(lMax(1.2, 1.5, 0.9)))[0], 'pass');
});

test('the corner is checked only when both corner_a and corner_b are set', () => {
  assert.equal(record({ corner_a: null as unknown as number }, sofa(10))[0], 'pass', 'null counts as not set');
  assert.equal(record({ corner_b: undefined }, sofa(10))[0], 'pass');
  assert.equal(record({ corner_a: undefined }, sofa(10))[0], 'pass');
  assert.equal(record({ corner_a: undefined, corner_b: undefined }, sofa(10))[0], 'pass');
});

test('check order: width, then height, then the corner', () => {
  assert.deepEqual(record({ clear_width: 0.8, clear_height: 0.5, corner_a: 0.1, corner_b: 0.1 }), ['fail', 'e', 'too_narrow', 0.9, 0.8]);
  assert.deepEqual(record({ clear_height: 0.5, corner_a: 0.1, corner_b: 0.1 }), ['fail', 'e', 'too_low', 1.0, 0.5]);
  assert.deepEqual(record({ clear_width: 0.9, clear_height: 1.0, corner_a: 0.1, corner_b: 0.1 }), ['fail', 'e', 'cannot_turn', 2.2, 0]);
});

test('corner_turn uses door, opening, ramp, step, stair and elevator, never shaft', () => {
  assert.deepEqual([...CORNER_TURN.kinds].sort(), ['door', 'elevator', 'opening', 'ramp', 'stair', 'step']);
  assert.equal(record({ kind: 'shaft', corner_a: undefined, corner_b: undefined })[2], 'no_route');
  for (const kind of ['door', 'opening', 'ramp', 'elevator'] as const) {
    assert.equal(record({ kind, corner_a: undefined, corner_b: undefined })[0], 'pass', kind);
  }
});

test('a step does not block a sofa: only no_steps checks steps', () => {
  assert.equal(record({ kind: 'step', step_height: 0.15, corner_a: undefined, corner_b: undefined })[0], 'pass');
});

test('a stair between two levels does not block a sofa either', () => {
  const b = oneEdge({ kind: 'stair', corner_a: undefined, corner_b: undefined });
  b.levels.push({ id: 'L2', elevation: 3 });
  b.nodes[1]!.level = 'L2';
  assert.equal(walk(b, sofa(), CORNER_TURN).status, 'pass');
});

test('a sofa that does not fit the elevator car fails too_narrow at the car node', () => {
  const b = oneEdge({ kind: 'elevator', corner_a: undefined, corner_b: undefined });
  b.nodes[1] = { ...b.nodes[1]!, type: 'elevator', box: { x: 0, y: 0, width: 1.1, depth: 1.4 } };
  const r = walk(b, sofa(), CORNER_TURN);
  assert.deepEqual([r.status, r.blocked_at, r.reason, r.needed, r.available], ['fail', 'x', 'too_narrow', 2.2, 1.4]);
});

// The demo building with a sofa added in the test (P5 adds the real token and its cases).
const withSofa = (length: number): Building => ({ ...demo, tokens: [{ ...sofa(length), start: 'lobby' }] });

test('demo building: a 2.2 m sofa in the lobby cannot turn at lobby-door', () => {
  const [got] = solve(withSofa(2.2));
  assert.deepEqual({ ...got, available: undefined }, {
    token: 'sofa', status: 'fail', path: ['lobby'], blocked_at: 'lobby-door', reason: 'cannot_turn', needed: 2.2, available: undefined,
  });
  near(got!.available!, 1.997, 0.0005, 'available');
});

test('demo building: widen lobby-door to 1.6 and the 2.2 m sofa gets out to the street', () => {
  const [got] = solve(withSofa(2.2), [{ op: 'widen', target: 'lobby-door', value: 1.6, source: 'button' }]);
  assert.deepEqual(got, {
    token: 'sofa', status: 'pass', path: ['lobby', 'corridor', 'street'], blocked_at: null, reason: null, needed: null, available: null,
  });
});

test('demo building: glass cannot turn at lobby-door (L_max about 3.71 < 4.0), and passes after widen 1.6', () => {
  const glass = (edits: Parameters<typeof solve>[1]) => solve(demo, edits).find((r) => r.token === 'glass')!;
  const base = glass([]);
  assert.deepEqual([base.status, base.path, base.blocked_at, base.reason, base.needed], ['fail', ['street', 'corridor'], 'lobby-door', 'cannot_turn', 4.0]);
  near(base.available!, 3.7102, 0.0005, 'available');
  const widened = glass([{ op: 'widen', target: 'lobby-door', value: 1.6, source: 'button' }]);
  assert.deepEqual([widened.status, widened.path], ['pass', ['street', 'corridor', 'lobby']]);
});
