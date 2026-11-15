// The daylight shell (design B): which objects the dock offers, what the summary pill says, and the
// plan C keyword parser behind the "Type an edit" box. Pure, so Node tests can check it. Owner: P3.
import type { Building, Discipline, Edit, EditOp, Id, JevParse, SolverResult, Token } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';
import { tokenName } from '../viewer/labels.ts';
import { REASON_TEXT, placeName } from './scoreboard.ts';
import type { DemoButton } from './state.ts';

// ---------- Dock picker ----------

export interface PickItem {
  token: Id;
  discipline: Discipline;
  label: string;
  glyph: string;
  color: string;
  glyphInk: string;
  key: number | null; // keyboard shortcut 1..9; null past the ninth object
}

// The questions the dock offers: every token in the building in data order, or with a `roster`
// (the MVP set) only those tokens, in roster order. Nothing else shows: no "Later" chips.
export function pickerItems(building: Building, roster?: readonly Id[]): PickItem[] {
  const play = roster ? roster.flatMap((id) => building.tokens.filter((t) => t.id === id)) : building.tokens;
  return play.map((t: Token, i): PickItem => {
    const s = DISCIPLINE_STYLE[t.discipline];
    return {
      token: t.id, discipline: t.discipline, label: tokenName(t.id),
      glyph: s.glyph, color: s.color, glyphInk: s.glyphInk, key: i < 9 ? i + 1 : null,
    };
  });
}

// Placing toggles: a second click takes the object off again. Order follows the building, so
// the viewer's stagger and the summary chips stay stable.
export function togglePlaced(building: Building, placed: readonly Id[], token: Id): Id[] {
  const on = placed.includes(token) ? placed.filter((id) => id !== token) : [...placed, token];
  const order = building.tokens.map((t) => t.id);
  return order.filter((id) => on.includes(id));
}

// A drop (from the dock or of a token already on the model) always places the object; it never
// takes it off, as a second click on its chip does.
export function dropPlaced(building: Building, placed: readonly Id[], token: Id): Id[] {
  return placed.includes(token) ? [...placed] : togglePlaced(building, placed, token);
}

// The building with each dropped object starting in the node it was dropped on. An unknown node is
// ignored. With no drops this is `building` itself; otherwise a copy, and `building` is not changed.
export function withStarts(building: Building, starts: ReadonlyMap<Id, Id>): Building {
  if (starts.size === 0) return building;
  const nodes = new Set(building.nodes.map((n) => n.id));
  return {
    ...building,
    tokens: building.tokens.map((t) => {
      const at = starts.get(t.id);
      return at !== undefined && nodes.has(at) ? { ...t, start: at } : t;
    }),
  };
}

// The line shown under a selected token on the model: its name, where it starts, and its answer
// (Checking while a run plays).
export function tokenCaption(building: Building, token: Id, result: SolverResult | null, running = false): string {
  const t = building.tokens.find((x) => x.id === token);
  const where = t ? placeName(building, t.start) : '';
  const state = running ? 'Checking' : !result ? 'Ready'
    : result.status === 'pass' ? 'Yes'
    : `No: ${REASON_TEXT[result.reason ?? 'no_route']}`;
  return [tokenName(token), where, state].filter(Boolean).join(' - ');
}

// What the viewer is shown before a run: each placed object parked in its start room. The viewer
// only draws tokens for results, and an empty path with no block draws the token at its start with
// no route and no red X, so placing an object shows it on the model straight away.
export function parkedResults(placed: readonly Id[]): SolverResult[] {
  return placed.map((token) => ({
    token, status: 'pass', path: [], blocked_at: null, reason: null, needed: null, available: null,
  }));
}

// ---------- Phases and the summary pill ----------

export type Phase = 'empty' | 'placed' | 'running' | 'result' | 'complete';

export function phaseAfterRun(results: readonly SolverResult[]): Phase {
  return results.length > 0 && results.every((r) => r.status === 'pass') ? 'complete' : 'result';
}

const count = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

// The first word of the summary pill (design/copy.md S13). No game words: no LEVEL COMPLETE.
export function phaseWord(phase: Phase, placed: number): string {
  switch (phase) {
    case 'empty': return 'Your building';
    case 'placed': return 'Ready';
    case 'running': return 'Checking';
    case 'result': return placed === 1 ? 'Answer' : 'Answers';
    case 'complete': return placed === 1 ? 'Answer' : 'Yes to all';
  }
}

// The second part of the pill: what to do, how many questions, or the answers (S14 to S17).
export function countText(phase: Phase, placed: number, results: readonly SolverResult[] | null): string {
  if (phase === 'empty') return 'Pick a question to start';
  if (phase === 'running') return count(placed, 'route');
  if ((phase === 'result' || phase === 'complete') && results) {
    const yes = results.filter((r) => r.status === 'pass').length;
    if (results.length === 1) return yes === 1 ? 'Yes' : 'No';
    if (phase === 'complete') return `${yes} of ${results.length} yes`;
    return `${yes} yes, ${results.length - yes} no`;
  }
  return count(placed, 'question');
}

// Seconds the viewer needs to finish every placed token's walk (stagger plus one full path).
export function runSeconds(count: number, perToken: number, stagger: number): number {
  return count === 0 ? 0 : (count - 1) * stagger + perToken;
}

