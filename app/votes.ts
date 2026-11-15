// The review panel: after each edit, ask the local server (POST /votes, ADR 0002) for one vote per
// discipline, and turn the answer into bubbles. Votes are bubbles only: they never change a colour
// or an answer, the building rules decide. A vote that disagrees with the rules is shown as such.
// Browser code: no node imports. Pure apart from the fetch, so Node tests check it. Owner: P3.
import type { Building, Discipline, Edit, JevVote, JevVoteRequest, SolverResult, Vote } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE, VOTES } from '../contract/types.ts';
import { tokenName } from '../viewer/labels.ts';
import { questionOf } from './questions.ts';
import { REASON_TEXT, placeName } from './scoreboard.ts';

export const VOTES_URL = '/votes'; // same origin; vite.config.ts proxies it to 127.0.0.1
export const VOTES_TIMEOUT_MS = 2500; // the latency budget; the server gives the model 2 s of it
// A no-break space between a number and its unit, so "1.2 s" never wraps (as in strip.ts).
const NBSP = '\u00a0';
const MODEL_BUDGET_S = `2.0${NBSP}s`; // server/votes.ts VOTE_TIMEOUT_MS

// One request per discipline in the data, in building order. When two tokens share a discipline
// (glass and sofa are both logistics), the first one whose answer this edit changed speaks for it,
// else the first one.
export function voteRequests(building: Building, edit: Edit, before: readonly SolverResult[], after: readonly SolverResult[]): JevVoteRequest[] {
  const out = new Map<Discipline, JevVoteRequest>();
  for (const t of building.tokens) {
    const b = before.find((r) => r.token === t.id);
    const a = after.find((r) => r.token === t.id);
    if (!b || !a) continue;
    const held = out.get(t.discipline);
    const changed = b.status !== a.status;
    if (!held || (changed && held.before.status === held.after.status)) out.set(t.discipline, { discipline: t.discipline, edit, before: b, after: a });
  }
  return [...out.values()];
}

// Why the panel shows what it shows: the model voted, the rules voted (no model answered), or no
// votes came (server down, slower than the budget, or an answer that cannot be used).
export type PanelWhy = 'pending' | 'strands' | 'rules' | 'down' | 'slow' | 'refused';

export interface PanelReading {
  requests: JevVoteRequest[];
  votes: JevVote[]; // one per request, in order; [] when no votes came
  why: PanelWhy;
  voter: string | null; // the x-voter header as sent
  decider: string | null; // the x-decider header as sent
  ms: number;
}

export interface VoteDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

const conf = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;

// One vote per request, about the token and discipline asked, with a known vote and a confidence.
function usable(x: unknown, reqs: readonly JevVoteRequest[]): x is JevVote[] {
  if (!Array.isArray(x) || x.length !== reqs.length) return false;
  return x.every((v: Partial<JevVote> | null, i) => typeof v === 'object' && v !== null
    && v.token === reqs[i]!.after.token && v.discipline === reqs[i]!.discipline
    && (VOTES as readonly unknown[]).includes(v.vote) && conf(v.confidence));
}

export async function readVotes(requests: JevVoteRequest[], deps: VoteDeps = {}): Promise<PanelReading> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => performance.now());
  const started = now();
  const done = (why: PanelWhy, votes: JevVote[] = [], voter: string | null = null, decider: string | null = null): PanelReading =>
    ({ requests, votes, why, voter, decider, ms: now() - started });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? VOTES_TIMEOUT_MS);
  try {
    const res = await doFetch(VOTES_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requests), signal: ctl.signal,
    });
    const voter = res.headers.get('x-voter');
    const decider = res.headers.get('x-decider');
    // 502, 503 or 504 with no x-voter is the Vite proxy saying it could not reach the server.
    if (!res.ok) return voter === null && res.status >= 502 && res.status <= 504 ? done('down') : done('refused', [], voter, decider);
    const body: unknown = await res.json().catch(() => undefined);
    if (ctl.signal.aborted) return done('slow');
    if ((voter !== 'strands' && voter !== 'rules') || !usable(body, requests)) return done('refused', [], voter, decider);
    return done(voter, body, voter, decider);
  } catch {
    return done(ctl.signal.aborted ? 'slow' : 'down');
  } finally {
    clearTimeout(timer);
  }
}

// ---------- What the panel says ----------

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  mep: 'MEP', logistics: 'Logistics', accessibility: 'Accessibility', structure: 'Structure',
  life_safety: 'Life safety', fire: 'Fire', plumbing: 'Plumbing', electrical: 'Electrical',
};
const VOTE_WORD: Record<Vote, 'Accept' | 'Object' | 'Review'> = { accept: 'Accept', object: 'Object', review: 'Review' };

