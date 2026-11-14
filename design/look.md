# The look: maze arcade

Owner: P4. Values live in `design/tokens.ts`; this file says how to use them.
Preview: `npm run dev`, then open http://localhost:5173/design/look-preview.html.

The building reads like a maze on an old arcade cabinet: black ground, neon-blue walls, pellet
trails for routes, and chunky pixel type for the score. It is our own take on the genre. We use
no characters, sprites, names, music or sound effects from any existing game.

Readable first, then exciting. A judge at the back of the room must see which token failed,
where, and why within five seconds.

## Ground and maze

| What | Token | How |
|---|---|---|
| Background | `BACKGROUND` | Pure black. Nothing else is black, so glow reads. |
| Floor grid | `GRID` | Faint, 1 m squares. Optional; drop it if it fights the walls. |
| Room, shaft and door edges | `WALL` + `WALL_INNER` | Double line: a bright `WALL` outer edge and a dim `WALL_INNER` inner edge, about 0.15 m apart. Box fill is `WALL_INNER` at about 25 % opacity. |
| Decoration dots | `PELLET` | Only where no path runs, for example along the street. Never on a route. |

The building stays calm: walls never glow or move, except in the win flash.

## Tokens and paths

- **Token**: a disc of `PATH.tokenRadius` in the discipline colour with its glyph in
  `FONT_DISPLAY`, black on colour. Always show the glyph; never rely on colour alone.
- **Route ahead**: pellets in the discipline colour, `PATH.pelletSpacing` apart along `path`,
  radius `PATH.pelletRadius`.
- **Eaten route behind**: as the token passes a pellet, the pellet disappears and a thin line of
  `PATH.trailWidth` stays behind it, with additive glow at `PATH.glow`.
- **Order**: after Escape!, tokens start `MOTION.staggerSeconds` apart, in the order of
  `building.tokens`. Each one travels its whole path in `MOTION.secondsPerToken`, ease-in-out.
- Glow goes on tokens, pellets and trails only.

## Fail moment

The token reaches `blocked_at` and stops.

1. It shakes once, `MOTION.failShakeMs`.
2. A red X in `FAIL` pops over `blocked_at`, blinking `MOTION.failBlinkCount` times at
   `MOTION.failBlinkHz`, then stays solid.
3. Pellets past `blocked_at` turn dim grey: the route it could not finish.
4. A label next to the X, body font, two lines:
   `GLASS  CANNOT TURN` / `needs 1.6 m, has 1.2 m` (from `reason`, `needed`, `available`).
5. The scoreboard row says `FAIL` in words, with the same numbers.

## Edit moment

After an edit, the changed edge or member flashes `TEXT` once (one flash, 200 ms), then every
token re-runs. The whole re-solve and re-animation starts in under 1 s.

## Win moment (LEVEL COMPLETE)

When every token is `pass`:

1. All tokens sit at their exits. Every scoreboard row reads `PASS` in `PASS` green.
2. The maze walls flash `WALL` to `TEXT` and back, `MOTION.winFlashCount` times at
   `MOTION.winFlashHz`.
3. `LEVEL COMPLETE` appears full width in `FONT_DISPLAY`, colour `SCORE`, for
   `MOTION.bannerHoldSeconds`, then stays as a smaller banner.
4. Tier 2: a short self-made chime.

## Type

- `FONT_DISPLAY` (Press Start 2P): title, `READY!`, `LEVEL COMPLETE`, glyphs, PASS and FAIL
  words, the score count. Uppercase. At least 16 px on screen; pixel fonts blur when small.
- `FONT_BODY` (IBM Plex Sans): reasons, numbers, button labels, everything longer than a word
  or two.
- Load both with `FONT_STYLESHEET` in `index.html` (P3).

## Colour rules

- Discipline colours are never the `PASS` green or the `FAIL` red. `design/tokens.test.ts`
  checks this.
- Every text and status colour is at least 4.5:1 on `BACKGROUND`. The test checks this too.
- Nothing flashes more than `MAX_FLASH_HZ` (3) times a second.

## Screen checklist

Run the `arcade-look` checklist on the presenting laptop, from three metres away or at 50 % zoom.
