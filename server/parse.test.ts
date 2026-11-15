// P1-10: parse() with the plan C keyword parser, and the DECIDER switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building, EditOp, JevParse, JevParseRequest } from '../contract/types.ts';
import { EDIT_OPS, JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { validate } from '../contract/validate.ts';
import { keywordParse } from './keywords.ts';
import { DEFAULT_DECIDER, deciderFromEnv, parse } from './parse.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;

// What the app puts on screen: every edge and member, plus one room, so "Lobby" and "Lobby door"
// can both match. Members have no name in building.json; the app shows them as "Beam B2".
const targets = [
  ...building.edges.map((e) => ({ id: e.id, name: e.name })),
  { id: 'beam-b2', name: 'Beam B2' },
  { id: 'lobby', name: 'Lobby' },
];
const req = (text: string, more: Partial<JevParseRequest> = {}): JevParseRequest => ({
  text, ops: [...EDIT_OPS], targets, value_range: { min: 0, max: 5 }, ...more,
});
const accepted = (p: JevParse): boolean =>
  p.op.confidence >= JEV_ACCEPT_CONFIDENCE && p.target.confidence >= JEV_ACCEPT_CONFIDENCE
  && (p.value === null || p.value.confidence >= JEV_ACCEPT_CONFIDENCE);
const run = (text: string, more: Partial<JevParseRequest> = {}): JevParse => {
  const p = keywordParse(req(text, more));
  assert.deepEqual(validate('jev.schema.json#/$defs/parse', p), [], `schema: ${text}`);
  return p;
};
const sure = (text: string, op: EditOp, target: string, value: number | null): void => {
  const p = run(text);
  assert.equal(p.op.choice, op, text);
  assert.equal(p.target.choice, target, text);
  assert.equal(p.value === null ? null : p.value.score, value, text);
  assert.ok(accepted(p), `${text}: ${JSON.stringify(p)}`);
};

test('ticket: "widen the plant shaft to 2 m" is widen, plant-shaft, 2, every confidence >= 0.8', () => {
  sure('widen the plant shaft to 2 m', 'widen', 'plant-shaft', 2);
});

test('ticket: a sentence with no op word gives a confidence below 0.8', () => {
  const p = run('the plant shaft to 2 m');
  assert.ok(p.op.confidence < JEV_ACCEPT_CONFIDENCE);
  assert.ok(!accepted(p));
});

test('exact op words: ramp, transfer beam, close, sleeve', () => {
  sure('add a ramp at the terrace door', 'add_ramp', 'terrace-door', null);
  sure('add a transfer beam at beam B2', 'add_transfer_beam', 'beam-b2', null);
  sure('close the lobby door', 'close_door', 'lobby-door', null);
  sure('add a sleeve to the plant shaft', 'add_sleeve', 'plant-shaft', null);
  sure('WIDEN THE PLANT SHAFT TO 2 M', 'widen', 'plant-shaft', 2);
});

test('a near word is not an exact match, so it stays below 0.8', () => {
  for (const text of ['make the plant shaft wider to 2 m', 'fix the beam at beam B2', 'shut the lobby door']) {
    const p = run(text);
    assert.ok(p.op.confidence < JEV_ACCEPT_CONFIDENCE, text);
  }
});

test('two different op words in one sentence stay below 0.8', () => {
  assert.ok(run('widen and add a ramp at the terrace door').op.confidence < JEV_ACCEPT_CONFIDENCE);
});

test('the op must be one the request offers', () => {
  const p = run('add a ramp at the terrace door', { ops: ['widen', 'reset'] });
  assert.ok(['widen', 'reset'].includes(p.op.choice));
  assert.ok(p.op.confidence < JEV_ACCEPT_CONFIDENCE);
});

test('target: the longest name wins, and an unknown name stays below 0.8', () => {
  sure('widen the lobby door to 1.6 m', 'widen', 'lobby-door', 1.6);
  sure('widen unit 1 door to 1.2 m', 'widen', 'unit1-door', 1.2); // the 1 in the name is not the value
  assert.ok(run('widen the stairwell to 2 m').target.confidence < JEV_ACCEPT_CONFIDENCE);
  assert.ok(run('widen the plant to 2 m').target.confidence < JEV_ACCEPT_CONFIDENCE); // part of a name
});

test('target: two full names in one sentence stay below 0.8', () => {
  assert.ok(run('widen the north door and the lobby door to 2 m').target.confidence < JEV_ACCEPT_CONFIDENCE);
});

test('target: an id typed as written matches too', () => {
  sure('widen unit2-door to 1.1 m', 'widen', 'unit2-door', 1.1);
});

test('reset skips the target check and has no value', () => {
  const p = run('reset');
  assert.equal(p.op.choice, 'reset');
  assert.equal(p.value, null);
  assert.ok(targets.some((t) => t.id === p.target.choice));
  assert.ok(accepted(p));
});

test('value: m and cm, with or without a space', () => {
  sure('widen the plant shaft to 250 cm', 'widen', 'plant-shaft', 2.5);
  sure('widen the plant shaft to 2.5m', 'widen', 'plant-shaft', 2.5);
  sure('widen the plant shaft to 1.8 metres', 'widen', 'plant-shaft', 1.8);
  sure('widen the plant shaft from 1 m to 2 m', 'widen', 'plant-shaft', 2); // "to" picks the value
});

test('value: out of the 0-5 m range, or no unit, or no number, stays below 0.8 and inside the range', () => {
  const cases: [string, Partial<JevParseRequest>][] = [
    ['widen the plant shaft to 8 m', {}],
    ['widen the plant shaft to 12 m', {}],
    ['widen the plant shaft to 6 m', { value_range: { min: 0, max: 10 } }], // 5 m cap holds
    ['widen the plant shaft to 1 m', { value_range: { min: 1.5, max: 5 } }], // request range holds
    ['widen the plant shaft to 2', {}],
    ['widen the plant shaft', {}],
    ['widen the plant shaft to 1 m or 2 m', {}],
  ];
  for (const [text, more] of cases) {
    const p = run(text, more);
    assert.ok(p.value !== null, text);
    assert.ok(p.value.confidence < JEV_ACCEPT_CONFIDENCE, text);
    const r = more.value_range ?? { min: 0, max: 5 };
    assert.ok(p.value.score >= r.min && p.value.score <= r.max, text);
  }
});

test('DECIDER: keywords is the default; anything else refuses to start', () => {
  assert.equal(DEFAULT_DECIDER, 'keywords');
  assert.equal(deciderFromEnv(undefined), 'keywords');
  assert.equal(deciderFromEnv(''), 'keywords');
  assert.equal(deciderFromEnv('keywords'), 'keywords');
  assert.throws(() => deciderFromEnv('strands'), /DECIDER/);
  assert.throws(() => deciderFromEnv('jev'), /DECIDER/);
  assert.throws(() => deciderFromEnv('Keywords '), /DECIDER/);
});

test('parse() uses the keyword parser by default', () => {
  const r = req('widen the plant shaft to 2 m');
  assert.deepEqual(parse(r), keywordParse(r));
  assert.deepEqual(parse(r, 'keywords'), keywordParse(r));
});

// ---------- Adversarial review, round 1 ----------

test('review: 255 targets and a 1000-character sentence parse in well under a second', () => {
  const short = Array.from({ length: 255 }, (_, i) => ({ id: `t${i}`, name: i % 2 ? '1' : 'x' }));
  const long = Array.from({ length: 255 }, (_, i) => ({ id: `t${i}`, name: 'w '.repeat(100).trim() }));
  for (const [list, text] of [[short, 'x1'.repeat(500)], [long, 'w '.repeat(500)]] as const) {
    const t0 = performance.now();
    run(text, { targets: [...list] });
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `${ms} ms`);
  }
});

