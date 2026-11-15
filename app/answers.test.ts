import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answers, expectedFor, nodeRoute, relevantTargets } from './answers.ts';
import { demoButtons, run } from './state.ts';
import { IMPLEMENTED_RULES } from '../solver/index.ts';
import type { Building, Edit, ExpectedFile } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;
const demo = demoButtons(building, expected).map((b) => b.edit);

function solved(edits: Edit[]) {
  const { building: edited, results } = run(building, { edits });
  return answers(building, edited, edits, results, expected, IMPLEMENTED_RULES);
}
const status = (edits: Edit[]) => Object.fromEntries(solved(edits).map((r) => [r.token, r.status]));

test('every expected.json case is answered exactly, edit for edit', () => {
  for (const c of expected.cases) {
    const got = solved(c.edits);
    for (const e of c.expect) {
      const r = got.find((x) => x.token === e.token);
      assert.ok(r, `${c.id}: no answer for ${e.token}`);
      if (IMPLEMENTED_RULES.includes(building.tokens.find((t) => t.id === e.token)!.rule)) continue;
      assert.equal(r.status, e.status, `${c.id}: ${e.token}`);
      if (e.blocked_at !== undefined) assert.equal(r.blocked_at, e.blocked_at, `${c.id}: ${e.token} blocked_at`);
      if (e.reason !== undefined) assert.equal(r.reason, e.reason, `${c.id}: ${e.token} reason`);
    }
  }
});

test('the plant shaft matters to the load, because it cuts beam B2', () => {
  const t = relevantTargets(building, expected, 'load');
  assert.ok(t.has('beam-b2') && t.has('plant-shaft'));
  assert.ok(!relevantTargets(building, expected, 'wheelchair').has('plant-shaft'));
});

test('a fix only changes the object it is for, in any order', () => {
  // The ramp alone lets the wheelchair out; no case lists exactly this, but the full demo does.
  const ramp = demo.find((e) => e.op === 'add_ramp')!;
  assert.equal(expectedFor(building, expected, 'wheelchair', [ramp])?.status, 'pass');
  assert.deepEqual(status([ramp]), { chiller: 'fail', glass: 'fail', wheelchair: 'pass', load: 'pass', sofa: 'fail', people: 'fail' });
  // Widen the shaft: the chiller escapes and the load loses its support (the CONFLICT! moment).
  assert.deepEqual(status([demo[0]!]), { chiller: 'pass', glass: 'fail', wheelchair: 'fail', load: 'fail', sofa: 'fail', people: 'fail' });
  // Every demo fix, in reverse order: level complete.
  assert.deepEqual(status([...demo].reverse()), { chiller: 'pass', glass: 'pass', wheelchair: 'pass', load: 'pass', sofa: 'pass', people: 'pass' });
});

test('stand-in fails carry needs and has from the edited building', () => {
  const chiller = solved([]).find((r) => r.token === 'chiller')!;
  assert.equal(chiller.source, IMPLEMENTED_RULES.includes('clearance') ? 'solver' : 'expected');
  if (chiller.source === 'expected') {
    assert.equal(chiller.needed, 1.6);
    assert.equal(chiller.available, 1.2);
  }
});

test('routes give the viewer a line: start to goal, or up to the blocking edge', () => {
  assert.deepEqual(nodeRoute(building, 'plant', 'truck'), ['plant', 'corridor', 'street', 'truck']);
  assert.deepEqual(nodeRoute(building, 'terrace', null), ['terrace', 'lobby', 'corridor', 'street']);
  const glass = solved([]).find((r) => r.token === 'glass')!;
  if (glass.source === 'expected') assert.deepEqual(glass.path, ['street', 'corridor']);
  const load = solved([...demo]).find((r) => r.token === 'load')!;
  if (load.source === 'expected') assert.deepEqual(load.path, ['beam-b2', 'c1', 'f1']);
});
