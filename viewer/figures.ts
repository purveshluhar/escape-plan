// Token figures, in the discipline colour, standing on a white disc with a coloured ring. Owner: P2.
// The wheelchair with its rider, the people and the sofa are Kenney CC0 models (viewer/figures/,
// see CREDITS.md there); until they load, or if one fails, the older three.js shapes stand in. The
// chiller, load, smoke and glass panel are built from three.js shapes in the same chunky look.
// Units are metres; each figure stands on y = 0, centred on x = z = 0.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Discipline, Id } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';

export type FigureKind = 'wheelchair' | 'sofa' | 'people' | 'chiller' | 'load' | 'smoke' | 'glass' | 'block';
export type Motion = 'idle' | 'moving';

export interface Figure {
  object: THREE.Group;
  kind: FigureKind;
  source: 'model' | 'built' | 'fallback'; // a Kenney model, code-built shapes, or the stand-in shapes
  size: number; // metres: the figure's largest side, for scaling it to the screen
  minPixels: number; // the figure's largest side is never drawn smaller than this
  ring: THREE.MeshBasicMaterial; // the disc's rim; the viewer recolours it for the selected token
  color: string; // the discipline colour the rim goes back to
  // For the motion pass: which clip plays, advancing it, and which way the figure faces.
  setMotion(motion: Motion): void;
  tick(seconds: number): void;
  setHeading(radians: number): void; // turns the figure about y; the disc stays put
  dispose(): void; // stops its animation; disposeTree frees its GPU memory
}

export const MIN_PIXELS = 64;
export const WHEELCHAIR_MIN_PIXELS = 80; // smaller, the rider's big head hides the chair

// Geometry, materials and textures of the loaded models, shared by every figure made from them.
// disposeTree never frees these.
export const FIGURE_SHARED = new Set<object>();

const DARK = '#1f2533'; // tyres, cushions, louvres: a dark neutral so the colour reads on the frame

// The figure for a token. The sofa is a logistics token like the glass panel, so it goes by id.
export function figureKind(token: Id, discipline: Discipline): FigureKind {
  if (token === 'sofa') return 'sofa';
  const byDiscipline: Partial<Record<Discipline, FigureKind>> = {
    accessibility: 'wheelchair', life_safety: 'people', mep: 'chiller', structure: 'load', fire: 'smoke', logistics: 'glass',
  };
  return byDiscipline[discipline] ?? 'block';
}

// ---------- Kenney models ----------

const FILES = {
  chair: new URL('./figures/wheelchair.glb', import.meta.url).href,
  rider: new URL('./figures/character-male-f.glb', import.meta.url).href,
  person1: new URL('./figures/character-female-d.glb', import.meta.url).href,
  person2: new URL('./figures/character-male-d.glb', import.meta.url).href,
  person3: new URL('./figures/character-female-e.glb', import.meta.url).href,
  sofa: new URL('./figures/loungeSofa.glb', import.meta.url).href,
};
const ATLAS = new URL('./figures/colormap.png', import.meta.url).href;
type File = keyof typeof FILES;

// The Kenney atlas is 16 x 4 swatches of 32 x 128 px; (column, row), row 0 at the top.
const CHAIR_CELLS: [number, number][] = [[3, 3], [5, 3], [1, 1]]; // frame, push rims, seat and handles

interface Template { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
interface Fit { scale: number; offset: THREE.Vector3; span: THREE.Vector3 } // raw instance to metres
const templates: Partial<Record<File, Template>> = {};
const fits: Partial<Record<FigureKind, Fit>> = {};
let loading: Promise<boolean> | null = null;

// Loads one model. Only its own file and the shared atlas resolve; any other address the file names
// becomes an empty data URL, so a model can never make the page fetch anything else.
async function fetchModel(url: string): Promise<GLTF> {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => (u === url ? u : u.endsWith('Textures/colormap.png') ? ATLAS : 'data:,'));
  return new GLTFLoader(manager).loadAsync(url);
}

