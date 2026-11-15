// POST /votes: one vote per discipline after an edit (JevVote, ADR 0002). The rules vote with no
// model; DECIDER=strands asks a fake Strands server on 127.0.0.1, so no model is needed here.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Building, Edit, JevVote, JevVoteRequest } from '../contract/types.ts';
import { validate } from '../contract/validate.ts';
import { solve } from '../solver/index.ts';
import { readConfig, startServer } from './http.ts';
import { parse } from './parse.ts';
import type { DeciderConfig } from './parse.ts';
import { MAX_VOTE_REQUESTS, ruleVote, vote } from './votes.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const SHAFT: Edit = { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' };
const beforeAll = solve(building);
const afterAll = solve(building, [SHAFT]);
const ask = (token: string): JevVoteRequest => {
  const discipline = building.tokens.find((t) => t.id === token)!.discipline;
  return { discipline, edit: SHAFT, before: beforeAll.find((r) => r.token === token)!, after: afterAll.find((r) => r.token === token)! };
};
// One per discipline in the data: the shaft edit lets the chiller out and cuts beam B2.
const panel = ['chiller', 'sofa', 'wheelchair', 'load', 'people'].map(ask);

type Handler = (body: Record<string, any>, res: ServerResponse) => void;
let handler: Handler;
const seen: Record<string, any>[] = [];
let fake: Server;
let fakeUrl = '';

const answers = (picks: Record<string, [string, number]>): Handler => (_b, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    answers: Object.fromEntries(Object.entries(picks).map(([k, [choice, confidence]]) => [k, { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } }])),
    latency_ms: 12,
  }));
};
// The model reads the shaft edit as fine: structure accepts it, though the rules find beam B2 cut.
const MODEL = answers({ mep: ['accept', 0.93], structure: ['accept', 0.72] });

before(async () => {
  fake = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => { raw += c; });
    req.on('end', () => {
      const body = raw === '' ? {} : JSON.parse(raw);
      seen.push({ path: req.url, body });
      handler(body, res);
    });
  });
  await new Promise<void>((done) => fake.listen(0, '127.0.0.1', done));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((done) => { fake.closeAllConnections(); fake.close(() => done()); }));
beforeEach(() => { seen.length = 0; handler = MODEL; });

const strands = (env: Record<string, string> = {}): DeciderConfig =>
  readConfig({ DECIDER: 'strands', STRANDS_URL: fakeUrl, STRANDS_TIMEOUT_MS: '500', ...env });
const keywords: DeciderConfig = readConfig({});
const short = (votes: JevVote[]) => votes.map((v) => `${v.discipline}:${v.token}:${v.vote}:${v.confidence}`);
const RULES = ['mep:chiller:accept:1', 'logistics:sofa:review:1', 'accessibility:wheelchair:review:1', 'structure:load:object:1', 'life_safety:people:review:1'];

test('the rules vote from what changed: Yes after is accept, Yes to No is object, still No is review', () => {
  assert.deepEqual(short(panel.map(ruleVote)), RULES);
  // Still Yes is accept too.
  const fixed = ask('chiller');
  assert.equal(ruleVote({ ...fixed, before: fixed.after }).vote, 'accept');
});

test('DECIDER=keywords: the rules vote, and no model is asked', async () => {
  const out = await vote(panel, keywords);
  assert.equal(out.voter, 'rules');
  assert.deepEqual(short(out.votes), RULES);
  assert.equal(seen.length, 0);
});

