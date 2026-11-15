// The Vite proxy in front of POST /parse (root vite.config.ts). The page calls /parse on its own
// origin; Vite forwards it to the server on 127.0.0.1. The server's Host and Origin checks stay as
// they are: the proxy sets Host to the server's own, and lets only same-origin page calls through.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import type { ViteDevServer } from 'vite';
import type { Building, ExpectedFile } from '../contract/types.ts';
import { readEdit } from '../app/parse-client.ts';
import { demoButtons } from '../app/state.ts';
import { readConfig, startServer } from './http.ts';
import { guardParseProxy, parseProxyTarget } from './proxy-guard.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = readJson('../data/building.json') as Building;
const buttons = demoButtons(building, readJson('../data/expected.json') as ExpectedFile);
const DEMO = 'make the lobby door 1.5 metres wide';

let parseServer: Server;
let vite: ViteDevServer;
let vitePort = 0;
let serverPort = 0;

before(async () => {
  parseServer = await startServer(readConfig({ SERVER_PORT: '0' })); // DECIDER unset: keywords
  serverPort = (parseServer.address() as AddressInfo).port;
  process.env.SERVER_PORT = String(serverPort); // read by vite.config.ts at load
  vite = await createVite({
    root, configFile: `${root}vite.config.ts`, logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1', strictPort: false, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await vite.listen();
  vitePort = (vite.httpServer!.address() as AddressInfo).port;
});
after(async () => {
  await vite.close();
  await new Promise<void>((done) => parseServer.close(() => done()));
});

interface Reply { status: number; headers: Record<string, string | string[] | undefined>; body: string }
function call(port: number, headers: Record<string, string>, body: string, method = 'POST'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, method, path: '/parse', headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    r.on('error', reject);
    r.end(body);
  });
}
const body = JSON.stringify({ text: 'widen the lobby door to 1.6 m', ops: ['widen'], targets: [{ id: 'lobby-door', name: 'Lobby door' }], value_range: { min: 0.5, max: 6 } });
const json = { 'content-type': 'application/json' };

test('the proxy target is the server on 127.0.0.1, at SERVER_PORT or 8787', () => {
  assert.equal(parseProxyTarget({}), 'http://127.0.0.1:8787');
  assert.equal(parseProxyTarget({ SERVER_PORT: '8797' }), 'http://127.0.0.1:8797');
  assert.throws(() => parseProxyTarget({ SERVER_HOST: '0.0.0.0' }), /refused/);
  assert.throws(() => parseProxyTarget({ SERVER_PORT: 'abc' }), /refused/);
});

test('a same-origin page call through Vite reaches the server and shows x-decider', async () => {
  const origin = `http://127.0.0.1:${vitePort}`;
  const r = await call(vitePort, { ...json, origin, 'sec-fetch-site': 'same-origin' }, body);
  assert.equal(r.status, 200, r.body);
  assert.equal(r.headers['x-decider'], 'keywords');
});

test('through a tunnel the page origin is not localhost, and a same-origin call still works', async () => {
  const r = await call(vitePort, { ...json, origin: 'https://demo.example-tunnel.test', 'sec-fetch-site': 'same-origin' }, body);
  assert.equal(r.status, 200, r.body);
});

test('another web page (cross-site or same-site) is refused by the proxy, before the server', async () => {
  for (const site of ['cross-site', 'same-site', 'none']) {
    const r = await call(vitePort, { ...json, origin: 'https://evil.example', 'sec-fetch-site': site }, body);
    assert.equal(r.status, 403, site);
    assert.equal(r.headers['x-decider'], undefined, site);
  }
  // An Origin with no Sec-Fetch-Site (an old browser) is refused too: fail closed.
  assert.equal((await call(vitePort, { ...json, origin: 'https://evil.example' }, body)).status, 403);
  // A cross-site preflight never gets a go-ahead for the POST.
  const pre = await call(vitePort, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'access-control-request-method': 'POST' }, '', 'OPTIONS');
  assert.equal(pre.headers['access-control-allow-origin'], undefined);
});

