// Pure geometry for the structure: where each member (foundation, column, beam) is drawn, which
// beam flashes red when the load has lost its support, and where the flash after an edit sits. No
// three.js here, so Node tests can check it. Owner: P2.
import type { Building, Id, MemberKind, SolverResult } from '../contract/types.ts';
import { doorPoint, FOUNDATION_DEPTH, PATH_LIFT, STOREY_HEIGHT, type Vec3 } from './layout.ts';

export const FOUNDATION_PLAN = 2.4; // metres, the footing's side
export const COLUMN_SIDE = 0.9; // metres
export const BEAM_DEPTH = 0.6; // metres, hung under the floor of its level
export const BEAM_WIDTH = 0.7; // metres
export const TRANSFER_DEPTH = 1.8; // a transfer beam is this many times deeper than a beam
export const BEAM_STUB = 3; // metres, a beam with no support node to run to

export interface MemberBox {
  id: Id;
  kind: MemberKind;
  center: Vec3; // viewer metres: x = plan x, y = up, z = plan y
  size: Vec3; // along its own length (x), up, across (z); a column and a footing are as built
  yaw: number; // radians about the vertical axis, so a beam can point at its column; 0 for the rest
}

// Each member that has a node, drawn at that node's plan centre. A foundation is a footing under its
// level. A column rises to the highest level of the members it holds up. A beam runs from its own
// node to the node of the member that holds it up, so a load path reads as beam, column, footing.
export function memberBoxes(b: Building): MemberBox[] {
  const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
  const nodes = new Map(b.nodes.map((n) => [n.id, n]));
  const members = new Map(b.members.map((m) => [m.id, m]));
  const at = (id: Id | undefined): { x: number; z: number } | null => {
    const n = id === undefined ? undefined : nodes.get(id);
    return n ? { x: n.box.x + n.box.width / 2, z: n.box.y + n.box.depth / 2 } : null;
  };
  const out: MemberBox[] = [];
  for (const m of b.members) {
    const here = at(m.node);
    if (!here) continue;
    const floor = elevation.get(m.level) ?? 0;
    const box = (kind: MemberKind, cy: number, size: Vec3, cx = here.x, cz = here.z, yaw = 0): void => {
      out.push({ id: m.id, kind, center: [cx, cy, cz], size, yaw });
    };
    if (m.kind === 'foundation') {
      box(m.kind, floor - FOUNDATION_DEPTH / 2, [FOUNDATION_PLAN, FOUNDATION_DEPTH, FOUNDATION_PLAN]);
    } else if (m.kind === 'column') {
      const held = b.members.filter((o) => o.supported_by.includes(m.id)).map((o) => elevation.get(o.level) ?? floor);
      const top = held.length > 0 ? Math.max(...held) : floor + STOREY_HEIGHT;
      box(m.kind, (floor + top) / 2, [COLUMN_SIDE, top - floor, COLUMN_SIDE]);
    } else {
      const far = m.supported_by.map((id) => at(members.get(id)?.node)).find((p) => p !== null && p !== undefined) ?? null;
      const depth = m.kind === 'transfer_beam' ? BEAM_DEPTH * TRANSFER_DEPTH : BEAM_DEPTH;
      const cy = floor - depth / 2;
      if (!far) {
        box(m.kind, cy, [BEAM_STUB, depth, BEAM_WIDTH]);
        continue;
      }
      const dx = far.x - here.x;
      const dz = far.z - here.z;
      box(m.kind, cy, [Math.hypot(dx, dz), depth, BEAM_WIDTH], (here.x + far.x) / 2, (here.z + far.z) / 2, Math.atan2(-dz, dx));
    }
  }
  return out;
}

// The members to flash red: where a load has no support, the member the solver blocked at.
export function flashingMembers(results: readonly SolverResult[]): Id[] {
  return results.filter((r) => r.status === 'fail' && r.reason === 'no_support' && r.blocked_at !== null).map((r) => r.blocked_at!);
}