// Loads every model once (later calls share the first load). Resolves true when all loaded and false
// when any failed; it never rejects. A figure whose files did not all load keeps the stand-in shapes.
export function loadFigureModels(load: (url: string) => Promise<GLTF> = fetchModel): Promise<boolean> {
  if (load === fetchModel && loading) return loading;
  const run = (async () => {
    const names = Object.keys(FILES) as File[];
    const got = await Promise.allSettled(names.map((n) => load(FILES[n])));
    got.forEach((r, i) => {
      if (r.status === 'fulfilled') templates[names[i]!] = prepare(names[i]!, r.value);
    });
    fitModels();
    return got.every((r) => r.status === 'fulfilled');
  })().catch(() => false);
  if (load === fetchModel) loading = run;
  return run;
}

// Lambert, as the route scene lights figures with Lambert; tint; and mark everything shared.
function prepare(name: File, gltf: GLTF): Template {
  const swapped = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    let l = swapped.get(m);
    if (!l) {
      l = new THREE.MeshLambertMaterial({
        name: m.name, color: m.color, map: m.map, transparent: m.transparent, opacity: m.opacity,
        side: m.side, alphaTest: m.alphaTest, vertexColors: m.vertexColors,
      });
      if (name === 'chair' && m.map) l.map = recolour(m.map, CHAIR_CELLS, DISCIPLINE_STYLE.accessibility.color);
      if (name === 'sofa') l.color.set(m.name.startsWith('carpet') ? DISCIPLINE_STYLE.logistics.color : '#b07a4f');
      swapped.set(m, l);
      m.dispose();
    }
    o.material = l;
    FIGURE_SHARED.add(o.geometry).add(l);
    if (l.map) FIGURE_SHARED.add(l.map);
  });
  return { scene: gltf.scene, clips: gltf.animations };
}

