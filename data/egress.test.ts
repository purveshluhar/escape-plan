// Every place a token can be dropped must give a sensible answer: the building has the stairs,
// lifts and doors a real tower would, so a fail names a real block, never a missing route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building, SolverResult } from '../contract/types.ts';
import { mvpBuilding } from '../app/mvp.ts';
import { withStarts } from '../app/shell.ts';
import { initialState, run } from '../app/state.ts';
import { droppableNodes } from '../viewer/drop.ts';

const building = mvpBuilding(JSON.parse(readFileSync(new URL('./building.json', import.meta.url), 'utf8')) as Building);
const from = (token: string, node: string): SolverResult =>
  run(withStarts(building, new Map([[token, node]])), initialState()).results.find((r) => r.token === token)!;

test('people on level 20 walk out by the stairs', () => {
  const r = from('people', 'core-T20');
  assert.equal(r.status, 'pass');
  assert.equal(r.path[0], 'core-T20');
  assert.equal(r.path[r.path.length - 1], 'street');
  assert.ok(r.path.includes('lobby'), 'the stairs come down to the lobby');
});

test('no drop on any level leaves people, the wheelchair or the sofa with no route out', () => {
  for (const token of ['people', 'wheelchair', 'sofa']) {
    const stuck = droppableNodes(building).filter((n) => from(token, n.id).reason === 'no_route').map((n) => n.id);
    assert.deepEqual(stuck, [], token);
  }
});

test('the wheelchair rides the lifts (a service lift serves the plant); the sofa still stops at the lobby door', () => {
  const chair = from('wheelchair', 'core-T20');
  assert.equal(chair.status, 'pass', 'it takes the lifts');
  const plant = from('wheelchair', 'plant');
  assert.equal(plant.status, 'pass', 'the service lift serves the plant');
  assert.equal(from('sofa', 'core-T20').blocked_at, 'lobby-door', 'still the demo fix point');
});

test('a node named for a level number sits on that level', () => {
  const index = (level: string): number => Number(level.replace(/^[LT]/, ''));
  const wrong = building.nodes.filter((n) => {
    const m = n.name.match(/level (\d+)/i);
    return m !== null && Number(m[1]) !== index(n.level);
  }).map((n) => `${n.id} (${n.name}) on ${n.level}`);
  assert.deepEqual(wrong, []);
});
