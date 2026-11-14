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
