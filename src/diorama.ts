import * as THREE from "three";

import { makeCounter, makeLabel } from "./labels";
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

// Control handles — how the director (events) reaches into structures.
export interface ApiCoreHandle extends Structure {
  /** Breathing rate follows the request rate. */
  setReqPerMin(n: number): void;
  /** Brief red flicker on a 4xx/5xx. */
  flashError(): void;
  setCounterText(text: string): void;
}

export interface FurnaceHandle extends Structure {
  start(job: string): void;
  progress(job: string, pct: number): void;
  finish(job: string, ok: boolean): void;
  setCounterText(text: string): void;
}

export interface StorageHandle extends Structure {
  /** Tank level eases toward the real disk percentage. */
  setFillPct(pct: number): void;
  /** Quick glow blip when an upload lands. */
  blip(): void;
  setCounterText(text: string): void;
}

export interface ValkeyHandle extends Structure {
  /** Each request spins the cache a little faster; decays back to idle. */
  nudge(): void;
}

export interface PostgresHandle extends Structure {
  /** Metadata write landed — crystal brightens for a beat. */
  pulse(): void;
}

export interface CleanerHandle extends Structure {
  /** Sweep show: pause the patrol, spin the brushes up, beacon solid. */
  sweep(durationS: number): void;
  /** Current world position (for the director's suction motes). */
  getPosition(out: THREE.Vector3): THREE.Vector3;
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
  label.object.position.set(0, 1.9, 0);
  group.add(label.object);

  const ringBase = ring.material.emissiveIntensity;
  const swirlBase = swirl.material.opacity;