test('DECIDER=strands: one Strands call asks only the disciplines whose answer changed; the rules vote the rest', async () => {
  const out = await vote(panel, strands());
  assert.equal(out.voter, 'strands');
  assert.deepEqual(short(out.votes), [
    'mep:chiller:accept:0.93', 'logistics:sofa:review:1', 'accessibility:wheelchair:review:1', 'structure:load:accept:0.72', 'life_safety:people:review:1',
  ]);
  for (const v of out.votes) assert.deepEqual(validate('jev.schema.json#/$defs/vote', v), []);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.path, '/v1/systemone');
  const qs = seen[0]!.body.questions as Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
  // About 1 s per question on a CPU: five do not fit the budget, the one or two that changed do.
  assert.deepEqual(Object.keys(qs), ['mep', 'structure']);
  for (const q of Object.values(qs)) {
    assert.equal(q.type, 'choice');
    assert.deepEqual(Object.keys(q.criteria), ['accept', 'object', 'review']);
  }
  // The model sees what the rules found before and after, for its own question.
  assert.match(qs.structure!.instructions, /load/);
  assert.match(qs.structure!.instructions, /before the edit: Yes/);
  assert.match(qs.structure!.instructions, /after it: No, no_support at beam-b2/);
  assert.match(String(seen[0]!.body.state), /"widen plant-shaft to 2 m"/);
});

test('an edit that changes no answer asks no model: the rules vote', async () => {
  const same = panel.filter((r) => r.before.status === r.after.status);
  const out = await vote(same, strands());
  assert.equal(out.voter, 'rules');
  assert.deepEqual(short(out.votes), ['logistics:sofa:review:1', 'accessibility:wheelchair:review:1', 'life_safety:people:review:1']);
  assert.equal(seen.length, 0);
});

test('Strands down, slow, busy or unusable: the rules vote instead, never a made-up model vote', async () => {
  const closed = createServer();
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
  const port = (closed.address() as AddressInfo).port;
  await new Promise<void>((done) => closed.close(() => done()));
  const down = await vote(panel, strands({ STRANDS_URL: `http://127.0.0.1:${port}` }));
  assert.equal(down.voter, 'rules');
  assert.deepEqual(short(down.votes), RULES);

  for (const bad of [
    answers({ mep: ['accept', 0.9] }), // a discipline missing
    answers({ mep: ['maybe', 0.9], structure: ['accept', 0.5] }),
    answers({ mep: ['accept', 1.4], structure: ['accept', 0.5] }),
    ((_b, res) => { res.writeHead(500); res.end('{}'); }) as Handler,
    ((_b, res) => { res.writeHead(200); res.end('not json'); }) as Handler,
  ]) {
    handler = bad;
    const out = await vote(panel, strands());
    assert.equal(out.voter, 'rules');
    assert.deepEqual(short(out.votes), RULES);
  }
});

test('votes answer within the app budget: a slow model is cut at 2 s at most, whatever STRANDS_TIMEOUT_MS says', async () => {
  handler = (b, res) => setTimeout(() => MODEL(b, res), 2600);
  const t0 = performance.now();
  const out = await vote(panel, strands({ STRANDS_TIMEOUT_MS: '10000' }));
  const ms = performance.now() - t0;
  assert.equal(out.voter, 'rules');
  assert.ok(ms >= 1900 && ms < 2400, `${ms} ms`);
  await new Promise((r) => setTimeout(r, 900)); // let the fake finish, so the next test starts free
});

test('one Strands call at a time, shared with /parse: votes during a parse get the rules at once', async () => {
  handler = (b, res) => setTimeout(() => answers({ op: ['widen', 0.99], target: ['plant-shaft', 0.98] })(b, res), 300);
  const parsing = parse({ text: 'widen the plant shaft to 2 m', ops: ['widen', 'reset'], targets: [{ id: 'plant-shaft', name: 'Plant shaft' }, { id: 'lobby-door', name: 'Lobby door' }], value_range: { min: 0, max: 5 } }, strands());
  const t0 = performance.now();
  const out = await vote(panel, strands());
  assert.equal(out.voter, 'rules');
  assert.ok(performance.now() - t0 < 100);
  assert.equal((await parsing).op.confidence, 0.99);
  assert.equal(seen.length, 1);
  handler = MODEL;
  assert.equal((await vote(panel, strands())).voter, 'strands', 'free again after the parse ends');
});

// ---------- the route ----------

let server: Server;
let port = 0;
before(async () => {
  server = await startServer(readConfig({ SERVER_PORT: '0' })); // DECIDER unset: keywords
  port = (server.address() as AddressInfo).port;
});
after(() => new Promise<void>((done) => server.close(() => done())));

