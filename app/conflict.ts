// The conflict moment: an edit that fixes one answer can turn another from Yes to No (widening the
// shaft for the chiller cuts beam B2, and the structure stops holding). Pure, so Node tests can
// check it. Words: design/copy.md, "Yes" and "No", never a game word. Owner: P3.
import type { Building, SolverResult } from '../contract/types.ts';
import { tokenName } from '../viewer/labels.ts';
import { newlyBlocked } from './flow.ts';
import { questionOf } from './questions.ts';
import { stuckLine } from './scoreboard.ts';

export interface Conflict {
  title: string; // "Widen plant shaft to 2.0 m broke an answer"
  lines: string[]; // one per broken answer: the question, then where it is stuck now
}

// What the last edit broke: the answers that were Yes in `before` and are No in `after`. Null before
// the first run (`before` is null) and when nothing flipped.
export function conflictOf(
  before: readonly SolverResult[] | null, after: readonly SolverResult[], editLabel: string, building: Building,
): Conflict | null {
  const broken = newlyBlocked(before, after);
  if (broken.length === 0) return null;
  return {
    title: `${editLabel} broke ${broken.length === 1 ? 'an answer' : `${broken.length} answers`}`,
    lines: broken.map((r) => `${questionOf(r.token)?.ask ?? tokenName(r.token)} Yes became No. ${stuckLine(building, r)}`),
  };
}
