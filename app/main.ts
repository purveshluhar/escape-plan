// App entry: the 12-sheet flow from design/flow.md over the full-screen model. Glass HUD on top,
// one context card on the right, the action bar at the bottom, pop-ups for inputs. Owner: P3.
// The logic lives in flow.ts, answers.ts, state.ts and scoreboard.ts (tested in Node).
import buildingJson from '../data/building.json';
import expectedJson from '../data/expected.json';
import type { Building, Edit, ExpectedFile, Id, Reason } from '../contract/types.ts';
import { MOTION, VIEWS } from '../design/tokens.ts';
import { IMPLEMENTED_RULES } from '../solver/index.ts';
import { createViewer } from '../viewer/index.ts';
import { answers, relevantTargets } from './answers.ts';
import type { Answer } from './answers.ts';
import {
  afterRun, badgeFor, escapedCount, exitsFor, fixesFor, newlyBlocked, nextBlocked, objectFacts, viewFor,
} from './flow.ts';
import type { Screen } from './flow.ts';
import { REASON_TEXT, placeName } from './scoreboard.ts';
import { applyEdit, demoButtons, editLabel, initialState, run } from './state.ts';
import type { GameState } from './state.ts';

const building = buildingJson as Building;
const expected = expectedJson as ExpectedFile;
const buttons = demoButtons(building, expected);
const tokens = building.tokens;

// Jev (P1's AI fixer) is not connected yet, so fixes come from the preset list (sheet 11).
const JEV_CONNECTED = false;

interface Flow {
  screen: Screen;
  selected: Id | null;
  game: GameState; // applied edits
  results: Answer[] | null; // last ESCAPE! run; null = not run since the start or a reset
  conflict: Answer[]; // objects the last run newly blocked
  fix: Edit | null; // the proposed fix (sheets 07 and 09)
  back: Screen; // where Cancel goes from a pop-up
  showDialog: boolean; // the level-complete dialog; View building hides it
}

let flow: Flow = start();

function start(): Flow {
  return { screen: 'start', selected: null, game: initialState(), results: null, conflict: [], fix: null, back: 'start', showDialog: true };
}

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const viewerBox = $('viewer');
const viewer = createViewer(viewerBox);

// ---------- Small DOM helper (textContent only, never innerHTML) ----------

type Child = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

