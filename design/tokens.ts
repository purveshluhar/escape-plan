// Visual tokens shared by viewer/ and app/. Owner: P4. See the `arcade-look` skill and design/look.md.
// Base look: a classic maze-arcade screen. Black ground, neon-blue double-line maze walls, pellet
// trails for paths, chunky pixel type. Our own take on the genre: no borrowed characters, sprites,
// names or sounds from any existing game.
// Each discipline has a colour AND a glyph, so status never relies on colour alone.
import type { Discipline } from '../contract/types.ts';

// ---------- Ground and maze ----------

export const BACKGROUND = '#000000'; // arcade black
export const GRID = '#0a0f3c'; // faint floor grid, sits just above black
export const WALL = '#2a3cff'; // maze-blue edges of rooms, shafts and doors (drawn as a double line)
export const WALL_INNER = '#0b1366'; // inner line of the double wall; fill of translucent boxes
export const PELLET = '#ffc8b4'; // neutral pellets: unused route dots, decoration

// ---------- Text ----------

export const TEXT = '#ffffff';
export const TEXT_MUTED = '#a9b0e0';
export const SCORE = '#ffe600'; // headline numbers, READY / LEVEL COMPLETE

// ---------- Status (never used for a discipline) ----------

export const PASS = '#3dff8b';
export const FAIL = '#ff2a3d';

// ---------- Disciplines ----------

export const DISCIPLINE_STYLE: Record<Discipline, { color: string; glyph: string; label: string }> = {
  mep: { color: '#00f0ff', glyph: 'C', label: 'Chiller' }, // cyan
  logistics: { color: '#ff9ce6', glyph: 'G', label: 'Glass' }, // pink
  accessibility: { color: '#ffe600', glyph: 'W', label: 'Wheelchair' }, // arcade yellow
  structure: { color: '#ffa733', glyph: 'L', label: 'Load' }, // orange
  life_safety: { color: '#ffffff', glyph: 'P', label: 'People' }, // T2: white
  fire: { color: '#b4b4c8', glyph: 'S', label: 'Smoke' }, // T2: smoke grey
  plumbing: { color: '#5aa8ff', glyph: 'D', label: 'Water' }, // T2: water blue
  electrical: { color: '#d4ff3a', glyph: 'E', label: 'Power' }, // T3: lime
};

// ---------- Type ----------

// Press Start 2P (SIL Open Font License, Google Fonts) for headlines, scores and glyphs only.
// Body text stays a clean sans so detail labels read on a projector.
export const FONT_DISPLAY = '"Press Start 2P", "Courier New", monospace';
export const FONT_BODY = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
export const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=Press+Start+2P&display=swap';

// ---------- Paths: pellet trails ----------

// A token's path is a trail of pellets in its discipline colour. The token eats them as it moves:
// pellets ahead show the route, eaten pellets leave a thin glowing line behind.
export const PATH = {
  pelletSpacing: 0.6, // metres between pellets along the path
  pelletRadius: 0.12, // metres
  trailWidth: 0.08, // metres; the eaten line behind the token
  glow: 0.6, // 0..1 additive glow strength, on paths and tokens only
  tokenRadius: 0.45, // metres; the token disc that carries the glyph
} as const;

// ---------- Motion and moments (design/look.md) ----------

export const MOTION = {
  secondsPerToken: 2, // travel time along a full path, ease-in-out (1.5-2.5 s)
  staggerSeconds: 0.25, // start offset between tokens after Escape!
  failShakeMs: 150, // one shake when a token hits blocked_at
  failBlinkHz: 2, // red X blink rate; must stay at or under 3 flashes a second
  failBlinkCount: 3,
  winFlashHz: 2, // maze walls flash WALL <-> TEXT on LEVEL COMPLETE
  winFlashCount: 4,
  bannerHoldSeconds: 3,
} as const;

export const MAX_FLASH_HZ = 3; // photosensitivity limit from the arcade-look checklist

// ---------- Contrast helpers (WCAG 2.x) ----------

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
