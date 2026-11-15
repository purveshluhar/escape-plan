// Hint: fix search at the blocked part only. Literal values come from data/building.json and the
// solver; the fixes agree with data/expected.json (a widened lobby door lets the sofa in, and so on).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, Edit, Id, SolverResult } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { findHint, hintModel } from './hint.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const btn = (op: Edit['op'], target: string, value: number | null = null): Edit => ({ op, target, value, source: 'button' });

// What the page does: the building's rules over the questions on screen.
const over = (placed: Id[], b: Building = building) => (edits: readonly Edit[]) => solve(b, edits).filter((r) => placed.includes(r.token));
const key = (e: Edit | null): string | null => (e ? `${e.op} ${e.target} ${e.value}` : null);

test('sofa: the first width the rules accept is 1.4 m, after 4 fixes', () => {
  const h = findHint(building, [], 'sofa', over(['sofa']));
  assert.equal(key(h.fix), 'widen lobby-door 1.4');
  assert.equal(h.fix?.source, 'button');
  assert.equal(h.tried, 4);
  assert.equal(h.stop, 'found');
  assert.deepEqual(h.breaks, []);
});

test('people: widen the office door to 0.6 m, the first fix tried', () => {
  const h = findHint(building, [], 'people', over(['people']));
  assert.equal(key(h.fix), 'widen office-door 0.6');
  assert.equal(h.tried, 1);
});

test('wheelchair: a step is fixed by a ramp, the one edit offered for a step', () => {
  const h = findHint(building, [], 'wheelchair', over(['wheelchair']));
  assert.equal(key(h.fix), 'add_ramp terrace-door null');
  assert.equal(h.tried, 1);
});

test('chiller: widening the shaft to 1.6 m works but breaks the load at beam B2', () => {
  const h = findHint(building, [], 'chiller', over(['chiller', 'load']));
  assert.equal(key(h.fix), 'widen plant-shaft 1.6');
  assert.equal(h.tried, 4);
  assert.deepEqual(h.breaks.map((r) => [r.token, r.blocked_at, r.reason]), [['load', 'beam-b2', 'no_support']]);
});

test('load: after the shaft is widened, a transfer beam at beam B2 is the fix', () => {
  const h = findHint(building, [btn('widen', 'plant-shaft', 2)], 'load', over(['chiller', 'load']));
  assert.equal(key(h.fix), 'add_transfer_beam beam-b2 null');
  assert.equal(h.tried, 1);
  assert.deepEqual(h.breaks, []);
});

test('an answer that is already Yes has nothing to fix', () => {
  const h = findHint(building, [], 'load', over(['load']));
  assert.equal(h.fix, null);
  assert.equal(h.tried, 0);
  assert.equal(h.stop, 'yes');
});

test('the count cap stops the search and says so', () => {
  const h = findHint(building, [], 'sofa', over(['sofa']), { maxTries: 2 });
  assert.equal(h.fix, null);
  assert.equal(h.tried, 2);
  assert.equal(h.stop, 'tries');
});

test('the time cap stops the search: the clock is read once at the start and once before each fix', () => {
  let t = 0;
  const h = findHint(building, [], 'sofa', over(['sofa']), { maxMs: 250, now: () => (t += 100) });
  assert.equal(h.fix, null);
  assert.equal(h.tried, 2);
  assert.equal(h.stop, 'time');
});

test('no single edit at the stuck part works: every width to 3.0 m is tried, then it says so', () => {
  const long = structuredClone(building);
  long.tokens.find((t) => t.id === 'sofa')!.size.length = 10;
  const h = findHint(long, [], 'sofa', over(['sofa'], long));
  assert.equal(h.fix, null);
  assert.equal(h.tried, 20);
  assert.equal(h.stop, 'exhausted');
});

test('the search is deterministic and leaves the building and the edits alone', () => {
  const before = JSON.stringify(building);
  const edits = [btn('widen', 'office-door', 0.9)];
  const a = findHint(building, edits, 'sofa', over(['sofa', 'people']));
  const b = findHint(building, edits, 'sofa', over(['sofa', 'people']));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(building), before);
  assert.equal(edits.length, 1);
});

test('words: a found fix, what it gives and what it breaks', () => {
  const m = hintModel(building, findHint(building, [], 'chiller', over(['chiller', 'load'])), 'chiller');
  assert.equal(m.found, true);
  assert.equal(m.tried, 'The rules tried 4 fixes.');
  assert.equal(m.fixLabel, 'Widen plant shaft to 1.6 m');
  assert.equal(m.then, 'Then: The chiller fits through the shaft.');
  assert.deepEqual(m.breaks, ['Load is stuck at beam B2: nothing holds it up, no path down to a foundation']);
});

