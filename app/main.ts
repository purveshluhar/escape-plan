// App entry, design B (daylight model, spatial glass): place objects from the dock (click a chip,
// or drag it onto any floor), move them by dragging on the model, press Escape!, read PASS or FAIL
// in the summary pill, and apply a fix from the sheet or the edit box.
// Every fix re-solves the placed objects. Owner: P3. The logic lives in shell.ts, state.ts,
// answers.ts, flow.ts and scoreboard.ts (tested in Node); this file only draws and wires it.
import * as THREE from 'three';
import buildingJson from '../data/building.json';
import expectedJson from '../data/expected.json';
import { coveredNodes } from '../data/typical-floors.ts';
import { loadTypicalFloor } from '../data/typical-floors-load.ts';
import type { Building, Edit, ExpectedFile, Id } from '../contract/types.ts';
import { MOTION } from '../design/tokens.ts';
import { IMPLEMENTED_RULES } from '../solver/index.ts';
import { movedPastSlop, stepLevel } from '../viewer/drop.ts';
import { createViewer } from '../viewer/index.ts';
import { answers, relevantTargets } from './answers.ts';
import { cutHeight } from './backdrop.ts';
import { loadBackdrop, setCutHeight } from './backdrop-load.ts';
import { MVP_TOKENS, mvpButtons } from './mvp.ts';
import type { Answer } from './answers.ts';
import { fixesFor } from './flow.ts';
import { REASON_TEXT, numbersText, placeName } from './scoreboard.ts';
import {
  PHASE_WORD, countText, dropPlaced, parkedResults, parseEdit, phaseAfterRun, pickerItems, runSeconds, togglePlaced, tokenCaption, withStarts,
} from './shell.ts';
import type { ParseOutcome, Phase, PickItem } from './shell.ts';
import { applyEdit, demoButtons, editLabel, initialState, isApplied, run } from './state.ts';
import type { GameState } from './state.ts';

// The MVP game: wheelchair, sofa and people (mvp.ts). The dock offers only these.
const building = buildingJson as Building;
const expected = expectedJson as ExpectedFile;
const buttons = mvpButtons(building, demoButtons(building, expected));
const items = pickerItems(building, MVP_TOKENS);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

interface State {
  phase: Phase;
  placed: Id[]; // in building order
  starts: Map<Id, Id>; // token -> the node it was dropped on; a token not here starts in its own room
  selected: Id | null; // the placed object clicked or dropped last
  game: GameState; // applied edits
  results: Answer[] | null; // last Escape! run, placed objects only
  note: string; // live-region line: "Re-solved after ..."
  editOpen: boolean;
  jev: { text: string; out: ParseOutcome } | null; // a typed edit that was not clear enough
  scoreOpen: boolean;
}

const S: State = {
  phase: 'empty', placed: [], starts: new Map(), selected: null, game: initialState(), results: null, note: '', editOpen: false, jev: null, scoreOpen: false,
};

const $ = (id: string): HTMLElement => document.getElementById(id)!;
// On a wide screen the fix sheet and the edit box sit on the right, so the model centres left of them.
const SIDE_PANEL = 404; // #sheet width (380) + its 24 px gutter
const viewer = createViewer($('viewer'), {
  onZoom: (zoom) => setCutHeight(cutHeight(zoom)),
  onDrop: (token, node) => moveTo(token, node),
  onRefuse: (token) => {
    const what = S.placed.includes(token) ? 'not moved' : 'not placed';
    S.note = `${itemOf(token).label} ${what}: drop it on a floor of the tower`;
    render();
  },
  onSelect: (token) => {
    S.selected = token;
    // The caption on the model is inside the 3D view, which screen readers skip; say it here too.
    if (token !== null && S.placed.includes(token)) S.note = tokenCaption(edited(), token, resultOf(token));
    render();
  },
});
// Frame the slice, not the whole tower, from the first frame on: the tower's nodes are never drawn,
// so framing them shows an empty 424 m view until (or unless) the real floors load.
viewer.setCovered(coveredNodes(building));
// The model centres in the whole view, and moves left of the fix sheet only when a run has failures
// (the sheet floats on the right on wider screens; on phones it sits at the bottom).
const insetFor = (results: readonly Answer[]): number =>
  innerWidth > 700 && results.some((r) => r.status === 'fail') ? SIDE_PANEL : 0;
let runTimer = 0;

// ---------- Small DOM helper (textContent only, never innerHTML) ----------

