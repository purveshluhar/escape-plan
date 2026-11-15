// App entry, design B (daylight model, spatial glass): ask a question from the dock (click a chip,
// or drag it onto any floor), move it by dragging on the model, press Show me, read Yes or No
// in the summary pill, and apply a fix from the sheet or the edit box. Words: design/copy.md.
// Every fix re-solves the placed objects. Owner: P3. The logic lives in shell.ts, state.ts,
// answers.ts, flow.ts and scoreboard.ts (tested in Node); this file only draws and wires it.
import * as THREE from 'three';
import buildingJson from '../data/building.json';
import expectedJson from '../data/expected.json';
import { coveredNodes, drawnLevels } from '../data/typical-floors.ts';
import { loadTypicalFloor, type TypicalFloor } from '../data/typical-floors-load.ts';
import type { Building, Edit, ExpectedFile, Id } from '../contract/types.ts';
import { MOTION } from '../design/tokens.ts';
import { IMPLEMENTED_RULES } from '../solver/index.ts';
import { isMemberStart, movedPastSlop, stepLevel } from '../viewer/drop.ts';
import { createViewer } from '../viewer/index.ts';
import { stayText } from '../viewer/labels.ts';
import { answers, relevantTargets } from './answers.ts';
import { cutHeight } from './backdrop.ts';
import { dimBlock, loadBackdrop, setCutHeight } from './backdrop-load.ts';
import { MVP_TOKENS, mvpButtons } from './mvp.ts';
import type { Answer } from './answers.ts';
import { conflictOf } from './conflict.ts';
import type { Conflict } from './conflict.ts';
import { fixesFor } from './flow.ts';
import { REASON_TEXT, numbersText, placeName, stuckLine } from './scoreboard.ts';
import { allYesText, questionOf, routeShown, yesLine } from './questions.ts';
import {
  countText, dropPlaced, showMeKey, parkedResults, phaseAfterRun, pickerItems, runSeconds, togglePlaced, phaseWord, tokenCaption, withStarts,
} from './shell.ts';
import type { Phase, PickItem } from './shell.ts';
import { readEdit } from './parse-client.ts';
import type { Reading } from './parse-client.ts';
import { findHint, hintModel } from './hint.ts';
import type { HintResult } from './hint.ts';
import { renderHint, stackAbove } from './hint-view.ts';
import { answerLines } from './strip.ts';
import { renderStrip } from './strip-view.ts';
import { applyEdit, demoButtons, editLabel, initialState, isApplied, run } from './state.ts';
import type { GameState } from './state.ts';

// The MVP questions: wheelchair, sofa, people, chiller and load (mvp.ts). The dock offers only these.
const building = buildingJson as Building;
const expected = expectedJson as ExpectedFile;
const buttons = mvpButtons(building, demoButtons(building, expected));
// Typed edits are read against every demo fix, so "widen shaft 2.0" and "transfer beam" are known.
const typedFixes = demoButtons(building, expected);
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
  read: Reading | null; // the last typed edit, shown in the "who decided" strip
  reading: string | null; // a typed edit still being read
  solveMs: number | null;
  scoreOpen: boolean;
  conflict: Conflict | null; // what the last edit turned from Yes to No, shown on the fix sheet
  hint: { token: Id; result: HintResult; run: Answer[] } | null; // good only for the run it was asked about
}

const S: State = {
  phase: 'empty', placed: [], starts: new Map(), selected: null, game: initialState(), results: null, note: '', editOpen: false, read: null, reading: null, solveMs: null, scoreOpen: false, conflict: null, hint: null,
};

