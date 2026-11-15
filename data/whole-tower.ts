// The whole 432 Park tower as building graph data, built from the package metadata (in
// data/432-park/). Pure: no files, no three.js. Owner: P5.
// whole-tower-build.ts reads the package and merges this into data/building.json.
import type { Box, BuildingNode, Edge, Level, NodeType } from '../contract/types.ts';

// Model levels 1 to 3 are the lobby slice already in building.json (L1 to L3), so the tower
// starts at the next one.
export const FIRST_LEVEL = 4;

export interface PackageFloor {
  floor_id: string;
  level_index: number;
  model_elevation_m: number;
  program?: string | null; // lobby, services or open mechanical; absent on apartment floors
  rotation_degrees?: number | null; // the turn of an apartment floor's plan
}

export interface PackageRoom {
  floor_id: string;
  unit_id: string;
  room_type: string;
  layout_id?: string; // the typical plan this room comes from
  prototype_room_id?: string; // the room in that plan, for example C_three_R001
  model_area_m2?: number;
  bounds_gltf_m: [number[], number[]]; // [min, max] as [x, y, z], centred on the tower
}

export interface PackageMeta {
  floors: PackageFloor[];
  rooms: PackageRoom[];
}

// The tower footprint is 28.5 m square, centred on the origin in the package.
const HALF_FOOTPRINT = 14.25;

// The fixed central core, the same on every floor (as in the sample slice).
const CORE: Box = { x: 8.44, y: 8.7, width: 11.62, depth: 11.7 };

const DOOR = { clear_width: 1, clear_height: 2.4, step_height: 0 };
const LIFT = { clear_width: 1.2, clear_height: 2.4, step_height: 0 };

// Egress stairs: self-made, as the package has no stair data. Two per storey (a high-rise storey
// needs at least two exits, IBC 2021 1006.3), joined core to core, level to level. Assumed code
// minimums: 1.12 m wide (44 in, IBC 2021 1011.2), 2.03 m headroom (80 in, IBC 2021 1011.3), with
// landings as wide as the stair (IBC 2021 1011.6), so each switchback is a corner of 1.12 by 1.12 m.
// step_height stays 0: `no_steps` takes a stair's rise from the two levels' elevations.
export const STAIR = { clear_width: 1.12, clear_height: 2.03, step_height: 0, corner_a: 1.12, corner_b: 1.12 };

// Stair A and stair B from the core below up to `upper`, the core of level `upperLevel` (its id).
export function stairs(lower: string, upper: string, upperLevel: string, levelNumber: number): Edge[] {
  return (['a', 'b'] as const).map((s) => ({
    id: `stair-${s}-${upperLevel}`, name: `Stair ${s.toUpperCase()} to level ${levelNumber}`,
    from: lower, to: upper, kind: 'stair', ...STAIR,
  }));
}

// How the hand-made slice (L1 lobby, L2 core, L3 plant) joins the tower's first core: the express
// lift from the lobby, both stairs level by level, and a service lift from the lobby to the plant
// (self-made: a supertall's mechanical floors are served by a service lift).
export function sliceJoin(firstCore: string, firstLevel = 'T04', firstNumber = 4): Edge[] {
  return [
    { id: 'lift-T-slice', name: `Lift to level ${firstNumber}`, from: 'lobby', to: firstCore, kind: 'elevator', ...LIFT },
    { id: 'lift-service-L3', name: 'Service lift to level 3', from: 'lobby', to: 'plant', kind: 'elevator', ...LIFT },
    ...stairs('lobby', 'core-l10', 'L2', 2),
    ...stairs('core-l10', 'plant', 'L3', 3),
    ...stairs('plant', firstCore, firstLevel, firstNumber),
  ];
}

// Edge ids this generator writes outside the tower levels; a rerun replaces them.
export const isGeneratedJoin = (id: string): boolean => /^(lift-T-|lift-service-|stair-)/.test(id);

const round = (n: number): number => Math.round(n * 100) / 100;
const two = (n: number): string => String(n).padStart(2, '0');

function coreType(program: string | null | undefined): NodeType {
  if (program === 'Open mechanical level') return 'plant';
  if (program === 'Building services') return 'room';
  return 'lobby';
}

export function buildTower(meta: PackageMeta): { levels: Level[]; nodes: BuildingNode[]; edges: Edge[] } {
  const floors = meta.floors
    .filter((f) => f.level_index >= FIRST_LEVEL)
    .sort((a, b) => a.level_index - b.level_index);
  const levels: Level[] = [];
  const nodes: BuildingNode[] = [];
  const edges: Edge[] = [];

  let below: string | null = null; // the core one level down
  for (const f of floors) {
    const lv = `T${two(f.level_index)}`;
    const core = `core-${lv}`;
    levels.push({ id: lv, elevation: f.model_elevation_m });
    nodes.push({
      id: core, name: `Level ${f.level_index} core`, level: lv, type: coreType(f.program), box: { ...CORE }, is_exit: false,
    });
    if (below) {
      edges.push({ id: `lift-${lv}`, name: `Lift to level ${f.level_index}`, from: below, to: core, kind: 'elevator', ...LIFT });
      edges.push(...stairs(below, core, lv, f.level_index));
    }
    below = core;

    // Units in package order: Model_Level_010_U01 is unit 1.
    const units = new Map<string, PackageRoom[]>();
    for (const r of meta.rooms) if (r.floor_id === f.floor_id) units.set(r.unit_id, [...(units.get(r.unit_id) ?? []), r]);
    [...units.keys()].sort().forEach((unitId, i) => {
      const rooms = units.get(unitId)!;
      // The living room stands for the unit, as in the sample slice; the first room if there is none.
      const stand = rooms.find((r) => /^living/i.test(r.room_type)) ?? rooms[0]!;
      const [lo, hi] = stand.bounds_gltf_m;
      const id = `${lv}-u${i + 1}`;
      nodes.push({
        id,
        name: `Unit ${i + 1}, level ${f.level_index}`,
        level: lv,
        type: 'room',
        box: {
          x: round(lo[0]! + HALF_FOOTPRINT),
          y: round(lo[2]! + HALF_FOOTPRINT),
          width: round(hi[0]! - lo[0]!),
          depth: round(hi[2]! - lo[2]!),
        },
        is_exit: false,
      });
      edges.push({ id: `door-${id}`, name: `Unit ${i + 1} door, level ${f.level_index}`, from: id, to: core, kind: 'door', ...DOOR });
    });
  }
  return { levels, nodes, edges };
}