type Child = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

function btn(label: Child | Child[], cls: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls, ...attrs }, ...(Array.isArray(label) ? label : [label])) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

const itemOf = (id: Id): PickItem => items.find((i) => i.token === id)!;
function dot(item: PickItem, small = false): HTMLElement {
  return h('span', {
    class: `dot${small ? ' sm' : ''}`, 'aria-hidden': 'true', style: `--c:${item.color};--gi:${item.glyphInk}`,
  }, item.glyph);
}
const word = (r: Answer | null | undefined, running = false): HTMLElement => r
  ? h('b', { class: `word ${r.status}` }, r.status === 'pass' ? 'PASS' : 'FAIL')
  : h('span', { class: 'word ready' }, running ? '...' : 'Ready');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- Solving ----------

// The building as played: each dropped object starts in the node it was dropped on.
function played(): Building {
  return withStarts(building, S.starts);
}

function edited(): Building {
  return run(played(), S.game).building;
}

function solvePlaced(): { edited: Building; results: Answer[] } {
  const start = played();
  const { building: b, results } = run(start, S.game);
  const all = answers(start, b, S.game.edits, results, expected, IMPLEMENTED_RULES);
  return { edited: b, results: all.filter((r) => S.placed.includes(r.token)) };
}

// Show the building as it is now, with no run on it: placed objects wait in their start rooms.
function idle(): void {
  window.clearTimeout(runTimer);
  viewer.setInsetRight(0);
  viewer.show(edited(), parkedResults(S.placed));
}

function escape(): void {
  if (S.placed.length === 0 || S.phase === 'running') return;
  const { edited: b, results } = solvePlaced();
  S.results = results;
  S.scoreOpen = false;
  viewer.setInsetRight(insetFor(results));
  viewer.show(b, results);
  window.clearTimeout(runTimer);
  if (REDUCE) {
    S.phase = phaseAfterRun(results);
  } else {
    S.phase = 'running';
    const ms = runSeconds(results.length, MOTION.secondsPerToken, MOTION.staggerSeconds) * 1000;
    runTimer = window.setTimeout(() => {
      S.phase = phaseAfterRun(results);
      render();
    }, ms);
  }
  render();
}

// ---------- Actions ----------

function place(id: Id): void {
  if (S.phase === 'running') return;
  S.placed = togglePlaced(building, S.placed, id);
  if (S.placed.includes(id)) S.selected = id;
  else {
    S.starts.delete(id); // placed again with a click, it starts in its own room
    if (S.selected === id) S.selected = null;
  }
  S.results = null;
  S.note = '';
  S.phase = S.placed.length ? 'placed' : 'empty';
  idle();
  render();
}

// A drop on the model (or an arrow key): the object starts in `node` and waits there for Escape!,
// like a placement from the dock. The last run's results no longer hold, so they are cleared.
function moveTo(id: Id, node: Id): void {
  if (S.phase === 'running') return;
  S.starts.set(id, node);
  S.placed = dropPlaced(building, S.placed, id);
  S.selected = id;
  S.results = null;
  S.note = `${itemOf(id).label} placed in ${placeName(building, node)}`;
  S.phase = 'placed';
  idle();
  render();
}

function applyFix(edit: Edit, label: string): void {
  if (S.phase === 'running') return;
  S.game = applyEdit(S.game, edit);
  S.editOpen = false;
  S.jev = null;
  ($('editInput') as HTMLInputElement).value = '';
  S.note = `Re-solved after ${label}`;
  if (S.placed.length) escape();
  else {
    idle();
    render();
  }
}

function reset(): void {
  if (S.phase === 'running' || S.game.edits.length === 0) return;
  S.game = initialState();
  S.note = 'Re-solved after Reset (back to building.json)';
  if (S.results && S.placed.length) escape();
  else {
    idle();
    render();
  }
}

function clear(): void {
  if (S.phase === 'running') return;
  S.placed = [];
  S.starts.clear();
  S.selected = null;
  S.results = null;
  S.note = '';
  S.phase = 'empty';
  idle();
  render();
}

function openEdit(): void {
  if (S.phase === 'running') return;
  S.editOpen = true;
  render();
  $('editInput').focus();
}

function closeEdit(): void {
  S.editOpen = false;
  S.jev = null;
  render();
}

