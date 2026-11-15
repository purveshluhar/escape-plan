import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REASON_TEXT, levelComplete, numbersText, placeName, scoreRows } from './scoreboard.ts';
import { exampleResultFail, exampleResultPass, exampleResultPeople } from '../contract/examples.ts';
import { REASONS } from '../contract/types.ts';
import type { Building, SolverResult } from '../contract/types.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;

test('a failed token shows its reason in words, where, and the numbers', () => {
  const [row] = scoreRows(building, [exampleResultFail]);
  assert.equal(row?.label, 'Chiller');
  assert.equal(row?.status, 'fail');
  assert.equal(row?.detail, 'Chiller is stuck at Plant shaft: too narrow, needs 1.6 m, has 1.2 m');
  assert.equal(row?.numbers, 'needs 1.6 m, has 1.2 m');
});

test('a passed token says its yes line and shows no numbers', () => {
  const [row] = scoreRows(building, [exampleResultPass]);
  assert.deepEqual([row?.status, row?.detail, row?.numbers], ['pass', 'The chiller fits through the shaft', '']);
});

test('a lost support at a member says there is no path down', () => {
  const noSupport: SolverResult = {
    token: 'load', status: 'fail', path: ['beam-b2'], blocked_at: 'beam-b2',
    reason: 'no_support', needed: null, available: null,
  };
  const [row] = scoreRows(building, [noSupport]);
  assert.equal(row?.detail, 'Load is stuck at beam B2: nothing holds it up, no path down to a foundation');
  assert.equal(row?.numbers, 'no path down to a foundation');
});

test('people and smoke count time steps, not metres', () => {
  assert.equal(numbersText(exampleResultPeople), 'people at step 4, smoke at step 3');
});

test('every reason code has words', () => {
  for (const r of REASONS) assert.ok(REASON_TEXT[r], `no words for ${r}`);
});

test('place names come from edges, nodes and members', () => {
  assert.equal(placeName(building, 'terrace-door'), 'Terrace door');
  assert.equal(placeName(building, 'beam-b2'), 'beam B2');
  assert.equal(placeName(building, 'nowhere'), 'nowhere');
});

test('Yes to all only when every answer is yes', () => {
  assert.equal(levelComplete([exampleResultPass]), true);
  assert.equal(levelComplete([exampleResultPass, exampleResultFail]), false);
  assert.equal(levelComplete([]), false);
});

test('reason words are the calm words of copy.md', () => {
  assert.deepEqual([REASON_TEXT.cannot_turn, REASON_TEXT.no_support, REASON_TEXT.no_route, REASON_TEXT.smoke_first, REASON_TEXT.no_supply],
    ['cannot turn the corner', 'nothing holds it up', 'no way through', 'smoke gets there first', 'no power reaches it']);
});
