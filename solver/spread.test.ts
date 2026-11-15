// P1-09: rule `spread` (smoke) and the people-smoke race (`smoke_first`).
// TEST FIXTURES: data/ has no smoke token and no people token yet (P5 owns data/). These small
// buildings stand in until P5's smoke and people cases land; solver.test.ts then checks those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPREAD_KINDS, smokeArrival, spread } from './spread.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import { validate } from '../contract/validate.ts';
import { EDGE_KINDS } from '../contract/types.ts';
import type { Building, BuildingNode, Edge, Edit, SolverResult, Token } from '../contract/types.ts';

const smoke = (start: string, id = 'smoke'): Token => ({
  id, discipline: 'fire', start, goal: null, size: { width: 0, height: 0, length: 0 }, rule: 'spread',
});
const people = (start = 's'): Token => ({
  id: 'people', discipline: 'life_safety', start, goal: null,
  size: { width: 0.6, height: 2.0, length: 0.6 }, rule: 'shortest_exit',
});
const box = { x: 0, y: 0, width: 2, depth: 2 };
const node = (id: string, is_exit = false, level = 'L1'): BuildingNode => ({ id, name: id, level, type: is_exit ? 'street' : 'room', box, is_exit });
const edge = (id: string, from: string, to: string, e: Partial<Edge> = {}): Edge => ({
  id, name: id, from, to, kind: 'door', clear_width: 1, clear_height: 2.4, step_height: 0, ...e,
});
const levels = [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 3 }];
const building = (nodes: BuildingNode[], edges: Edge[], tokens: Token[]): Building => ({ levels, nodes, edges, members: [], tokens });

const byToken = (results: SolverResult[], id: string): SolverResult => {
  const r = results.find((x) => x.token === id);
  assert.ok(r, `no result for ${id}`);
  return r;
};
const record = (r: SolverResult) => [r.status, r.path, r.blocked_at, r.reason, r.needed, r.available, r.time];
const closeDoor = (target: string): Edit => ({ op: 'close_door', target, value: null, source: 'button' });

// ---------- smoke's own record ----------

test('spread is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('spread'));
});

test('smoke uses every edge kind except drain_route and supply', () => {
  assert.deepEqual([...SPREAD_KINDS].sort(), EDGE_KINDS.filter((k) => k !== 'drain_route' && k !== 'supply').sort());
  for (const kind of EDGE_KINDS) {
    const b = building([node('s'), node('a', false, 'L2')], [edge('e', 's', 'a', { kind })], [smoke('s')]);
    const want = kind === 'drain_route' || kind === 'supply' ? ['s'] : ['s', 'a'];
    assert.deepEqual(spread(b, smoke('s')).path, want, kind);
  }
});

test('an edge without `open` is open; open: false stops smoke; close_door sets it', () => {
  const b = (e: Partial<Edge>) => building([node('s'), node('a')], [edge('e', 's', 'a', e)], [smoke('s')]);
  assert.deepEqual(spread(b({}), smoke('s')).path, ['s', 'a']);
  assert.deepEqual(spread(b({ open: true }), smoke('s')).path, ['s', 'a']);
  assert.deepEqual(spread(b({ open: false }), smoke('s')).path, ['s']);
  assert.deepEqual(byToken(solve(b({}), [closeDoor('e')]), 'smoke').path, ['s']);
  // Two edges between the same rooms: one open edge is enough.
  const twin = b({ open: false });
  twin.edges.push(edge('e2', 's', 'a'));
  assert.deepEqual(spread(twin, smoke('s')).path, ['s', 'a']);
});

test('smoke has no width, height, step or car check', () => {
  const b = building(
    [node('s'), node('a'), { ...node('car'), type: 'elevator', box: { x: 0, y: 0, width: 0.1, depth: 0.1 } }],
    [edge('e1', 's', 'a', { clear_width: 0.01, clear_height: 0.01, step_height: 0.5, kind: 'step' }), edge('e2', 'a', 'car', { kind: 'elevator' })],
    [smoke('s')],
  );
  assert.deepEqual(spread(b, smoke('s')).path, ['s', 'a', 'car']);
});

test('pass: one open edge per time step, path in the order reached, time = steps to the last node', () => {
  // s - a - b: a at step 1, b at step 2.
  const chain = building([node('s'), node('a'), node('b')], [edge('e1', 's', 'a'), edge('e2', 'a', 'b')], [smoke('s')]);
  assert.deepEqual(record(spread(chain, smoke('s'))), ['pass', ['s', 'a', 'b'], null, null, null, null, 2]);
  // Inside one step, nodes go in node id order: s reaches b and a at step 1, then a reaches z
  // and b reaches c at step 2. Order: s, a, b, c, z.
  const fan = building(
    [node('s'), node('z'), node('c'), node('b'), node('a')],
    [edge('e1', 's', 'b'), edge('e2', 's', 'a'), edge('e3', 'a', 'z'), edge('e4', 'b', 'c')],
    [smoke('s')],
  );
  assert.deepEqual(record(spread(fan, smoke('s'))), ['pass', ['s', 'a', 'b', 'c', 'z'], null, null, null, null, 2]);
});

