# design/

**Owner:** P4 (@minsookim1014 and @jackwayfeel).
**Purpose:** the look and the story: colours, icons, path style, motion, sound, demo script, deck.
**Consumes:** the disciplines in `contract/types.ts`.
**Produces:** `design/tokens.ts` (colours, glyphs, fonts, path and motion values that `viewer/`
and `app/` import), `design/look.md` (how to use them), icons and sound files in `design/`, and
the demo script (`design/demo-script.md` when written).

## Status

Look locked: **Liquid Glass v2**, a calm, light surface (light frosted building, glass UI chrome,
one blue accent, pixel type for the wordmark and CONFLICT! only). The model is always 3D
isometric: shaded, x-ray or exploded floors.

- `tokens.ts`: palette, glass, discipline colours, glyphs and glyph ink, fonts, type sizes,
  space, radius, views, `PATH`, `MOTION`, `GHOST_OPACITY`, `contrastRatio()`. Export names
  are stable, so `viewer/` and `app/` compile unchanged when values move.
- `tokens.test.ts`: text and badge contrast, glyph contrast, discipline colours never reuse the
  pass, fail or accent colour, nothing flashes more than 3 times a second. One todo: four
  discipline colours are under 3:1 on the light backdrop (see `look.md`).
- `look.md`: the rules, route states and moments.
- `flow.md`: the 12-sheet user flow, with asks for P1, P2 and P5. Clickable dummy linked there.
- Screen preview: the clickable 12-sheet canvas linked in `flow.md` (3D isometric, Liquid Glass).

## Tier 1 first task

Lock the discipline colours and glyphs in `design/tokens.ts`, the path style, and the No and
all-yes moments, following `look.md` and its colour rules. Use the `demo-and-pitch` skill for the
script. Every asset is self-made or properly licensed; record the
source of any third-party asset in this README.

## Third-party assets

| Asset | Source | Licence |
|---|---|---|
| Press Start 2P font (display) | Google Fonts, loaded at runtime, not stored in the repo | SIL Open Font License 1.1 |
| Atkinson Hyperlegible font (body) | Google Fonts, loaded at runtime, not stored in the repo | SIL Open Font License 1.1 |
| JetBrains Mono font (numbers) | Google Fonts, loaded at runtime, not stored in the repo | SIL Open Font License 1.1 |
