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
  assert.equal(row?.detail, 'too narrow at Plant shaft');
  assert.equal(row?.numbers, 'needs 1.6 m, has 1.2 m');
});

test('a passed token says escaped and shows no numbers', () => {
  const [row] = scoreRows(building, [exampleResultPass]);
  assert.deepEqual([row?.status, row?.detail, row?.numbers], ['pass', 'escaped', '']);
});

test('a fail without numbers, such as no support at a member, shows no numbers line', () => {
  const noSupport: SolverResult = {
    token: 'load', status: 'fail', path: ['beam-b2'], blocked_at: 'beam-b2',
    reason: 'no_support', needed: null, available: null,
  };
  const [row] = scoreRows(building, [noSupport]);
  assert.equal(row?.detail, 'no support at beam B2');
  assert.equal(row?.numbers, '');
});

test('the people and smoke race counts time steps, not metres', () => {
  assert.equal(numbersText(exampleResultPeople), 'needs 4 steps, has 3 steps');
});

test('every reason code has words', () => {
  for (const r of REASONS) assert.ok(REASON_TEXT[r], `no words for ${r}`);
});

test('place names come from edges, nodes and members', () => {
  assert.equal(placeName(building, 'terrace-door'), 'Terrace door');
  assert.equal(placeName(building, 'beam-b2'), 'beam B2');
  assert.equal(placeName(building, 'nowhere'), 'nowhere');
});

test('LEVEL COMPLETE only when every token passes', () => {
  assert.equal(levelComplete([exampleResultPass]), true);
  assert.equal(levelComplete([exampleResultPass, exampleResultFail]), false);
  assert.equal(levelComplete([]), false);
});
