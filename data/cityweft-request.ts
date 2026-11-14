// Cityweft /v1/context request: pure builders, no network, no key. Owner: P5.
// The fetch script (cityweft-fetch.ts) sends this; the tests check it.
// Cityweft output never enters the repo (docs/adr/0004).

export type LatLon = [lat: number, lon: number];

export interface Center {
  lat: number;
  lon: number;
}

export interface ContextRequest {
  polygon: LatLon[];
  settings: { geometry: string[]; upAxis: 'Y' | 'Z'; crs: 'local' };
  export: { format: 'glb' };
}

export const MAX_AREA_KM2 = 10; // Cityweft rejects a larger polygon with a 400

// Everything Cityweft can generate: instances are trees and street items, topography is terrain.
const GEOMETRY = ['buildings', 'surface', 'barriers', 'instances', 'infrastructure', 'topography'];

const METRES_PER_DEG_LAT = 111_132;
const METRES_PER_DEG_LON_AT_EQUATOR = 111_320;

const metresPerDegLon = (lat: number): number =>
  METRES_PER_DEG_LON_AT_EQUATOR * Math.cos((lat * Math.PI) / 180);

// Area of a small lat/lon polygon (shoelace on a local flat projection), in km2.
export function polygonAreaKm2(polygon: LatLon[]): number {
  const first = polygon[0];
  if (!first) return 0;
  const kx = metresPerDegLon(first[0]);
  let twice = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    const a = polygon[i]!;
    const b = polygon[i + 1]!;
    twice += a[1] * kx * (b[0] * METRES_PER_DEG_LAT) - b[1] * kx * (a[0] * METRES_PER_DEG_LAT);
  }
  return Math.abs(twice) / 2 / 1e6;
}

// A square, `sizeMetres` a side, centred on `center`. Points are [lat, lon] and the ring is closed.
export function buildRequest(center: Center, sizeMetres: number): ContextRequest {
  if (!Number.isFinite(sizeMetres) || sizeMetres <= 0) {
    throw new Error(`size must be a positive number of metres, got ${sizeMetres}`);
  }
  const halfLat = sizeMetres / 2 / METRES_PER_DEG_LAT;
  const halfLon = sizeMetres / 2 / metresPerDegLon(center.lat);
  const south = center.lat - halfLat;
  const north = center.lat + halfLat;
  const west = center.lon - halfLon;
  const east = center.lon + halfLon;
  const polygon: LatLon[] = [
    [south, west],
    [north, west],
    [north, east],
    [south, east],
    [south, west],
  ];
  const area = polygonAreaKm2(polygon);
  if (area > MAX_AREA_KM2) {
    throw new Error(`area ${area.toFixed(2)} km2 is over the ${MAX_AREA_KM2} km2 API limit`);
  }
  return {
    polygon,
    settings: { geometry: [...GEOMETRY], upAxis: 'Y', crs: 'local' },
    export: { format: 'glb' },
  };
}

// The GLB export leaves trees out, so they come from a second request: same polygon, JSON back.
export interface TreesRequest {
  polygon: LatLon[];
  settings: { geometry: ['instances']; upAxis: 'Y' | 'Z'; crs: 'local' };
}

export function buildTreesRequest(center: Center, sizeMetres: number): TreesRequest {
  const { polygon, settings } = buildRequest(center, sizeMetres);
  return { polygon, settings: { geometry: ['instances'], upAxis: settings.upAxis, crs: settings.crs } };
}

// A tree point in the same local metres as the GLB (y is up).
export interface Tree {
  x: number;
  y: number;
  z: number;
  height: number;
}

const DEFAULT_TREE_HEIGHT = 10; // metres, when Cityweft gives none

// Pulls tree points out of a /v1/context JSON response. Anything unexpected gives fewer trees.
export function extractTrees(response: unknown): Tree[] {
  const geometry = (response as { geometry?: unknown } | undefined)?.geometry;
  if (!Array.isArray(geometry)) return [];
  const trees: Tree[] = [];
  for (const group of geometry) {
    if (group?.type !== 'instances' || !Array.isArray(group.nodes)) continue;
    for (const n of group.nodes) {
      if (n?.instanceType !== 'tree') continue;
      const { x, y, z } = n;
      if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      const height = typeof n.height === 'number' && Number.isFinite(n.height) ? n.height : DEFAULT_TREE_HEIGHT;
      trees.push({ x, y, z, height });
    }
  }
  return trees;
}

// What to tell the person at the terminal. Never includes the key.
export function describeStatus(status: number): string {
  switch (status) {
    case 400:
      return '400: Cityweft rejected the polygon (malformed, unclosed, or over 10 km2).';
    case 401:
      return '401: missing or invalid key. Set CITYWEFT_API_KEY in the git-ignored .env.';
    case 402:
      return '402: no active subscription or remaining balance for this request.';
    case 503:
      return '503: Cityweft is busy. Retry shortly.';
    default:
      return `${status}: unexpected response from Cityweft.`;
  }
}
