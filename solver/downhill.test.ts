import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOPE_NEEDED, downhill } from './downhill.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import { validate } from '../contract/validate.ts';
import type { Building, BuildingNode, Edge, Member, SolverResult, Token } from '../contract/types.ts';

// Fixture until P5 adds a water token, drain_route edges and inverts to data/.
// sink (centre 1,1) -> trap (centre 5,1) -> sewer (centre 5,5, the exit). Each run is 4 m in plan.
// drain-1 falls 0.30 -> 0.26: 0.04 / 4 = exactly 1 %. drain-2 falls 0.26 -> 0.10: 4 %, and
// crosses beam b1 with no sleeve.
const water: Token = {
  id: 'water', discipline: 'plumbing', start: 'sink', goal: null,
  size: { width: 0.1, height: 0.1, length: 0.1 }, rule: 'downhill',
};
const node = (id: string, x: number, y: number, invert: number | undefined, more: Partial<BuildingNode> = {}): BuildingNode => {
  const n: BuildingNode = { id, name: id, level: 'L1', type: 'corridor', box: { x, y, width: 2, depth: 2 }, is_exit: false, ...more };
  if (invert !== undefined) n.invert = invert;
  return n;
};
const drain = (id: string, from: string, to: string, e: Partial<Edge> = {}): Edge => ({
  id, name: id, from, to, kind: 'drain_route', clear_width: 0.1, clear_height: 0.1, step_height: 0, ...e,
});
const sink = (invert = 0.30) => node('sink', 0, 0, invert, { type: 'kitchen' });
const trap = (invert = 0.26) => node('trap', 4, 0, invert);
const sewer = (invert = 0.10) => node('sewer', 4, 4, invert, { type: 'street', is_exit: true });
function plumbing(
  nodes: BuildingNode[] = [sink(), trap(), sewer()],
  edges: Edge[] = [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer', { crosses: ['b1'] })],
  members: Member[] = [{ id: 'b1', kind: 'beam', level: 'L1', supported_by: ['c1'] }, { id: 'c1', kind: 'column', level: 'L1', supported_by: ['f1'] }, { id: 'f1', kind: 'foundation', level: 'L1', supported_by: [] }],
  token: Token = water,
): Building {
  return { levels: [{ id: 'L1', elevation: 0 }, { id: 'L0', elevation: -3 }], nodes, edges, members, tokens: [token] };
}
const record = (r: SolverResult) => [r.status, r.path, r.blocked_at, r.reason, r.needed, r.available];
const sleeve = { op: 'add_sleeve', target: 'drain-2', value: null, source: 'button' } as const;
const PASS = ['pass', ['sink', 'trap', 'sewer'], null, null, null, null];

test('downhill is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('downhill'));
});

test('base: drain-2 crosses beam b1 with no sleeve, so the water fails crosses_beam there', () => {
  const r = solve(plumbing())[0]!;
  assert.deepEqual(record(r), ['fail', ['sink', 'trap'], 'drain-2', 'crosses_beam', null, null]);
  assert.deepEqual(validate('solver-output.schema.json', [r]), []);
});

test('add_sleeve on drain-2: the water reaches the sewer', () => {
  const r = solve(plumbing(), [sleeve])[0]!;
  assert.deepEqual(record(r), PASS);
  assert.deepEqual(validate('solver-output.schema.json', [r]), []);
});

