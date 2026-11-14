// Words for the fail moment (design/look.md): a title and a line of numbers next to the red X.
// Pure, so it is easy to test.
import type { Building, Reason, SolverResult } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';

const REASON_WORDS: Record<Reason, string> = {
  too_narrow: 'TOO NARROW',
  too_low: 'TOO LOW',
  cannot_turn: 'CANNOT TURN',
  step: 'STEP',
  no_support: 'NO SUPPORT',
  smoke_first: 'SMOKE FIRST',
  uphill: 'UPHILL',
  crosses_beam: 'CROSSES BEAM',
  no_supply: 'NO SUPPLY',
  no_route: 'NO ROUTE',
};

const METRES: ReadonlySet<Reason> = new Set(['too_narrow', 'too_low', 'cannot_turn']);

const num = (n: number): string => String(Math.round(n * 100) / 100);

export interface FailText {
  title: string; // "CHILLER  TOO NARROW"
  detail: string; // "Plant shaft: needs 1.6 m, has 1.2 m"
}

export function failText(b: Building, r: SolverResult): FailText | null {
  if (r.status !== 'fail') return null;
  const token = b.tokens.find((t) => t.id === r.token);
  const label = token ? DISCIPLINE_STYLE[token.discipline].label.toUpperCase() : r.token.toUpperCase();
  const reason = r.reason ?? 'no_route';
  const place = b.edges.find((e) => e.id === r.blocked_at)?.name
    ?? b.nodes.find((n) => n.id === r.blocked_at)?.name
    ?? r.blocked_at;

  let numbers = '';
  if (reason === 'step' && r.available !== null) numbers = `step ${num(r.available)} m, needs level`;
  else if (reason === 'no_support') numbers = 'no load path to a foundation';
  else if (r.needed !== null && r.available !== null) {
    const unit = METRES.has(reason) ? ' m' : '';
    numbers = `needs ${num(r.needed)}${unit}, has ${num(r.available)}${unit}`;
  }
  const detail = [place, numbers].filter(Boolean).join(': ');
  return { title: `${label}  ${REASON_WORDS[reason]}`, detail };
}

// Which side of its red X each fail label goes, given the X positions on screen (pixels).
// Labels are wide and short, so only Xs on about the same row can collide: the label goes away
// from the nearest of those. Default is the right.
export function labelSides(points: [number, number][], rowHeight = 60): ('left' | 'right')[] {
  return points.map((p, i) => {
    let dx = 0;
    for (const [j, q] of points.entries()) {
      const d = q[0] - p[0];
      if (j !== i && Math.abs(q[1] - p[1]) < rowHeight && (dx === 0 || Math.abs(d) < Math.abs(dx))) dx = d;
    }
    return dx > 0 ? 'left' : 'right';
  });
}
