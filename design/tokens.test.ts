import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISCIPLINES } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from './tokens.ts';

test('every discipline has a colour, a unique glyph and a label', () => {
  assert.deepEqual(Object.keys(DISCIPLINE_STYLE).sort(), [...DISCIPLINES].sort());
  const glyphs = Object.values(DISCIPLINE_STYLE).map((s) => s.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length);
});
