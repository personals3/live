import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

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
  type ApiCoreHandle,
  type CleanerHandle,
  type FurnaceHandle,
  type PostgresHandle,
  type StorageHandle,
  type Structure,
  type ValkeyHandle,
} from "./diorama";
import { bodyMaterial, COLORS } from "./materials";
import { ParticleSystem } from "./particles";

/** Per-frame animation hook: (delta seconds, total elapsed seconds). */
export type Updatable = (dt: number, t: number) => void;

/** Everything the director needs to turn events into motion. */
export interface SceneControls {
  updatables: Updatable[];
  api: ApiCoreHandle;
  furnace: FurnaceHandle;
  storage: StorageHandle;
  valkey: ValkeyHandle;
  postgres: PostgresHandle;
  cleaner: CleanerHandle;
  particles: ParticleSystem;
  /** Tunnel → API → Storage (uploads ride this). */
  uploadRoute: THREE.CatmullRomCurve3;
  /** Storage → Nginx → out of the room (downloads/streams). */
  downloadRoute: THREE.CatmullRomCurve3;
  /** API → Valkey ring and back — the rate-limit round trip. */
  valkeyGlintRoute: THREE.CatmullRomCurve3;
  /** API → Postgres vault — metadata writes. */
  postgresRoute: THREE.CatmullRomCurve3;
  /** Where transcode-done bursts erupt (above the furnace). */
  furnaceTop: THREE.Vector3;
  /** Red shockwave on the floor from the API core — 5xx errors. */
  errorRipple(): void;
}

/** Length of the assembly intro — feeds start after this (main.ts). */
export const INTRO_TOTAL_S = 2.2;
const INTRO_STAGGER_DUR = 0.7;

// Pop-in easing with a little overshoot; lands exactly at 1.
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// Floor plan (top view; the camera starts looking in from +x/+z):
//
//        tunnel ◌ (high)        ▽ nginx
//   postgres ▣        ⬡ API        ▢ furnace
//        valkey ◎            ▢ storage
//                  ◦ cleaner (roams)
//
const API_TOP = new THREE.Vector3(0, 3.4, 0);
const TUNNEL_POS = new THREE.Vector3(-5, 6.5, -5);

