// Fetch the 120 Broadway block from Cityweft as a GLB. Owner: P5.
// Run: node --env-file=.env data/cityweft-fetch.ts
// Needs CITYWEFT_API_KEY in the git-ignored .env (never a VITE_ prefix, docs/adr/0008).
// Output goes to git-ignored data/cityweft/ and never enters the repo (docs/adr/0004).
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildInstancesRequest, buildRequest, describeStatus, extractInstances, shiftCenter,
} from './cityweft-request.ts';

const ENDPOINT = 'https://api.cityweft.com/v1/context';
const TARGET = { lat: 40.7085, lon: -74.0108 }; // 120 Broadway, New York: the building we play in
// The block is centred south of the target so the bay (water) fills its south side. The viewer
// camera looks from the north-east, so the missing north edge is never in view.
const SOUTH_SHIFT_METRES = 350;
const CENTER = shiftCenter(TARGET, -SOUTH_SHIFT_METRES, 0);
const SIZE_METRES = Number(process.env.CITYWEFT_SIZE_M) || 800; // a side; override in .env or the shell
const MAX_TRIES = 3;
const OUT_DIR = new URL('./cityweft/', import.meta.url);

const key = process.env.CITYWEFT_API_KEY;
if (!key) {
  console.error(describeStatus(401));
  process.exit(1);
}

const body = buildRequest(CENTER, SIZE_METRES);

async function post(payload: object): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    if (res.status !== 503 || attempt === MAX_TRIES) return res;
    const wait = Number(res.headers.get('Retry-After')) || 5;
    console.error(`${describeStatus(503)} Waiting ${wait}s (try ${attempt} of ${MAX_TRIES}).`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
}

console.log(`Requesting a ${SIZE_METRES} m block, centred ${SOUTH_SHIFT_METRES} m south of 120 Broadway ...`);
const res = await post(body);
if (!res.ok) {
  console.error(describeStatus(res.status));
  process.exit(1);
}

const { downloadUrl, spatialReference } = (await res.json()) as {
  downloadUrl: string;
  spatialReference: unknown;
};

// The download link is temporary, so fetch it now. It is not a Cityweft API call: send no key.
const file = await fetch(downloadUrl);
if (!file.ok) {
  console.error(`Download failed with ${file.status}. Run the script again for a fresh link.`);
  process.exit(1);
}
const glb = Buffer.from(await file.arrayBuffer());

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL('block.glb', OUT_DIR), glb);
writeFileSync(
  new URL('meta.json', OUT_DIR),
  JSON.stringify(
    { target: TARGET, center: CENTER, southShiftMetres: SOUTH_SHIFT_METRES, sizeMetres: SIZE_METRES, polygon: body.polygon, spatialReference, fetchedAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log(`Saved data/cityweft/block.glb (${(glb.length / 1e6).toFixed(1)} MB) and meta.json.`);

// The GLB export leaves instances out (tested: the file holds an empty placeholder), so trees,
// benches, bus stops, hydrants and picnic tables come as JSON points from a second request.
const instancesRes = await post(buildInstancesRequest(CENTER, SIZE_METRES));
if (!instancesRes.ok) {
  console.error(`Instances: ${describeStatus(instancesRes.status)} The GLB is saved; run again for instances.`);
  process.exit(1);
}
const instances = extractInstances(await instancesRes.json());
writeFileSync(new URL('instances.json', OUT_DIR), JSON.stringify(instances));
const perType: Record<string, number> = {};
for (const i of instances) perType[i.type] = (perType[i.type] ?? 0) + 1;
console.log(`Saved data/cityweft/instances.json (${instances.length} points):`, JSON.stringify(perType));
