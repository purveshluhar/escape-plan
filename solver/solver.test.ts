import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMPLEMENTED_RULES, applyEdits, solve } from './index.ts';
import { validate } from '../contract/validate.ts';
import type { Building, ExpectedFile } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const ruleOf = new Map(building.tokens.map((t) => [t.id, t.rule]));

test('solve returns one schema-valid record per token', () => {
  const results = solve(building);
  assert.deepEqual(results.map((r) => r.token), building.tokens.map((t) => t.id));
  assert.deepEqual(validate('solver-output.schema.json', results), []);
});

test('a pass record has every block field null, a fail has a reason', () => {
  const runs = [solve(building), ...expected.cases.map((c) => solve(building, c.edits))];
  for (const r of runs.flat()) {
    if (r.status === 'pass') assert.deepEqual([r.blocked_at, r.reason, r.needed, r.available], [null, null, null, null]);
    else assert.ok(r.reason, `${r.token}: a fail needs a reason`);
  }
});

test('applyEdits follows the edit table in contract/README.md', () => {
  const b = applyEdits(building, [
    { op: 'widen', target: 'lobby-door', value: 1.6, source: 'button' },
    { op: 'add_transfer_beam', target: 'beam-b2', value: null, source: 'button' },
    { op: 'add_ramp', target: 'terrace-door', value: null, source: 'button' },
    { op: 'close_door', target: 'door-north', value: null, source: 'button' },
    { op: 'add_sleeve', target: 'plant-shaft', value: null, source: 'button' },
  ]);
  const edge = (id: string) => b.edges.find((e) => e.id === id)!;
  assert.deepEqual([edge('lobby-door').clear_width, edge('lobby-door').corner_a, edge('lobby-door').corner_b], [1.6, 1.6, 1.6]);
  assert.equal(b.members.find((m) => m.id === 'beam-b2')?.kind, 'transfer_beam');
  assert.deepEqual([edge('terrace-door').kind, edge('terrace-door').step_height], ['ramp', 0]);
  assert.equal(edge('door-north').open, false);
  assert.equal(edge('plant-shaft').sleeved, true);
  const reset = applyEdits(building, [{ op: 'widen', target: 'plant-shaft', value: 2, source: 'button' }, { op: 'reset', target: null, value: null, source: 'button' }]);
  assert.deepEqual(reset, building);
});

test('applyEdits does not change the input building', () => {
  const before = JSON.stringify(building);
  applyEdits(building, [{ op: 'widen', target: 'plant-shaft', value: 2, source: 'button' }]);
  assert.equal(JSON.stringify(building), before);
});

// The truth: one test per expected case and token. A rule not yet implemented shows as "todo".
for (const c of expected.cases) {
  for (const want of c.expect) {
    const rule = ruleOf.get(want.token);
    const todo = rule === undefined || !IMPLEMENTED_RULES.includes(rule);
    test(`expected ${c.id}: ${want.token}`, { todo: todo && `rule ${rule} not implemented` }, () => {
      const got = solve(building, c.edits).find((r) => r.token === want.token);
      assert.ok(got, `no result for ${want.token}`);
      const picked = Object.fromEntries(Object.keys(want).map((k) => [k, got[k as keyof typeof got]]));
      assert.deepEqual(picked, want);
    });
  }
}