interface Reply { status: number; headers: Record<string, string | string[] | undefined>; body: string }
function call(at: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port: at, method: opts.method ?? 'POST', path: opts.path ?? '/votes', headers: opts.headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    r.on('error', reject);
    r.end(opts.body);
  });
}
const json = { 'content-type': 'application/json' };
const post = (data: unknown, headers: Record<string, string> = {}, at = port) => call(at, { headers: { ...json, ...headers }, body: JSON.stringify(data) });

test('POST /votes answers one JevVote per request, in order, with who voted', async () => {
  const r = await post(panel);
  assert.equal(r.status, 200, r.body);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['x-decider'], 'keywords');
  assert.equal(r.headers['x-voter'], 'rules');
  const out = JSON.parse(r.body) as JevVote[];
  assert.deepEqual(short(out), RULES);
});

test('POST /votes with DECIDER=strands: the model votes, x-voter says strands; model down says rules', async () => {
  const s = await startServer(readConfig({ SERVER_PORT: '0', DECIDER: 'strands', STRANDS_URL: fakeUrl, STRANDS_TIMEOUT_MS: '500' }));
  const at = (s.address() as AddressInfo).port;
  try {
    const r = await post(panel, {}, at);
    assert.equal(r.status, 200, r.body);
    assert.equal(r.headers['x-decider'], 'strands');
    assert.equal(r.headers['x-voter'], 'strands');
    assert.equal((JSON.parse(r.body) as JevVote[])[3]!.vote, 'accept');
    handler = (_b, res) => { res.writeHead(503); res.end('{}'); };
    const off = await post(panel, {}, at);
    assert.equal(off.headers['x-decider'], 'strands');
    assert.equal(off.headers['x-voter'], 'rules');
    assert.deepEqual(short(JSON.parse(off.body) as JevVote[]), RULES);
  } finally {
    await new Promise<void>((done) => s.close(() => done()));
  }
});

test('a body that is not a usable list of JevVoteRequest is a 400 with the errors', async () => {
  const other: Edit = { op: 'add_ramp', target: 'terrace-door', value: null, source: 'button' };
  const bad: unknown[] = [
    panel[0], // not a list
    [],
    Array.from({ length: MAX_VOTE_REQUESTS + 1 }, () => panel[0]),
    [{ ...panel[0], discipline: 'architecture' }],
    [{ ...panel[0], extra: 1 }],
    [{ ...panel[0], after: { ...panel[0]!.after, status: 'maybe' } }],
    [panel[0], panel[0]], // the same discipline twice
    [{ ...panel[0], after: panel[3]!.after }], // before and after of two different tokens
    [panel[0], { ...panel[3], edit: other }], // two different edits
    null,
  ];
  for (const b of bad) {
    const r = await post(b);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 100));
    assert.ok(Array.isArray(JSON.parse(r.body).details));
  }
});

test('/votes keeps every check /parse has: Host, Origin, method, content type, size, inherited keys, exact path', async () => {
  assert.equal((await post(panel, { host: `evil.example:${port}` })).status, 403);
  assert.equal((await post(panel, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(panel, { origin: 'http://localhost:5173' })).status, 200);
  assert.equal((await call(port, { method: 'GET' })).status, 405);
  assert.equal((await call(port, { body: JSON.stringify(panel) })).status, 415);
  assert.equal((await call(port, { path: '/votes/x', headers: json, body: '[]' })).status, 404);
  assert.equal((await call(port, { path: '/votesx', headers: json, body: '[]' })).status, 404);
  assert.equal((await call(port, { headers: json, body: `[${JSON.stringify(panel[0]).slice(0, -1)},"x":"${'x'.repeat(70 * 1024)}"}]` })).status, 413);
  const proto = await call(port, { headers: json, body: `[{"__proto__":{"x":1},${JSON.stringify(panel[0]).slice(1)}]` });
  assert.equal(proto.status, 400);
  assert.match(proto.body, /__proto__/);
});
