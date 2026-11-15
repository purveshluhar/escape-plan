// The review panel: one vote per discipline after an edit (POST /votes). Votes are bubbles only;
// the building rules decide every answer, and a vote that disagrees with them is shown as such.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, Edit, JevVote, JevVoteRequest } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { VOTES_TIMEOUT_MS, VOTES_URL, panelModel, readVotes, voteRequests } from './votes.ts';
import type { PanelReading } from './votes.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const SHAFT: Edit = { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' };
const LOBBY: Edit = { op: 'widen', target: 'lobby-door', value: 1.6, source: 'text' };
const shaftRequests = voteRequests(building, SHAFT, solve(building), solve(building, [SHAFT]));

const v = (token: string, discipline: JevVote['discipline'], vote: JevVote['vote'], confidence: number): JevVote => ({ token, discipline, vote, confidence });
// What the server answers when the model says the shaft edit is fine: structure accepts it, but the
// rules find beam B2 cut. The model votes the two disciplines this edit changed; the rules the rest.
const MODEL: JevVote[] = [
  v('chiller', 'mep', 'accept', 0.93), v('glass', 'logistics', 'review', 1), v('wheelchair', 'accessibility', 'review', 1),
  v('load', 'structure', 'accept', 0.72), v('people', 'life_safety', 'review', 1),
];
const RULES: JevVote[] = [
  v('chiller', 'mep', 'accept', 1), v('glass', 'logistics', 'review', 1), v('wheelchair', 'accessibility', 'review', 1),
  v('load', 'structure', 'object', 1), v('people', 'life_safety', 'review', 1),
];

function reply(body: unknown, voter: string | null, decider: string | null = voter === 'rules' ? 'keywords' : voter, status = 200): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (voter !== null) headers.set('x-voter', voter);
  if (decider !== null) headers.set('x-decider', decider);
  return new Response(JSON.stringify(body), { status, headers });
}
interface Call { url: string; init: RequestInit }
const fakeFetch = (answer: (req: JevVoteRequest[]) => Response | Promise<Response>, calls: Call[] = []): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return answer(JSON.parse(String(init?.body)) as JevVoteRequest[]);
  }) as typeof fetch;

test('one vote request per discipline in the data, with what the rules said before and after the edit', () => {
  assert.deepEqual(shaftRequests.map((r) => `${r.discipline}:${r.after.token}:${r.before.status}>${r.after.status}`), [
    'mep:chiller:fail>pass', 'logistics:glass:fail>fail', 'accessibility:wheelchair:fail>fail', 'structure:load:pass>fail', 'life_safety:people:fail>fail',
  ]);
  for (const r of shaftRequests) assert.deepEqual(r.edit, SHAFT);
  // Two tokens share logistics: the one whose answer this edit changed speaks for it.
  const sofaOnly = voteRequests(building, LOBBY, solve(building), solve(building, [LOBBY]));
  assert.equal(sofaOnly.find((r) => r.discipline === 'logistics')!.after.token, 'glass');
  const moved = { ...building, tokens: building.tokens.map((t) => (t.id === 'glass' ? { ...t, size: { ...t.size, length: 9 } } : t)) };
  const r = voteRequests(moved, LOBBY, solve(moved), solve(moved, [LOBBY])).find((x) => x.discipline === 'logistics')!;
  assert.equal(r.after.token, 'sofa', 'glass still stuck, sofa now gets in: the sofa speaks for logistics');
});

test('it posts the requests as JSON to /votes', async () => {
  const calls: Call[] = [];
  await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(RULES, 'rules'), calls) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, VOTES_URL);
  assert.equal(calls[0]!.init.method, 'POST');
  assert.equal(new Headers(calls[0]!.init.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), shaftRequests);
});

test('model votes: a vote that disagrees with the rules is shown as a disagreement, the rules decide', async () => {
  let t = 0;
  const r = await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(MODEL, 'strands')), now: () => (t += 1210) });
  assert.equal(r.why, 'strands');
  const m = panelModel(r, building);
  assert.equal(m.title, 'Review panel: Strands Decider');
  assert.equal(m.source, 'x-voter: strands - on this computer, 1.2\u00a0s');
  assert.deepEqual(m.bubbles.map((b) => [b.discipline, b.who, b.vote, b.confidence, b.reason, b.rules]), [
    ['MEP', 'Strands Decider', 'Accept', '0.93', 'Chiller was No, now Yes', 'Rules agree: Yes'],
    ['Logistics', 'Rules, no change', 'Review', '1.00', 'Glass is still No: cannot turn the corner at Lobby door', 'Rules: No'],
    ['Accessibility', 'Rules, no change', 'Review', '1.00', 'Wheelchair is still No: step in the way at Terrace door', 'Rules: No'],
    ['Structure', 'Strands Decider', 'Accept', '0.72', 'Load was Yes, now No: nothing holds it up at beam B2', 'Rules disagree: No'],
    ['Life safety', 'Rules, no change', 'Review', '1.00', 'People are still No: too narrow at Office door', 'Rules: No'],
  ]);
  assert.deepEqual(m.bubbles.map((b) => b.clash), [false, false, false, true, false]);
  // Under 0.80 (JEV_ACCEPT_CONFIDENCE) a vote is marked not sure, as in the who decided strip.
  assert.deepEqual(m.bubbles.map((b) => b.sure), [true, true, true, false, true]);
  assert.equal(m.summary, '1 vote disagrees with the rules. The rules decide every answer.');
});