export function buildScene(scene: THREE.Scene): SceneControls {
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
  //
  // Intro: structures start at scale ~0 and pop in staggered by
  // `introDelay` (easeOutBack); their labels fade with them and their
  // pads ignite on the same clock, then keep a slow phase-offset breath.
  interface IntroTarget {
    group: THREE.Group;
    delay: number;
    labelEls: HTMLElement[];
  }
  interface PadReg {
    mats: { m: THREE.MeshBasicMaterial; base: number }[];
    delay: number;
    phase: number;
  }
  const intro: IntroTarget[] = [];
  const pads: PadReg[] = [];

  const place = (
    s: Structure,
    x: number,
    y: number,
    z: number,
    introDelay: number,
    padRadius = 0,
    padHex = 0,
  ): void => {
    s.group.position.set(x, y, z);
    scene.add(s.group);
    if (s.update) updatables.push(s.update);

    s.group.scale.setScalar(1e-4);
    const labelEls: HTMLElement[] = [];
    s.group.traverse((o) => {
      if (o instanceof CSS2DObject) labelEls.push(o.element);
    });
    for (const el of labelEls) el.style.opacity = "0";
    intro.push({ group: s.group, delay: introDelay, labelEls });

    if (padRadius > 0) {
      const pad = makeGroundPad(padRadius, padHex);
      pad.position.set(x, 0, z);
      scene.add(pad);
      const mats: PadReg["mats"] = [];
      pad.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshBasicMaterial;
          mats.push({ m, base: m.opacity });
          m.opacity = 0;
        }
      });
      pads.push({ mats, delay: introDelay, phase: pads.length * 1.7 });
    }
  };

  const tunnel = buildTunnel(TUNNEL_POS.distanceTo(API_TOP));
  place(tunnel, TUNNEL_POS.x, TUNNEL_POS.y, TUNNEL_POS.z, 1.3, 1.6, COLORS.cyan);
  tunnel.group.lookAt(API_TOP); // portal faces the core; beam runs along +Z

  const api = buildApiCore();
  place(api, 0, 0, 0, 0.15, 2.2, COLORS.green);
  const postgres = buildPostgres();
  place(postgres, -7, 0, -1, 0.35, 2.0, COLORS.ice);
  const valkey = buildValkey();
  place(valkey, -4, 0, 3.5, 0.5, 1.3, COLORS.amber);
  const furnace = buildFurnace();
  place(furnace, 7, 0, -1.5, 0.65, 1.8, COLORS.magenta);
  const storage = buildStorage();
  place(storage, 5.5, 0, 4, 0.8, 1.6, COLORS.fill);

  const nginx = buildNginx();
  place(nginx, 3.5, 0, -6.5, 0.95, 1.4, COLORS.cyan);
  // Horn opens along local +Z — aim it away from the room's center.
  nginx.group.lookAt(new THREE.Vector3(7, 0, -13));

  const cleaner = buildCleaner();
  place(cleaner, 0, 0, 6.5, 1.1); // pad built in — travels with the drone

  // Assembly intro driver. Cheap no-op after the last structure lands.
  let introDone = false;
  updatables.push((_dt, t) => {
    if (introDone) return;
    let allDone = true;
    for (const it of intro) {
      const p = THREE.MathUtils.clamp((t - it.delay) / INTRO_STAGGER_DUR, 0, 1);
      if (p < 1) allDone = false;
      it.group.scale.setScalar(p === 0 ? 1e-4 : Math.max(easeOutBack(p), 1e-4));
      for (const el of it.labelEls) el.style.opacity = String(p * p);
    }
    introDone = allDone;
  });

  // Pad ignition (intro-gated) + perpetual phase-offset breathing.
  updatables.push((_dt, t) => {
    for (const p of pads) {
      const ignite = THREE.MathUtils.clamp((t - p.delay) / INTRO_STAGGER_DUR, 0, 1);
      const breathe = 0.85 + 0.15 * Math.sin(t * 0.8 + p.phase);
      for (const { m, base } of p.mats) m.opacity = base * ignite * breathe;
    }
  });

  // --- Dust motes: a sparse additive point cloud drifting almost
  // imperceptibly. The cheapest possible "the air is alive".
  const motePositions = new Float32Array(80 * 3);
  for (let i = 0; i < 80; i++) {
    motePositions[i * 3] = (Math.random() - 0.5) * 28;
    motePositions[i * 3 + 1] = 0.3 + Math.random() * 6.5;
    motePositions[i * 3 + 2] = (Math.random() - 0.5) * 28;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(
    moteGeometry,
    new THREE.PointsMaterial({
      color: 0x3a5566,
      size: 0.06,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(motes);
  updatables.push((_dt, t) => {
    motes.rotation.y = t * 0.012;
    motes.position.y = Math.sin(t * 0.12) * 0.18;
  });

  // --- Error ripple: one reusable expanding ring at the API's feet.
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.red,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), rippleMaterial);
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.03;
  ripple.scale.setScalar(1e-4);
  scene.add(ripple);
  let rippleAge = -1; // negative = inactive
  updatables.push((dt) => {
    if (rippleAge < 0) return;
    rippleAge += dt;
    const p = rippleAge / 0.9;
    if (p >= 1) {
      rippleAge = -1;
      rippleMaterial.opacity = 0;
      ripple.scale.setScalar(1e-4);
      return;
    }
    ripple.scale.setScalar(1 + p * 9);
    rippleMaterial.opacity = 0.5 * (1 - p);
  });

  // --- Particle routes (world space). Waypoints chosen to skim past the
  // structures they conceptually pass through, with enough altitude that
  // particles never clip the floor or bodies.
  const uploadRoute = new THREE.CatmullRomCurve3([
    TUNNEL_POS.clone(),
    new THREE.Vector3(-2.5, 4.6, -2.5),
    API_TOP.clone(),
    new THREE.Vector3(3, 4.4, 2),
    new THREE.Vector3(5.5, 3.7, 4), // storage tank mouth
  ]);
  const downloadRoute = new THREE.CatmullRomCurve3([
    new THREE.Vector3(5.5, 3.7, 4), // storage tank mouth
    new THREE.Vector3(4.6, 2.8, -1.2),
    new THREE.Vector3(3.5, 1.6, -6.3), // through the nginx horn
    new THREE.Vector3(7, 1.8, -13), // out along the horn's aim
    new THREE.Vector3(9.5, 2.0, -17.5), // fades into the fog
  ]);
  // Short hot-path hops: out one arc, back a slightly lower one so the
  // round trip doesn't retrace itself.
  const valkeyGlintRoute = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.6, 0),
    new THREE.Vector3(-2.2, 2.7, 1.6),
    new THREE.Vector3(-4, 1.7, 3.5), // the ring
    new THREE.Vector3(-2.0, 1.9, 2.1),
    new THREE.Vector3(0, 2.2, 0.4),
  ]);
  const postgresRoute = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.8, 0),
    new THREE.Vector3(-3.6, 3.3, -0.8),
    new THREE.Vector3(-7, 2.0, -1), // into the vault, at the crystal
  ]);

  const particles = new ParticleSystem(scene);
  updatables.push((dt) => particles.update(dt));

  return {
    updatables,
    api,
    furnace,
    storage,
    valkey,
    postgres,
    cleaner,
    particles,
    uploadRoute,
    downloadRoute,
    valkeyGlintRoute,
    postgresRoute,
    furnaceTop: new THREE.Vector3(7, 2.6, -1.5),
    errorRipple: () => {
      rippleAge = 0;
    },
  };
}
