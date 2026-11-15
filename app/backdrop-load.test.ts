import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadBackdrop } from './backdrop-load.ts';

// The Cityweft block is git-ignored (docs/adr/0004), so a fresh clone has no data/cityweft/.
// loadBackdrop must then resolve to null, and the game goes on without the city.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function serve(res: () => Promise<Response>): string[] {
  const asked: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    asked.push(String(input instanceof Request ? input.url : input));
    return res();
  }) as typeof fetch;
  return asked;
}

test('no block on this machine (404): no backdrop, and block.glb is never asked for', async () => {
  const asked = serve(async () => new Response('Not Found', { status: 404 }));
  assert.equal(await loadBackdrop(), null);
  assert.deepEqual(asked, ['/data/cityweft/meta.json']);
});

test('the dev server answers a missing file with index.html: no backdrop', async () => {
  const asked = serve(async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  assert.equal(await loadBackdrop(), null);
  assert.deepEqual(asked, ['/data/cityweft/meta.json']);
});

test('a missing-file answer whose body still parses as meta: no backdrop', async () => {
  const meta = JSON.stringify({ local: { target: { x: 88, z: 260 } } });
  const asked = serve(async () => new Response(meta, { status: 404, headers: { 'content-type': 'application/json' } }));
  assert.equal(await loadBackdrop(), null);
  assert.deepEqual(asked, ['/data/cityweft/meta.json']);
});

test('a JSON body served as text/html (the index.html fallback): no backdrop', async () => {
  const meta = JSON.stringify({ local: { target: { x: 88, z: 260 } } });
  const asked = serve(async () => new Response(meta, { status: 200, headers: { 'content-type': 'text/html' } }));
  assert.equal(await loadBackdrop(), null);
  assert.deepEqual(asked, ['/data/cityweft/meta.json']);
});

test('the request itself fails: no backdrop, and block.glb is never asked for', async () => {
  const asked = serve(async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(await loadBackdrop(), null);
  assert.deepEqual(asked, ['/data/cityweft/meta.json']);
});

test('meta.json without its local target: no backdrop', async () => {
  serve(async () => Response.json({ target: { lat: 0, lon: 0 } }));
  assert.equal(await loadBackdrop(), null);
});

// The colour pass on one building, with three in Node (no WebGL needed).
import * as THREE from 'three';
import { colourBuilding } from './backdrop-load.ts';
import { buildingColors } from './backdrop.ts';

function box(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(10, 20, 10).toNonIndexed(); // flat normals per face
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData = { descriptor: { buildingFacadeColor: 0xa0522d, buildingRoofColor: 0x006400 } };
  return mesh;
}

// Linear colour of each vertex whose world normal points that way.
function coloursFacing(mesh: THREE.Mesh, dir: THREE.Vector3): Set<string> {
  const g = mesh.geometry as THREE.BufferGeometry;
  const n = g.getAttribute('normal');
  const c = g.getAttribute('color');
  const m = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const v = new THREE.Vector3();
  const out = new Set<string>();
  for (let i = 0; i < n.count; i++) {
    if (v.fromBufferAttribute(n, i).applyMatrix3(m).normalize().dot(dir) > 0.99) out.add([c.getX(i), c.getY(i), c.getZ(i)].map((x) => x.toFixed(4)).join(','));
  }
  return out;
}
const linear = (hex: string): string => new THREE.Color(hex).toArray().map((x) => x.toFixed(4)).join(',');

test('colourBuilding: faces that look up take the roof colour, the rest the facade colour, in linear RGB', () => {
  const mesh = box();
  mesh.updateMatrixWorld(true);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  colourBuilding(mesh, material);
  const { facade, roof } = buildingColors(mesh.userData.descriptor);
  assert.equal(mesh.material, material);
  assert.deepEqual([...coloursFacing(mesh, new THREE.Vector3(0, 1, 0))], [linear(roof)]);
  assert.deepEqual([...coloursFacing(mesh, new THREE.Vector3(1, 0, 0))], [linear(facade)]);
  assert.deepEqual([...coloursFacing(mesh, new THREE.Vector3(0, -1, 0))], [linear(facade)]);
});

test('colourBuilding: a Z-up node (turned -90 degrees about x) still finds its roof by world up', () => {
  const parent = new THREE.Group();
  const mesh = box(); // local +y is the box's long side
  parent.add(mesh);
  mesh.rotation.x = -Math.PI / 2; // local +z now points up in the world
  parent.updateMatrixWorld(true);
  colourBuilding(mesh, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const { facade, roof } = buildingColors(mesh.userData.descriptor);
  assert.deepEqual([...coloursFacing(mesh, new THREE.Vector3(0, 1, 0))], [linear(roof)]);
  assert.deepEqual([...coloursFacing(mesh, new THREE.Vector3(0, 0, 1))], [linear(facade)]);
});

test('colourBuilding: no descriptor gives the plain tone everywhere, and missing normals are computed', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  geometry.deleteAttribute('normal');
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  colourBuilding(mesh, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const colours = new Set<string>();
  const c = geometry.getAttribute('color');
  for (let i = 0; i < c.count; i++) colours.add([c.getX(i), c.getY(i), c.getZ(i)].map((x) => x.toFixed(4)).join(','));
  assert.deepEqual([...colours], [linear(buildingColors(undefined).facade)]);
});