export interface Bubble {
  discipline: string;
  who: 'Strands Decider' | 'Rules' | 'Rules, no change'; // who voted this one
  vote: 'Accept' | 'Object' | 'Review';
  confidence: string; // "0.72"
  sure: boolean; // confidence at JEV_ACCEPT_CONFIDENCE (0.8) or more; else the bubble says "not sure"
  reason: string; // what this discipline's question did: "Load was Yes, now No: nothing holds it up at beam B2"
  rules: string; // the rules' answer, and whether this vote agrees with it
  clash: boolean; // the vote says the opposite of the rules
}

export interface PanelModel {
  title: string;
  source: string;
  bubbles: Bubble[];
  summary: string;
}

const yesNo = (r: SolverResult): 'Yes' | 'No' => (r.status === 'pass' ? 'Yes' : 'No');

// The one-line reason: what the rules found for this discipline's question, before and after.
function reasonLine(building: Building, r: JevVoteRequest): string {
  const name = tokenName(r.after.token);
  const plural = questionOf(r.after.token)?.plural ?? false;
  const why = r.after.status === 'pass' ? ''
    : `: ${REASON_TEXT[r.after.reason ?? 'no_route']}${r.after.blocked_at ? ` at ${placeName(building, r.after.blocked_at)}` : ''}`;
  if (r.before.status === r.after.status) return `${name} ${plural ? 'are' : 'is'} still ${yesNo(r.after)}${why}`;
  return `${name} ${plural ? 'were' : 'was'} ${yesNo(r.before)}, now ${yesNo(r.after)}${why}`;
}

// The server asks the model only about these (server/votes.ts `changed`); the rules vote the rest.
const changed = (r: JevVoteRequest): boolean => r.before.status !== r.after.status;

// A disagreement is about what the edit did: accepting an edit that turned Yes to No, or objecting
// to one that turned No to Yes. Accepting an edit that left a No as it was is not one.
const clashes = (v: Vote, r: JevVoteRequest): boolean => changed(r)
  && ((v === 'accept' && r.after.status === 'fail') || (v === 'object' && r.after.status === 'pass'));

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}${NBSP}s`;

function sourceText(r: PanelReading): string {
  switch (r.why) {
    case 'pending': return 'Asking each discipline...';
    case 'strands': return `x-voter: strands - on this computer, ${seconds(r.ms)}`;
    case 'rules': return r.decider !== 'strands' ? 'x-voter: rules - the server runs keywords, so the rules vote'
      : r.requests.some(changed) ? `x-voter: rules - the model did not answer in ${MODEL_BUDGET_S} (off, busy or slow), so the rules vote`
      : 'x-voter: rules - this edit changed no answer, so the rules vote';
    case 'down': return 'No votes - the server is not reachable';
    case 'slow': return `No votes - no answer in ${seconds(VOTES_TIMEOUT_MS)}`;
    case 'refused': return 'No votes - the server answer could not be used';
  }
}

export function panelModel(r: PanelReading, building: Building): PanelModel {
  const voted = r.why === 'strands' || r.why === 'rules';
  const bubbles: Bubble[] = !voted ? [] : r.votes.map((v, i) => {
    const req = r.requests[i]!;
    const clash = clashes(v.vote, req);
    const rules = clash ? `Rules disagree: ${yesNo(req.after)}`
      : changed(req) && v.vote !== 'review' ? `Rules agree: ${yesNo(req.after)}` : `Rules: ${yesNo(req.after)}`;
    const who = r.why === 'rules' ? 'Rules' : changed(req) ? 'Strands Decider' : 'Rules, no change';
    return { discipline: DISCIPLINE_LABEL[v.discipline], who, vote: VOTE_WORD[v.vote], confidence: v.confidence.toFixed(2), sure: v.confidence >= JEV_ACCEPT_CONFIDENCE, reason: reasonLine(building, req), rules, clash };
  });
  const n = bubbles.filter((b) => b.clash).length;
  const title = r.why === 'pending' ? 'Review panel'
    : r.why === 'strands' ? 'Review panel: Strands Decider'
    : r.why === 'rules' ? 'Review panel: rules only'
    : 'Review panel is off';
  const summary = !voted ? (r.why === 'pending' ? 'Votes only. They never change an answer: the rules decide.' : 'The rules still decide every answer.')
    : n > 0 ? `${n} vote${n === 1 ? '' : 's'} ${n === 1 ? 'disagrees' : 'disagree'} with the rules. The rules decide every answer.`
    : 'Votes only. They never change an answer: the rules decide.';
  return { title, source: sourceText(r), bubbles, summary };
}
