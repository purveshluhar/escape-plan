# The flow: 12 sheets

Owner: P4. The screen-by-screen user flow for the demo, for review by P2 (viewer) and P5 (data).
Clickable dummy (no backend, solver or Jev): https://claude.ai/artifact/HHVGP9HD4h3DdWk4udo9Gq
(private to P4 until shared). Look and values: `design/look.md` and `design/tokens.ts`.

## Rules

- **Always 3D isometric, never a plan.** One model, three views (`VIEWS` in `tokens.ts`):
  - `shaded`: simple shaded building, centred, with site context (neighbour massing, street).
  - `xray`: walls transparent; the selected object and its exits are visible inside.
  - `floors`: exploded floor-by-floor axonometric. Used for the route clash and to show Jev's
    solution. Still 3D: the object animates down through the floors.
- **The model fills the screen.** Glass chrome floats over it: HUD top (level, escaped count,
  state), one context card on the right, action bar at the bottom (RESET left, the one primary
  action centre, view switch and camera right).
- **Inputs are pop-ups** (choose object, confirm exits, fallback fixes, reset). Confirm exits
  docks to the side so the x-ray stays visible.
- One filled accent control per state. Every step has Cancel or Back, and `Esc` does the same.
- Keyboard: `E` or `Space` ESCAPE!, `1`-`4` select object, `Enter` confirm, `Esc` cancel.

## Sheets

| # | Sheet | View | Source | What happens | Next |
|---|---|---|---|---|---|
| 01 | Start | shaded | sketch 1, notes 1 | Building and site; one action: CHOOSE OBJECT | 02 |
| 02 | Select object | shaded | sketch 2, notes 2-3 | Pop-up with 4 object cards (what it is, size, where); or click it in the model | 03 |
| 03 | Confirm exits | xray | sketch 2 | Side pop-up: tick exits (truck bay suggested); arrows in the model | 04 |
| 04 | X-ray, ready | xray | sketch 3 | Object glows inside the x-rayed building; ESCAPE! pulses | 05 |
| 05 | Route clash | floors | sketch 4, notes 4 | Camera eases to exploded floors; object moves down until it clashes. Card: needs 1.6 m, has 1.2 m | 06 or 11 |
| 06 | Jev solving | floors | notes 5 | Element under test outlined; Cancel; 8 s timeout opens 11 | 07 |
| 07 | Jev solution | floors | sketch 4, notes 6 | Proposed change on every floor and the new path at `GHOST_OPACITY`; warning that it cuts beam B2; APPLY or Cancel | 08 |
| 08 | Exit and conflict | floors | notes 8 | Chiller animates from its start, down the floors, out to the truck. CONFLICT! banner: structure now blocked | 09 |
| 09 | Loop: transfer beam | floors | notes 7 | Jev proposes a transfer beam; APPLY; glass and wheelchair go back to 02 | 10 |
| 10 | Level complete | xray | added | All routes complete; LEVEL COMPLETE, 4/4, edit count; Replay or View building | 01 |
| 11 | Jev offline | floors | added | Pop-up with the preset fixes for the selected object (the full-demo edits) | 07 |
| 12 | Reset confirm | floors | added | Asks only when edits exist; focus on Keep editing | 01 |

Notes 2 (select) and 3 (identify) are one pop-up: each card already says what the object is.

## Asks

- **P2 (viewer):** three views of one scene (shaded, x-ray material, exploded floors with an
  eased camera move), a pick hook (click mesh to token id), exit markers, a proposed-edit layer
  at `GHOST_OPACITY`, and one-object exit animation. Draw glyphs in `DISCIPLINE_STYLE[d].glyphInk`
  (the old code uses `BACKGROUND`, which is now light).
- **P5 (data):** exits per object (sheet 03 lets the player pick; today each token has one goal),
  floor levels on nodes for the exploded view, and site massing for the shaded view. Sizes
  disagree: the design system says chiller 2.0 m and shaft 1.5 m; `data/building.json` says
  1.6 m and 1.2 m. The sheets use the data.
- **P1 (Jev):** a timeout and an offline signal, so sheet 11 can take over.

## Not yet decided

Clicking an object that already escaped, undo of a single edit, and the tier 3 post-game report.
