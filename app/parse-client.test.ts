// The typed-edit client: POST /parse, and the app's own reader when the server cannot do better.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile, JevParse, JevParseRequest } from '../contract/types.ts';
import { PARSE_TIMEOUT_MS, parseRequest, readEdit } from './parse-client.ts';
import { demoButtons } from './state.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const buttons = demoButtons(building, read('../data/expected.json') as ExpectedFile);
const DEMO = 'make the lobby door 1.5 metres wide';

// What the server's keyword parser answers for DEMO (architecture worker's finding): widen 0.00.
const keywordsAnswer: JevParse = {
  op: { choice: 'widen', confidence: 0 },
  target: { choice: 'lobby-door', confidence: 1 },
  value: { score: 1.5, confidence: 1 },
};
const strandsAnswer: JevParse = {
  op: { choice: 'widen', confidence: 0.99 },
  target: { choice: 'lobby-door', confidence: 0.92 },
  value: { score: 1.5, confidence: 1 },
};

function reply(body: unknown, decider: string | null, status = 200): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (decider !== null) headers.set('x-decider', decider);
  return new Response(JSON.stringify(body), { status, headers });
}

interface Call { url: string; init: RequestInit }
function fakeFetch(answer: (req: JevParseRequest) => Response | Promise<Response>, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return answer(JSON.parse(String(init?.body)) as JevParseRequest);
  }) as typeof fetch;
}

test('the request carries the sentence, the fixes on screen by name, and the ops they use', () => {
  const r = parseRequest('widen the plant shaft', buttons, building);
  assert.equal(r.text, 'widen the plant shaft');
  assert.deepEqual(r.targets.map((t) => t.id), ['plant-shaft', 'beam-b2', 'terrace-door', 'lobby-door', 'office-door']);
  assert.equal(r.targets.find((t) => t.id === 'lobby-door')?.name, 'Lobby door');
  assert.deepEqual([...r.ops].sort(), ['add_ramp', 'add_transfer_beam', 'widen']);
  assert.ok(r.value_range.min <= r.value_range.max);
});

test('it posts JSON to /parse with the request', async () => {
  const calls: Call[] = [];
  await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply(strandsAnswer, 'strands'), calls) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, '/parse');
  assert.equal(calls[0]!.init.method, 'POST');
  assert.equal(new Headers(calls[0]!.init.headers).get('content-type'), 'application/json');
  assert.equal((JSON.parse(String(calls[0]!.init.body)) as JevParseRequest).text, DEMO);
});

test('demo sentence, keywords server: the app reader applies it, not the server answer (widen 0.00)', async () => {
  const r = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply(keywordsAnswer, 'keywords')) });
  assert.equal(r.why, 'keywords');
  assert.equal(r.decider, 'keywords');
  assert.equal(r.reader, 'local');
  assert.deepEqual(r.out.edit, { op: 'widen', target: 'lobby-door', value: 1.5, source: 'text' });
  assert.ok(r.out.parse.op.confidence >= 0.8, 'the app reader is sure of widen');
});

test('demo sentence, Strands server: the server answer is used and applied', async () => {
  const r = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply(strandsAnswer, 'strands')) });
  assert.equal(r.why, 'strands');
  assert.equal(r.decider, 'strands');
  assert.equal(r.reader, 'strands');
  assert.deepEqual(r.out.parse, strandsAnswer);
  assert.deepEqual(r.out.edit, { op: 'widen', target: 'lobby-door', value: 1.5, source: 'text' });
});

test('a Strands answer under 0.8 is "not sure": nothing applies, and the target it read is offered first', async () => {
  const unsure: JevParse = { ...strandsAnswer, target: { choice: 'office-door', confidence: 0.6 } };
  const r = await readEdit('widen the door a bit', buttons, building, { fetch: fakeFetch(() => reply(unsure, 'strands')) });
  assert.equal(r.reader, 'strands');
  assert.equal(r.out.edit, null);
  assert.equal(r.out.suggestions[0]?.edit.target, 'office-door');
  assert.ok(r.out.suggestions.length <= 3);
});

