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

// ---------- Colour from Cityweft's descriptors ----------
// Every mesh in the block GLB carries Cityweft's descriptor (three puts glTF mesh extras in
// userData.descriptor). Buildings may have a facade and roof colour, a facade and roof material
// and a building type. Reference: https://cityweft.gitbook.io/docs/basics/metadata-descriptors.md
// The context must stay calm so the tower and the figures carry the colour (design/look.md rule 4):
// every tint is pale, low in saturation and close to the plain building tone.

export const BUILDING = '#eef0f4'; // the plain building tone, when the descriptor says nothing

// The daylight band every backdrop building colour is pulled into (HSL lightness and saturation).
const L_MIN = 0.87;
const L_MAX = 0.95;
const S_KEEP = 0.4; // share of the source saturation that survives
const S_MAX = 0.2;

function hex(r: number, g: number, b: number): string {
  const to = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Soften one Cityweft colour (0xRRGGBB) into the band: keep its hue, map its lightness into
// L_MIN..L_MAX in the same order, and cap its saturation.
export function calmColor(rgb: number): string {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const l2 = L_MIN + l * (L_MAX - L_MIN);
  const s2 = Math.min(S_MAX, s * S_KEEP);
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l2 - c / 2;
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return hex(r1 + m, g1 + m, b1 + m);
}

// When there is no colour: tints by material class (Cityweft's coarse classes "intended for
// rendering"), each a typical colour of that material passed through calmColor, so it sits in the band.
const FACADE_MATERIAL: Record<string, string> = {
  plaster: calmColor(0xe8e2d0),
  brick: calmColor(0xa0522d),
  wood: calmColor(0x8b6b4a),
  glass: calmColor(0x7f9fbf),
  cementBlock: calmColor(0xa9a9a4),
};
const ROOF_MATERIAL: Record<string, string> = {
  concrete: calmColor(0x9a9a9a),
  tiles: calmColor(0xb5523b),
  metal: calmColor(0x7d8a99),
  glass: calmColor(0x8fb3cc),
  grass: calmColor(0x5a8f3c),
  tar: calmColor(0x3a3a3c),
  thatch: calmColor(0xb39b5f),
  eternit: calmColor(0x8c8c86),
};
// The premium tier gives most buildings no colour or material, some a building type: homes read
// a touch warm, work places a touch cool, public buildings a touch lilac.
const HOME = calmColor(0xd9b48f);
const WORK = calmColor(0x8fa8c8);
const PUBLIC = calmColor(0xa898c0);
const BUILDING_TYPE: Record<string, string> = {
  residential: HOME, apartments: HOME, house: HOME, hotel: HOME, dormitory: HOME,
  commercial: WORK, office: WORK, retail: WORK, industrial: WORK, warehouse: WORK,
  church: PUBLIC, school: PUBLIC, hospital: PUBLIC, university: PUBLIC, civic: PUBLIC, public: PUBLIC,
};

type Descriptor = Record<string, unknown>;

const asDescriptor = (d: unknown): Descriptor => (d && typeof d === 'object' ? (d as Descriptor) : {});
const rgbOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : null;
const pick = (table: Record<string, string>, v: unknown): string | null =>
  typeof v === 'string' && Object.hasOwn(table, v) ? table[v]! : null;

// Facade and roof colours for one building descriptor. Order: Cityweft's colour, then its
// material, then the building type, then the plain tone. A roof with nothing of its own takes
// the facade's colour.
export function buildingColors(descriptor: unknown): { facade: string; roof: string } {
  const d = asDescriptor(descriptor);
  const facadeRgb = rgbOf(d.buildingFacadeColor);
  const facade = (facadeRgb !== null ? calmColor(facadeRgb) : null)
    ?? pick(FACADE_MATERIAL, d.buildingFacadeMaterial)
    ?? pick(BUILDING_TYPE, d.buildingType)
    ?? BUILDING;
  const roofRgb = rgbOf(d.buildingRoofColor);
  const roof = (roofRgb !== null ? calmColor(roofRgb) : null) ?? pick(ROOF_MATERIAL, d.buildingRoofMaterial) ?? facade;
  return { facade, roof };
}

const ROAD = '#d9dde4'; // roadways and crossings: a touch deeper than the sidewalk
const SIDEWALK = '#e6e9ee';
const HEDGE = calmColor(0x4f7942);

// Ground, walls and fences: by the descriptor's type where it says something useful, else by
// the layer name (LAYER_COLOR).
export function surfaceColor(descriptor: unknown, name: string): string {
  const d = asDescriptor(descriptor);
  if (d.type === 'roadwayIntersection' || d.type === 'asphalt' || d.type === 'roadwayArea' || d.pathType === 'roadway') return ROAD;
  if (d.type === 'pavement' || d.pathType === 'footway') return SIDEWALK;
  if (d.type === 'wall' && d.wallType === 'hedge') return HEDGE;
  return layerColor(name);
}

// Per-vertex colours for one building from the up (y) part of each vertex normal: a vertex on a
// face that looks up (a roof) takes `roof`, every other vertex takes `facade`. Linear RGB, 3 per vertex.
const ROOF_NORMAL_Y = 0.5;
export function roofOrFacade(normalY: ArrayLike<number>, facade: readonly number[], roof: readonly number[]): Float32Array {
  const out = new Float32Array(normalY.length * 3);
  for (let v = 0; v < normalY.length; v++) {
    const c = normalY[v]! > ROOF_NORMAL_Y ? roof : facade;
    out[v * 3] = c[0]!;
    out[v * 3 + 1] = c[1]!;
    out[v * 3 + 2] = c[2]!;
  }
  return out;
}
