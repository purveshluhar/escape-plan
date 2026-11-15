import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile, SolverResult } from '../contract/types.ts';
import { countText, dropPlaced, parkedResults, parseEdit, phaseAfterRun, phaseWord, pickerItems, runSeconds, togglePlaced, tokenCaption, withStarts } from './shell.ts';
import { demoButtons, initialState, run } from './state.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const buttons = demoButtons(building, read('../data/expected.json') as ExpectedFile);
const res = (token: string, status: 'pass' | 'fail'): SolverResult => ({
  token, status, path: [], blocked_at: null, reason: status === 'fail' ? 'no_route' : null, needed: null, available: null,
});

test('picker: the dock offers every token in data order with keys 1..n, and no Later chips', () => {
  const items = pickerItems(building);
  assert.deepEqual(items.map((i) => i.token), building.tokens.map((t) => t.id));
  assert.deepEqual(items.map((i) => i.key), building.tokens.map((_, i) => i + 1));
});

test('togglePlaced keeps building order and takes an object off on a second click', () => {
  const [a, b] = building.tokens.map((t) => t.id);
  const one = togglePlaced(building, [], b!);
  const two = togglePlaced(building, one, a!);
  assert.deepEqual(two, [a, b]);
  assert.deepEqual(togglePlaced(building, two, a!), [b]);
});

test('parked results put each placed object at its start, with no route and no block', () => {
  const placed = building.tokens.slice(0, 2).map((t) => t.id);
  const parked = parkedResults(placed);
  assert.deepEqual(parked.map((r) => r.token), placed);
  assert.ok(parked.every((r) => r.path.length === 0 && r.blocked_at === null && r.reason === null));
  assert.deepEqual(parkedResults([]), []);
});

test('phase and summary words', () => {
  assert.equal(phaseAfterRun([res('chiller', 'pass'), res('glass', 'pass')]), 'complete');
  assert.equal(phaseAfterRun([res('chiller', 'pass'), res('glass', 'fail')]), 'result');
  assert.equal(phaseAfterRun([]), 'result');
  assert.equal(countText('empty', 0, null), 'Pick a question to start');
  assert.equal(countText('placed', 1, null), '1 question');
  assert.equal(countText('placed', 2, null), '2 questions');
  assert.equal(countText('running', 3, null), '3 routes');
  assert.equal(countText('result', 2, [res('chiller', 'pass'), res('glass', 'fail')]), '1 yes, 1 no');
  assert.equal(countText('result', 1, [res('glass', 'fail')]), 'No');
  assert.equal(countText('complete', 3, [res('a', 'pass'), res('b', 'pass'), res('c', 'pass')]), '3 of 3 yes');
  assert.equal(countText('complete', 1, [res('a', 'pass')]), 'Yes', 'one question answered yes reads Answer | Yes');
  assert.deepEqual((['empty', 'placed', 'running'] as const).map((p) => phaseWord(p, 2)), ['Your building', 'Ready', 'Checking']);
  assert.deepEqual([phaseWord('result', 1), phaseWord('result', 2), phaseWord('complete', 1), phaseWord('complete', 3)], ['Answer', 'Answers', 'Answer', 'Yes to all']);
  assert.equal(runSeconds(0, 2, 0.25), 0);
  assert.equal(runSeconds(4, 2, 0.25), 2.75);
});

test('parse: a clear sentence becomes one text edit', () => {
  const out = parseEdit('widen the lobby door to 1.6 m', buttons);
  assert.deepEqual(out.edit, { op: 'widen', target: 'lobby-door', value: 1.6, source: 'text' });
  const ramp = parseEdit('add a ramp at the terrace door', buttons);
  assert.deepEqual(ramp.edit, { op: 'add_ramp', target: 'terrace-door', value: null, source: 'text' });
  const beam = parseEdit('transfer beam at B2', buttons);
  assert.equal(beam.edit?.op, 'add_transfer_beam');
  assert.equal(beam.edit?.target, 'beam-b2');
});

test('parse: a typed value wins over the demo value, inside the range', () => {
  assert.equal(parseEdit('widen the plant shaft to 2.4 m', buttons).edit?.value, 2.4);
  // 40 m is outside the declared range, so the demo value is used instead.
  assert.equal(parseEdit('widen the plant shaft to 40 m', buttons).edit?.value, 2);
});

test('parse: a vague sentence asks "Did you mean" with the closest fixes first', () => {
  const out = parseEdit('make the lobby bigger', buttons);
  assert.equal(out.edit, null);
  assert.ok(out.parse.target.confidence < 0.8);
  assert.equal(out.suggestions[0]?.edit.target, 'lobby-door');
  assert.ok(out.suggestions.length <= 3);
  assert.equal(parseEdit('hello there', buttons).edit, null);
});

