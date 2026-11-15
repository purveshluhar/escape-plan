// Visual tokens shared by viewer/ and app/. Owner: P4. See design/look.md.
// Look: Escape Plan Liquid Glass v2. A calm, light surface: a pale frosted building, glass
// panels for the UI, one blue accent, four character colours and two status colours. The board
// is always a 3D isometric view (shaded, x-ray or exploded floors), never a plan.
// Pixel type stays for the wordmark only. Show me and the Yes to all answer use FONT_BODY (design/copy.md).
// Each discipline has a colour AND a glyph, so status never relies on colour alone.
// Source: the "Escape Plan · Liquid Glass" design system (project/tokens.json, v2).
import type { Discipline } from '../contract/types.ts';

// ---------- Backdrop and building ----------
// Export names are stable so viewer/ and app/ compile unchanged when values move.

export const BACKGROUND = '#eef2f8'; // design system `bg`: page backdrop behind every glass layer
export const GRID = '#c3cde2'; // `line-soft`: hairlines, unfocused floor outlines, the ground grid
export const WALL = '#7184ae'; // `line`: building outlines and wall tops (3.1:1, graphics only)
export const WALL_INNER = '#dfe5f1'; // `wall-face`: vertical faces and translucent fills
export const WALL_TOP = 'rgba(255,255,255,0.72)'; // `wall-top`: slab top faces, lower floors read through
export const ROUTE_DOT = '#2f5bff'; // available-route dots: `interactive` at ROUTE_DOT_OPACITY

// ---------- Glass (UI chrome only, never over the board) ----------

export const GLASS = 'rgba(255,255,255,0.62)'; // default panel fill, with GLASS_BLUR
export const GLASS_STRONG = 'rgba(255,255,255,0.86)'; // raised or hovered glass, text over busy board
export const GLASS_HI = 'rgba(255,255,255,0.95)'; // 1 px specular top rim
export const GLASS_FALLBACK = 'rgba(255,255,255,0.94)'; // when backdrop-filter is not supported
export const GLASS_BLUR = 'blur(24px) saturate(180%)'; // backdrop-filter for glass panels
export const SHADOW_GLASS =
  'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.55), 0 1px 2px rgba(15,23,42,0.05), 0 12px 32px rgba(15,23,42,0.08)';

// ---------- Accent: one filled control per state ----------

export const ACCENT = '#2f5bff'; // fills the single primary action (Show me, Apply, Try again), selection, focus
export const ACCENT_DEEP = '#2146d6'; // pressed accent
export const ON_ACCENT = '#ffffff'; // text on ACCENT, PASS and FAIL fills

// ---------- Text ----------

export const TEXT = '#0f172a'; // `ink`: primary text, 15.9:1 on BACKGROUND
export const TEXT_MUTED = '#475569'; // `ink-muted`: secondary text, 6.7:1
export const TEXT_DIM = '#64748b'; // `ink-dim`: 16 px and up only (hints, disabled), 4.2:1
export const SCORE = ACCENT; // accent for a headline (export name kept for the code; not a score)

// ---------- Status (never used for a discipline) ----------

export const PASS = '#0e9f6e'; // `status-success`: icons and lines, always with a check and the word
export const PASS_TINT = '#dcf5ea'; // ESCAPED badge fill
export const PASS_INK = '#05603f'; // text on PASS_TINT
export const FAIL = '#e5484d'; // `status-failure`: crosses, blocked dashes, alert borders
export const FAIL_TINT = '#fde7e8'; // BLOCKED badge and callout fill
export const FAIL_INK = '#b4232a'; // text on FAIL_TINT and the inspector headline

// ---------- Disciplines ----------
// Tier 1 colours are the design system's identity colours. Glyphs are drawn in `glyphInk` on the
// colour, which reaches 4.5:1 for every discipline (design/tokens.test.ts checks it).

export const DISCIPLINE_STYLE: Record<Discipline, { color: string; glyph: string; label: string; glyphInk: string }> = {
  mep: { color: '#0ea5c6', glyph: 'C', label: 'Chiller', glyphInk: TEXT }, // `id-chiller` teal
  logistics: { color: '#e0479e', glyph: 'G', label: 'Glass', glyphInk: TEXT }, // `id-glass` magenta
  accessibility: { color: '#ef7d1a', glyph: 'W', label: 'Wheelchair', glyphInk: TEXT }, // `id-wheelchair` orange
  structure: { color: '#7452ea', glyph: 'L', label: 'Load', glyphInk: '#ffffff' }, // `id-structure` violet, a step darker so the white L keeps 4.5:1 on screen
  life_safety: { color: '#334155', glyph: 'P', label: 'People', glyphInk: '#ffffff' }, // T2: slate
  fire: { color: '#94a3b8', glyph: 'S', label: 'Smoke', glyphInk: TEXT }, // T2: smoke grey
  plumbing: { color: '#0369a1', glyph: 'D', label: 'Water', glyphInk: '#ffffff' }, // T2: deep water blue
  electrical: { color: '#ca8a04', glyph: 'E', label: 'Power', glyphInk: TEXT }, // T3: amber
};

