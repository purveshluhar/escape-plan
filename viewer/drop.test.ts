import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building } from '../contract/types.ts';
import { DEFAULT_VIEW, PATH_LIFT, viewDirection, type Vec3 } from './layout.ts';
import type { Ray } from './drop.ts';
import {
  centreOnScreen, CLICK_SLOP, dropTarget, droppableNodes, figureScale, isMemberStart, movedPastSlop, pickToken, pressIntent, stepLevel,
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

// A ray from the default camera through a point: the player pointing at what is drawn there.
const VIEW = viewDirection(DEFAULT_VIEW.azimuth, DEFAULT_VIEW.elevation);
const aimAt = (p: Vec3): Ray => ({ origin: [p[0] + VIEW[0] * 900, p[1] + VIEW[1] * 900, p[2] + VIEW[2] * 900], dir: [-VIEW[0], -VIEW[1], -VIEW[2]] });
// Where a parked token is drawn: the room's plan centre, just over its floor.
const anchor = (bb: Building, id: string): Vec3 => {
  const n = bb.nodes.find((x) => x.id === id)!;
  const y = bb.levels.find((l) => l.id === n.level)!.elevation + PATH_LIFT;
  return [n.box.x + n.box.width / 2, y, n.box.y + n.box.depth / 2];
};

test('a drop lands on the room whose token spot is under the pointer', () => {
  for (const id of ['lobby', 'unit', 'core']) assert.equal(dropTarget(b, aimAt(anchor(b, id)))?.node, id, id);
  assert.deepEqual(dropTarget(b, aimAt(anchor(b, 'core'))), { node: 'core', level: 'L2' });
  // Near a spot, not on it, still picks the nearest one.
  const [x, y, z] = anchor(b, 'unit');
  assert.equal(dropTarget(b, aimAt([x + 1, y, z + 0.5]))?.node, 'unit');
});

test('on the real tower every room and core can be aimed at from the default view', () => {
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  const missed = droppableNodes(real).filter((n) => dropTarget(real, aimAt(anchor(real, n.id)))?.node !== n.id).map((n) => n.id);
  assert.deepEqual(missed, []);
});

test('elsewhere on the tower a drop goes to the storey the pointer is on, to its nearest room', () => {
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  // Points on the two facades the default camera sees (x = 28.5 and z = 27.55), away from any token spot.
  assert.deepEqual(dropTarget(real, aimAt([28.5, 40, 2])), { node: 'core-T05', level: 'T05' });
  assert.deepEqual(dropTarget(real, aimAt([28.5, 40, 14])), { node: 'core-T05', level: 'T05' });
  assert.deepEqual(dropTarget(real, aimAt([3, 33, 27.55])), { node: 'core-T04', level: 'T04' });
  // The fixture: the west face of L2 at y = 6, far from both L2 spots.
  assert.equal(dropTarget(b, { origin: [-5, 6, 1.5], dir: [1, 0, 0] })?.level, 'L2');
});

test('a drop that misses every room, or lands on the street, is refused', () => {
  assert.equal(dropTarget(b, { origin: [-5, 5, 50], dir: [1, 0, 0] }), null);
  assert.equal(dropTarget(b, aimAt([5, 0, 12])), null, 'the street exit takes no token');
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  assert.equal(dropTarget(real, aimAt([14.25, 0, 26.9])), null, 'the STREET - EXIT label');
  assert.equal(dropTarget(real, aimAt([60, 0, -30])), null, 'the city beside the tower on screen');
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
  assert.equal(movedPastSlop(6, 0), false, 'a small wobble is still a click');
  assert.equal(movedPastSlop(CLICK_SLOP, 0), false);
  assert.equal(movedPastSlop(6, 6), true);
  const spots = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 120, y: 100 }];
  assert.equal(pickToken(spots, 115, 100, 24), 'b');
  assert.equal(pickToken(spots, 300, 300, 24), null);
  assert.equal(pickToken([], 0, 0, 24), null);
  // A figure drawn bigger than the hit circle is picked anywhere within its own radius.
  assert.equal(pickToken([{ id: 'big', x: 100, y: 100, r: 120 }], 200, 100, 24), 'big');
  assert.equal(pickToken([{ id: 'big', x: 100, y: 100, r: 120 }, { id: 'near', x: 190, y: 100 }], 200, 100, 24), 'near');
});

test('figures grow to a readable size when zoomed out, and keep real size close up', () => {
  assert.equal(figureScale(0.05, 1.2, 44), (44 * 0.05) / 1.2);
  assert.equal(figureScale(0.01, 1.2, 44), 1);
});

test('a token whose start is a structural member (the load) cannot be dropped on a floor', () => {
  const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  assert.equal(isMemberStart(real, 'load'), true);
  for (const id of ['sofa', 'wheelchair', 'people', 'chiller', 'glass']) assert.equal(isMemberStart(real, id), false, id);
  assert.equal(isMemberStart(real, 'no-such-token'), false);
});

test('a toast centred on the pointer stays whole on screen: it slides in from an edge', () => {
  // 300 px wide toast on a 1920 px canvas, 8 px margin.
  assert.equal(centreOnScreen(20, 300, 1920), 158, 'near the left edge it slides right');
  assert.equal(centreOnScreen(1900, 300, 1920), 1762, 'near the right edge it slides left');
  assert.equal(centreOnScreen(900, 300, 1920), 900, 'in the middle it stays on the pointer');
});