function submitText(text: string): void {
  // Jev is not connected yet, so typed edits go through plan C (shell.ts parseEdit), which returns
  // the same JevParse shape. A sure parse applies at once; anything else asks "Did you mean".
  const out = parseEdit(text, buttons);
  if (out.edit) applyFix(out.edit, editLabel(building, out.edit));
  else {
    S.jev = { text, out };
    render();
  }
}

// ---------- Render ----------

// A placed object's answer from the last run, once its walk has finished playing.
function resultOf(id: Id): Answer | null {
  const done = S.phase === 'result' || S.phase === 'complete';
  return done && S.results ? S.results.find((r) => r.token === id) ?? null : null;
}

function render(): void {
  const running = S.phase === 'running';
  const resOf = resultOf;

  // Picker chips
  for (const b of $('picker').querySelectorAll<HTMLButtonElement>('.chip')) {
    b.setAttribute('aria-pressed', String(S.placed.includes(b.dataset.token!)));
    b.disabled = running;
  }
  viewer.setDragEnabled(!running);

  // Dock tools
  const esc = $('btnEscape') as HTMLButtonElement;
  esc.disabled = running || S.placed.length === 0;
  if (S.placed.length) esc.removeAttribute('aria-describedby');
  else esc.setAttribute('aria-describedby', 'escHint');
  const n = S.game.edits.length;
  const rb = $('btnReset') as HTMLButtonElement;
  rb.disabled = running || n === 0;
  rb.replaceChildren(n ? `Reset (${n}) ` : 'Reset ', h('kbd', {}, 'R'));
  rb.setAttribute('aria-label', n ? `Reset, ${plural(n, 'edit')} applied` : 'Reset');
  ($('btnClear') as HTMLButtonElement).disabled = running || S.placed.length === 0;
  ($('btnEdit') as HTMLButtonElement).disabled = running;
  const dock = $('dock');
  const wasSlim = dock.classList.contains('slim');
  dock.classList.toggle('slim', running);
  if (wasSlim !== running && !REDUCE) {
    dock.classList.remove('pop');
    void dock.offsetWidth;
    dock.classList.add('pop');
  }
  $('slimText').textContent = `Running - ${plural(S.placed.length, 'object')} escaping`;

  // Summary pill
  const sm = $('summary') as HTMLButtonElement;
  const line = h('span', { class: 'sline' }, h('span', { class: 'phase' }, PHASE_WORD[S.phase]),
    h('span', { class: 'vbar' }), h('span', { class: 'count num' }, countText(S.phase, S.placed.length, S.results)));
  const chips = S.placed.length
    ? [h('span', { class: 'schips' }, ...S.placed.map((id) => h('span', { class: 'schip' }, dot(itemOf(id), true), word(resOf(id), running)))),
      h('span', { class: 'caret', 'aria-hidden': 'true' })]
    : [];
  sm.replaceChildren(line, ...chips);
  sm.disabled = S.phase === 'empty';
  sm.setAttribute('aria-expanded', String(S.scoreOpen));
  sm.setAttribute('aria-label', `Scoreboard: ${sm.textContent?.replace(/\s+/g, ' ').trim() ?? ''}`);

  // Scoreboard rows
  const b = edited();
  const sp = $('scorePanel');
  sp.classList.toggle('open', S.scoreOpen && S.placed.length > 0);
  document.body.classList.toggle('scoring', S.scoreOpen);
  sp.replaceChildren(...S.placed.map((id) => {
    const r = resOf(id);
    const token = b.tokens.find((t) => t.id === id)!;
    const det = !r ? `Starts in ${placeName(b, token.start)}`
      : r.status === 'pass' ? `Out via ${r.path.map((p) => placeName(b, p)).join(', ')}`
      : failLine(r, b);
    return h('div', { class: 'srow', tabindex: '0' }, dot(itemOf(id)), h('span', { class: 'nm' }, itemOf(id).label), word(r), h('span', { class: 'det num' }, det));
  }));

  // Live note and LEVEL COMPLETE
  $('note').textContent = S.note;
  $('banner').classList.toggle('on', S.phase === 'complete');
  $('bannerSub').textContent = `${S.placed.length} of ${S.placed.length} out with ${plural(n, 'edit')}`;

  renderSheet(b);
  renderEdit();
  const sel = S.selected !== null && S.placed.includes(S.selected) ? S.selected : null;
  viewer.select(sel, sel === null ? null : tokenCaption(b, sel, resOf(sel), running));
}

