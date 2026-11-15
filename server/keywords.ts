// Plan C: a keyword parser that fills JevParse with no model and no key. Owner: P1.
// Confidence is 1 only for an exact match (the op's own word, a target's full name or id, a
// number with a metric unit inside the range). Anything less stays below JEV_ACCEPT_CONFIDENCE,
// so the app shows "Did you mean" instead of applying a guess.
import type { EditOp, Id, JevChoice, JevParse, JevParseRequest, JevScore } from '../contract/types.ts';
import { EDIT_OPS } from '../contract/types.ts';

// A typed width above 5 m is not trusted, whatever range the request declares (decider spike).
export const MAX_WIDEN_M = 5;

const SURE = 1;
const NEAR = 0.6; // a near word, a partial name, a number with no unit
const MIXED = 0.4; // two different answers in one sentence
const NONE = 0;

type Phrase = string[];

// The op's own word is exact; the near words are understood but not trusted.
const OP_WORDS: Record<EditOp, { exact: Phrase[]; near: Phrase[] }> = {
  widen: { exact: [['widen']], near: [['wider'], ['widened'], ['widening'], ['broaden'], ['enlarge'], ['bigger'], ['larger'], ['width']] },
  add_transfer_beam: { exact: [['transfer', 'beam']], near: [['transfer'], ['beam']] },
  add_ramp: { exact: [['ramp']], near: [['ramps'], ['slope']] },
  close_door: { exact: [['close']], near: [['shut'], ['closed']] },
  add_sleeve: { exact: [['sleeve']], near: [['sleeves'], ['sleeved']] },
  reset: { exact: [['reset']], near: [['undo'], ['restart'], ['start', 'over']] },
};

// How many of each unit make one metre.
const PER_METRE: Record<string, number> = {
  m: 1, metre: 1, metres: 1, meter: 1, meters: 1,
  cm: 100, centimetre: 100, centimetres: 100, centimeter: 100, centimeters: 100,
};

// Words that never identify a target on their own.
const STOP = new Set(['the', 'a', 'an', 'to', 'at', 'of', 'in', 'on', 'and', 'by', 'for']);

// Numbers and words only. "Unit 1 door", "unit1-door" and "unit 1 door" give the same tokens.
export function tokenize(s: string): string[] {
  return s.toLowerCase().match(/\d+(?:\.\d+)?|\.\d+|[a-z]+/g) ?? [];
}

// Start index of each place `phrase` appears in `tokens` without touching a used token.
function find(tokens: string[], phrase: Phrase, used: boolean[]): number[] {
  const at: number[] = [];
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((w, k) => tokens[i + k] === w && !used[i + k])) at.push(i);
  }
  return at;
}

interface Span { id: Id; start: number; end: number }

function pickTarget(tokens: string[], request: JevParseRequest, used: boolean[]): JevChoice<Id> {
  const first = request.targets[0]!.id;
  const spans: Span[] = [];
  for (const t of request.targets) {
    const phrases = [tokenize(t.name), tokenize(t.id)].filter((p) => p.length > 0);
    for (const p of phrases) for (const start of find(tokens, p, used)) spans.push({ id: t.id, start, end: start + p.length });
  }
  // "Lobby door" holds "Lobby": a name inside a longer match does not count.
  const inside = (a: Span, b: Span) => b.start <= a.start && a.end <= b.end && b.end - b.start > a.end - a.start;
  const kept = spans.filter((a) => !spans.some((b) => inside(a, b)));
  for (const s of kept) for (let i = s.start; i < s.end; i++) used[i] = true;
  const ids = new Set(kept.map((s) => s.id));
  if (ids.size > 0) {
    const best = [...kept].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)[0]!;
    return { choice: best.id, confidence: ids.size === 1 ? SURE : MIXED };
  }
  // No full name: score each target by the share of its name words the sentence has.
  const said = new Set(tokens.filter((w) => !STOP.has(w)));
  let bestId = first;
  let bestShare = 0;
  let tie = false;
  for (const t of request.targets) {
    const words = tokenize(t.name).filter((w) => !STOP.has(w));
    if (words.length === 0) continue;
    const share = words.filter((w) => said.has(w)).length / words.length;
    if (share > bestShare) [bestId, bestShare, tie] = [t.id, share, false];
    else if (share === bestShare && share > 0 && t.id !== bestId) tie = true;
  }
  return { choice: bestId, confidence: bestShare === 0 ? NONE : NEAR * bestShare * (tie ? 0.5 : 1) };
}