test('the server keeps its own checks: a direct call with a foreign Origin or Host is still 403', async () => {
  const foreign = await call(serverPort, { ...json, origin: 'https://demo.example-tunnel.test' }, body);
  assert.equal(foreign.status, 403);
  const host = await call(serverPort, { ...json, host: `evil.example:${serverPort}` }, body);
  assert.equal(host.status, 403);
});

test('Vite keeps its own Host check (DNS rebinding) in front of the proxy', async () => {
  const r = await call(vitePort, { ...json, host: `evil.example:${vitePort}`, origin: `http://evil.example:${vitePort}`, 'sec-fetch-site': 'same-origin' }, body);
  assert.equal(r.status, 403);
  assert.equal(r.headers['x-decider'], undefined);
});

test('demo sentence through Vite and the real keywords server: the app applies widen 1.5 m', async () => {
  const base = `http://127.0.0.1:${vitePort}`;
  // What a browser adds to a same-origin fetch.
  const browserFetch = ((url: string, init: RequestInit = {}) => fetch(base + url, {
    ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), origin: base, 'sec-fetch-site': 'same-origin' },
  })) as typeof fetch;
  const r = await readEdit(DEMO, buttons, building, { fetch: browserFetch });
  assert.equal(r.decider, 'keywords');
  assert.equal(r.reader, 'local');
  assert.deepEqual(r.out.edit, { op: 'widen', target: 'lobby-door', value: 1.5, source: 'text' });
});

test('the guard on its own: no Origin passes untouched; a same-origin Origin is dropped before the proxy', () => {
  const run = (headers: Record<string, string>) => {
    const req = { headers: { ...headers } } as unknown as IncomingMessage;
    let status = 0;
    let passed = false;
    const fake = { statusCode: 0, setHeader() {}, end() { status = fake.statusCode; } };
    guardParseProxy(req, fake as unknown as ServerResponse, () => { passed = true; });
    return { passed, status, headers: req.headers };
  };
  assert.deepEqual(run({ 'content-type': 'application/json' }).passed, true);
  const same = run({ origin: 'https://t.test', 'sec-fetch-site': 'same-origin' });
  assert.equal(same.passed, true);
  assert.equal(same.headers.origin, undefined);
  const cross = run({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
  assert.equal(cross.passed, false);
  assert.equal(cross.status, 403);
});

test('demo sentence, real server with DECIDER=strands (a fake Strands model): the server answer applies', async () => {
  const model = createHttpServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        answers: {
          op: { type: 'choice', choice: 'widen', confidence: 0.99, probabilities: { widen: 0.99 } },
          target: { type: 'choice', choice: 'lobby-door', confidence: 0.92, probabilities: { 'lobby-door': 0.92 } },
        },
        latency_ms: 12,
      }));
    });
  });
  await new Promise<void>((done) => model.listen(0, '127.0.0.1', done));
  const strandsServer = await startServer(readConfig({
    SERVER_PORT: '0', DECIDER: 'strands', STRANDS_URL: `http://127.0.0.1:${(model.address() as AddressInfo).port}`, STRANDS_TIMEOUT_MS: '1000',
  }));
  try {
    const base = `http://127.0.0.1:${(strandsServer.address() as AddressInfo).port}`;
    const direct = ((url: string, init: RequestInit = {}) => fetch(base + url, init)) as typeof fetch;
    const r = await readEdit(DEMO, buttons, building, { fetch: direct });
    assert.equal(r.decider, 'strands');
    assert.equal(r.reader, 'strands');
    assert.deepEqual(r.out.edit, { op: 'widen', target: 'lobby-door', value: 1.5, source: 'text' });
  } finally {
    await new Promise<void>((done) => strandsServer.close(() => done()));
    model.closeAllConnections();
    await new Promise<void>((done) => model.close(() => done()));
  }
});
