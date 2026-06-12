/**
 * The live event protocol — the single contract between this scene and
 * the PersonalS3 server (and the mock generator, which speaks the same
 * dialect). Milestone 6 implements `GET /api/live` (SSE) emitting exactly
 * these shapes.
 *
 * PRIVACY IS STRUCTURAL: events carry only a type, a size bucket, opaque
 * ids, and timestamps. No filenames, bucket names, user ids, IPs, or
 * object keys — the protocol has no fields to leak them in.
 */

/** Coarse payload size — enough to vary the visuals, too coarse to identify anything. */
export type SizeBucket = "small" | "medium" | "large";

export interface UploadEvent {
  type: "upload";
  size: SizeBucket;
  ts: number;
}

export interface DownloadEvent {
  type: "download";
  size: SizeBucket;
  ts: number;
}

/** Sampled generic API hit (the server caps these and aggregates the rest). */
export interface RequestEvent {
  type: "request";
  ts: number;
}

export interface ErrorEvent {
  type: "error";
  /** HTTP status class only — 4xx/5xx. */
  status: number;
  ts: number;
}

export interface TranscodeStartEvent {
  type: "transcode_start";
  /** Opaque per-job token (NOT the real job id). */
  job: string;
  size: SizeBucket;
  ts: number;
}

export interface TranscodeProgressEvent {
  type: "transcode_progress";
  job: string;
  pct: number;
  ts: number;
}

export interface TranscodeDoneEvent {
  type: "transcode_done";
  job: string;
  ok: boolean;
  ts: number;
}

/** Periodic gauges (every ~5s from the server). */
export interface StatsEvent {
  type: "stats";
  disk_used_pct: number;
  req_per_min: number;
  active_transcodes: number;
  uptime_s: number;
  ts: number;
}

export type LiveEvent =
  | UploadEvent
  | DownloadEvent
  | RequestEvent
  | ErrorEvent
  | TranscodeStartEvent
  | TranscodeProgressEvent
  | TranscodeDoneEvent
  | StatsEvent;

/** A source of LiveEvents — implemented by mock.ts now, live.ts in m6. */
export interface EventFeed {
  start(onEvent: (e: LiveEvent) => void): void;
  stop(): void;
}
