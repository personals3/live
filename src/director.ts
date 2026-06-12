import * as THREE from "three";

import type { LiveEvent, SizeBucket } from "./events";
import { COLORS } from "./materials";
import type { SceneControls } from "./scene";

// Particle colors are HDR (multiplied past 1) with the same per-hue
// luminance compensation as the materials, so a magenta particle blooms
// exactly as hard as a cyan one.
function hdr(hex: number, boost: number): THREE.Color {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar((boost * 0.64) / Math.max(lum, 0.08));
}
const UPLOAD_COLOR = hdr(COLORS.cyan, 2);
const DOWNLOAD_COLOR = hdr(COLORS.fill, 2);
const BURST_COLOR = hdr(COLORS.magenta, 2.4);
const BURST_FAIL_COLOR = hdr(COLORS.red, 2.4);
// Hot-path traffic is frequent — keep it dimmer than the big journeys.
const GLINT_COLOR = hdr(COLORS.amber, 1.4);
const PG_COLOR = hdr(COLORS.ice, 1.5);
const SWEEP_COLOR = hdr(COLORS.green, 0.45); // faint, barely past the bloom knee

/** Bigger payloads → bigger, slower particles. */
const BUCKET_VISUALS: Record<SizeBucket, { scale: number; duration: number }> = {
  small: { scale: 0.8, duration: 1.7 },
  medium: { scale: 1.15, duration: 2.1 },
  large: { scale: 1.6, duration: 2.6 },
};

/**
 * Turns protocol events into scene motion. Pure dispatch — all easing and
 * timing lives in the structures' own update loops, so a burst of events
 * can never animate faster than the scene's frame clock.
 */
const SWEEP_S = 3;

export class Director {
  private readonly uptimeEl: HTMLElement | null;
  private lastDiskPct: number | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly c: SceneControls) {
    this.uptimeEl = document.getElementById("hud-uptime");
  }

  handle(e: LiveEvent): void {
    const c = this.c;
    switch (e.type) {
      case "request":
        c.valkey.nudge();
        this.glint();
        // The vault is consulted often, not always.
        if (Math.random() < 1 / 3) this.pgPulse();
        break;

      case "upload": {
        const v = BUCKET_VISUALS[e.size];
        c.valkey.nudge();
        this.glint();
        this.pgPulse(); // object row write
        c.particles.spawnRoute(c.uploadRoute, UPLOAD_COLOR, v.duration, v.scale, () =>
          c.storage.blip(),
        );
        break;
      }

      case "download": {
        const v = BUCKET_VISUALS[e.size];
        c.valkey.nudge();
        this.glint();
        this.pgPulse(); // metadata lookup
        c.particles.spawnRoute(c.downloadRoute, DOWNLOAD_COLOR, v.duration, v.scale);
        break;
      }

      case "error":
        c.api.flashError();
        // 5xx is OUR fault — punctuate it with the floor shockwave.
        // 4xx (client mistakes) just flicker the bands.
        if (e.status >= 500) c.errorRipple();
        break;

      case "transcode_start":
        c.furnace.start(e.job);
        this.pgPulse(); // job claimed
        break;

      case "transcode_progress":
        c.furnace.progress(e.job, e.pct);
        // progress_pct heartbeats hit the DB ~1/s per job — show a third.
        if (Math.random() < 1 / 3) this.pgPulse();
        break;

      case "transcode_done":
        c.furnace.finish(e.job, e.ok);
        c.particles.spawnBurst(c.furnaceTop, e.ok ? BURST_COLOR : BURST_FAIL_COLOR, 26);
        this.pgPulse(); // final status write
        break;

      case "stats":
        // Disk shrank → the cleaner reaped something. Make it earn the credit.
        if (this.lastDiskPct !== null && e.disk_used_pct < this.lastDiskPct - 0.05) {
          this.cleanerShow();
        }
        this.lastDiskPct = e.disk_used_pct;

        c.api.setReqPerMin(e.req_per_min);
        c.api.setCounterText(`${e.req_per_min} req/min`);
        c.storage.setFillPct(e.disk_used_pct);
        c.storage.setCounterText(`${e.disk_used_pct.toFixed(0)}% used`);
        c.furnace.setCounterText(
          e.active_transcodes === 0 ? "idle" : `${e.active_transcodes} active`,
        );
        if (this.uptimeEl) this.uptimeEl.textContent = `up ${formatUptime(e.uptime_s)}`;
        break;
    }
  }

  /** Tiny amber spark: API → Valkey ring → back. The rate-limit round trip. */
  private glint(): void {
    this.c.particles.spawnRoute(this.c.valkeyGlintRoute, GLINT_COLOR, 0.65, 0.45);
  }

  /** Small ice pulse: API → vault; crystal brightens when it lands. */
  private pgPulse(): void {
    this.c.particles.spawnRoute(this.c.postgresRoute, PG_COLOR, 0.9, 0.6, () =>
      this.c.postgres.pulse(),
    );
  }

  /** The cleaner visibly causes the disk dip: park, brushes up, and a few
   *  faint motes get pulled in off the floor around it. */
  private cleanerShow(): void {
    const c = this.c;
    c.cleaner.sweep(SWEEP_S);
    const pos = c.cleaner.getPosition(this.tmp);
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.4 + Math.random() * 1.6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(pos.x + Math.cos(angle) * radius, 0.06, pos.z + Math.sin(angle) * radius),
        new THREE.Vector3(
          pos.x + Math.cos(angle) * radius * 0.45,
          0.4 + Math.random() * 0.3,
          pos.z + Math.sin(angle) * radius * 0.45,
        ),
        new THREE.Vector3(pos.x, 0.45, pos.z),
      ]);
      c.particles.spawnRoute(curve, SWEEP_COLOR, 0.7 + Math.random() * (SWEEP_S - 1.2), 0.5);
    }
  }
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
