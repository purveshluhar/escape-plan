// Cityweft backdrop: the real 432 Park Avenue block under our self-made tower, on a machine that
// has fetched it (node --env-file=.env data/cityweft-fetch.ts). The files live in git-ignored
// data/cityweft/ and are only served by the dev server, so a fresh clone or a build shows no
// city and no ground (docs/adr/0004). Owner: P3. The pure placement math is tested in backdrop.test.ts.

// Manhattan's street grid runs about 29 degrees clockwise of true north.
export const GRID_TURN_DEG = 29;

// Our plan (building.json) is drawn on the Manhattan grid: plan x = east (Park Avenue side),
// plan y = south (the street and truck side). In the viewer, plan x is three x and plan y is
// three z, so grid north is -z. The tower footprint is 28.5 m square from one corner.
export const TOWER_CENTRE = { x: 14.25, z: 14.25 };

// The block GLB as three loads it (measured: the terrain is x 0..500, z -500..0): x east, y up,
// z south, origin at the block's south-west corner, ground about 6 to 19 m above y = 0.
// meta.json's `local` points are x north and z east from that corner; this converts one.
export function metaToBlock(local: { x: number; z: number }): { x: number; z: number } {
  return { x: local.z, z: -local.x };
}

// A column-major 4x4 matrix (three's Matrix4.fromArray order) taking block metres to viewer
// metres: turn true north onto the grid, put `anchor` (the real tower's centre in block metres)
// on our tower's centre, and drop `groundY` (the ground there) to y = 0.
export function backdropMatrix(
  anchor: { x: number; z: number }, groundY = 0, gridTurnDeg = GRID_TURN_DEG, centre = TOWER_CENTRE,
): number[] {
  const a = (gridTurnDeg * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const east = [c, 0, -s]; // block +x: true east, 29 degrees north of grid east
  const up = [0, 1, 0]; // block +y
  const south = [s, 0, c]; // block +z: true south
  const tx = centre.x - (east[0]! * anchor.x + south[0]! * anchor.z);
  const tz = centre.z - (east[2]! * anchor.x + south[2]! * anchor.z);
  return [...east, 0, ...up, 0, ...south, 0, tx, -groundY, tz, 1];
}

// Apply backdropMatrix to one block point (for tests and for checks in the console).
export function toViewer(m: number[], p: { x: number; y?: number; z: number }): [number, number, number] {
  const y = p.y ?? 0;
  return [
    m[0]! * p.x + m[4]! * y + m[8]! * p.z + m[12]!,
    m[1]! * p.x + m[5]! * y + m[9]! * p.z + m[13]!,
    m[2]! * p.x + m[6]! * y + m[10]! * p.z + m[14]!,
  ];
}

// The context is cut flat at this height (viewer metres above the ground), like a site model. The
// camera frames our 30 m tower closely, so anything taller walls it off: keep streets and footprints.
export const CUT_HEIGHT = 4;

// Zoomed out (the mouse wheel in the viewer) the whole building is small in frame and nothing
// walls it off, so the context rises to its real height: from the framed view's zoom of 1.5 the
// cut climbs smoothly to this, reached at zoom 4. The building is drawn over the context anyway.
export const CUT_FULL = 500;
const ZOOM_FROM = 1.5;
const ZOOM_TO = 4;

export function cutHeight(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - ZOOM_FROM) / (ZOOM_TO - ZOOM_FROM)));
  return CUT_HEIGHT + t * t * (3 - 2 * t) * (CUT_FULL - CUT_HEIGHT);
}

// Pale daylight colours per Cityweft layer (the node names start with the layer name).
export const LAYER_COLOR: [RegExp, string][] = [
  [/buildings/i, '#eef0f4'],
  [/grass|garden/i, '#d6e3d0'],
  [/water/i, '#c8d9e8'],
  [/wall|fence/i, '#cfd4db'],
  [/topography/i, '#e9eaec'],
  [/path|pavement|roadway|construction/i, '#dde1e7'],
];

export function layerColor(name: string): string {
  return LAYER_COLOR.find(([re]) => re.test(name))?.[1] ?? '#e4e7ec';
}

// True when a building's plan box (block metres) covers the point: that is the real tower,
// which our own model replaces.
export function coversPoint(box: { minX: number; maxX: number; minZ: number; maxZ: number }, p: { x: number; z: number }, pad = 2): boolean {
  return p.x >= box.minX - pad && p.x <= box.maxX + pad && p.z >= box.minZ - pad && p.z <= box.maxZ + pad;
}
