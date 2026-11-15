// The whole 432 Park tower as building graph data, built from the package metadata (the
// git-ignored private-context/432-park/, docs/adr/0004). Pure: no files, no three.js. Owner: P5.
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
    if (below) edges.push({ id: `lift-${lv}`, name: `Lift to level ${f.level_index}`, from: below, to: core, kind: 'elevator', ...LIFT });
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
