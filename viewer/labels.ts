// Words next to the red X when the answer is No (design/copy.md, section 3): a title and a line
// with the place and the numbers. Sentence case, calm. Pure, so it is easy to test.
import type { Building, Reason, SolverResult } from '../contract/types.ts';

// The same words as REASON_TEXT in app/scoreboard.ts (the viewer does not import from app/).
const REASON_WORDS: Record<Reason, string> = {
  too_narrow: 'too narrow',
  too_low: 'too low',
  cannot_turn: 'cannot turn the corner',
  step: 'step in the way',
  no_support: 'nothing holds it up',
  smoke_first: 'smoke gets there first',
  uphill: 'runs uphill',
  crosses_beam: 'crosses a beam',
  no_supply: 'no power reaches it',
  no_route: 'no way through',
};

const METRES: ReadonlySet<Reason> = new Set(['too_narrow', 'too_low', 'cannot_turn']);

// At least one decimal, so a measurement reads as one: 2 -> "2.0", 1.17 -> "1.17".
const num = (n: number): string => {
  const s = n.toFixed(2);
  return s.endsWith('0') ? s.slice(0, -1) : s;
};

// A member has no name in the data: "beam-b2" -> "beam B2" (as app/scoreboard.ts placeName).
const memberName = (id: string): string => {
  const parts = id.split(/[-_]/);
  const last = parts.pop() ?? id;
  return [...parts, last.toUpperCase()].join(' ');
};

export interface FailText {
  title: string; // "Chiller: too narrow"
  detail: string; // "Plant shaft: needs 1.6 m, has 1.2 m"
}

export function failText(b: Building, r: SolverResult): FailText | null {
  if (r.status !== 'fail') return null;
  const label = tokenName(r.token);
  const reason = r.reason ?? 'no_route';
  const place = b.edges.find((e) => e.id === r.blocked_at)?.name
    ?? b.nodes.find((n) => n.id === r.blocked_at)?.name
    ?? (r.blocked_at && b.members.some((m) => m.id === r.blocked_at) ? memberName(r.blocked_at) : r.blocked_at);

  let numbers = '';
  if (reason === 'step' && r.available !== null) numbers = `${num(r.available)} m high, needs level`;
  else if (reason === 'no_support') numbers = 'no path down to a foundation';
  else if (r.needed !== null && r.available !== null) {
    const unit = METRES.has(reason) ? ' m' : '';
    numbers = `needs ${num(r.needed)}${unit}, has ${num(r.available)}${unit}`;
  }
  const detail = [place, numbers].filter(Boolean).join(': ');
  return { title: `${label}: ${REASON_WORDS[reason]}`, detail };
}

// Where each fail label goes: right of its red X, left of it, or above it (never below: the
// token sits there). Labels are placed top to bottom; each takes the spot whose box overlaps the
// fewest red Xs and already placed labels, counting a box past the free screen's edge as a clash
// too. Ties go right, then left.
export interface LabelSpot {
  x: number; // red X centre on screen, pixels
  y: number;
  width: number; // label box width, pixels
}
export interface LabelLayout {
  height: number; // label box height
  gap: number; // from the X centre to the near edge of the box
  minX: number; // free screen, left and right edges
  maxX: number;
  xSize?: number; // half the size of a red X
}

interface Rect { l: number; r: number; t: number; b: number }
const overlaps = (a: Rect, b: Rect): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export type LabelSide = 'right' | 'left' | 'above';
const SIDES: LabelSide[] = ['right', 'left', 'above'];

export function labelSides(spots: LabelSpot[], layout: LabelLayout): LabelSide[] {
  const { height, gap, minX, maxX, xSize = 26 } = layout;
  const marks: Rect[] = spots.map((p) => ({ l: p.x - xSize, r: p.x + xSize, t: p.y - xSize, b: p.y + xSize }));
  const placed: Rect[] = [];
  const sides: LabelSide[] = new Array(spots.length).fill('right');
  const order = spots.map((_, i) => i).sort((a, b) => spots[a]!.y - spots[b]!.y);
  for (const i of order) {
    const p = spots[i]!;
    const box = (side: LabelSide): Rect => {
      if (side === 'above') {
        const b = p.y - xSize - 6;
        return { l: p.x - p.width / 2, r: p.x + p.width / 2, t: b - height, b };
      }
      const l = side === 'right' ? p.x + gap : p.x - gap - p.width;
      return { l, r: l + p.width, t: p.y - height / 2, b: p.y + height / 2 };
    };
    const clashes = (r: Rect): number =>
      marks.filter((m, j) => j !== i && overlaps(r, m)).length
      + placed.filter((q) => overlaps(r, q)).length
      + (r.l < minX || r.r > maxX ? 1 : 0);
    let best: { side: LabelSide; rect: Rect; n: number } | null = null;
    for (const side of SIDES) {
      const rect = box(side);
      const n = clashes(rect);
      if (!best || n < best.n) best = { side, rect, n };
    }
    sides[i] = best!.side;
    placed.push(best!.rect);
  }
  return sides;
}

// About how wide a fail label is in pixels, from its text (14 px title, 15 px detail).
export function labelWidth(text: FailText): number {
  return Math.max(text.title.length * 10, text.detail.length * 7.6) + 28;
}

// The words on a room: its name, and "exit" on the way out (so the goal reads before a run).
export function roomLabel(name: string, isExit: boolean): string {
  return isExit ? `${name} - exit` : name;
}

// A token's name for people: its id in words ("sofa" -> "Sofa"). Two tokens can share a
// discipline (glass and sofa are both logistics), so the discipline label cannot name them.
export function tokenName(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
