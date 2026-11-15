import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadBackdrop } from './backdrop-load.ts';

// The Cityweft block is git-ignored (docs/adr/0004), so a fresh clone has no data/cityweft/.
// loadBackdrop must then resolve to null and the game keeps the plain ground.
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