test('review: a number with punctuation around it, or a relative change, stays below 0.8', () => {
  for (const tail of ['1,5 m', '1/2 m', '-2 m', '1e3 m', '2.5.3 m', '2 m 50', '2 m, wait, 3', '2 constructor']) {
    const p = run(`widen the plant shaft to ${tail}`);
    assert.ok(p.value !== null && p.value.confidence < JEV_ACCEPT_CONFIDENCE, tail);
  }
  const by = run('widen the plant shaft by 2 m');
  assert.ok(by.value !== null && by.value.confidence < JEV_ACCEPT_CONFIDENCE);
  // Sentence-end punctuation is fine.
  sure('widen the plant shaft to 2 m.', 'widen', 'plant-shaft', 2);
});

test('review: a near word for a second op makes the op unclear', () => {
  for (const text of ['widen the plant shaft to 2 m and shut the door', 'undo the plant shaft and widen it to 2 m']) {
    assert.ok(run(text).op.confidence < JEV_ACCEPT_CONFIDENCE, text);
  }
  sure('add a transfer beam at beam B2', 'add_transfer_beam', 'beam-b2', null); // its own near words do not count
});

test('review: a reset nobody typed keeps the target it read', () => {
  const a = run('the plant shaft to 2 m', { ops: ['reset', 'widen'] });
  assert.equal(a.op.choice, 'widen');
  assert.equal(a.target.choice, 'plant-shaft');
  assert.ok(!accepted(a));
  const b = run('widen the plant shaft to 2 m', { ops: ['reset', 'add_ramp'] });
  assert.ok(!accepted(b));
  assert.equal(b.target.choice, 'plant-shaft');
  const undo = run('undo the lobby door');
  assert.equal(undo.op.choice, 'reset');
  assert.equal(undo.target.choice, 'lobby-door');
  assert.ok(!accepted(undo));
});

test('review: a target named only with stop words never matches by name', () => {
  const p = run('close a door', { targets: [{ id: 'grid-a', name: 'A' }, ...targets] });
  assert.ok(!(p.target.choice === 'grid-a' && p.target.confidence >= JEV_ACCEPT_CONFIDENCE));
});

test('review: a negated order stays below 0.8', () => {
  for (const text of ["don't widen the plant shaft to 2 m", 'do not close the lobby door', 'never add a ramp at the terrace door']) {
    assert.ok(run(text).op.confidence < JEV_ACCEPT_CONFIDENCE, text);
  }
});