test('a fall of exactly 1 % passes (0.30 to 0.26 over 4 m)', () => {
  assert.equal(SLOPE_NEEDED, 0.01);
  assert.equal(downhill(plumbing(undefined, [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), water).status, 'pass');
});

test('under 1 % fails uphill at the edge: needed 0.01, available the slope', () => {
  const r = downhill(plumbing([sink(), trap(0.28), sewer()], [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), water);
  assert.deepEqual(record(r).slice(0, 5), ['fail', ['sink'], 'drain-1', 'uphill', 0.01]);
  assert.ok(Math.abs(r.available! - 0.005) < 1e-12, `available ${r.available}`);
});

test('a drain that rises gives a negative available slope', () => {
  const r = downhill(plumbing([sink(), trap(0.34), sewer()], [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), water);
  assert.deepEqual(record(r).slice(0, 4), ['fail', ['sink'], 'drain-1', 'uphill']);
  assert.ok(Math.abs(r.available! + 0.01) < 1e-12, `available ${r.available}`);
});

test('slope length is the plan distance between box centres, not along x only', () => {
  // sink (1,1) -> far (4,5): 3-4-5 triangle, 5 m. Fall 0.05 = 1 % passes; fall 0.04 = 0.8 % fails.
  const far = (invert: number) => node('far', 3, 4, invert, { is_exit: true });
  assert.equal(downhill(plumbing([sink(), far(0.25)], [drain('d', 'sink', 'far')]), water).status, 'pass');
  const r = downhill(plumbing([sink(), far(0.26)], [drain('d', 'sink', 'far')]), water);
  assert.equal(r.reason, 'uphill');
  assert.ok(Math.abs(r.available! - 0.008) < 1e-12, `available ${r.available}`);
});

test('a vertical drop (same plan centre) passes when it falls, and fails uphill with available 0 when it does not', () => {
  const below = (invert: number) => node('below', 0, 0, invert, { level: 'L0', type: 'shaft', is_exit: true });
  assert.equal(downhill(plumbing([sink(), below(-2.5)], [drain('riser', 'sink', 'below')]), water).status, 'pass');
  for (const invert of [0.30, 0.5]) {
    const r = downhill(plumbing([sink(), below(invert)], [drain('riser', 'sink', 'below')]), water);
    assert.deepEqual(record(r), ['fail', ['sink'], 'riser', 'uphill', 0.01, 0]);
  }
});

test('a transfer_beam blocks like a beam; a column, a foundation or an unknown member id does not', () => {
  const edges = (crosses: string[]) => [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer', { crosses })];
  const members: Member[] = [
    { id: 'tb', kind: 'transfer_beam', level: 'L1', supported_by: ['c1'] },
    { id: 'c1', kind: 'column', level: 'L1', supported_by: ['f1'] },
    { id: 'f1', kind: 'foundation', level: 'L1', supported_by: [] },
  ];
  assert.equal(downhill(plumbing(undefined, edges(['tb']), members), water).reason, 'crosses_beam');
  assert.equal(downhill(plumbing(undefined, edges(['c1', 'f1', 'nope']), members), water).status, 'pass');
});

test('add_transfer_beam on the crossed beam: the water still fails crosses_beam', () => {
  const r = solve(plumbing(), [{ op: 'add_transfer_beam', target: 'b1', value: null, source: 'button' }])[0]!;
  assert.deepEqual(record(r), ['fail', ['sink', 'trap'], 'drain-2', 'crosses_beam', null, null]);
});

test('sleeved: true on the edge in the data passes the beam too', () => {
  const r = downhill(plumbing(undefined, [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer', { crosses: ['b1'], sleeved: true })]), water);
  assert.deepEqual(record(r), PASS);
});

test('check order at one edge: uphill before crosses_beam', () => {
  const r = downhill(plumbing([sink(), trap(), sewer(0.30)]), water);
  assert.deepEqual(record(r).slice(0, 4), ['fail', ['sink', 'trap'], 'drain-2', 'uphill']);
});

test('drain_route edges run only from `from` to `to`', () => {
  // The same pipes drawn backwards: the water cannot use them.
  const r = downhill(plumbing(undefined, [drain('drain-1', 'trap', 'sink'), drain('drain-2', 'sewer', 'trap')]), water);
  assert.deepEqual(record(r), ['fail', ['sink'], null, 'no_route', null, null]);
});

test('the water uses only drain_route edges', () => {
  const door: Edge = { id: 'door', name: 'door', from: 'sink', to: 'sewer', kind: 'door', clear_width: 1, clear_height: 2.1, step_height: 0 };
  const supply: Edge = { ...door, id: 'supply', kind: 'supply' };
  const r = downhill(plumbing(undefined, [door, supply]), water);
  assert.deepEqual(record(r), ['fail', ['sink'], null, 'no_route', null, null]);
});

test('a drain edge with an end that has no invert is left out', () => {
  const r = downhill(plumbing([sink(), node('trap', 4, 0, undefined), sewer()], [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), water);
  assert.deepEqual(record(r), ['fail', ['sink'], null, 'no_route', null, null]);
});

test('an invert that is not a finite number leaves the edge out', () => {
  for (const bad of [NaN, null, Infinity, '0.2']) {
    const odd = { ...trap(), invert: bad as unknown as number };
    const r = downhill(plumbing([sink(), odd, sewer()], [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), water);
    assert.deepEqual(record(r), ['fail', ['sink'], null, 'no_route', null, null], `invert ${String(bad)}`);
  }
});

test('available is rounded to 1e-9, so float noise does not show', () => {
  const r = downhill(plumbing([sink(), trap(0.28), sewer()], [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), water);
  assert.equal(r.available, 0.005);
});

test('centres under 1 micrometre apart count as a vertical drop', () => {
  const near = (invert: number) => node('near', 1e-8, 0, invert, { level: 'L0', type: 'shaft', is_exit: true });
  assert.equal(downhill(plumbing([sink(), near(0.29)], [drain('riser', 'sink', 'near')]), water).status, 'pass');
  assert.deepEqual(record(downhill(plumbing([sink(), near(0.31)], [drain('riser', 'sink', 'near')]), water)), ['fail', ['sink'], 'riser', 'uphill', 0.01, 0]);
});

test('many parallel drains between two nodes still solve inside 100 ms', () => {
  const edges = [drain('drain-1', 'sink', 'trap'), ...Array.from({ length: 20000 }, (_, i) => drain(`p${String(i).padStart(5, '0')}`, 'trap', 'sewer', { crosses: ['b1'] }))];
  const b = plumbing(undefined, edges);
  const t0 = performance.now();
  assert.equal(downhill(b, water).blocked_at, 'p00000');
  assert.ok(performance.now() - t0 < 100, `took ${performance.now() - t0} ms`);
});

test('fewest edges wins; a failing short route gives way to a longer one that passes', () => {
  // direct: sink (1,1) -> sewer (5,5), 0.20 over 5.66 m, about 3.5 %.
  const edges = (direct: Partial<Edge>, two: Partial<Edge> = {}) =>
    [drain('direct', 'sink', 'sewer', direct), drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer', two)];
  assert.deepEqual(record(downhill(plumbing(undefined, edges({})), water)), ['pass', ['sink', 'sewer'], null, null, null, null]);
  assert.deepEqual(record(downhill(plumbing(undefined, edges({ crosses: ['b1'] })), water)), PASS);
  // Both routes blocked: the block is the first one on the shortest unchecked path.
  const r = downhill(plumbing(undefined, edges({ crosses: ['b1'] }, { crosses: ['b1'] })), water);
  assert.deepEqual(record(r), ['fail', ['sink'], 'direct', 'crosses_beam', null, null]);
});

test('parallel drains: one that passes is enough; with none, the lowest edge id reports', () => {
  const pair = (a: Partial<Edge>, b: Partial<Edge>) => [drain('drain-1', 'sink', 'trap'), drain('drain-2a', 'trap', 'sewer', a), drain('drain-2b', 'trap', 'sewer', b)];
  assert.equal(downhill(plumbing(undefined, pair({ crosses: ['b1'] }, {})), water).status, 'pass');
  const r = downhill(plumbing(undefined, pair({ crosses: ['b1'] }, { crosses: ['b1'] })), water);
  assert.deepEqual(record(r).slice(0, 3), ['fail', ['sink', 'trap'], 'drain-2a']);
});

test('ties between routes of equal length go to the lower node id', () => {
  const nodes = [sink(), node('a', 4, 0, 0.2), node('b', 0, 4, 0.2), sewer(0.05)];
  const edges = [drain('e1', 'sink', 'b'), drain('e2', 'sink', 'a'), drain('e3', 'b', 'sewer'), drain('e4', 'a', 'sewer')];
  assert.deepEqual(downhill(plumbing(nodes, edges), water).path, ['sink', 'a', 'sewer']);
});

test('a set goal: the water stops at that node, not at the nearest exit', () => {
  const r = downhill(plumbing(undefined, [drain('drain-1', 'sink', 'trap'), drain('drain-2', 'trap', 'sewer')]), { ...water, goal: 'trap' });
  assert.deepEqual(record(r), ['pass', ['sink', 'trap'], null, null, null, null]);
});

test('a start that is not a node: no_route with an empty path', () => {
  assert.deepEqual(record(downhill(plumbing(), { ...water, start: 'nowhere' })), ['fail', [], null, 'no_route', null, null]);
});

test('downhill does not change the building and gives the same answer twice', () => {
  const b = plumbing();
  const before = JSON.stringify(b);
  assert.deepEqual(downhill(b, water), downhill(b, water));
  assert.equal(JSON.stringify(b), before);
});
