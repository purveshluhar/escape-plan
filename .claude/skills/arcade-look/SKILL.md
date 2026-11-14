---
name: arcade-look
description: The visual system that makes Escape Plan look like an arcade game and still read on a projector. Use when building or judging anything on screen in viewer/, app/ or design/ (colour, glow, camera, token motion, fail and win moments, sound), or when someone asks to "make it fancy".
---

# Arcade look

Fancy means **readable first, then exciting**. A judge at the back of the room must see which
token failed and why within five seconds.

## The system

- **Ground**: dark background (`BACKGROUND` in `design/tokens.ts`), a faint grid, the building as
  translucent boxes with bright edges. Dark ground makes the paths glow.
- **Discipline colours**: one neon colour per discipline, from `DISCIPLINE_STYLE`. Always pair
  colour with the token's **glyph** and **label**, so status never relies on colour alone.
- **Status**: pass = green `PASS`, fail = red `FAIL`, each with a word or icon, not only a hue.
- **Glow**: paths are thick lines with a soft glow (additive blending or a bloom pass). Keep glow
  on paths and tokens only; the building stays calm.
- **Camera**: isometric orthographic, fixed angle, the whole building in frame. Move the camera
  only for one beat (a short push-in on the block), then return.
- **Token motion**: tokens travel their `path` in sequence, ease-in-out, about 1.5-2.5 s per
  token. On fail, the token stops at `blocked_at`, shakes once (150 ms), and a red X pops.
- **Fail moment**: red X at `blocked_at` plus a label with the numbers ("needs 1.6 m, has 1.2 m").
- **Win moment**: all tokens green, then **LEVEL COMPLETE** full width, a short burst, a chime.
- **Sound cues** (tier 2): one short sound each for go, fail, edit, win. Under 1 s, mixed low,
  with a mute button. Self-made or properly licensed; record the source in `design/README.md`.
- **Timing**: an edit re-solves and re-animates in under 1 s. Nothing loops forever on screen.

## Steps

1. Read `design/tokens.ts` and use its values. Ask P4 before adding a colour.
2. Build the plain readable version first: boxes, lines, labels. Then add glow and motion.
3. Check it on the largest screen you have, from three metres away, or at 50 % zoom.
4. Run the checklist below. Fix every "no" before you call it done.
5. If at the 3D go/no-go (`docs/plan.md`) a token still does not read clearly moving through
   the cutaway, switch to 2D
   stacked plans (one SVG per level) and keep 3D on a branch.

## Screen checklist

- [ ] Each token is clear by glyph and label, not just colour.
- [ ] Text contrast is at least 4.5:1 against the background (check with a contrast tool).
- [ ] The failed token, where it failed, and the two numbers are visible at once.
- [ ] LEVEL COMPLETE is impossible to miss.
- [ ] Motion has a purpose; nothing flashes more than 3 times a second.
- [ ] The frame reads in a static screenshot (for the deck and the backup).
- [ ] It still runs smoothly on the presenting laptop.

## Done when

Every checklist line is "yes" on the presenting laptop, and P4 has seen it.
