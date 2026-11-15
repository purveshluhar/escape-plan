// Where the real 432 Park typical floor sits in the viewer: on the apartment level, centred on the tower.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building } from '../contract/types.ts';
import { TYPICAL_TURN_DEG, floorPlacement, looksLikeGlb, towerFloors, towerSlabs, coveredNodes } from './typical-floors.ts';

const building = JSON.parse(readFileSync(new URL('./building.json', import.meta.url), 'utf8')) as Building;

test('the floor stands on the level that holds the apartment rooms, centred on the 28.5 m tower', () => {
  const p = floorPlacement(building);
  assert.deepEqual(p.position, [14.25, 9.4488, 14.25]); // L2 elevation in building.json
  assert.ok(Math.abs(p.rotationY - (3 * Math.PI) / 2) < 1e-12); // C_three turned 270 degrees, as on model level 10
});

test('the turn is the one the package metadata gives for model level 10', () => {
  assert.equal(TYPICAL_TURN_DEG, 270);
});

test('a building with no apartment rooms puts the floor on the ground', () => {
  const bare = { ...building, nodes: building.nodes.filter((n) => n.type !== 'room') };
  assert.equal(floorPlacement(bare).position[1], 0);
});

test('only real GLB bytes count as a floor file, so a dev server HTML fallback is ignored', () => {
  assert.equal(looksLikeGlb(new TextEncoder().encode('glTF....').buffer), true);
  assert.equal(looksLikeGlb(new TextEncoder().encode('<!doctype html>').buffer), false);
  assert.equal(looksLikeGlb(new ArrayBuffer(2)), false);
});

test('each apartment level gets its own plan node at the level elevation, turned as assigned', () => {
  const placed = towerFloors({ T10: { plan: 'B_two', turn: 180 }, T99: { plan: 'A_single', turn: 0 } }, {
    ...building,
    levels: [...building.levels, { id: 'T10', elevation: 61.4172 }],
  });
  assert.equal(placed.length, 1); // T99 is not a level in this building
  assert.equal(placed[0]?.node, 'Typical_2_Apartment_Plan');
  assert.deepEqual(placed[0]?.position, [14.25, 61.4172, 14.25]);
  assert.ok(Math.abs((placed[0]?.rotationY ?? 0) - Math.PI) < 1e-12);
});

test('levels with no plan (lobby, services, mechanical) get a plain slab and core at their elevation', () => {
  const b = {
    ...building,
    levels: [...building.levels.filter((l) => !/^T\d\d$/.test(l.id)), { id: 'T04', elevation: 28.3464 }, { id: 'T10', elevation: 61.4172 }, { id: 'T19', elevation: 103.9368 }],
  };
  const slabs = towerSlabs({ T10: { plan: 'C_three', turn: 270 } }, b);
  assert.deepEqual(slabs.map((s) => s.position), [[14.25, 28.3464, 14.25], [14.25, 103.9368, 14.25]]);
  assert.ok(slabs.every((s) => s.rotationY === 0));
});

test('the demo slice levels L1 to L3 never get a stand-in slab', () => {
  assert.deepEqual(towerSlabs({}, building).map((s) => s.position[1]).filter((y) => y < 15), []);
});

test('the real floors cover every tower node (units and cores) and none of the demo slice', () => {
  const covered = coveredNodes(building);
  assert.ok(covered.includes('T10-u1') && covered.includes('core-T10') && covered.includes('core-T86'));
  for (const id of ['plant', 'lobby', 'terrace', 'corridor', 'street', 'truck', 'core-l10', 'unit1-living']) {
    assert.ok(!covered.includes(id), id);
  }
  const tower = building.nodes.filter((n) => /^T\d\d$/.test(n.level));
  assert.equal(covered.length, tower.length);
});
