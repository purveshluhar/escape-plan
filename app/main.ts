// App entry: loads the building, keeps the edit list, re-solves on every change, and shows the
// viewer and scoreboard. Owner: P3. The logic lives in state.ts and scoreboard.ts (tested in Node).
import buildingJson from '../data/building.json';
import expectedJson from '../data/expected.json';
import type { Building, ExpectedFile } from '../contract/types.ts';
import { createViewer } from '../viewer/index.ts';
import { levelComplete, scoreRows } from './scoreboard.ts';
import { applyEdit, demoButtons, initialState, isApplied, resetState, run } from './state.ts';
import type { DemoButton, GameState } from './state.ts';

const building = buildingJson as Building;
const buttons: DemoButton[] = demoButtons(building, expectedJson as ExpectedFile);
let state: GameState = initialState();

const viewer = createViewer(document.getElementById('viewer')!);
const board = document.getElementById('scoreboard')!;
const banner = document.getElementById('banner')!;
const editBox = document.getElementById('edits')!;
const resetButton = document.getElementById('reset') as HTMLButtonElement;

const editButtons = buttons.map((b) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = b.id;
  el.className = 'edit';
  el.textContent = b.label;
  el.addEventListener('click', () => change(applyEdit(state, b.edit)));
  editBox.appendChild(el);
  return { el, b };
});

// Every change re-solves and re-draws at once (the plan's live re-solve). Escape! replays the
// current state without changing it.
function change(next: GameState): void {
  state = next;
  render();
}

function render(): void {
  const { building: edited, results } = run(building, state);
  // The viewer gets the edited building, so a widened shaft is drawn wider. (Confirm with P2.)
  viewer.show(edited, results);
  board.replaceChildren(
    ...scoreRows(edited, results).map((row) => {
      const li = document.createElement('li');
      li.style.setProperty('--token', row.color);
      li.dataset.status = row.status;
      const head = document.createElement('div');
      head.textContent = `${row.glyph}  ${row.label}: ${row.status === 'pass' ? 'PASS' : 'FAIL'}`;
      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = row.numbers ? `${row.detail}. ${row.numbers}` : row.detail;
      li.append(head, detail);
      return li;
    }),
  );
  banner.textContent = levelComplete(results) ? 'LEVEL COMPLETE' : '';
  for (const { el, b } of editButtons) {
    const done = isApplied(state, b.edit);
    el.disabled = done;
    el.setAttribute('aria-pressed', String(done));
  }
  resetButton.disabled = state.edits.length === 0;
}

document.getElementById('escape')!.addEventListener('click', render);
resetButton.addEventListener('click', () => change(resetState()));
render();