  return {
    group,
    update: (dt, t) => {
      ring.rotation.z += dt * 0.3;
      swirl.rotation.z -= dt * 0.8;
      // Idle ambience: the portal never sits at a constant brightness.
      ring.material.emissiveIntensity = ringBase * (1 + 0.12 * Math.sin(t * 1.1));
      swirl.material.opacity = swirlBase * (1 + 0.3 * Math.sin(t * 0.7 + 1.2));
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Go API core — hex tower; band breathing rate = request rate, brief
//    red flicker on errors, req/min counter chip.
// ---------------------------------------------------------------------------
export function buildApiCore(): ApiCoreHandle {
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
  label.object.position.set(0, 4.6, 0);
  group.add(label.object);

  const counter = makeCounter();
  counter.object.position.set(0, 4.15, 0);
  group.add(counter.object);

  // Breathing frequency in Hz, driven by req/min (idle floor → busy cap).
  let pulseHz = 0.4;
  let errorLeft = 0;

  return {
    group,
    setReqPerMin: (n) => {
      pulseHz = Math.min(0.4 + n / 80, 2.5);
    },
    flashError: () => {
      errorLeft = 0.18;
    },
    setCounterText: (text) => counter.set(text),
    update: (dt, t) => {
      if (errorLeft > 0) {
        errorLeft -= dt;
        bandMaterial.emissive.setHex(COLORS.red);
        bandMaterial.emissiveIntensity = baseIntensity * 2.2;
        label.setDot(COLORS.red);
      } else {
        bandMaterial.emissive.setHex(COLORS.green);
        bandMaterial.emissiveIntensity =
          baseIntensity * (1 + 0.25 * Math.sin(t * pulseHz * Math.PI * 2));
        label.setDot(COLORS.green);
      }
      beacon.rotation.y += dt * 0.8;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. PostgreSQL — open vault cage with a floating crystal that brightens
//    whenever a metadata write arrives.
// ---------------------------------------------------------------------------
export function buildPostgres(): PostgresHandle {
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
  label.object.position.set(0, 3.4, 0);
  group.add(label.object);

  const crystalBase = crystal.material.emissiveIntensity;
  let writeLeft = 0;

  return {
    group,
    pulse: () => {
      writeLeft = 0.5;
    },
    update: (dt, t) => {
      crystal.rotation.y += dt * 0.5;
      crystal.position.y = 1.8 + Math.sin(t * 1.1) * 0.08;
      if (writeLeft > 0) writeLeft -= dt;
      const write = Math.max(writeLeft, 0) / 0.5;
      crystal.material.emissiveIntensity =
        crystalBase * (1 + 0.15 * Math.sin(t * 0.9 + 0.6)) * (1 + write * 1.1);
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Valkey — cache = motion: orbiters racing around a tilted ring.
// ---------------------------------------------------------------------------
export function buildValkey(): ValkeyHandle {
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
  label.object.position.set(0, 2.6, 0);
  group.add(label.object);

  const IDLE_SPEED = 4;
  let speed = IDLE_SPEED;

  return {
    group,
    nudge: () => {
      speed = Math.min(speed + 1.5, 11);
    },
    update: (dt) => {
      spinner.rotation.z += dt * speed;
      speed += (IDLE_SPEED - speed) * dt * 1.2; // decay back to idle
    },
  };
}

// ---------------------------------------------------------------------------
// 5. FFmpeg worker — furnace. Ignites on transcode_start (heat shimmer
//    while burning), progress arc fills with the job, dies back to ember.
// ---------------------------------------------------------------------------
export function buildFurnace(): FurnaceHandle {
  const group = new THREE.Group();

  const iron = bodyMaterial(COLORS.magenta, 0.15, { flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 2.0), iron);
  body.position.y = 0.9;
  group.add(body);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), iron);
  chimney.position.set(0.6, 2.35, -0.6);
  group.add(chimney);

  // Mouth glow in "cyan units" (neonMaterial compensates magenta ~2.4x);
  // remember the multiplier so targets can be set in units too.
  const IDLE_UNITS = 0.35;
  const BURN_UNITS = 2.2;
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.7),
    neonMaterial(COLORS.magenta, IDLE_UNITS),
  );
  mouth.position.set(0, 0.75, 1.01);
  group.add(mouth);
  const unitScale = mouth.material.emissiveIntensity / IDLE_UNITS;

  // Track ring: always-visible dim circle the progress arc fills in.
  const track = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.05, 8, 40),
    neonMaterial(COLORS.magenta, 0.1),
  );
  track.position.set(0, 1.95, 1.01);
  group.add(track);

  // Progress arc — geometry rebuilt per progress event (~2/s while a job
  // runs; never per-frame). Starts at 12 o'clock, sweeps clockwise.
  const arcMaterial = neonMaterial(COLORS.magenta, 1.8);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 40, 0.01), arcMaterial);
  arc.position.set(0, 1.95, 1.02);
  arc.rotation.z = Math.PI / 2;
  arc.visible = false;
  group.add(arc);

  const label = makeLabel("FFMPEG WORKER", COLORS.magenta);
  label.object.position.set(0, 3.2, 0);
  group.add(label.object);

  const counter = makeCounter();
  counter.object.position.set(0, 2.75, 0);
  group.add(counter.object);

  // The furnace renders ONE job (the most recent start); the counter chip
  // shows how many are burning in total.
  const jobs = new Set<string>();
  let shown: string | null = null;
  let targetUnits = IDLE_UNITS;
  let currentUnits = IDLE_UNITS;
  let failLeft = 0;

  const setArcPct = (pct: number): void => {
    arc.visible = pct >= 2;
    if (!arc.visible) return;
    arc.geometry.dispose();
    arc.geometry = new THREE.TorusGeometry(
      0.55,
      0.06,
      8,
      40,
      (Math.min(pct, 100) / 100) * Math.PI * 2,
    );
  };

  return {
    group,
    start: (job) => {
      jobs.add(job);
      shown = job;
      targetUnits = BURN_UNITS;
      setArcPct(0);
    },
    progress: (job, pct) => {
      jobs.add(job); // late joiners (page opened mid-job) still ignite
      targetUnits = BURN_UNITS;
      shown ??= job;
      if (job === shown) setArcPct(pct);
    },
    finish: (job, ok) => {
      jobs.delete(job);
      if (job === shown) shown = jobs.values().next().value ?? null;
      if (jobs.size === 0) {
        targetUnits = IDLE_UNITS;
        setArcPct(0);
      }
      if (!ok) {
        // Failure: angry red pop that the lerp then drags back down.
        failLeft = 1.4;
        currentUnits = Math.max(currentUnits, BURN_UNITS * 1.3);
      }
    },
    setCounterText: (text) => counter.set(text),
    update: (dt, t) => {
      currentUnits += (targetUnits - currentUnits) * Math.min(dt * 3, 1);
      // Heat shimmer while burning; a slow ember waver when idle — the
      // furnace never reads as a still image.
      const shimmer =
        currentUnits > IDLE_UNITS * 1.5
          ? 1 + 0.12 * Math.sin(t * 23) + 0.08 * Math.sin(t * 7.3)
          : 1 + 0.18 * Math.sin(t * 1.3 + 0.7) + 0.06 * Math.sin(t * 3.1);
      mouth.material.emissiveIntensity = currentUnits * unitScale * shimmer;
      if (failLeft > 0) {
        failLeft -= dt;
        mouth.material.emissive.setHex(failLeft > 0.9 ? COLORS.red : COLORS.magenta);
        label.setDot(COLORS.red);
      } else {
        label.setDot(COLORS.magenta);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Storage — translucent tank; fill height eases toward the real disk %,
//    with a glow blip whenever an upload lands.
// ---------------------------------------------------------------------------
export function buildStorage(): StorageHandle {
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

  // The liquid — level eases toward stats.disk_used_pct.
  const fill = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 0.88, TANK_HEIGHT, 24),
    neonMaterial(COLORS.fill, 0.8),
  );
  const fillBase = fill.material.emissiveIntensity;
  let level = 0.42; // sensible pre-first-stats default
  let targetLevel = level;
  let blipLeft = 0;
  const applyLevel = (): void => {
    fill.scale.y = Math.max(level, 0.02);
    fill.position.y = 0.3 + (TANK_HEIGHT * Math.max(level, 0.02)) / 2;
  };
  applyLevel();
  group.add(fill);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.05, 0.22, 24),
    housing,
  );
  cap.position.y = 0.3 + TANK_HEIGHT + 0.11;
  group.add(cap);

  const label = makeLabel("STORAGE", COLORS.fill);
  label.object.position.set(0, 4.2, 0);
  group.add(label.object);

  const counter = makeCounter();
  counter.object.position.set(0, 3.75, 0);
  group.add(counter.object);

  return {
    group,
    setFillPct: (pct) => {
      targetLevel = Math.min(Math.max(pct / 100, 0), 1);
    },
    blip: () => {
      blipLeft = 0.35;
    },
    setCounterText: (text) => counter.set(text),
    update: (dt, t) => {
      level += (targetLevel - level) * Math.min(dt * 1.5, 1);
      applyLevel();
      if (blipLeft > 0) blipLeft -= dt;
      const blip = Math.max(blipLeft, 0) / 0.35;
      // Slow "lapping" glow so the liquid looks liquid even between blips.
      const lap = 1 + 0.08 * Math.sin(t * 1.4 + 2.3);
      fill.material.emissiveIntensity = fillBase * lap * (1 + blip * 1.4);
    },
  };
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
  label.object.position.set(0, 2.9, 0);
  group.add(label.object);

  const throatBase = throat.material.emissiveIntensity;
  const lipBase = lip.material.emissiveIntensity;

  return {
    group,
    update: (_dt, t) => {
      // Soft hum, throat and lip in counter-phase.
      throat.material.emissiveIntensity = throatBase * (1 + 0.2 * Math.sin(t * 1.7 + 2));
      lip.material.emissiveIntensity = lipBase * (1 + 0.2 * Math.sin(t * 1.7 + 2 + Math.PI));
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Cleaner — sweeper drone patrolling its corner of the floor. Visual
//    parts live in a `hull` subgroup so it can lean into turns without
//    tilting the label or the underglow pad.
// ---------------------------------------------------------------------------
export function buildCleaner(): CleanerHandle {
  const group = new THREE.Group();
  const hull = new THREE.Group();
  group.add(hull);

  const shell = bodyMaterial(COLORS.green, 0.2, { flatShading: true });

  // Chassis: squat cylinder + squashed dome — reads "machine", not "puck".
  const chassis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.68, 0.3, 24),
    shell,
  );
  chassis.position.y = 0.21;
  hull.add(chassis);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    shell,
  );
  dome.scale.y = 0.55;
  dome.position.y = 0.36;
  hull.add(dome);

  // Bumper ring — soft green, the drone's signature silhouette line.
  const bumper = new THREE.Mesh(
    new THREE.TorusGeometry(0.66, 0.05, 8, 28),
    neonMaterial(COLORS.green, 0.5),
  );
  bumper.rotation.x = Math.PI / 2;
  bumper.position.y = 0.2;
  hull.add(bumper);

  const underglow = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.05, 8, 28),
    neonMaterial(COLORS.green, 1.4),
  );
  underglow.rotation.x = Math.PI / 2;
  underglow.position.y = 0.07;
  hull.add(underglow);

  // Headlight eyes — forward is +Z (the travel heading).
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 10),
      neonMaterial(COLORS.green, 2.2),
    );
    eye.position.set(x, 0.32, 0.55);
    hull.add(eye);
  }

  // Spinning sweeper brushes at the front corners — hexagonal so the
  // rotation is actually visible.
  const brushes: THREE.Mesh[] = [];
  for (const x of [-0.45, 0.45]) {
    const brush = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.06, 6),
      shell,
    );
    brush.position.set(x, 0.06, 0.5);
    hull.add(brush);
    brushes.push(brush);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), shell);
  mast.position.y = 0.95;
  hull.add(mast);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    neonMaterial(COLORS.green, 2.0),
  );
  tip.position.y = 1.33;
  hull.add(tip);
  const tipBase = tip.material.emissiveIntensity;

  // The pad travels with the drone — a moving puddle of underglow.
  group.add(makeGroundPad(1.05, COLORS.green));

  const label = makeLabel("CLEANER", COLORS.green);
  label.object.position.set(0, 1.9, 0);
  group.add(label.object);

  // Lazy figure-eight around wherever scene.ts parked it, leaning into
  // the turns like it means it. The patrol runs on its own clock (pathT)
  // so a sweep can pause it without the position jumping on resume.
  let home: THREE.Vector3 | null = null;
  let prevHeading = 0;
  let pathT = 0;
  let sweepLeft = 0;
  let brushSpeed = 9;
  return {
    group,
    sweep: (durationS) => {
      sweepLeft = durationS;
    },
    getPosition: (out) => out.copy(group.position),
    update: (dt, t) => {
      home ??= group.position.clone();
      const sweeping = sweepLeft > 0;
      if (sweeping) sweepLeft -= dt;
      else pathT += dt;

      const x = home.x + Math.sin(pathT * 0.25) * 2.6;
      const z = home.z + Math.sin(pathT * 0.5) * 1.3;
      // Face the direction of travel (derivatives of the path above).
      const dx = Math.cos(pathT * 0.25) * 0.25 * 2.6;
      const dz = Math.cos(pathT * 0.5) * 0.5 * 1.3;
      group.position.set(x, group.position.y, z);
      const heading = Math.atan2(dx, dz);
      group.rotation.y = heading;

      // Lean from turn rate (wrapped so the ±π seam doesn't kick);
      // settles flat while parked for a sweep.
      let dh = heading - prevHeading;
      if (dh > Math.PI) dh -= Math.PI * 2;
      if (dh < -Math.PI) dh += Math.PI * 2;
      prevHeading = heading;
      const lean = sweeping
        ? 0
        : THREE.MathUtils.clamp((dh / Math.max(dt, 1e-3)) * 0.12, -0.2, 0.2);
      hull.rotation.z += (lean - hull.rotation.z) * Math.min(dt * 6, 1);

      // Brushes surge while sweeping, ease back after.
      brushSpeed += ((sweeping ? 30 : 9) - brushSpeed) * Math.min(dt * 4, 1);
      for (const brush of brushes) brush.rotation.y += dt * brushSpeed;

      // Beacon winks on patrol — burns solid while working.
      tip.material.emissiveIntensity = sweeping
        ? tipBase * 1.8
        : tipBase * (0.3 + 1.4 * Math.pow(Math.max(Math.sin(t * 1.6), 0), 8));
    },
  };
}
