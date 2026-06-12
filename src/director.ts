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
export class Director {
  private readonly uptimeEl: HTMLElement | null;

  constructor(private readonly c: SceneControls) {
    this.uptimeEl = document.getElementById("hud-uptime");
  }

  handle(e: LiveEvent): void {
    const c = this.c;
    switch (e.type) {
      case "request":
        c.valkey.nudge();
        break;

      case "upload": {
        const v = BUCKET_VISUALS[e.size];
        c.valkey.nudge();
        c.particles.spawnRoute(c.uploadRoute, UPLOAD_COLOR, v.duration, v.scale, () =>
          c.storage.blip(),
        );
        break;
      }

      case "download": {
        const v = BUCKET_VISUALS[e.size];
        c.valkey.nudge();
        c.particles.spawnRoute(c.downloadRoute, DOWNLOAD_COLOR, v.duration, v.scale);
        break;
      }

      case "error":
        c.api.flashError();
        break;

      case "transcode_start":
        c.furnace.start(e.job);
        break;

      case "transcode_progress":
        c.furnace.progress(e.job, e.pct);
        break;

      case "transcode_done":
        c.furnace.finish(e.job);
        c.particles.spawnBurst(c.furnaceTop, e.ok ? BURST_COLOR : BURST_FAIL_COLOR, 26);
        break;

      case "stats":
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
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
