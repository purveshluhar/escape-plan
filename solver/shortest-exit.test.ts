import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHORTEST_EXIT, shortestExit } from './shortest-exit.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import { validate } from '../contract/validate.ts';
import type { Building, BuildingNode, Edge, Token } from '../contract/types.ts';

// The people token as the ticket gives it: id `people`, discipline `life_safety`, goal null.
// P5 picks its start and size; these fixture numbers stand in until data/ has the token.
const people: Token = {
  id: 'people', discipline: 'life_safety', start: 's', goal: null,
  size: { width: 0.6, height: 2.0, length: 0.6 }, rule: 'shortest_exit',
};
const box = { x: 0, y: 0, width: 2, depth: 2 };
const node = (id: string, is_exit = false, level = 'L1'): BuildingNode => ({ id, name: id, level, type: is_exit ? 'street' : 'room', box, is_exit });
const edge = (id: string, from: string, to: string, e: Partial<Edge> = {}): Edge => ({
  id, name: id, from, to, kind: 'door', clear_width: 1, clear_height: 2.4, step_height: 0, ...e,
});
const levels = [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 3 }];

// Start `s`, one edge to the exit `x`. A stair or ramp starts on L2; every other kind stays on L1.
function oneEdge(e: Partial<Edge>): Building {
  const startLevel = e.kind === 'stair' || e.kind === 'ramp' ? 'L2' : 'L1';
  return { levels, nodes: [node('s', false, startLevel), node('x', true)], edges: [edge('e', 's', 'x', e)], members: [], tokens: [people] };
}
const record = (b: Building) => {
  const r = shortestExit(b, people);
  return [r.status, r.path, r.blocked_at, r.reason, r.needed, r.available, r.time];
};

test('shortest_exit is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('shortest_exit'));
});

test('shortest_exit uses door, opening, ramp, step and stair, never shaft or elevator', () => {
  assert.deepEqual([...SHORTEST_EXIT.kinds].sort(), ['door', 'opening', 'ramp', 'stair', 'step']);
  for (const kind of ['door', 'opening', 'ramp', 'step', 'stair'] as const) {
    assert.deepEqual(record(oneEdge({ kind })), ['pass', ['s', 'x'], null, null, null, null, 1], kind);
  }
  for (const kind of ['shaft', 'elevator'] as const) {
    assert.deepEqual(record(oneEdge({ kind })), ['fail', ['s'], null, 'no_route', null, null, null], kind);
  }
});

test('people walk a step sill and a stair: no step check', () => {
  for (const kind of ['step', 'door', 'stair'] as const) {
    assert.equal(shortestExit(oneEdge({ kind, step_height: 0.15 }), people).status, 'pass', kind);
  }
});

test('width and height apply; equal passes', () => {
  assert.deepEqual(record(oneEdge({ clear_width: 0.5 })), ['fail', ['s'], 'e', 'too_narrow', 0.6, 0.5, null]);
  assert.deepEqual(record(oneEdge({ clear_height: 1.9 })), ['fail', ['s'], 'e', 'too_low', 2.0, 1.9, null]);
  assert.equal(shortestExit(oneEdge({ clear_width: 0.6, clear_height: 2.0 }), people).status, 'pass');
  // Too narrow and too low at once: width is checked first.
  assert.deepEqual(record(oneEdge({ clear_width: 0.5, clear_height: 1.9 })), ['fail', ['s'], 'e', 'too_narrow', 0.6, 0.5, null]);
});

test('parallel edges: one wide edge is enough; with none, the lowest edge id is named', () => {
  const b = oneEdge({ id: 'e2', clear_width: 0.5 });
  b.edges.push(edge('e1', 's', 'x', { clear_width: 0.4 }));
  assert.deepEqual(record(b), ['fail', ['s'], 'e1', 'too_narrow', 0.6, 0.4, null]);
  b.edges.push(edge('e3', 's', 'x'));
  assert.deepEqual(record(b), ['pass', ['s', 'x'], null, null, null, null, 1]);
});

test('a door into an elevator-type node: the car check applies, too_narrow at the node', () => {
  const b: Building = {
    levels, nodes: [node('s'), { ...node('car'), type: 'elevator', box: { x: 0, y: 0, width: 0.5, depth: 0.5 } }, node('x', true)],
    edges: [edge('e1', 's', 'car'), edge('e2', 'car', 'x')], members: [], tokens: [people],
  };
  assert.deepEqual(record(b), ['fail', ['s'], 'car', 'too_narrow', 0.6, 0.5, null]);
});

