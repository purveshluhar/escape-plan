// The smoke race in the app: the question, the fix button and its typed phrase, the step-count
// text, and the rows the screen and the viewer get. No game words (design/copy.md).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Building, ExpectedFile } from '../contract/types.ts';
import { withSmoke } from '../data/smoke.ts';
import { IMPLEMENTED_RULES } from '../solver/index.ts';
import { answers } from './answers.ts';
import type { Answer } from './answers.ts';
import { conflictOf } from './conflict.ts';
import { MVP_TOKENS, mvpButtons } from './mvp.ts';
import { questionOf } from './questions.ts';
import { stuckLine } from './scoreboard.ts';
import { parseEdit, pickerItems, withStarts } from './shell.ts';
import { RACE, answerRows, raceSpread, drawnResults, helpfulCloseButtons, raceAnswer, raceButtons, raceSecondsPerStep, raceSteps, raceText, racePlaced } from './smoke.ts';
import { applyEdit, demoButtons, initialState, resetState, run } from './state.ts';
import { answerLines } from './strip.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const base = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const building = withSmoke(base);
const all = demoButtons(base, expected);
const buttons = mvpButtons(base, all);
const fix = (target: string, op: string) => buttons.find((b) => b.edit.target === target && b.edit.op === op)!;
const widenOffice = fix('office-door', 'widen');
const closeLobby = fix('lobby-door', 'close_door');

// The app's own pass: answers for every token with the smoke in the building.
function solved(edits: typeof initialState extends () => infer S ? S : never): { b: Building; rows: Answer[] } {
  const { building: b, results } = run(building, edits);
  return { b, rows: answers(building, b, edits.edits, results, expected, IMPLEMENTED_RULES) };
}
const after = (...b: { edit: import('../contract/types.ts').Edit }[]) => solved(b.reduce((s, x) => applyEdit(s, x.edit), initialState()));

test('there is a "Close lobby door" fix button, from the data, and it is one of the MVP buttons', () => {
  assert.ok(closeLobby, 'close_door at lobby-door is offered');
  assert.equal(closeLobby.label, 'Close lobby door');
  assert.deepEqual(closeLobby.edit, { op: 'close_door', target: 'lobby-door', value: null, source: 'button' });
  assert.deepEqual(raceButtons(buttons).map((b) => b.label), ['Close lobby door']);
});

test('the dock has a sixth question, key 6: do people get out before the smoke', () => {
  assert.equal(MVP_TOKENS.at(-1), RACE);
  const items = pickerItems(building, MVP_TOKENS);
  assert.deepEqual(items.at(-1) && [items.at(-1)!.token, items.at(-1)!.key], ['smoke', 6]);
  const q = questionOf('smoke')!;
  assert.deepEqual([q.person, q.ask, q.yes], ['Building manager', 'Do people get out before the smoke?', 'Everyone gets out before the smoke']);
});

test('typed phrases for the fix go through the same reader and need no fix on screen first', () => {
  for (const text of ['close the lobby door', 'Close lobby door', 'shut the lobby door', 'close the door to the lobby']) {
    const out = parseEdit(text, all);
    assert.deepEqual(out.edit && [out.edit.op, out.edit.target, out.edit.value, out.edit.source], ['close_door', 'lobby-door', null, 'text'], text);
  }
  assert.equal(parseEdit('widen the lobby door to 1.6 m', all).edit?.op, 'widen', 'a widen sentence is still a widen');
  assert.equal(parseEdit('do not close the lobby door', all).edit, null, 'a no is never sure');
});

test('the race answer mirrors people: No at the corridor when the office door is wide and the lobby door is open', () => {
  const { rows } = after(widenOffice);
  const race = raceAnswer(rows)!;
  assert.deepEqual([race.token, race.status, race.reason, race.blocked_at, race.needed, race.available], ['smoke', 'fail', 'smoke_first', 'corridor', 1, 1]);
  assert.equal(raceAnswer(rows.filter((r) => r.token !== 'people')), null);
});

test('closing the lobby door turns the race to Yes, and Undo edits turns it back', () => {
  const closed = after(widenOffice, closeLobby);
  assert.equal(raceAnswer(closed.rows)!.status, 'pass');
  const undone = solved(resetState());
  assert.equal(raceAnswer(undone.rows)!.reason, 'too_narrow', 'back to the narrow office door');
  const wide = solved(applyEdit(initialState(), widenOffice.edit));
  assert.equal(raceAnswer(wide.rows)!.reason, 'smoke_first');
});