// A copy of the atlas with the chosen swatches repainted in one colour, keeping each swatch's
// light-to-dark gradient. Made once at load; only the chair's material uses it.
function recolour(tex: THREE.Texture, cells: [number, number][], hex: string): THREE.Texture {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (typeof document === 'undefined' || !img?.width) return tex;
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return tex;
  g.drawImage(img, 0, 0);
  // The design hex as sRGB bytes, as the atlas holds them.
  const [tr, tg, tb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const top = 255 / Math.max(tr, tg, tb, 1); // never let the brightest channel clip and shift the hue
  const cw = img.width / 16, ch = img.height / 4;
  for (const [col, row] of cells) {
    const d = g.getImageData(col * cw, row * ch, cw, ch);
    const p = d.data;
    const lum = (i: number): number => 0.299 * p[i]! + 0.587 * p[i + 1]! + 0.114 * p[i + 2]!;
    let mean = 0;
    for (let i = 0; i < p.length; i += 4) mean += lum(i);
    mean = mean / (p.length / 4) || 1;
    for (let i = 0; i < p.length; i += 4) {
      const k = Math.min(top, 1.25, Math.max(0.7, lum(i) / mean));
      p[i] = tr * k;
      p[i + 1] = tg * k;
      p[i + 2] = tb * k;
    }
    g.putImageData(d, col * cw, row * ch);
  }
  const t = tex.clone(); // keeps flipY, colour space, filters and wrap
  t.source = new THREE.TextureSource(cv); // its own image: a plain clone shares, and would repaint, the atlas
  t.needsUpdate = true;
  return t;
}

// One instance of a model figure in Kenney units, with an animation mixer for each character.
interface Mover {
  mixer: THREE.AnimationMixer;
  clips: Partial<Record<Motion, THREE.AnimationClip>>;
  t: number; // start time, so a group does not move in step
  action: THREE.AnimationAction | null;
}
interface Raw { root: THREE.Group; movers: Mover[] }

function rawModel(kind: FigureKind): Raw | null {
  const T = templates;
  const root = new THREE.Group();
  const movers: Mover[] = [];
  const character = (tpl: Template, names: Record<Motion, string>, t: number): THREE.Object3D => {
    const p = cloneSkinned(tpl.scene);
    p.traverse((o) => { if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false; }); // its bounds follow the pose
    const clip = (n: string): THREE.AnimationClip | undefined => tpl.clips.find((c) => c.name === n);
    movers.push({ mixer: new THREE.AnimationMixer(p), clips: { idle: clip(names.idle), moving: clip(names.moving) }, t, action: null });
    return p;
  };
  if (kind === 'wheelchair') {
    if (!T.chair || !T.rider) return null;
    const rider = character(T.rider, { idle: 'wheelchair-sit', moving: 'wheelchair-move-forward' }, 0);
    rider.scale.setScalar(0.9); // a little smaller, so more of the chair shows around the rider
    root.add(T.chair.scene.clone(true), rider);
  } else if (kind === 'people') {
    if (!T.person1 || !T.person2 || !T.person3) return null;
    // Side by side across the default view (camera right is (1, 0, -1) / sqrt 2), so all three show.
    const spots: [Template, number, number, number, number][] = [
      [T.person1, -0.3, 0.3, 1, 0.1], [T.person2, 0.04, -0.02, 0.9, 0.45], [T.person3, 0.36, -0.3, 1, 0.8],
    ];
    for (const [tpl, x, z, s, t] of spots) {
      const p = character(tpl, { idle: 'idle', moving: 'walk' }, t);
      p.position.set(x, 0, z);
      p.scale.setScalar(s);
      root.add(p);
    }
  } else if (kind === 'sofa') {
    if (!T.sofa) return null;
    root.add(T.sofa.scene.clone(true));
  } else {
    return null;
  }
  return { root, movers };
}

// Switch a character's clip; the first one snaps, later ones cross-fade.
function play(m: Mover, motion: Motion, fade: number): void {
  const clip = m.clips[motion];
  if (!clip) return;
  const next = m.mixer.clipAction(clip);
  if (m.action === next) return;
  next.reset().play();
  if (m.action && fade > 0) next.crossFadeFrom(m.action, fade, false);
  else m.action?.stop();
  m.action = next;
}

function pose(raw: Raw): void {
  for (const m of raw.movers) {
    play(m, 'idle', 0);
    m.mixer.setTime(m.t);
  }
  raw.root.updateMatrixWorld(true);
}

// Measure each model figure once, posed, so every instance scales by the same numbers.
// Real sizes: a person 1.7 m tall, the wheelchair and rider 1.3 m, the sofa 2.2 m long.
function fitModels(): void {
  const targets: [FigureKind, 'height' | 'size', number][] = [['wheelchair', 'height', 1.3], ['people', 'height', 1.7], ['sofa', 'size', 2.2]];
  for (const [kind, by, metres] of targets) {
    const raw = rawModel(kind);
    if (!raw) continue;
    pose(raw);
    raw.root.traverse((o) => { if (o instanceof THREE.SkinnedMesh) o.computeBoundingBox(); });
    fits[kind] = fitOf(new THREE.Box3().setFromObject(raw.root), by, metres);
    for (const m of raw.movers) m.mixer.uncacheRoot(m.mixer.getRoot());
    disposeTree(raw.root, new Set());
  }
}

function fitOf(box: THREE.Box3, by: 'height' | 'size', metres: number): Fit {
  const s = box.getSize(new THREE.Vector3());
  const scale = metres / (by === 'height' ? s.y : Math.max(s.x, s.y, s.z));
  const c = box.getCenter(new THREE.Vector3());
  return { scale, offset: new THREE.Vector3(-c.x * scale, -box.min.y * scale, -c.z * scale), span: s.multiplyScalar(scale) };
}

// ---------- Stand-in shapes (until the models load, or when one fails) ----------

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function wheelchairShape(body: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  const wheel = new THREE.TorusGeometry(0.3, 0.05, 6, 18).rotateY(Math.PI / 2);
  const caster = new THREE.SphereGeometry(0.07, 8, 6);
  const tube = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
  const parts: THREE.Object3D[] = [
    mesh(wheel, dark, -0.32, 0.32, -0.05), mesh(wheel, dark, 0.32, 0.32, -0.05),
    mesh(caster, dark, -0.24, 0.07, 0.38), mesh(caster, dark, 0.24, 0.07, 0.38),
    mesh(new THREE.BoxGeometry(0.56, 0.08, 0.5), body, 0, 0.52, 0.05), // seat
    mesh(new THREE.BoxGeometry(0.56, 0.52, 0.07), body, 0, 0.84, -0.22), // back
    mesh(new THREE.BoxGeometry(0.44, 0.04, 0.16), body, 0, 0.14, 0.46), // footrest
  ];
  for (const x of [-0.25, 0.25]) {
    const leg = mesh(tube, body, x, 0.33, 0.36);
    leg.scale.y = 0.4;
    leg.rotation.x = -0.35;
    parts.push(leg);
  }
  return parts;
}

function sofaShape(body: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  return [
    mesh(new THREE.BoxGeometry(2.1, 0.36, 0.9), body, 0, 0.26, 0), // base
    mesh(new THREE.BoxGeometry(2.1, 0.52, 0.22), body, 0, 0.66, -0.34), // back
    mesh(new THREE.BoxGeometry(0.22, 0.32, 0.9), body, -0.94, 0.6, 0), // arms
    mesh(new THREE.BoxGeometry(0.22, 0.32, 0.9), body, 0.94, 0.6, 0),
    mesh(new THREE.BoxGeometry(0.8, 0.12, 0.62), dark, -0.42, 0.5, 0.08), // cushions
    mesh(new THREE.BoxGeometry(0.8, 0.12, 0.62), dark, 0.42, 0.5, 0.08),
    ...[-0.9, 0.9].flatMap((x) => [-0.32, 0.32].map((z) => mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), dark, x, 0.04, z))),
  ];
}