test('parse: short phrases that name one fix apply (audit gap 8)', () => {
  assert.deepEqual(parseEdit('ramp terrace', buttons).edit, { op: 'add_ramp', target: 'terrace-door', value: null, source: 'text' });
  assert.deepEqual(parseEdit('widen shaft 2.0', buttons).edit, { op: 'widen', target: 'plant-shaft', value: 2, source: 'text' });
  assert.deepEqual(parseEdit('transfer beam', buttons).edit, { op: 'add_transfer_beam', target: 'beam-b2', value: null, source: 'text' });
});

test('parse: a word shared by several fixes, or no part at all, still asks', () => {
  assert.equal(parseEdit('widen the door to 2 m', buttons).edit, null, '"door" names three fixes');
  assert.equal(parseEdit('widen the corridor', buttons).edit, null, 'three widen fixes, none named');
  assert.equal(parseEdit('make the lobby bigger', buttons).edit, null);
});

test('typed edits are read against every demo fix, so the shaft and the beam are known', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  assert.match(main, /const typedFixes = demoButtons\(building, expected\)/);
  assert.match(main, /readEdit\(text, typedFixes, building/);
});

test('the page has no Later group and no sample label', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /laterGroup|id="sample"|#sample/);
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /laterGroup|\$\('sample'\)|self-made sample building/);
});

test('a drop places the object without taking it off, and keeps building order', () => {
  const [a, b] = building.tokens.map((t) => t.id);
  assert.deepEqual(dropPlaced(building, [], b!), [b]);
  assert.deepEqual(dropPlaced(building, [b!], a!), [a, b]);
  assert.deepEqual(dropPlaced(building, [a!, b!], a!), [a, b], 'a second drop moves it; it never takes it off');
});

test('a dropped start replaces the start room; the base building is not changed', () => {
  const mvp = building;
  const moved = withStarts(mvp, new Map([['wheelchair', 'lobby'], ['sofa', 'no-such-node']]));
  assert.equal(moved.tokens.find((t) => t.id === 'wheelchair')?.start, 'lobby');
  assert.equal(moved.tokens.find((t) => t.id === 'sofa')?.start, 'lobby', 'an unknown node is ignored');
  assert.equal(mvp.tokens.find((t) => t.id === 'wheelchair')?.start, 'terrace');
  assert.equal(withStarts(mvp, new Map()), mvp);
});

test('the solver answers from the dropped start: the wheelchair off the terrace misses the step', () => {
  const mvp = building;
  const at = (b: Building, id: string): SolverResult => run(b, initialState()).results.find((r) => r.token === id)!;
  assert.equal(at(mvp, 'wheelchair').reason, 'step');
  const fromLobby = at(withStarts(mvp, new Map([['wheelchair', 'lobby']])), 'wheelchair');
  assert.equal(fromLobby.status, 'pass');
  assert.equal(fromLobby.path[0], 'lobby');
  const fromTower = at(withStarts(mvp, new Map([['wheelchair', 'T10-u1']])), 'wheelchair');
  assert.equal(fromTower.path[0], 'T10-u1');
});

test('a selected object says where it is and how it did', () => {
  const mvp = building;
  assert.equal(tokenCaption(mvp, 'wheelchair', null), 'Wheelchair - Terrace - Ready');
  const fail: SolverResult = { ...res('wheelchair', 'fail'), reason: 'step', blocked_at: 'terrace-door' };
  assert.equal(tokenCaption(mvp, 'wheelchair', fail), 'Wheelchair - Terrace - No: step in the way');
  assert.equal(tokenCaption(mvp, 'wheelchair', res('wheelchair', 'pass')), 'Wheelchair - Terrace - Yes');
  assert.equal(tokenCaption(mvp, 'wheelchair', null, true), 'Wheelchair - Terrace - Checking', 'during a run');
});

test('the all-yes banner shows with the Answers panel open, in the empty fix sheet slot, never over the panel', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /body\.scoring #banner\.on\{display:none\}/);
  assert.match(page, /#banner\{position:fixed;right:24px;bottom:104px;/, 'the banner sits where the fix sheet sits (empty when all is yes)');
  const laptop = page.slice(page.indexOf('@media (max-width:1500px)'));
  assert.doesNotMatch(laptop.slice(0, laptop.indexOf('}\n}')), /#btnEscape kbd/, 'Show me keeps its Space hint on a laptop');
});

test('the page puts no game words in front of people', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const body = page.slice(page.indexOf('<body>'));
  for (const w of [/level complete/i, /escape!/i, /scoreboard/i, /\bgame\b/i, /\bPASS\b/, /\bFAIL\b/, /\bobject\b/i, /\bplace an\b/i]) {
    assert.doesNotMatch(body, w);
  }
  assert.match(body, />Show me <kbd>Space<\/kbd><\/button>/);
  assert.match(page, /<title>Escape Plan - ask your building<\/title>/);
});
