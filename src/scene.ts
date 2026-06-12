import * as THREE from "three";

import { COLORS, neonMaterial } from "./materials";

/** Per-frame animation hook: (delta seconds, total elapsed seconds). */
export type Updatable = (dt: number, t: number) => void;

const { cyan: CYAN, magenta: MAGENTA, amber: AMBER } = COLORS;

/**
 * Scene contents. MILESTONE 2 PLACEHOLDER: a lit floor plus a few emissive
 * calibration shapes so lighting, bloom, tone mapping, and the frame loop
 * can be verified at 60fps. Milestone 3 replaces the placeholders with the
 * eight labeled structures of the machine-room diorama.
 */
export function buildScene(scene: THREE.Scene): Updatable[] {
  const updatables: Updatable[] = [];

  // --- Lighting: dim and cool; the final look is mostly emissive-driven.
  scene.add(new THREE.HemisphereLight(0x223344, 0x05070d, 0.6));
  const key = new THREE.DirectionalLight(0x8899bb, 0.4);
  key.position.set(5, 10, 3);
  scene.add(key);

  // --- Floor: dark slab + faint grid, "server room at night".
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const grid = new THREE.GridHelper(80, 80, 0x10333d, 0x0a1620);
  grid.position.y = 0.01; // avoid z-fighting with the slab
  scene.add(grid);

  // --- PLACEHOLDER centerpiece: emissive icosahedron to calibrate bloom.
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.6, 0),
    neonMaterial(CYAN, 1.6, { roughness: 0.35, flatShading: true }),
  );
  core.position.y = 2.2;
  scene.add(core);
  updatables.push((dt) => {
    core.rotation.y += dt * 0.4;
    core.rotation.x += dt * 0.11;
  });

  // --- PLACEHOLDER accents: one cube per brand color, bobbing gently, so
  // bloom can be judged across the palette (not just cyan).
  const accents: THREE.Mesh[] = [];
  [CYAN, MAGENTA, AMBER].forEach((colorHex, i) => {
    const angle = (i / 3) * Math.PI * 2;
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      neonMaterial(colorHex, 1.8),
    );
    cube.position.set(Math.cos(angle) * 5, 1.1, Math.sin(angle) * 5);
    scene.add(cube);
    accents.push(cube);
  });
  updatables.push((_dt, t) => {
    accents.forEach((cube, i) => {
      cube.position.y = 1.1 + Math.sin(t * 1.3 + i * 2.1) * 0.25;
      cube.rotation.y = t * 0.6 + i;
    });
  });

  return updatables;
}
