// P1-19, the tier 1 gate: the glass record, and LEVEL COMPLETE. solve(building, full-demo edits)
// gives pass for every token, every tier 1 rule is implemented (so no tier 1 case is todo), and
// each demo fix is needed. LEVEL COMPLETE is the app's own check (app/scoreboard.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMPLEMENTED_RULES, applyEdits, solve } from './index.ts';
import { lMax } from './corner-turn.ts';
import { WIDEN_FIXTURE_OFFICE_DOOR, withMvpFixture } from './mvp-fixture.ts';
import { levelComplete } from '../app/scoreboard.ts';
import type { Building, Edit, ExpectedFile, Id, Rule, SolverResult } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const fullDemo = expected.cases.find((c) => c.id === 'full-demo');
const demoEdits = (): Edit[] => {
  assert.ok(fullDemo, 'expected.json has no full-demo case');
  return structuredClone(fullDemo.edits);
};

// Every tier 1 token and its rule (GRILL answers 4-6). Sofa and people are not in data/ yet.
const TIER1: Record<Id, Rule> = {
  chiller: 'clearance', glass: 'corner_turn', wheelchair: 'no_steps', load: 'downward',
  sofa: 'corner_turn', people: 'shortest_exit',
};

const resultOf = (results: SolverResult[], token: Id): SolverResult => {
  const r = results.find((x) => x.token === token);
  assert.ok(r, `no result for ${token}`);
  return r;
};
const failing = (results: SolverResult[]): Id[] => results.filter((r) => r.status === 'fail').map((r) => r.token);
const near = (got: number | null, want: number, what: string) =>
  assert.ok(got !== null && Math.abs(got - want) < 0.0005, `${what}: got ${got}, want about ${want}`);

test('every tier 1 rule is implemented, so no tier 1 case is todo', () => {
  for (const [token, rule] of Object.entries(TIER1)) assert.ok(IMPLEMENTED_RULES.includes(rule), `${token}: rule ${rule} is not implemented`);
  // solver.test.ts and app/state.test.ts mark a case todo when its token is missing from
  // building.json or its rule is not implemented. Every token here is tier 1, with its rule.
  for (const t of building.tokens) assert.equal(TIER1[t.id], t.rule, `${t.id}: not a tier 1 token, or the wrong rule`);
  const ruleOf = new Map(building.tokens.map((t) => [t.id, t.rule]));
  for (const c of expected.cases) {
    for (const want of c.expect) {
      const rule = ruleOf.get(want.token);
      assert.ok(rule !== undefined && IMPLEMENTED_RULES.includes(rule), `expected ${c.id}: ${want.token} would be todo`);
    }
  }
});

test('base:glass: cannot turn at lobby-door, needs 4.0 m, L_max about 3.71 m', () => {
  const got = resultOf(solve(building), 'glass');
  assert.deepEqual(
    [got.status, got.path, got.blocked_at, got.reason, got.needed],
    ['fail', ['street', 'corridor'], 'lobby-door', 'cannot_turn', 4.0],
  );
  near(got.available, 3.7102, 'L_max at lobby-door');
});

test('widen lobby-door 1.6: the corners become 1.6, L_max about 4.43 m, and only the glass changes', () => {
  const widen: Edit = { op: 'widen', target: 'lobby-door', value: 1.6, source: 'button' };
  const door = applyEdits(building, [widen]).edges.find((e) => e.id === 'lobby-door');
  assert.ok(door && door.corner_a !== undefined && door.corner_b !== undefined, 'lobby-door has no corner');
  assert.deepEqual([door.clear_width, door.corner_a, door.corner_b], [1.6, 1.6, 1.6]);
  const glass = building.tokens.find((t) => t.id === 'glass')!;
  near(lMax(door.corner_a, door.corner_b, glass.size.width), 4.4255, 'L_max after the widen');
  const before = solve(building);
  const after = solve(building, [widen]);
  assert.deepEqual(
    [resultOf(after, 'glass').status, resultOf(after, 'glass').path, resultOf(after, 'glass').blocked_at],
    ['pass', ['street', 'corridor', 'lobby'], null],
  );
  for (const r of before.filter((x) => x.token !== 'glass')) assert.deepEqual(resultOf(after, r.token), r, `${r.token} changed`);
});

test('full-demo: solve(building, full-demo edits) gives pass for every token: LEVEL COMPLETE', () => {
  const results = solve(building, demoEdits());
  assert.deepEqual(results.map((r) => r.token), building.tokens.map((t) => t.id));
  assert.deepEqual(failing(results), []);
  assert.equal(levelComplete(results), true);
  // full-demo names every token, so app/state.test.ts checks that the banner shows.
  assert.deepEqual(fullDemo!.expect.map((e) => e.token).sort(), building.tokens.map((t) => t.id).sort());
});

test('full-demo: the edits in any order give LEVEL COMPLETE', () => {
  const orders = (xs: Edit[]): Edit[][] => xs.length <= 1 ? [xs]
    : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
  const all = orders(demoEdits());
  assert.equal(all.length, 24);
  for (const edits of all) assert.equal(levelComplete(solve(building, edits)), true, edits.map((e) => e.target).join(', '));
});

test('full-demo: leave out any one fix and only the token it fixes fails, so no LEVEL COMPLETE', () => {
  const fixes: Record<Id, Id> = { 'plant-shaft': 'chiller', 'beam-b2': 'load', 'terrace-door': 'wheelchair', 'lobby-door': 'glass' };
  const edits = demoEdits();
  assert.deepEqual(edits.map((e) => e.target).sort(), Object.keys(fixes).sort());
  for (const [i, left] of edits.entries()) {
    const results = solve(building, edits.filter((_, j) => j !== i));
    assert.deepEqual(failing(results), [fixes[left.target!]], `without ${left.op} ${left.target}`);
    assert.equal(levelComplete(results), false);
  }
});

test('full-demo with the sofa and people (fixture): LEVEL COMPLETE needs the office door widened', () => {
  const b = withMvpFixture(building);
  const demo = solve(b, demoEdits());
  assert.deepEqual(failing(demo), ['people'], 'the lobby widen also lets the sofa out; people still fail');
  assert.equal(levelComplete(demo), false);
  const all = solve(b, [...demoEdits(), WIDEN_FIXTURE_OFFICE_DOOR]);
  assert.deepEqual(all.map((r) => r.token).sort(), [...Object.keys(TIER1)].sort());
  assert.deepEqual(failing(all), []);
  assert.equal(levelComplete(all), true);
});
