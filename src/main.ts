import { App } from "./app";
import { Director } from "./director";
import { MockFeed } from "./mock";
import { INTRO_TOTAL_S } from "./scene";

const container = document.getElementById("app");
if (!container) throw new Error("#app container missing from index.html");

const app = new App(container);
const director = new Director(app.controls);

// Milestone 6 adds live.ts: connect SSE unless ?mock=1, and fall back to
// the mock feed whenever the live socket is unreachable. Until then the
// scene always runs on mock data (the HUD badge says so).
// The feed waits for the assembly intro — no particles flying into
// structures that haven't built themselves yet.
const feed = new MockFeed();
window.setTimeout(() => feed.start((e) => director.handle(e)), INTRO_TOTAL_S * 1000);

app.start();
