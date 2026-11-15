import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building, Edit } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { lMax } from '../solver/corner-turn.ts';
import { longestLine } from './corner.ts';
import { tokenRoute } from './layout.ts';
import {
  distanceAt, localState, planRun, runItem, tokenClock, travelSeconds, turnToward, walkClock, yawOf, TIMING,
} from './timeline.ts';
import type { RunItem } from './timeline.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const expected = JSON.parse(readFileSync(new URL('../data/expected.json', import.meta.url), 'utf8')) as
  { cases: { id: string; edits: Edit[] }[] } | { id: string; edits: Edit[] }[];
const cases = Array.isArray(expected) ? expected : expected.cases;
const edits = (id: string): Edit[] => cases.find((c) => c.id === id)!.edits;
const near = (a: number, b: number, eps: number, what: string): void =>
  assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not within ${eps} of ${b}`);

// The run items the viewer builds for the given tokens after the given edits.
function items(caseId: string, tokens: string[]): RunItem[] {
  const results = solve(building, edits(caseId)).filter((r) => tokens.includes(r.token));
  return results.map((r, i) => runItem(building, r, tokenRoute(building, r, i)));
}

test('travel takes 3 to 5 s: 5 m/s, longer for a long route, never a rush for a short one', () => {
  assert.equal(travelSeconds(25), 5);
  assert.equal(travelSeconds(6), 3);
  assert.equal(travelSeconds(40), 5);
  near(travelSeconds(20), 4, 1e-9, '20 m');
});

test('a token starts and stops gently and covers its distance at a steady pace between', () => {
  const T = travelSeconds(20);
  assert.equal(distanceAt(20, T, 0), 0);
  near(distanceAt(20, T, T), 20, 1e-9, 'arrives');
  assert.ok(distanceAt(20, T, 0.1) < 0.1 * (20 / T), 'eases in');
  const v1 = distanceAt(20, T, 2.0) - distanceAt(20, T, 1.9);
  const v2 = distanceAt(20, T, 2.5) - distanceAt(20, T, 2.4);
  near(v1, v2, 1e-9, 'steady in the middle');
  for (let t = 0; t < T; t += 0.05) assert.ok(distanceAt(20, T, t + 0.05) >= distanceAt(20, T, t), `monotone at ${t}`);
});

test('the base sofa jams at the lobby door: a stop, then the jam, then it stays', () => {
  const [sofa] = items('sofa-and-people-base', ['sofa']);
  assert.equal(sofa!.kind, 'jam');
  assert.ok(sofa!.corner, 'the lobby door corner is known');
  assert.equal(sofa!.corner!.edge, 'lobby-door');
  const T = travelSeconds(sofa!.distance);
  assert.equal(localState(sofa!, T / 2).phase, 'travel');
  const jam = localState(sofa!, T + TIMING.jamSeconds / 2);
  assert.equal(jam.phase, 'turn');
  near(jam.d, sofa!.distance, 1e-9, 'stopped at the door');
  assert.equal(localState(sofa!, T + TIMING.jamSeconds + 5).phase, 'stopped');
});

test('after the widen fix the sofa pivots at the lobby door and then carries on out', () => {
  const [sofa] = items('widen-lobby-door', ['sofa']);
  assert.equal(sofa!.kind, 'pivot');
  assert.equal(sofa!.corner!.edge, 'lobby-door');
  const reach = sofa!.corner!.at;
  const before = localState(sofa!, 0.5);
  assert.ok(before.d < reach);
  // Find the turn and check the token waits at the corner while it turns.
  let turning = 0;
  for (let t = 0; t < 20; t += 0.01) {
    const s = localState(sofa!, t);
    if (s.phase === 'turn') {
      turning += 0.01;
      near(s.d, reach, 1e-9, 'holds at the corner');
    }
  }
  near(turning, TIMING.pivotSeconds, 0.02, 'turn length');
  assert.equal(localState(sofa!, 30).phase, 'done');
  near(localState(sofa!, 30).d, sofa!.distance, 1e-9, 'out');
});

test('people and the wheelchair stop calmly at their doors: no turn', () => {
  const list = items('sofa-and-people-base', ['wheelchair', 'people']);
  for (const it of list) assert.equal(it.kind, 'stop');
});

test('decisive moments play one at a time, and the others hold still during each', () => {
  const list = items('sofa-and-people-base', ['wheelchair', 'sofa', 'people']);
  const plan = planRun(list);
  assert.equal(plan.beats.length, 3);
  for (let i = 1; i < plan.beats.length; i++) {
    assert.ok(plan.beats[i]!.wall >= plan.beats[i - 1]!.wall + plan.beats[i - 1]!.seconds - 1e-9, 'no overlap');
  }
  const b = plan.beats[0]!;
  const other = plan.beats[1]!.owner;
  const inBeat = b.wall + b.seconds / 2;
  near(tokenClock(plan, other, inBeat + 0.1) - tokenClock(plan, other, inBeat), 0, 1e-9, 'others hold');
  near(tokenClock(plan, b.owner, inBeat + 0.1) - tokenClock(plan, b.owner, inBeat), 0.1, 1e-9, 'the owner plays on');
});

test('never more than 3 decisive moments; a run with every token stays within 15 s', () => {
  for (const id of ['base', 'sofa-and-people-base', 'widen-lobby-door', 'full-demo']) {
    const plan = planRun(items(id, building.tokens.map((t) => t.id)));
    assert.ok(plan.beats.length <= TIMING.maxBeats, id);
    assert.ok(plan.end <= 15, `${id}: ${plan.end} s`);
    assert.ok(plan.end >= 4, `${id}: ${plan.end} s is too quick to follow`);
  }
});

test('a run with nothing to move ends at once', () => {
  assert.equal(planRun([]).end, 0);
});

test('headings: yaw of a plan direction, and turns ease the short way round', () => {
  near(yawOf(1, 0), 0, 1e-12, '+x');
  near(yawOf(0, -1), Math.PI / 2, 1e-12, '-z');
  const step = turnToward(0, Math.PI / 2, 0.12, TIMING.turnTau);
  assert.ok(step > 0 && step < Math.PI / 2);
  near(turnToward(0, Math.PI / 2, 10, TIMING.turnTau), Math.PI / 2, 1e-6, 'settles');
  // From 170 deg to -170 deg is 20 deg forward, not 340 deg back.
  const wrap = turnToward((170 * Math.PI) / 180, (-170 * Math.PI) / 180, 0.05, TIMING.turnTau);
  assert.ok(wrap > (170 * Math.PI) / 180, `went the long way: ${wrap}`);
});

test('with more stops than moments, the sofa jam still gets the stage', () => {
  const plan = planRun(items('base', building.tokens.map((t) => t.id)));
  const list = items('base', building.tokens.map((t) => t.id));
  const sofa = list.findIndex((it, i) => it.kind === 'jam' && solve(building, edits('base'))[i]!.token === 'sofa');
  assert.ok(sofa >= 0);
  assert.ok(plan.beats.some((b) => b.owner === sofa), 'the sofa jam is a decisive moment');
});

test('the jam lasts long enough for its two contact pulses', () => {
  assert.ok(TIMING.jamSeconds >= 1.2 + 2 / 1.5, `${TIMING.jamSeconds}`);
});

test('glass and sofa at the same door each carry their own corner numbers', () => {
  const results = solve(building, edits('base'));
  const list = results.map((r, i) => runItem(building, r, tokenRoute(building, r, i)));
  const at = (id: string): RunItem => list[results.findIndex((r) => r.token === id)]!;
  for (const id of ['glass', 'sofa']) assert.equal(at(id).kind, 'jam', id);
  assert.equal(longestLine(at('sofa').corner!.corner).length.toFixed(1), lMax(1.2, 1.5, 0.9).toFixed(1));
  assert.equal(longestLine(at('glass').corner!.corner).length.toFixed(1), lMax(1.2, 1.5, 0.05).toFixed(1));
});

test('a stair that refuses a turn shows a calm stop, not a corner turn', () => {
  const stair = building.edges.find((e) => e.kind === 'stair' && typeof e.corner_a === 'number')!;
  const r = { token: 'sofa', status: 'fail' as const, path: [stair.from], blocked_at: stair.id, reason: 'cannot_turn' as const, needed: 2.2, available: 1.5 };
  assert.equal(runItem(building, r, tokenRoute(building, r, 0)).kind, 'stop');
});

test('the smoke clock follows the people: unit on arrival, still while another moment plays', () => {
  const list = items('sofa-and-people-base', ['wheelchair', 'people']);
  const plan = planRun(list);
  const k = 1; // people
  const people = list[k]!;
  const arrive = plan.beats.find((b) => b.owner === k)!.wall; // their stop is their moment
  near(walkClock(plan, k, people, arrive, 2), 2, 1e-9, 'unit on arrival');
  const other = plan.beats.find((b) => b.owner !== k)!;
  const mid = other.wall + other.seconds / 2;
  near(walkClock(plan, k, people, mid + 0.1, 2) - walkClock(plan, k, people, mid, 2), 0, 1e-9, 'holds');
});
