// Cityweft request builder: the polygon and settings we send to /v1/context. No network here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequest, buildInstancesRequest, describeStatus, extractInstances, polygonAreaKm2, describeLimit, isConnectError, retryDelayMs, shiftCenter, toLocal, MAX_AREA_KM2, MAX_ATTEMPTS, MAX_WAIT_MS,
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

test('toLocal gives block metres: x north and z east from the south-west corner', () => {
  const centre = { lat: 40.7127, lon: -74.0134 };
  const at = (p: { lat: number; lon: number }) => toLocal(p, centre, 800);
  assert.deepEqual(at(centre), { x: 400, z: 400 });
  const north = at(shiftCenter(centre, 350, 0));
  assert.ok(Math.abs(north.x - 750) < 1e-6 && Math.abs(north.z - 400) < 1e-6);
  const east = at(shiftCenter(centre, 0, 100));
  assert.ok(Math.abs(east.z - 500) < 1e-6 && Math.abs(east.x - 400) < 1e-6);
});

// Retries: https://cityweft.gitbook.io/docs/getting-started/api-reference.md lists 503 (busy, with
// Retry-After). https://cityweft.gitbook.io/docs/basics/usage-limits.md: "Don't retry a 429
// automatically" and show its message. Every successful request is billed by area, so only answers
// that say the request was not served (503) and errors before the request left (connect errors) retry.
const NOW = Date.parse('2026-11-15T12:00:00Z');

test('a busy answer (503) and a connect error (status 0) are retried', () => {
  assert.ok(retryDelayMs(503, 1, null, () => 0.5, NOW)! > 0);
  assert.ok(retryDelayMs(0, 1, null, () => 0.5, NOW)! > 0);
});

test('nothing else is retried: 429 (usage limit), 402, 400, 401, and 500/502/504 (may have been billed)', () => {
  for (const s of [200, 400, 401, 402, 404, 429, 500, 502, 504]) {
    assert.equal(retryDelayMs(s, 1, '3', () => 0.5, NOW), null, `status ${s}`);
  }
});

test('Retry-After in seconds or as an HTTP date is honoured', () => {
  assert.equal(retryDelayMs(503, 1, '7', () => 0.5, NOW), 7000);
  assert.equal(retryDelayMs(503, 1, 'Sun, 15 Nov 2026 12:00:30 GMT', () => 0.5, NOW), 30_000);
  assert.equal(retryDelayMs(503, 1, 'Sun, 15 Nov 2026 11:59:00 GMT', () => 0.5, NOW), 0); // already past
});

test('a Retry-After longer than the longest wait gives up instead of calling back early', () => {
  assert.equal(retryDelayMs(503, 1, '9999', () => 0.5, NOW), null);
  assert.equal(retryDelayMs(503, 1, 'Mon, 16 Nov 2026 12:00:00 GMT', () => 0.5, NOW), null);
  assert.ok(retryDelayMs(503, 1, String(MAX_WAIT_MS / 1000), () => 0.5, NOW)! <= MAX_WAIT_MS);
});

test('an unreadable Retry-After falls back to the doubling wait', () => {
  assert.equal(retryDelayMs(503, 1, 'soon', () => 0, NOW), retryDelayMs(503, 1, null, () => 0, NOW));
});

test('without Retry-After the wait doubles each attempt, with jitter, and stays under five minutes', () => {
  const lo = (a: number) => retryDelayMs(503, a, null, () => 0, NOW)!;
  const hi = (a: number) => retryDelayMs(503, a, null, () => 0.999, NOW)!;
  assert.ok(lo(2) >= 2 * lo(1) - 1 && lo(3) >= 2 * lo(2) - 1, 'doubles');
  assert.ok(hi(1) > lo(1), 'jitter');
  assert.ok(hi(4) < 5 * 60 * 1000);
});

test('at most MAX_ATTEMPTS tries, and all the waits add up to under ten minutes', () => {
  assert.equal(retryDelayMs(503, MAX_ATTEMPTS, null, () => 0.5, NOW), null);
  assert.ok(MAX_ATTEMPTS <= 5);
  let total = 0;
  for (let a = 1; a < MAX_ATTEMPTS; a++) total += retryDelayMs(503, a, String(MAX_WAIT_MS / 1000), () => 0.999, NOW)!;
  assert.ok(total < 10 * 60 * 1000, `${total} ms`);
});

test('only an error before the request left counts as a connect error', () => {
  const connect = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) });
  const dns = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }) });
  const reset = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) });
  const badHeader = new TypeError('Headers.append: "Bearer cw_FAKE\nX" is an invalid header value.');
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  assert.equal(isConnectError(connect), true);
  assert.equal(isConnectError(dns), true);
  assert.equal(isConnectError(reset), false); // may have reached the server
  assert.equal(isConnectError(badHeader), false);
  assert.equal(isConnectError(timeout), false);
  assert.equal(isConnectError('nope'), false);
});

test('a usage-limit answer shows its message, when it resets and what is left', () => {
  const line = describeLimit({
    code: 'USAGE_LIMIT_REACHED', remainingKm2: 0.2, requestKm2: 0.4, resetsAt: '2026-12-06T09:00:00.000Z',
    message: 'This token has 0.2 km2 left.\nRaise it at https://app.cityweft.com/api-tokens.',
  });
  assert.match(line, /^429: /);
  assert.match(line, /0\.2 km2 left/);
  assert.match(line, /2026-12-06T09:00:00\.000Z/);
  assert.doesNotMatch(line, /\n/); // control characters from the body are flattened
});

test('a usage-limit body that is missing or odd still gives a plain 429 line, and never echoes a key', () => {
  assert.equal(describeLimit(null), describeStatus(429));
  assert.equal(describeLimit('x'), describeStatus(429));
  assert.doesNotMatch(describeLimit({ message: 'key cw_live_abcDEF123 is paused' }), /cw_live_abcDEF123/);
  assert.ok(describeLimit({ message: 'x'.repeat(5000) }).length < 600);
});

test('the status lines name 429 and never carry a key', () => {
  assert.match(describeStatus(429), /^429/);
  for (const s of [0, 400, 401, 402, 429, 503, 500]) assert.doesNotMatch(describeStatus(s), /cw_|Bearer/);
});
