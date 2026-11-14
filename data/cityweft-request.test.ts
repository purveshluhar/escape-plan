// Cityweft request builder: the polygon and settings we send to /v1/context. No network here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, describeStatus, polygonAreaKm2, MAX_AREA_KM2 } from './cityweft-request.ts';

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
