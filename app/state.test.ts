import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_CASE, applyEdit, demoButtons, initialState, isApplied, resetState, run } from './state.ts';
import { levelComplete } from './scoreboard.ts';
import { IMPLEMENTED_RULES } from '../solver/index.ts';
import type { Building, Edit, ExpectedFile } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const demo = expected.cases.find((c) => c.id === DEMO_CASE);

test('the demo buttons come from the full-demo case, in order, with readable labels', () => {
  assert.ok(demo, `expected.json has no ${DEMO_CASE} case`);
  const buttons = demoButtons(building, expected);
  assert.deepEqual(buttons.map((b) => b.edit), demo.edits.filter((e) => e.op !== 'reset'));
  assert.deepEqual(buttons.map((b) => b.label), [
    'Widen plant shaft to 2 m',
    'Add transfer beam at beam B2',
    'Add ramp at terrace door',
    'Widen lobby door to 1.6 m',
    'Widen office door to 0.9 m',
  ]);
  assert.equal(new Set(buttons.map((b) => b.id)).size, buttons.length, 'button ids are unique');
});

test('every demo button targets something that exists in building.json', () => {
  const ids = new Set([...building.edges.map((e) => e.id), ...building.members.map((m) => m.id)]);
  for (const b of demoButtons(building, expected)) assert.ok(ids.has(b.edit.target ?? ''), `${b.label}: no ${b.edit.target}`);
});

test('an edit applies once; a second click changes nothing', () => {
  const widen: Edit = { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' };
  const once = applyEdit(initialState(), widen);
  assert.equal(applyEdit(once, widen), once);
  assert.equal(once.edits.length, 1);
  assert.ok(isApplied(once, widen));
});

test('reset clears every edit, as a button or as a reset edit', () => {
  const s = applyEdit(initialState(), { op: 'add_ramp', target: 'terrace-door', value: null, source: 'button' });
  assert.deepEqual(resetState(), initialState());
  assert.deepEqual(applyEdit(s, { op: 'reset', target: null, value: null, source: 'button' }), initialState());
});

test('run hands the viewer the edited building, not the base one', () => {
  const s = applyEdit(initialState(), { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' });
  const { building: edited, results } = run(building, s);
  assert.equal(edited.edges.find((e) => e.id === 'plant-shaft')?.clear_width, 2);
  assert.equal(building.edges.find((e) => e.id === 'plant-shaft')?.clear_width, 1.2, 'base building untouched');
  assert.equal(results.length, building.tokens.length);
});

// Click through each expected case the way the presenter does, then check the solver's answer.
// Like solver.test.ts, a token whose rule P1 has not implemented yet shows as "todo".
const ruleOf = new Map(building.tokens.map((t) => [t.id, t.rule]));
for (const c of expected.cases) {
  const s = c.edits.reduce(applyEdit, initialState());
  const results = run(building, s).results;
  for (const want of c.expect) {
    const rule = ruleOf.get(want.token);
    const todo = rule === undefined || !IMPLEMENTED_RULES.includes(rule);
    test(`clicking ${c.id}: ${want.token} ${want.status}`, { todo: todo && `rule ${rule} not implemented` }, () => {
      assert.equal(results.find((r) => r.token === want.token)?.status, want.status);
    });
  }
  const allRules = building.tokens.every((t) => IMPLEMENTED_RULES.includes(t.rule));
  const allPass = c.expect.length === building.tokens.length && c.expect.every((e) => e.status === 'pass');
  test(`clicking ${c.id}: LEVEL COMPLETE is ${allPass ? 'shown' : 'not shown'}`, { todo: !allRules && 'solver rules not all implemented' }, () => {
    assert.equal(levelComplete(results), allPass);
  });
}