const $ = (id: string): HTMLElement => document.getElementById(id)!;
// On a wide screen the fix sheet and the edit box sit on the right, so the model centres left of them.
const SIDE_PANEL = 404; // #sheet width (380) + its 24 px gutter
// The loaded city and real floors (null until they load) and the viewer's last reveal, so floors
// that load after a zoom in still get it.
const context3d = { block: null as THREE.Object3D | null, floor: null as TypicalFloor | null, amount: 0, cut: Infinity, dimmed: 0 };
const applyReveal = (): void => {
  context3d.floor?.reveal(context3d.amount, context3d.cut);
  if (context3d.block && context3d.amount !== context3d.dimmed) dimBlock(context3d.block, context3d.amount);
  context3d.dimmed = context3d.amount;
};
const viewer = createViewer($('viewer'), {
  onZoom: (zoom) => setCutHeight(cutHeight(zoom)),
  onReveal: (amount, cut) => {
    Object.assign(context3d, { amount, cut });
    applyReveal();
  },
  avoid: () => [$('banner')],
  onDrop: (token, node) => moveTo(token, node),
  onRefuse: (token) => {
    const what = S.placed.includes(token) ? 'not moved' : 'not placed';
    S.note = stayText(building, token) ?? `${itemOf(token).label} ${what}: drop it on a floor of the tower`;
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
// The model centres in the whole view, and moves left of the fix sheet or the all-yes banner after
// a run (both float on the right on wider screens; on phones they sit at the bottom).
// The all-yes banner uses the same slot, so the model also moves left of it when every answer is yes.
const insetFor = (results: readonly Answer[]): number =>
  innerWidth > 700 && results.length > 0 ? SIDE_PANEL : 0;
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
// The question a person asks for this token (questions.ts), or its name when there is none yet.
const askOf = (id: Id): string => questionOf(id)?.ask ?? itemOf(id).label;
function dot(item: PickItem, small = false): HTMLElement {
  return h('span', {
    class: `dot${small ? ' sm' : ''}`, 'aria-hidden': 'true', style: `--c:${item.color};--gi:${item.glyphInk}`,
  }, item.glyph);
}
const word = (r: Answer | null | undefined, running = false): HTMLElement => r
  ? h('b', { class: `word ${r.status}` }, r.status === 'pass' ? 'Yes' : 'No')
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

function solvePlaced(edits: readonly Edit[] = S.game.edits): { edited: Building; results: Answer[] } {
  const start = played();
  const { building: b, results } = run(start, { edits: [...edits] });
  const all = answers(start, b, edits, results, expected, IMPLEMENTED_RULES);
  return { edited: b, results: all.filter((r) => S.placed.includes(r.token)) };
}

// Show the building as it is now, with no run on it: placed objects wait in their start rooms.
function idle(): void {
  window.clearTimeout(runTimer);
  viewer.setInsetRight(0);
  viewer.show(edited(), parkedResults(S.placed));
}

// `from` is the last edit and the answers before it: an edit that turns a Yes into a No is said so.
function escape(from?: { before: readonly Answer[] | null; label: string }): void {
  if (S.placed.length === 0 || S.phase === 'running' || S.reading !== null) return;
  const t0 = performance.now();
  const { edited: b, results } = solvePlaced();
  S.solveMs = performance.now() - t0;
  S.results = results;
  S.conflict = from ? conflictOf(from.before, results, from.label, b) : null;
  if (S.conflict) S.note = [S.conflict.title, ...S.conflict.lines].join('. ');
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
  S.conflict = null;
  S.note = '';
  S.phase = S.placed.length ? 'placed' : 'empty';
  idle();
  render();
}

// A drop on the model (or an arrow key): the token starts in `node` and waits there for Show me,
// like a placement from the dock. The last run's results no longer hold, so they are cleared.
function moveTo(id: Id, node: Id): void {
  if (S.phase === 'running') return;
  if (isMemberStart(building, id)) { // the load holds the building up where it is
    S.note = stayText(building, id)!;
    return render();
  }
  S.starts.set(id, node);
  S.placed = dropPlaced(building, S.placed, id);
  S.selected = id;
  S.results = null;
  S.conflict = null;
  S.note = `${itemOf(id).label} starts in ${placeName(building, node)}`;
  S.phase = 'placed';
  idle();
  render();
}

// While a typed sentence is read (up to 2.5 s), no other edit applies: its answer would land on a
// building that changed under it.
function applyFix(edit: Edit, label: string): void {
  if (S.phase === 'running' || S.reading !== null) return;
  const before = S.results;
  S.game = applyEdit(S.game, edit);
  S.editOpen = false;
  S.read = null;
  ($('editInput') as HTMLInputElement).value = '';
  S.note = `Checked again after: ${label}`;
  if (S.placed.length) escape({ before, label });
  else {
    idle();
    render();
  }
  if (edit.target !== null) viewer.flash(edit.target);
}

// Hint: the rules try edits at the stuck part and offer the first that turns this answer to Yes.
// It applies through applyFix, like a typed edit; Undo edits removes it.
function askHint(token: Id): void {
  if (S.phase !== 'result' || !S.results || S.reading !== null) return;
  const result = findHint(played(), S.game.edits, token, (e) => solvePlaced(e).results);
  S.hint = { token, result, run: S.results };
  render();
  // The Hint button was redrawn under the click; keep keyboard focus inside the panel.
  $('hint').querySelector<HTMLElement>('.hact .fixbtn')?.focus();
}

function reset(): void {
  if (S.phase === 'running' || S.reading !== null || S.game.edits.length === 0) return;
  S.game = initialState();
  S.read = null; // the strip described an edit that is now undone
  S.note = 'Checked again with the original building';
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
  S.conflict = null;
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
  if (S.read && !S.read.out.edit) S.read = null;
  render();
}

// The server reads the sentence when it runs Strands Decider; otherwise this page does
// (parse-client.ts). A sure parse applies at once; anything else asks "Did you mean" in the strip.
async function submitText(text: string): Promise<void> {
  if (S.reading !== null || S.phase === 'running') return;
  S.reading = text;
  S.read = null;
  render();
  const r = await readEdit(text, typedFixes, building);
  S.reading = null;
  // Escape! waits while a sentence is read, so no run is playing here.
  if (r.out.edit) applyFix(r.out.edit, editLabel(building, r.out.edit));
  S.read = r;
  render();
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
  esc.disabled = running || S.placed.length === 0 || S.reading !== null;
  if (S.placed.length) esc.removeAttribute('aria-describedby');
  else esc.setAttribute('aria-describedby', 'escHint');
  const n = S.game.edits.length;
  const rb = $('btnReset') as HTMLButtonElement;
  rb.disabled = running || n === 0;
  rb.replaceChildren(n ? `Undo edits (${n}) ` : 'Undo edits ', h('kbd', {}, 'R'));
  rb.setAttribute('aria-label', n ? `Undo edits, ${n} applied` : 'Undo edits');
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
  $('slimText').textContent = `Checking ${plural(S.placed.length, 'route')}`;

  // Summary pill
  const sm = $('summary') as HTMLButtonElement;
  const phase = phaseWord(S.phase, S.placed.length);
  const counted = countText(S.phase, S.placed.length, S.results);
  const line = h('span', { class: 'sline' }, h('span', { class: 'phase' }, phase),
    h('span', { class: 'vbar' }), h('span', { class: 'count num' }, counted));
  const chips = S.placed.length
    ? [h('span', { class: 'schips' }, ...S.placed.map((id) => h('span', { class: 'schip' }, dot(itemOf(id), true), word(resOf(id), running)))),
      h('span', { class: 'caret', 'aria-hidden': 'true' })]
    : [];
  sm.replaceChildren(line, ...chips);
  sm.disabled = S.phase === 'empty';
  sm.setAttribute('aria-expanded', String(S.scoreOpen));
  const each = S.placed.map((id) => `${itemOf(id).label} ${resOf(id) ? (resOf(id)!.status === 'pass' ? 'yes' : 'no') : running ? 'checking' : 'ready'}`);
  sm.setAttribute('aria-label', `Answers: ${[phase, counted, ...each].join(', ')}`);

  // Answers rows, and the footer line that keeps the claim honest (ADR 0010)
  const b = edited();
  const sp = $('scorePanel');
  sp.classList.toggle('open', S.scoreOpen && S.placed.length > 0);
  document.body.classList.toggle('scoring', S.scoreOpen);
  sp.replaceChildren(...S.placed.map((id) => {
    const r = resOf(id);
    const token = b.tokens.find((t) => t.id === id)!;
    const det = !r ? `Starts in ${placeName(b, token.start)}`
      : r.status === 'pass' ? `${yesLine(id)}. Route: ${routeShown(id, r.path).map((p) => placeName(b, p)).join(', ')}`
      : stuckLine(b, r);
    return h('div', { class: 'srow', tabindex: '0' }, dot(itemOf(id)), h('span', { class: 'nm' }, askOf(id)), word(r), h('span', { class: 'det num' }, det));
  }), h('div', { class: 'snote' }, 'A quick check of sizes and routes, not a code review.'));

  // Live note and the all-yes banner
  $('note').textContent = S.note;
  $('banner').classList.toggle('on', S.phase === 'complete');
  // Written only when the words change, so the status region is not read out again on every render.
  const yes = allYesText(S.placed, n);
  if ($('bannerBig').textContent !== yes.title) $('bannerBig').textContent = yes.title;
  if ($('bannerSub').textContent !== yes.lines) $('bannerSub').textContent = yes.lines;

  renderSheet(b);
  renderEdit();
  renderHintPanel();
  const sel = S.selected !== null && S.placed.includes(S.selected) ? S.selected : null;
  viewer.select(sel, sel === null ? null : tokenCaption(b, sel, resOf(sel), running));
}

// One card per No answer: who asks, the question, the reason, the numbers and the fixes that matter.
function renderSheet(b: Building): void {
  const sheet = $('sheet');
  const fails = S.phase === 'result' && S.results ? S.results.filter((r) => r.status === 'fail') : [];
  sheet.classList.toggle('on', fails.length > 0 && !S.editOpen);
  if (fails.length === 0) return sheet.replaceChildren();
  const cards: HTMLElement[] = fails.map((r) => fixCard(r, b));
  sheet.replaceChildren(
    ...(S.conflict ? [h('div', { class: 'conflict' }, h('b', {}, S.conflict.title), ...S.conflict.lines.map((l) => h('div', { class: 'cl' }, l)))] : []),
    h('div', { class: 'lbl' }, 'Suggested fixes'),
    ...cards,
    h('div', { class: 'foot' },
      btn('Type an edit', 'fixbtn ghost', openEdit),
      btn('Undo edits', 'fixbtn ghost', reset, S.game.edits.length ? {} : { disabled: '' })),
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
  const why = r.reason ? cap(REASON_TEXT[r.reason]) : 'Stuck';
  const nums = numbersText(r);
  const q = questionOf(r.token);
  return h('div', { class: 'fcard', role: 'group', 'aria-label': `${askOf(r.token)} No` },
    q && h('div', { class: 'who' }, q.person),
    h('div', { class: 'top' }, dot(it), h('span', { class: 'nm' }, askOf(r.token)), h('span', { class: 'word fail' }, 'No')),
    h('div', { class: 'rs' }, why, r.blocked_at && h('span', {}, ` at ${placeName(b, r.blocked_at)}`)),
    nums && h('div', { class: 'nb num' }, cap(nums)),
    fixes.length === 0 && h('div', { class: 'none' }, 'No suggested fix here yet. Type an edit.'),
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
  $('quick').replaceChildren(
    ...buttons.map((f) => {
      const on = isApplied(S.game, f.edit);
      return btn(on ? `Applied: ${f.label}` : f.label, 'fixbtn', () => applyFix(f.edit, f.label), { 'aria-pressed': String(on) });
    }),
    btn('Undo edits', 'fixbtn ghost', reset, S.game.edits.length ? {} : { disabled: '' }),
  );
  ($('editApply') as HTMLButtonElement).disabled = S.reading !== null;
  const placed = S.results !== null && S.placed.length > 0;
  renderStrip($('strip'), building, {
    pending: S.reading, reading: S.read,
    answers: placed ? answerLines(S.results!, edited()) : null,
    checking: S.phase === 'running', solveMs: S.solveMs,
    suggestions: (S.read?.out.suggestions ?? []).filter((f) => !isApplied(S.game, f.edit)).map((f) => ({ label: f.label, onPick: () => applyFix(f.edit, f.label) })),
    onCancel: () => {
      S.read = null;
      render();
      if (S.editOpen) $('editInput').focus();
    },
    onClose: () => {
      S.read = null;
      render();
    },
  });
}

// The Hint panel stacks above the "who decided" strip, so it draws after the strip does.
function renderHintPanel(): void {
  const show = S.hint !== null && S.hint.run === S.results && S.phase === 'result' ? S.hint : null;
  const close = (): void => {
    S.hint = null;
    render();
    $('hint').querySelector<HTMLElement>('.hbtns .fixbtn')?.focus();
  };
  renderHint($('hint'), {
    asks: S.phase === 'result' && S.reading === null && S.results
      ? S.results.filter((r) => r.status === 'fail').map((r) => ({ name: itemOf(r.token).label, onHint: () => askHint(r.token) }))
      : [],
    shown: show && {
      name: askOf(show.token), model: hintModel(building, show.result, show.token), onClose: close,
      onApply: () => show.result.fix && applyFix(show.result.fix, editLabel(building, show.result.fix)),
    },
  });
}

// ---------- Build the dock once ----------

// A chip is a question. A click asks it, with the token in its own start room (a second click takes
// it off); a drag from a chip carries it onto the model, where the viewer drops it on that floor.
// Wide screens show the question; phones show the short name (index.html, .ask and .short).
let chipPress: { id: Id; pointerId: number; x: number; y: number } | null = null;
let dragged = false; // the click that ends a chip drag is not a placement
for (const it of items) {
  const id = it.token;
  const b = btn([dot(it), h('span', { class: 'ask' }, askOf(id)), h('span', { class: 'short' }, it.label), it.key ? h('kbd', {}, String(it.key)) : null], 'chip', () => {
    if (dragged) dragged = false;
    else place(id);
  }, {
    'data-token': id, 'aria-pressed': 'false', 'aria-label': `${askOf(id)} (${it.label})`, // the name holds both the question and the short name a narrow screen shows
    title: 'Click to ask. Or drag it onto a floor to start it there. Arrow up or down moves it one floor.',
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

$('btnEscape').addEventListener('click', () => escape());
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
  if (text) void submitText(text);
});

document.addEventListener('keydown', (ev) => {
  const typing = ev.target instanceof HTMLInputElement;
  if (ev.key === 'Escape') {
    if (S.editOpen) closeEdit();
    else if (S.hint !== null) {
      S.hint = null;
      render();
    } else if (S.scoreOpen) {
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
  // Space and Enter are Show me, unless a button has focus: then they press that button.
  if (showMeKey(ev.key, onBtn)) {
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
    const stay = stayText(building, S.selected);
    if (stay !== null) {
      S.note = stay;
      render();
      return;
    }
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

stackAbove($('hint'), $('strip'));
idle();
render();

// The Cityweft block and the real 432 Park typical floor, each only when this machine has the files
// (data/README.md). No ground otherwise; the graph's rooms are never drawn as boxes, and the viewer draws no grid.
Promise.all([
  loadBackdrop().catch((err: unknown) => (console.warn('Cityweft backdrop not loaded:', err), null)),
  loadTypicalFloor().catch((err: unknown) => (console.warn('Typical floor not loaded:', err), null)),
]).then(([block, floor]) => {
  if (!block && !floor) return;
  Object.assign(context3d, { block, floor, dimmed: 0 });
  const context = new THREE.Group();
  if (block) context.add(block);
  if (floor) {
    floor.place(building);
    context.add(floor.object);
  }
  viewer.setBackdrop(context);
  applyReveal();
  viewer.setFloors(floor ? drawnLevels(building) : []); // only real floors can be opened
});
