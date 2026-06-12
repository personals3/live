import { App } from "./app";
import { Director } from "./director";
import { MockFeed } from "./mock";

const container = document.getElementById("app");
if (!container) throw new Error("#app container missing from index.html");

const app = new App(container);
const director = new Director(app.controls);

// Milestone 6 adds live.ts: connect SSE unless ?mock=1, and fall back to
// the mock feed whenever the live socket is unreachable. Until then the
// scene always runs on mock data (the HUD badge says so).
const feed = new MockFeed();
feed.start((e) => director.handle(e));

app.start();