function peopleShape(body: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  const torso = new THREE.CapsuleGeometry(0.22, 0.7, 3, 8);
  const head = new THREE.SphereGeometry(0.19, 10, 8);
  const spots: [number, number, number][] = [[0, 0, -0.25], [-0.42, 0, 0.2], [0.42, 0, 0.2]];
  return spots.flatMap(([x, , z], i) => {
    const s = i === 0 ? 1 : 0.88; // one adult and two shorter people
    const group = new THREE.Group();
    group.add(mesh(torso, body, 0, 0.6, 0), mesh(head, dark, 0, 1.38, 0));
    group.position.set(x, 0, z);
    group.scale.setScalar(s);
    return [group];
  });
}

// A plain block for a discipline with no figure of its own yet (water, power).
function blockShape(body: THREE.Material): THREE.Object3D[] {
  return [mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), body, 0, 0.45, 0)];
}

const STAND_INS: Partial<Record<FigureKind, (body: THREE.Material, dark: THREE.Material) => THREE.Object3D[]>> = {
  wheelchair: wheelchairShape, sofa: sofaShape, people: peopleShape,
};

// ---------- Code-built figures (Kenney's chunky rounded look, so they sit with the models) ----------

const lambert = (hex: string): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: hex });

function chillerShape(): THREE.Object3D[] {
  const body = lambert(DISCIPLINE_STYLE.mep.color), dark = lambert(DARK), light = lambert('#bfeef8'), white = lambert('#f4f7fb');
  const parts: THREE.Object3D[] = [mesh(new RoundedBoxGeometry(2.4, 1.25, 1.5, 3, 0.12), body, 0, 0.78, 0)];
  for (const x of [-1.05, 1.05]) parts.push(mesh(new RoundedBoxGeometry(0.16, 0.14, 1.6, 2, 0.05), dark, x, 0.08, 0)); // skids
  const louvre = new THREE.BoxGeometry(2.0, 0.06, 0.03);
  for (let i = 0; i < 4; i++) for (const z of [-0.76, 0.76]) parts.push(mesh(louvre, dark, 0, 0.42 + i * 0.2, z));
  const well = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 24);
  const rim = new THREE.TorusGeometry(0.5, 0.06, 6, 24).rotateX(Math.PI / 2);
  const blade = new RoundedBoxGeometry(0.42, 0.04, 0.16, 2, 0.02);
  const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12);
  for (const x of [-0.58, 0.58]) {
    parts.push(mesh(well, dark, x, 1.42, 0), mesh(rim, light, x, 1.49, 0));
    const fan = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const arm = new THREE.Group();
      arm.rotation.y = (b * 2 * Math.PI) / 3 + 0.4;
      arm.add(mesh(blade, white, 0.2, 0, 0));
      fan.add(arm);
    }
    fan.add(mesh(hub, white));
    fan.position.set(x, 1.5, 0);
    parts.push(fan);
  }
  return parts;
}

