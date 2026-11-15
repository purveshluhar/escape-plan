// Hint: when an answer is No, try edits at the stuck part only and offer the first one the rules say
// turns the answer to Yes. Pure and deterministic; the rules decide, nothing here guesses. It takes
// the solver as a function, so it works for any question the data has (load and smoke too).
// The search is bounded by a count and a clock, so it never holds the page. Owner: P3.
import type { Building, Edit, Id, Reason, SolverResult } from '../contract/types.ts';
import { applyEdits } from '../solver/index.ts';
import { placeName, stuckLine } from './scoreboard.ts';
import { yesLine } from './questions.ts';
import { editLabel } from './state.ts';

export const HINT_MAX_TRIES = 100;
export const HINT_MAX_MS = 250;
const WIDEN_FROM_STEP = 1; // tenths of a metre above the current width
const WIDEN_MAX_TENTHS = 30; // no door or shaft is widened past 3.0 m

export interface HintOptions {
  maxTries?: number;
  maxMs?: number;
  now?: () => number; // milliseconds; a test passes its own clock
}

export type HintStop = 'found' | 'exhausted' | 'tries' | 'time' | 'yes';

export interface HintResult {
  fix: Edit | null;
  tried: number; // fixes the rules were asked about
  stop: HintStop;
  at: Id | null; // the stuck part the search worked on
  limit: number; // the count cap in force
  breaks: SolverResult[]; // answers that were Yes and are No with the fix
}

const button = (op: Edit['op'], target: Id, value: number | null = null): Edit => ({ op, target, value, source: 'button' });

// The edits the data offers at one stuck edge, smallest change first. Which ops make sense depends
// on why it is stuck; with no known reason, every op is tried.
function edgeCandidates(edited: Building, id: Id, reason: Reason | null): Edit[] {
  const edge = edited.edges.find((e) => e.id === id);
  if (!edge) return [];
  const widen = (): Edit[] => {
    const out: Edit[] = [];
    for (let t = Math.round(edge.clear_width * 10) + WIDEN_FROM_STEP; t <= WIDEN_MAX_TENTHS; t++) out.push(button('widen', id, t / 10));
    return out;
  };
  const ramp = (): Edit[] => (edge.kind === 'ramp' && edge.step_height === 0 ? [] : [button('add_ramp', id)]);
  const sleeve = (): Edit[] => (edge.sleeved ? [] : [button('add_sleeve', id)]);
  const close = (): Edit[] => (edge.open === false ? [] : [button('close_door', id)]);
  switch (reason) {
    case 'too_narrow': case 'cannot_turn': return widen();
    case 'step': return ramp();
    case 'uphill': case 'crosses_beam': return sleeve();
    case 'smoke_first': return close();
    default: return [...widen(), ...ramp(), ...sleeve(), ...close()];
  }
}

export function candidateEdits(edited: Building, at: Id | null, reason: Reason | null): Edit[] {
  if (at === null) return [];
  const member = edited.members.find((m) => m.id === at);
  if (member) return member.kind === 'transfer_beam' ? [] : [button('add_transfer_beam', at)];
  if (edited.edges.some((e) => e.id === at)) return edgeCandidates(edited, at, reason);
  // A stuck room: the ways in and out of it.
  return edited.edges.filter((e) => e.from === at || e.to === at).flatMap((e) => edgeCandidates(edited, e.id, reason));
}

// `solveWith(edits)` answers the questions on screen for the building with those edits applied.
export function findHint(
  start: Building, edits: readonly Edit[], token: Id, solveWith: (edits: readonly Edit[]) => SolverResult[], opts: HintOptions = {},
): HintResult {
  const maxTries = opts.maxTries ?? HINT_MAX_TRIES;
  const maxMs = opts.maxMs ?? HINT_MAX_MS;
  const now = opts.now ?? ((): number => performance.now());
  const t0 = now();
  const base = solveWith(edits);
  const mine = base.find((r) => r.token === token);
  const done = (stop: HintStop, tried: number, fix: Edit | null, breaks: SolverResult[], at: Id | null): HintResult =>
    ({ fix, tried, stop, at, limit: maxTries, breaks });
  if (!mine || mine.status === 'pass') return done('yes', 0, null, [], null);
  const candidates = candidateEdits(applyEdits(start, edits), mine.blocked_at, mine.reason);
  let tried = 0;
  for (const c of candidates) {
    if (tried >= maxTries) return done('tries', tried, null, [], mine.blocked_at);
    if (now() - t0 >= maxMs) return done('time', tried, null, [], mine.blocked_at);
    tried++;
    const after = solveWith([...edits, c]);
    if (after.find((r) => r.token === token)?.status !== 'pass') continue;
    const breaks = after.filter((r) => r.status === 'fail' && base.find((b) => b.token === r.token)?.status === 'pass');
    return done('found', tried, c, breaks, mine.blocked_at);
  }
  return done('exhausted', tried, null, [], mine.blocked_at);
}

export interface HintModel {
  found: boolean;
  tried: string; // "The rules tried 4 fixes."
  fixLabel: string | null; // "Widen lobby door to 1.4 m"
  then: string | null; // "Then: The sofa gets in."
  breaks: string[]; // stuck lines for answers the fix turns to No
  note: string | null; // why nothing was offered
}

const fixes = (n: number): string => `${n} fix${n === 1 ? '' : 'es'}`;

export function hintModel(building: Building, h: HintResult, token: Id): HintModel {
  const tried = `The rules tried ${fixes(h.tried)}.`;
  if (h.fix) {
    return {
      found: true, tried, fixLabel: editLabel(building, h.fix), then: `Then: ${yesLine(token)}.`,
      breaks: h.breaks.map((r) => stuckLine(building, r)), note: null,
    };
  }
  const note = h.stop === 'yes' ? 'This answer is already Yes.'
    : h.stop === 'tries' ? `Stopped at the limit of ${fixes(h.limit)}. None made this Yes.`
    : h.stop === 'time' ? 'Stopped at the time limit. None made this Yes.'
    : h.tried === 0 || h.at === null ? 'The rules have no edit to try at the stuck place. Type an edit instead.'
    : `No single edit at ${placeName(building, h.at)} makes this Yes. Type an edit instead.`;
  return { found: false, tried: h.stop === 'yes' ? '' : tried, fixLabel: null, then: null, breaks: [], note };
}
