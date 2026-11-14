import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { failText, labelSides } from './labels.ts';
import type { Building, SolverResult } from '../contract/types.ts';

const b = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const fail = (r: Partial<SolverResult>): SolverResult => ({
  token: 'chiller', status: 'fail', path: [], blocked_at: null, reason: null, needed: null, available: null, ...r,
});

test('fail label names the token, the reason, the place and both numbers in metres', () => {
  assert.deepEqual(failText(b, fail({ blocked_at: 'plant-shaft', reason: 'too_narrow', needed: 1.6, available: 1.2 })), {
    title: 'CHILLER  TOO NARROW',
    detail: 'Plant shaft: needs 1.6 m, has 1.2 m',
  });
});

test('a step says how high it is; a lost support says why', () => {
  const step = failText(b, fail({ token: 'wheelchair', blocked_at: 'terrace-door', reason: 'step', needed: 0, available: 0.15 }));
  assert.equal(step?.detail, 'Terrace door: step 0.15 m, needs level');
  const load = failText(b, fail({ token: 'load', blocked_at: 'beam-b2', reason: 'no_support' }));
  assert.deepEqual(load, { title: 'LOAD  NO SUPPORT', detail: 'beam-b2: no load path to a foundation' });
});

test('a pass has no fail label', () => {
  assert.equal(failText(b, fail({ status: 'pass' })), null);
});

test('each label goes on the side away from its nearest neighbour', () => {
  // Two Xs side by side, one above the left one.
  assert.deepEqual(labelSides([[100, 300], [220, 300], [100, 200]]), ['left', 'right', 'right']);
});
