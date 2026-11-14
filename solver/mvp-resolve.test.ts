// P1-07, the MVP gate: one edit changes each MVP token's result live (wheelchair, sofa, people),
// solve() over every expected case stays under 100 ms (ADR 0002), and solve() is pure and
// deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import { checkBuildingRefs, validate } from '../contract/validate.ts';
import type { Building, Edit, ExpectedFile, Rule, SolverResult, Token } from '../contract/types.ts';

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

// FIXTURE until P5 adds the sofa and people tokens and their cases to data/ (P5 owns data/).
// The real building plus the two MVP tokens. The sofa takes the P1-03 numbers: 0.9 m wide,
// 2.2 m long, from the lobby. data/building.json has no edge a person cannot pass and no edit
// that changes a person's result, so the people fixture adds one narrow door: `fixture-office-door`,
// 0.5 m, from a ground-floor office to the corridor. The fixture tokens replace any `sofa` or
// `people` token in data/, so P5's tokens do not shadow them; P5's own cases run in solver.test.ts.
const sofa: Token = {
  id: 'sofa', discipline: 'logistics', start: 'lobby', goal: null,
  size: { width: 0.9, height: 1.0, length: 2.2 }, rule: 'corner_turn',
};
const people: Token = {
  id: 'people', discipline: 'life_safety', start: 'fixture-office', goal: null,
  size: { width: 0.6, height: 2.0, length: 0.6 }, rule: 'shortest_exit',
};
function mvpBuilding(): Building {
  const base = freshBuilding();
  return {
    ...base,
    nodes: [
      ...base.nodes,
      { id: 'fixture-office', name: 'Office', level: 'L1', type: 'room', box: { x: 0, y: 8.4, width: 6, depth: 12 }, is_exit: false },
    ],
    edges: [
      ...base.edges,
      { id: 'fixture-office-door', name: 'Office door', from: 'fixture-office', to: 'corridor', kind: 'door', clear_width: 0.5, clear_height: 2.1, step_height: 0 },
    ],
    tokens: [...base.tokens.filter((t) => t.id !== sofa.id && t.id !== people.id), structuredClone(sofa), structuredClone(people)],
  };
}
const mvp = mvpBuilding();

// The MVP fixture cases, in expected.json's shape, for the timing and purity checks below.
const MVP_CASES: { id: string; edits: Edit[] }[] = [
  { id: 'mvp-base', edits: [] },
  { id: 'mvp-ramp', edits: [button('add_ramp', 'terrace-door')] },
  { id: 'mvp-widen-lobby', edits: [button('widen', 'lobby-door', 1.6)] },
  { id: 'mvp-widen-office', edits: [button('widen', 'fixture-office-door', 0.9)] },
];

test('solve() over every expected case takes under 100 ms in total (ADR 0002)', (t) => {
  // First in this file, and node --test runs each file in its own process: these are the first
  // solve() calls in the process, as on the first click.
  const start = performance.now();
  for (const c of expected.cases) solve(building, c.edits);
  for (const c of MVP_CASES) solve(mvp, c.edits);
  const ms = performance.now() - start;
  t.diagnostic(`solve() over ${expected.cases.length} expected cases + ${MVP_CASES.length} MVP fixture cases: ${ms.toFixed(2)} ms`);
  assert.ok(ms < 100, `took ${ms.toFixed(2)} ms`);
});

test('the MVP fixture is valid building data', () => {
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

test('sofa (fixture): cannot turn at lobby-door (L_max 1.997 < 2.2), pass after widen lobby-door 1.6 (L_max 2.73)', () => {
  const before = resultOf(mvp, [], 'sofa');
  assert.deepEqual([before.status, before.path, before.blocked_at, before.reason, before.needed], ['fail', ['lobby'], 'lobby-door', 'cannot_turn', 2.2]);
  near(before.available, 1.997, 'L_max at lobby-door');
  const after = resultOf(mvp, [button('widen', 'lobby-door', 1.6)], 'sofa');
  assert.deepEqual([after.status, after.path, after.blocked_at, after.reason], ['pass', ['lobby', 'corridor', 'street'], null, null]);
});

test('people (fixture): too narrow at fixture-office-door (0.6 > 0.5), pass after widen fixture-office-door 0.9 with time 2', () => {
  const before = resultOf(mvp, [], 'people');
  assert.deepEqual(
    [before.status, before.path, before.blocked_at, before.reason, before.needed, before.available, before.time],
    ['fail', ['fixture-office'], 'fixture-office-door', 'too_narrow', 0.6, 0.5, null],
  );
  const after = resultOf(mvp, [button('widen', 'fixture-office-door', 0.9)], 'people');
  assert.deepEqual([after.status, after.path, after.blocked_at, after.reason, after.time], ['pass', ['fixture-office', 'corridor', 'street'], null, null, 2]);
});

test('each MVP edit changes only its own MVP token', () => {
  const status = (edits: Edit[]) => Object.fromEntries(
    solve(mvp, edits).filter((r) => ['wheelchair', 'sofa', 'people'].includes(r.token)).map((r) => [r.token, r.status]),
  );
  assert.deepEqual(status([]), { wheelchair: 'fail', sofa: 'fail', people: 'fail' });
  assert.deepEqual(status([button('add_ramp', 'terrace-door')]), { wheelchair: 'pass', sofa: 'fail', people: 'fail' });
  assert.deepEqual(status([button('widen', 'lobby-door', 1.6)]), { wheelchair: 'fail', sofa: 'pass', people: 'fail' });
  assert.deepEqual(status([button('widen', 'fixture-office-door', 0.9)]), { wheelchair: 'fail', sofa: 'fail', people: 'pass' });
  const all = MVP_CASES.flatMap((c) => c.edits);
  assert.deepEqual(status(all), { wheelchair: 'pass', sofa: 'pass', people: 'pass' });
});

test('solve() never changes its input, and the same input gives the same output twice', () => {
  const runs = [
    ...expected.cases.map((c) => ({ b: freshBuilding(), id: c.id, edits: structuredClone(c.edits) })),
    ...MVP_CASES.map((c) => ({ b: mvpBuilding(), id: c.id, edits: structuredClone(c.edits) })),
  ];
  for (const { b, id, edits } of runs) {
    const before = structuredClone({ b, edits });
    const first = solve(b, edits);
    assert.deepEqual({ b, edits }, before, `${id}: solve() changed its input`);
    const second = solve(b, edits);
    assert.deepEqual(second, first, `${id}: a second solve() gave a different answer`);
  }
});
