import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISCIPLINES } from '../contract/types.ts';
import {
  ACCENT, BACKGROUND, DISCIPLINE_STYLE, FAIL, FAIL_INK, FAIL_TINT, GHOST_OPACITY, MAX_FLASH_HZ, MOTION, ON_ACCENT,
  PASS, PASS_INK, PASS_TINT, TEXT, TEXT_DIM, TEXT_MUTED, contrastRatio,
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

test('text colours reach 4.5:1 on the background, dim text 3:1 (16 px and up only)', () => {
  for (const [name, c] of Object.entries({ TEXT, TEXT_MUTED, ACCENT, PASS_INK, FAIL_INK })) {
    const r = contrastRatio(c, BACKGROUND);
    assert.ok(r >= 4.5, `${name} ${c} is ${r.toFixed(2)}:1 on ${BACKGROUND}`);
  }
  assert.ok(contrastRatio(TEXT_DIM, BACKGROUND) >= 3);
});

test('badge text reaches 4.5:1 on its tint, and white reaches 4.5:1 on the accent', () => {
  assert.ok(contrastRatio(PASS_INK, PASS_TINT) >= 4.5);
  assert.ok(contrastRatio(FAIL_INK, FAIL_TINT) >= 4.5);
  assert.ok(contrastRatio(ON_ACCENT, ACCENT) >= 4.5);
});

test('status marks reach 3:1 on the background (graphics)', () => {
  assert.ok(contrastRatio(PASS, BACKGROUND) >= 3);
  assert.ok(contrastRatio(FAIL, BACKGROUND) >= 3);
});

test('every glyph reaches 4.5:1 on its discipline colour', () => {
  for (const [d, s] of Object.entries(DISCIPLINE_STYLE)) {
    const r = contrastRatio(s.glyphInk, s.color);
    assert.ok(r >= 4.5, `${d} glyph ${s.glyphInk} on ${s.color} is ${r.toFixed(2)}:1`);
  }
});

// The design system's teal, orange, smoke and amber sit under 3:1 on the light backdrop, so a thin
// route line in those colours is hard to see from the back of the room. Flagged to the design
// system owner; turn this on once the colours are darkened or routes get an outline.
test('discipline colours reach 3:1 on the background (graphics)', { todo: 'design system identity colours under 3:1' }, () => {
  for (const [d, s] of Object.entries(DISCIPLINE_STYLE)) {
    const r = contrastRatio(s.color, BACKGROUND);
    assert.ok(r >= 3, `${d} ${s.color} is ${r.toFixed(2)}:1 on ${BACKGROUND}`);
  }
});

test('discipline colours are unique and never reuse the pass, fail or accent colour', () => {
  const colours = Object.values(DISCIPLINE_STYLE).map((s) => s.color.toLowerCase());
  assert.equal(new Set(colours).size, colours.length);
  for (const c of [PASS, FAIL, ACCENT]) assert.ok(!colours.includes(c.toLowerCase()));
});

test('nothing flashes faster than 3 times a second, and ghosts are faint', () => {
  assert.ok(MOTION.failBlinkHz <= MAX_FLASH_HZ);
  assert.ok(MOTION.winFlashHz <= MAX_FLASH_HZ);
  assert.ok(MOTION.secondsPerToken >= 1.5 && MOTION.secondsPerToken <= 2.5);
  assert.equal(GHOST_OPACITY, 0.2);
});
