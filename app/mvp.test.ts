import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { MVP_TOKENS, mvpBuilding, mvpButtons } from './mvp.ts';
import { pickerItems } from './shell.ts';
import { demoButtons } from './state.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const base = read('../data/building.json') as Building;
const building = mvpBuilding(base);
const buttons = mvpButtons(building, demoButtons(base, read('../data/expected.json') as ExpectedFile));

test('the MVP dock offers exactly wheelchair, sofa and people (keys 1-3), with no Later chips', () => {
  const items = pickerItems(building, MVP_TOKENS);
  assert.deepEqual(items.map((i) => [i.token, i.label, i.key]), [['wheelchair', 'Wheelchair', 1], ['sofa', 'Sofa', 2], ['people', 'People', 3]]);
});

test('each MVP token fails at first and one MVP button lets it out', () => {
  for (const id of MVP_TOKENS) {
    const before = solve(building).find((r) => r.token === id)!;
    assert.equal(before.status, 'fail', id);
    const fix = buttons.find((b) => b.edit.target === before.blocked_at);
    assert.ok(fix, `a button for ${id} at ${before.blocked_at}`);
    assert.equal(solve(building, [fix.edit]).find((r) => r.token === id)!.status, 'pass', id);
  }
});

test('the MVP buttons are only the ones that matter to the MVP tokens', () => {
  assert.equal(buttons.length, MVP_TOKENS.length);
});
