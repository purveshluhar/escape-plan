// The whole 432 Park tower as graph data, built from the package metadata (a small fixture here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_LEVEL, buildTower } from './whole-tower.ts';
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
