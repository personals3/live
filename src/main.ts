import { App } from "./app";
import { Director } from "./director";
import { LiveFeed } from "./live";
import { MockFeed } from "./mock";
import { INTRO_TOTAL_S } from "./scene";
import { ScriptDirector } from "./script";
import { AttractRig, StoryRig, wireStoryDOM } from "./story";

const container = document.getElementById("app");
if (!container) throw new Error("#app container missing from index.html");

const app = new App(container);
const director = new Director(app.controls);
const handle = director.handle.bind(director);

const params = new URLSearchParams(location.search);

if (params.has("attract")) {
  // Attract mode: slow authored loop for screen recordings — no story
  // DOM, full ambient stream.
  document.body.classList.add("attract");
  app.setRig(new AttractRig(app.camera, app.focus));
} else {
  // Scroll story: the rig owns the camera until the release section; the
  // script director runs each section's demo loop as it comes into view.
  app.setRig(new StoryRig(app.camera, (on) => app.setExplore(on), app.focus));
  const script = new ScriptDirector(app.controls, director);
  wireStoryDOM((i) => script.onSection(i));
}

// Connection state shows in two places: the HUD chip and the hero chip.
const chips = [
  document.getElementById("hud-source"),
  document.getElementById("hero-chip"),
];
function setBadge(text: string, state: "mock" | "live" | "reconnecting"): void {
  for (const chip of chips) {
    if (!chip) continue;
    chip.textContent = text;
    chip.className = `source-chip ${state}`;
  }
}

// Source policy: live telemetry by default; the mock keeps the scene
// beautiful whenever the socket is unreachable; ?mock=1 forces mock.
// Feeds start after the assembly intro so nothing flies at a half-built
// room.
const forceMock = params.has("mock");
const mock = new MockFeed();

function startFeeds(): void {
  if (forceMock) {
    setBadge("MOCK DATA", "mock");
    mock.start(handle);
    return;
  }

  let mockRunning = false;
  const live = new LiveFeed({
    onUp: () => {
      if (mockRunning) {
        mock.stop();
        mockRunning = false;
        director.reset(); // drop mock job state — live owns the furnace now
      }
      app.setDimmed(false);
      setBadge("LIVE", "live");
    },
    onDown: () => {
      app.setDimmed(true);
      setBadge("RECONNECTING · MOCK DATA", "reconnecting");
      if (!mockRunning) {
        director.reset();
        mock.start(handle);
        mockRunning = true;
      }
    },
  });
  setBadge("CONNECTING…", "reconnecting");
  live.start(handle);
}

window.setTimeout(startFeeds, INTRO_TOTAL_S * 1000);

app.start();
