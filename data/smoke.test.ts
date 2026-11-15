// The smoke race on the real building data: smoke starts in the lobby, people race it, closing the
// lobby door lets them win. The cases are in data/expected.json (ids start with `smoke-`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building, Edit, ExpectedFile, SolverResult } from '../contract/types.ts';
import { applyEdits, solve } from '../solver/index.ts';
import { smokeArrival } from '../solver/spread.ts';
import { withStarts } from '../app/shell.ts';
import { SMOKE, SMOKE_CASE_PREFIX, SMOKE_FIX_EDGE, caseBuilding, withSmoke } from './smoke.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('./building.json') as Building;
const expected = read('./expected.json') as ExpectedFile;
const edit = (op: Edit['op'], target: string, value: number | null = null): Edit => ({ op, target, value, source: 'button' });
const widenOffice = edit('widen', 'office-door', 0.9);
const closeLobby = edit('close_door', SMOKE_FIX_EDGE);
const of = (results: SolverResult[], token: string): SolverResult => results.find((r) => r.token === token)!;

test('smoke starts in the lobby, spreads, and is not in building.json', () => {
  assert.deepEqual([SMOKE.start, SMOKE.rule, SMOKE.discipline], ['lobby', 'spread', 'fire']);
  assert.ok(!building.tokens.some((t) => t.id === 'smoke'), 'with smoke always there, people lose to it in every case');
  assert.ok(building.nodes.some((n) => n.id === SMOKE.start));
});

test('withSmoke adds the smoke once and leaves the input alone', () => {
  const raced = withSmoke(building);
  assert.equal(raced.tokens.length, building.tokens.length + 1);
  assert.equal(withSmoke(raced), raced);
  assert.ok(!building.tokens.some((t) => t.id === 'smoke'));
});

test('caseBuilding adds smoke for a smoke- case and for nothing else', () => {
  assert.equal(caseBuilding(building, { id: 'widen-office-door' }), building);
  assert.ok(caseBuilding(building, { id: `${SMOKE_CASE_PREFIX}anything` }).tokens.some((t) => t.id === 'smoke'));
});

test('there are race cases in expected.json, and each one names smoke_first or a pass for people', () => {
  const race = expected.cases.filter((c) => c.id.startsWith(SMOKE_CASE_PREFIX));
  assert.ok(race.length >= 3, 'the race cases are in expected.json');
  const reasons = race.flatMap((c) => c.expect.filter((e) => e.token === 'people').map((e) => e.reason ?? e.status));
  assert.ok(reasons.includes('smoke_first') && reasons.includes('pass'));
});

test('the building without smoke still lets people out after the office door is widened (old case holds)', () => {
  assert.equal(of(solve(building, [widenOffice]), 'people').status, 'pass');
});

test('smoke at the lobby: people reach the corridor at step 1, the same step as the smoke, and lose the tie', () => {
  const r = of(solve(withSmoke(building), [widenOffice]), 'people');
  assert.deepEqual([r.status, r.reason, r.blocked_at, r.needed, r.available], ['fail', 'smoke_first', 'corridor', 1, 1]);
});

test('closing the lobby door puts the smoke one step behind the people, who get out at step 2', () => {
  const b = withSmoke(building);
  const r = of(solve(b, [widenOffice, closeLobby]), 'people');
  assert.deepEqual([r.status, r.path, r.time], ['pass', ['office', 'corridor', 'street'], 2]);
  const smoke = smokeArrival(applyEdits(b, [widenOffice, closeLobby]));
  assert.equal(smoke.get('corridor'), 2, 'smoke gets round by the core and the plant, one step later');
});

test('the wheelchair and the sofa still pass with the smoke there, with or without the door closed', () => {
  const fixes = [widenOffice, edit('widen', 'lobby-door', 1.6), edit('add_ramp', 'terrace-door')];
  for (const edits of [fixes, [...fixes, closeLobby]]) {
    const out = solve(withSmoke(building), edits);
    assert.equal(of(out, 'wheelchair').status, 'pass');
    assert.equal(of(out, 'sofa').status, 'pass');
  }
});

// The stairs data: people start on a tower floor and walk down. Finding, not a wish: smoke goes up
// the cores and shafts, one level per step, so it is ahead of people on every upper floor, and the
// lobby door does not matter there.
test('from upper floors smoke wins whatever door is closed (stairs data)', () => {
  const raced = withSmoke(building);
  for (const start of ['core-T10', 'core-T20', 'T10-u1']) {
    for (const edits of [[widenOffice], [widenOffice, closeLobby]]) {
      const r = of(solve(withStarts(raced, new Map([['people', start]])), edits), 'people');
      assert.deepEqual([r.status, r.reason], ['fail', 'smoke_first'], `${start}, ${edits.length} edits`);
    }
  }
});

// These two were expected cases once. They cost two more solves in the 100 ms budget test (ADR 0002) on
// every run, so they live here, where they are checked on the building with smoke.
test('smoke in the lobby, office door still narrow: people are stuck at the door, with or without the lobby door closed', () => {
  for (const edits of [[], [closeLobby]]) {
    const r = of(solve(withSmoke(building), edits), 'people');
    assert.deepEqual([r.status, r.reason, r.blocked_at, r.path], ['fail', 'too_narrow', 'office-door', ['office']]);
  }
});
