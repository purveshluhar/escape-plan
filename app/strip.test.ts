// The "who decided" strip: the sentence, what the reader made of it, then what the rules said.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile, SolverResult } from '../contract/types.ts';
import type { Reading } from './parse-client.ts';
import { parseEdit } from './shell.ts';
import { demoButtons } from './state.ts';
import { answerLines, stripModel } from './strip.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const buttons = demoButtons(building, read('../data/expected.json') as ExpectedFile);
const DEMO = 'make the lobby door 1.5 metres wide';

const local = (text: string, why: Reading['why'], decider: string | null = null): Reading =>
  ({ text, out: parseEdit(text, buttons), reader: 'local', why, decider, ms: 3 });

test('applied: three parts with their confidences, and the edit was made', () => {
  const m = stripModel({ ...local(DEMO, 'strands', 'strands'), reader: 'strands', ms: 1040 }, building);
  assert.equal(m.typed, DEMO);
  assert.equal(m.reader, 'Strands Decider');
  assert.match(m.source, /x-decider: strands/);
  assert.match(m.source, /1\.0 s/);
  assert.deepEqual(m.rows.map((r) => [r.name, r.text]), [['Edit', 'Widen'], ['Where', 'Lobby door'], ['Size', '1.5 m']]);
  assert.ok(m.rows.every((r) => r.confidence !== null && r.confidence >= 0.8));
  assert.equal(m.sure, true);
  assert.match(m.verdict, /edit was made/);
});

test('keywords server: the strip says the header value and that this page read the sentence', () => {
  const m = stripModel(local(DEMO, 'keywords', 'keywords'), building);
  assert.notEqual(m.reader, 'Strands Decider');
  assert.match(m.source, /x-decider: keywords/);
  assert.equal(m.sure, true);
});

test('server down or slow: the strip says so and shows x-decider: none', () => {
  assert.match(stripModel(local(DEMO, 'down'), building).source, /x-decider: none.*not reachable/);
  assert.match(stripModel(local(DEMO, 'slow'), building).source, /x-decider: none.*2\.5 s/);
});

test('not sure: amber, the lowest confidence named, nothing changed', () => {
  const m = stripModel(local('make the lobby bigger', 'keywords', 'keywords'), building);
  assert.equal(m.sure, false);
  assert.match(m.verdict, /^Not sure \(0\.\d\d\)\. Nothing was changed\.$/);
});

test('a ramp has no size row', () => {
  const m = stripModel(local('add a ramp at the terrace door', 'down'), building);
  assert.deepEqual(m.rows.map((r) => r.name), ['Edit', 'Where']);
  assert.equal(m.rows[0]!.text, 'Add ramp');
});

test('answer lines: Yes, or No with where it is stuck; never PASS or FAIL', () => {
  const pass: SolverResult = { token: 'wheelchair', status: 'pass', path: ['terrace'], blocked_at: null, reason: null, needed: null, available: null };
  const fail: SolverResult = { token: 'sofa', status: 'fail', path: ['lobby'], blocked_at: 'lobby-door', reason: 'cannot_turn', needed: 2.2, available: 1.99 };
  const lines = answerLines([pass, fail], building);
  assert.deepEqual(lines.map((l) => [l.name, l.answer]), [['Wheelchair', 'Yes'], ['Sofa', 'No']]);
  assert.match(lines[1]!.detail, /^Stuck at Lobby door: cannot turn/);
  assert.equal(lines[0]!.detail, '');
  assert.ok(lines.every((l) => !/PASS|FAIL/.test(`${l.answer} ${l.detail}`)));
});

test('strip text has no game words', () => {
  const src = readFileSync(new URL('./strip.ts', import.meta.url), 'utf8') + readFileSync(new URL('./strip-view.ts', import.meta.url), 'utf8');
  // String literals only, less the contract's status ids 'pass' and 'fail': code ids stay.
  const strings = [...src.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? '')
    .filter((s) => s !== 'pass' && s !== 'fail').join('\n');
  assert.doesNotMatch(strings, /\b(level complete|score|win|player|tokens?|PASS|FAIL|escaping)\b/i);
});
