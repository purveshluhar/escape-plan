import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOWER_CENTRE, backdropMatrix, coversPoint, layerColor, metaToBlock, toViewer } from './backdrop.ts';

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
const anchor = { x: 255.5, z: -96 }; // the real tower's footprint centre in the fetched block

test('meta local points (x north, z east) convert to the block frame (x east, z south)', () => {
  assert.deepEqual(metaToBlock({ x: 88, z: 260 }), { x: 260, z: -88 });
});

test('the real tower lands on our tower centre, with its ground at y = 0', () => {
  const m = backdropMatrix(anchor, 14);
  const [x, y, z] = toViewer(m, { x: anchor.x, y: 14, z: anchor.z });
  assert.ok(near(x, TOWER_CENTRE.x) && near(y, 0) && near(z, TOWER_CENTRE.z));
});

test('true north is turned 29 degrees west of grid north (-z), with no scaling', () => {
  const m = backdropMatrix(anchor);
  const [x0, , z0] = toViewer(m, anchor);
  const [x1, , z1] = toViewer(m, { x: anchor.x, z: anchor.z - 100 }); // 100 m true north
  const dx = x1 - x0;
  const dz = z1 - z0;
  assert.ok(near(Math.hypot(dx, dz), 100));
  assert.ok(dz < 0 && dx < 0);
  assert.ok(near((Math.atan2(-dx, -dz) * 180) / Math.PI, 29));
});

test('the turn keeps handedness (no mirror) and up stays up', () => {
  const m = backdropMatrix(anchor);
  const e = [m[0]!, m[1]!, m[2]!];
  const u = [m[4]!, m[5]!, m[6]!];
  const s = [m[8]!, m[9]!, m[10]!];
  const cross = [u[1]! * s[2]! - u[2]! * s[1]!, u[2]! * s[0]! - u[0]! * s[2]!, u[0]! * s[1]! - u[1]! * s[0]!];
  assert.ok(near(e[0]! * cross[0]! + e[1]! * cross[1]! + e[2]! * cross[2]!, 1));
  assert.deepEqual(u, [0, 1, 0]);
});

test('layer colours and the tower cut-out', () => {
  assert.equal(layerColor('Premium_USA_Buildings_-_Detailed_46'), '#eef0f4');
  assert.equal(layerColor('grass_3'), '#d6e3d0');
  assert.equal(layerColor('something_new'), '#e4e7ec');
  assert.ok(coversPoint({ minX: 229, maxX: 282, minZ: -123, maxZ: -69 }, { x: 260, z: -88 }));
  assert.ok(!coversPoint({ minX: 300, maxX: 320, minZ: -123, maxZ: -69 }, { x: 260, z: -88 }));
});
