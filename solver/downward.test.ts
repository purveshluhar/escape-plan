import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutOf, downward } from './downward.ts';
import { IMPLEMENTED_RULES, solve } from './index.ts';
import type { Building, Edge, Member, SolverResult, Token } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const demo = read('../data/building.json') as Building;

const load: Token = {
  id: 'load', discipline: 'structure', start: 'beam', goal: null,
  size: { width: 0, height: 0, length: 0 }, rule: 'downward',
};
const member = (id: string, kind: Member['kind'], supported_by: string[] = []): Member => ({ id, kind, level: 'L1', supported_by });
const shaft = (e: Partial<Edge> = {}): Edge => ({
  id: 'shaft', name: 'shaft', from: 'a', to: 'b', kind: 'shaft', clear_width: 1.2, clear_height: 3, step_height: 0,
  crosses: ['beam'], cuts_above_width: 1.5, ...e,
});
// beam -> col -> f, one shaft that crosses the beam.
function frame(members: Member[] = [member('beam', 'beam', ['col']), member('col', 'column', ['f']), member('f', 'foundation')], edges: Edge[] = [shaft()]): Building {
  return {
    levels: [{ id: 'L1', elevation: 0 }],
    nodes: [
      { id: 'a', name: 'a', level: 'L1', type: 'plant', box: { x: 0, y: 0, width: 2, depth: 2 }, is_exit: false },
      { id: 'b', name: 'b', level: 'L1', type: 'corridor', box: { x: 0, y: 0, width: 2, depth: 2 }, is_exit: true },
    ],
    edges,
    members,
    tokens: [load],
  };
}
const record = (r: SolverResult) => [r.status, r.path, r.blocked_at, r.reason, r.needed, r.available];

test('downward is implemented', () => {
  assert.ok(IMPLEMENTED_RULES.includes('downward'));
});

test('demo base: the load walks beam-b2 -> c1 -> f1', () => {
  const r = solve(demo).find((x) => x.token === 'load')!;
  assert.deepEqual(record(r), ['pass', ['beam-b2', 'c1', 'f1'], null, null, null, null]);
});

test('demo widen-shaft: beam-b2 is cut, needed 1.5, available 2.0', () => {
  const r = solve(demo, [{ op: 'widen', target: 'plant-shaft', value: 2, source: 'button' }]).find((x) => x.token === 'load')!;
  assert.deepEqual(record(r), ['fail', ['beam-b2'], 'beam-b2', 'no_support', 1.5, 2]);
});

test('demo widen-shaft and transfer beam: the load passes again', () => {
  const r = solve(demo, [
    { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' },
    { op: 'add_transfer_beam', target: 'beam-b2', value: null, source: 'button' },
  ]).find((x) => x.token === 'load')!;
  assert.deepEqual(record(r), ['pass', ['beam-b2', 'c1', 'f1'], null, null, null, null]);
});

test('clear_width equal to cuts_above_width does not cut', () => {
  assert.equal(downward(frame(undefined, [shaft({ clear_width: 1.5 })]), load).status, 'pass');
  assert.equal(downward(frame(undefined, [shaft({ clear_width: 1.51 })]), load).status, 'fail');
});

test('an edge with crosses but no cuts_above_width never cuts', () => {
  const e = shaft({ clear_width: 9 });
  delete e.cuts_above_width;
  assert.equal(downward(frame(undefined, [e]), load).status, 'pass');
});

test('a transfer beam is never cut', () => {
  const b = frame([member('beam', 'transfer_beam', ['col']), member('col', 'column', ['f']), member('f', 'foundation')], [shaft({ clear_width: 3 })]);
  assert.equal(downward(b, load).status, 'pass');
});

test('a cut member lower down: path stops at it', () => {
  const r = downward(frame(undefined, [shaft({ crosses: ['col'], clear_width: 2 })]), load);
  assert.deepEqual(record(r), ['fail', ['beam', 'col'], 'col', 'no_support', 1.5, 2]);
});

test('a member cut by two edges reports the lowest edge id', () => {
  const r = downward(frame(undefined, [
    shaft({ id: 'z-shaft', clear_width: 3, cuts_above_width: 1 }),
    shaft({ id: 'a-shaft', clear_width: 2, cuts_above_width: 1.5 }),
  ]), load);
  assert.deepEqual([r.reason, r.needed, r.available], ['no_support', 1.5, 2]);
  assert.deepEqual(cutOf(frame(undefined, [shaft({ id: 'z', clear_width: 3 }), shaft({ id: 'y', clear_width: 1 })])).get('beam')?.id, 'z');
});

test('a second support carries the load past a cut one', () => {
  const b = frame(
    [member('beam', 'beam', ['c-cut', 'c-ok']), member('c-cut', 'column', ['f']), member('c-ok', 'column', ['f']), member('f', 'foundation')],
    [shaft({ crosses: ['c-cut'], clear_width: 2 })],
  );
  assert.deepEqual(record(downward(b, load)), ['pass', ['beam', 'c-ok', 'f'], null, null, null, null]);
});

test('of two clear supports the lower id wins, then the fewest members', () => {
  const b = frame([
    member('beam', 'beam', ['c2', 'c1']), member('c1', 'column', ['c0']), member('c0', 'column', ['f']),
    member('c2', 'column', ['f']), member('f', 'foundation'),
  ], []);
  assert.deepEqual(downward(b, load).path, ['beam', 'c2', 'f']);
  const tie = frame([member('beam', 'beam', ['c2', 'c1']), member('c1', 'column', ['f']), member('c2', 'column', ['f']), member('f', 'foundation')], []);
  assert.deepEqual(downward(tie, load).path, ['beam', 'c1', 'f']);
});

test('a chain that reaches no foundation is no_route', () => {
  const b = frame([member('beam', 'beam', ['col']), member('col', 'column', ['beam'])], []);
  assert.deepEqual(record(downward(b, load)), ['fail', ['beam'], null, 'no_route', null, null]);
});

test('a support that is not a member is skipped', () => {
  const b = frame([member('beam', 'beam', ['ghost'])], []);
  assert.deepEqual(record(downward(b, load)), ['fail', ['beam'], null, 'no_route', null, null]);
});

test('a start that is not a member is no_route with an empty path', () => {
  assert.deepEqual(record(downward(frame(), { ...load, start: 'nowhere' })), ['fail', [], null, 'no_route', null, null]);
});

test('a start that is a foundation passes at once', () => {
  assert.deepEqual(record(downward(frame(), { ...load, start: 'f' })), ['pass', ['f'], null, null, null, null]);
});

test('a goal member: the load must reach that member', () => {
  const b = frame([member('beam', 'beam', ['col']), member('col', 'column', ['f']), member('f', 'foundation')], []);
  assert.deepEqual(downward(b, { ...load, goal: 'col' }).path, ['beam', 'col']);
});