test('a disagreement is about what the edit did: accepting a Yes-to-No edit, or objecting to a No-to-Yes one', () => {
  const at = (votes: JevVote[]) => panelModel({ requests: shaftRequests, votes, why: 'strands', voter: 'strands', decider: 'strands', ms: 900 }, building).bubbles;
  const set = (i: number, vote: JevVote['vote']) => MODEL.map((x, k) => (k === i ? { ...x, vote } : x));
  assert.deepEqual(at(set(3, 'object')).map((b) => b.clash), [false, false, false, false, false]);
  assert.equal(at(set(3, 'object'))[3]!.rules, 'Rules agree: No');
  assert.equal(at(set(3, 'review'))[3]!.rules, 'Rules: No');
  assert.deepEqual(at(set(0, 'object')).map((b) => b.clash), [true, false, false, true, false]);
  assert.equal(at(set(0, 'object'))[0]!.rules, 'Rules disagree: Yes');
  // Accepting an edit that left a No as it was is no disagreement: the edit did not cause it.
  assert.equal(at(set(1, 'accept'))[1]!.clash, false);
});

test('the rules vote when no model answers: the panel says so, and every vote matches the rules', async () => {
  const keywords = panelModel(await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(RULES, 'rules', 'keywords')) }), building);
  assert.equal(keywords.title, 'Review panel: rules only');
  assert.equal(keywords.source, 'x-voter: rules - the server runs keywords, so the rules vote');
  assert.equal(keywords.bubbles[3]!.vote, 'Object');
  assert.equal(keywords.bubbles[3]!.rules, 'Rules agree: No');
  assert.ok(keywords.bubbles.every((b) => !b.clash));
  assert.equal(keywords.summary, 'Votes only. They never change an answer: the rules decide.');
  assert.ok(keywords.bubbles.every((b) => b.who === 'Rules'));
  const fallback = panelModel(await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(RULES, 'rules', 'strands')) }), building);
  assert.equal(fallback.title, 'Review panel: rules only');
  assert.equal(fallback.source, 'x-voter: rules - the model did not answer in 2.0\u00a0s (off, busy or slow), so the rules vote');
  // An edit that changed no answer never asks the model.
  const unchanged = shaftRequests.filter((r) => r.before.status === r.after.status);
  const none = panelModel(await readVotes(unchanged, { fetch: fakeFetch(() => reply(RULES.filter((x) => x.vote === 'review'), 'rules', 'strands')) }), building);
  assert.equal(none.source, 'x-voter: rules - this edit changed no answer, so the rules vote');
});

test('server down, slow or unusable: no votes, and the panel says the rules still decide', async () => {
  const down = await readVotes(shaftRequests, { fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
  assert.equal(down.why, 'down');
  const proxy502 = await readVotes(shaftRequests, { fetch: fakeFetch(() => reply({}, null, null, 502)) });
  assert.equal(proxy502.why, 'down');
  const slow = await readVotes(shaftRequests, {
    timeoutMs: 30,
    fetch: ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as typeof fetch,
  });
  assert.equal(slow.why, 'slow');
  for (const [why, title, source] of [
    [down, 'Review panel is off', 'No votes - the server is not reachable'],
    [slow, 'Review panel is off', 'No votes - no answer in 2.5\u00a0s'],
  ] as const) {
    const m = panelModel(why, building);
    assert.equal(m.title, title);
    assert.equal(m.source, source);
    assert.deepEqual(m.bubbles, []);
    assert.equal(m.summary, 'The rules still decide every answer.');
  }
  assert.equal(VOTES_TIMEOUT_MS, 2500);
  const broken: [unknown, string | null, number][] = [
    [RULES, 'rules', 400],
    [RULES.slice(1), 'rules', 200], // one vote short
    [RULES.map((x, i) => (i === 3 ? { ...x, token: 'sofa' } : x)), 'rules', 200], // not the token asked about
    [RULES.map((x, i) => (i === 0 ? { ...x, vote: 'maybe' } : x)), 'rules', 200],
    [RULES.map((x, i) => (i === 0 ? { ...x, confidence: 2 } : x)), 'rules', 200],
    [RULES, 'someone', 200],
    [{ votes: RULES }, 'rules', 200],
  ];
  for (const [body, voter, status] of broken) {
    const r = await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(body, voter, 'keywords', status)) });
    assert.equal(r.why, 'refused', JSON.stringify(body).slice(0, 80));
    assert.equal(panelModel(r, building).source, 'No votes - the server answer could not be used');
  }
});

test('panel text has no game words, and browser code imports nothing from node or server', () => {
  const src = readFileSync(new URL('./votes.ts', import.meta.url), 'utf8') + readFileSync(new URL('./votes-view.ts', import.meta.url), 'utf8');
  const strings = [...src.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? '')
    .filter((s) => s !== 'pass' && s !== 'fail').join('\n');
  assert.doesNotMatch(strings, /\b(level complete|level|score|win|player|play|tokens?|PASS|FAIL|escaping|game)\b/i);
  assert.doesNotMatch(src, /from 'node:|from '\.\.\/server\//);
});

test('a pending panel says it is asking; no panel before any edit', () => {
  const pending: PanelReading = { requests: shaftRequests, votes: [], why: 'pending', voter: null, decider: null, ms: 0 };
  const m = panelModel(pending, building);
  assert.equal(m.title, 'Review panel');
  assert.equal(m.source, 'Asking each discipline...');
  assert.deepEqual(m.bubbles, []);
});
