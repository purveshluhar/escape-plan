// P1-19, the tier 1 gate: the glass record, and LEVEL COMPLETE. solve(building, full-demo edits)
// gives pass for every tier 1 token, every tier 1 rule is implemented (so no tier 1 case is todo),
// and each demo fix is needed. LEVEL COMPLETE is the app's own check (app/scoreboard.ts).
// Tier 2 and 3 tokens are not part of this gate: their cases show as todo in solver.test.ts.
// The checks read the fixes from full-demo, so they still hold when P5 adds the sofa, people
// and their fixes to data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMPLEMENTED_RULES, applyEdits, solve } from './index.ts';
import { lMax } from './corner-turn.ts';
import { WIDEN_FIXTURE_OFFICE_DOOR, withMvpFixture } from './mvp-fixture.ts';
import { levelComplete } from '../app/scoreboard.ts';
import type { Building, Edit, ExpectedFile, Id, Rule, SolverResult } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
// A fresh parse each call, so no test sees what another test (or a bad solve) did to its input.
const freshBuilding = (): Building => read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const fullDemo = expected.cases.find((c) => c.id === 'full-demo');
const demoEdits = (): Edit[] => {
  assert.ok(fullDemo, 'expected.json has no full-demo case');
  return structuredClone(fullDemo.edits.filter((e) => e.op !== 'reset'));
};

// Every tier 1 token and its rule (GRILL answers 4-6). Sofa and people are not in data/ yet.
const TIER1: Record<Id, Rule> = {
  chiller: 'clearance', glass: 'corner_turn', wheelchair: 'no_steps', load: 'downward',
  sofa: 'corner_turn', people: 'shortest_exit',
};
const isTier1 = (token: Id): boolean => Object.hasOwn(TIER1, token);

const resultOf = (results: SolverResult[], token: Id): SolverResult => {
  const r = results.find((x) => x.token === token);
  assert.ok(r, `no result for ${token}`);
  return r;
};
const tier1 = (results: SolverResult[]): SolverResult[] => results.filter((r) => isTier1(r.token));
const failing = (results: SolverResult[]): SolverResult[] => tier1(results).filter((r) => r.status === 'fail');
const near = (got: number | null, want: number, what: string) =>
  assert.ok(got !== null && Math.abs(got - want) < 0.0005, `${what}: got ${got}, want about ${want}`);

test('every tier 1 rule is implemented, so no tier 1 case is todo', () => {
  for (const [token, rule] of Object.entries(TIER1)) assert.ok(IMPLEMENTED_RULES.includes(rule), `${token}: rule ${rule} is not implemented`);
  // solver.test.ts and app/state.test.ts mark a case todo when its token is missing from
  // building.json or its rule is not implemented.
  const building = freshBuilding();
  for (const t of building.tokens.filter((x) => isTier1(x.id))) assert.equal(t.rule, TIER1[t.id], `${t.id}: wrong rule`);
  const ruleOf = new Map(building.tokens.map((t) => [t.id, t.rule]));
  for (const c of expected.cases) {
    for (const want of c.expect.filter((e) => isTier1(e.token))) {
      const rule = ruleOf.get(want.token);
      assert.ok(rule !== undefined && IMPLEMENTED_RULES.includes(rule), `expected ${c.id}: ${want.token} would be todo`);
    }
  }
});

test('base:glass: cannot turn at lobby-door, needs 4.0 m, L_max about 3.71 m', () => {
  const got = resultOf(solve(freshBuilding()), 'glass');
  assert.deepEqual(
    [got.status, got.path, got.blocked_at, got.reason, got.needed],
    ['fail', ['street', 'corridor'], 'lobby-door', 'cannot_turn', 4.0],
  );
  near(got.available, 3.7102, 'L_max at lobby-door');
});