test('a set goal is honoured over a nearer exit', () => {
  const b: Building = {
    levels, nodes: [node('s'), node('a'), node('g'), node('x', true)],
    edges: [edge('e1', 's', 'x'), edge('e2', 's', 'a'), edge('e3', 'a', 'g')], members: [], tokens: [people],
  };
  const r = shortestExit(b, { ...people, goal: 'g' });
  assert.deepEqual([r.status, r.path, r.time], ['pass', ['s', 'a', 'g'], 2]);
});

test('pass: time is the number of edges walked', () => {
  // s - a - b - x: three edges.
  const b: Building = {
    levels, nodes: [node('s'), node('a'), node('b'), node('x', true)],
    edges: [edge('e1', 's', 'a'), edge('e2', 'a', 'b'), edge('e3', 'b', 'x')], members: [], tokens: [people],
  };
  assert.deepEqual(record(b), ['pass', ['s', 'a', 'b', 'x'], null, null, null, null, 3]);
});

test('a start that is an exit passes with time 0', () => {
  const b = oneEdge({});
  b.nodes[0]!.is_exit = true;
  assert.deepEqual(record(b), ['pass', ['s'], null, null, null, null, 0]);
});

test('people take the exit with the fewest edges; ties go to the lower node id', () => {
  // Exit y is one edge away, exit x three edges away: y wins.
  const near: Building = {
    levels, nodes: [node('s'), node('a'), node('b'), node('x', true), node('y', true)],
    edges: [edge('e1', 's', 'a'), edge('e2', 'a', 'b'), edge('e3', 'b', 'x'), edge('e4', 's', 'y')], members: [], tokens: [people],
  };
  assert.deepEqual(record(near), ['pass', ['s', 'y'], null, null, null, null, 1]);
  // Two exits, each two edges away, through `a` or `b`: the lower id `a` wins, whatever the edge order.
  const tie: Building = {
    levels, nodes: [node('s'), node('b'), node('a'), node('y', true), node('x', true)],
    edges: [edge('e1', 's', 'b'), edge('e2', 'b', 'x'), edge('e3', 's', 'a'), edge('e4', 'a', 'y')], members: [], tokens: [people],
  };
  assert.deepEqual(record(tie), ['pass', ['s', 'a', 'y'], null, null, null, null, 2]);
});

test('a narrow short route sends people the long way; time counts the long way', () => {
  const b: Building = {
    levels, nodes: [node('s'), node('a'), node('b'), node('x', true)],
    edges: [edge('short', 's', 'x', { clear_width: 0.5 }), edge('e1', 's', 'a'), edge('e2', 'a', 'b'), edge('e3', 'b', 'x')],
    members: [], tokens: [people],
  };
  assert.deepEqual(record(b), ['pass', ['s', 'a', 'b', 'x'], null, null, null, null, 3]);
});

test('fail: the first block on the checks-off shortest path, time null', () => {
  // s - a - x, and a is too low to leave: path up to a, blocked at e2.
  const b: Building = {
    levels, nodes: [node('s'), node('a'), node('x', true)],
    edges: [edge('e1', 's', 'a'), edge('e2', 'a', 'x', { clear_height: 1.8 })], members: [], tokens: [people],
  };
  assert.deepEqual(record(b), ['fail', ['s', 'a'], 'e2', 'too_low', 2.0, 1.8, null]);
  // Two blocked routes: the record names the block on the shorter one, not the longer one.
  b.nodes.push(node('c'), node('d'));
  b.edges.push(edge('e3', 's', 'c'), edge('e4', 'c', 'd'), edge('e5', 'd', 'x', { clear_width: 0.5 }));
  assert.deepEqual(record(b), ['fail', ['s', 'a'], 'e2', 'too_low', 2.0, 1.8, null]);
});

test('no exit on the level and no stair: no_route, time null', () => {
  // The L2 gap from contract review: an L2 room with only an elevator down has no route for people.
  const b: Building = {
    levels, nodes: [node('s', false, 'L2'), node('x', true)],
    edges: [edge('lift', 's', 'x', { kind: 'elevator' })], members: [], tokens: [people],
  };
  assert.deepEqual(record(b), ['fail', ['s'], null, 'no_route', null, null, null]);
});

test('solve: people get time, other tokens do not, and the output is schema-valid', () => {
  const wheelchair: Token = { ...people, id: 'wheelchair', discipline: 'accessibility', rule: 'no_steps', size: { width: 0.7, height: 1.3, length: 1.2 } };
  const b = { ...oneEdge({}), tokens: [people, wheelchair] };
  const results = solve(b);
  assert.deepEqual(validate('solver-output.schema.json', results), []);
  assert.equal(results[0]!.time, 1);
  assert.ok(!('time' in results[1]!), 'wheelchair record has no time');
  const failed = solve({ ...b, edges: [edge('e', 's', 'x', { clear_width: 0.5 })] });
  assert.deepEqual(validate('solver-output.schema.json', failed), []);
  assert.equal(failed[0]!.time, null);
});
