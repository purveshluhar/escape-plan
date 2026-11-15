// The review panel: one vote per discipline after an edit (POST /votes). Votes are bubbles only;
// the building rules decide every answer, and a vote that disagrees with them is shown as such.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, Edit, JevVote, JevVoteRequest } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { withSmoke } from '../data/smoke.ts';
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
  // A Yes-to-No speaks first: glass No to Yes and sofa Yes to No, sofa speaks (its break is shown).
  const res = (token: string, status: 'pass' | 'fail') => ({ token, status, path: [], blocked_at: null, reason: null, needed: null, available: null });
  const mixed = voteRequests(building, LOBBY, [res('glass', 'fail'), res('sofa', 'pass')], [res('glass', 'pass'), res('sofa', 'fail')]);
  assert.deepEqual(mixed.map((x) => x.after.token), ['sofa']);
  const sofaOnly = voteRequests(building, LOBBY, solve(building), solve(building, [LOBBY]));
  assert.equal(sofaOnly.find((r) => r.discipline === 'logistics')!.after.token, 'glass');
  const moved = { ...building, tokens: building.tokens.map((t) => (t.id === 'glass' ? { ...t, size: { ...t.size, length: 9 } } : t)) };
  const r = voteRequests(moved, LOBBY, solve(moved), solve(moved, [LOBBY])).find((x) => x.discipline === 'logistics')!;
  assert.equal(r.after.token, 'sofa', 'glass still stuck, sofa now gets in: the sofa speaks for logistics');
});

test('only the questions asked get a vote: no Glass when glass was not asked', () => {
  const asked = voteRequests(building, SHAFT, solve(building), solve(building, [SHAFT]), ['chiller', 'load']);
  assert.deepEqual(asked.map((r) => `${r.discipline}:${r.after.token}`), ['mep:chiller', 'structure:load']);
  // The sofa asked alone speaks for logistics, even when glass (not asked) is the one the edit changed.
  const sofa = voteRequests(building, LOBBY, solve(building), solve(building, [LOBBY]), ['sofa']);
  assert.deepEqual(sofa.map((r) => `${r.discipline}:${r.after.token}`), ['logistics:sofa']);
  // The smoke question votes under its own name with the people's answer; the people are not asked.
  const withS = withSmoke(building);
  const OFFICE: Edit = { op: 'widen', target: 'office-door', value: 0.9, source: 'button' };
  const smoky = voteRequests(withS, OFFICE, solve(withS), solve(withS, [OFFICE]), ['smoke']);
  assert.deepEqual(smoky.map((r) => `${r.discipline}:${r.after.token}`), ['fire:smoke']);
  // Nothing asked: nothing to vote on.
  assert.deepEqual(voteRequests(building, SHAFT, solve(building), solve(building, [SHAFT]), []), []);
});

test('the panel and the strip name who voted or read in plain words, never a header name', async () => {
  for (const [voter, decider] of [['rules', 'keywords'], ['rules', 'strands'], ['strands', 'strands']] as const) {
    const m = panelModel(await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(voter === 'rules' ? RULES : MODEL, voter, decider)) }), building);
    assert.doesNotMatch(m.source, /x-voter|x-decider/);
    assert.match(m.source, /^Votes by: the (rules|model)/);
  }
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
  assert.equal(m.source, 'Votes by: the model, on this computer, 1.2\u00a0s');
  assert.deepEqual(m.bubbles.map((b) => [b.discipline, b.who, b.vote, b.confidence, b.reason, b.rules]), [
    ['MEP', 'Strands Decider', 'Accept', '0.93', 'Rules: Chiller was No, now Yes', 'This vote agrees with the rules'],
    ['Logistics', 'Rules, no change', 'Review', '1.00', 'Rules: still No. Glass is stuck at Lobby door: cannot turn the corner, needs 4.0 m, has 3.71 m', ''],
    ['Accessibility', 'Rules, no change', 'Review', '1.00', 'Rules: still No. Wheelchair is stuck at Terrace door: step in the way, 0.15 m high, needs level', ''],
    ['Structure', 'Strands Decider', 'Accept', '0.72', 'Rules: was Yes, now No. Load is stuck at beam B2: nothing holds it up, no path down to a foundation', 'This vote disagrees with the rules'],
    ['Life safety', 'Rules, no change', 'Review', '1.00', 'Rules: still No. People are stuck at Office door: too narrow, needs 0.6 m, has 0.5 m', ''],
  ]);
  assert.deepEqual(m.bubbles.map((b) => b.clash), [false, false, false, true, false]);
  // Under 0.80 (JEV_ACCEPT_CONFIDENCE) a vote is marked not sure, as in the who decided strip.
  assert.deepEqual(m.bubbles.map((b) => b.sure), [true, true, true, false, true]);
  // "Not sure" follows the number on screen: 0.7996 shows as 0.80, so it is sure.
  const edge = panelModel({ ...r, votes: MODEL.map((x, i) => (i === 3 ? { ...x, confidence: 0.7996 } : x)) }, building).bubbles[3]!;
  assert.deepEqual([edge.confidence, edge.sure], ['0.80', true]);
  assert.equal(m.summary, '1 vote disagrees with the rules. The rules decide every answer.');
});

