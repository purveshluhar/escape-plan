// The review panel: after each edit, ask the local server (POST /votes, ADR 0002) for one vote per
// discipline, and turn the answer into bubbles. Votes are bubbles only: they never change a colour
// or an answer, the building rules decide. A vote that disagrees with the rules is shown as such.
// Browser code: no node imports. Pure apart from the fetch, so Node tests check it. Owner: P3.
import type { Building, Discipline, Edit, JevVote, JevVoteRequest, SolverResult, Vote } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE, VOTES } from '../contract/types.ts';
import { tokenName } from '../viewer/labels.ts';
import { questionOf } from './questions.ts';
import { RACE } from './smoke.ts';
import { stuckLine } from './scoreboard.ts';

export const VOTES_URL = '/votes'; // same origin; vite.config.ts proxies it to 127.0.0.1
export const VOTES_TIMEOUT_MS = 2500; // the latency budget; the server gives the model 2 s of it
// A no-break space between a number and its unit, so "1.2 s" never wraps (as in strip.ts).
const NBSP = '\u00a0';
const MAX_MODEL_QUESTIONS = 2; // server/votes.ts: more changed answers than this go to the rules

// One request per discipline of the questions asked (`asked`, every token when left out), in building
// order: a question nobody asked (glass, when only the chiller is asked) gets no vote. When two tokens share a discipline
// (glass and sofa are both logistics), the one this edit broke (Yes to No) speaks for it, else the
// one it fixed (No to Yes), else the first one; the first wins a tie.
const weight = (b: SolverResult, a: SolverResult): number => (b.status === a.status ? 0 : a.status === 'fail' ? 2 : 1);
const PEOPLE = 'people';
// The smoke question's answer is the people's answer on the same clock (smoke.ts raceAnswer), so the
// fire discipline votes on that, under the smoke's name. The smoke's own result (its spread) always
// passes and says nothing about the question.
function resultOf(results: readonly SolverResult[], token: string): SolverResult | undefined {
  if (token !== RACE) return results.find((r) => r.token === token);
  const people = results.find((r) => r.token === PEOPLE);
  return people && { ...people, token: RACE };
}
export function voteRequests(building: Building, edit: Edit, before: readonly SolverResult[], after: readonly SolverResult[], asked?: readonly string[]): JevVoteRequest[] {
  const out = new Map<Discipline, JevVoteRequest>();
  for (const t of building.tokens) {
    if (asked && !asked.includes(t.id)) continue;
    const b = resultOf(before, t.id);
    const a = resultOf(after, t.id);
    if (!b || !a) continue;
    const held = out.get(t.discipline);
    if (!held || weight(b, a) > weight(held.before, held.after)) out.set(t.discipline, { discipline: t.discipline, edit, before: b, after: a });
  }
  return [...out.values()];
}

// Why the panel shows what it shows: the model voted, the rules voted (no model answered), or no
// votes came (server down, slower than the budget, or an answer that cannot be used).
export type PanelWhy = 'pending' | 'strands' | 'rules' | 'down' | 'slow' | 'busy' | 'refused';

export interface PanelReading {
  requests: JevVoteRequest[];
  votes: JevVote[]; // one per request, in order; [] when no votes came
  why: PanelWhy;
  voter: string | null; // the x-voter header as sent (never shown; sourceText says it in words)
  decider: string | null; // the x-decider header as sent (never shown)
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
    if (!res.ok) {
      if (voter === null && res.status >= 502 && res.status <= 504) return done('down');
      // 429 is the Vite guard: its few places are shared with /parse.
      return res.status === 429 ? done('busy') : done('refused', [], voter, decider);
    }
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
  who: 'Model' | 'Rules' | 'Rules, no change'; // who voted this one
  vote: 'Accept' | 'Object' | 'Review';
  confidence: string; // "0.72"
  sure: boolean; // confidence at JEV_ACCEPT_CONFIDENCE (0.8) or more; else the bubble says "not sure"
  reason: string; // what the rules found for this discipline's question: "Rules: Load was Yes, now No, stuck at beam B2 (nothing holds it up)"
  rules: string; // whether this vote agrees with the rules; '' for a review or an unchanged answer
  clash: boolean; // the vote says the opposite of the rules
}

