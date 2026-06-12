import * as THREE from "three";

import { makeLabel } from "./labels";
import { applyRim, bodyMaterial, COLORS, neonMaterial } from "./materials";
import type { Updatable } from "./scene";

/**
 * One structure of the machine-room diorama: a positioned group plus an
 * optional per-frame update. Builders create geometry at their local
 * origin; scene.ts decides the floor plan.
 *
 * MILESTONE 3 = static diorama. Animation here is limited to what gives a
 * structure its identity at rest (the Valkey ring spins — cache IS
 * motion; the API core breathes). Event-driven behavior (furnace
 * ignition, tank level, particles) lands in milestone 4 — the spots are
 * marked with `// m4:` comments.
 */
export interface Structure {
  group: THREE.Group;
  update?: Updatable;
}

/**
 * Faintly glowing disc + edge ring that anchors a structure to the floor —
 * its position stays visible in the structure's color even when the body
 * is dim. Additive and well under the bloom threshold.
 */
export function makeGroundPad(radius: number, hex: number): THREE.Group {
  const pad = new THREE.Group();
  const padMaterial = (opacity: number) =>
    new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), padMaterial(0.07));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02; // above the grid (0.01), below everything else
  pad.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 48),
    padMaterial(0.22),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  pad.add(ring);

  return pad;
}

// ---------------------------------------------------------------------------
// 1. Cloudflare Tunnel — glowing portal up high, beam aimed at the API core.
// ---------------------------------------------------------------------------
export function buildTunnel(beamLength: number): Structure {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.12, 16, 48),
    neonMaterial(COLORS.cyan, 1.8),
  );
  group.add(ring);

  // Soft swirl filling the portal mouth.
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 32),
    new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(swirl);

  // Faint beam tracing the data path toward the API core. m4: upload
  // particles ride this exact line.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.34, beamLength, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.rotation.x = Math.PI / 2; // cylinder Y-axis → group +Z (the lookAt axis)
  beam.position.z = beamLength / 2;
  group.add(beam);

  const label = makeLabel("CLOUDFLARE TUNNEL", COLORS.cyan);
  label.position.set(0, 1.9, 0);
  group.add(label);

  return {
    group,
    update: (dt) => {
      ring.rotation.z += dt * 0.3;
      swirl.rotation.z -= dt * 0.8;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Go API core — hex tower, green bands breathing. m4: pulse rate tracks
//    req/min and the bands flicker red on 4xx/5xx.
// ---------------------------------------------------------------------------
export function buildApiCore(): Structure {
  const group = new THREE.Group();

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 3.2, 6),
    bodyMaterial(COLORS.green, 0.15, { flatShading: true }),
  );
  tower.position.y = 1.6;
  group.add(tower);

  const bandMaterial = neonMaterial(COLORS.green, 1.4);
  const baseIntensity = bandMaterial.emissiveIntensity;
  for (const y of [0.9, 1.7, 2.5]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(1.22, 0.05, 8, 6),
      bandMaterial,
    );
    band.rotation.x = Math.PI / 2;
    band.rotation.z = Math.PI / 6; // align hex ring with the tower's faces
    band.position.y = y;
    group.add(band);
  }

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32),
    neonMaterial(COLORS.green, 1.8),
  );
  beacon.position.y = 3.7;
  group.add(beacon);

  const label = makeLabel("GO API", COLORS.green);
  label.position.set(0, 4.6, 0);
  group.add(label);

  return {
    group,
    update: (dt, t) => {
      // Idle breathing. m4: frequency scales with request rate.
      bandMaterial.emissiveIntensity = baseIntensity * (1 + 0.25 * Math.sin(t * 2.4));
      beacon.rotation.y += dt * 0.8;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. PostgreSQL — open vault cage with a floating crystal.
// ---------------------------------------------------------------------------
export function buildPostgres(): Structure {
  const group = new THREE.Group();
  const cage = bodyMaterial(COLORS.ice, 0.15, { flatShading: true });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.4), cage);
  plinth.position.y = 0.5;
  group.add(plinth);

  for (const [x, z] of [
    [-1.1, -1.1],
    [-1.1, 1.1],
    [1.1, -1.1],
    [1.1, 1.1],
  ]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), cage);
    pillar.position.set(x, 1.8, z);
    group.add(pillar);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 2.4), cage);
  roof.position.y = 2.7;
  group.add(roof);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7),
    neonMaterial(COLORS.ice, 1.3, { flatShading: true }),
  );
  crystal.position.y = 1.8;
  group.add(crystal);

  const label = makeLabel("POSTGRESQL", COLORS.ice);
  label.position.set(0, 3.4, 0);
  group.add(label);

  return {
    group,
    update: (dt, t) => {
      crystal.rotation.y += dt * 0.5;
      crystal.position.y = 1.8 + Math.sin(t * 1.1) * 0.08;
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Valkey — cache = motion: orbiters racing around a tilted ring.
// ---------------------------------------------------------------------------
export function buildValkey(): Structure {
  const group = new THREE.Group();

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 0.5, 8),
    bodyMaterial(COLORS.amber, 0.15, { flatShading: true }),
  );
  pedestal.position.y = 0.25;
  group.add(pedestal);

  const tilt = new THREE.Group();
  tilt.position.y = 1.5;
  tilt.rotation.x = Math.PI * 0.42; // near-horizontal, slightly cocked
  group.add(tilt);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.07, 10, 40),
    neonMaterial(COLORS.amber, 0.9),
  );
  tilt.add(ring);

  // The visible motion: three bright beads racing the ring's groove.
  const spinner = new THREE.Group();
  tilt.add(spinner);
  for (let i = 0; i < 3; i++) {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      neonMaterial(COLORS.amber, 2.0),
    );
    const a = (i / 3) * Math.PI * 2;
    bead.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0);
    spinner.add(bead);
  }

  const label = makeLabel("VALKEY", COLORS.amber);
  label.position.set(0, 2.6, 0);
  group.add(label);

  return {
    group,
    update: (dt) => {
      spinner.rotation.z += dt * 4; // m4: spin rate nudges up on cache hits
    },
  };
}