test('words: one fix is singular, a clean fix has no breaks', () => {
  const m = hintModel(building, findHint(building, [], 'people', over(['people'])), 'people');
  assert.equal(m.tried, 'The rules tried 1 fix.');
  assert.equal(m.then, 'Then: Everyone gets out.');
  assert.deepEqual(m.breaks, []);
});

test('words: nothing found, by reason', () => {
  const long = structuredClone(building);
  long.tokens.find((t) => t.id === 'sofa')!.size.length = 10;
  const none = hintModel(long, findHint(long, [], 'sofa', over(['sofa'], long)), 'sofa');
  assert.equal(none.found, false);
  assert.equal(none.tried, 'The rules tried 20 fixes.');
  assert.equal(none.note, 'No single edit at Lobby door makes this Yes. Type an edit instead.');
  const cap = hintModel(building, findHint(building, [], 'sofa', over(['sofa']), { maxTries: 2 }), 'sofa');
  assert.equal(cap.tried, 'The rules tried 2 fixes.');
  assert.equal(cap.note, 'Stopped at the limit of 2 fixes. None made this Yes.');
  let t = 0;
  const slow = hintModel(building, findHint(building, [], 'sofa', over(['sofa']), { maxMs: 250, now: () => (t += 100) }), 'sofa');
  assert.equal(slow.note, 'Stopped at the time limit. None made this Yes.');
  const yes = hintModel(building, findHint(building, [], 'load', over(['load'])), 'load');
  assert.equal(yes.note, 'This answer is already Yes.');
});

// ---- review round 1 ----

test('a fix already in the edit list is never offered again (Apply would do nothing)', () => {
  const edits = [btn('widen', 'plant-shaft', 1.6), btn('widen', 'plant-shaft', 1)];
  const h = findHint(building, edits, 'chiller', over(['chiller']));
  assert.equal(key(h.fix), 'widen plant-shaft 1.7');
});

test('widths go up one tenth at a time from the current width, also after a hundredths digit of 5 or more', () => {
  const odd = structuredClone(building);
  odd.edges.find((e) => e.id === 'office-door')!.clear_width = 0.57;
  const h = findHint(odd, [], 'people', over(['people'], odd));
  assert.equal(key(h.fix), 'widen office-door 0.6');
  const wide = structuredClone(building);
  wide.edges.find((e) => e.id === 'office-door')!.clear_width = 0.25;
  assert.equal(key(findHint(wide, [], 'people', over(['people'], wide)).fix), 'widen office-door 0.6');
});

test('a door that is too low is not widened: no edit is offered for a height', () => {
  const tall = structuredClone(building);
  tall.tokens.find((t) => t.id === 'sofa')!.size.height = 5;
  const h = findHint(tall, [], 'sofa', over(['sofa'], tall));
  assert.equal(h.stop, 'exhausted');
  assert.equal(h.tried, 0);
  assert.equal(hintModel(tall, h, 'sofa').note, 'The rules have no edit to try at the stuck place. Type an edit instead.');
});

test('a stuck room (not a door) is not fixed by widening the doors around it for a size reason', () => {
  const room = structuredClone(building);
  const r: SolverResult = { token: 'sofa', status: 'fail', path: [], blocked_at: 'lobby', reason: 'too_narrow', needed: 1, available: 0.5 };
  const h = findHint(room, [], 'sofa', () => [r]);
  assert.equal(h.tried, 0);
  assert.equal(h.stop, 'exhausted');
});

test('only a beam becomes a transfer beam, never a column or a foundation', () => {
  const r: SolverResult = { token: 'load', status: 'fail', path: [], blocked_at: 'c1', reason: 'no_support', needed: null, available: null };
  const h = findHint(building, [], 'load', () => [r]);
  assert.equal(h.tried, 0);
});

// ---- review round 2 ----

test('smoke: close_door is tried only on edges that are open, never on a stair or a closed door', () => {
  const b = structuredClone(building);
  const edgesAt = b.edges.filter((e) => e.from === 'lobby' || e.to === 'lobby');
  edgesAt.forEach((e, i) => { if (i === 0) e.open = true; else delete e.open; }); // the others have no smoke path
  const r: SolverResult = { token: 'people', status: 'fail', path: [], blocked_at: 'lobby', reason: 'smoke_first', needed: 4, available: 6 };
  const tried: string[] = [];
  const h = findHint(b, [], 'people', (edits) => { const last = edits.at(-1); if (last) tried.push(`${last.op} ${last.target}`); return [r]; });
  assert.deepEqual(tried, [`close_door ${edgesAt[0]!.id}`]);
  assert.equal(h.tried, 1);
});

test('a bad width in the data cannot make candidate building run away', () => {
  const b = structuredClone(building);
  b.edges.find((e) => e.id === 'office-door')!.clear_width = -1e9;
  const t0 = performance.now();
  const h = findHint(b, [], 'people', over(['people'], b));
  assert.ok(performance.now() - t0 < 1500);
  assert.ok(h.tried <= 30);
});
