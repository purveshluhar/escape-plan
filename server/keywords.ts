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
// "don't widen" and "do not close" are not orders to apply.
const NEGATIONS = new Set(['not', 'don', 'dont', 'never', 'no']);

const TOKEN = /\d+(?:\.\d+)?|\.\d+|[a-z]+/g;
const isNumber = (w: string) => /^(\d|\.\d)/.test(w);

// Numbers and words only. "Unit 1 door", "unit1-door" and "unit 1 door" give the same tokens.
export function tokenize(s: string): string[] {
  return s.toLowerCase().match(TOKEN) ?? [];
}

// Tokens of the typed sentence, and for each number whether it stands alone. "1,5", "1/2", "-2",
// "1e3" and "2.5.3" lose their punctuation in the tokens, so they are marked not clean.
function tokenizeSentence(text: string): { tokens: string[]; clean: boolean[] } {
  const t = text.toLowerCase();
  const found = [...t.matchAll(TOKEN)];
  const tokens = found.map((m) => m[0]);
  const clean = found.map((m, i) => {
    if (!isNumber(m[0])) return true;
    const start = m.index;
    const end = start + m[0].length;
    const before = t[start - 1] ?? ' ';
    const after = t[end] ?? ' ';
    const okBefore = /[\s(]/.test(before);
    const nextIsUnit = found[i + 1]?.index === end && Object.hasOwn(PER_METRE, tokens[i + 1]!);
    const okAfter = /\s/.test(after) || nextIsUnit || (/[.,!?;:)]/.test(after) && /\s/.test(t[end + 1] ?? ' '));
    return okBefore && okAfter;
  });
  return { tokens, clean };
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
    // A name of stop words only ("A" for grid line A) would match ordinary words.
    const phrases = [tokenize(t.name), tokenize(t.id)].filter((p) => p.some((w) => !STOP.has(w)));
    for (const p of phrases) for (const start of find(tokens, p, used)) spans.push({ id: t.id, start, end: start + p.length });
  }
  // "Lobby door" holds "Lobby": a name inside a longer match does not count. A span is inside a
  // longer one when a span that starts earlier ends at or after it, or one that starts with it
  // ends later. Linear in the spans, so 255 targets cannot stall the server.
  const longestFrom = new Array<number>(tokens.length + 1).fill(-1);
  for (const s of spans) longestFrom[s.start] = Math.max(longestFrom[s.start]!, s.end);
  const reachBefore = new Array<number>(tokens.length + 1).fill(-1);
  for (let i = 1; i <= tokens.length; i++) reachBefore[i] = Math.max(reachBefore[i - 1]!, longestFrom[i - 1]!);
  const kept = spans.filter((a) => reachBefore[a.start]! < a.end && longestFrom[a.start]! <= a.end);
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
  // With nothing read, offer a real edit rather than reset, so the read target is kept.
  const fallback = { choice: request.ops.find((o) => o !== 'reset') ?? request.ops[0]!, confidence: NONE };
  const hits = (kind: 'exact' | 'near') => EDIT_OPS
    .map((op) => ({ op, at: Math.min(...OP_WORDS[op][kind].flatMap((p) => find(tokens, p, used))) }))
    .filter((h) => Number.isFinite(h.at))
    .sort((a, b) => a.at - b.at);
  const exact = hits('exact');
  const near = hits('near');
  const lead = exact.length > 0 ? exact : near;
  if (lead.length === 0) return fallback;
  // Ambiguity counts every op word, exact or near, offered or not: "widen it and shut the door"
  // is unclear either way.
  const seen = new Set((exact.length > 0 ? [...exact, ...near] : near).map((h) => h.op));
  const offered = lead.find((h) => request.ops.includes(h.op));
  if (!offered) return fallback;
  let confidence = seen.size > 1 ? MIXED : exact.length > 0 ? SURE : NEAR;
  if (tokens.some((w, i) => !used[i] && NEGATIONS.has(w))) confidence = Math.min(confidence, MIXED);
  return { choice: offered.op, confidence };
}

interface Reading { metres: number; unit: boolean; clean: boolean; before: string }

function pickValue(tokens: string[], clean: boolean[], request: JevParseRequest, used: boolean[]): JevScore {
  const { min, max } = request.value_range;
  const lo = Math.max(min, 0);
  const hi = Math.min(max, MAX_WIDEN_M);
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const readings: Reading[] = [];
  tokens.forEach((w, i) => {
    if (used[i] || !isNumber(w)) return;
    const next = tokens[i + 1] ?? '';
    const per = Object.hasOwn(PER_METRE, next) ? PER_METRE[next]! : null;
    readings.push({ metres: Number(w) / (per ?? 1), unit: per !== null, clean: clean[i]!, before: tokens[i - 1] ?? '' });
  });
  if (readings.length === 0) return { score: clamp(lo), confidence: NONE };
  // Every number counts: "to 2 m 50" is unclear. "from 1 m to 2 m" means 2 m.
  const to = readings.filter((r) => r.before === 'to');
  const fromTo = to.length === 1 && readings.every((r) => r.before === 'to' || r.before === 'from');
  const one = readings.length === 1 ? readings[0]! : fromTo ? to[0]! : null;
  const pick = one ?? readings.find((r) => r.unit) ?? readings[0]!;
  let conf = one === null ? MIXED : pick.unit ? SURE : NEAR;
  if (!readings.every((r) => r.clean)) conf = Math.min(conf, MIXED);
  if (pick.before === 'by') conf = Math.min(conf, NEAR); // "widen by 2 m" is a change, not a width
  if (!(pick.metres >= lo && pick.metres <= hi)) conf = NONE;
  return { score: clamp(pick.metres), confidence: conf };
}

// One op from request.ops, one target from request.targets, and for widen a value in range.
// The caller checks that ops and targets are not empty (server/http.ts answers 400 first).
export function keywordParse(request: JevParseRequest): JevParse {
  if (request.ops.length === 0 || request.targets.length === 0) throw new Error('keywordParse needs at least one op and one target');
  const { tokens, clean } = tokenizeSentence(request.text);
  const used = tokens.map(() => false);
  // Target first, so words inside a name ("Ramp to terrace") are not read as an op or a value.
  const target = pickTarget(tokens, request, used);
  const op = pickOp(tokens, request, used);
  // A sure reset has no target: the slot is filled from the list and is not in doubt (decider
  // spike). An unsure reset keeps the target it read, so "Did you mean" shows the right one.
  if (op.choice === 'reset' && op.confidence === SURE) return { op, target: { choice: request.targets[0]!.id, confidence: SURE }, value: null };
  return { op, target, value: op.choice === 'widen' ? pickValue(tokens, clean, request, used) : null };
}
