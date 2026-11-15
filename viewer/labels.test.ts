import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calloutText, coveredBy, failText, labelSides, roomLabel, stayText } from './labels.ts';
import type { Building, SolverResult } from '../contract/types.ts';

const b = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
const fail = (r: Partial<SolverResult>): SolverResult => ({
  token: 'chiller', status: 'fail', path: [], blocked_at: null, reason: null, needed: null, available: null, ...r,
});

test('fail label names the token, the reason, the place and both numbers in metres', () => {
  assert.deepEqual(failText(b, fail({ blocked_at: 'plant-shaft', reason: 'too_narrow', needed: 1.6, available: 1.2 })), {
    title: 'Chiller: too narrow',
    detail: 'Plant shaft: needs 1.6 m, has 1.2 m',
  });
});

test('a step says how high it is; a lost support says why', () => {
  const step = failText(b, fail({ token: 'wheelchair', blocked_at: 'terrace-door', reason: 'step', needed: 0, available: 0.15 }));
  assert.equal(step?.detail, 'Terrace door: 0.15 m high, needs level');
  const load = failText(b, fail({ token: 'load', blocked_at: 'beam-b2', reason: 'no_support' }));
  assert.deepEqual(load, { title: 'Load: nothing holds it up', detail: 'beam B2: no path down to a foundation' });
});

test('metres on the model show at least one decimal', () => {
  const sofa = failText(b, fail({ token: 'sofa', blocked_at: 'lobby-door', reason: 'cannot_turn', needed: 2.2, available: 1.9967350242673378 }));
  assert.deepEqual(sofa, { title: 'Sofa: cannot turn the corner', detail: 'Lobby door: 2.2 m long, fits 2.0 m' });
});

test('people and smoke count steps on the model too, not decimals', () => {
  const smoke = failText(b, fail({ token: 'people', blocked_at: 'office-door', reason: 'smoke_first', needed: 4, available: 3 }));
  assert.equal(smoke?.detail, 'Office door: people at step 4, smoke at step 3');
});

test('a pass has no fail label', () => {
  assert.equal(failText(b, fail({ status: 'pass' })), null);
});

const layout = { height: 50, gap: 36, minX: 0, maxX: 1200 };

test('a label takes the free side: away from a neighbour on its row, right by default', () => {
  // Two Xs side by side, and one alone high above.
  const spots = [{ x: 400, y: 300, width: 200 }, { x: 520, y: 300, width: 200 }, { x: 400, y: 100, width: 200 }];
  assert.deepEqual(labelSides(spots, layout), ['left', 'right', 'right']);
});

test('labels on nearby rows do not stack on top of each other', () => {
  // The base case on a narrow screen: chiller above, glass under it, wheelchair to the right
  // and a little lower. Chiller and wheelchair labels both on the right would overlap.
  const spots = [
    { x: 235, y: 372, width: 260 }, // chiller
    { x: 228, y: 425, width: 260 }, // glass
    { x: 336, y: 412, width: 300 }, // wheelchair
  ];
  const sides = labelSides(spots, { ...layout, maxX: 864 });
  assert.notDeepEqual([sides[0], sides[2]], ['right', 'right']);
});

test('a label never runs off the edge of the free screen when the other side is clear', () => {
  assert.deepEqual(labelSides([{ x: 1100, y: 300, width: 250 }], layout), ['left']);
  assert.deepEqual(labelSides([{ x: 60, y: 300, width: 250 }], layout), ['right']);
});

test('a card that fits only past the screen edge is left out, its X stays (1100 px, six questions)', () => {
  // People at 1100 px: its right side and above cover the chiller X and card just up and right of it, and the
  // left side runs past the left edge. A card is drawn whole or not at all.
  const spots = [{ x: 160, y: 300, width: 260 }, { x: 236, y: 260, width: 260 }];
  const sides = labelSides(spots, { ...layout, minX: 8, maxX: 700 });
  assert.equal(sides[1], 'right');
  assert.equal(sides[0], 'none');
});

