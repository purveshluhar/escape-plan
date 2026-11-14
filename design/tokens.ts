// Visual tokens shared by viewer/ and app/. Owner: P4. See the `arcade-look` skill.
// Each discipline has a colour AND a glyph, so status never relies on colour alone.
import type { Discipline } from '../contract/types.ts';

export const BACKGROUND = '#0b0f1a';
export const GRID = '#1c2440';
export const PASS = '#39ff88';
export const FAIL = '#ff3b5c';

export const DISCIPLINE_STYLE: Record<Discipline, { color: string; glyph: string; label: string }> = {
  mep: { color: '#00e5ff', glyph: 'C', label: 'Chiller' },
  logistics: { color: '#b388ff', glyph: 'G', label: 'Glass' },
  accessibility: { color: '#ffd740', glyph: 'W', label: 'Wheelchair' },
  structure: { color: '#ff9100', glyph: 'L', label: 'Load' },
  life_safety: { color: '#69f0ae', glyph: 'P', label: 'People' },
  fire: { color: '#ff5252', glyph: 'S', label: 'Smoke' },
  plumbing: { color: '#40c4ff', glyph: 'D', label: 'Water' },
  electrical: { color: '#eeff41', glyph: 'E', label: 'Power' },
};
