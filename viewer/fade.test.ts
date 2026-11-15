import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fadeMaterials } from './fade.ts';

test('fadeMaterials fades every material and restores exactly what was loaded', () => {
  const solid = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
  const pair = [new THREE.MeshBasicMaterial(), glass];
  const root = new THREE.Group();
  const geo = new THREE.BoxGeometry();
  root.add(new THREE.Mesh(geo, solid), new THREE.Mesh(geo, solid), new THREE.Mesh(geo, pair)); // shared and array materials
  const v0 = solid.version;

  fadeMaterials(root, 0.5);
  assert.equal(solid.opacity, 0.5);
  assert.equal(solid.transparent, true);
  assert.equal(solid.depthWrite, true, 'depth writes stay as loaded, so a fading shell never draws inside out');
  assert.equal(solid.forceSinglePass, true, 'one draw per mesh while see-through');
  assert.ok(solid.version > v0, 'a change of transparent asks three to rebuild the program');
  assert.ok(Math.abs(glass.opacity - 0.2) < 1e-12, 'already see-through glass fades from its own opacity');
  assert.equal(pair[0]!.opacity, 0.5);

  fadeMaterials(root, 0.1); // a second step keeps the loaded values, it does not compound
  assert.ok(Math.abs(glass.opacity - 0.04) < 1e-12);

  fadeMaterials(root, 1);
  assert.equal(solid.opacity, 1);
  assert.equal(solid.transparent, false);
  assert.equal(solid.depthWrite, true);
  assert.equal(solid.forceSinglePass, false);
  assert.equal(glass.opacity, 0.4);
  assert.equal(glass.transparent, true);
});
