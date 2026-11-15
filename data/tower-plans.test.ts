// Which typical floor plan each apartment floor of 432 Park uses, and where its rooms land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignPlans, glbRoomName, planRooms, rotateToGlb } from './tower-plans.ts';
import type { TypicalPlan } from './tower-plans.ts';

const floors = [
  { floor_id: 'Model_Level_004', level_index: 4, model_elevation_m: 28.3, program: 'Amenity / lobby' },
  ...[10, 11, 12, 13, 14, 15, 16, 17, 18].map((n) => ({
    floor_id: `Model_Level_0${n}`, level_index: n, model_elevation_m: 60 + n, rotation_degrees: 90 * (n % 4),
  })),
  { floor_id: 'Model_Level_019', level_index: 19, model_elevation_m: 103.9, program: 'Open mechanical level' },
];

test('the same seed gives the same plans, and a different seed gives different ones', () => {
  assert.deepEqual(assignPlans(floors, 432), assignPlans(floors, 432));
  assert.notDeepEqual(assignPlans(floors, 432), assignPlans(floors, 7));
});

test('only apartment floors get a plan, and each keeps the turn the package gave it', () => {
  const a = assignPlans(floors, 432);
  assert.deepEqual(Object.keys(a), ['T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18']);
  assert.equal(a.T11?.turn, 270); // the fixture turns level n by 90 * (n mod 4)
  for (const v of Object.values(a)) assert.ok(['A_single', 'B_two', 'C_three', 'D_four'].includes(v.plan));
});

test('over many floors every plan turns up', () => {
  const many = Array.from({ length: 54 }, (_, i) => ({
    floor_id: `Model_Level_${100 + i}`, level_index: 10 + i, model_elevation_m: i, rotation_degrees: 0,
  }));
  const used = new Set(Object.values(assignPlans(many, 432)).map((v) => v.plan));
  assert.equal(used.size, 4);
});

test('a plan point turns into the tower frame: 270 degrees sends plan +x to +z (south)', () => {
  const p = rotateToGlb(10, 0, 270);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.z - 10) < 1e-9);
  const q = rotateToGlb(3, 4, 0);
  assert.deepEqual([q.x, q.z], [3, -4]); // the GLB lays plan y toward -z
});

test('the GLB room node a tower room refers to', () => {
  assert.equal(glbRoomName('C_three', 'C_three_R004'), 'Typical_3_Apartment_Plan_R004');
  assert.equal(glbRoomName('A_single', 'A_single_R001'), 'Typical_1_Apartment_Plan_R001');
});

test('plan rooms are turned into package-style rooms with bounds in the tower frame', () => {
  const plan: TypicalPlan = {
    id: 'C_three',
    rooms: [{
      prototype_room_id: 'C_three_R001', room_type: 'Living', unit_index: 1, model_area_m2: 20,
      polygon: { coordinates: [[[0, 0], [10, 0], [10, 4], [0, 4], [0, 0]]] },
    }],
  };
  const [r] = planRooms('Model_Level_010', { plan: 'C_three', turn: 0 }, [plan]);
  assert.equal(r?.unit_id, 'Model_Level_010_U01');
  assert.equal(r?.room_type, 'Living');
  assert.deepEqual(r?.bounds_gltf_m, [[0, 0, -4], [10, 3.81, 0]]);
});
