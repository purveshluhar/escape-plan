import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building } from '../contract/types.ts';
import {
  CLICK_SLOP, dropTarget, droppableNodes, figureScale, movedPastSlop, pickToken, pressIntent, stepLevel,
} from './drop.ts';

// Three levels of our own, so these tests do not move when data/building.json does.
// L1: a 10 m square lobby, and a street exit past its south side. L2: a unit along the north side
// and a core in the middle. L3: only a riser shaft, so nothing on it takes a token.
const b: Building = {
  levels: [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 4 }, { id: 'L3', elevation: 8 }],
  nodes: [
    { id: 'lobby', name: 'Lobby', level: 'L1', type: 'lobby', box: { x: 0, y: 0, width: 10, depth: 10 }, is_exit: false },
    { id: 'street', name: 'Street', level: 'L1', type: 'street', box: { x: 0, y: 10, width: 10, depth: 4 }, is_exit: true },
    { id: 'unit', name: 'Unit', level: 'L2', type: 'room', box: { x: 0, y: 0, width: 10, depth: 3 }, is_exit: false },
    { id: 'core', name: 'Core', level: 'L2', type: 'lobby', box: { x: 3, y: 3, width: 4, depth: 4 }, is_exit: false },
    { id: 'riser', name: 'Riser', level: 'L3', type: 'shaft', box: { x: 3, y: 3, width: 4, depth: 4 }, is_exit: false },
  ],
  edges: [],
  members: [],
  tokens: [],
};

test('droppable nodes: rooms, cores and halls, never an exit, a street, a truck or a shaft', () => {
  assert.deepEqual(droppableNodes(b).map((n) => n.id), ['lobby', 'unit', 'core']);
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  const ids = new Set(droppableNodes(real).map((n) => n.id));
  for (const id of ['street', 'truck']) assert.ok(!ids.has(id), id);
  // Every level of the real building, the whole tower included, takes a token somewhere.
  assert.deepEqual(new Set(droppableNodes(real).map((n) => n.level)), new Set(real.levels.map((l) => l.id)));
});

test('a drop picks the level where the ray enters the building, then the nearest room on that floor', () => {
  // Enters the west face at y = 5 (level L2), meets the L2 floor at plan (1, 1.5): inside the unit.
  assert.deepEqual(dropTarget(b, { origin: [-2, 7, 1.5], dir: [1, -1, 0] })?.node, 'unit');
  // Enters at y = 5, meets the floor at plan (2, 5): 1 m from the core, 2 m from the unit.
  const core = dropTarget(b, { origin: [-4, 7, 5], dir: [1, -0.5, 0] });
  assert.deepEqual(core, { node: 'core', level: 'L2' });
  // A level ray at y = 2 enters L1; with no floor crossing the entry point picks the room.
  assert.equal(dropTarget(b, { origin: [-5, 2, 5], dir: [1, 0, 0] })?.node, 'lobby');
});

test('a drop that misses the building, or lands on a level with no room, is refused', () => {
  assert.equal(dropTarget(b, { origin: [-5, 5, 50], dir: [1, 0, 0] }), null);
  assert.equal(dropTarget(b, { origin: [5, 100, 5], dir: [0, -1, 0] }), null, 'enters the roof of L3: only a shaft');
  // Over the street exit only: outside the rooms, so outside the building.
  assert.equal(dropTarget(b, { origin: [5, 100, 12], dir: [0, -1, 0] }), null);
});

test('a drop on the real tower lands on the level the pointer is on', () => {
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  const level = (y: number): string | undefined => dropTarget(real, { origin: [-10, y, 14], dir: [1, 0, 0] })?.level;
  assert.equal(level(1), 'L1');
  assert.equal(level(11), 'L2');
  assert.equal(level(30), 'T04');
  assert.equal(level(39), 'T05');
});

test('arrow keys move a token one floor up or down, to the room under the same spot', () => {
  assert.equal(stepLevel(b, 'lobby', 1), 'core');
  assert.equal(stepLevel(b, 'unit', -1), 'lobby');
  assert.equal(stepLevel(b, 'core', 1), null, 'nothing above takes a token');
  assert.equal(stepLevel(b, 'lobby', -1), null);
  assert.equal(stepLevel(b, 'nowhere', 1), null);
});

test('a press on a token drags it; anywhere else it orbits or pans as before', () => {
  const press = { button: 0, shiftKey: false, onToken: 'w' as string | null, canDrag: true };
  assert.equal(pressIntent(press), 'token');
  assert.equal(pressIntent({ ...press, onToken: null }), 'rotate');
  assert.equal(pressIntent({ ...press, canDrag: false }), 'rotate', 'no token drag while a run plays');
  assert.equal(pressIntent({ ...press, button: 2 }), 'pan');
  assert.equal(pressIntent({ ...press, shiftKey: true }), 'pan');
});

test('a press within the slop is a click; the nearest token under the pointer is the one hit', () => {
  assert.equal(movedPastSlop(3, 4), false, `${CLICK_SLOP} px is still a click`);
  assert.equal(movedPastSlop(4, 4), true);
  const spots = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 120, y: 100 }];
  assert.equal(pickToken(spots, 115, 100, 24), 'b');
  assert.equal(pickToken(spots, 300, 300, 24), null);
  assert.equal(pickToken([], 0, 0, 24), null);
});

test('figures grow to a readable size when zoomed out, and keep real size close up', () => {
  assert.equal(figureScale(0.05, 1.2, 44), (44 * 0.05) / 1.2);
  assert.equal(figureScale(0.01, 1.2, 44), 1);
});
