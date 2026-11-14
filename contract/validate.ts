// Tiny JSON Schema checker for the subset our schemas use, plus building reference checks.
// No extra package on purpose (see docs/adr/0006). Owner: P1.
// Supported keywords: type, enum, const, required, properties, additionalProperties: false,
// items, minItems, maxItems, minimum, maximum, minLength, oneOf, $ref (local or sibling file).
// Using another keyword in a schema throws, so the checker never passes silently.

import building from './schema/building.schema.json' with { type: 'json' };
import solverOutput from './schema/solver-output.schema.json' with { type: 'json' };
import edits from './schema/edits.schema.json' with { type: 'json' };
import jev from './schema/jev.schema.json' with { type: 'json' };
import phone from './schema/phone.schema.json' with { type: 'json' };
import expected from './schema/expected.schema.json' with { type: 'json' };
import type { Building } from './types.ts';

type Schema = { [key: string]: unknown };

export const SCHEMAS: Record<string, Schema> = {
  'building.schema.json': building,
  'solver-output.schema.json': solverOutput,
  'edits.schema.json': edits,
  'jev.schema.json': jev,
  'phone.schema.json': phone,
  'expected.schema.json': expected,
};

const KNOWN = new Set([
  '$schema', '$id', '$defs', 'title', 'description', 'type', 'enum', 'const', 'required',
  'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minimum', 'maximum',
  'minLength', 'oneOf', '$ref',
]);

// ref: "building.schema.json" or "jev.schema.json#/$defs/parse". Returns error strings; [] = valid.
export function validate(ref: string, data: unknown): string[] {
  const { file, schema } = resolve(ref, '');
  const errors: string[] = [];
  check(schema, data, '$', file, errors);
  return errors;
}

function resolve(ref: string, currentFile: string): { file: string; schema: Schema } {
  const [filePart, pointer = ''] = ref.split('#');
  const file = filePart || currentFile;
  let node: unknown = SCHEMAS[file];
  if (!node) throw new Error(`unknown schema file: ${file}`);
  for (const key of pointer.split('/').filter(Boolean)) {
    node = (node as Schema)[key];
    if (node === undefined) throw new Error(`bad $ref: ${ref}`);
  }
  return { file, schema: node as Schema };
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(want: string, got: string): boolean {
  return want === got || (want === 'number' && got === 'integer');
}

function check(s: Schema, v: unknown, at: string, file: string, errors: string[]): void {
  for (const key of Object.keys(s)) {
    if (!KNOWN.has(key)) throw new Error(`schema keyword not supported by validate.ts: ${key} (${file})`);
  }
  if (typeof s.$ref === 'string') {
    const target = resolve(s.$ref, file);
    check(target.schema, v, at, target.file, errors);
    return;
  }
  if (Array.isArray(s.oneOf)) {
    const passing = s.oneOf.filter((sub) => {
      const e: string[] = [];
      check(sub as Schema, v, at, file, e);
      return e.length === 0;
    }).length;
    if (passing !== 1) errors.push(`${at}: must match exactly one option (matched ${passing})`);
    return;
  }
  const got = typeOf(v);
  if (s.type !== undefined) {
    const wants = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!wants.some((w) => typeMatches(w, got))) {
      errors.push(`${at}: expected ${wants.join(' or ')}, got ${got}`);
      return;
    }
  }
  if ('const' in s && v !== s.const) errors.push(`${at}: must be ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.includes(v as never)) {
    errors.push(`${at}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`);
  }
  if (typeof v === 'number') {
    if (typeof s.minimum === 'number' && v < s.minimum) errors.push(`${at}: must be >= ${s.minimum}`);
    if (typeof s.maximum === 'number' && v > s.maximum) errors.push(`${at}: must be <= ${s.maximum}`);
  }
  if (typeof v === 'string' && typeof s.minLength === 'number' && v.length < s.minLength) {
    errors.push(`${at}: must have at least ${s.minLength} characters`);
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === 'number' && v.length < s.minItems) errors.push(`${at}: needs at least ${s.minItems} items`);
    if (typeof s.maxItems === 'number' && v.length > s.maxItems) errors.push(`${at}: allows at most ${s.maxItems} items`);
    if (s.items) v.forEach((item, i) => check(s.items as Schema, item, `${at}[${i}]`, file, errors));
  }
  if (got === 'object') {
    const o = v as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, Schema>;
    for (const key of (s.required ?? []) as string[]) {
      if (!(key in o)) errors.push(`${at}: missing required field "${key}"`);
    }
    for (const [key, value] of Object.entries(o)) {
      const sub = props[key];
      if (sub) check(sub, value, `${at}.${key}`, file, errors);
      else if (s.additionalProperties === false) errors.push(`${at}: unknown field "${key}"`);
    }
  }
}

// Reference checks a schema cannot express: unique ids, and every id points at something real.
export function checkBuildingRefs(b: Building): string[] {
  const errors: string[] = [];
  const ids = (list: { id: string }[], what: string): Set<string> => {
    const seen = new Set<string>();
    for (const { id } of list) {
      if (seen.has(id)) errors.push(`duplicate ${what} id "${id}"`);
      seen.add(id);
    }
    return seen;
  };
  const levels = ids(b.levels, 'level');
  const nodes = ids(b.nodes, 'node');
  const members = ids(b.members, 'member');
  ids(b.edges, 'edge');
  ids(b.tokens, 'token');
  for (const n of b.nodes) if (!levels.has(n.level)) errors.push(`node "${n.id}": unknown level "${n.level}"`);
  for (const m of b.members) {
    if (!levels.has(m.level)) errors.push(`member "${m.id}": unknown level "${m.level}"`);
    for (const s of m.supported_by) if (!members.has(s)) errors.push(`member "${m.id}": unknown support "${s}"`);
  }
  for (const e of b.edges) {
    if (!nodes.has(e.from)) errors.push(`edge "${e.id}": unknown from "${e.from}"`);
    if (!nodes.has(e.to)) errors.push(`edge "${e.id}": unknown to "${e.to}"`);
    for (const c of e.crosses ?? []) if (!members.has(c)) errors.push(`edge "${e.id}": unknown member "${c}"`);
  }
  for (const t of b.tokens) {
    const startPool = t.rule === 'downward' ? members : nodes;
    if (!startPool.has(t.start)) errors.push(`token "${t.id}": unknown start "${t.start}"`);
    if (t.goal !== null && !(t.rule === 'downward' ? members : nodes).has(t.goal)) {
      errors.push(`token "${t.id}": unknown goal "${t.goal}"`);
    }
  }
  return errors;
}
