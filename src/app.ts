import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import {
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from "postprocessing";

import { buildScene, type SceneControls, type Updatable } from "./scene";
import { FpsMeter } from "./stats";

/** Re-enable the slow ambient orbit this long after the user lets go. */
const AUTO_ORBIT_RESUME_MS = 8_000;

type Quality = "high" | "low";

/** ?quality=low|high overrides; otherwise coarse pointers / small screens
 *  start low and desktops start high (auto-degrade can still drop them). */
function resolveQuality(): Quality {
  const q = new URLSearchParams(location.search).get("quality");
  if (q === "low" || q === "high") return q;
  const coarse =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  return coarse ? "low" : "high";
}

/**
 * Engine shell: renderer, camera, controls, bloom composer, frame loop.
 * Scene *contents* live in scene.ts so milestone 3 can replace the
 * placeholder diorama without touching any of this.
 */
export class App {
  private readonly renderer: THREE.WebGLRenderer;
  /** Public: the story rig drives this directly during the scroll story. */
  readonly camera: THREE.PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene: THREE.Scene;
  private readonly updatables: Updatable[];
  private readonly fps: FpsMeter;

  /** Handles the Director uses to drive the scene from events. */
  readonly controls: SceneControls;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private targetExposure = 1;
  private rig: { update(dt: number): void } | null = null;
  private explore = true;

  /** DOF focus point — the rig aims it at the current shot's subject. */
  readonly focus = new THREE.Vector3(0, 1.8, 0);
  private quality: Quality;
  private cinePass: EffectPass | null = null;
  // Auto-degrade bookkeeping: rolling frame-time windows.
  private frameAcc = 0;
  private frameCount = 0;
  private slowWindows = 0;

  constructor(container: HTMLElement) {
    this.quality = resolveQuality();
    // Bloom needs antialias off (the composer renders via buffers; MSAA
    // would be paid for and then thrown away).
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    // DPR capped at 2: retina is visibly sharp at 2, and integrated GPUs
    // (the Iris Xe target) pay quadratically for pixels beyond that.
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.quality === "high" ? 2 : 1.5),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = this.quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // DOM overlay for structure labels — crisp text, outside the bloom.
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.inset = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.018);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(14, 11, 14);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 1.8, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.06;
    this.orbit.minDistance = 6;
    this.orbit.maxDistance = 40;
    // Keep the camera above the floor plane.
    this.orbit.maxPolarAngle = Math.PI * 0.46;
    this.orbit.enablePan = false;
    this.orbit.autoRotate = true;
    this.orbit.autoRotateSpeed = 0.5;
    this.wireAutoOrbit();

    const sceneControls = buildScene(this.scene);
    this.controls = sceneControls;
    this.updatables = sceneControls.updatables;

    // HalfFloat buffers so emissive values > 1 survive into the bloom pass.
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // ?nobloom=1 — debug flag for the lighting rule "every structure must
    // be identifiable WITHOUT bloom" (rim light + ground pads do that job;
    // bloom only adds the drama).
    if (!new URLSearchParams(location.search).has("nobloom")) {
      this.composer.addPass(
        new EffectPass(
          this.camera,
          new BloomEffect({
            intensity: 0.9,
            luminanceThreshold: 0.25,
            luminanceSmoothing: 0.2,
            mipmapBlur: true,
          }),
        ),
      );
    }
    // The cinematography stack (quality=high only): shallow depth of field
    // focused on the current shot's subject, vignette, edge chromatic
    // aberration, and fine grain. One combined pass; auto-degrade just
    // flips it off.
    if (this.quality === "high") {
      const dof = new DepthOfFieldEffect(this.camera, {
        focusDistance: 0.02,
        focalLength: 0.06,
        bokehScale: 1.8,
        height: 480,
      });
      dof.target = this.focus; // shared vector — the rig mutates it
      this.cinePass = new EffectPass(
        this.camera,
        dof,
        new ChromaticAberrationEffect({
          offset: new THREE.Vector2(0.0007, 0.0007),
          radialModulation: true,
          modulationOffset: 0.35,
        }),
        new VignetteEffect({ offset: 0.32, darkness: 0.62 }),
        new NoiseEffect({ premultiply: true }),
      );
      this.composer.addPass(this.cinePass);
    }

    this.fps = new FpsMeter(document.getElementById("stats") as HTMLElement);

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Disconnected look: the room's lights ease down, nothing stops. */
  setDimmed(dimmed: boolean): void {
    this.targetExposure = dimmed ? 0.45 : 1;
  }

  /** Hand the camera to the story rig (it calls setExplore for handover). */
  setRig(rig: { update(dt: number): void }): void {
    this.rig = rig;
    this.setExplore(false);
  }

  /**
   * Story ↔ explore handover. Locked: the rig owns the camera and the
   * canvas ignores the pointer so wheel/touch scroll the page. Explore:
   * free orbit, auto-rotate, canvas takes pointer input again.
   */
  setExplore(on: boolean): void {
    if (on === this.explore) return;
    this.explore = on;
    this.orbit.enabled = on;
    this.orbit.autoRotate = on;
    this.renderer.domElement.style.pointerEvents = on ? "auto" : "none";
    if (on) this.orbit.target.set(0, 1.8, 0); // matches the release shot
  }

  /** Slow ambient orbit by default; user input takes over, and the orbit
   *  resumes after a few idle seconds. */
  private wireAutoOrbit(): void {
    let resumeTimer = 0;
    this.orbit.addEventListener("start", () => {
      this.orbit.autoRotate = false;
      window.clearTimeout(resumeTimer);
    });
    this.orbit.addEventListener("end", () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        this.orbit.autoRotate = true;
      }, AUTO_ORBIT_RESUME_MS);
    });
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);

    // Clamp dt so a debugger pause or dropped tab doesn't teleport
    // animations on the next frame.
    const rawDt = (now - this.lastTime) / 1000;
    const dt = Math.min(rawDt, 0.1);
    this.lastTime = now;
    this.elapsed += dt;
    this.watchFrameBudget(rawDt);

    this.rig?.update(dt);
    if (this.orbit.enabled) this.orbit.update();
    for (const update of this.updatables) update(dt, this.elapsed);
    this.renderer.toneMappingExposure +=
      (this.targetExposure - this.renderer.toneMappingExposure) * Math.min(dt * 3, 1);
    this.composer.render(dt);
    this.labelRenderer.render(this.scene, this.camera);
    this.fps.tick(now);
  };

  /** Sustained frame time over 20ms drops quality=high to low at runtime:
   *  the cine pass turns off, shadows turn off, DPR drops. One-way. */
  private watchFrameBudget(rawDt: number): void {
    if (this.quality !== "high" || this.elapsed < 6) return; // skip warmup
    this.frameAcc += rawDt;
    if (++this.frameCount < 60) return;
    const avg = this.frameAcc / this.frameCount;
    this.frameAcc = 0;
    this.frameCount = 0;
    this.slowWindows = avg > 0.02 ? this.slowWindows + 1 : 0;
    if (this.slowWindows < 3) return;

    this.quality = "low";
    if (this.cinePass) this.cinePass.enabled = false;
    this.renderer.shadowMap.enabled = false;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        (o.material as THREE.Material).needsUpdate = true;
      }
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.setSize(window.innerWidth, window.innerHeight);
    console.info(
      "[ps3-live] sustained frame time > 20ms — degraded to quality=low",
    );
  }

  /** Stop the loop entirely while the tab is hidden — zero GPU/CPU spend. */
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.rafId === 0) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.frame);
    }
  };

  private readonly onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  };
}
