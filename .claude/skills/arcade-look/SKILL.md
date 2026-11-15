---
name: arcade-look
description: The calm visual system that lets Escape Plan answer a person's building question and still read on a projector. Use when building or judging anything on screen in viewer/, app/ or design/ (colour, glow, camera, motion, the No and all-yes moments, sound), or when someone asks to "make it fancy".
---

# The look

Fancy means **readable first, then calm and clear**. A person at the back of the room must see
which answer is No, where, and why within five seconds. Escape Plan is never a game: the screen
answers a person's question about their building. The words on screen are in `design/copy.md`.
The full look is in `design/look.md`.

## The system

- **Ground**: the light backdrop (`BACKGROUND` in `design/tokens.ts`) and the building as a pale
  frosted model. The UI is glass over it. The model is never frosted over.
- **Discipline colours**: one colour per discipline, from `DISCIPLINE_STYLE`. Always pair the
  colour with the thing's **glyph** and its **name** (Sofa), so an answer never relies on colour
  alone. Never call the thing a token on screen.
- **Answers**: Yes uses the `PASS` colour and a check, No uses the `FAIL` colour and a cross.
  Each one has the word, not only a hue.
- **Glow**: a soft glow on routes and the moving things only; the building stays calm.
- **Camera**: isometric, fixed angle, the whole building in frame. Move the camera only for one
  beat (a short push-in on the block), then return.
- **Motion**: each thing travels its `path` in sequence, ease-in-out, about 1.5-2.5 s each. On a
  No, the thing stops at `blocked_at`, shakes once (150 ms), and a red X shows where it is stuck.
- **No moment**: red X at `blocked_at` plus a label with the numbers ("needs 1.6 m, has 1.2 m").
- **All-yes moment**: every answer Yes, then the **Yes to all** banner in `FONT_BODY` with the
  yes lines under it. No flash, no confetti, no count of tries.
- **Sound cues** (tier 2): one short, quiet sound each for Show me, a No, an edit and Yes to all.
  Under 1 s, mixed low, with a mute button. Self-made or properly licensed; record the source in
  `design/README.md`.
- **Timing**: an edit checks every answer again and re-animates in under 1 s. Nothing loops
  forever on screen.

## Steps

1. Read `design/tokens.ts`, `design/look.md` and `design/copy.md`, and use their values and
   words. Ask P4 before adding a colour or a word.
2. Build the plain readable version first: boxes, lines, labels. Then add glow and motion.
3. Check it on the largest screen you have, from three metres away, or at 50 % zoom.
4. Run the checklist below. Fix every "no" before you call it done.
5. If at the 3D go/no-go (`docs/plan.md`) a thing still does not read clearly moving through
   the cutaway, switch to 2D stacked plans (one SVG per level) and keep 3D on a branch.

## Screen checklist

- [ ] Each thing is clear by glyph and name, not just colour.
- [ ] Text contrast is at least 4.5:1 against the background (check with a contrast tool).
- [ ] For each No, the thing, where it is stuck, and the two numbers are visible at once.
- [ ] The Yes to all banner is easy to see and calm.
- [ ] No game words on screen: no level complete, score, win, player, play, race or token.
- [ ] Motion has a purpose; nothing flashes more than 3 times a second.
- [ ] The frame reads in a static screenshot (for the deck and the backup).
- [ ] It still runs smoothly on the presenting laptop.

## Done when

Every checklist line is "yes" on the presenting laptop, and P4 has seen it.
