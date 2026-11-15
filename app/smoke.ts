// The smoke question, "Do people get out before the smoke?" (design/copy.md, section 2): the building
// manager's question. The smoke token is in the building only while this question is asked
// (data/smoke.ts). Its answer is the people's answer on the same clock, so it says Yes only when
// people get out and the smoke is not there first. Pure, so Node tests can check it. Owner: P1.
import type { Building, Edit, Id, SolverResult } from '../contract/types.ts';
import { smokeArrival } from '../solver/spread.ts';
import { SMOKE_START } from '../data/smoke.ts';
import type { Answer } from './answers.ts';
import { placeName } from './scoreboard.ts';
import type { DemoButton } from './state.ts';

export const RACE: Id = 'smoke'; // the dock id of the question (the smoke token's id)
const PEOPLE: Id = 'people';

const steps = (n: number): string => `${n} step${n === 1 ? '' : 's'}`;

// Ask the smoke question and people come with it: they are the ones racing the smoke. The viewer
// draws them even when their own question is not asked. In building order, so stagger stays stable.
export function racePlaced(building: Building, placed: readonly Id[]): Id[] {
  const on = placed.includes(RACE) ? new Set([...placed, PEOPLE]) : new Set(placed);
  return building.tokens.map((t) => t.id).filter((id) => on.has(id));
}

// The smoke's answer is the people's, under the smoke's name. Null when there is no race to read.
export function raceAnswer(rows: readonly Answer[]): Answer | null {
  const people = rows.find((r) => r.token === PEOPLE);
  return people && rows.some((r) => r.token === RACE) ? { ...people, token: RACE } : null;
}

// The answers the screen lists: the asked questions, with the smoke's row read as the race.
export function answerRows(rows: readonly Answer[], placed: readonly Id[]): Answer[] {
  const race = raceAnswer(rows);
  return rows.filter((r) => placed.includes(r.token)).map((r) => (r.token === RACE && race ? race : r));
}

// What the viewer draws: every asked question as the solver walked it, the smoke parked where it
// starts (it spreads as a tint, it does not walk), and the people whenever the smoke is asked.
export function drawnResults(rows: readonly Answer[], placed: readonly Id[]): Answer[] {
  const on = new Set(placed.includes(RACE) ? [...placed, PEOPLE] : placed);
  return rows.filter((r) => on.has(r.token)).map((r) => (r.token === RACE
    ? { ...r, status: 'pass' as const, path: [r.path[0] ?? SMOKE_START], blocked_at: null, reason: null, needed: null, available: null }
    : r));
}

// Step counts in words, for the fix card and the Answers panel. Empty when people cannot get out
// for another reason (the office door): there is no race to describe yet.
export function raceText(b: Building, r: SolverResult): string {
  const place = (id: Id): string => placeName(b, id);
  if (r.status === 'fail') {
    if (r.reason !== 'smoke_first' || r.blocked_at === null || r.needed === null || r.available === null) return '';
    const at = place(r.blocked_at);
    return `People reach ${at} at step ${r.needed}. Smoke gets there at step ${r.available}. ${
      r.available < r.needed ? 'The smoke is there first.' : 'A tie goes to the smoke.'}`;
  }
  const exit = r.path.at(-1);
  if (exit === undefined || r.time === null) return '';
  const smoke = smokeArrival(b);
  // The place where the smoke is closest behind the people, and both of them at that one place.
  const lead = r.path.flatMap((id, i) => (smoke.has(id) ? [{ id, step: i, at: smoke.get(id)!, gap: smoke.get(id)! - i }] : []))
    .reduce<{ id: Id; step: number; at: number; gap: number } | null>((tight, x) => (tight === null || x.gap < tight.gap ? x : tight), null);
  if (!lead) return `People reach ${place(exit)} at step ${r.time}. Smoke does not reach their route.`;
  const people = lead.id === exit
    ? `People reach ${place(exit)} at step ${r.time}.`
    : `People reach ${place(lead.id)} at step ${lead.step} and ${place(exit)} at step ${r.time}.`;
  return `${people} Smoke reaches ${place(lead.id)} at step ${lead.at}, ${steps(lead.gap)} after them.`;
}

// The step the smoke reaches each node, for the viewer's tint. Empty when the building has no smoke.
export function raceSteps(b: Building): Map<Id, number> {
  return smokeArrival(b);
}

// Seconds the tint takes per smoke step, so the smoke and the people share one clock: the people's
// walk takes `perToken` seconds and covers their steps (to the stop, when they are stopped).
export function raceSecondsPerStep(people: SolverResult, perToken: number): number {
  // Steps walked: to the exit on a win, to where the smoke caught them on a smoke_first, else the walk so far.
  const n = people.status === 'pass' ? people.path.length - 1 : people.reason === 'smoke_first' ? people.needed ?? people.path.length : people.path.length - 1;
  return perToken / Math.max(1, n);
}

// The fix buttons that close a door: what stops the smoke. Offered on a smoke_first answer.
export function raceButtons(buttons: readonly DemoButton[]): DemoButton[] {
  return buttons.filter((b) => b.edit.op === 'close_door');
}

// What the viewer tints: the smoke's steps on the people's clock. Null when the smoke is not asked.
export function raceSpread(
  b: Building, rows: readonly SolverResult[], perToken: number, delaySeconds = 0,
): { steps: Map<Id, number>; secondsPerStep: number; delaySeconds: number } | null {
  const people = rows.find((r) => r.token === PEOPLE);
  return people && rows.some((r) => r.token === RACE) ? { steps: raceSteps(b), secondsPerStep: raceSecondsPerStep(people, perToken), delaySeconds } : null;
}

// The close-door fixes that the rules say turn this answer to Yes now. A door the smoke does not come
// through (people dropped on an upper floor are caught by the smoke in the cores) is not offered.
export function helpfulCloseButtons(
  buttons: readonly DemoButton[], token: Id, applied: readonly Edit[], solveWith: (edits: readonly Edit[]) => SolverResult[],
): DemoButton[] {
  return raceButtons(buttons).filter((b) => solveWith([...applied, b.edit]).find((r) => r.token === token)?.status === 'pass');
}
