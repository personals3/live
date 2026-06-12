/**
 * Tiny FPS readout — visible in dev builds or with ?stats=1 in any build.
 * Hand-rolled (a dependency would be overkill for one number); updates the
 * DOM only twice a second so the meter itself stays free.
 */
export class FpsMeter {
  private frames = 0;
  private windowStart = 0;
  private readonly enabled: boolean;

  constructor(private readonly el: HTMLElement) {
    this.enabled =
      import.meta.env.DEV ||
      new URLSearchParams(location.search).has("stats");
    if (this.enabled) el.style.display = "block";
  }

  tick(now: number): void {
    if (!this.enabled) return;
    if (this.windowStart === 0) this.windowStart = now;
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed >= 500) {
      const fps = (this.frames * 1000) / elapsed;
      this.el.textContent = `${fps.toFixed(0)} fps`;
      this.frames = 0;
      this.windowStart = now;
    }
  }
}