test('the close-door fix breaks no other answer, so the conflict notice stays quiet', () => {
  const fixes = [widenOffice, fix('lobby-door', 'widen'), fix('terrace-door', 'add_ramp')];
  const before = after(...fixes);
  const closed = after(...fixes, closeLobby);
  const shown = (rows: Answer[]): Answer[] => answerRows(rows, rows.map((r) => r.token));
  assert.equal(conflictOf(shown(before.rows), shown(closed.rows), 'Close lobby door', closed.b), null);
  // The notice still works for the race: the smoke taking a Yes away names the question.
  const c = conflictOf(shown(closed.rows), shown(before.rows), 'Open lobby door', before.b);
  assert.ok(c && c.lines.some((l) => l.startsWith('Do people get out before the smoke? Yes became No.')));
});

test('step-count text: the tie goes to the smoke, and a win says who is one step ahead', () => {
  const lost = after(widenOffice);
  assert.equal(raceText(lost.b, raceAnswer(lost.rows)!),
    'People reach North service corridor at step 1. Smoke gets there at step 1. A tie goes to the smoke.');
  const won = after(widenOffice, closeLobby);
  assert.equal(raceText(won.b, raceAnswer(won.rows)!),
    'People reach North service corridor at step 1 and Street at step 2. Smoke reaches North service corridor at step 2, 1 step after them.');
  const stuck = after();
  assert.equal(raceText(stuck.b, raceAnswer(stuck.rows)!), '', 'no race text while people cannot get out at all');
});

test('the stuck line names people, not the smoke, and counts 1 step as 1 step', () => {
  const lost = after(widenOffice);
  assert.equal(stuckLine(lost.b, raceAnswer(lost.rows)!), 'People are stuck at North service corridor: smoke gets there first, people at step 1, smoke at step 1');
  assert.match(answerLines([raceAnswer(lost.rows)!], lost.b)[0]!.detail, /^Stuck at North service corridor: smoke gets there first, people at step 1, smoke at step 1$/);
});

test('smoke is drawn parked in the lobby, and people are drawn with it even when only the smoke is placed', () => {
  assert.deepEqual(racePlaced(building, ['smoke']), ['people', 'smoke']);
  assert.deepEqual(racePlaced(building, ['wheelchair']), ['wheelchair']);
  const { rows } = after(widenOffice);
  const drawn = drawnResults(rows, ['smoke']);
  assert.deepEqual(drawn.map((r) => r.token), ['people', 'smoke']);
  const smoke = drawn.find((r) => r.token === 'smoke')!;
  assert.deepEqual([smoke.status, smoke.path, smoke.blocked_at], ['pass', ['lobby'], null], 'a pass at its start: no walk, no red X');
  assert.equal(drawn.find((r) => r.token === 'people')!.reason, 'smoke_first', 'people keep their own answer');
  assert.equal(drawnResults(rows, ['wheelchair']).every((r) => r.token === 'wheelchair'), true);
});

test('the viewer gets the smoke step of every node, and a step length that puts people and smoke on one clock', () => {
  const won = after(widenOffice, closeLobby);
  const steps = raceSteps(won.b);
  assert.deepEqual([steps.get('lobby'), steps.get('corridor'), steps.get('street')], [0, 2, 3]);
  assert.equal(raceSteps(base).size, 0, 'no smoke, no steps');
  assert.equal(raceSecondsPerStep(won.rows.find((r) => r.token === 'people')!, 2), 1, 'people walk 2 steps in 2 s');
  const lost = after(widenOffice);
  assert.equal(raceSecondsPerStep(lost.rows.find((r) => r.token === 'people')!, 2), 2, 'they stop at the corridor, step 1');
});

test('no game words in the new copy', () => {
  const lines = [questionOf('smoke')!.ask, questionOf('smoke')!.yes, closeLobby.label,
    raceText(after(widenOffice).b, raceAnswer(after(widenOffice).rows)!), raceText(after(widenOffice, closeLobby).b, raceAnswer(after(widenOffice, closeLobby).rows)!)];
  for (const l of lines) assert.doesNotMatch(l, /\b(level|score|win|won|lose|lost|player|race|token|pass|fail|game)\b/i, l);
});

