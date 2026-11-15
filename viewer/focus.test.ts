// The camera's way up and down the tower: the pan that puts a level in the middle of the view, and the
// glide that gets there. The viewer's focus level (the open floor) reads the same pan back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VIEW, focusHeight, glideStep, GLIDE_RATE, panForFocus } from './layout.ts';

const close = (a: number, b: number, eps = 1e-4): void => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('panForFocus: at the default isometric view, a level 100 m up needs 40.8248 m of pan up the screen', () => {
  close(panForFocus(150, 50, DEFAULT_VIEW), 100 * Math.sqrt(2 / 3));
  close(panForFocus(150, 50, DEFAULT_VIEW), 81.6497);
});

test('panForFocus: the centre height itself needs no pan, and a level below needs a pan down', () => {
  assert.equal(panForFocus(50, 50, DEFAULT_VIEW), 0);
  assert.ok(panForFocus(20, 50, DEFAULT_VIEW) < 0);
});

test('panForFocus is the inverse of focusHeight, flat or steep (the steep gain is capped at 2)', () => {
  for (const elevation of [0.1, 0.6155, 1.0, 1.2, 1.5]) {
    for (const height of [9.4488, 28.3464, 215.5, 420.4716]) {
      const view = { azimuth: 0.7, elevation };
      close(focusHeight(60, view, { x: 3, y: panForFocus(height, 60, view) }), height, 1e-6);
    }
  }
});

test('glideStep: moves toward the target a fraction a frame and never passes it', () => {
  const frame = glideStep(0, 10, 1 / 60);
  assert.ok(frame > 0 && frame < 10);
  close(frame, 10 * (1 - Math.exp(-GLIDE_RATE / 60)));
  assert.equal(glideStep(0, 10, 5), 10); // a long stall lands on the target, not beyond it
  assert.equal(glideStep(10, 0, 5), 0);
});

test('glideStep: a quarter of a second covers 97 percent of a 100 m climb, and no time moves nothing', () => {
  let at = 0;
  for (let i = 0; i < 15; i++) at = glideStep(at, 100, 1 / 60);
  assert.ok(at > 96 && at < 100, `${at}`);
  assert.equal(glideStep(3, 100, 0), 3);
});

test('glideStep: within 2 cm of the target it lands on it, so the glide ends', () => {
  assert.equal(glideStep(9.99, 10, 1 / 60), 10);
  assert.equal(glideStep(10, 10, 1 / 60), 10);
});

test('glideStep: climbing and descending are mirror images', () => {
  close(glideStep(0, 40, 1 / 30), -glideStep(0, -40, 1 / 30));
});
