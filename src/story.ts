import * as THREE from "three";

/**
 * The scroll-told story (redesign R1): scroll position drives an authored
 * camera path through the diorama — film shots, not orbit. The rig owns
 * the camera until the final "release" section, where it hands over to
 * free-orbit explore mode; scrolling back up re-locks with a blend so the
 * camera never teleports.
 */

interface Station {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const station = (
  px: number, py: number, pz: number,
  lx: number, ly: number, lz: number,
): Station => ({
  pos: new THREE.Vector3(px, py, pz),
  look: new THREE.Vector3(lx, ly, lz),
});

// One station per section, in scroll order. Tuned by eye against the
// floor plan in scene.ts — adjust freely, the rig interpolates whatever
// is here.
export const STATIONS: Station[] = [
  station(16, 18, 16, 0, 1, 0), //          0 hero — high above the room
  station(-10, 8, -1.5, -5, 6.5, -5), //    1 the door — tunnel portal
  station(4, 4.2, 5.8, -0.5, 2.2, 0.3), //  2 the brain — API, valkey + vault behind
  station(8.8, 3.4, 7.8, 5.5, 1.9, 4), //   3 the shelf — storage tank
  station(10.6, 2.8, 2.2, 7, 1.3, -1.5), // 4 the furnace
  station(-0.6, 2.8, -9.6, 4, 1.5, -7.4), //5 the mouth — nginx horn + exit path
  station(2.2, 1.7, 9.8, 0, 0.5, 6.5), //   6 the janitor — low, at the drone
  station(14, 11, 14, 0, 1.8, 0), //        7 release — the free-orbit home shot
];

/** Scroll progress (in station units) past which orbit takes over. */
const UNLOCK_AT = STATIONS.length - 1 - 0.08;
const RELOCK_BLEND_S = 0.8;

export class StoryRig {
  private sSmooth = 0;
  private explore = false;
  private relockFrom: THREE.Vector3 | null = null;
  private relockBlend = 1; // 1 = fully on the rig
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly setExplore: (on: boolean) => void,
    /** DOF focus point (App.focus) — aimed at the current shot's subject. */
    private readonly focus?: THREE.Vector3,
  ) {}

  /** Continuous section coordinate 0..7 from the page scroll position. */
  private targetS(): number {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return (window.scrollY / max) * (STATIONS.length - 1);
  }

  update(dt: number): void {
    const sT = THREE.MathUtils.clamp(this.targetS(), 0, STATIONS.length - 1);
    // Damped follow — fast scrolling (or a scrollbar yank) can never make
    // the camera move faster than this smoothing allows.
    this.sSmooth += (sT - this.sSmooth) * Math.min(dt * 4, 1);

    const wantExplore = sT >= UNLOCK_AT && this.sSmooth >= UNLOCK_AT - 0.25;
    if (wantExplore !== this.explore) {
      this.explore = wantExplore;
      this.setExplore(wantExplore);
      if (!wantExplore) {
        // Re-locking: orbit may have walked the camera anywhere — blend
        // back onto the rig instead of teleporting.
        this.relockFrom = this.camera.position.clone();
        this.relockBlend = 0;
      }
    }
    if (this.explore) return; // orbit owns the camera now

    const i = Math.min(Math.floor(this.sSmooth), STATIONS.length - 2);
    const f = this.sSmooth - i;
    // Arrive by ~mid-segment and hold — each panel gets a stable frame
    // while it's read, and a snapped section sits exactly on its station.
    const eased = THREE.MathUtils.smoothstep(Math.min(f / 0.55, 1), 0, 1);
    this.pos.lerpVectors(STATIONS[i].pos, STATIONS[i + 1].pos, eased);
    this.look.lerpVectors(STATIONS[i].look, STATIONS[i + 1].look, eased);

    if (this.relockBlend < 1 && this.relockFrom) {
      this.relockBlend = Math.min(this.relockBlend + dt / RELOCK_BLEND_S, 1);
      const blend = THREE.MathUtils.smoothstep(this.relockBlend, 0, 1);
      this.pos.lerpVectors(this.relockFrom, this.pos, blend);
    }

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.focus?.copy(this.look);
  }
}

/**
 * Panel dock-in, progress rail, keyboard paging. `onSection` fires once
 * whenever the nearest section changes (drives the rail and, in R3, the
 * scripted demos).
 */
export function wireStoryDOM(onSection: (i: number) => void = () => {}): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        e.target.classList.toggle("visible", e.isIntersecting);
      }
    },
    { threshold: 0.35 },
  );
  document.querySelectorAll(".panel").forEach((p) => observer.observe(p));

  const sections = Array.from(document.querySelectorAll("main section"));
  const dots = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#rail button"),
  );

  // Rail dots navigate; the active dot tracks scroll.
  for (const dot of dots) {
    dot.addEventListener("click", () => {
      const i = Number(dot.dataset.section ?? 0);
      sections[i]?.scrollIntoView({ behavior: "smooth" });
    });
  }

  let current = -1;
  const syncSection = (): void => {
    const i = THREE.MathUtils.clamp(
      Math.round(window.scrollY / window.innerHeight),
      0,
      sections.length - 1,
    );
    if (i === current) return;
    current = i;
    dots.forEach((d, n) => d.classList.toggle("active", n === i));
    onSection(i);
  };
  window.addEventListener("scroll", syncSection, { passive: true });
  syncSection();

  // Explicit PgUp/PgDn section stepping — native paging lands between
  // snap points in some browsers.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "PageDown" && e.key !== "PageUp") return;
    e.preventDefault();
    const next = THREE.MathUtils.clamp(
      current + (e.key === "PageDown" ? 1 : -1),
      0,
      sections.length - 1,
    );
    sections[next]?.scrollIntoView({ behavior: "smooth" });
  });
}