test('a disagreement is about what the edit did: accepting a Yes-to-No edit, or objecting to a No-to-Yes one', () => {
  const at = (votes: JevVote[]) => panelModel({ requests: shaftRequests, votes, why: 'strands', voter: 'strands', decider: 'strands', ms: 900 }, building).bubbles;
  const set = (i: number, vote: JevVote['vote']) => MODEL.map((x, k) => (k === i ? { ...x, vote } : x));
  assert.deepEqual(at(set(3, 'object')).map((b) => b.clash), [false, false, false, false, false]);
  assert.equal(at(set(3, 'object'))[3]!.rules, 'This vote agrees with the rules');
  assert.equal(at(set(3, 'review'))[3]!.rules, '');
  assert.deepEqual(at(set(0, 'object')).map((b) => b.clash), [true, false, false, true, false]);
  assert.equal(at(set(0, 'object'))[0]!.rules, 'This vote disagrees with the rules');
  // Accepting an edit that left a No as it was is no disagreement: the edit did not cause it.
  assert.equal(at(set(1, 'accept'))[1]!.clash, false);
});

test('the rules vote when no model answers: the panel says so, and every vote matches the rules', async () => {
  const keywords = panelModel(await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(RULES, 'rules', 'keywords')) }), building);
  assert.equal(keywords.title, 'Review panel: rules only');
  assert.equal(keywords.source, 'Votes by: the rules. The server reads by keywords.');
  assert.equal(keywords.bubbles[3]!.vote, 'Object');
  assert.equal(keywords.bubbles[3]!.rules, 'This vote agrees with the rules');
  assert.ok(keywords.bubbles.every((b) => !b.clash));
  assert.equal(keywords.summary, 'Votes only. They never change an answer: the rules decide.');
  assert.ok(keywords.bubbles.every((b) => b.who === 'Rules'));
  const fallback = panelModel(await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(RULES, 'rules', 'strands')) }), building);
  assert.equal(fallback.title, 'Review panel: rules only');
  // Neutral words: the server falls back for many reasons (off, slow, busy, an unusable answer).
  assert.equal(fallback.source, 'Votes by: the rules. The model gave no usable vote (off, busy, slow or unclear).');
  // More than 2 changed answers never go to the model: about 1 s each does not fit the budget.
  const three = shaftRequests.map((r, i) => (i === 2 ? { ...r, before: { ...r.before, status: 'pass' as const } } : r));
  const many = panelModel(await readVotes(three, { fetch: fakeFetch(() => reply(RULES, 'rules', 'strands')) }), building);
  assert.equal(many.source, 'Votes by: the rules. This edit changed 3 answers, more than the model can vote on in time.');
  // An edit that changed no answer never asks the model.
  const unchanged = shaftRequests.filter((r) => r.before.status === r.after.status);
  const none = panelModel(await readVotes(unchanged, { fetch: fakeFetch(() => reply(RULES.filter((x) => x.vote === 'review'), 'rules', 'strands')) }), building);
  assert.equal(none.source, 'Votes by: the rules. This edit changed no answer.');
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
    [slow, 'Review panel: no votes', 'No votes - no answer in 2.5\u00a0s'],
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
  // The Vite guard's 429 (its places are shared with /parse) is busy, not an unusable answer.
  const busy = await readVotes(shaftRequests, { fetch: fakeFetch(() => reply({ error: 'too many calls' }, null, null, 429)) });
  assert.equal(busy.why, 'busy');
  assert.equal(panelModel(busy, building).source, 'No votes - the page is making too many calls at once');
  for (const [body, voter, status] of broken) {
    const r = await readVotes(shaftRequests, { fetch: fakeFetch(() => reply(body, voter, 'keywords', status)) });
    assert.equal(r.why, 'refused', JSON.stringify(body).slice(0, 80));
    assert.equal(panelModel(r, building).source, 'No votes - the server answer could not be used');
    assert.equal(panelModel(r, building).title, 'Review panel: no votes');
  }
});