function btn(label: string, cls: string, onClick: () => void, extra: Record<string, string> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn ${cls}`, ...extra }, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

function tile(id: Id): HTMLElement {
  const t = tokens.find((x) => x.id === id)!;
  const f = objectFacts(building, t);
  const i = h('i', { style: `color:${f.glyphInk}` }, f.glyph);
  return h('span', { class: 'tile', style: `--c:${f.color}`, 'aria-hidden': 'true' }, i);
}

// ---------- Solving ----------

function solveNow(edits: readonly Edit[]): { edited: Building; results: Answer[] } {
  const { building: edited, results } = run(building, { edits: [...edits] });
  return { edited, results: answers(building, edited, edits, results, expected, IMPLEMENTED_RULES) };
}

let bannerTimer = 0;

function escape(): void {
  const { edited, results } = solveNow(flow.game.edits);
  const conflict = newlyBlocked(flow.results, results) as Answer[];
  viewer.show(edited, results);
  const screen = afterRun(results, flow.selected);
  flow = { ...flow, results, conflict, fix: null, screen, showDialog: true };
  if (screen === 'result' && conflict.length > 0) {
    window.clearTimeout(bannerTimer);
    showBanner(true);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) bannerTimer = window.setTimeout(() => showBanner(false), MOTION.bannerHoldSeconds * 1000);
  } else {
    showBanner(false);
  }
  render();
}

function go(screen: Screen, patch: Partial<Flow> = {}): void {
  flow = { ...flow, ...patch, screen };
  if (screen !== 'result') showBanner(false);
  render();
}

function select(id: Id): void {
  flow = { ...flow, selected: id };
  render();
}

function openReset(): void {
  if (flow.game.edits.length === 0) return replay();
  go('reset', { back: flow.screen });
}

function replay(): void {
  flow = start();
  viewer.show(building, []);
  showBanner(false);
  render();
}

// Cancel on the fix pop-up: back to the selected object's last result.
function backFromFix(): void {
  go(flow.results ? afterRun(flow.results, flow.selected) : 'start', { fix: null });
}

function apply(fix: Edit): void {
  flow = { ...flow, game: applyEdit(flow.game, fix) };
  escape();
}

// ---------- Words ----------

const HEADLINE: Record<Reason, string> = {
  too_narrow: 'Insufficient clearance',
  too_low: 'Not enough headroom',
  cannot_turn: 'Cannot make the turn',
  step: 'Step in the way',
  no_support: 'No support',
  smoke_first: 'Smoke got there first',
  uphill: 'Runs uphill',
  crosses_beam: 'Crosses a beam',
  no_supply: 'No supply',
  no_route: 'No route out',
};

const name = (id: Id | null): string => {
  const t = tokens.find((x) => x.id === id);
  return t ? objectFacts(building, t).name : '';
};
const title = (id: Id | null): string => {
  const n = name(id).toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
};
const m = (v: number): string => `${Number(v.toFixed(2))} m`;

function sentence(r: Answer, edited: Building): string {
  const t = tokens.find((x) => x.id === r.token)!;
  const place = r.blocked_at ? placeName(edited, r.blocked_at) : '';
  const lower = place.charAt(0).toLowerCase() + place.slice(1);
  if (r.reason === 'too_narrow' && r.needed !== null && r.available !== null) {
    return `The ${name(t.id).toLowerCase()} is ${m(r.needed)} wide. The ${lower} is ${m(r.available)}.`;
  }
  if (r.reason === 'no_support') return `The load at ${lower} has no path to the ground.`;
  if (r.reason === 'step') return `There is a ${r.available !== null ? `${m(r.available)} ` : ''}step at the ${lower}.`;
  if (r.reason === 'cannot_turn') return `The ${name(t.id).toLowerCase()} cannot turn at the ${lower}.`;
  const why = r.reason ? REASON_TEXT[r.reason] : 'blocked';
  return place ? `Blocked at the ${lower}: ${why}.` : `${title(t.id)}: ${why}. The solver has no rule for it yet.`;
}

// ---------- Render ----------

function render(): void {
  const { screen } = flow;
  const conflict = flow.conflict.length > 0;
  document.body.dataset.screen = screen;
  viewerBox.dataset.view = viewFor(screen);
  renderHud(conflict);
  renderBar();
  renderCard();
  renderDialog();
  const hint = $('hint');
  hint.hidden = screen !== 'start';
  const fromData = flow.results?.some((r) => r.source === 'expected') ?? false;
  $('source').hidden = !fromData;
}

function renderHud(conflict: boolean): void {
  const sel = tokens.find((t) => t.id === flow.selected);
  $('where').textContent = sel ? objectFacts(building, sel).where : '432 Park Avenue';
  $('pips').replaceChildren(
    ...tokens.map((t) => {
      const r = flow.results?.find((x) => x.token === t.id);
      const cls = r ? (r.status === 'pass' ? 'pip ok' : 'pip bad') : 'pip';
      return h('span', { class: cls, title: `${title(t.id)}: ${r ? (r.status === 'pass' ? 'escaped' : 'blocked') : 'not run'}` });
    }),
  );
  $('count').textContent = `${escapedCount(flow.results)}/${tokens.length}`;
  const badge = badgeFor(flow.screen, conflict);
  const b = $('badge');
  b.textContent = badge;
  b.className = `b ${badge === 'BLOCKED' || badge === 'CONFLICT' ? 'b-bad' : badge === 'COMPLETE' || badge === 'ESCAPED' ? 'b-ok' : 'b-acc'}`;
  const view = viewFor(flow.screen);
  $('views').replaceChildren(
    ...VIEWS.map((v) => h('span', { class: v === view ? 'on' : '', 'aria-current': v === view ? 'true' : 'false' },
      v === 'xray' ? 'X-RAY' : v.toUpperCase())),
  );
}

function renderBar(): void {
  const p = $('primary') as HTMLButtonElement;
  const { screen } = flow;
  p.className = 'esc';
  p.disabled = false;
  if (screen === 'start') {
    p.textContent = 'CHOOSE OBJECT';
    p.classList.add('pulse', 'small');
  } else {
    p.textContent = 'ESCAPE!';
    if (screen === 'ready') p.classList.add('pulse');
    else if (screen === 'clash' || screen === 'result') p.classList.add('quiet');
    else p.disabled = true;
  }
  const reset = $('reset') as HTMLButtonElement;
  reset.disabled = flow.game.edits.length === 0 && flow.results === null;
}

function card(alert = false, ...children: Child[]): void {
  const c = $('card');
  c.className = `card glass${alert ? ' alert' : ''}`;
  c.hidden = false;
  c.replaceChildren(...children.filter(Boolean) as (Node | string)[]);
}

function renderCard(): void {
  const c = $('card');
  const { screen, selected } = flow;
  const sel = tokens.find((t) => t.id === selected);
  const edited = run(building, flow.game).building;
  if (screen === 'exits' && sel) {
    const exits = exitsFor(building, sel);
    return card(false,
      h('div', { class: 'step' }, `STEP 2 OF 2 · ${name(sel.id)}`),
      h('div', { class: 'ttl' }, 'Where can it leave?'),
      ...exits.map((x) => h('div', { class: 'ocard on' }, h('span', { class: 'chk on' }, '✓'),
        h('div', { class: 'who' }, h('b', {}, x.name.toUpperCase()), h('span', {}, x.note)))),
      h('p', { class: 'p muted' }, 'Exits come from building.json. Choosing other exits needs more exits per object in the data.'),
      h('div', { class: 'row2' }, btn('Back', 'glass', () => go('select')), btn('Confirm', 'fill', () => go('ready'))),
    );
  }
  if (screen === 'ready' && sel) {
    const exit = exitsFor(building, sel)[0];
    return card(false,
      h('div', { class: 'lbl' }, 'Ready to run'),
      h('div', { class: 'ttl' }, `${title(sel.id)} → ${exit?.name ?? 'exit'}`),
      h('p', { class: 'p muted' }, `The building is x-rayed so you can see the ${name(sel.id).toLowerCase()} and its exit.`),
      h('div', { class: 'row2' }, btn('Change object', 'glass', () => go('select')), btn('Change exit', 'glass', () => go('exits'))),
      h('div', { class: 'keys' }, 'E or Space: ESCAPE!'),
    );
  }
  if (screen === 'clash' || (screen === 'result' && flow.conflict.length > 0)) {
    const r = screen === 'clash' ? flow.results?.find((x) => x.token === selected) : flow.conflict[0];
    if (r) return blockedCard(r, edited);
  }
  if (screen === 'result' && sel) {
    const next = flow.results ? nextBlocked(flow.results) : null;
    return card(false,
      h('div', { class: 'lbl' }, `${title(sel.id)} · escaped`),
      h('div', { class: 'ttl' }, `${title(sel.id)} is out`),
      h('p', { class: 'p muted' }, `${escapedCount(flow.results)} of ${tokens.length} objects escape. Pick the next one.`),
      btn('Choose next object', 'fill', () => go('select', { selected: next ?? selected })),
    );
  }
  if (screen === 'proposal' && sel && flow.fix) return proposalCard(sel.id, flow.fix);
  c.hidden = true;
  c.replaceChildren();
}

function blockedCard(r: Answer, edited: Building): void {
  const place = r.blocked_at ? placeName(edited, r.blocked_at) : 'No route';
  // Needs and has only where they are sizes; a step reads better as one number in the sentence.
  const nums = r.needed !== null && r.available !== null && (r.reason === 'too_narrow' || r.reason === 'too_low');
  const offer = (): void => go('fallback', { selected: r.token });
  card(true,
    h('div', { class: 'lbl' }, `${title(r.token)} · ${place}`),
    h('div', { class: 'ttl bad' }, r.reason ? HEADLINE[r.reason] : 'Blocked'),
    h('p', { class: 'p' }, sentence(r, edited)),
    nums && h('div', { class: 'nums' },
      h('div', { class: 'num' }, h('span', { class: 'lbl' }, 'Needs'), h('b', {}, m(r.needed!))),
      h('div', { class: 'num bad' }, h('span', { class: 'lbl' }, 'Has'), h('b', {}, m(r.available!)))),
    JEV_CONNECTED ? btn('Ask Jev for a fix', 'tint', offer) : btn('Pick a fix', 'tint', offer),
    !JEV_CONNECTED && h('div', { class: 'keys' }, 'Jev is not connected yet: preset fixes from the demo.'),
  );
}

function proposalCard(token: Id, fix: Edit): void {
  const now = solveNow(flow.game.edits).results;
  const dry = solveNow([...flow.game.edits, fix]);
  const breaks = newlyBlocked(now, dry.results) as Answer[];
  card(false,
    h('div', { class: 'lbl' }, `Fix for ${title(token)} · ${JEV_CONNECTED ? 'from Jev' : 'preset'}`),
    h('div', { class: 'opt on' }, h('span', { class: 'dot' }), h('b', {}, editLabel(building, fix))),
    h('p', { class: 'p muted' }, 'Apply it, then the run plays again with the change in place.'),
    ...breaks.map((b) => h('div', { class: 'callout' },
      'Also blocks ', h('b', {}, title(b.token)),
      b.blocked_at ? ` at ${placeName(dry.edited, b.blocked_at)}` : '',
      b.reason ? `: ${REASON_TEXT[b.reason]}.` : '.')),
    h('div', { class: 'row2' }, btn('Cancel', 'glass', () => go(flow.back, { fix: null })), btn('Apply', 'fill', () => apply(fix))),
  );
}

function dialog(cls: string, ...children: Child[]): void {
  const d = $('dialog');
  d.className = `dlg glass ${cls}`;
  d.hidden = false;
  $('scrim').hidden = false;
  d.replaceChildren(...children.filter(Boolean) as (Node | string)[]);
  const focus = d.querySelector<HTMLElement>('[data-focus]') ?? d.querySelector<HTMLElement>('button');
  focus?.focus();
}

function renderDialog(): void {
  const { screen, selected } = flow;
  if (screen === 'select') {
    return dialog('wide',
      h('div', { class: 'step' }, 'STEP 1 OF 2'),
      h('div', { class: 'ttl', id: 'dlg-title' }, 'Which object needs to get out?'),
      ...tokens.map((t, i) => {
        const f = objectFacts(building, t);
        const r = flow.results?.find((x) => x.token === t.id);
        const on = t.id === selected;
        const card = h('button', { type: 'button', class: `ocard${on ? ' on' : ''}`, 'aria-pressed': String(on), ...(on ? { 'data-focus': '' } : {}) },
          tile(t.id),
          h('span', { class: 'who' }, h('b', {}, f.name), h('span', {}, f.line)),
          r && h('span', { class: `b ${r.status === 'pass' ? 'b-ok' : 'b-bad'}` }, r.status === 'pass' ? '✓ ESCAPED' : '✕ BLOCKED'),
          h('kbd', {}, String(i + 1)),
        );
        card.addEventListener('click', () => select(t.id));
        card.addEventListener('dblclick', () => go('exits', { selected: t.id }));
        return card;
      }),
      h('div', { class: 'row2' },
        btn('Cancel', 'glass', () => go(flow.results ? 'result' : 'start')),
        btn('Next', `fill${selected ? '' : ' off'}`, () => selected && go('exits'))),
    );
  }
  if (screen === 'fallback' && selected) {
    const fixes = fixesFor(buttons, relevantTargets(building, expected, selected), flow.game.edits);
    return dialog('mid',
      h('div', { class: 'callout info' }, `${JEV_CONNECTED ? 'Jev is unavailable.' : 'Jev is not connected yet.'} Pick a fix for the ${name(selected).toLowerCase()}.`),
      ...fixes.map((b) => {
        const o = h('button', { type: 'button', class: 'ocard' }, h('span', { class: 'chk' }),
          h('span', { class: 'who' }, h('b', {}, b.label.toUpperCase()), h('span', {}, 'From the full-demo case in expected.json')));
        o.addEventListener('click', () => go('proposal', { fix: b.edit, back: 'fallback' }));
        return o;
      }),
      fixes.length === 0 && h('p', { class: 'p' }, 'No preset fix for this object.'),
      h('p', { class: 'p muted' }, 'Only fixes for the selected object are listed.'),
      h('div', { class: 'row2' }, btn('Cancel', 'glass', backFromFix, { 'data-focus': '' })),
    );
  }
  if (screen === 'complete' && flow.showDialog) {
    return dialog('wide center',
      h('div', { class: 'win' }, 'LEVEL', h('br'), 'COMPLETE'),
      h('div', { class: 'score' }, `${tokens.length}/${tokens.length} escaped · ${flow.game.edits.length} edit${flow.game.edits.length === 1 ? '' : 's'}`),
      h('p', { class: 'p muted' }, flow.game.edits.map((e) => editLabel(building, e)).join(' · ') || 'No edits needed'),
      h('div', { class: 'row2 narrow' },
        btn('View building', 'glass', () => { flow = { ...flow, showDialog: false }; render(); }),
        btn('Replay', 'fill', replay, { 'data-focus': '' })),
    );
  }
  if (screen === 'reset') {
    const n = flow.game.edits.length;
    return dialog('small',
      h('div', { class: 'ttl' }, 'Reset the building?'),
      h('p', { class: 'p' }, `This removes ${n} edit${n === 1 ? '' : 's'} and puts the original building back. Results are cleared.`),
      h('div', { class: 'row2' }, btn('Keep editing', 'glass', () => go(flow.back), { 'data-focus': '' }), btn('Reset', 'danger', replay)),
      h('div', { class: 'keys' }, 'Esc keeps editing'),
    );
  }
  $('dialog').hidden = true;
  $('scrim').hidden = true;
}

function showBanner(on: boolean): void {
  const b = $('banner');
  if (!on) {
    b.hidden = true;
    return;
  }
  const r = flow.conflict[0];
  b.replaceChildren(h('span', { class: 'pix bad' }, 'CONFLICT!'),
    h('span', {}, `${title(flow.selected)} escaped. `, h('b', {}, title(r?.token ?? null)), ' is now blocked.'));
  b.hidden = false;
}

// ---------- Controls ----------

$('primary').addEventListener('click', () => (flow.screen === 'start' ? go('select', { selected: flow.selected ?? tokens[0]?.id ?? null }) : escape()));
$('reset').addEventListener('click', openReset);

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const { screen } = flow;
  if (e.key === 'Escape') {
    if (screen === 'select') go(flow.results ? 'result' : 'start');
    else if (screen === 'exits') go('select');
    else if (screen === 'ready') go('select');
    else if (screen === 'proposal' || screen === 'reset') go(flow.back, { fix: null });
    else if (screen === 'fallback') backFromFix();
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= tokens.length && (screen === 'start' || screen === 'select' || screen === 'result')) {
    go('select', { selected: tokens[n - 1]!.id });
    return;
  }
  if (e.key === 'Enter' && screen === 'select' && flow.selected && !(e.target instanceof HTMLButtonElement)) go('exits');
  if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && (screen === 'ready' || screen === 'clash' || screen === 'result')) {
    e.preventDefault();
    escape();
  }
});

viewer.show(building, []);
render();
