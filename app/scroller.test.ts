// The floor scroller: a vertical slider over the drawn levels. Its state and keys are tested here with
// no page; app/scroller-view.ts only draws it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Level } from '../contract/types.ts';
import { createScroller, indexAtY, keyIndex, scrollerStops, thumbFraction, wheelPixels, wheelSteps } from './scroller.ts';

const LEVELS: Level[] = [
  { id: 'T10', elevation: 70.0 }, { id: 'L1', elevation: 0 }, { id: 'T04', elevation: 28.3464 },
  { id: 'L2', elevation: 9.4488 }, { id: 'L3', elevation: 14.1732 },
];
const DRAWN = ['L2', 'T04', 'T10'];

test('scrollerStops: the drawn levels, lowest first, named as the zoom view names them', () => {
  assert.deepEqual(scrollerStops(LEVELS, DRAWN), [
    { id: 'L2', name: 'Level 2', elevation: 9.4488 },
    { id: 'T04', name: 'Level 4', elevation: 28.3464 },
    { id: 'T10', name: 'Level 10', elevation: 70 },
  ]);
  assert.deepEqual(scrollerStops(LEVELS, []), []);
  assert.deepEqual(scrollerStops(LEVELS, ['nope']), []);
  // A level with no usable height cannot be moved to, so it is not listed.
  assert.deepEqual(scrollerStops([{ id: 'T10', elevation: Infinity }, { id: 'L2', elevation: 9.4488 }], ['T10', 'L2']).map((s) => s.id), ['L2']);
});

test('keyIndex: arrows step one level, Page keys ten, Home and End jump, all stay in range', () => {
  assert.equal(keyIndex('ArrowUp', 3, 10), 4);
  assert.equal(keyIndex('ArrowDown', 3, 10), 2);
  assert.equal(keyIndex('PageUp', 3, 30), 13);
  assert.equal(keyIndex('PageDown', 15, 30), 5);
  assert.equal(keyIndex('PageUp', 3, 10), 9);
  assert.equal(keyIndex('PageDown', 3, 10), 0);
  assert.equal(keyIndex('Home', 3, 10), 0);
  assert.equal(keyIndex('End', 3, 10), 9);
  assert.equal(keyIndex('ArrowUp', 9, 10), 9);
  assert.equal(keyIndex('ArrowDown', 0, 10), 0);
  assert.equal(keyIndex('ArrowRight', 3, 10), 4); // slider convention: right and left also step
  assert.equal(keyIndex('ArrowLeft', 3, 10), 2);
  assert.equal(keyIndex('a', 3, 10), null);
  assert.equal(keyIndex('Enter', 3, 10), null);
  assert.equal(keyIndex('ArrowUp', 0, 0), null); // no levels
});

test('wheelSteps: wheel up climbs, wheel down descends, 25 px of wheel is one level, the rest carries over', () => {
  assert.deepEqual(wheelSteps(0, -100), { steps: 4, rest: 0 });
  assert.deepEqual(wheelSteps(0, 100), { steps: -4, rest: 0 });
  assert.deepEqual(wheelSteps(0, -10), { steps: 0, rest: -10 });
  assert.deepEqual(wheelSteps(-10, -20), { steps: 1, rest: -5 });
  assert.deepEqual(wheelSteps(10, -10), { steps: 0, rest: 0 });
  assert.deepEqual(wheelSteps(7, NaN), { steps: 0, rest: 0 }); // never poisons what is carried over
  assert.deepEqual(wheelSteps(7, Infinity), { steps: 0, rest: 0 });
});

test('wheelPixels: pixel wheels pass through, a Firefox notch (3 lines) and a page count as pixels', () => {
  assert.equal(wheelPixels(-100, 0), -100);
  assert.equal(wheelPixels(-3, 1), -99);
  assert.equal(wheelPixels(1, 2), 300);
  assert.deepEqual(wheelSteps(0, wheelPixels(-3, 1)), { steps: 3, rest: -24 });
});

test('indexAtY: the top of the track is the top level, the bottom is the lowest, outside clamps', () => {
  assert.equal(indexAtY(100, 100, 400, 5), 4);
  assert.equal(indexAtY(500, 100, 400, 5), 0);
  assert.equal(indexAtY(300, 100, 400, 5), 2);
  assert.equal(indexAtY(0, 100, 400, 5), 4);
  assert.equal(indexAtY(900, 100, 400, 5), 0);
  assert.equal(indexAtY(250, 100, 400, 1), 0);
});