function failLine(r: Answer, b: Building): string {
  const why = r.reason ? REASON_TEXT[r.reason] : 'blocked';
  const at = r.blocked_at ? ` at ${placeName(b, r.blocked_at)}` : '';
  const nums = numbersText(r);
  return `${cap(why)}${at}${nums ? ` - ${nums}` : ''}`;
}

// One card per failed object: verdict, reason, numbers and the demo fixes that matter to it.
function renderSheet(b: Building): void {
  const sheet = $('sheet');
  const fails = S.phase === 'result' && S.results ? S.results.filter((r) => r.status === 'fail') : [];
  sheet.classList.toggle('on', fails.length > 0 && !S.editOpen);
  if (fails.length === 0) return sheet.replaceChildren();
  const cards: HTMLElement[] = fails.map((r) => fixCard(r, b));
  sheet.replaceChildren(
    h('div', { class: 'lbl' }, 'Fix it'),
    ...cards,
    h('div', { class: 'foot' },
      btn('Type an edit', 'fixbtn ghost', openEdit),
      btn('Reset', 'fixbtn ghost', reset, S.game.edits.length ? {} : { disabled: '' })),
  );
}

function fixCard(r: Answer, b: Building): HTMLElement {
  const it = itemOf(r.token);
  // The buttons for where it is stuck now, and for anything expected.json says it gets stuck at.
  // expected.json knows only the start rooms, so a dropped object gets the buttons for where it is stuck now.
  const moved = played().tokens.find((t) => t.id === r.token)?.start !== building.tokens.find((t) => t.id === r.token)?.start;
  const targets = moved ? new Set<Id>() : relevantTargets(building, expected, r.token);
  if (r.blocked_at) targets.add(r.blocked_at);
  const fixes = fixesFor(buttons, targets, S.game.edits);
  const why = r.reason ? cap(REASON_TEXT[r.reason]) : 'Blocked';
  const nums = numbersText(r);
  return h('div', { class: 'fcard', role: 'group', 'aria-label': `${it.label} failed` },
    h('div', { class: 'top' }, dot(it), h('span', { class: 'nm' }, it.label), h('span', { class: 'word fail' }, 'FAIL')),
    h('div', { class: 'rs' }, why, r.blocked_at && h('span', {}, ` at ${placeName(b, r.blocked_at)}`)),
    nums && h('div', { class: 'nb num' }, cap(nums)),
    fixes.length === 0 && h('div', { class: 'none' }, 'No preset fix for this object.'),
    // "More fixes" opens every preset fix and the text box: in play tests it was the first move
    // after reading a failure, so it sits on each card, not only at the foot of the sheet.
    h('div', { class: 'fx', role: 'group', 'aria-label': `Fix for ${it.label}` },
      ...fixes.map((f) => btn(f.label, 'fixbtn', () => applyFix(f.edit, f.label))),
      btn('More fixes', 'morebtn', openEdit, { 'aria-label': `More fixes for ${it.label}` })),
  );
}

function renderEdit(): void {
  document.body.classList.toggle('editing', S.editOpen);
  const ep = $('editPanel');
  ep.classList.toggle('open', S.editOpen);
  ep.classList.toggle('err', S.jev !== null);
  $('quick').replaceChildren(
    ...buttons.map((f) => {
      const on = isApplied(S.game, f.edit);
      return btn(on ? `Applied: ${f.label}` : f.label, 'fixbtn', () => applyFix(f.edit, f.label), { 'aria-pressed': String(on) });
    }),
    btn('Reset', 'fixbtn ghost', reset, S.game.edits.length ? {} : { disabled: '' }),
  );
  const jev = $('jev');
  jev.classList.toggle('on', S.jev !== null);
  if (!S.jev) return jev.replaceChildren();
  const { text, out } = S.jev;
  jev.replaceChildren(
    h('div', { class: 'q' }, 'Not sure what you meant by ', h('b', {}, `"${text}"`), '.'),
    h('div', { class: 'dym' }, 'Did you mean'),
    h('div', { class: 'opts' },
      ...out.suggestions.filter((f) => !isApplied(S.game, f.edit)).map((f) => btn(f.label, 'fixbtn', () => applyFix(f.edit, f.label))),
      btn('Cancel', 'fixbtn ghost', () => {
        S.jev = null;
        render();
        $('editInput').focus();
      })),
    h('div', { class: 'src' }, 'Typed edits use the keyword parser until Jev is connected.'),
  );
}

// ---------- Build the dock once ----------

