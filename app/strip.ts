// The "who decided" strip (FINDINGS option A): the typed sentence, what the reader made of it with
// a confidence per part, then what the building rules said. Pure, so Node tests check it. Owner: P3.
// Words follow design copy: Yes / No, "edit" for a building change, sentence case.
import type { Building, EditOp, SolverResult } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { tokenName } from '../viewer/labels.ts';
import type { Reading } from './parse-client.ts';
import { PARSE_TIMEOUT_MS } from './parse-client.ts';
import { questionOf } from './questions.ts';
import { REASON_TEXT, numbersText, placeName } from './scoreboard.ts';

const nameOf = (token: string): string => questionOf(token)?.subject ?? tokenName(token);

export interface StripRow {
  name: 'Edit' | 'Where' | 'Size';
  text: string;
  confidence: number;
}

export interface StripModel {
  typed: string;
  reader: string; // who read the sentence: "the model" or "this page"
  source: string; // why this reader answered, in words (the x-decider header is never shown)
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

// Why this reader read the sentence, in plain words; the header line says who ("Read by: this page").
function sourceText(r: Reading): string {
  switch (r.why) {
    case 'strands': return `On this computer, ${seconds(r.ms)}.`;
    case 'keywords': return 'The server reads by keywords.';
    case 'down': return 'The server is not reachable.';
    case 'slow': return `The server took over ${seconds(PARSE_TIMEOUT_MS)}.`;
    case 'refused': return 'The server answer could not be used.';
    case 'no-model': return 'The model gave no answer (down or busy).';
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
    typed: r.text, reader: r.reader === 'strands' ? 'the model' : 'this page',
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
    if (r.status === 'pass') return { name: nameOf(r.token), answer: 'Yes', detail: '' };
    const where = r.blocked_at ? ` at ${placeName(building, r.blocked_at)}` : '';
    const nums = numbersText(r);
    return { name: nameOf(r.token), answer: 'No', detail: keepUnits(`Stuck${where}: ${REASON_TEXT[r.reason ?? 'no_route']}${nums ? `, ${nums}` : ''}`) };
  });
}

// Where the model goes while the strip is open, so the strip never covers the answer it explains.
// On a wide screen it moves right of the strip; on a laptop, where the room beside it is too narrow,
// it lifts above the strip; when neither leaves enough room, it stays where it is. Pixels.
export const STRIP_GAP = 16; // kept between the strip and the model
const WIDE = 1500; // screens this wide and wider move the model beside the strip
const MIN_MODEL_WIDTH = 480; // the least free width the model is framed in beside the strip
const MIN_MODEL_HEIGHT = 300; // the least free height the model is framed in above the strip
export function stripInsets(s: {
  width: number; height: number; rightPanel: number;
  strip: { left: number; right: number; top: number } | null;
}): { left: number; bottom: number } {
  if (!s.strip) return { left: 0, bottom: 0 };
  const left = s.strip.right + STRIP_GAP;
  if (s.width >= WIDE && s.width - left - s.rightPanel >= MIN_MODEL_WIDTH) return { left, bottom: 0 };
  const above = s.strip.top - STRIP_GAP;
  return { left: 0, bottom: above >= MIN_MODEL_HEIGHT ? s.height - above : 0 };
}