test('widen lobby-door 1.6: L_max about 4.43 m, the glass passes, and only tokens blocked there change', () => {
  const building = freshBuilding();
  const widen: Edit = { op: 'widen', target: 'lobby-door', value: 1.6, source: 'button' };
  const door = applyEdits(building, [widen]).edges.find((e) => e.id === 'lobby-door');
  assert.ok(door && door.corner_a !== undefined && door.corner_b !== undefined, 'lobby-door has no corner');
  const glass = building.tokens.find((t) => t.id === 'glass');
  assert.ok(glass, 'building.json has no glass token');
  near(lMax(door.corner_a, door.corner_b, glass.size.width), 4.4255, 'L_max after the widen');
  const before = solve(building);
  const after = solve(building, [widen]);
  assert.deepEqual(
    [resultOf(after, 'glass').status, resultOf(after, 'glass').path, resultOf(after, 'glass').blocked_at],
    ['pass', ['street', 'corridor', 'lobby'], null],
  );
  // The sofa, when P5 adds it, is blocked at lobby-door too and may change; nothing else may.
  for (const r of before.filter((x) => x.blocked_at !== 'lobby-door')) assert.deepEqual(resultOf(after, r.token), r, `${r.token} changed`);
});

test('widen keeps a corner that is already wider than the new width (contract edit table)', () => {
  const door = applyEdits(freshBuilding(), [{ op: 'widen', target: 'lobby-door', value: 1.3, source: 'button' }])
    .edges.find((e) => e.id === 'lobby-door');
  assert.deepEqual([door?.clear_width, door?.corner_a, door?.corner_b], [1.3, 1.3, 1.5]);
});

test('full-demo: solve(building, full-demo edits) gives pass for every tier 1 token: LEVEL COMPLETE', () => {
  const building = freshBuilding();
  const results = solve(building, demoEdits());
  assert.deepEqual(results.map((r) => r.token), building.tokens.map((t) => t.id));
  assert.ok(tier1(results).length > 0, 'building.json has no tier 1 token');
  assert.deepEqual(failing(results).map((r) => r.token), []);
  assert.equal(levelComplete(tier1(results)), true);
  // full-demo expects every tier 1 token to pass, so app/state.test.ts checks that the banner shows.
  const want = new Map(fullDemo!.expect.map((e) => [e.token, e.status]));
  for (const r of tier1(results)) assert.equal(want.get(r.token), 'pass', `full-demo does not expect ${r.token} to pass`);
});

test('full-demo: the edits in any order give LEVEL COMPLETE', () => {
  const building = freshBuilding();
  const orders = (xs: Edit[]): Edit[][] => xs.length <= 1 ? [xs]
    : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
  const edits = demoEdits();
  const all = orders(edits);
  assert.equal(all.length, edits.reduce((n, _, i) => n * (i + 1), 1));
  for (const order of all) assert.equal(levelComplete(tier1(solve(building, order))), true, order.map((e) => e.target).join(', '));
});

test('full-demo: leave out any one fix and LEVEL COMPLETE goes; every token that fails is blocked at that fix', () => {
  const building = freshBuilding();
  const edits = demoEdits();
  assert.ok(edits.length > 0, 'full-demo has no edits');
  for (const [i, left] of edits.entries()) {
    const results = solve(building, edits.filter((_, j) => j !== i));
    const fails = failing(results);
    assert.ok(fails.length > 0, `without ${left.op} ${left.target}: every token still passes, so the fix is not needed`);
    for (const r of fails) assert.equal(r.blocked_at, left.target, `without ${left.op} ${left.target}: ${r.token} fails elsewhere`);
    assert.equal(levelComplete(tier1(results)), false);
  }
});

test('full-demo with the sofa and people (fixture): LEVEL COMPLETE needs the office door widened', () => {
  const b = withMvpFixture(freshBuilding());
  const demo = solve(b, demoEdits());
  assert.deepEqual(failing(demo).map((r) => r.token), ['people'], 'the lobby widen also lets the sofa out; people still fail');
  assert.equal(levelComplete(tier1(demo)), false);
  const all = solve(b, [...demoEdits(), structuredClone(WIDEN_FIXTURE_OFFICE_DOOR)]);
  for (const token of Object.keys(TIER1)) assert.equal(resultOf(all, token).status, 'pass', `${token} with the fixture`);
  assert.equal(levelComplete(tier1(all)), true);
});
