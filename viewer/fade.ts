// Fading a loaded model in three.js: the facade and the city when the viewer opens the building
// (onReveal in index.ts). Owner: P2. Runs in Node too, so it is tested in fade.test.ts.
import * as THREE from 'three';

// Fade materials to `keep` of their own opacity (1 = as loaded). The loaded values are kept in
// userData, so a fade back restores glass that was already see-through.
export function fadeMaterials(object: THREE.Object3D, keep: number): void {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of [o.material].flat() as THREE.Material[]) {
      const base = (m.userData.loaded ??= {
        opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, forceSinglePass: m.forceSinglePass,
      }) as { opacity: number; transparent: boolean; depthWrite: boolean; forceSinglePass: boolean };
      const fading = keep < 1;
      const transparent = base.transparent || fading;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = base.opacity * keep;
      // three draws a see-through double-sided mesh twice (back, then front); once is enough here.
      m.forceSinglePass = fading || base.forceSinglePass;
    }
  });
}
