// vote(): the review panel's votes after one edit, one JevVote per discipline (ADR 0002, tier 3).
// A vote is a bubble only: it never changes an answer, the solver decides. Owner: P1.
// - DECIDER=strands: one Strands call asks one question (accept, object or review) for each
//   discipline whose answer the edit changed, with what the rules found before and after it. The
//   model's own choice and confidence go into the JevVote, so a vote can disagree with the rules;
//   the app shows that disagreement. The rules vote the disciplines the edit did not change: a
//   question costs about 1 s on a CPU (5 took 6.5 s), and the 1 or 2 that changed fit the budget.
// - DECIDER=keywords, or Strands down, slow, busy or unusable: the rules vote (plan C, below).
//   Unlike a parse, a vote changes nothing, so falling back to the rules is safe.
import type { Discipline, Edit, JevVote, JevVoteRequest, SolverResult, Vote } from '../contract/types.ts';
import { DISCIPLINES, VOTES } from '../contract/types.ts';
import type { DeciderConfig } from './parse.ts';
import { askStrands, readChoice } from './strands.ts';

export const MAX_VOTE_REQUESTS = DISCIPLINES.length; // one per discipline
// The app waits 2.5 s for its votes (app/votes.ts); the model gets 2 s of it, so the rules can still
// answer in time when the model is slow.
export const VOTE_TIMEOUT_MS = 2000;

export type Voter = 'strands' | 'rules';

// The model is asked only about these; the app labels the others "Rules, no change" by the same test.
export const changed = (r: JevVoteRequest): boolean => r.before.status !== r.after.status;

// Plan C: the rules vote from what the edit did to this discipline's question. Yes after the edit
// is accept; Yes before and No after is object (the edit broke it); No before and after is review.
export function ruleVote(r: JevVoteRequest): JevVote {
  const vote: Vote = r.after.status === 'pass' ? 'accept' : r.before.status === 'pass' ? 'object' : 'review';
  return { token: r.after.token, discipline: r.discipline, vote, confidence: 1 };
}

const DISCIPLINE_TEXT: Record<Discipline, string> = {
  mep: 'MEP (mechanical plant)', logistics: 'logistics (moving large things in and out)', accessibility: 'accessibility',
  structure: 'structure', life_safety: 'life safety (getting people out)', fire: 'fire', plumbing: 'plumbing', electrical: 'electrical',
};

const VOTE_TEXT: Record<Vote, string> = {
  accept: 'accept the edit: it is fine for this discipline',
  object: 'object to the edit: it makes things worse for this discipline',
  review: 'ask a person to review it: not clear either way',
};

const resultText = (r: SolverResult): string =>
  r.status === 'pass' ? 'Yes' : `No, ${r.reason ?? 'no_route'}${r.blocked_at ? ` at ${r.blocked_at}` : ''}`;

const editText = (e: Edit): string => `${e.op} ${e.target ?? ''}${e.value !== null ? ` to ${e.value} m` : ''}`.trim();

// The Strands question for one discipline. Ids and enum words only, so nothing typed by a person
// reaches the frame unquoted.
function question(r: JevVoteRequest) {
  return {
    type: 'choice',
    instructions: `You review this edit for ${DISCIPLINE_TEXT[r.discipline]}. The question about the ${r.after.token}: the building rules said, before the edit: ${resultText(r.before)}; after it: ${resultText(r.after)}. Do you accept the edit?`,
    criteria: { ...VOTE_TEXT },
  };
}

export async function vote(requests: readonly JevVoteRequest[], config: DeciderConfig): Promise<{ votes: JevVote[]; voter: Voter }> {
  const rules = () => ({ votes: requests.map(ruleVote), voter: 'rules' as const });
  const asked = requests.filter(changed);
  if (config.decider !== 'strands' || asked.length === 0) return rules();
  if (config.strands === undefined) throw new Error('DECIDER=strands needs a Strands config');
  const body = {
    state: `An edit was made to a building: ${JSON.stringify(editText(asked[0]!.edit))}. Each question is one discipline's review of that edit.`,
    // Keys are discipline enum words (checked by the schema), never an inherited key name.
    questions: Object.fromEntries(asked.map((r) => [r.discipline, question(r)])),
  };
  const reply = await askStrands(body, { ...config.strands, timeoutMs: Math.min(config.strands.timeoutMs, VOTE_TIMEOUT_MS) });
  if ('why' in reply) {
    console.error(`strands votes: ${reply.why}; the rules vote instead`);
    return rules();
  }
  const votes: JevVote[] = [];
  for (const r of requests) {
    if (!changed(r)) {
      votes.push(ruleVote(r));
      continue;
    }
    const a = readChoice(reply.answers, r.discipline, VOTES, null);
    if (a === null) {
      console.error(`strands votes: no usable vote for ${r.discipline}; the rules vote instead`);
      return rules();
    }
    votes.push({ token: r.after.token, discipline: r.discipline, vote: a.choice as Vote, confidence: a.confidence });
  }
  return { votes, voter: 'strands' };
}
