# design/

**Owner:** P4.
**Purpose:** the look and the story: colours, icons, path style, motion, sound, demo script, deck.
**Consumes:** the disciplines in `contract/types.ts`.
**Produces:** `design/tokens.ts` (colours, glyphs, fonts, path and motion values that `viewer/`
and `app/` import), `design/look.md` (how to use them), icons and sound files in `design/`, and
the demo script (`design/demo-script.md` when written).

## Status

Base look locked: a maze-arcade screen (black ground, neon-blue double-line walls, pellet-trail
paths, pixel type). Our own take on the genre: no characters, sprites, names, music or sound
effects from any existing game.

- `tokens.ts`: palette, discipline colours and glyphs, fonts, `PATH`, `MOTION`, `contrastRatio()`.
- `tokens.test.ts`: every text and discipline colour is at least 4.5:1 on the background,
  disciplines never reuse the pass or fail colour, nothing flashes more than 3 times a second.
- `look.md`: the spec for paths, the fail moment, the edit moment and LEVEL COMPLETE.
- `look-preview.html`: a fake 2D maze that runs the spec with the real tokens. Under
  `npm run dev`, open http://localhost:5173/design/look-preview.html.

## Tier 1 first task

Lock the discipline colours and glyphs in `design/tokens.ts`, the path style, and the fail and
win moments. Use the `arcade-look` skill for the visual system and its screen checklist, and
`demo-and-pitch` for the script. Every asset is self-made or properly licensed; record the
source of any third-party asset in this README.

## Third-party assets

| Asset | Source | Licence |
|---|---|---|
| Press Start 2P font (display) | Google Fonts, loaded at runtime, not stored in the repo | SIL Open Font License 1.1 |
| IBM Plex Sans font (body) | Google Fonts, loaded at runtime, not stored in the repo | SIL Open Font License 1.1 |