function pickOp(tokens: string[], request: JevParseRequest, used: boolean[]): JevChoice<EditOp> {
  const fallback = request.ops[0]!;
  // Ambiguity counts every op, offered or not: "widen and add a ramp" is unclear either way.
  const hits = (kind: 'exact' | 'near') => EDIT_OPS
    .map((op) => ({ op, at: Math.min(...OP_WORDS[op][kind].flatMap((p) => find(tokens, p, used))) }))
    .filter((h) => Number.isFinite(h.at))
    .sort((a, b) => a.at - b.at);
  for (const [kind, conf] of [['exact', SURE], ['near', NEAR]] as const) {
    const h = hits(kind);
    if (h.length === 0) continue;
    const offered = h.find((x) => request.ops.includes(x.op));
    if (!offered) return { choice: fallback, confidence: NONE };
    return { choice: offered.op, confidence: h.length === 1 ? conf : MIXED };
  }
  return { choice: fallback, confidence: NONE };
}

interface Reading { metres: number; unit: boolean; before: string }

function pickValue(tokens: string[], request: JevParseRequest, used: boolean[]): JevScore {
  const { min, max } = request.value_range;
  const lo = Math.max(min, 0);
  const hi = Math.min(max, MAX_WIDEN_M);
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const readings: Reading[] = [];
  tokens.forEach((w, i) => {
    if (used[i] || !/^(\d|\.\d)/.test(w)) return;
    const unit = PER_METRE[tokens[i + 1] ?? ''];
    readings.push({ metres: Number(w) / (unit ?? 1), unit: unit !== undefined, before: tokens[i - 1] ?? '' });
  });
  const withUnit = readings.filter((r) => r.unit);
  const pool = withUnit.length > 0 ? withUnit : readings;
  if (pool.length === 0) return { score: clamp(lo), confidence: NONE };
  // "from 1 m to 2 m" means 2 m; "to 1 m or 2 m" stays unclear.
  const to = pool.filter((r) => r.before === 'to');
  const fromTo = to.length === 1 && pool.every((r) => r.before === 'to' || r.before === 'from');
  const one = pool.length === 1 ? pool[0]! : fromTo ? to[0]! : null;
  const pick = one ?? pool[0]!;
  const inRange = pick.metres >= lo && pick.metres <= hi;
  const conf = !inRange ? NONE : one === null ? MIXED : pick.unit ? SURE : NEAR;
  return { score: clamp(pick.metres), confidence: conf };
}

// One op from request.ops, one target from request.targets, and for widen a value in range.
// The caller checks that ops and targets are not empty (server/http.ts answers 400 first).
export function keywordParse(request: JevParseRequest): JevParse {
  if (request.ops.length === 0 || request.targets.length === 0) throw new Error('keywordParse needs at least one op and one target');
  const tokens = tokenize(request.text);
  const used = tokens.map(() => false);
  // Target first, so words inside a name ("Ramp to terrace") are not read as an op or a value.
  const target = pickTarget(tokens, request, used);
  const op = pickOp(tokens, request, used);
  // Reset has no target: the slot is filled from the list and is not in doubt (decider spike).
  if (op.choice === 'reset') return { op, target: { choice: request.targets[0]!.id, confidence: SURE }, value: null };
  return { op, target, value: op.choice === 'widen' ? pickValue(tokens, request, used) : null };
}
