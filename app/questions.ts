// The person behind each token and the question they ask about their building (design/copy.md,
// section 2). The screen shows the question, never the word "token". Pure, so Node tests can
// check it. Owner: P3.
import type { Id } from '../contract/types.ts';
import { tokenName } from '../viewer/labels.ts';

export interface Question {
  person: string; // who asks: "Home buyer"
  ask: string; // the question on the chip and the card: "Can my sofa get in?"
  yes: string; // the answer line when the solver says pass: "The sofa gets in"
  plural: boolean; // "People are stuck", not "People is stuck"
}

export const QUESTIONS: Readonly<Record<Id, Question>> = {
  wheelchair: { person: 'Family', ask: "Can my parent's wheelchair get out?", yes: 'The wheelchair gets out, no steps', plural: false },
  sofa: { person: 'Home buyer', ask: 'Can my sofa get in?', yes: 'The sofa gets in', plural: false },
  people: { person: 'Building manager', ask: 'Can everyone get out?', yes: 'Everyone gets out', plural: true },
  chiller: { person: 'Building owner', ask: 'Can I widen this shaft for a new chiller?', yes: 'The chiller fits through the shaft', plural: false },
  load: { person: 'Building owner', ask: 'Does the structure still hold?', yes: 'The structure still holds', plural: false },
  glass: { person: 'Building owner', ask: 'Can a 4 m glass panel get into the lobby?', yes: 'The glass panel gets into the lobby', plural: false },
};

export function questionOf(id: Id): Question | null {
  return Object.hasOwn(QUESTIONS, id) ? QUESTIONS[id]! : null;
}

// The yes line, or a plain one for a token copy.md has no question for yet.
export function yesLine(id: Id): string {
  return questionOf(id)?.yes ?? `${tokenName(id)} gets through`;
}

const edits = (n: number): string => (n === 0 ? 'As built, no edits.' : `With ${n} edit${n === 1 ? '' : 's'}.`);

// The banner when every answer is yes: "Yes" for one question, "Yes to all 3" for more, then the
// yes lines and the edit count. No score, no count of tries.
export function allYesText(ids: readonly Id[], editCount: number): { title: string; lines: string } {
  return {
    title: ids.length === 1 ? 'Yes' : `Yes to all ${ids.length}`,
    lines: [...ids.map((id) => `${yesLine(id)}.`), edits(editCount)].join(' '),
  };
}
