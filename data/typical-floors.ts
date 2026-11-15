// Where the real 432 Park typical floor sits in the viewer. Pure math, no three.js; the loader is
// typical-floors-load.ts. Owner: P5. The floor file is the git-ignored package in private-context/
// (docs/adr/0004), so a fresh clone or a build simply has no floor.
import type { Building } from '../contract/types.ts';
import { TOWER_CENTRE } from '../app/backdrop.ts';
import { glbPlanName } from './tower-plans.ts';
import type { FloorPlan } from './tower-plans.ts';

// Level 10 in the package metadata is the three-apartment plan (C_three) turned 270 degrees. In
// the viewer's frame that turn lines the living rooms up with the unit boxes in building.json
// (checked by overlap: 0.9, 0.82 and 0.6).
export const TYPICAL_TURN_DEG = 270;

// The package's three-apartment plan node, one of four laid side by side in the GLB.
export const TYPICAL_PLAN_NODE = 'Typical_3_Apartment_Plan';

export const TYPICAL_FLOORS_URL = '/private-context/432-park/432_Park_Avenue_Typical_Plans.glb';

export interface FloorPlacement {
  position: [number, number, number]; // viewer metres: slab top at the apartment level, tower centre
  rotationY: number; // radians
}

// The floor goes on the level that holds the apartment rooms (nodes of type room), so editing
// building.json moves it along.
export function floorPlacement(b: Building): FloorPlacement {
  const roomLevel = b.nodes.find((n) => n.type === 'room')?.level;
  const elevation = b.levels.find((l) => l.id === roomLevel)?.elevation ?? 0;
  return {
    position: [TOWER_CENTRE.x, elevation, TOWER_CENTRE.z],
    rotationY: (TYPICAL_TURN_DEG * Math.PI) / 180,
  };
}

// Vite answers a missing file with index.html, so check the glTF magic number before parsing.
export function looksLikeGlb(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  return new TextDecoder().decode(new Uint8Array(bytes, 0, 4)) === 'glTF';
}

export interface TowerFloor extends FloorPlacement {
  node: string; // the plan's node in the typical-plans GLB
}

// Every apartment level of the whole tower, with the plan it was given (tower-floors.ts).
export function towerFloors(floors: Record<string, FloorPlan>, b: Building): TowerFloor[] {
  const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
  return Object.entries(floors).flatMap(([level, f]) => {
    const y = elevation.get(level);
    if (y === undefined) return [];
    return [{ node: glbPlanName(f.plan), position: [TOWER_CENTRE.x, y, TOWER_CENTRE.z] as [number, number, number], rotationY: (f.turn * Math.PI) / 180 }];
  });
}

// Levels of the whole tower with no plan (lobby, services, open mechanical): the package has no room
// layout for them, so they get a plain slab and the fixed core as a stand-in. The slice (L1 to L3) is
// hand-built and excluded.
export function towerSlabs(floors: Record<string, FloorPlan>, b: Building): FloorPlacement[] {
  return b.levels
    .filter((l) => /^T\d\d$/.test(l.id) && !(l.id in floors))
    .map((l) => ({ position: [TOWER_CENTRE.x, l.elevation, TOWER_CENTRE.z] as [number, number, number], rotationY: 0 }));
}

// The nodes a drawn real floor stands in for: every node on a tower level (T04 and up), apartment
// units and cores alike. The viewer skips their boxes. Slice nodes keep theirs.
export function coveredNodes(b: Building): string[] {
  return b.nodes.filter((n) => /^T\d\d$/.test(n.level)).map((n) => n.id);
}

// The outside of the tower comes from the package's complete Lightweight model: its exterior concrete
// grid, facade and window modules and roof parapet. Everything inside it (its own levels and
// interiors, drawn from our floor plans instead) and its ground plinth (the backdrop has the ground)
// is left out. The exterior is 28.5 m square and 425.5 m tall, centred on the origin like the floors.
export const FACADE_URL = '/private-context/432-park/432_Park_Avenue_Lightweight.glb';

export function isInterior(name: string): boolean {
  return /^(Model_Level_|Residential_Interiors|Local_Ground_Plinth)/.test(name);
}
