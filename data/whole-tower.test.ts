// The whole 432 Park tower as graph data, built from the package metadata (a small fixture here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_LEVEL, STAIR, buildTower, sliceJoin } from './whole-tower.ts';
import type { PackageMeta } from './whole-tower.ts';

const room = (floor: string, unit: string, a: [number, number], b: [number, number], type = 'Living / dining room') => ({
  floor_id: floor,
  unit_id: unit,
  room_type: type,
  bounds_gltf_m: [[a[0], 0, a[1]], [b[0], 3.8, b[1]]] as [number[], number[]],
});

const meta: PackageMeta = {
  floors: [
    { floor_id: 'Model_Level_003', level_index: 3, model_elevation_m: 18.8976, program: 'Amenity / lobby' },
    { floor_id: 'Model_Level_004', level_index: 4, model_elevation_m: 28.3464, program: 'Amenity / lobby' },
    { floor_id: 'Model_Level_010', level_index: 10, model_elevation_m: 61.4172 },
    { floor_id: 'Model_Level_019', level_index: 19, model_elevation_m: 103.9368, program: 'Open mechanical level' },
  ],
  rooms: [
    room('Model_Level_010', 'Model_Level_010_U01', [2, -8], [6, -2], 'Kitchen'),
    room('Model_Level_010', 'Model_Level_010_U01', [-0.5, -13.3], [13.3, -4.6]),
    room('Model_Level_010', 'Model_Level_010_U02', [-13.3, 5], [-1, 13.3], 'Bedroom'),
  ],
};

test('levels start above the lobby slice and keep the real elevations', () => {
  const t = buildTower(meta);
  assert.equal(FIRST_LEVEL, 4);
  assert.deepEqual(t.levels, [
    { id: 'T04', elevation: 28.3464 },
    { id: 'T10', elevation: 61.4172 },
    { id: 'T19', elevation: 103.9368 },
  ]);
});

test('a unit is its living room, moved from the centred tower frame to plan metres', () => {
  const u1 = buildTower(meta).nodes.find((n) => n.id === 'T10-u1');
  assert.deepEqual(u1?.box, { x: 13.75, y: 0.95, width: 13.8, depth: 8.7 }); // x -0.5..13.3, z -13.3..-4.6, plus 14.25
  assert.equal(u1?.level, 'T10');
  assert.equal(u1?.type, 'room');
});

test('a unit with no living room falls back to its first room', () => {
  const u2 = buildTower(meta).nodes.find((n) => n.id === 'T10-u2');
  assert.deepEqual(u2?.box, { x: 0.95, y: 19.25, width: 12.3, depth: 8.3 });
});

test('every level has a core; only apartment levels have units; mechanical bands are plant', () => {
  const t = buildTower(meta);
  assert.deepEqual(t.nodes.filter((n) => n.id.startsWith('core-')).map((n) => [n.id, n.type]), [
    ['core-T04', 'lobby'], ['core-T10', 'lobby'], ['core-T19', 'plant'],
  ]);
  assert.deepEqual(t.nodes.filter((n) => n.type === 'room').map((n) => n.id), ['T10-u1', 'T10-u2']);
});

test('each unit has a door to its core, and the cores are joined by a lift level to level', () => {
  const t = buildTower(meta);
  const door = t.edges.find((e) => e.id === 'door-T10-u2');
  assert.deepEqual([door?.from, door?.to, door?.kind, door?.clear_width, door?.step_height], ['T10-u2', 'core-T10', 'door', 1, 0]);
  const lifts = t.edges.filter((e) => e.kind === 'elevator').map((e) => [e.from, e.to]);
  assert.deepEqual(lifts, [['core-T04', 'core-T10'], ['core-T10', 'core-T19']]);
});

test('ids are unique', () => {
  const t = buildTower(meta);
  for (const list of [t.levels, t.nodes, t.edges]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
});

test('each pair of cores is joined by two egress stairs, A and B, with landings as wide as the stair', () => {
  const t = buildTower(meta);
  const stairs = t.edges.filter((e) => e.kind === 'stair');
  assert.deepEqual(stairs.map((e) => [e.id, e.from, e.to]), [
    ['stair-a-T10', 'core-T04', 'core-T10'], ['stair-b-T10', 'core-T04', 'core-T10'],
    ['stair-a-T19', 'core-T10', 'core-T19'], ['stair-b-T19', 'core-T10', 'core-T19'],
  ]);
  for (const e of stairs) {
    assert.deepEqual([e.clear_width, e.clear_height, e.step_height, e.corner_a, e.corner_b], [1.12, 2.03, 0, 1.12, 1.12], e.id);
  }
  assert.equal(stairs[0]?.name, 'Stair A to level 10');
  assert.deepEqual(STAIR, { clear_width: 1.12, clear_height: 2.03, step_height: 0, corner_a: 1.12, corner_b: 1.12 });
});

test('the slice joins the tower by lift and by both stairs, level by level down to the lobby', () => {
  const join = sliceJoin('core-T04');
  const pairs = (kind: string) => join.filter((e) => e.kind === kind).map((e) => [e.id, e.from, e.to]);
  assert.deepEqual(pairs('elevator'), [['lift-T-slice', 'lobby', 'core-T04'], ['lift-service-L3', 'lobby', 'plant']]);
  assert.deepEqual(pairs('stair'), [
    ['stair-a-L2', 'lobby', 'core-l10'], ['stair-b-L2', 'lobby', 'core-l10'],
    ['stair-a-L3', 'core-l10', 'plant'], ['stair-b-L3', 'core-l10', 'plant'],
    ['stair-a-T04', 'plant', 'core-T04'], ['stair-b-T04', 'plant', 'core-T04'],
  ]);
  assert.equal(join.find((e) => e.id === 'lift-T-slice')?.name, 'Lift to level 4');
});
