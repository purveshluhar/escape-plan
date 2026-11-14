# The look: Liquid Glass

Owner: P4. Values live in `design/tokens.ts`; this file says how to use them. Source: the
"Escape Plan · Liquid Glass" design system (v2). The flow is in `design/flow.md`.
Clickable preview of every screen: the canvas linked in `design/flow.md`.

A calm, light game surface: the building is a pale frosted model, the UI is glass floating over
it, and colour is rationed so the routes and the objects carry the information. Pixel type is
kept for a few moments only: the wordmark, ESCAPE!, CONFLICT! and LEVEL COMPLETE.

Readable first. A judge at the back of the room must see which object failed, where, and why
within five seconds.

## Six rules

1. **One accent, one fill.** `ACCENT` fills exactly one control per state (ESCAPE!, APPLY or
   REPLAY). Everything else is glass or a tinted pill.
2. **Identity is not status.** A discipline colour never changes. Status is a tinted badge, a
   round check or cross, a ring and a line style.
3. **Glass is for chrome, not content.** HUD, card, bar, pop-ups and banners are glass
   (`GLASS`, `GLASS_BLUR`, `SHADOW_GLASS`). The model is never frosted over.
4. **Colour means information.** The building is near-white and grey-blue. Anything saturated is
   a route, an object, the primary action or a problem.
5. **Pixel for moments.** `FONT_DISPLAY` only for the wordmark, ESCAPE!, CONFLICT! and LEVEL
   COMPLETE. Labels and sentences are `FONT_BODY`; numbers are `FONT_DATA`.
6. **Always 3D isometric, never a plan.** Views: shaded, x-ray, exploded floors (`VIEWS`).

## Building

| What | Token | How |
|---|---|---|
| Backdrop | `BACKGROUND` | Behind everything, with faint accent, magenta and teal washes |
| Outlines, wall tops | `WALL` | 3.1:1 on the backdrop; graphics only, never text |
| Wall faces | `WALL_INNER` | Pale frosted mass |
| Slab tops | `WALL_TOP` | Translucent, so lower floors read through |
| Hairlines, ground grid | `GRID` | Decorative only |

## Objects and routes

| Route state | Look |
|---|---|
| Available | small `ROUTE_DOT` (accent) dots at `ROUTE_DOT_OPACITY` |
| Selected | larger dots in the discipline colour |
| Travelled or escaped | solid line in the discipline colour, check badge in `PASS` |
| Blocked | solid up to `blocked_at`, `FAIL` dashes beyond, double red ring, cross badge |
| Structural load | violet line with white down chevrons into a ground symbol |
| Proposed (Jev) | accent dashed outline with pale hatch; ghost route at `GHOST_OPACITY` |

Objects are tiles in the discipline colour with the glyph in `glyphInk`. Selection is an accent
ring.

## Moments

- **Fail:** everything holds `MOTION.failFreezeMs`, the object shakes (`failShakeMs`), the cross
  blinks `failBlinkCount` times at `failBlinkHz`. Callout on the model in `FONT_DATA`:
  `1.2 < 1.6 m`. The card says it in words: "Insufficient clearance".
- **Conflict:** a status flips from escaped to blocked between runs. CONFLICT! banner holds
  `bannerHoldSeconds`, then docks into the card.
- **Apply:** proposed tint fades into the normal material over 400 ms with `EASE_GLASS`, then
  ESCAPE! is the only lit control again.
- **Level complete:** the building outline blinks `winFlashCount` times at `winFlashHz`;
  LEVEL COMPLETE in `FONT_DISPLAY`, `SCORE` colour.
- **Reduced motion:** no shake, blink or pulse; routes draw complete; banners wait for dismissal.

## Colour rules (checked by `design/tokens.test.ts`)

- Text colours are at least 4.5:1 on `BACKGROUND`; `TEXT_DIM` is for 16 px and up only.
- Badge text is at least 4.5:1 on its tint; white is at least 4.5:1 on `ACCENT`.
- Every glyph is at least 4.5:1 on its discipline colour.
- Discipline colours never reuse `PASS`, `FAIL` or `ACCENT`.
- Nothing flashes more than `MAX_FLASH_HZ` (3) times a second.
- **Open:** teal, orange, smoke and amber are under 3:1 on the backdrop as thin lines. The test
  is marked todo until the design system darkens them or routes get a white outline.