test('room labels use the building names and mark the exit', () => {
  const street = b.nodes.find((n) => n.is_exit)!;
  assert.equal(roomLabel(street.name, street.is_exit), `${street.name} - exit`);
  assert.equal(roomLabel('Lobby', false), 'Lobby');
});

test('a room label under the selection caption hides, so no text sits over text', () => {
  const caption = { l: 552, r: 711, t: 765, b: 795 }; // "People - Office - Yes" at 1920 px
  const street = { l: 585, r: 677, t: 763, b: 777 }; // "STREET - EXIT" under it
  const touching = { l: 345, r: 437, t: 541, b: 554 }; // 1366 px: label 1 px above the caption top
  const clear = { l: 100, r: 200, t: 100, b: 114 };
  assert.deepEqual(coveredBy(caption, [street, clear]), [true, false]);
  assert.deepEqual(coveredBy({ l: 311, r: 471, t: 555, b: 578 }, [touching]), [true], 'within the margin counts as covered');
  assert.deepEqual(coveredBy(null, [street]), [false], 'no caption hides nothing');
});

test('the callout puts has before needs, in metres: 1.2 < 1.6 m', () => {
  assert.equal(calloutText(fail({ blocked_at: 'plant-shaft', reason: 'too_narrow', needed: 1.6, available: 1.2 })), '1.2 < 1.6 m');
  assert.equal(calloutText(fail({ token: 'sofa', blocked_at: 'lobby-door', reason: 'cannot_turn', needed: 2.2, available: 2 })), '2.0 < 2.2 m');
  assert.equal(calloutText(fail({ token: 'people', blocked_at: 'office-door', reason: 'too_narrow', needed: 0.6, available: 0.5 })), '0.5 < 0.6 m');
});

test('no callout for a step, a lost support, a pass, or a fail with no numbers', () => {
  assert.equal(calloutText(fail({ token: 'wheelchair', reason: 'step', needed: 0, available: 0.15 })), null);
  assert.equal(calloutText(fail({ token: 'load', reason: 'no_support', needed: 1.5, available: 2 })), null);
  assert.equal(calloutText(fail({ reason: 'no_route' })), null);
  assert.equal(calloutText({ ...fail({}), status: 'pass' }), null);
});

test('a load stays on its beam; a token that starts in a room has no such line', () => {
  assert.equal(stayText(b, 'load'), 'Load stays on beam B2');
  assert.equal(stayText(b, 'sofa'), null);
  assert.equal(stayText(b, 'no-such-token'), null);
});

test('one step is "1 step", on the model as on the sheet', () => {
  const tie = failText(b, fail({ token: 'people', blocked_at: 'office-door', reason: 'smoke_first', needed: 1, available: 1 }));
  assert.equal(tie?.detail, 'Office door: both at step 1, a tie');
});

test('a card that would cover another card, another red X or the caption is left out, not drawn over it', () => {
  // Six Xs in a tight cluster (six questions asked): no side is free for every card.
  const spots = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 400 + (i % 3) * 20, y: 300 + Math.floor(i / 3) * 20, width: 220 }));
  const sides = labelSides(spots, layout);
  assert.ok(sides.includes('none'), `sides ${sides}`);
  assert.ok(sides.some((s) => s !== 'none'), 'at least one card still shows');
});

test('a card keeps clear of a box it must avoid (the selection caption)', () => {
  const caption = { l: 430, r: 700, t: 280, b: 320 };
  assert.deepEqual(labelSides([{ x: 400, y: 300, width: 200 }], { ...layout, avoid: [caption] }), ['left']);
});

test('a card uses its measured height when it has one', () => {
  // A tall card (callout) right of the X would reach the X below it; the short estimate would not.
  const spots = [{ x: 400, y: 300, width: 200, height: 120 }, { x: 480, y: 360, width: 200 }];
  assert.notEqual(labelSides(spots, layout)[0], 'right');
});

test('a card that would run past the top of the screen is left out too', () => {
  assert.deepEqual(labelSides([{ x: 250, y: 40, width: 300 }], { height: 56, gap: 36, minX: 8, maxX: 492 }), ['none']);
});
