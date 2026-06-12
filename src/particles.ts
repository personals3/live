import * as THREE from "three";

/**
 * One instanced pool for every particle in the scene — route-followers
 * (uploads/downloads gliding along curves) and bursts (transcode-done
 * fireworks). Hard cap, slot reuse, and zero allocations in update():
 * spawn beyond capacity silently drops, which under event storms degrades
 * to "slightly fewer sparks" instead of GC stutter.
 */
const MAX_PARTICLES = 192;

const enum Mode {
  Off = 0,
  Route = 1,
  Burst = 2,
}

interface Slot {
  mode: Mode;
  /** 0..1 progress for routes; seconds lived for bursts. */
  t: number;
  duration: number;
  scale: number;
  route: THREE.Curve<THREE.Vector3> | null;
  // Burst state (flat numbers — no Vector3 churn).
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  onArrive: (() => void) | null;
}

export class ParticleSystem {
  private readonly mesh: THREE.InstancedMesh;
  private readonly slots: Slot[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly point = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.1, 6, 5),
      // White base; per-particle color via instanceColor (HDR values OK).
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PARTICLES,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // instances roam the whole room
    scene.add(this.mesh);

    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.slots.push({
        mode: Mode.Off,
        t: 0,
        duration: 1,
        scale: 1,
        route: null,
        px: 0,
        py: 0,
        pz: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        onArrive: null,
      });
      this.mesh.setMatrixAt(i, hidden);
      this.mesh.setColorAt(i, white); // initializes instanceColor buffer
    }
  }

  /** Glide along `route` over `duration` seconds. */
  spawnRoute(
    route: THREE.Curve<THREE.Vector3>,
    color: THREE.Color,
    duration: number,
    scale = 1,
    onArrive: (() => void) | null = null,
  ): void {
    const i = this.freeSlot();
    if (i < 0) return; // pool exhausted — drop, never grow
    const s = this.slots[i];
    s.mode = Mode.Route;
    s.t = 0;
    s.duration = duration;
    s.scale = scale;
    s.route = route;
    s.onArrive = onArrive;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Radial firework from `origin` — transcode completion. */
  spawnBurst(origin: THREE.Vector3, color: THREE.Color, count: number): void {
    for (let n = 0; n < count; n++) {
      const i = this.freeSlot();
      if (i < 0) return;
      const s = this.slots[i];
      s.mode = Mode.Burst;
      s.t = 0;
      s.duration = 0.6 + Math.random() * 0.5;
      s.scale = 0.6 + Math.random() * 0.6;
      s.route = null;
      s.onArrive = null;
      s.px = origin.x;
      s.py = origin.y;
      s.pz = origin.z;
      // Random direction, upward bias — it's an exhaust plume, not a bomb.
      const theta = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      const up = 0.3 + Math.random() * 0.7;
      const planar = Math.sqrt(Math.max(0, 1 - up * up));
      s.vx = Math.cos(theta) * planar * speed;
      s.vy = up * speed;
      s.vz = Math.sin(theta) * planar * speed;
      this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    const { dummy, point } = this;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = this.slots[i];
      if (s.mode === Mode.Off) continue;

      if (s.mode === Mode.Route) {
        s.t += dt / s.duration;
        if (s.t >= 1) {
          const cb = s.onArrive;
          this.kill(i);
          cb?.();
          continue;
        }
        s.route!.getPoint(s.t, point);
        dummy.position.copy(point);
        // Swell in, cruise, shrink out.
        const fade = Math.min(s.t * 6, (1 - s.t) * 6, 1);
        dummy.scale.setScalar(s.scale * fade);
      } else {
        s.t += dt;
        if (s.t >= s.duration) {
          this.kill(i);
          continue;
        }
        s.px += s.vx * dt;
        s.py += s.vy * dt;
        s.pz += s.vz * dt;
        s.vy -= 6 * dt; // gravity pulls the plume back down
        dummy.position.set(s.px, s.py, s.pz);
        dummy.scale.setScalar(s.scale * (1 - s.t / s.duration));
      }

      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private freeSlot(): number {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.slots[i].mode === Mode.Off) return i;
    }
    return -1;
  }

  private kill(i: number): void {
    const s = this.slots[i];
    s.mode = Mode.Off;
    s.route = null;
    s.onArrive = null;
    this.dummy.position.set(0, -10, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
}
