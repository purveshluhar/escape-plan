import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levelComplete, scoreRows } from './scoreboard.ts';
import { exampleResultFail, exampleResultPass } from '../contract/examples.ts';
import type { Building } from '../contract/types.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;

test('a failed token shows its reason and where', () => {
  const [row] = scoreRows(building, [exampleResultFail]);
  assert.equal(row?.label, 'Chiller');
  assert.equal(row?.detail, 'too_narrow at door-north');
});

test('LEVEL COMPLETE only when every token passes', () => {
  assert.equal(levelComplete([exampleResultPass]), true);
  assert.equal(levelComplete([exampleResultPass, exampleResultFail]), false);
  assert.equal(levelComplete([]), false);
});
