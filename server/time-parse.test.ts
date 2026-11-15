// P1-12: the timing script makes 5 timed calls through POST /parse and checks every answer.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
  assert.match(out, /\d\/5 right/);
  for (const l of out.split('\n').filter((x) => /^call [1-5] /.test(x))) assert.match(l, /(right|WRONG)/, l);
});
