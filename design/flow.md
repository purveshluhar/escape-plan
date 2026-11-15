# The flow: 12 sheets

Owner: P4. The screen-by-screen user flow for the demo, for review by P2 (viewer) and P5 (data).
Clickable dummy (no backend, solver or Jev): https://claude.ai/artifact/HHVGP9HD4h3DdWk4udo9Gq
(private to P4 until shared). Look and values: `design/look.md` and `design/tokens.ts`.

## Rules

- **Always 3D isometric, never a plan.** One model, three views (`VIEWS` in `tokens.ts`):
  - `shaded`: simple shaded building, centred, with site context (neighbour massing, street).
  - `xray`: walls transparent; the selected thing (Sofa) and its exits are visible inside.
  - `floors`: exploded floor-by-floor axonometric. Used for the route clash and to show Jev's
    solution. Still 3D: the thing animates down through the floors.
- **The model fills the screen.** Glass chrome floats over it: HUD top (questions, answers so
  far, state), one context card on the right, action bar at the bottom (Undo edits left, the one primary
  action centre, view switch and camera right).
- **Inputs are pop-ups** (pick a question, confirm exits, suggested fixes, undo edits). Confirm exits
  docks to the side so the x-ray stays visible.
- One filled accent control per state. Every step has Cancel or Back, and `Esc` does the same.
- Keyboard: `E` or `Space` Show me, `1`-`4` pick a question, `Enter` confirm, `Esc` cancel.

## Sheets

| # | Sheet | View | Source | What happens | Next |
|---|---|---|---|---|---|
| 01 | Start | shaded | sketch 1, notes 1 | Building and site; one action: Pick a question | 02 |
| 02 | Pick a question | shaded | sketch 2, notes 2-3 | Pop-up with 4 question cards (what the thing is, size, where); or click it in the model | 03 |
| 03 | Confirm exits | xray | sketch 2 | Side pop-up: tick exits (truck bay suggested); arrows in the model | 04 |
| 04 | X-ray, ready | xray | sketch 3 | The thing glows inside the x-rayed building; Show me pulses | 05 |
| 05 | Route clash | floors | sketch 4, notes 4 | Camera eases to exploded floors; the thing moves down until it is stuck. Card: needs 1.6 m, has 1.2 m | 06 or 11 |
| 06 | Jev solving | floors | notes 5 | Element under test outlined; Cancel; 8 s timeout opens 11 | 07 |
| 07 | Jev solution | floors | sketch 4, notes 6 | Proposed change on every floor and the new path at `GHOST_OPACITY`; warning that it cuts beam B2; APPLY or Cancel | 08 |
| 08 | Exit and conflict | floors | notes 8 | Chiller animates from its start, down the floors, out to the truck. CONFLICT! banner: the structure answer is now No | 09 |
| 09 | Loop: transfer beam | floors | notes 7 | Jev proposes a transfer beam; APPLY; glass and wheelchair go back to 02 | 10 |
| 10 | Yes to all | xray | added | All routes complete; Yes to all 4, the yes lines, edit count; Try again or View building | 01 |
| 11 | Jev offline | floors | added | Pop-up with the suggested fixes for the selected question (the full-demo edits) | 07 |
| 12 | Undo edits confirm | floors | added | Asks only when edits exist; focus on Keep editing | 01 |

Notes 2 (select) and 3 (identify) are one pop-up: each card already says what the thing is.

## Asks

- **P2 (viewer):** three views of one scene (shaded, x-ray material, exploded floors with an
  eased camera move), a pick hook (click mesh to token id), exit markers, a proposed-edit layer
  at `GHOST_OPACITY`, and an animation of one thing along its route. Draw glyphs in `DISCIPLINE_STYLE[d].glyphInk`
  (the old code uses `BACKGROUND`, which is now light).
- **P5 (data):** exits per question (sheet 03 lets the person pick; today each token has one goal),
  floor levels on nodes for the exploded view, and site massing for the shaded view. Sizes
  disagree: the design system says chiller 2.0 m and shaft 1.5 m; `data/building.json` says
  1.6 m and 1.2 m. The sheets use the data.
- **P1 (Jev):** a timeout and an offline signal, so sheet 11 can take over.

## Not yet decided

Clicking a thing whose answer is already Yes, undo of a single edit, and the tier 3 report after
the session.
