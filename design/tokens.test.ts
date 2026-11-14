import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISCIPLINES } from '../contract/types.ts';
import {
  BACKGROUND, DISCIPLINE_STYLE, FAIL, MAX_FLASH_HZ, MOTION, PASS, SCORE, TEXT, TEXT_MUTED,
  contrastRatio,
} from './tokens.ts';

test('every discipline has a colour, a unique glyph and a label', () => {
  assert.deepEqual(Object.keys(DISCIPLINE_STYLE).sort(), [...DISCIPLINES].sort());
  const glyphs = Object.values(DISCIPLINE_STYLE).map((s) => s.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length);
});

test('contrast helper matches known WCAG values', () => {
  assert.equal(Math.round(contrastRatio('#ffffff', '#000000') * 10) / 10, 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('text, status and discipline colours reach 4.5:1 on the background', () => {
  const colours: Record<string, string> = { TEXT, TEXT_MUTED, SCORE, PASS, FAIL };
  for (const [d, s] of Object.entries(DISCIPLINE_STYLE)) colours[d] = s.color;
  for (const [name, c] of Object.entries(colours)) {
    const r = contrastRatio(c, BACKGROUND);
    assert.ok(r >= 4.5, `${name} ${c} is ${r.toFixed(2)}:1 on ${BACKGROUND}`);
  }
});

test('discipline colours are unique and never reuse the pass or fail colour', () => {
  const colours = Object.values(DISCIPLINE_STYLE).map((s) => s.color.toLowerCase());
  assert.equal(new Set(colours).size, colours.length);
  assert.ok(!colours.includes(PASS.toLowerCase()));
  assert.ok(!colours.includes(FAIL.toLowerCase()));
});

test('nothing flashes faster than 3 times a second', () => {
  assert.ok(MOTION.failBlinkHz <= MAX_FLASH_HZ);
  assert.ok(MOTION.winFlashHz <= MAX_FLASH_HZ);
  assert.ok(MOTION.secondsPerToken >= 1.5 && MOTION.secondsPerToken <= 2.5);
});