// ---- review round 1 ----

test('"close" names no door: "close the office door" is not read as the lobby door', () => {
  for (const text of ['close the office door', 'close the terrace door', 'close the door', 'shut the office door']) {
    assert.equal(parseEdit(text, all).edit, null, text);
  }
});

test('adding the close button leaves the short phrases alone: "widen lobby" still means the lobby door', () => {
  const out = parseEdit('widen lobby', all);
  assert.deepEqual(out.edit && [out.edit.op, out.edit.target, out.edit.value], ['widen', 'lobby-door', 1.6]);
  for (const [text, op, target] of [['widen lobby door', 'widen', 'lobby-door'], ['widen office', 'widen', 'office-door'], ['ramp terrace', 'add_ramp', 'terrace-door'], ['widen shaft 2.0', 'widen', 'plant-shaft'], ['transfer beam', 'add_transfer_beam', 'beam-b2'], ['add a ramp', 'add_ramp', 'terrace-door']] as const) {
    const e = parseEdit(text, all).edit;
    assert.deepEqual(e && [e.op, e.target], [op, target], text);
  }
});

test('the close fix is offered only where it turns the answer to Yes (people dropped upstairs get none)', () => {
  const trySolve = (starts: Map<string, string>) => (edits: readonly import('../contract/types.ts').Edit[]) => {
    const b = withStarts(building, starts);
    return answerRows(answers(b, run(b, { edits: [...edits] }).building, edits, run(b, { edits: [...edits] }).results, expected, IMPLEMENTED_RULES), ['smoke']);
  };
  const edits = [widenOffice.edit];
  assert.deepEqual(helpfulCloseButtons(buttons, 'smoke', edits, trySolve(new Map())).map((b) => b.label), ['Close lobby door']);
  const up = trySolve(new Map([['people', 'core-T10']]));
  assert.equal(up(edits)[0]!.reason, 'smoke_first');
  assert.deepEqual(helpfulCloseButtons(buttons, 'smoke', edits, up), []);
});

test('the smoke figure waits where the smoke starts, also after it is dropped elsewhere', () => {
  const b = withStarts(building, new Map([['smoke', 'street']]));
  const { rows } = { rows: answers(b, run(b, initialState()).building, [], run(b, initialState()).results, expected, IMPLEMENTED_RULES) };
  assert.deepEqual(drawnResults(rows, ['smoke']).find((r) => r.token === 'smoke')!.path, ['street']);
  assert.deepEqual(drawnResults(after().rows, ['smoke']).find((r) => r.token === 'smoke')!.path, ['lobby']);
});

test('the tint clock starts when the people start: the people are third to start, 0.5 s in', () => {
  const lost = after(widenOffice);
  const spread = raceSpread(lost.b, lost.rows, 2, 0.5);
  assert.deepEqual([spread!.secondsPerStep, spread!.delaySeconds], [2, 0.5]);
  assert.equal(raceSpread(lost.b, lost.rows.filter((r) => r.token !== 'smoke'), 2, 0), null);
});

// ---- review round 2 and the image check ----

test('a close sentence that names another door or a size is not read as the lobby door', () => {
  for (const text of ['close the office door in the lobby', 'close the terrace door in the lobby', 'close the lobby door and the office door',
    'close lobby door to 0.5 m', 'close the shaft by the lobby door']) {
    assert.equal(parseEdit(text, all).edit, null, text);
  }
  for (const text of ['close the lobby door', 'shut the lobby door', 'close lobby door']) assert.equal(parseEdit(text, all).edit?.target, 'lobby-door', text);
});

test('the tint pace for a stop that is not the smoke (a narrow door) uses the people\'s steps, not a width in metres', () => {
  const narrow = after();
  const people = narrow.rows.find((r) => r.token === 'people')!;
  assert.equal(people.reason, 'too_narrow');
  assert.equal(raceSecondsPerStep(people, 2), 2, 'one step walked, not max(1, 0.6)');
});

test('a win names one place for both: people and smoke at the corridor, then the exit', () => {
  const won = after(widenOffice, closeLobby);
  assert.match(raceText(won.b, raceAnswer(won.rows)!), /^People reach North service corridor at step 1 and Street at step 2\. Smoke reaches North service corridor at step 2, 1 step after them\.$/);
});
