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
  makeGroundPad,
  type Structure,
} from "./diorama";
import { bodyMaterial, COLORS } from "./materials";

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
  // Two directions (key + opposing fill) so bodies show form — shaded
  // faces, not silhouette-black. The floor's near-black albedo keeps the
  // night mood despite the extra light.
  scene.add(new THREE.HemisphereLight(0x223344, 0x05070d, 0.75));
  const key = new THREE.DirectionalLight(0x8899bb, 0.4);
  key.position.set(5, 10, 3);
  scene.add(key);
  const fillLight = new THREE.DirectionalLight(0x4a5a78, 0.3);
  fillLight.position.set(-6, 4, -8);
  scene.add(fillLight);

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

  // --- Background dressing: rack silhouettes for depth; the fog swallows
  // them at the edges. Cool-grey rim at half the structures' intensity —
  // they should read as atmosphere, never compete with the real eight.
  const rackMaterial = bodyMaterial(0x8fa3b8, 0.07, {
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

  // --- The eight structures. Every one gets a glowing ground pad in its
  // color (floor anchor — position reads even when the body is dim). The
  // cleaner carries its own traveling pad; the tunnel floats, so its pad
  // marks the floor directly beneath the portal.
  const place = (
    s: Structure,
    x: number,
    y: number,
    z: number,
    padRadius = 0,
    padHex = 0,
  ): void => {
    s.group.position.set(x, y, z);
    scene.add(s.group);
    if (s.update) updatables.push(s.update);
    if (padRadius > 0) {
      const pad = makeGroundPad(padRadius, padHex);
      pad.position.set(x, 0, z);
      scene.add(pad);
    }
  };

  const tunnel = buildTunnel(TUNNEL_POS.distanceTo(API_TOP));
  place(tunnel, TUNNEL_POS.x, TUNNEL_POS.y, TUNNEL_POS.z, 1.6, COLORS.cyan);
  tunnel.group.lookAt(API_TOP); // portal faces the core; beam runs along +Z

  place(buildApiCore(), 0, 0, 0, 2.2, COLORS.green);
  place(buildPostgres(), -7, 0, -1, 2.0, COLORS.ice);
  place(buildValkey(), -4, 0, 3.5, 1.3, COLORS.amber);
  place(buildFurnace(), 7, 0, -1.5, 1.8, COLORS.magenta);
  place(buildStorage(), 5.5, 0, 4, 1.6, COLORS.fill);

  const nginx = buildNginx();
  place(nginx, 3.5, 0, -6.5, 1.4, COLORS.cyan);
  // Horn opens along local +Z — aim it away from the room's center.
  nginx.group.lookAt(new THREE.Vector3(7, 0, -13));

  place(buildCleaner(), 0, 0, 6.5); // pad built in — it travels with the drone

  return updatables;
}
