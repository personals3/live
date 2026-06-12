import type { EventFeed, LiveEvent } from "./events";

const EVENT_TYPES = new Set([
  "upload",
  "download",
  "request",
  "error",
  "transcode_start",
  "transcode_progress",
  "transcode_done",
  "stats",
]);

export interface LiveFeedOptions {
  url?: string;
  /** Connection established (also fires on every successful reconnect). */
  onUp?: () => void;
  /** Connection lost — a reconnect attempt is already scheduled. */
  onDown?: () => void;
}

/**
 * Real telemetry over SSE (chosen over WebSocket — plain HTTP, friendly
 * to Cloudflare Tunnel). EventSource's built-in retry is bypassed: we
 * close and reconnect ourselves with exponential backoff + jitter so the
 * UI can narrate the connection state.
 */
export class LiveFeed implements EventFeed {
  private readonly url: string;
  private readonly onUp: () => void;
  private readonly onDown: () => void;

  private es: EventSource | null = null;
  private onEvent: (e: LiveEvent) => void = () => {};
  private attempt = 0;
  private retryTimer = 0;
  private stopped = false;

  constructor(opts: LiveFeedOptions = {}) {
    this.url = opts.url ?? "/api/live";
    this.onUp = opts.onUp ?? (() => {});
    this.onDown = opts.onDown ?? (() => {});
  }

  start(onEvent: (e: LiveEvent) => void): void {
    this.onEvent = onEvent;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    this.es?.close();
    this.es = null;
  }

  private connect(): void {
    if (this.stopped) return;
    const es = new EventSource(this.url);
    this.es = es;

    es.onopen = () => {
      this.attempt = 0;
      this.onUp();
    };

    es.onmessage = (msg) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        return; // garbage frame — ignore, the stream stays up
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        EVENT_TYPES.has((parsed as { type?: string }).type ?? "")
      ) {
        this.onEvent(parsed as LiveEvent);
      }
    };

    es.onerror = () => {
      // Covers both failure-to-connect and a dropped stream.
      es.close();
      if (this.es !== es || this.stopped) return;
      this.es = null;
      this.onDown();
      // 1s → 2 → 4 → … capped at 30s, with jitter so a fleet of open
      // tabs doesn't stampede the server after an outage.
      const base = Math.min(1000 * 2 ** this.attempt, 30_000);
      this.attempt++;
      const delay = base * (0.7 + Math.random() * 0.6);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }
}
