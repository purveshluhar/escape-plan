// The smoke tint: one translucent block per reached node of the slice, darker near the source, and
// a node shows from the time its step comes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Building } from '../contract/types.ts';
import { smokeTints, tintOnShownFloor, tintVisible } from './smoke.ts';

const box = { x: 0, y: 0, width: 4, depth: 3 };
const node = (id: string, level: string) => ({ id, name: id, level, type: 'room' as const, box, is_exit: false });
const b = {
  levels: [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 3.5 }, { id: 'T04', elevation: 10 }],
  nodes: [node('lobby', 'L1'), node('corridor', 'L1'), node('office', 'L1'), node('core-l10', 'L2'), node('core-T04', 'T04'), node('far', 'L1')],
  edges: [], members: [], tokens: [],
} as unknown as Building;
const steps = new Map([['lobby', 0], ['corridor', 2], ['core-l10', 1], ['core-T04', 1], ['office', 3]]);

test('a tint for each reached node of the slice, none for the tower floors the backdrop draws or unreached nodes', () => {
  const tints = smokeTints(b, new Set(['core-T04']), steps);
  assert.deepEqual(tints.map((t) => t.id), ['lobby', 'core-l10', 'corridor', 'office'], 'in step order, then by id; no far, no core-T04');
});

test('a tint sits on its node: centred on the box, at its level, and denser near the source', () => {
  const tints = smokeTints(b, new Set(), steps);
  const lobby = tints.find((t) => t.id === 'lobby'), corridor = tints.find((t) => t.id === 'corridor');
  assert.deepEqual(lobby!.center.map((v) => Math.round(v * 100) / 100), [2, 0.8, 1.5]);
  assert.ok(lobby!.opacity > corridor!.opacity, 'step 0 is denser than step 2');
  assert.ok(smokeTints(b, new Set(), new Map([['lobby', 90]]))[0]!.opacity >= 0.09, 'never invisible');
  assert.deepEqual(smokeTints(b, new Set(), new Map()), [], 'no smoke, no tint');
});

test('a tint shows once its step has come, all at once on reduced motion', () => {
  assert.equal(tintVisible(2, 1.5, 2.9, false), false);
  assert.equal(tintVisible(2, 1.5, 3, false), true);
  assert.equal(tintVisible(0, 1.5, 0, false), true, 'the source shows from the start');
  assert.equal(tintVisible(40, 1.5, 0, true), true);
});

test('a start delay holds every tint back by that long', () => {
  assert.equal(tintVisible(1, 1, 1.4, false, 0.5), false);
  assert.equal(tintVisible(1, 1, 1.5, false, 0.5), true);
  assert.equal(tintVisible(0, 1, 0.4, false, 0.5), false, 'the source too');
  assert.equal(tintVisible(9, 1, 0, true, 0.5), true, 'reduced motion shows all at once');
});

test('a tint on a floor the zoom view hides is not drawn (SmokeTint.floor against the open ceiling)', () => {
  const tints = smokeTints(b, new Set(), steps);
  const at = (id: string) => tints.find((t) => t.id === id)!;
  assert.deepEqual([at('lobby').floor, at('core-l10').floor], [0, 3.5]);
  // Facade open, floors from 3.5 m up hidden: the L2 tint goes, the L1 tint stays.
  assert.equal(tintOnShownFloor(at('lobby').floor, true, 3.5), true);
  assert.equal(tintOnShownFloor(at('core-l10').floor, true, 3.5), false);
  // Facade closed: every floor of the slice shows.
  assert.equal(tintOnShownFloor(at('core-l10').floor, false, 3.5), true);
  assert.equal(tintOnShownFloor(at('core-l10').floor, true, Infinity), true);
});