function loadShape(): THREE.Object3D[] {
  const body = lambert(DISCIPLINE_STYLE.structure.color), deep = lambert('#5a3fd0'), pale = lambert('#d9d0ff');
  return [
    mesh(new THREE.CylinderGeometry(0.62, 0.98, 0.75, 4, 1).rotateY(Math.PI / 4), body, 0, 0.475, 0), // the weight
    mesh(new RoundedBoxGeometry(1.42, 0.1, 1.42, 2, 0.04), deep, 0, 0.05, 0),
    mesh(new THREE.TorusGeometry(0.26, 0.08, 8, 18, Math.PI), deep, 0, 0.85, 0), // handle
    mesh(new THREE.BoxGeometry(0.2, 0.36, 0.2), pale, 0, 1.6, 0), // down arrow: shaft
    mesh(new THREE.ConeGeometry(0.36, 0.38, 4).rotateY(Math.PI / 4).rotateX(Math.PI), pale, 0, 1.24, 0), // and head
  ];
}

function smokeShape(): THREE.Object3D[] {
  const puff = lambert('#aab6c6'), shade = lambert('#7b8798');
  const blobs: [number, number, number, number][] = [
    [0, 1.0, 0, 0.46], [-0.55, 0.9, 0.05, 0.34], [0.58, 0.9, -0.05, 0.34], [-0.25, 1.22, -0.05, 0.34],
    [0.3, 1.2, 0.05, 0.32], [-0.95, 0.84, 0.05, 0.22], [0.98, 0.84, -0.05, 0.22], [0, 0.82, 0.28, 0.3],
  ];
  const parts: THREE.Object3D[] = blobs.map(([x, y, z, r]) => mesh(new THREE.IcosahedronGeometry(r, 2), puff, x, y, z));
  parts.push(mesh(new THREE.IcosahedronGeometry(0.16, 1), shade, 0.1, 0.42, 0.05)); // the wisp it rises from
  parts.push(mesh(new THREE.IcosahedronGeometry(0.1, 1), shade, -0.05, 0.18, 0));
  return parts;
}

function glassShape(): THREE.Object3D[] {
  const frame = lambert(DISCIPLINE_STYLE.logistics.color), dark = lambert(DARK), edge = lambert('#8cc8f0');
  const pane = new THREE.MeshLambertMaterial({ color: '#cfeaff', transparent: true, opacity: 0.72, depthWrite: false });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false });
  const L = 2.2, H = 1.45, W = L - 0.3;
  const parts: THREE.Object3D[] = [mesh(new RoundedBoxGeometry(L + 0.2, 0.12, 0.7, 2, 0.04), dark, 0, 0.2, 0)]; // dolly deck
  for (const z of [-0.36, 0.36]) parts.push(mesh(new THREE.BoxGeometry(L + 0.2, 0.08, 0.06), frame, 0, 0.24, z)); // rails
  const wheel = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14).rotateX(Math.PI / 2);
  for (const x of [-L / 2, L / 2]) for (const z of [-0.26, 0.26]) parts.push(mesh(wheel, dark, x, 0.1, z));
  const leg = new THREE.BoxGeometry(0.07, 1.6, 0.07);
  for (const x of [-L / 2 + 0.05, L / 2 - 0.05]) {
    for (const s of [-1, 1]) {
      const m = mesh(leg, frame, x, 1.0, s * 0.14); // the A-frame ends
      m.rotation.x = s * 0.18;
      parts.push(m);
    }
  }
  parts.push(mesh(new THREE.BoxGeometry(L, 0.05, 0.05), frame, 0, 1.78, -0.04)); // ridge bar
  const leaning = new THREE.Group(); // the pane leans on the A-frame
  leaning.position.set(0, 0.88, 0.12);
  leaning.rotation.x = -0.16;
  const glass = mesh(new THREE.BoxGeometry(W, H, 0.04), pane);
  glass.renderOrder = 2; // after the opaque figures and discs
  const across = new THREE.BoxGeometry(W, 0.05, 0.06), up = new THREE.BoxGeometry(0.05, H, 0.06);
  leaning.add(glass, mesh(across, edge, 0, H / 2, 0), mesh(across, edge, 0, -H / 2, 0), mesh(up, edge, -W / 2, 0, 0), mesh(up, edge, W / 2, 0, 0));
  for (const [x, sw] of [[-0.35, 0.12], [-0.12, 0.05]] as const) {
    const s = mesh(new THREE.PlaneGeometry(sw, H * 0.8), shine, x, 0, 0.04);
    s.rotation.z = 0.5;
    s.renderOrder = 3;
    leaning.add(s);
  }
  parts.push(leaning);
  return parts;
}

