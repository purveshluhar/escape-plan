// P1-10: the local server. One route, POST /parse, on 127.0.0.1 only.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { JevParseRequest } from '../contract/types.ts';
import { JEV_MAX_TARGETS } from '../contract/types.ts';
import { validate } from '../contract/validate.ts';
import { MAX_BODY_BYTES, MAX_TEXT_CHARS, readConfig, startServer } from './http.ts';

let server: Server;
let port = 0;

before(async () => {
  server = await startServer(readConfig({ PORT: '0' }));
  port = (server.address() as AddressInfo).port;
});
after(() => new Promise<void>((done) => server.close(() => done())));

interface Reply { status: number; headers: Record<string, string | string[] | undefined>; body: string }

// node:http, not fetch, so a test can set Host and stream a chunked body.
function call(opts: {
  method?: string; path?: string; headers?: Record<string, string>; body?: string | string[];
}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, method: opts.method ?? 'POST', path: opts.path ?? '/parse', headers: opts.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      });
    r.on('error', reject);
    if (Array.isArray(opts.body)) for (const chunk of opts.body) r.write(chunk);
    else if (opts.body !== undefined) r.write(opts.body);
    r.end();
  });
}

const json = { 'content-type': 'application/json' };
const good: JevParseRequest = {
  text: 'widen the plant shaft to 2 m',
  ops: ['widen', 'add_ramp', 'reset'],
  targets: [{ id: 'plant-shaft', name: 'Plant shaft' }, { id: 'lobby-door', name: 'Lobby door' }],
  value_range: { min: 0, max: 5 },
};
const post = (data: unknown, headers: Record<string, string> = {}) =>
  call({ headers: { ...json, ...headers }, body: JSON.stringify(data) });

test('listens on 127.0.0.1 only', () => {
  assert.equal((server.address() as AddressInfo).address, '127.0.0.1');
});

test('config refuses a non-local bind, a bad port and an unknown DECIDER', () => {
  assert.equal(readConfig({}).decider, 'keywords');
  assert.equal(readConfig({ HOST: '127.0.0.1', PORT: '8787' }).port, 8787);
  // An empty line in .env (HOST=) means "not set", so it takes the default.
  assert.deepEqual(readConfig({ HOST: '', PORT: '', DECIDER: '' }), readConfig({}));
  for (const HOST of ['0.0.0.0', '::', '[::]', '::1', 'localhost', '192.168.1.20', ' 127.0.0.1']) {
    assert.throws(() => readConfig({ HOST }), /HOST/, HOST);
  }
  for (const PORT of ['abc', '-1', '65536', '1.5', ' 80']) assert.throws(() => readConfig({ PORT }), /PORT/, PORT);
  assert.throws(() => readConfig({ DECIDER: 'strands' }), /DECIDER/);
});

test('POST /parse returns a JevParse that passes the contract schema', async () => {
  const r = await post(good);
  assert.equal(r.status, 200);
  assert.match(String(r.headers['content-type']), /^application\/json/);
  assert.equal(r.headers['cache-control'], 'no-store');
  const out = JSON.parse(r.body);
  assert.deepEqual(validate('jev.schema.json#/$defs/parse', out), []);
  assert.equal(out.op.choice, 'widen');
  assert.equal(out.target.choice, 'plant-shaft');
  assert.equal(out.value.score, 2);
});

test('a body that breaks the request schema is a 400 with the errors', async () => {
  const bad: unknown[] = [
    { ...good, ops: ['explode'] },
    { ...good, extra: 1 },
    { ...good, text: 7 },
    { text: 'x', ops: ['widen'], targets: [] },
    { ...good, targets: Array.from({ length: JEV_MAX_TARGETS + 1 }, (_, i) => ({ id: `t${i}`, name: 'x' })) },
    [good],
    null,
  ];
  for (const b of bad) {
    const r = await post(b);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 80));
    assert.ok(Array.isArray(JSON.parse(r.body).details));
  }
});

test('checks the schema cannot express are a 400 too', async () => {
  for (const b of [
    { ...good, value_range: { min: 3, max: 1 } },
    { ...good, ops: [] },
    { ...good, targets: [] },
    { ...good, targets: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] },
    { ...good, text: 'w'.repeat(MAX_TEXT_CHARS + 1) },
  ]) {
    assert.equal((await post(b)).status, 400);
  }
});

test('not JSON is a 400; a non-JSON content type is a 415', async () => {
  assert.equal((await call({ headers: json, body: '{"text":' })).status, 400);
  assert.equal((await call({ headers: { 'content-type': 'text/plain' }, body: JSON.stringify(good) })).status, 415);
  assert.equal((await call({ body: JSON.stringify(good) })).status, 415);
});

test('an oversized body is a 413, by Content-Length and when streamed', async () => {
  const big = JSON.stringify({ ...good, text: 'x'.repeat(MAX_BODY_BYTES) });
  assert.equal((await call({ headers: json, body: big })).status, 413);
  const chunk = 'x'.repeat(16 * 1024);
  const chunks = ['{"text":"', ...Array.from({ length: 6 }, () => chunk), '"}'];
  const r = await call({ headers: { ...json, 'transfer-encoding': 'chunked' }, body: chunks });
  assert.equal(r.status, 413);
});

test('other paths are 404 and other methods are 405', async () => {
  assert.equal((await call({ method: 'GET', path: '/' })).status, 404);
  assert.equal((await call({ method: 'GET', path: '/parse' })).status, 405);
  assert.equal((await call({ path: '/parse/x', headers: json, body: '{}' })).status, 404);
});

test('a foreign Host header is refused (DNS rebinding)', async () => {
  const r = await call({ headers: { ...json, host: `evil.example:${port}` }, body: JSON.stringify(good) });
  assert.equal(r.status, 403);
  assert.equal((await post(good, { host: `localhost:${port}` })).status, 200);
});

test('only the game page origins may call it from a browser', async () => {
  const bad = await post(good, { origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
  const ok = await post(good, { origin: 'http://localhost:5173' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
  const pre = await call({ method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5173', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
  assert.match(String(pre.headers['access-control-allow-headers']), /content-type/i);
  const preBad = await call({ method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(preBad.status, 403);
});

test('review: inherited key names are refused, though the contract validator lets them through', async () => {
  for (const body of [
    `{"__proto__":{"x":1},${JSON.stringify(good).slice(1)}`,
    JSON.stringify({ ...good, constructor: 'x' }),
    JSON.stringify({ ...good, toString: 1 }),
    JSON.stringify({ ...good, targets: [{ id: 'plant-shaft', name: 'Plant shaft', hasOwnProperty: 1 }] }),
  ]) {
    const r = await call({ headers: json, body });
    assert.equal(r.status, 400, body.slice(0, 40));
    assert.match(r.body, /is not allowed/);
  }
});
