import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { MVP_TOKENS } from './mvp.ts';
import { QUESTIONS, allYesText, questionOf, routeShown, yesLine } from './questions.ts';
import { metres, stuckLine } from './scoreboard.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const base = solve(building);
const at = (id: string) => base.find((r) => r.token === id)!;

test('every token in the building, and every MVP token, has a person, a question and a yes line', () => {
  for (const id of [...MVP_TOKENS, ...building.tokens.map((t) => t.id)]) {
    const q = questionOf(id);
    assert.ok(q, `no question for ${id}`);
    assert.ok(q.person && q.ask.endsWith('?') && q.yes, `incomplete question for ${id}`);
  }
});

test('the MVP questions are the people questions of copy.md', () => {
  assert.deepEqual(MVP_TOKENS.map((id) => [QUESTIONS[id]!.person, QUESTIONS[id]!.ask]), [
    ['Family', "Can my parent's wheelchair get out?"],
    ['Home buyer', 'Can my sofa get in?'],
    ['Building manager', 'Can everyone get out?'],
    ['Building owner', 'Can I widen this shaft for a new chiller?'],
    ['Building owner', 'Does the structure still hold?'],
  ]);
});

test('a token with no question gets none, not a crash', () => {
  assert.equal(questionOf('nobody'), null);
  assert.equal(yesLine('nobody'), 'Nobody gets through');
});

test('metres always show at least one decimal', () => {
  assert.deepEqual([2, 0.5, 1.17, 3.7102104972170333, 1.9967350242673378, 0.15].map(metres), ['2.0 m', '0.5 m', '1.17 m', '3.71 m', '2.0 m', '0.15 m']);
  assert.equal(metres(-0.001), '0.0 m', 'no minus zero');
});

test('the no line says who is stuck, where, why and the numbers, with the verb agreeing', () => {
  assert.equal(stuckLine(building, at('sofa')), 'Sofa is stuck at Lobby door: cannot turn the corner, needs 2.2 m, has 2.0 m');
  assert.equal(stuckLine(building, at('people')), 'People are stuck at Office door: too narrow, needs 0.6 m, has 0.5 m');
  assert.equal(stuckLine(building, at('wheelchair')), 'Wheelchair is stuck at Terrace door: step in the way, 0.15 m high, needs level');
  assert.equal(stuckLine(building, at('chiller')), 'Chiller is stuck at Plant shaft: too narrow, needs 1.6 m, has 1.2 m');
});

test('a cut beam reads as the structure losing its path down', () => {
  const load = solve(building, [{ op: 'widen', target: 'plant-shaft', value: 2.0, source: 'button' }]).find((r) => r.token === 'load')!;
  assert.equal(stuckLine(building, load), 'Load is stuck at beam B2: nothing holds it up, no path down to a foundation');
});

test('all yes: a calm headline, the yes lines and the edit count', () => {
  assert.deepEqual(allYesText(['sofa'], 0), { title: 'Yes', lines: 'The sofa gets in. As built, no edits.' });
  assert.deepEqual(allYesText(['wheelchair', 'sofa', 'people'], 3), {
    title: 'Yes to all 3',
    lines: 'The wheelchair gets out, no steps. The sofa gets in. Everyone gets out. With 3 edits.',
  });
  assert.equal(allYesText(['people'], 1).lines, 'Everyone gets out. With 1 edit.');
});

test('a get-in question lists its route from the street in; a get-out question lists it as walked', () => {
  const walked = ['lobby', 'corridor', 'street'];
  assert.deepEqual(routeShown('sofa', walked), ['street', 'corridor', 'lobby']);
  assert.deepEqual(routeShown('people', walked), walked);
  assert.deepEqual(routeShown('glass', ['street', 'lobby']), ['street', 'lobby'], 'glass already walks in');
  assert.deepEqual(walked, ['lobby', 'corridor', 'street'], 'the walked route is not changed');
});
