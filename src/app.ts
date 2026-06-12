import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from "postprocessing";

import { buildScene, type Updatable } from "./scene";
import { FpsMeter } from "./stats";

/** Re-enable the slow ambient orbit this long after the user lets go. */
const AUTO_ORBIT_RESUME_MS = 8_000;

/**
 * Engine shell: renderer, camera, controls, bloom composer, frame loop.
 * Scene *contents* live in scene.ts so milestone 3 can replace the
 * placeholder diorama without touching any of this.
 */
export class App {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene: THREE.Scene;
  private readonly updatables: Updatable[];
  private readonly fps: FpsMeter;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;

  constructor(container: HTMLElement) {
    // Bloom needs antialias off (the composer renders via buffers; MSAA
    // would be paid for and then thrown away).
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    // DPR capped at 2: retina is visibly sharp at 2, and integrated GPUs
    // (the Iris Xe target) pay quadratically for pixels beyond that.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.8, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 40;
    // Keep the camera above the floor plane.
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.enablePan = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.wireAutoOrbit();

    this.updatables = buildScene(this.scene);

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

    this.fps = new FpsMeter(document.getElementById("stats") as HTMLElement);

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Slow ambient orbit by default; user input takes over, and the orbit
   *  resumes after a few idle seconds. */
  private wireAutoOrbit(): void {
    let resumeTimer = 0;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      window.clearTimeout(resumeTimer);
    });
    this.controls.addEventListener("end", () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        this.controls.autoRotate = true;
      }, AUTO_ORBIT_RESUME_MS);
    });
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);

    // Clamp dt so a debugger pause or dropped tab doesn't teleport
    // animations on the next frame.
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.elapsed += dt;

    this.controls.update();
    for (const update of this.updatables) update(dt, this.elapsed);
    this.composer.render(dt);
    this.labelRenderer.render(this.scene, this.camera);
    this.fps.tick(now);
  };

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
