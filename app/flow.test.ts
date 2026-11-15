import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterRun, badgeFor, exitsFor, fixesFor, newlyBlocked, nextBlocked, objectFacts, viewFor } from './flow.ts';
import { relevantTargets } from './answers.ts';
import { demoButtons } from './state.ts';
import type { Building, ExpectedFile, SolverResult } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const buttons = demoButtons(building, expected);
const token = (id: string) => building.tokens.find((t) => t.id === id)!;
const r = (t: string, status: 'pass' | 'fail'): SolverResult => ({
  token: t, status, path: [], blocked_at: null, reason: status === 'fail' ? 'no_route' : null, needed: null, available: null,
});

test('views follow design/flow.md: shaded to pick, x-ray to aim, exploded floors to fix', () => {
  assert.equal(viewFor('start'), 'shaded');
  assert.equal(viewFor('select'), 'shaded');
  assert.equal(viewFor('ready'), 'xray');
  assert.equal(viewFor('clash'), 'floors');
  assert.equal(viewFor('proposal'), 'floors');
  assert.equal(viewFor('complete'), 'xray');
});

test('the badge says CONFLICT only when a run newly blocked something', () => {
  assert.equal(badgeFor('result', true), 'CONFLICT');
  assert.equal(badgeFor('result', false), 'ESCAPED');
  assert.equal(badgeFor('clash', false), 'BLOCKED');
});

test('object cards come from building.json', () => {
  const c = objectFacts(building, token('chiller'));
  assert.equal(c.name, 'CHILLER');
  assert.equal(c.line, 'MEP · 1.6 × 2 × 2.4 m · Mechanical level plant');
  assert.equal(objectFacts(building, token('load')).line, 'Structure · beam B2');
});

test('exits: the goal node, any exit node, or the ground for the load', () => {
  assert.deepEqual(exitsFor(building, token('chiller')).map((x) => x.id), ['truck']);
  assert.deepEqual(exitsFor(building, token('wheelchair')).map((x) => x.id), ['street']);
  assert.deepEqual(exitsFor(building, token('load')).map((x) => x.id), ['f1']);
});

test('each object is offered only its own preset fix, and only until it is applied', () => {
  const fix = (id: string, applied = [] as typeof buttons[number]['edit'][]) =>
    fixesFor(buttons, relevantTargets(building, expected, id), applied).map((b) => b.label);
  assert.deepEqual(fix('chiller'), ['Widen plant shaft to 2.0 m']);
  assert.deepEqual(fix('wheelchair'), ['Add ramp at terrace door']);
  assert.deepEqual(fix('glass'), ['Widen lobby door to 1.6 m']);
  assert.deepEqual(fix('load', [buttons[0]!.edit]), ['Add transfer beam at beam B2']);
});

test('ESCAPE! leads to clash, result or level complete', () => {
  assert.equal(afterRun([r('chiller', 'fail'), r('load', 'pass')], 'chiller'), 'clash');
  assert.equal(afterRun([r('chiller', 'pass'), r('load', 'fail')], 'chiller'), 'result');
  assert.equal(afterRun([r('chiller', 'pass'), r('load', 'pass')], 'chiller'), 'complete');
  assert.equal(nextBlocked([r('chiller', 'pass'), r('load', 'fail')]), 'load');
});

test('a conflict is a pass that turned into a fail', () => {
  const before = [r('chiller', 'fail'), r('load', 'pass')];
  const after = [r('chiller', 'pass'), r('load', 'fail')];
  assert.deepEqual(newlyBlocked(before, after).map((x) => x.token), ['load']);
  assert.deepEqual(newlyBlocked(null, after), []);
});
