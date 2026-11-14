// App entry: loads the building, runs the solver, shows the viewer and scoreboard. Owner: P3.
import buildingJson from '../data/building.json';
import type { Building, Edit } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { createViewer } from '../viewer/index.ts';
import { levelComplete, scoreRows } from './scoreboard.ts';

const building = buildingJson as Building;
const edits: Edit[] = [];

const viewer = createViewer(document.getElementById('viewer')!);
const board = document.getElementById('scoreboard')!;
const banner = document.getElementById('banner')!;

function render(): void {
  const results = solve(building, edits);
  viewer.show(building, results);
  board.replaceChildren(
    ...scoreRows(building, results).map((row) => {
      const li = document.createElement('li');
      li.style.setProperty('--token', row.color);
      li.dataset.status = row.status;
      li.textContent = `${row.glyph}  ${row.label}: ${row.status === 'pass' ? 'PASS' : 'FAIL'} (${row.detail})`;
      return li;
    }),
  );
  banner.textContent = levelComplete(results) ? 'LEVEL COMPLETE' : '';
}

document.getElementById('escape')!.addEventListener('click', render);
render();