// ---------------------------------------------------------------------------
// 5. FFmpeg worker — furnace. Idle ember now; m4 ignites it during a
//    transcode and animates the progress ring.
// ---------------------------------------------------------------------------
export function buildFurnace(): Structure {
  const group = new THREE.Group();

  const iron = bodyMaterial(COLORS.magenta, 0.15, { flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 2.0), iron);
  body.position.y = 0.9;
  group.add(body);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), iron);
  chimney.position.set(0.6, 2.35, -0.6);
  group.add(chimney);

  // Furnace mouth — the magenta glow. Idle = faint ember at 0.35.
  // m4: transcode_start ramps this to ~2.0 with heat shimmer.
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.7),
    neonMaterial(COLORS.magenta, 0.35),
  );
  mouth.position.set(0, 0.75, 1.01);
  group.add(mouth);

  // Progress ring above the mouth — dark until a job runs.
  // m4: arc length = transcode_progress pct, full magenta.
  const progressRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.05, 8, 40),
    neonMaterial(COLORS.magenta, 0.1),
  );
  progressRing.position.set(0, 1.95, 1.01);
  group.add(progressRing);

  const label = makeLabel("FFMPEG WORKER", COLORS.magenta);
  label.position.set(0, 3.2, 0);
  group.add(label);

  return { group };
}

