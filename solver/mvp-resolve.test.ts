// P1-07, the MVP gate: one edit changes each MVP token's result live (wheelchair, sofa, people),
// and solve() is pure and deterministic. The 100 ms budget (ADR 0002) is checked by
// mvp-resolve.timing.ts, which runs alone in `npm run test:timing`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import { checkBuildingRefs, validate } from '../contract/validate.ts';
import type { Building, Edit, ExpectedFile, Rule, SolverResult } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
// A fresh parse each call, so no test sees what another test (or a bad solve) did to its input.
const freshBuilding = (): Building => read('../data/building.json') as Building;
const building = freshBuilding();
const expected = read('../data/expected.json') as ExpectedFile;

const button = (op: Edit['op'], target: string, value: number | null = null): Edit => ({ op, target, value, source: 'button' });
const resultOf = (b: Building, edits: readonly Edit[], token: string): SolverResult => {
  const r = solve(b, edits).find((x) => x.token === token);
  assert.ok(r, `no result for ${token}`);
  return r;
};
const near = (got: number | null, want: number, what: string) =>
  assert.ok(got !== null && Math.abs(got - want) < 0.0005, `${what}: got ${got}, want about ${want}`);

// The sofa and people are in data/building.json with the other tokens (they were a test fixture).
const mvp = building;

// One edit per MVP token, for the "each edit changes only its own token" check below.
const MVP_CASES: { id: string; edits: Edit[] }[] = [
  { id: 'mvp-base', edits: [] },
  { id: 'mvp-ramp', edits: [button('add_ramp', 'terrace-door')] },
  { id: 'mvp-widen-lobby', edits: [button('widen', 'lobby-door', 1.6)] },
  { id: 'mvp-widen-office', edits: [button('widen', 'office-door', 0.9)] },
];

test('building.json has the sofa and people, and stays valid building data', () => {
  assert.deepEqual(['sofa', 'people'].map((id) => building.tokens.some((t) => t.id === id)), [true, true]);
  assert.deepEqual(validate('building.schema.json', mvp), []);
  assert.deepEqual(checkBuildingRefs(mvp), []);
});

test('the MVP rules are implemented: no wheelchair, sofa or people case is left as todo', () => {
  const mvpRule: Record<string, Rule> = { wheelchair: 'no_steps', sofa: 'corner_turn', people: 'shortest_exit' };
  for (const rule of Object.values(mvpRule)) assert.ok(IMPLEMENTED_RULES.includes(rule), `${rule} is not implemented`);
  // solver.test.ts marks a case todo when its token is not in building.json or its rule is not
  // implemented. So every expected case that names an MVP token must find it, with its rule.
  const ruleOf = new Map(building.tokens.map((t) => [t.id, t.rule]));
  for (const c of expected.cases) {
    for (const want of c.expect) {
      if (!(want.token in mvpRule)) continue;
      assert.equal(ruleOf.get(want.token), mvpRule[want.token], `expected ${c.id}: ${want.token} has no ${mvpRule[want.token]} token in building.json`);
    }
  }
});

test('wheelchair: fail at the terrace-door step, pass after add_ramp terrace-door', () => {
  const before = resultOf(building, [], 'wheelchair');
  assert.deepEqual([before.status, before.blocked_at, before.reason, before.needed, before.available], ['fail', 'terrace-door', 'step', 0, 0.15]);
  const after = resultOf(building, [button('add_ramp', 'terrace-door')], 'wheelchair');
  assert.deepEqual([after.status, after.path, after.blocked_at, after.reason], ['pass', ['terrace', 'lobby', 'corridor', 'street'], null, null]);
});

test('sofa: cannot turn at lobby-door (L_max 1.997 < 2.2), pass after widen lobby-door 1.6 (L_max 2.73)', () => {
  const before = resultOf(mvp, [], 'sofa');
  assert.deepEqual([before.status, before.path, before.blocked_at, before.reason, before.needed], ['fail', ['lobby'], 'lobby-door', 'cannot_turn', 2.2]);
  near(before.available, 1.997, 'L_max at lobby-door');
  const after = resultOf(mvp, [button('widen', 'lobby-door', 1.6)], 'sofa');
  assert.deepEqual([after.status, after.path, after.blocked_at, after.reason], ['pass', ['lobby', 'corridor', 'street'], null, null]);
});

test('people: too narrow at office-door (0.6 > 0.5), pass after widen office-door 0.9 with time 2', () => {
  const before = resultOf(mvp, [], 'people');
  assert.deepEqual(
    [before.status, before.path, before.blocked_at, before.reason, before.needed, before.available, before.time],
    ['fail', ['office'], 'office-door', 'too_narrow', 0.6, 0.5, null],
  );
  const after = resultOf(mvp, [button('widen', 'office-door', 0.9)], 'people');
  assert.deepEqual([after.status, after.path, after.blocked_at, after.reason, after.time], ['pass', ['office', 'corridor', 'street'], null, null, 2]);
});

test('each MVP edit changes only its own MVP token', () => {
  const status = (edits: Edit[]) => Object.fromEntries(
    solve(mvp, edits).filter((r) => ['wheelchair', 'sofa', 'people'].includes(r.token)).map((r) => [r.token, r.status]),
  );
  assert.deepEqual(status([]), { wheelchair: 'fail', sofa: 'fail', people: 'fail' });
  assert.deepEqual(status([button('add_ramp', 'terrace-door')]), { wheelchair: 'pass', sofa: 'fail', people: 'fail' });
  assert.deepEqual(status([button('widen', 'lobby-door', 1.6)]), { wheelchair: 'fail', sofa: 'pass', people: 'fail' });
  assert.deepEqual(status([button('widen', 'office-door', 0.9)]), { wheelchair: 'fail', sofa: 'fail', people: 'pass' });
  const all = MVP_CASES.flatMap((c) => c.edits);
  assert.deepEqual(status(all), { wheelchair: 'pass', sofa: 'pass', people: 'pass' });
});

test('solve() never changes its input, and the same input gives the same output twice', () => {
  const runs = [
    ...expected.cases.map((c) => ({ b: freshBuilding(), id: c.id, edits: structuredClone(c.edits) })),
    ...MVP_CASES.map((c) => ({ b: freshBuilding(), id: c.id, edits: structuredClone(c.edits) })),
  ];
  for (const { b, id, edits } of runs) {
    const before = structuredClone({ b, edits });
    const first = solve(b, edits);
    assert.deepEqual({ b, edits }, before, `${id}: solve() changed its input`);
    const second = solve(b, edits);
    assert.deepEqual(second, first, `${id}: a second solve() gave a different answer`);
  }
});