export interface PanelModel {
  title: string;
  source: string;
  bubbles: Bubble[];
  summary: string;
}

const yesNo = (r: SolverResult): 'Yes' | 'No' => (r.status === 'pass' ? 'Yes' : 'No');

// The one-line reason: what the rules found for this discipline's question, before and after. It
// starts with "Rules:", because it is the rules' finding, not the voter's own words. A No uses the
// one stuck line every screen uses (design/copy.md section 3, scoreboard.ts stuckLine).
function reasonLine(building: Building, r: JevVoteRequest): string {
  const same = r.before.status === r.after.status;
  // The smoke question is about the people racing it, so its line names them.
  const race = r.after.token === RACE;
  const who = race ? PEOPLE : r.after.token;
  const named: SolverResult = { ...r.after, token: who };
  if (r.after.status === 'fail') return `Rules: ${same ? 'still No' : 'was Yes, now No'}. ${stuckLine(building, named)}`;
  const name = tokenName(who);
  const plural = questionOf(who)?.plural ?? false;
  const line = same ? `Rules: ${name} ${plural ? 'are' : 'is'} still Yes` : `Rules: ${name} ${plural ? 'were' : 'was'} No, now Yes`;
  return race ? `${line}, before the smoke` : line;
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
    // Plain words for who voted, never a header name. "Votes by", not "Decided by": the rules decide
    // every answer, and a vote never changes one.
    case 'strands': return `Votes by: the model, on this computer, ${seconds(r.ms)}`;
    case 'rules': {
      const n = r.requests.filter(changed).length;
      return r.decider !== 'strands' ? 'Votes by: the rules. No model is connected.'
        : n === 0 ? 'Votes by: the rules. This edit changed no answer.'
        : n > MAX_MODEL_QUESTIONS ? `Votes by: the rules. This edit changed ${n} answers, more than the model can vote on in time.`
        : 'Votes by: the rules. The model gave no usable vote (off, busy, slow or unclear).';
    }
    case 'down': return 'No votes - the server is not reachable';
    case 'slow': return `No votes - no answer in ${seconds(VOTES_TIMEOUT_MS)}`;
    case 'busy': return 'No votes - the page is making too many calls at once';
    case 'refused': return 'No votes - the server answer could not be used';
  }
}

export function panelModel(r: PanelReading, building: Building): PanelModel {
  const voted = r.why === 'strands' || r.why === 'rules';
  const bubbles: Bubble[] = !voted ? [] : r.votes.map((v, i) => {
    const req = r.requests[i]!;
    const clash = clashes(v.vote, req);
    const rules = clash ? 'This vote disagrees with the rules' : changed(req) && v.vote !== 'review' ? 'This vote agrees with the rules' : '';
    const who = r.why === 'rules' ? 'Rules' : changed(req) ? 'Model' : 'Rules, no change';
    return { discipline: DISCIPLINE_LABEL[v.discipline], who, vote: VOTE_WORD[v.vote], confidence: v.confidence.toFixed(2), sure: Number(v.confidence.toFixed(2)) >= JEV_ACCEPT_CONFIDENCE, reason: reasonLine(building, req), rules, clash };
  });
  const n = bubbles.filter((b) => b.clash).length;
  const title = r.why === 'pending' ? 'Review panel'
    : r.why === 'strands' ? 'Review panel: the model'
    : r.why === 'rules' ? 'Review panel: rules only'
    : r.why === 'down' ? 'Review panel is off'
    : 'Review panel: no votes';
  const summary = !voted ? (r.why === 'pending' ? 'Votes only. They never change an answer: the rules decide.' : 'The rules still decide every answer.')
    : n > 0 ? `${n} vote${n === 1 ? '' : 's'} ${n === 1 ? 'disagrees' : 'disagree'} with the rules. The rules decide every answer.`
    : 'Votes only. They never change an answer: the rules decide.';
  return { title, source: sourceText(r), bubbles, summary };
}
