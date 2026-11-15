// Which typical floor plan each apartment floor of 432 Park uses. Pure: no files, no three.js.
// The four plans are the package's individual floor plans (Typical_1 to Typical_4 in its GLB).
// Owner: P5. whole-tower-build.ts applies this; typical-floors.ts draws it.
import type { PackageFloor, PackageRoom } from './whole-tower.ts';

export const PLAN_IDS = ['A_single', 'B_two', 'C_three', 'D_four'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface FloorPlan {
  plan: PlanId;
  turn: number; // degrees, the package's turn for this floor
}

export interface TypicalPlan {
  id: string;
  rooms: {
    prototype_room_id: string;
    room_type: string;
    unit_index: number;
    model_area_m2: number;
    polygon: { coordinates: number[][][] };
  }[];
}

export const CLEAR_HEIGHT = 3.81; // metres, as in the package

const two = (n: number): string => String(n).padStart(2, '0');
const clean = (n: number): number => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0

// Small seeded generator, so a fixed seed always gives the same tower.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random plan for every apartment floor (the ones with no program), keyed by level id (T10).
// Each floor keeps the turn the package gave it.
export function assignPlans(floors: PackageFloor[], seed: number): Record<string, FloorPlan> {
  const next = mulberry32(seed);
  const out: Record<string, FloorPlan> = {};
  for (const f of [...floors].sort((a, b) => a.level_index - b.level_index)) {
    if (f.program) continue;
    out[`T${two(f.level_index)}`] = { plan: PLAN_IDS[Math.floor(next() * PLAN_IDS.length)]!, turn: f.rotation_degrees ?? 0 };
  }
  return out;
}

// A plan point (x east, y north on paper) in the tower frame the package uses: turned by `deg`
// counter-clockwise, with plan y laid toward -z. Checked against building.json: level 10 is
// C_three turned 270, and its living rooms overlap the unit boxes.
export function rotateToGlb(x: number, y: number, deg: number): { x: number; z: number } {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), z: -(x * Math.sin(a) + y * Math.cos(a)) };
}

// The plan's node in the typical-plans GLB: A_single is Typical_1_Apartment_Plan.
export function glbPlanName(plan: string): string {
  return `Typical_${PLAN_IDS.indexOf(plan as PlanId) + 1}_Apartment_Plan`;
}

// The name of the room's node in the typical-plans GLB: C_three_R004 is Typical_3_Apartment_Plan_R004.
export function glbRoomName(plan: string, prototypeRoomId: string): string {
  return `${glbPlanName(plan)}_${prototypeRoomId.slice(prototypeRoomId.lastIndexOf('_') + 1)}`;
}

// The rooms of one apartment floor: the assigned plan's rooms, turned, with bounds in the tower frame.
export function planRooms(floorId: string, assigned: FloorPlan, plans: TypicalPlan[]): PackageRoom[] {
  const plan = plans.find((p) => p.id === assigned.plan);
  if (!plan) throw new Error(`no typical plan ${assigned.plan}`);
  return plan.rooms.map((r) => {
    const pts = r.polygon.coordinates[0]!.map(([x, y]) => rotateToGlb(x!, y!, assigned.turn));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    return {
      floor_id: floorId,
      unit_id: `${floorId}_U${two(r.unit_index)}`,
      room_type: r.room_type,
      layout_id: plan.id,
      prototype_room_id: r.prototype_room_id,
      model_area_m2: r.model_area_m2,
      bounds_gltf_m: [
        [clean(Math.min(...xs)), 0, clean(Math.min(...zs))],
        [clean(Math.max(...xs)), CLEAR_HEIGHT, clean(Math.max(...zs))],
      ],
    };
  });
}
