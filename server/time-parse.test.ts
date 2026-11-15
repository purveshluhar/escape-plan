// P1-12: the timing script makes 5 timed calls through POST /parse and checks every answer.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { readConfig, startServer } from './http.ts';

let server: Server;
let port = 0;
before(async () => {
  server = await startServer(readConfig({ SERVER_PORT: '0' }));
  port = (server.address() as AddressInfo).port;
});
after(() => new Promise<void>((done) => server.close(() => done())));

const script = fileURLToPath(new URL('./time-parse.ts', import.meta.url));
const runScript = (env: Record<string, string>) => new Promise<{ code: number; out: string }>((resolve) => {
  execFile(process.execPath, [script], { env: { PATH: process.env.PATH ?? '', ...env }, timeout: 20_000 }, (err, stdout, stderr) => {
    resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr });
  });
});

test('5 timed calls, each answer checked as a JevParse, exit 0', async () => {
  const { code, out } = await runScript({ SERVER_PORT: String(port) });
  assert.equal(code, 0, out);
  const calls = out.split('\n').filter((l) => /^call [1-5] /.test(l));
  assert.equal(calls.length, 5, out);
  for (const l of calls) assert.match(l, /\d+ ms .*valid JevParse/, l);
  assert.match(out, /median \d+ ms/);
});

test('a server that is not there fails the run', async () => {
  const closed = await startServer(readConfig({ SERVER_PORT: '0' }));
  const gone = (closed.address() as AddressInfo).port;
  await new Promise<void>((done) => closed.close(() => done()));
  const { code, out } = await runScript({ SERVER_PORT: String(gone) });
  assert.notEqual(code, 0, out);
});

// ---------- Adversarial review, round 1 ----------

test('review: with DECIDER=strands and Strands down, the run fails and says so', async () => {
  const closed = await startServer(readConfig({ SERVER_PORT: '0' }));
  const gone = (closed.address() as AddressInfo).port;
  await new Promise<void>((done) => closed.close(() => done()));
  const s = await startServer(readConfig({ SERVER_PORT: '0', DECIDER: 'strands', STRANDS_URL: `http://127.0.0.1:${gone}` }));
  try {
    const { code, out } = await runScript({ SERVER_PORT: String((s.address() as AddressInfo).port) });
    assert.notEqual(code, 0, out);
    assert.match(out, /decider strands/);
    assert.match(out, /no answer from the decider/);
  } finally {
    await new Promise<void>((done) => s.close(() => done()));
  }
});

test('review: the log names the decider and grades each answer against the expected edit', async () => {
  const { out } = await runScript({ SERVER_PORT: String(port) });
  assert.match(out, /decider keywords/);
  assert.match(out, /\d\/5 applied and right/);
  for (const l of out.split('\n').filter((x) => /^call [1-5] /.test(x))) assert.match(l, /(right|WRONG)/, l);
});

// ---------- Adversarial review, round 2 ----------

// A fake Strands that answers each sentence as `answers` says, so grading runs on the Strands path.
async function withFakeStrands(answers: Record<string, [string, number, string, number]>, fn: (port: number) => Promise<void>) {
  const fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const state: string = JSON.parse(raw).state;
      const hit = Object.entries(answers).find(([t]) => state.endsWith(JSON.stringify(t)));
      const [op, oc, target, tc] = hit ? hit[1] : ['widen', 0.1, 'plant', 0.1];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ answers: { op: { choice: op, confidence: oc }, target: { choice: target, confidence: tc } } }));
    });
  });
  await new Promise<void>((done) => fake.listen(0, '127.0.0.1', done));
  const s = await startServer(readConfig({ SERVER_PORT: '0', DECIDER: 'strands', STRANDS_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}` }));
  try {
    await fn((s.address() as AddressInfo).port);
  } finally {
    await new Promise<void>((done) => s.close(() => done()));
    fake.closeAllConnections();
    await new Promise<void>((done) => fake.close(() => done()));
  }
}
const RIGHT: Record<string, [string, number, string, number]> = {
  'widen the plant shaft to 2 m': ['widen', 0.99, 'plant-shaft', 0.98],
  'add a ramp at the terrace door': ['add_ramp', 0.97, 'terrace-door', 0.9],
  reset: ['reset', 0.98, 'plant', 0.4],
  'close the north door': ['close_door', 0.98, 'door-north', 0.97],
  'make the lobby door 1.5 metres wide': ['widen', 0.99, 'lobby-door', 0.92],
};

test('review 2: all 5 applied and right on the Strands path exits 0', async () => {
  await withFakeStrands(RIGHT, async (p) => {
    const { code, out } = await runScript({ SERVER_PORT: String(p) });
    assert.equal(code, 0, out);
    assert.match(out, /decider strands: .*5\/5 applied and right/);
  });
});

test('review 2: a wrong edit that would be applied fails the run; an unsure right one is not counted', async () => {
  // A wrong op on a sentence with no op word passes every plan C guard (round 2 finding 4).
  await withFakeStrands({ ...RIGHT, 'make the lobby door 1.5 metres wide': ['add_sleeve', 0.98, 'lobby-door', 0.97], reset: ['reset', 0.5, 'plant', 0.4] }, async (p) => {
    const { code, out } = await runScript({ SERVER_PORT: String(p) });
    assert.notEqual(code, 0, out);
    assert.match(out, /call 5 .*applied, WRONG/);
    assert.match(out, /call 3 .*Did you mean/);
    assert.match(out, /3\/5 applied and right/);
  });
});
