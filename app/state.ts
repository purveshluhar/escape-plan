// App state: the edit list, the demo buttons and one re-solve per change. Pure, so Node tests can
// replay data/expected.json without a browser. Owner: P3.
import type { Building, Edit, ExpectedFile, SolverResult } from '../contract/types.ts';
import { applyEdits, solve } from '../solver/index.ts';
import { metres, placeName } from './scoreboard.ts';

// The case whose edits become the demo buttons, in order. P5 keeps it current in expected.json.
export const DEMO_CASE = 'full-demo';
// The case that adds the smoke fix (close the lobby door). Its widen is the same as the demo's, so it shows once.
export const RACE_CASE = 'smoke-close-lobby-door';

export interface DemoButton {
  id: string; // stable DOM id, from op and target
  label: string; // what the button says
  edit: Edit;
}

export interface GameState {
  edits: Edit[]; // applied in order to data/building.json; [] = the base building
}

export interface Solved {
  building: Building; // the building with every edit applied (what the viewer should draw)
  results: SolverResult[];
}

export const initialState = (): GameState => ({ edits: [] });


export function editLabel(building: Building, edit: Edit): string {
  const name = edit.target ? placeName(building, edit.target) : '';
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  switch (edit.op) {
    case 'widen':
      return `Widen ${lower}${edit.value !== null ? ` to ${metres(edit.value)}` : ''}`;
    case 'add_transfer_beam':
      return `Add transfer beam at ${name}`;
    case 'add_ramp':
      return `Add ramp at ${lower}`;
    case 'close_door':
      return `Close ${lower}`;
    case 'add_sleeve':
      return `Add sleeve at ${lower}`;
    case 'reset':
      return 'Undo edits';
  }
}

// The demo buttons: one per edit in the DEMO_CASE, labelled from the building's own names, so
// they follow P5's data when ids or values change. Reset is its own button, not one of these.
export function demoButtons(building: Building, expected: ExpectedFile): DemoButton[] {
  const edits = [DEMO_CASE, RACE_CASE].flatMap((id) => expected.cases.find((c) => c.id === id)?.edits ?? []);
  const buttons = edits
    .filter((e) => e.op !== 'reset')
    .map((e): DemoButton => ({
      id: `edit-${e.op}-${e.target ?? 'none'}`,
      label: editLabel(building, e),
      edit: { ...e, source: 'button' },
    }));
  return buttons.filter((b, i) => buttons.findIndex((x) => x.id === b.id) === i);
}

const sameEdit = (a: Edit, b: Edit): boolean => a.op === b.op && a.target === b.target && a.value === b.value;

export function isApplied(state: GameState, edit: Edit): boolean {
  return state.edits.some((e) => sameEdit(e, edit));
}

// Each edit applies once: the contract has no way to undo a widen, so a second click does nothing.
// A reset edit clears the list (the same result as applying it, and the list stays short).
export function applyEdit(state: GameState, edit: Edit): GameState {
  if (edit.op === 'reset') return initialState();
  if (isApplied(state, edit)) return state;
  return { edits: [...state.edits, edit] };
}

export function resetState(): GameState {
  return initialState();
}

// One solve per state change. The solver answers in under 100 ms, so this runs on every click.
export function run(building: Building, state: GameState): Solved {
  return { building: applyEdits(building, state.edits), results: solve(building, state.edits) };
}