test('a sure Strands answer that is no fix on screen (widen a beam) is not applied', async () => {
  const odd: JevParse = { op: { choice: 'widen', confidence: 0.95 }, target: { choice: 'beam-b2', confidence: 0.95 }, value: { score: 2, confidence: 0.95 } };
  const r = await readEdit('widen beam b2 to 2 m', buttons, building, { fetch: fakeFetch(() => reply(odd, 'strands')) });
  assert.equal(r.out.edit, null);
});

test('server down: the app reader answers', async () => {
  const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  const r = await readEdit(DEMO, buttons, building, { fetch: down });
  assert.equal(r.why, 'down');
  assert.equal(r.decider, null);
  assert.equal(r.reader, 'local');
  assert.deepEqual(r.out.edit, { op: 'widen', target: 'lobby-door', value: 1.5, source: 'text' });
});

test('server down behind the Vite proxy (502, no x-decider): the strip says down, not refused', async () => {
  const r = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => new Response('', { status: 502 })) });
  assert.equal(r.why, 'down');
  assert.equal(r.decider, null);
  assert.ok(r.out.edit);
  // The server's own 500 carries no x-decider either (server/http.ts sets it on 200 only): refused.
  const own = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply({ error: 'internal error', details: [] }, null, 500)) });
  assert.equal(own.why, 'refused');
});

test('Strands gave no answer (down, slow or busy: every confidence 0): the app reader answers (review C3)', async () => {
  const none: JevParse = { op: { choice: 'widen', confidence: 0 }, target: { choice: 'plant-shaft', confidence: 0 }, value: { score: 1.5, confidence: 1 } };
  const r = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply(none, 'strands')) });
  assert.equal(r.why, 'no-model');
  assert.equal(r.decider, 'strands');
  assert.equal(r.reader, 'local');
  assert.deepEqual(r.out.edit, { op: 'widen', target: 'lobby-door', value: 1.5, source: 'text' });
});

test('server slower than the timeout: the request is cut and the app reader answers', async () => {
  assert.equal(PARSE_TIMEOUT_MS, 2500);
  let aborted = false;
  const slow = ((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => {
    init?.signal?.addEventListener('abort', () => {
      aborted = true;
      rej(new DOMException('aborted', 'AbortError'));
    });
  })) as typeof fetch;
  const r = await readEdit(DEMO, buttons, building, { fetch: slow, timeoutMs: 20 });
  assert.ok(aborted, 'the fetch was aborted');
  assert.equal(r.why, 'slow');
  assert.equal(r.reader, 'local');
  assert.ok(r.out.edit);
});

test('a refused request (403) or a broken answer falls back to the app reader', async () => {
  const refused = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply({ error: 'origin not allowed', details: [] }, null, 403)) });
  assert.equal(refused.why, 'refused');
  assert.equal(refused.reader, 'local');
  assert.ok(refused.out.edit);
  // A Strands-labelled answer naming a target that was never sent is not trusted.
  const alien: JevParse = { ...strandsAnswer, target: { choice: 'no-such-door', confidence: 0.99 } };
  const bad = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply(alien, 'strands')) });
  assert.equal(bad.why, 'refused');
  assert.equal(bad.reader, 'local');
  const notJson = await readEdit(DEMO, buttons, building, {
    fetch: (async () => new Response('<html>', { status: 200, headers: { 'x-decider': 'strands' } })) as typeof fetch,
  });
  assert.equal(notJson.reader, 'local');
});

test('the reading says how long it took', async () => {
  let t = 1000;
  const now = () => (t += 40);
  const r = await readEdit(DEMO, buttons, building, { fetch: fakeFetch(() => reply(strandsAnswer, 'strands')), now });
  assert.equal(r.ms, 40);
});

test('browser code: parse-client.ts imports nothing from node or server', () => {
  const src = readFileSync(new URL('./parse-client.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from 'node:|from '\.\.\/server\//);
});