// Where the flash after an edit goes: on the door or shaft an edit widens or ramps (between its two
// floors), or on the member an edit changes. Null for an id that is neither.
export function flashPoint(b: Building, id: Id): Vec3 | null {
  const edge = b.edges.find((e) => e.id === id);
  if (edge) {
    const from = b.nodes.find((n) => n.id === edge.from);
    const to = b.nodes.find((n) => n.id === edge.to);
    if (!from || !to) return null;
    const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
    const [x, z] = doorPoint(from.box, to.box);
    return [x, ((elevation.get(from.level) ?? 0) + (elevation.get(to.level) ?? 0)) / 2 + PATH_LIFT, z];
  }
  return memberBoxes(b).find((m) => m.id === id)?.center ?? null;
}

// The structure is hidden until something needs it, so the view stays clean: a question whose answer
// depends on it (the load, and the chiller, whose shaft crosses beam B2), a member the load has lost
// its support at, or an edit that touched a member or an opening that crosses one (`touched`).
const STRUCTURE_QUESTIONS: ReadonlySet<Id> = new Set(['load', 'chiller']);

export function touchesStructure(b: Building, id: Id): boolean {
  return b.members.some((m) => m.id === id) || (b.edges.find((e) => e.id === id)?.crosses?.length ?? 0) > 0;
}

export function structureWanted(b: Building, results: readonly SolverResult[], touched: Id | null): boolean {
  return results.some((r) => STRUCTURE_QUESTIONS.has(r.token)) || flashingMembers(results).length > 0
    || (touched !== null && touchesStructure(b, touched));
}

// A member's name and one plain line from the data on where its load goes: "Beam B2" / "holds up the
// plant floor, sits on column C1". The drawing is a schematic load path, not the real tower's
// structure, so the lines name only what the data has (no sizes, materials or capacities). The data
// has no names for members: the kind in words and the id's last part ("beam-b2" -> "B2").
export const LOAD_PATH_TAG = 'Simplified load path';
const KIND_WORD: Record<MemberKind, string> = { foundation: 'Footing', column: 'Column', beam: 'Beam', transfer_beam: 'Transfer beam' };
const shortId = (id: Id): string => (id.split(/[-_]/).pop() ?? id).toUpperCase();

// `cut`: the members the load has lost its support at (flashingMembers). Their lines say so, as the
// answer does, instead of the support the data drew for them.
export function memberTag(b: Building, id: Id, cut: ReadonlySet<Id> = new Set()): { name: string; line: string } | null {
  const m = b.members.find((x) => x.id === id);
  if (!m) return null;
  const named = (ids: readonly Id[]): string => ids.map((i) => b.members.find((x) => x.id === i))
    .filter((x) => x !== undefined).map((x) => `${KIND_WORD[x.kind].toLowerCase()} ${shortId(x.id)}`).join(' and ');
  const name = `${KIND_WORD[m.kind]} ${shortId(m.id)}`;
  const below = named(m.supported_by);
  if (m.kind === 'foundation') return { name, line: 'the load path ends here' };
  if (m.kind === 'column') {
    const on = b.members.filter((o) => o.supported_by.includes(m.id)).map((o) => o.id);
    const held = named(on.filter((o) => !cut.has(o)));
    const lost = named(on.filter((o) => cut.has(o)));
    if (!held && lost) return { name, line: `${lost} no longer rests on it` };
    return { name, line: [held ? `carries ${held}` : 'carries the load', below ? `down to ${below}` : ''].filter(Boolean).join(' ') };
  }
  // A beam holds up the floor of the room it sits in: "Mechanical level plant" -> "the plant floor".
  const room = b.nodes.find((n) => n.id === m.node)?.name.trim().split(/\s+/).pop()?.toLowerCase();
  const rests = cut.has(m.id) ? 'no path down to a foundation' : below ? `sits on ${below}` : '';
  return { name, line: [room ? `holds up the ${room} floor` : 'holds up its floor', rests].filter(Boolean).join(', ') };
}
