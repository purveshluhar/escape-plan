import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carCheck, heightCheck, walk, widthCheck } from './search.ts';
import type { WalkRule } from './search.ts';
import type { Building, BuildingNode, Edge, EdgeKind, NodeType, Token } from '../contract/types.ts';

// A tiny synthetic building: every node on L1, every node a 2 x 2 room unless set.
function node(id: string, extra: Partial<BuildingNode> = {}): BuildingNode {
  return { id, name: id, level: 'L1', type: 'room', box: { x: 0, y: 0, width: 2, depth: 2 }, is_exit: false, ...extra };
}
function edge(id: string, from: string, to: string, extra: Partial<Edge> = {}): Edge {
  return { id, name: id, from, to, kind: 'door', clear_width: 1, clear_height: 2.4, step_height: 0, ...extra };
}
function token(extra: Partial<Token> = {}): Token {
  return { id: 't', discipline: 'logistics', start: 's', goal: null, size: { width: 0.7, height: 1.3, length: 1.2 }, rule: 'clearance', ...extra };
}
function building(nodes: BuildingNode[], edges: Edge[], tokens: Token[] = []): Building {
  return { levels: [{ id: 'L1', elevation: 0 }], nodes, edges, members: [], tokens };
}
const exit = (id: string) => node(id, { is_exit: true });
const RULE: WalkRule = { kinds: ['door', 'opening', 'elevator'], checks: [widthCheck, heightCheck] };
const PASS_FIELDS = { blocked_at: null, reason: null, needed: null, available: null };

test('elevator car: a 0.7 x 1.2 wheelchair rides a 1.0 x 1.4 car, a 0.9 x 2.2 sofa does not', () => {
  const car = node('car', { type: 'elevator' satisfies NodeType, box: { x: 0, y: 0, width: 1.0, depth: 1.4 } });
  const b = building([node('s'), car, exit('x')], [edge('in', 's', 'car', { kind: 'elevator' }), edge('out', 'car', 'x')]);
  const wheelchair = walk(b, token({ size: { width: 0.7, height: 1.3, length: 1.2 } }), RULE);
  assert.deepEqual(wheelchair, { token: 't', status: 'pass', path: ['s', 'car', 'x'], ...PASS_FIELDS });
  const sofa = walk(b, token({ size: { width: 0.9, height: 1.0, length: 2.2 } }), RULE);
  assert.deepEqual(sofa, {
    token: 't', status: 'fail', path: ['s'], blocked_at: 'car', reason: 'too_narrow', needed: 2.2, available: 1.4,
  });
});

test('elevator car: when the edge into the car fails too, the edge is the first block', () => {
  const car = node('car', { type: 'elevator', box: { x: 0, y: 0, width: 0.5, depth: 0.5 } });
  const b = building([node('s'), car, exit('x')], [edge('in', 's', 'car', { kind: 'elevator', clear_width: 0.1 }), edge('out', 'car', 'x')]);
  const got = walk(b, token(), RULE);
  assert.deepEqual([got.blocked_at, got.reason, got.needed, got.available, got.path], ['in', 'too_narrow', 0.7, 0.1, ['s']]);
});

test('elevator car: a token turned 90 degrees fits, and an exact fit rides', () => {
  const car = node('car', { type: 'elevator', box: { x: 0, y: 0, width: 1.0, depth: 1.4 } });
  assert.equal(carCheck(car, token({ size: { width: 1.3, height: 1, length: 0.9 } })), null);
  assert.equal(carCheck(car, token({ size: { width: 1.0, height: 1, length: 1.4 } })), null);
  assert.deepEqual(carCheck(car, token({ size: { width: 1.5, height: 1, length: 0.5 } })), {
    at: 'car', reason: 'too_narrow', needed: 1.5, available: 1.0,
  });
  assert.equal(carCheck(node('room'), token({ size: { width: 9, height: 9, length: 9 } })), null);
});

test('goal null goes to the nearest exit; a tie goes to the lower node id where the paths first differ', () => {
  const b = building(
    [node('s'), node('a'), exit('far'), exit('y'), exit('z'), node('b')],
    [edge('e1', 's', 'b'), edge('e2', 's', 'a'), edge('e3', 'a', 'z'), edge('e4', 'b', 'y'), edge('e5', 's', 'far', { kind: 'opening' }), edge('e6', 'far', 'z')],
  );
  // `far` is one edge away, so it wins over y and z (two edges away).
  assert.deepEqual(walk(b, token(), RULE).path, ['s', 'far']);
  const noFar = building(b.nodes, b.edges.filter((e) => e.id !== 'e5'));
  // y (via b) and z (via a) are both two edges away. The paths first differ at a and b: a wins.
  assert.deepEqual(walk(noFar, token(), RULE).path, ['s', 'a', 'z']);
});

test('a tie below the first step also goes to the lower node id where the paths first differ', () => {
  const nodes = [node('s'), node('a'), node('b'), node('c'), node('d'), exit('g')];
  const edges = [edge('1', 's', 'a'), edge('2', 's', 'b'), edge('3', 'a', 'd'), edge('4', 'b', 'c'), edge('5', 'd', 'g'), edge('6', 'c', 'g')];
  assert.deepEqual(walk(building(nodes, edges), token(), RULE).path, ['s', 'a', 'd', 'g']);
  // The checks-off path of a fail follows the same rule.
  const narrow = edges.map((e) => (e.id === '5' || e.id === '6' ? { ...e, clear_width: 0.1 } : e));
  const got = walk(building(nodes, narrow), token(), RULE);
  assert.deepEqual([got.blocked_at, got.path], ['5', ['s', 'a', 'd']]);
});

