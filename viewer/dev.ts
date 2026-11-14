// Viewer dev page: plays each expected case through the viewer. Open /viewer/dev.html under
// `npm run dev`. Not in the production build. Tokens whose rule the solver does not answer yet
// use the hand-made results in fixtures.ts; the header says which.
import buildingJson from '../data/building.json';
import expectedJson from '../data/expected.json';
import type { Building, ExpectedFile, SolverResult } from '../contract/types.ts';
import { IMPLEMENTED_RULES, solve } from '../solver/index.ts';
import { FIXTURES } from './fixtures.ts';
import { createViewer } from './index.ts';

const building = buildingJson as Building;
const expected = expectedJson as ExpectedFile;
const viewer = createViewer(document.getElementById('viewer')!);
const source = document.getElementById('source')!;
const buttons = document.getElementById('cases')!;

function play(caseId: string): void {
  const c = expected.cases.find((x) => x.id === caseId);
  if (!c) return;
  const solved = solve(building, c.edits);
  const faked: string[] = [];
  const results = solved.map((r): SolverResult => {
    const rule = building.tokens.find((t) => t.id === r.token)?.rule;
    if (rule && IMPLEMENTED_RULES.includes(rule)) return r;
    const fixture = FIXTURES[caseId]?.find((f) => f.token === r.token);
    if (!fixture) return r;
    faked.push(r.token);
    return fixture;
  });
  viewer.show(building, results);
  source.textContent = faked.length ? `fixture results for: ${faked.join(', ')}` : 'all results from the solver';
  for (const b of buttons.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.case === caseId));
}

buttons.replaceChildren(...expected.cases.map((c) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.case = c.id;
  b.textContent = c.id;
  b.title = c.description;
  b.addEventListener('click', () => play(c.id));
  return b;
}));
play(new URLSearchParams(location.search).get('case') ?? 'base');
