// Escape Plan contract: the frozen formats every folder builds against.
// Owner: P1. Do not edit outside a merge point (see contract/README.md).
// Units: metres and kN. Ids are strings, unique inside their list.
// Tier marks: T1 = must ship, T2 = tier 2, T3 = tier 3. Unmarked = T1.
// Every enum here is also in contract/schema/*.json; contract.test.ts checks they match.

export type Id = string;

// ---------- 4.1 building.json ----------

export const NODE_TYPES = [
  'room', 'corridor', 'plant', 'shaft', 'stair', 'elevator', 'terrace',
  'lobby', 'street', 'truck', 'panel', 'kitchen',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_KINDS = [
  'door', 'opening', 'shaft', 'stair', 'elevator', 'ramp', 'step',
  'drain_route', // T2
  'supply', // T3
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const MEMBER_KINDS = ['column', 'beam', 'transfer_beam', 'foundation'] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];

export const DISCIPLINES = [
  'mep', // chiller
  'logistics', // glass panel, sofa
  'accessibility', // wheelchair
  'structure', // load
  'life_safety', // people (T1 walk out; T2 race with smoke)
  'fire', // smoke (T2)
  'plumbing', // water (T2)
  'electrical', // power (T3)
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const RULES = [
  'clearance', // T1 chiller
  'corner_turn', // T1 glass
  'no_steps', // T1 wheelchair
  'downward', // T1 load
  'shortest_exit', // T1 people walk out (T2: the race with smoke)
  'spread', // T2 smoke
  'downhill', // T2 water
  'supply', // T3 electrical
] as const;
export type Rule = (typeof RULES)[number];

export interface Level {
  id: Id;
  elevation: number; // metres, finished floor
}

export interface Box {
  x: number; // plan position of the min corner, metres
  y: number;
  width: number; // along x
  depth: number; // along y
}

export interface BuildingNode {
  id: Id;
  name: string;
  level: Id; // Level.id
  type: NodeType;
  box: Box;
  is_exit: boolean;
  invert?: number; // T2: drain elevation, metres
}

// Edges are two-way, except `drain_route` and `supply`, which run only from `from` to `to`.
export interface Edge {
  id: Id;
  name: string;
  from: Id; // BuildingNode.id
  to: Id; // BuildingNode.id
  kind: EdgeKind;
  clear_width: number; // metres
  clear_height: number; // metres
  step_height: number; // metres; 0 = level
  corner_a?: number; // corridor width before a 90-degree turn, metres
  corner_b?: number; // corridor width after the turn, metres
  open?: boolean; // T2: smoke passes through
  crosses?: Id[]; // Member.id list this edge passes through
  cuts_above_width?: number; // if clear_width > this, every member in `crosses` is cut
  sleeved?: boolean; // T2: a drain may pass the members it crosses
}

export interface Member {
  id: Id;
  kind: MemberKind;
  level: Id; // Level.id
  supported_by: Id[]; // Member.id list; [] for a foundation, non-empty for every other kind
  node?: Id; // BuildingNode.id where the viewer draws it (for the load's red X)
}

export interface TokenSize {
  width: number; // metres
  height: number;
  length: number;
}

export interface Token {
  id: Id;
  discipline: Discipline;
  start: Id; // BuildingNode.id; for rule `downward`, a Member.id
  goal: Id | null; // BuildingNode.id; null = any node with is_exit (or any foundation for `downward`)
  size: TokenSize;
  rule: Rule;
}

export interface Building {
  note?: string; // free text, for example "EXAMPLE building, not real answers"
  levels: Level[];
  nodes: BuildingNode[];
  edges: Edge[];
  members: Member[];
  tokens: Token[];
}

// ---------- 4.2 solver output ----------

export const STATUSES = ['pass', 'fail'] as const;
export type Status = (typeof STATUSES)[number];

export const REASONS = [
  'too_narrow', 'too_low', 'cannot_turn', 'step', 'no_support',
  'smoke_first', // T2
  'uphill', // T2
  'crosses_beam', // T2
  'no_supply', // T3
  'no_route',
] as const;
export type Reason = (typeof REASONS)[number];

// One record per token. Deterministic; the solver must answer in under 100 ms.
export interface SolverResult {
  token: Id;
  status: Status;
  path: Id[]; // node ids walked (member ids for `downward`); on fail, up to blocked_at
  blocked_at: Id | null; // edge, node or member id where it failed; null on pass
  reason: Reason | null; // null on pass
  needed: number | null; // what the token needs at blocked_at (for example width in metres)
  available: number | null; // what the building gives there
  time?: number | null; // people and smoke only: T1 people, edges walked; T2 smoke, time steps
}

// ---------- 4.3 edits ----------

export const EDIT_OPS = [
  'widen', 'add_transfer_beam', 'add_ramp',
  'close_door', // T2 (acts on `open`)
  'add_sleeve', // T2
  'reset',
] as const;
export type EditOp = (typeof EDIT_OPS)[number];

export const EDIT_SOURCES = [
  'button',
  'text', // T2 (Jev parse)
  'voice', // T3
  'phone', // T3
] as const;
export type EditSource = (typeof EDIT_SOURCES)[number];

// What each op does (applyEdits in solver/ follows this; contract/README.md has the table):
// widen <edge> <metres>: clear_width = value; corner_a and corner_b, where set, become at least value.
// add_transfer_beam <member>: the member becomes kind 'transfer_beam'; a transfer beam is never cut.
// add_ramp <edge>: kind = 'ramp', step_height = 0.
// close_door <edge> (T2): open = false.   add_sleeve <edge> (T2): sleeved = true.
// reset: back to data/building.json; target and value are null.
export interface Edit {
  op: EditOp;
  target: Id | null; // edge id, or member id for add_transfer_beam; null for reset
  value: number | null; // widen: metres; null for every other op
  source: EditSource;
}

export type EditList = Edit[];

// ---------- 4.3 Jev parse (T2) ----------

export const JEV_ACCEPT_CONFIDENCE = 0.8; // below this, show "Did you mean" and the buttons
export const JEV_MAX_TARGETS = 255;

export interface JevTargetOption {
  id: Id;
  name: string;
}

// What the app asks: three typed questions about one sentence.
export interface JevParseRequest {
  text: string;
  ops: EditOp[]; // choice list for "which op"
  targets: JevTargetOption[]; // on-screen ids and names, at most JEV_MAX_TARGETS
  value_range: { min: number; max: number }; // declared range for "what value"
}

export interface JevChoice<T extends string> {
  choice: T;
  confidence: number; // 0..1
}

export interface JevScore {
  score: number; // inside value_range
  confidence: number; // 0..1
}

// What comes back (from Jev, plan B LLM, or plan C keyword parser: same shape).
export interface JevParse {
  op: JevChoice<EditOp>;
  target: JevChoice<Id>;
  value: JevScore | null;
}

// ---------- 4.3 Jev votes (T3) ----------

export const VOTES = ['accept', 'object', 'review'] as const;
export type Vote = (typeof VOTES)[number];

export interface JevVoteRequest {
  discipline: Discipline;
  edit: Edit;
  before: SolverResult;
  after: SolverResult;
}

// Shown as a bubble only. Token colour always comes from the solver.
export interface JevVote {
  token: Id;
  discipline: Discipline;
  vote: Vote;
  confidence: number; // 0..1
}

// ---------- 4.3 phone messages (T3, WebSocket on the local network) ----------

export type PhoneToApp =
  | { type: 'join'; token: Id }
  | { type: 'escape'; token: Id }
  | { type: 'vote'; token: Id; vote: Vote };

export type AppToPhone = { type: 'result'; result: SolverResult };

// ---------- data/expected.json (P5's hand-checked truth) ----------

// Like SolverResult, but only the fields P5 checked by hand. Omitted = not checked.
export interface ExpectedResult {
  token: Id;
  status: Status;
  blocked_at?: Id | null;
  reason?: Reason | null;
  path?: Id[];
}

export interface ExpectedCase {
  id: Id;
  description: string;
  edits: Edit[]; // applied in order to data/building.json; [] = base building
  expect: ExpectedResult[];
}

export interface ExpectedFile {
  note?: string;
  cases: ExpectedCase[];
}