test('ids that are not in the building: no path through them', () => {
  // A start that is not a node: no_route with an empty path, like an unsolved token.
  const ghostStart = walk(building([exit('x')], []), token({ start: 'ghost' }), RULE);
  assert.deepEqual([ghostStart.reason, ghostStart.path], ['no_route', []]);
  // An edge to a node that does not exist is left out, so a goal there is never reached.
  const ghostGoal = walk(building([node('s')], [edge('e', 's', 'ghost')]), token({ goal: 'ghost' }), RULE);
  assert.deepEqual([ghostGoal.status, ghostGoal.reason, ghostGoal.path], ['fail', 'no_route', ['s']]);
});

test('a set goal is reached even when an exit is nearer; neighbours go in node id order', () => {
  const b = building(
    [node('s'), node('b'), node('a'), node('g'), exit('x')],
    [edge('e1', 's', 'b'), edge('e2', 'b', 'g'), edge('e3', 'g', 'a'), edge('e4', 'a', 's'), edge('e5', 's', 'x')],
  );
  assert.deepEqual(walk(b, token({ goal: 'g' }), RULE).path, ['s', 'a', 'g']);
});

test('edges are two-way', () => {
  const b = building([node('s'), exit('x')], [edge('e', 'x', 's')]);
  assert.equal(walk(b, token(), RULE).status, 'pass');
});

test('a start that is an exit passes with a one-node path', () => {
  const b = building([exit('s')], []);
  assert.deepEqual(walk(b, token(), RULE), { token: 't', status: 'pass', path: ['s'], ...PASS_FIELDS });
});

test('no route at all: no_route, blocked_at null, path is the start', () => {
  const b = building([node('s'), exit('x')], []);
  assert.deepEqual(walk(b, token(), RULE), {
    token: 't', status: 'fail', path: ['s'], blocked_at: null, reason: 'no_route', needed: null, available: null,
  });
});

test('an edge kind outside the rule is never used, even with the checks off', () => {
  const kinds: EdgeKind[] = ['shaft', 'drain_route', 'supply'];
  for (const kind of kinds) {
    const b = building([node('s'), exit('x')], [edge('e', 's', 'x', { kind })]);
    assert.equal(walk(b, token(), RULE).reason, 'no_route', kind);
  }
});

test('width and height: equal passes, less fails with needed and available', () => {
  const one = (e: Partial<Edge>) => building([node('s'), exit('x')], [edge('e', 's', 'x', e)]);
  assert.equal(walk(one({ clear_width: 0.7, clear_height: 1.3 }), token(), RULE).status, 'pass');
  assert.deepEqual(walk(one({ clear_width: 0.6 }), token(), RULE), {
    token: 't', status: 'fail', path: ['s'], blocked_at: 'e', reason: 'too_narrow', needed: 0.7, available: 0.6,
  });
  const low = walk(one({ clear_height: 1.2 }), token(), RULE);
  assert.deepEqual([low.reason, low.needed, low.available], ['too_low', 1.3, 1.2]);
  // Check order: width before height.
  assert.equal(walk(one({ clear_width: 0.1, clear_height: 0.1 }), token(), RULE).reason, 'too_narrow');
});

test('a blocked shortest path takes the longer way round when one passes', () => {
  const b = building(
    [node('s'), node('a'), node('b'), exit('x')],
    [edge('narrow', 's', 'x', { clear_width: 0.5 }), edge('e1', 's', 'a'), edge('e2', 'a', 'b'), edge('e3', 'b', 'x')],
  );
  assert.deepEqual(walk(b, token(), RULE).path, ['s', 'a', 'b', 'x']);
});

test('fail: the first failing edge on the checks-off shortest path, path up to the node before', () => {
  const b = building(
    [node('s'), node('a'), node('b'), exit('x')],
    [edge('e1', 's', 'a'), edge('e2', 'a', 'b', { clear_height: 1 }), edge('e3', 'b', 'x', { clear_width: 0.5 }), edge('long', 's', 'x', { kind: 'shaft' })],
  );
  assert.deepEqual(walk(b, token(), RULE), {
    token: 't', status: 'fail', path: ['s', 'a'], blocked_at: 'e2', reason: 'too_low', needed: 1.3, available: 1,
  });
});

test('two edges between the same nodes: one that passes is enough', () => {
  const b = building([node('s'), exit('x')], [edge('a-narrow', 's', 'x', { clear_width: 0.2 }), edge('b-wide', 'x', 's')]);
  assert.equal(walk(b, token(), RULE).status, 'pass');
  const both = building([node('s'), exit('x')], [edge('b-low', 's', 'x', { clear_height: 1 }), edge('a-narrow', 's', 'x', { clear_width: 0.2 })]);
  // Neither passes: report the lower edge id.
  assert.equal(walk(both, token(), RULE).blocked_at, 'a-narrow');
});

test('walk does not change the building', () => {
  const b = building([node('s'), exit('x')], [edge('e', 's', 'x', { clear_width: 0.1 })]);
  const before = JSON.stringify(b);
  walk(b, token(), RULE);
  assert.equal(JSON.stringify(b), before);
});
