import type { Director } from "./director";
import type { SceneControls } from "./scene";

/**
 * Section choreography (R3): each story section runs a scripted demo on
 * a loop while it's in view — the particle that arrives on cue, the
 * furnace that ignites on cue — layered over the (damped) ambient
 * stream. Leaving a section clears its timers and props.
 */
export class ScriptDirector {
  private timers: number[] = [];
  private section = -1;

  constructor(
    private readonly c: SceneControls,
    private readonly d: Director,
  ) {}

  onSection(i: number): void {
    if (i === this.section) return;
    this.section = i;
    this.clear();
    // Tidy the demo transcode if we left mid-burn (no-op otherwise).
    this.c.furnace.finish("demo-furnace", true);
    // Story sections keep ambient quiet; release (7) restores the full show.
    this.d.setAmbientSubtle(i < 7);

    switch (i) {
      case 1: // the door — a file arrives through the portal
        this.every(5500, () => this.d.demoUpload());
        break;
      case 2: // the brain — rate-limit glint + metadata pulse, called out
        this.every(5000, () => this.brainBeat());
        break;
      case 3: // the shelf — uploads landing in the tank
        this.every(6000, () => this.d.demoUpload());
        break;
      case 4: // the furnace — a full transcode runs while in view
        this.transcodeLoop();
        break;
      case 5: // the mouth — segments streaming out the horn
        this.every(1400, () => this.d.demoDownload());
        break;
      case 6: // the janitor — reclaim show on a loop
        this.every(9000, () => this.d.demoSweep());
        break;
    }
  }

  /** Glint fires immediately; the panel callout flashes with it. The
   *  vault pulse follows, its callout timed to the particle's arrival. */
  private brainBeat(): void {
    this.d.demoGlint();
    this.flash("valkey");
    this.after(700, () => this.d.demoPgPulse());
    this.after(1600, () => this.flash("pg"));
  }

  private flash(name: string): void {
    const el = document.querySelector(`[data-callout="${name}"]`);
    if (!el) return;
    el.classList.add("flash");
    this.after(900, () => el.classList.remove("flash"));
  }

  private transcodeLoop(): void {
    const job = "demo-furnace";
    let pct = 0;
    this.c.furnace.start(job);
    const tick = (): void => {
      pct += 4 + Math.random() * 3;
      if (pct >= 100) {
        this.c.furnace.finish(job, true);
        this.d.demoBurst();
        this.after(2600, () => {
          if (this.section === 4) this.transcodeLoop();
        });
        return;
      }
      this.c.furnace.progress(job, Math.round(pct));
      this.after(400, tick);
    };
    this.after(400, tick);
  }

  private every(ms: number, fn: () => void): void {
    fn();
    this.timers.push(window.setInterval(fn, ms));
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clear(): void {
    for (const t of this.timers) {
      window.clearTimeout(t);
      window.clearInterval(t);
    }
    this.timers = [];
  }
}