test('panel text has no game words, and browser code imports nothing from node or server', () => {
  const src = readFileSync(new URL('./votes.ts', import.meta.url), 'utf8') + readFileSync(new URL('./votes-view.ts', import.meta.url), 'utf8');
  const strings = [...src.matchAll(/'([^'\n]*)'|`([^`\n]*)`|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    .filter((s) => s !== 'pass' && s !== 'fail').join('\n');
  assert.doesNotMatch(strings, /\b(level complete|level|score|win|player|play|tokens?|PASS|FAIL|escaping|game)\b/i);
  assert.doesNotMatch(src, /from 'node:|from '\.\.\/server\//);
});

test('a pending panel says it is asking', () => {
  const pending: PanelReading = { requests: shaftRequests, votes: [], why: 'pending', voter: null, decider: null, ms: 0 };
  const m = panelModel(pending, building);
  assert.equal(m.title, 'Review panel');
  assert.equal(m.source, 'Asking each discipline...');
  assert.deepEqual(m.bubbles, []);
});

test('the smoke question votes on its answer, the people on the same clock, not on the smoke spread', async () => {
  const { withSmoke } = await import('../data/smoke.ts');
  const smoky = withSmoke(building);
  const OFFICE: Edit = { op: 'widen', target: 'office-door', value: 0.9, source: 'button' };
  const CLOSE: Edit = { op: 'close_door', target: 'lobby-door', value: null, source: 'button' };
  const reqs = voteRequests(smoky, CLOSE, solve(smoky, [OFFICE]), solve(smoky, [OFFICE, CLOSE]));
  const fire = reqs.find((r) => r.discipline === 'fire')!;
  assert.deepEqual([fire.after.token, fire.before.status, fire.before.reason, fire.after.status], ['smoke', 'fail', 'smoke_first', 'pass']);
  assert.deepEqual(fire.after.path, ['office', 'corridor', 'street'], 'the people route, not the 250-node spread');
  const ruled: PanelReading = { requests: reqs, votes: reqs.map((r) => v(r.after.token, r.discipline, r.after.status === 'pass' ? 'accept' : 'review', 1)), why: 'rules', voter: 'rules', decider: 'keywords', ms: 3 };
  const b = panelModel(ruled, smoky).bubbles.find((x) => x.discipline === 'Fire')!;
  assert.deepEqual([b.vote, b.reason, b.rules], ['Accept', 'Rules: People were No, now Yes, before the smoke', 'This vote agrees with the rules']);
  // An edit that lets the smoke win: accepting it disagrees with the rules.
  const res = (status: 'pass' | 'fail', reason: 'smoke_first' | null) => ({ token: 'people', status, path: ['office'], blocked_at: reason ? 'corridor' : null, reason, needed: reason ? 1 : null, available: reason ? 1 : null, time: null });
  const lost = voteRequests(smoky, OFFICE, [res('pass', null)], [res('fail', 'smoke_first')]);
  const worse = lost.find((r) => r.discipline === 'fire')!;
  const m = panelModel({ requests: lost, votes: lost.map((r) => v(r.after.token, r.discipline, 'accept', 0.9)), why: 'strands', voter: 'strands', decider: 'strands', ms: 900 }, smoky);
  const fb = m.bubbles.find((x) => x.discipline === 'Fire')!;
  assert.equal(worse.after.token, 'smoke');
  assert.deepEqual([fb.reason, fb.rules, fb.clash], ['Rules: was Yes, now No. People are stuck at North service corridor: smoke gets there first, needs 1 step, has 1 step', 'This vote disagrees with the rules', true]);
});
