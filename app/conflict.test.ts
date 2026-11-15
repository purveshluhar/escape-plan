import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, Edit } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { conflictOf } from './conflict.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const widen: Edit = { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' };
const beam: Edit = { op: 'add_transfer_beam', target: 'beam-b2', value: null, source: 'button' };
const LABEL = 'Widen plant shaft to 2.0 m';

test('widening the shaft names the answer it broke: the structure at beam B2', () => {
  assert.deepEqual(conflictOf(solve(building), solve(building, [widen]), LABEL, building), {
    title: 'Widen plant shaft to 2.0 m broke an answer',
    lines: ['Does the structure still hold? Yes became No. Load is stuck at beam B2: nothing holds it up, no path down to a foundation'],
  });
});

test('no conflict before the first run, or when nothing that was Yes is now No', () => {
  assert.equal(conflictOf(null, solve(building, [widen]), LABEL, building), null);
  assert.equal(conflictOf(solve(building), solve(building, [widen, beam]), 'Add transfer beam at beam B2', building), null);
});

test('an answer that was already No is not a new break', () => {
  // The chiller is No as built and the shaft edit makes it Yes; the load is the only one that flips.
  const lines = conflictOf(solve(building), solve(building, [widen]), LABEL, building)!.lines;
  assert.equal(lines.length, 1);
});

test('two broken answers read as a plural title', () => {
  const lobby: Edit = { op: 'widen', target: 'lobby-door', value: 1.6, source: 'button' };
  const before = solve(building, [lobby]); // the sofa gets in, the structure holds
  const after = solve(building, [lobby, widen]).map((r) => (r.token === 'sofa' ? { ...r, status: 'fail' as const, reason: 'no_route' as const } : r));
  const conflict = conflictOf(before, after, LABEL, building)!;
  assert.equal(conflict.title, 'Widen plant shaft to 2.0 m broke 2 answers');
  assert.equal(conflict.lines.length, 2);
});
