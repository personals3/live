import type { EventFeed, LiveEvent, SizeBucket } from "./events";

/**
 * Fake-but-plausible event stream so the scene runs beautifully with no
 * backend at all (the default until milestone 6, and the fallback forever
 * after). Tuned to feel like a small homelab on a busy evening: steady
 * trickle of requests, regular uploads/downloads, a chunky transcode every
 * half minute or so, the rare error.
 */
export class MockFeed implements EventFeed {
  private emit: (e: LiveEvent) => void = () => {};
  private timers = new Set<number>();
  private running = false;

  /** Pretend the server has been up for a few days already. */
  private readonly uptimeBase = 3.2 * 86_400;
  private readonly startedAt = Date.now();

  /** Request timestamps from the last 60s — drives the req/min gauge. */
  private reqWindow: number[] = [];
  private disk = 42;
  private active = new Map<string, { pct: number; pctPerTick: number }>();
  private jobSeq = 0;

  start(onEvent: (e: LiveEvent) => void): void {
    this.emit = onEvent;
    this.running = true;
    this.trafficLoop();
    this.transcodeKicker();
    this.progressTicker();
    this.statsLoop();
    this.sendStats(); // don't make the gauges wait 5s for first paint
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
  }

  // ----------------------------------------------------------- scheduling
  private after(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (this.running) fn();
    }, ms);
    this.timers.add(id);
  }

  private send(e: LiveEvent): void {
    this.reqWindow.push(e.ts);
    this.emit(e);
  }

  // ------------------------------------------------------------- traffic
  private trafficLoop(): void {
    const roll = Math.random();
    const ts = Date.now();
    if (roll < 0.18) {
      const size = randomBucket();
      this.send({ type: "upload", size, ts });
      this.disk = Math.min(80, this.disk + { small: 0.03, medium: 0.08, large: 0.2 }[size]);
      // Big uploads often kick off a transcode shortly after landing.
      if (size === "large" && Math.random() < 0.65) {
        this.after(rand(800, 1600), () => this.startTranscode("large"));
      }
    } else if (roll < 0.3) {
      this.send({ type: "download", size: randomBucket(), ts });
    } else if (roll < 0.33) {
      this.send({ type: "error", status: pick([404, 403, 500, 503]), ts });
    } else {
      this.send({ type: "request", ts });
    }
    this.after(rand(150, 1200), () => this.trafficLoop());
  }

  // ----------------------------------------------------------- transcodes
  /** Guarantee furnace action even when the upload dice run cold. */
  private transcodeKicker(): void {
    if (this.active.size < 2) this.startTranscode(randomBucket());
    this.after(rand(18_000, 35_000), () => this.transcodeKicker());
  }

  private startTranscode(size: SizeBucket): void {
    const job = `mock-${++this.jobSeq}`;
    const durationS = rand(12, 28);
    this.active.set(job, { pct: 0, pctPerTick: 100 / (durationS * 2) });
    this.send({ type: "transcode_start", job, size, ts: Date.now() });
  }

  private progressTicker(): void {
    for (const [job, state] of this.active) {
      state.pct += state.pctPerTick * rand(0.7, 1.3);
      if (state.pct >= 100) {
        this.active.delete(job);
        this.send({ type: "transcode_done", job, ok: Math.random() < 0.94, ts: Date.now() });
        // Published segments take a visible bite of disk.
        this.disk = Math.min(80, this.disk + 0.3);
      } else {
        this.send({
          type: "transcode_progress",
          job,
          pct: Math.round(state.pct),
          ts: Date.now(),
        });
      }
    }
    this.after(500, () => this.progressTicker());
  }

  // ---------------------------------------------------------------- stats
  private statsLoop(): void {
    this.after(5_000, () => {
      this.sendStats();
      this.statsLoop();
    });
  }

  private sendStats(): void {
    const now = Date.now();
    this.reqWindow = this.reqWindow.filter((t) => now - t < 60_000);
    // The cleaner reaps something every so often.
    if (Math.random() < 0.06) this.disk = Math.max(35, this.disk - rand(0.3, 0.8));
    this.emit({
      type: "stats",
      disk_used_pct: Math.round(this.disk * 10) / 10,
      req_per_min: this.reqWindow.length,
      active_transcodes: this.active.size,
      uptime_s: Math.round(this.uptimeBase + (now - this.startedAt) / 1000),
      ts: now,
    });
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBucket(): SizeBucket {
  const r = Math.random();
  return r < 0.6 ? "small" : r < 0.9 ? "medium" : "large";
}
