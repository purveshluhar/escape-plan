import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building, Edit } from '../contract/types.ts';
import { applyEdits, solve } from '../solver/index.ts';
import { flashPoint, flashingMembers, memberBoxes } from './members.ts';

const b = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const widen: Edit = { op: 'widen', target: 'plant-shaft', value: 2, source: 'button' };
const beamEdit: Edit = { op: 'add_transfer_beam', target: 'beam-b2', value: null, source: 'button' };
const near = (got: readonly number[], want: readonly number[]): void =>
  want.forEach((w, i) => assert.ok(Math.abs(got[i]! - w) < 1e-6, `[${i}] ${got[i]} vs ${w}`));

test('three members are drawn: the foundation below the corridor, the column up to the beam, the beam out to the column', () => {
  const boxes = memberBoxes(b);
  assert.deepEqual(boxes.map((m) => [m.id, m.kind]), [['f1', 'foundation'], ['c1', 'column'], ['beam-b2', 'beam']]);
  const [f1, c1, b2] = boxes;
  near(f1!.center, [14.25, -0.5, 21.9]);
  near(f1!.size, [2.4, 1, 2.4]);
  near(c1!.center, [14.25, 7.0866, 21.9]); // from the L1 floor to the L3 floor, where the beam sits
  near(c1!.size, [0.9, 14.1732, 0.9]);
  near(b2!.center, [14.25, 13.8732, 18.225]); // from the plant centre (z 14.55) to the column (z 21.9)
  near(b2!.size, [7.35, 0.6, 0.7]);
  near([b2!.yaw], [-Math.PI / 2]);
  assert.equal(f1!.yaw, 0);
});

test('a transfer beam is drawn deeper than a beam, so the fix can be seen', () => {
  const after = memberBoxes(applyEdits(b, [beamEdit])).find((m) => m.id === 'beam-b2')!;
  assert.equal(after.kind, 'transfer_beam');
  near(after.size, [7.35, 1.08, 0.7]);
});

test('a member with no node is not drawn', () => {
  const bare = structuredClone(b);
  delete bare.members[2]!.node;
  assert.deepEqual(memberBoxes(bare).map((m) => m.id), ['f1', 'c1']);
});

test('beam B2 flashes red when the load has no support there, and nothing flashes as built', () => {
  assert.deepEqual(flashingMembers(solve(b, [widen])), ['beam-b2']);
  assert.deepEqual(flashingMembers(solve(b)), []);
  assert.deepEqual(flashingMembers(solve(b, [widen, beamEdit])), []);
});

test('the edit flash sits on the shaft (between its two floors) or on the member it changes', () => {
  near(flashPoint(b, 'plant-shaft')!, [14.25, 7.5866, 20.4]);
  near(flashPoint(b, 'beam-b2')!, [14.25, 13.8732, 18.225]);
  assert.equal(flashPoint(b, 'no-such-id'), null);
});
