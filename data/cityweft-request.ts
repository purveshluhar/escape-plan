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
  settings: { geometry: string[]; upAxis: 'Y' | 'Z'; crs: 'local'; treeSource: 'hybrid' };
  export: { format: 'glb' };
}

export const MAX_AREA_KM2 = 10; // Cityweft rejects a larger polygon with a 400

// Everything Cityweft can generate: instances are trees and street items, topography is terrain.
const GEOMETRY = ['buildings', 'surface', 'barriers', 'instances', 'infrastructure', 'topography'];

const METRES_PER_DEG_LAT = 111_132;
const METRES_PER_DEG_LON_AT_EQUATOR = 111_320;

const metresPerDegLon = (lat: number): number =>
  METRES_PER_DEG_LON_AT_EQUATOR * Math.cos((lat * Math.PI) / 180);

// Move a point by metres north (negative = south) and east (negative = west).
export function shiftCenter(center: Center, northMetres: number, eastMetres: number): Center {
  return {
    lat: center.lat + northMetres / METRES_PER_DEG_LAT,
    lon: center.lon + eastMetres / metresPerDegLon(center.lat),
  };
}

// Where a lat/lon sits in the fetched block's local metres: x north and z east, measured from the
// block's south-west corner (the frame the GLB and instances.json share; y is up). Checked by
// drawing the GLB top-down: the Hudson is at small z, and the memorial pools line up on x.
export function toLocal(point: Center, blockCentre: Center, sizeMetres: number): { x: number; z: number } {
  return {
    x: sizeMetres / 2 + (point.lat - blockCentre.lat) * METRES_PER_DEG_LAT,
    z: sizeMetres / 2 + (point.lon - blockCentre.lon) * metresPerDegLon(blockCentre.lat),
  };
}

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
    // hybrid = detected canopy with measured heights; the docs recommend it over the default.
    settings: { geometry: [...GEOMETRY], upAxis: 'Y', crs: 'local', treeSource: 'hybrid' },
    export: { format: 'glb' },
  };
}

// The GLB export leaves instances (trees, benches, bus stops, hydrants, picnic tables) out, so
// they come from a second request: same polygon, JSON points back.
export interface InstancesRequest {
  polygon: LatLon[];
  settings: { geometry: ['instances']; upAxis: 'Y' | 'Z'; crs: 'local'; treeSource: 'hybrid' };
}

export function buildInstancesRequest(center: Center, sizeMetres: number): InstancesRequest {
  const { polygon, settings } = buildRequest(center, sizeMetres);
  return {
    polygon,
    settings: { geometry: ['instances'], upAxis: settings.upAxis, crs: settings.crs, treeSource: settings.treeSource },
  };
}

// A street-level point in the same local metres as the GLB (y is up). `type` is Cityweft's
// instanceType: tree, bench, busStop, picnicTable, hydrant, sculpture, ...
export interface Instance {
  type: string;
  x: number;
  y: number;
  z: number;
  height: number; // metres
  rotation: number; // radians about the up axis
}

const DEFAULT_HEIGHT: Record<string, number> = { tree: 10 };
const FALLBACK_HEIGHT = 1; // metres, for any other type when Cityweft gives none

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Pulls instance points out of a /v1/context JSON response. Anything unexpected gives fewer points.
export function extractInstances(response: unknown): Instance[] {
  const geometry = (response as { geometry?: unknown } | undefined)?.geometry;
  if (!Array.isArray(geometry)) return [];
  const out: Instance[] = [];
  for (const group of geometry) {
    if (group?.type !== 'instances' || !Array.isArray(group.nodes)) continue;
    for (const n of group.nodes) {
      const type = n?.instanceType;
      if (typeof type !== 'string' || !finite(n.x) || !finite(n.y) || !finite(n.z)) continue;
      out.push({
        type,
        x: n.x,
        y: n.y,
        z: n.z,
        height: finite(n.height) ? n.height : (DEFAULT_HEIGHT[type] ?? FALLBACK_HEIGHT),
        rotation: finite(n.rotation) ? n.rotation : 0,
      });
    }
  }
  return out;
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
    case 429:
      return '429: this key reached its Cityweft usage limit. It resets with the billing period, or an admin raises it.';
    case 0:
      return 'No answer from Cityweft (network error).';
    case 503:
      return '503: Cityweft is busy. Retry shortly.';
    default:
      return `${status}: unexpected response from Cityweft.`;
  }
}

// Retries for /v1/context. The API documents 503 (busy, with Retry-After) and 402 (no balance):
// https://cityweft.gitbook.io/docs/getting-started/api-reference.md. Other 5xx and a network
// error (status 0) clear on their own, so they are retried too; 402, 400 and 401 do not.
// Cityweft answers 429 when a key reaches its usage limit, which holds until the billing period
// resets (https://cityweft.gitbook.io/docs/basics/usage-limits.md), so a 429 is retried only
// when it says when to come back (Retry-After). Up to MAX_ATTEMPTS tries, each wait under MAX_WAIT_MS.
export const MAX_ATTEMPTS = 5;
const RETRYABLE = new Set([0, 500, 502, 503, 504]);
const BASE_WAIT_MS = 2000;
const MAX_WAIT_MS = 120_000;

// How long to wait before the next try after `attempt` (1-based) answered `status`, or null when
// there is no next try. A Retry-After in seconds wins; else the wait doubles each try, plus up to
// half again of random jitter.
export function retryDelayMs(status: number, attempt: number, retryAfter: string | null, random: () => number = Math.random): number | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  const seconds = Number(retryAfter);
  const hasRetryAfter = retryAfter !== null && retryAfter.trim() !== '' && Number.isFinite(seconds) && seconds >= 0;
  if (status === 429 && hasRetryAfter) return Math.min(MAX_WAIT_MS, seconds * 1000);
  if (!RETRYABLE.has(status)) return null;
  if (hasRetryAfter) return Math.min(MAX_WAIT_MS, seconds * 1000);
  const base = BASE_WAIT_MS * 2 ** (attempt - 1);
  return Math.min(MAX_WAIT_MS, Math.round(base * (1 + 0.5 * random())));
}
