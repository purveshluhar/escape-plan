// Cityweft request builder: the polygon and settings we send to /v1/context. No network here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequest, buildInstancesRequest, describeStatus, extractInstances, polygonAreaKm2, shiftCenter, MAX_AREA_KM2,
} from './cityweft-request.ts';

const BROADWAY_120 = { lat: 40.7085, lon: -74.0108 };

test('polygon is closed: first point equals last', () => {
  const { polygon } = buildRequest(BROADWAY_120, 150);
  assert.equal(polygon.length, 5);
  assert.deepEqual(polygon[0], polygon[4]);
});

test('polygon points are [lat, lon], not [lon, lat]', () => {
  for (const [lat, lon] of buildRequest(BROADWAY_120, 150).polygon) {
    assert.ok(lat !== undefined && lat > 40.70 && lat < 40.72, `lat ${lat}`);
    assert.ok(lon !== undefined && lon > -74.02 && lon < -74.00, `lon ${lon}`);
  }
});

test('polygon is a square about 150 m a side, centred on the point', () => {
  const { polygon } = buildRequest(BROADWAY_120, 150);
  const area = polygonAreaKm2(polygon);
  assert.ok(Math.abs(area - 0.0225) / 0.0225 < 0.03, `area ${area} km2`);
  const corners = polygon.slice(0, 4);
  const lat = corners.reduce((s, p) => s + p[0], 0) / 4;
  const lon = corners.reduce((s, p) => s + p[1], 0) / 4;
  assert.ok(Math.abs(lat - BROADWAY_120.lat) < 1e-9);
  assert.ok(Math.abs(lon - BROADWAY_120.lon) < 1e-9);
});

test('asks for a local-metre glb with every geometry type, trees and terrain included', () => {
  const body = buildRequest(BROADWAY_120, 150);
  assert.deepEqual(body.settings.geometry, [
    'buildings', 'surface', 'barriers', 'instances', 'infrastructure', 'topography',
  ]);
  assert.equal(body.settings.upAxis, 'Y');
  assert.equal(body.settings.crs, 'local');
  assert.deepEqual(body.export, { format: 'glb' });
});

test('refuses an area over the 10 km2 API limit', () => {
  assert.equal(MAX_AREA_KM2, 10);
  assert.throws(() => buildRequest(BROADWAY_120, 4000), /10 km2/);
});

test('refuses a size that is not a positive number', () => {
  assert.throws(() => buildRequest(BROADWAY_120, 0));
  assert.throws(() => buildRequest(BROADWAY_120, Number.NaN));
});

test('status messages say what to do, and never echo a key', () => {
  assert.match(describeStatus(400), /polygon/i);
  assert.match(describeStatus(401), /CITYWEFT_API_KEY/);
  assert.match(describeStatus(402), /balance|subscription/i);
  assert.match(describeStatus(503), /retry/i);
  assert.match(describeStatus(500), /500/);
});

test('both requests ask for hybrid trees (the docs recommend it)', () => {
  assert.equal(buildRequest(BROADWAY_120, 300).settings.treeSource, 'hybrid');
  assert.equal(buildInstancesRequest(BROADWAY_120, 300).settings.treeSource, 'hybrid');
});

test('the instances request is the same polygon, instances only, as JSON (no export)', () => {
  const req = buildInstancesRequest(BROADWAY_120, 300);
  assert.deepEqual(req.polygon, buildRequest(BROADWAY_120, 300).polygon);
  assert.deepEqual(req.settings.geometry, ['instances']);
  assert.equal('export' in req, false);
});

test('extractInstances keeps every valid point with its type and drops bad ones', () => {
  const response = {
    geometry: [
      { type: 'buildings', geometryType: 'meshes', meshes: [] },
      {
        type: 'instances',
        geometryType: 'nodes',
        nodes: [
          { instanceType: 'tree', x: 1, y: 2, z: 3, height: 15, rotation: 0.5 },
          { instanceType: 'bench', x: 9, y: 8, z: 7, height: 1, rotation: 2 },
          { instanceType: 'tree', x: 'bad', y: 2, z: 3, height: 15 },
          { instanceType: 'tree', x: 4, y: 5, z: 6 },
          { instanceType: 'hydrant', x: 7, y: 7, z: 7 },
          { x: 1, y: 1, z: 1 },
        ],
      },
    ],
  };
  assert.deepEqual(extractInstances(response), [
    { type: 'tree', x: 1, y: 2, z: 3, height: 15, rotation: 0.5 },
    { type: 'bench', x: 9, y: 8, z: 7, height: 1, rotation: 2 },
    { type: 'tree', x: 4, y: 5, z: 6, height: 10, rotation: 0 },
    { type: 'hydrant', x: 7, y: 7, z: 7, height: 1, rotation: 0 },
  ]);
});

test('extractInstances on an unexpected response gives nothing, never throws', () => {
  assert.deepEqual(extractInstances(undefined), []);
  assert.deepEqual(extractInstances({ geometry: 'nope' }), []);
  assert.deepEqual(extractInstances({ geometry: [] }), []);
});

test('shiftCenter moves a point by metres north and east, and shifts back exactly', () => {
  const south = shiftCenter(BROADWAY_120, -350, 0);
  assert.ok(south.lat < BROADWAY_120.lat);
  assert.equal(south.lon, BROADWAY_120.lon);
  assert.ok(Math.abs((BROADWAY_120.lat - south.lat) * 111_132 - 350) < 1);
  const east = shiftCenter(BROADWAY_120, 0, 100);
  assert.ok(east.lon > BROADWAY_120.lon);
  assert.ok(Math.abs((east.lon - BROADWAY_120.lon) * 111_320 * Math.cos((40.7085 * Math.PI) / 180) - 100) < 1);
  const back = shiftCenter(south, 350, 0);
  assert.ok(Math.abs(back.lat - BROADWAY_120.lat) < 1e-9);
});