test('edges are two-way for smoke, and smoke does not stop at an exit', () => {
  // The edge runs from a to s, and x is an exit in the middle of the chain.
  const b = building([node('s'), node('x', true), node('a')], [edge('e1', 'x', 's'), edge('e2', 'a', 'x')], [smoke('s')]);
  assert.deepEqual(record(spread(b, smoke('s'))), ['pass', ['s', 'x', 'a'], null, null, null, null, 2]);
});

test('smoke with no open edge stays at its start, time 0; a start that is not a node is no_route', () => {
  const alone = building([node('s'), node('a')], [edge('e', 's', 'a', { open: false })], [smoke('s')]);
  assert.deepEqual(record(spread(alone, smoke('s'))), ['pass', ['s'], null, null, null, null, 0]);
  assert.deepEqual(record(spread(alone, smoke('nowhere'))), ['fail', [], null, 'no_route', null, null, null]);
});

test('smokeArrival: the earliest step over every smoke token; other tokens are ignored', () => {
  // f1 - a - b - c - f2: smoke from both ends. b is 2 steps from either; c is 1 from f2.
  const b = building(
    [node('f1'), node('a'), node('b'), node('c'), node('f2')],
    [edge('e1', 'f1', 'a'), edge('e2', 'a', 'b'), edge('e3', 'b', 'c'), edge('e4', 'c', 'f2')],
    [smoke('f1', 'smoke1'), smoke('f2', 'smoke2'), people('a')],
  );
  assert.deepEqual(Object.fromEntries(smokeArrival(b)), { f1: 0, a: 1, b: 2, c: 1, f2: 0 });
  assert.deepEqual(Object.fromEntries(smokeArrival({ ...b, tokens: [people('a')] })), {});
});

// ---------- the race: people against smoke ----------

// People: s - a - x (x is the exit), so a at step 1 and x at step 2.
// Smoke starts at f and reaches a through `fa` after `smokeEdges` edges.
function race(smokeEdges: number, extra: Partial<Building> = {}): Building {
  const chain = Array.from({ length: smokeEdges - 1 }, (_, i) => node(`f${i + 1}`));
  const ids = ['f', ...chain.map((n) => n.id), 'a'];
  const smokeChain = ids.slice(1).map((to, i) => edge(`fa${i}`, ids[i]!, to));
  return {
    ...building(
      [node('s'), node('a'), node('x', true), node('f'), ...chain],
      [edge('sa', 's', 'a'), edge('ax', 'a', 'x'), ...smokeChain],
      [people('s'), smoke('f')],
    ),
    ...extra,
  };
}

test('a tie goes to smoke: smoke_first at the node, path up to the node before it', () => {
  // Smoke reaches a at step 1; people reach a at step 1.
  const r = byToken(solve(race(1)), 'people');
  assert.deepEqual(record(r), ['fail', ['s'], 'a', 'smoke_first', 1, 1, null]);
});

test('smoke one step later than the people: people pass', () => {
  // Smoke: f - f1 - a, so a at step 2 (people at step 1) and x at step 3 (people at step 2).
  assert.deepEqual(record(byToken(solve(race(2)), 'people')), ['pass', ['s', 'a', 'x'], null, null, null, null, 2]);
});

test('smoke earlier than the people: needed = people step, available = smoke step', () => {
  // Smoke starts in a: step 0, people at step 1.
  const b = race(1);
  b.tokens = [people('s'), smoke('a')];
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s'], 'a', 'smoke_first', 1, 0, null]);
});

test('smoke at the exit on the same step: smoke_first at the exit', () => {
  // Smoke: f - f1 - x, so x at step 2; people reach x at step 2. a (step 3 for smoke) is safe.
  const b = building(
    [node('s'), node('a'), node('x', true), node('f'), node('f1')],
    [edge('sa', 's', 'a'), edge('ax', 'a', 'x'), edge('ff1', 'f', 'f1'), edge('f1x', 'f1', 'x')],
    [people('s'), smoke('f')],
  );
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s', 'a'], 'x', 'smoke_first', 2, 2, null]);
});

test('smoke in the people start room: smoke_first at the start, empty path', () => {
  const b = race(1);
  b.tokens = [people('s'), smoke('s')];
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', [], 's', 'smoke_first', 0, 0, null]);
});

