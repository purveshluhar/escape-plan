import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { withSmoke } from '../data/smoke.ts';
import { MVP_TOKENS, mvpButtons } from './mvp.ts';
import { pickerItems } from './shell.ts';
import { demoButtons } from './state.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const buttons = mvpButtons(building, demoButtons(building, read('../data/expected.json') as ExpectedFile));

test('the MVP dock offers wheelchair, sofa, people, chiller, load and smoke (keys 1-6), with no Later chips', () => {
  const items = pickerItems(withSmoke(building), MVP_TOKENS); // the dock reads the building with the smoke in it
  assert.deepEqual(items.map((i) => [i.token, i.label, i.key]), [
    ['wheelchair', 'Wheelchair', 1], ['sofa', 'Sofa', 2], ['people', 'People', 3], ['chiller', 'Chiller', 4], ['load', 'Load', 5], ['smoke', 'Smoke', 6],
  ]);
});

test('each MVP token that fails at first has one MVP button that lets it through', () => {
  for (const id of ['wheelchair', 'sofa', 'people', 'chiller']) {
    const before = solve(building).find((r) => r.token === id)!;
    assert.equal(before.status, 'fail', id);
    const fix = buttons.find((b) => b.edit.target === before.blocked_at);
    assert.ok(fix, `a button for ${id} at ${before.blocked_at}`);
    assert.equal(solve(building, [fix.edit]).find((r) => r.token === id)!.status, 'pass', id);
  }
});

test('the load passes as built, fails at beam B2 once the shaft is widened, and the beam button fixes it', () => {
  assert.equal(solve(building).find((r) => r.token === 'load')!.status, 'pass');
  const widen = buttons.find((b) => b.edit.target === 'plant-shaft')!.edit;
  const after = solve(building, [widen]).find((r) => r.token === 'load')!;
  assert.deepEqual([after.status, after.reason, after.blocked_at, after.needed, after.available], ['fail', 'no_support', 'beam-b2', 1.5, 2]);
  const beam = buttons.find((b) => b.edit.target === 'beam-b2')!.edit;
  assert.equal(beam.op, 'add_transfer_beam');
  assert.equal(solve(building, [widen, beam]).find((r) => r.token === 'load')!.status, 'pass');
});

test('the shaft and the beam buttons are always offered, even with the load passing and no one stuck at the beam', () => {
  const targets = buttons.map((b) => b.edit.target);
  assert.ok(targets.includes('plant-shaft'));
  assert.ok(targets.includes('beam-b2'));
});

test('the MVP buttons are exactly one per door, the shaft and the beam, plus the one that closes the lobby door', () => {
  assert.deepEqual(buttons.map((b) => `${b.edit.op} ${b.edit.target}`).sort(), [
    'add_ramp terrace-door', 'add_transfer_beam beam-b2', 'close_door lobby-door', 'widen lobby-door', 'widen office-door', 'widen plant-shaft',
  ]);
});