// ---------- Plan C: keyword parser for typed edits ----------

// The third field is true for a loose word: "bigger" or "open up" could mean a room, not one door,
// so a loose word never makes a part of a name sure on its own.
const OP_WORDS: [EditOp, RegExp, boolean][] = [
  ['add_transfer_beam', /\btransfer\b|\bbeam\b/, false],
  ['add_ramp', /\bramps?\b|\bslope\b|\bstep\b/, false],
  ['widen', /\bwide[nr]?\b|\bwidth\b/, false],
  ['widen', /\bbigger\b|\blarger\b|\benlarge\b|\bopen up\b/, true],
];

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 1);
const STOP = new Set(['the', 'to', 'at', 'add', 'a', 'an', 'of', 'in', 'and', 'make', 'it', 'please', 'by', 'widen', 'wider', 'ramp', 'beam', 'transfer']);

export interface ParseOutcome {
  parse: JevParse;
  edit: Edit | null; // set when every part clears JEV_ACCEPT_CONFIDENCE
  suggestions: DemoButton[]; // "Did you mean": best demo fixes first, at most 3
}

// The same JevParse shape Jev or plan B would return, from plain keyword matching. Targets are
// the demo buttons' targets, named the way the building names them ("Lobby door", "beam B2").
export function parseEdit(text: string, buttons: readonly DemoButton[], range = { min: 0.5, max: 6 }): ParseOutcome {
  const t = text.toLowerCase();
  const opHit = OP_WORDS.find(([, re]) => re.test(t));
  const op: EditOp = opHit?.[0] ?? 'widen';
  // Never sure of the op when the sentence says no, asks a question, or names two ops ("widen beam 2").
  const negated = /\b(not|don'?t|no|never|cancel|undo|remove|without)\b|\?/.test(t);
  const twoOps = new Set(OP_WORDS.filter(([, re]) => re.test(t)).map(([o]) => o)).size > 1;
  const opConf = !opHit ? 0.3 : negated || twoOps ? 0.4 : 0.95;

  const said = new Set(words(t).filter((w) => !STOP.has(w)));
  const nameOf = (b: DemoButton): string[] => words(b.label).filter((w) => !STOP.has(w) && !/^\d/.test(w) && w !== 'm');
  // A word in only one fix's name ("terrace", "shaft") points at that fix; "door" is in three.
  const uses = new Map<string, number>();
  for (const b of buttons) for (const w of new Set(nameOf(b))) uses.set(w, (uses.get(w) ?? 0) + 1);
  const scored = buttons.map((b) => {
    const name = nameOf(b);
    const hits = name.filter((w) => said.has(w)).length;
    const score = name.length ? hits / name.length : 0;
    const own = name.some((w) => said.has(w) && uses.get(w) === 1);
    return { b, score: score + (b.edit.op === op && opHit ? 0.5 : 0), match: score, own };
  }).sort((a, z) => z.score - a.score);
  const best = scored[0];
  const sameOp = best !== undefined && best.b.edit.op === op && opHit !== undefined;
  const firm = sameOp && opHit?.[2] === false && opConf >= JEV_ACCEPT_CONFIDENCE;
  let targetConf = best ? Math.min(1, best.match + (sameOp ? 0.2 : 0)) : 0;

  const num = t.match(/(\d+(?:\.\d+)?)\s*(m\b|metres?|meters?)?/);
  const raw = num ? Number(num[1]) : null;
  const inRange = raw !== null && raw >= range.min && raw <= range.max;
  // Audit gap 8, for short phrases only when nothing else is in doubt: a firm op word, a number (if
  // any) in range, and only one fix named at all.
  const named = scored.filter((x) => x.match > 0).length;
  if (firm && (raw === null || inRange)) {
    // "ramp terrace", "widen shaft 2.0": a word only this fix has.
    if (best?.own && named === 1) targetConf = Math.max(targetConf, 0.9);
    // "transfer beam", "add a ramp": no part named, the op said in full, and only one fix does it.
    const fullOp = op === 'add_transfer_beam' ? /\btransfer\s+beam\b/.test(t) : op === 'add_ramp';
    if (named === 0 && fullOp && buttons.filter((b) => b.edit.op === op).length === 1) targetConf = Math.max(targetConf, 0.85);
  }
  const value = op === 'widen'
    ? { score: inRange ? raw! : best?.b.edit.value ?? range.min, confidence: inRange ? 0.95 : best?.b.edit.value != null ? 0.85 : 0.2 }
    : null;

  const parse: JevParse = {
    op: { choice: op, confidence: opConf },
    target: { choice: best?.b.edit.target ?? '', confidence: targetConf },
    value,
  };
  const sure = best !== undefined && best.b.edit.op === op && opConf >= JEV_ACCEPT_CONFIDENCE
    && targetConf >= JEV_ACCEPT_CONFIDENCE && (value === null || value.confidence >= JEV_ACCEPT_CONFIDENCE);
  const edit: Edit | null = sure
    ? { op, target: best.b.edit.target, value: value ? value.score : null, source: 'text' }
    : null;
  return { parse, edit, suggestions: scored.slice(0, 3).map((s) => s.b) };
}
