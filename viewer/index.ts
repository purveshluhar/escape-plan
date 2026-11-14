// Viewer: draws the building and colours each node by token results. Owner: P2.
// Starter: translucent boxes and an isometric orthographic camera. Paths, red X and
// LEVEL COMPLETE are P2's tier 1 task (see viewer/README.md and the `arcade-look` skill).
import * as THREE from 'three';
import type { Building, SolverResult } from '../contract/types.ts';
import { BACKGROUND } from '../design/tokens.ts';
import { nodeBoxes } from './layout.ts';

export interface Viewer {
  show(building: Building, results: SolverResult[]): void;
}

export function createViewer(container: HTMLElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const group = new THREE.Group();
  scene.add(group, new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(20, 40, 10);
  scene.add(sun);

  function resize(): void {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const view = 18;
    const aspect = w / h;
    camera.left = -view * aspect;
    camera.right = view * aspect;
    camera.top = view;
    camera.bottom = -view;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  function show(building: Building): void {
    group.clear();
    for (const box of nodeBoxes(building)) {
      const geometry = new THREE.BoxGeometry(...box.size);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x2a3a66, transparent: true, opacity: 0.35 }),
      );
      mesh.position.set(...box.center);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x5c7cff }),
      );
      edges.position.copy(mesh.position);
      group.add(mesh, edges);
    }
    const bounds = new THREE.Box3().setFromObject(group);
    const center = bounds.getCenter(new THREE.Vector3());
    camera.position.set(center.x + 30, center.y + 30, center.z + 30); // isometric view
    camera.lookAt(center);
    renderer.render(scene, camera);
  }

  return { show };
}
