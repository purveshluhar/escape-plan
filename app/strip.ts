// The "who decided" strip (FINDINGS option A): the typed sentence, what the reader made of it with
// a confidence per part, then what the building rules said. Pure, so Node tests check it. Owner: P3.
// Words follow design copy: Yes / No, "edit" for a building change, sentence case.
import type { Building, EditOp, SolverResult } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { tokenName } from '../viewer/labels.ts';
import type { Reading } from './parse-client.ts';
import { PARSE_TIMEOUT_MS } from './parse-client.ts';
import { REASON_TEXT, numbersText, placeName } from './scoreboard.ts';

export interface StripRow {
  name: 'Edit' | 'Where' | 'Size';
  text: string;
  confidence: number;
}

export interface StripModel {
  typed: string;
  reader: string; // who read the sentence
  source: string; // the x-decider header value, and why this reader answered
  rows: StripRow[];
  sure: boolean; // the edit was made
  lowest: number;
  verdict: string;
}

const OP_TEXT: Record<EditOp, string> = {
  widen: 'Widen', add_transfer_beam: 'Add transfer beam', add_ramp: 'Add ramp',
  close_door: 'Close door', add_sleeve: 'Add sleeve', reset: 'Undo edits',
};

// At least one decimal: "2.0 m", "1.5 m", "1.17 m".
export function metresText(v: number): string {
  const s = String(Number(v.toFixed(2)));
  return `${s.includes('.') ? s : `${s}.0`} m`;
}

// A no-break space between a number and its unit, so "0.15 m" never wraps as "0.15" and "m".
const NBSP = '\u00a0';
const keepUnits = (s: string): string => s.replace(/(\d) (m|s|ms)\b/g, `$1${NBSP}$2`);
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const LOCAL = 'so this page read it';

function sourceText(r: Reading): string {
  switch (r.why) {
    case 'strands': return `x-decider: strands - on this computer, ${seconds(r.ms)}`;
    case 'keywords': return `x-decider: keywords - the server reads by keywords, ${LOCAL}`;
    case 'down': return `x-decider: none - the server is not reachable, ${LOCAL}`;
    case 'slow': return `x-decider: none - the server took over ${seconds(PARSE_TIMEOUT_MS)}, ${LOCAL}`;
    case 'refused': return `x-decider: ${r.decider ?? 'none'} - the server answer could not be used, ${LOCAL}`;
    case 'no-model': return `x-decider: strands - the model gave no answer (down or busy), ${LOCAL}`;
  }
}

export function stripModel(r: Reading, building: Building): StripModel {
  const { parse, edit } = r.out;
  const rows: StripRow[] = [
    { name: 'Edit', text: OP_TEXT[parse.op.choice], confidence: parse.op.confidence },
    { name: 'Where', text: parse.target.choice ? placeName(building, parse.target.choice) : '-', confidence: parse.target.confidence },
  ];
  if (parse.op.choice === 'widen' && parse.value) rows.push({ name: 'Size', text: metresText(parse.value.score), confidence: parse.value.confidence });
  const lowest = Math.min(...rows.map((x) => x.confidence));
  const sure = edit !== null;
  const verdict = sure ? `Every part is ${JEV_ACCEPT_CONFIDENCE.toFixed(2)} or more, so the edit was made.`
    : lowest < JEV_ACCEPT_CONFIDENCE ? `Not sure (${lowest.toFixed(2)}). Nothing was changed.`
    : 'Not sure: that is not one of the edits offered here. Nothing was changed.';
  return {
    typed: r.text, reader: r.reader === 'strands' ? 'Strands Decider' : 'Keyword reader in this page',
    source: keepUnits(sourceText(r)), rows, sure, lowest, verdict,
  };
}

export interface AnswerLine {
  name: string;
  answer: 'Yes' | 'No';
  detail: string; // empty for Yes
}

// One line per answer from the building rules.
export function answerLines(results: readonly SolverResult[], building: Building): AnswerLine[] {
  return results.map((r) => {
    if (r.status === 'pass') return { name: tokenName(r.token), answer: 'Yes', detail: '' };
    const where = r.blocked_at ? ` at ${placeName(building, r.blocked_at)}` : '';
    const nums = numbersText(r);
    return { name: tokenName(r.token), answer: 'No', detail: keepUnits(`Stuck${where}: ${REASON_TEXT[r.reason ?? 'no_route']}${nums ? `, ${nums}` : ''}`) };
  });
}