// ---------- Type ----------
// Press Start 2P for moments only; Atkinson Hyperlegible for every label and sentence;
// JetBrains Mono for engineering numbers. All SIL OFL 1.1, from Google Fonts.

export const FONT_DISPLAY = '"Press Start 2P", "Courier New", monospace';
export const FONT_BODY = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
export const FONT_DATA = '"JetBrains Mono", ui-monospace, Menlo, monospace';
export const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@500;700&family=Press+Start+2P&display=swap';

// Sizes at the 1920 x 1080 projector master (the 1366 laptop preset uses 15 body / 12 labels).
export const TYPE = {
  displayXl: 88, // largest headline (not used for the Yes to all answer)
  displayLg: 40, // large headline
  displayMd: 24, // wordmark only
  labelLg: 20, // names, secondary buttons; bold, uppercase, tracked 1.5 px
  labelSm: 15, // badges, tabs; minimum label size
  title: 30, // inspector headline
  heading: 22,
  bodyLg: 21,
  body: 18, // minimum sentence size
  dataXl: 42, // needs vs has
  data: 20, // on-board callouts
} as const;

// ---------- Space and shape ----------

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32, s12: 48, s16: 64 } as const; // px, 8 px rhythm
export const RADIUS = { sm: 10, md: 16, lg: 24, full: 9999 } as const; // px; buttons and badges are capsules

// ---------- Board views (always 3D isometric) ----------

export const VIEWS = ['shaded', 'xray', 'floors'] as const; // see design/flow.md
export type View = (typeof VIEWS)[number];

// ---------- Paths ----------
// Available: accent dots. Selected: larger dots in the discipline colour. Travelled: solid line.
// Blocked: solid up to blocked_at, FAIL dashes beyond. Proposed (Jev): ghost at GHOST_OPACITY.

export const PATH = {
  pelletSpacing: 0.6, // metres between route dots (key name read by viewer/)
  pelletRadius: 0.12, // metres; route dot radius
  trailWidth: 0.08, // metres; the travelled line behind the token
  glow: 0, // no glow in this look; the key stays because viewer/ reads it
  tokenRadius: 0.45, // metres; the token that carries the glyph
} as const;

export const ROUTE_DOT_OPACITY = 0.55; // available-route dots
export const GHOST_OPACITY = 0.2; // proposed route and proposed geometry, before APPLY
export const DIM_OPACITY = 0.6; // last run's statuses after an edit, until the next run

// ---------- Motion and moments (design/look.md) ----------

export const MOTION = {
  secondsPerToken: 2, // the unit the smoke spread counts its steps in (app/smoke.ts); the viewer maps it onto the people's walk. Travel time follows the route length (travel* below)
  staggerSeconds: 0.4, // start offset between tokens after Show me
  // One run timeline (viewer/timeline.ts, design/motion.md 2.1): real motion shape on compressed time.
  travelSpeed: 5, // metres per second on the route, about 4 times walking pace
  travelMinSeconds: 3, // a short route is never a rush
  travelMaxSeconds: 5, // a long route is never a wait
  rampSeconds: 0.5, // gentle start and stop
  pivotSeconds: 2, // a sofa or glass panel turning the whole corner
  jamSeconds: 2.6, // the turn up to the bind (jamTurnSeconds), then two contact pulses and the longest-that-fits line
  jamTurnSeconds: 1.2,
  stopHoldSeconds: 1.5, // a calm stop at a door that is too narrow, stepped or blocked
  maxBeats: 3, // decisive moments per run; each plays alone while the others hold still
  turnTau: 0.12, // seconds: figures turn to face their travel (a 90 deg turn settles in about 0.35 s)
  rejoinSeconds: 1, // after a pivot, the object eases back onto the route line
  contactPulseHz: 1.5, // the jam's contact dots pulse twice; under MAX_FLASH_HZ
  failShakeMs: 150, // retired: a No stops calmly, no shake (design/motion.md 2.1)
  failFreezeMs: 400, // everything holds before the fail is shown (`dur-beat`)
  failBlinkHz: 2, // cross blink rate; must stay at or under MAX_FLASH_HZ
  failBlinkCount: 3,
  winFlashHz: 2, // retired: the Yes to all answer does not flash (design/copy.md); kept so imports compile
  winFlashCount: 4,
  bannerHoldSeconds: 2.4, // how long a viewer banner holds full size before it docks small
  pressMs: 120, // `dur-tick`
  quickMs: 240, // `dur-quick`: hover, selection, panel slide
  showMs: 1200, // `dur-show`: nothing important lasts less than this
} as const;

export const EASE_GLASS = 'cubic-bezier(0.32, 0.72, 0, 1)'; // all UI motion
export const EASE_PIXEL = 'steps(2, end)'; // sprite frames only

export const MAX_FLASH_HZ = 3; // photosensitivity limit

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