test('closing the door smoke comes through lets the people out', () => {
  assert.equal(byToken(solve(race(1)), 'people').status, 'fail');
  const r = byToken(solve(race(1), [closeDoor('fa0')]), 'people');
  assert.deepEqual(record(r), ['pass', ['s', 'a', 'x'], null, null, null, null, 2]);
  // close_door does not change the people's own search: they still walk the closed door.
  const own = race(1);
  own.tokens = [people('s')];
  assert.equal(byToken(solve(own, [closeDoor('sa')]), 'people').status, 'pass');
});

test('people keep their shortest path; they do not route round the smoke', () => {
  // A longer smoke-free route s - b - c - x exists, but people race on s - a - x.
  const b = race(1);
  b.nodes.push(node('b'), node('c'));
  b.edges.push(edge('sb', 's', 'b'), edge('bc', 'b', 'c'), edge('cx', 'c', 'x'));
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s'], 'a', 'smoke_first', 1, 1, null]);
});

test('smoke rises through a shaft or an elevator that people cannot use', () => {
  // f is on L2; its only way to a is a shaft, then an elevator edge for the second case.
  for (const kind of ['shaft', 'elevator'] as const) {
    const b = race(1);
    b.nodes = b.nodes.map((n) => (n.id === 'f' ? { ...n, level: 'L2' } : n));
    b.edges = b.edges.map((e) => (e.id === 'fa0' ? { ...e, kind } : e));
    assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s'], 'a', 'smoke_first', 1, 1, null], kind);
  }
});

test('the race also runs on a people fail path: smoke before the block wins', () => {
  // People are too narrow at ax, and smoke reaches a (on the walked path) at step 1.
  const b = race(1);
  b.edges = b.edges.map((e) => (e.id === 'ax' ? { ...e, clear_width: 0.5 } : e));
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s'], 'a', 'smoke_first', 1, 1, null]);
  // Smoke that reaches only the far side of the block does not change the too_narrow record.
  // Smoke starts at the exit x, and ax is closed, so the smoke stays at x.
  b.edges = b.edges.map((e) => (e.id === 'ax' ? { ...e, open: false } : e));
  b.tokens = [people('s'), smoke('x')];
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s', 'a'], 'ax', 'too_narrow', 0.6, 0.5, null]);
});

test('smoke that never reaches the people path changes nothing', () => {
  const b = race(1);
  b.edges = b.edges.map((e) => (e.id === 'fa0' ? { ...e, open: false } : e));
  assert.deepEqual(record(byToken(solve(b), 'people')), ['pass', ['s', 'a', 'x'], null, null, null, null, 2]);
});

test('the race takes the earliest of two smoke tokens, and skips a smoke token that is not on a node', () => {
  // smoke1 reaches a at step 2 (too late); smoke2 starts next to a and reaches it at step 1 (a tie).
  const b = race(2);
  b.nodes.push(node('g'));
  b.edges.push(edge('ga', 'g', 'a'));
  b.tokens = [people('s'), smoke('f', 'smoke1'), smoke('g', 'smoke2')];
  assert.deepEqual(record(byToken(solve(b), 'people')), ['fail', ['s'], 'a', 'smoke_first', 1, 1, null]);
  // A smoke token whose start is not a node gets no_route and races nobody.
  b.tokens = [people('s'), smoke('nowhere', 'smoke1')];
  const results = solve(b);
  assert.deepEqual(record(byToken(results, 'people')), ['pass', ['s', 'a', 'x'], null, null, null, null, 2]);
  assert.equal(byToken(results, 'smoke1').reason, 'no_route');
});

test('the records do not depend on the order of nodes, edges or tokens in the data', () => {
  const b = race(1);
  b.nodes.push(node('b'), node('c'));
  b.edges.push(edge('sb', 's', 'b'), edge('bc', 'b', 'c'), edge('cx', 'c', 'x'), edge('fb', 'f', 'b'));
  const sorted = (rs: SolverResult[]) => [...rs].sort((p, q) => (p.token < q.token ? -1 : 1));
  const want = sorted(solve(b));
  const flipped = { ...b, nodes: [...b.nodes].reverse(), edges: [...b.edges].reverse(), tokens: [...b.tokens].reverse() };
  assert.deepEqual(sorted(solve(flipped)), want);
});

test('solve with smoke and people: schema-valid, deterministic, smoke record untouched by the race', () => {
  const b = race(1);
  const results = solve(b);
  assert.deepEqual(validate('solver-output.schema.json', results), []);
  assert.deepEqual(solve(b), results);
  assert.deepEqual(record(byToken(results, 'smoke')), ['pass', ['f', 'a', 's', 'x'], null, null, null, null, 2]);
});