// Real sizes, in metres: the token sizes in data/building.json where it has them.
const BUILT: Partial<Record<FigureKind, [() => THREE.Object3D[], 'height' | 'size', number]>> = {
  chiller: [chillerShape, 'size', 2.4], glass: [glassShape, 'size', 4], load: [loadShape, 'height', 1.2], smoke: [smokeShape, 'size', 1.6],
};

// ---------- The figure ----------

export function makeFigure(token: Id, discipline: Discipline): Figure {
  const kind = figureKind(token, discipline);
  const color = DISCIPLINE_STYLE[discipline].color;
  const shape = new THREE.Group(); // in metres, standing on y = 0, centred
  const fit = fits[kind];
  const raw = fit ? rawModel(kind) : null;
  const built = BUILT[kind];
  let source: Figure['source'];
  let span: THREE.Vector3;
  if (fit && raw) {
    source = 'model';
    pose(raw);
    raw.root.scale.setScalar(fit.scale);
    raw.root.position.copy(fit.offset);
    shape.add(raw.root);
    span = fit.span; // posed skinned bounds, measured at load
  } else {
    const inner = new THREE.Group();
    if (built) {
      source = 'built';
      inner.add(...built[0]());
      const f = fitOf(new THREE.Box3().setFromObject(inner), built[1], built[2]);
      inner.scale.setScalar(f.scale);
      inner.position.copy(f.offset);
      span = f.span;
    } else {
      source = 'fallback';
      inner.add(...(STAND_INS[kind] ?? blockShape)(lambert(color), lambert(DARK)));
      span = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
    }
    shape.add(inner);
  }

  const object = new THREE.Group();
  const heading = new THREE.Group(); // setHeading turns this, not the disc
  heading.add(shape);
  const radius = Math.max(span.x, span.z) / 2 + 0.25;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 }));
  disc.position.y = 0.01;
  const ring = new THREE.MeshBasicMaterial({ color });
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.09, 28).rotateX(-Math.PI / 2), ring);
  rim.position.y = 0.02;
  object.add(heading, disc, rim);

  let motion: Motion = 'idle';
  return {
    object, kind, source, ring, color,
    size: Math.max(span.x, span.y, span.z),
    minPixels: kind === 'wheelchair' ? WHEELCHAIR_MIN_PIXELS : MIN_PIXELS,
    setMotion(next) {
      if (next === motion) return;
      motion = next;
      if (raw) for (const m of raw.movers) play(m, next, 0.2);
    },
    tick(seconds) {
      if (raw) for (const m of raw.movers) m.mixer.update(seconds);
    },
    setHeading(radians) {
      heading.rotation.y = radians;
    },
    dispose() {
      if (raw) for (const m of raw.movers) {
        m.mixer.stopAllAction();
        m.mixer.uncacheRoot(m.mixer.getRoot());
      }
    },
  };
}

// Free the GPU memory of everything under root that is not shared: geometry, materials and the bone
// textures of skinned figures. Model data in FIGURE_SHARED, and anything in shared, is kept.
export function disposeTree(root: THREE.Object3D, shared: Set<object>): void {
  const keep = (x: object): boolean => shared.has(x) || FIGURE_SHARED.has(x);
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      if (!keep(o.geometry)) o.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (!keep(m)) m.dispose();
    }
  });
}

// Light for the figures: the route scene is otherwise unlit, and flat colour hides their shape.
export function figureLights(): THREE.Object3D[] {
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(-40, 100, 60);
  return [new THREE.HemisphereLight('#ffffff', '#8a93a6', 1.9), sun];
}