test('thumbFraction: 0 at the lowest level, 1 at the top, 0 for a single level', () => {
  assert.equal(thumbFraction(0, 5), 0);
  assert.equal(thumbFraction(2, 5), 0.5);
  assert.equal(thumbFraction(4, 5), 1);
  assert.equal(thumbFraction(0, 1), 0);
});

function make(): { s: ReturnType<typeof createScroller>; picks: string[] } {
  const picks: string[] = [];
  return { s: createScroller(scrollerStops(LEVELS, DRAWN), (id) => picks.push(id)), picks };
}

test('scroller: starts on the lowest level and says so as a slider', () => {
  const { s, picks } = make();
  assert.deepEqual(s.aria(), { now: 0, min: 0, max: 2, text: 'Level 2' });
  assert.equal(s.current(), 'L2');
  assert.deepEqual(picks, []);
});

test('scroller: arrow up picks the next level, and the slider reads it', () => {
  const { s, picks } = make();
  s.key('ArrowUp');
  assert.deepEqual(picks, ['T04']);
  assert.deepEqual(s.aria(), { now: 1, min: 0, max: 2, text: 'Level 4' });
  s.key('End');
  assert.deepEqual(picks, ['T04', 'T10']);
  assert.equal(s.aria().text, 'Level 10');
});

test('scroller: a key that goes nowhere picks nothing', () => {
  const { s, picks } = make();
  s.key('ArrowDown');
  s.key('x');
  assert.deepEqual(picks, []);
  assert.equal(s.key('ArrowUp'), true);
  assert.equal(s.key('x'), false); // the view leaves a key it does not use to the page
});

test('scroller: the wheel climbs 4 levels a notch, clamped, and a half notch waits', () => {
  const levels = Array.from({ length: 12 }, (_, i): Level => ({ id: `T${String(i + 10)}`, elevation: i * 4 }));
  const picks: string[] = [];
  const s = createScroller(scrollerStops(levels, levels.map((l) => l.id)), (id) => picks.push(id));
  s.wheel(-100);
  assert.equal(s.aria().now, 4);
  s.wheel(-12);
  assert.equal(s.aria().now, 4);
  s.wheel(-13);
  assert.equal(s.aria().now, 5);
  s.wheel(100000);
  assert.equal(s.aria().now, 0);
  assert.equal(picks[0], 'T14');
});

test('scroller: the camera moving the open floor moves the thumb without picking', () => {
  const { s, picks } = make();
  s.follow('T10');
  assert.equal(s.aria().text, 'Level 10');
  assert.deepEqual(picks, []);
  s.follow(null); // the view has no floor: the thumb stays
  assert.equal(s.aria().text, 'Level 10');
  s.follow('unknown');
  assert.equal(s.aria().text, 'Level 10');
});

test('scroller: while a press is held the thumb follows the pointer, not the camera that trails it', () => {
  const { s, picks } = make();
  s.press(300, { top: 100, height: 400 }); // the middle of the track: level 4
  assert.deepEqual(picks, ['T04']);
  s.follow('L2'); // the camera is still on its way up
  assert.equal(s.aria().text, 'Level 4');
  s.press(100, { top: 100, height: 400 }); // drag to the top
  assert.deepEqual(picks, ['T04', 'T10']);
  s.release();
  s.follow('T10');
  assert.equal(s.aria().text, 'Level 10');
  s.release();
});

test('scroller: picking the level already shown does not send it again', () => {
  const { s, picks } = make();
  s.press(500, { top: 100, height: 400 }); // the bottom: level 2, where it already is
  assert.deepEqual(picks, []);
  s.release();
});

test('scroller: pressing the same level again after the camera left it picks it', () => {
  const { s, picks } = make();
  s.key('End');
  s.follow('L2'); // the user panned the camera back down
  assert.equal(s.aria().text, 'Level 2');
  s.key('End');
  assert.deepEqual(picks, ['T10', 'T10']);
});

test('scroller: no levels, no slider to move', () => {
  const s = createScroller([], () => assert.fail('nothing to pick'));
  s.key('ArrowUp');
  s.wheel(-100);
  s.press(10, { top: 0, height: 100 });
  assert.equal(s.count(), 0);
  assert.equal(s.current(), null);
  assert.deepEqual(s.aria(), { now: 0, min: 0, max: 0, text: '' });
});
