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

const layout = { height: 50, gap: 36, minX: 0, maxX: 1200 };

test('a label takes the free side: away from a neighbour on its row, right by default', () => {
  // Two Xs side by side, and one alone high above.
  const spots = [{ x: 400, y: 300, width: 200 }, { x: 520, y: 300, width: 200 }, { x: 400, y: 100, width: 200 }];
  assert.deepEqual(labelSides(spots, layout), ['left', 'right', 'right']);
});

test('labels on nearby rows do not stack on top of each other', () => {
  // The base case on a narrow screen: chiller above, glass under it, wheelchair to the right
  // and a little lower. Chiller and wheelchair labels both on the right would overlap.
  const spots = [
    { x: 235, y: 372, width: 260 }, // chiller
    { x: 228, y: 425, width: 260 }, // glass
    { x: 336, y: 412, width: 300 }, // wheelchair
  ];
  const sides = labelSides(spots, { ...layout, maxX: 864 });
  assert.notDeepEqual([sides[0], sides[2]], ['right', 'right']);
});

test('a label never runs off the edge of the free screen when the other side is clear', () => {
  assert.deepEqual(labelSides([{ x: 1100, y: 300, width: 250 }], layout), ['left']);
  assert.deepEqual(labelSides([{ x: 60, y: 300, width: 250 }], layout), ['right']);
});
