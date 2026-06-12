import * as THREE from "three";

import {
  buildApiCore,
  buildCleaner,
  buildFurnace,
  buildNginx,
  buildPostgres,
  buildStorage,
  buildTunnel,
  buildValkey,
  type Structure,
} from "./diorama";

/** Per-frame animation hook: (delta seconds, total elapsed seconds). */
export type Updatable = (dt: number, t: number) => void;

// Floor plan (top view; the camera starts looking in from +x/+z):
//
//        tunnel ◌ (high)        ▽ nginx
//   postgres ▣        ⬡ API        ▢ furnace
//        valkey ◎            ▢ storage
//                  ◦ cleaner (roams)
//
const API_TOP = new THREE.Vector3(0, 3.4, 0);
const TUNNEL_POS = new THREE.Vector3(-5, 6.5, -5);

export function buildScene(scene: THREE.Scene): Updatable[] {
  const updatables: Updatable[] = [];

  // --- Lighting: dim and cool; the structures' emissives carry the look.
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

  // --- Background dressing: unlit rack silhouettes for depth; the fog
  // swallows them at the edges.
  const rackMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c1019,
    roughness: 1,
  });
  const racks: Array<[x: number, z: number, w: number, h: number]> = [
    [-11, -8, 1.6, 2.6],
    [-13, 2, 1.4, 1.8],
    [-9, 9, 1.8, 2.2],
    [10, -9, 1.6, 3.0],
    [13, 1, 1.4, 2.4],
    [9, 10, 1.8, 1.6],
  ];
  for (const [x, z, w, h] of racks) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), rackMaterial);
    rack.position.set(x, h / 2, z);
    scene.add(rack);
  }

  // --- The eight structures.
  const place = (s: Structure, x: number, y: number, z: number): void => {
    s.group.position.set(x, y, z);
    scene.add(s.group);
    if (s.update) updatables.push(s.update);
  };

  const tunnel = buildTunnel(TUNNEL_POS.distanceTo(API_TOP));
  place(tunnel, TUNNEL_POS.x, TUNNEL_POS.y, TUNNEL_POS.z);
  tunnel.group.lookAt(API_TOP); // portal faces the core; beam runs along +Z

  place(buildApiCore(), 0, 0, 0);
  place(buildPostgres(), -7, 0, -1);
  place(buildValkey(), -4, 0, 3.5);
  place(buildFurnace(), 7, 0, -1.5);
  place(buildStorage(), 5.5, 0, 4);

  const nginx = buildNginx();
  place(nginx, 3.5, 0, -6.5);
  // Horn opens along local +Z — aim it away from the room's center.
  nginx.group.lookAt(new THREE.Vector3(7, 0, -13));

  place(buildCleaner(), 0, 0, 6.5);

  return updatables;
}