// A click on a chip places the object in its own start room (a second click takes it off); a drag
// from a chip carries it onto the model, where the viewer drops it on the floor under the pointer.
let chipPress: { id: Id; pointerId: number; x: number; y: number } | null = null;
let dragged = false; // the click that ends a chip drag is not a placement
for (const it of items) {
  const id = it.token;
  const b = btn([dot(it), h('span', {}, it.label), it.key ? h('kbd', {}, String(it.key)) : null], 'chip', () => {
    if (dragged) dragged = false;
    else place(id);
  }, {
    'data-token': id, 'aria-pressed': 'false', title: 'Click to place, or drag onto a floor. Arrow up or down moves the selected object a floor.',
    ...(it.key ? { 'aria-keyshortcuts': String(it.key) } : {}),
  });
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || b.disabled) return;
    chipPress = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    dragged = false;
  });
  $('picker').append(b);
}
window.addEventListener('pointermove', (e) => {
  if (!chipPress || e.pointerId !== chipPress.pointerId || !movedPastSlop(e.clientX - chipPress.x, e.clientY - chipPress.y)) return;
  viewer.startDrag(chipPress.id, e);
  dragged = true;
  chipPress = null;
});
window.addEventListener('pointercancel', () => (chipPress = null));
window.addEventListener('pointerup', () => {
  chipPress = null;
  // A drag let go off its chip fires no click there, so nothing is left to swallow.
  window.setTimeout(() => (dragged = false), 0);
});

// ---------- Controls ----------

$('btnEscape').addEventListener('click', escape);
$('btnReset').addEventListener('click', reset);
$('btnClear').addEventListener('click', clear);
$('btnEdit').addEventListener('click', () => (S.editOpen ? closeEdit() : openEdit()));
$('editClose').addEventListener('click', closeEdit);
$('summary').addEventListener('click', () => {
  S.scoreOpen = !S.scoreOpen;
  render();
});
$('editForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = ($('editInput') as HTMLInputElement).value.trim();
  if (text) submitText(text);
});

document.addEventListener('keydown', (ev) => {
  const typing = ev.target instanceof HTMLInputElement;
  if (ev.key === 'Escape') {
    if (S.editOpen) closeEdit();
    else if (S.scoreOpen) {
      S.scoreOpen = false;
      render();
    } else if (S.selected !== null) {
      S.selected = null;
      render();
    }
    return;
  }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const onBtn = ev.target instanceof HTMLButtonElement;
  const k = Number(ev.key);
  const hit = items.find((i) => i.key === k);
  if (hit?.token) return place(hit.token);
  // Space is always Escape! (outside the text box); Enter is Escape! unless a button has focus.
  if (ev.key === ' ' || (ev.key === 'Enter' && !onBtn)) {
    ev.preventDefault();
    return escape();
  }
  if (ev.key === 'r' || ev.key === 'R') return reset();
  // The keyboard way to drag: arrow up or down moves the selected object one floor. Only with focus
  // on the page or the dock, so the arrows still scroll a panel or move inside one.
  const free = ev.target === document.body || (ev.target instanceof Element && ev.target.closest('#picker') !== null);
  if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && free && S.selected !== null && S.placed.includes(S.selected)) {
    ev.preventDefault();
    if (S.phase === 'running') return;
    const up = ev.key === 'ArrowUp';
    const from = played().tokens.find((t) => t.id === S.selected)?.start;
    const to = from === undefined ? null : stepLevel(building, from, up ? 1 : -1);
    if (to !== null) return moveTo(S.selected, to);
    S.note = `${itemOf(S.selected).label} is already on the ${up ? 'top' : 'bottom'} floor`;
    render();
    return;
  }
  if (ev.key === '/') {
    ev.preventDefault();
    openEdit();
  }
});

idle();
render();

// The Cityweft block and the real 432 Park typical floor, each only when this machine has the files
// (data/README.md). No ground otherwise; the graph's rooms are never drawn as boxes, and the viewer draws no grid.
Promise.all([
  loadBackdrop().catch((err: unknown) => (console.warn('Cityweft backdrop not loaded:', err), null)),
  loadTypicalFloor().catch((err: unknown) => (console.warn('Typical floor not loaded:', err), null)),
]).then(([block, floor]) => {
  if (!block && !floor) return;
  const context = new THREE.Group();
  if (block) context.add(block);
  if (floor) {
    floor.place(building);
    context.add(floor.object);
  }
  viewer.setBackdrop(context);
});
