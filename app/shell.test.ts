import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile, SolverResult } from '../contract/types.ts';
import { countText, parkedResults, parseEdit, phaseAfterRun, pickerItems, runSeconds, togglePlaced } from './shell.ts';
import { demoButtons } from './state.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const buttons = demoButtons(building, read('../data/expected.json') as ExpectedFile);
const res = (token: string, status: 'pass' | 'fail'): SolverResult => ({
  token, status, path: [], blocked_at: null, reason: status === 'fail' ? 'no_route' : null, needed: null, available: null,
});

test('picker: every token is placeable with a key, missing disciplines come after as later', () => {
  const items = pickerItems(building);
  const placeable = items.filter((i) => i.token !== null);
  assert.deepEqual(placeable.map((i) => i.token), building.tokens.map((t) => t.id));
  assert.deepEqual(placeable.map((i) => i.key), building.tokens.map((_, i) => i + 1));
  const later = items.filter((i) => i.token === null);
  assert.ok(later.length > 0);
  assert.ok(later.every((i) => i.key === null && !building.tokens.some((t) => t.discipline === i.discipline)));
  assert.ok(items.indexOf(later[0]!) === placeable.length);
});

test('togglePlaced keeps building order and takes an object off on a second click', () => {
  const [a, b] = building.tokens.map((t) => t.id);
  const one = togglePlaced(building, [], b!);
  const two = togglePlaced(building, one, a!);
  assert.deepEqual(two, [a, b]);
  assert.deepEqual(togglePlaced(building, two, a!), [b]);
});

test('parked results put each placed object at its start, with no route and no block', () => {
  const placed = building.tokens.slice(0, 2).map((t) => t.id);
  const parked = parkedResults(placed);
  assert.deepEqual(parked.map((r) => r.token), placed);
  assert.ok(parked.every((r) => r.path.length === 0 && r.blocked_at === null && r.reason === null));
  assert.deepEqual(parkedResults([]), []);
});

test('phase and summary words', () => {
  assert.equal(phaseAfterRun([res('chiller', 'pass'), res('glass', 'pass')]), 'complete');
  assert.equal(phaseAfterRun([res('chiller', 'pass'), res('glass', 'fail')]), 'result');
  assert.equal(phaseAfterRun([]), 'result');
  assert.equal(countText('empty', 0, null), 'Pick an object to place it');
  assert.equal(countText('placed', 2, null), '2 placed');
  assert.equal(countText('running', 3, null), '3 escaping');
  assert.equal(countText('result', 2, [res('chiller', 'pass'), res('glass', 'fail')]), '1 of 2 out');
  assert.equal(runSeconds(0, 2, 0.25), 0);
  assert.equal(runSeconds(4, 2, 0.25), 2.75);
});

test('parse: a clear sentence becomes one text edit', () => {
  const out = parseEdit('widen the lobby door to 1.6 m', buttons);
  assert.deepEqual(out.edit, { op: 'widen', target: 'lobby-door', value: 1.6, source: 'text' });
  const ramp = parseEdit('add a ramp at the terrace door', buttons);
  assert.deepEqual(ramp.edit, { op: 'add_ramp', target: 'terrace-door', value: null, source: 'text' });
  const beam = parseEdit('transfer beam at B2', buttons);
  assert.equal(beam.edit?.op, 'add_transfer_beam');
  assert.equal(beam.edit?.target, 'beam-b2');
});

test('parse: a typed value wins over the demo value, inside the range', () => {
  assert.equal(parseEdit('widen the plant shaft to 2.4 m', buttons).edit?.value, 2.4);
  // 40 m is outside the declared range, so the demo value is used instead.
  assert.equal(parseEdit('widen the plant shaft to 40 m', buttons).edit?.value, 2);
});

test('parse: a vague sentence asks "Did you mean" with the closest fixes first', () => {
  const out = parseEdit('make the lobby bigger', buttons);
  assert.equal(out.edit, null);
  assert.ok(out.parse.target.confidence < 0.8);
  assert.equal(out.suggestions[0]?.edit.target, 'lobby-door');
  assert.ok(out.suggestions.length <= 3);
  assert.equal(parseEdit('hello there', buttons).edit, null);
});