// ---------------------------------------------------------------------------
// 6. Storage — translucent tank; fill height = disk usage.
// ---------------------------------------------------------------------------
export function buildStorage(): Structure {
  const group = new THREE.Group();
  const TANK_HEIGHT = 3;

  const housing = bodyMaterial(COLORS.fill);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.25, 0.3, 24),
    housing,
  );
  base.position.y = 0.15;
  group.add(base);

  // Glass shell: fresnel-rimmed so its edges catch a faint line of light.
  // The raw rim intensity looks high but gets multiplied by the 0.12
  // alpha, landing at ~0.14 effective — same "faint" as the bodies.
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, TANK_HEIGHT, 24, 1, true),
    applyRim(
      new THREE.MeshStandardMaterial({
        color: 0x9fd4ff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      COLORS.fill,
      1.2,
    ),
  );
  shell.position.y = 0.3 + TANK_HEIGHT / 2;
  group.add(shell);

  // The liquid. m4: scale.y / position.y bind to stats.disk_used_pct —
  // PLACEHOLDER level until then.
  const fillPct = 0.42;
  const fill = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 0.88, TANK_HEIGHT, 24),
    neonMaterial(COLORS.fill, 0.8),
  );
  fill.scale.y = fillPct;
  fill.position.y = 0.3 + (TANK_HEIGHT * fillPct) / 2;
  group.add(fill);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.05, 0.22, 24),
    housing,
  );
  cap.position.y = 0.3 + TANK_HEIGHT + 0.11;
  group.add(cap);

  const label = makeLabel("STORAGE", COLORS.fill);
  label.position.set(0, 4.2, 0);
  group.add(label);

  return { group };
}

// ---------------------------------------------------------------------------
// 7. Nginx / HLS — emitter horn aimed outward. m4: serves a stream of
//    outbound segment particles from the throat.
// ---------------------------------------------------------------------------
export function buildNginx(): Structure {
  const group = new THREE.Group();

  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.3, 0.4),
    bodyMaterial(COLORS.cyan, 0.15, { flatShading: true }),
  );
  stand.position.y = 0.65;
  group.add(stand);

  // Horn opens along +Z (the direction scene.ts aims away from center).
  const horn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.25, 1.6, 12, 1, true),
    bodyMaterial(COLORS.cyan, 0.15, {
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  horn.rotation.x = Math.PI / 2;
  horn.position.set(0, 1.5, 0.3);
  group.add(horn);

  const throat = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 16),
    neonMaterial(COLORS.cyan, 1.6),
  );
  throat.position.set(0, 1.5, -0.51);
  group.add(throat);

  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.04, 8, 24),
    neonMaterial(COLORS.cyan, 0.7),
  );
  lip.position.set(0, 1.5, 1.1);
  group.add(lip);

  const label = makeLabel("NGINX · HLS", COLORS.cyan);
  label.position.set(0, 2.9, 0);
  group.add(label);

  return { group };
}

// ---------------------------------------------------------------------------
// 8. Cleaner — little drone idling around its corner of the floor.
//    m5 choreographs real periodic sweep runs across the room.
// ---------------------------------------------------------------------------
export function buildCleaner(): Structure {
  const group = new THREE.Group();

  const shell = bodyMaterial(COLORS.green);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.5, 0.22, 20),
    shell,
  );
  body.position.y = 0.17;
  group.add(body);

  // The pad travels with the drone — a moving puddle of underglow.
  group.add(makeGroundPad(0.8, COLORS.green));

  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.035, 8, 28),
    neonMaterial(COLORS.green, 1.2),
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.07;
  group.add(glow);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
    shell,
  );
  mast.position.y = 0.55;
  group.add(mast);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    neonMaterial(COLORS.green, 2.0),
  );
  tip.position.y = 0.82;
  group.add(tip);

  const label = makeLabel("CLEANER", COLORS.green);
  label.position.set(0, 1.4, 0);
  group.add(label);

  // Lazy figure-eight around wherever scene.ts parked it.
  let home: THREE.Vector3 | null = null;
  return {
    group,
    update: (_dt, t) => {
      home ??= group.position.clone();
      const x = home.x + Math.sin(t * 0.25) * 2.2;
      const z = home.z + Math.sin(t * 0.5) * 1.1;
      // Face the direction of travel (derivatives of the path above).
      const dx = Math.cos(t * 0.25) * 0.25 * 2.2;
      const dz = Math.cos(t * 0.5) * 0.5 * 1.1;
      group.position.set(x, group.position.y, z);
      group.rotation.y = Math.atan2(dx, dz);
    },
  };
}
