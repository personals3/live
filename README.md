# ps3-live

**Live 3D visualization of the PersonalS3 homelab** — a stylized
"server room at night" rendered with Three.js, where real telemetry from
[personals3.tech](https://personals3.tech) drives the animation.
Deployed at **live.personals3.tech**.

![screenshot placeholder — milestone 3 will add the diorama](docs/screenshot-placeholder.png)

## How it works

```
                       browser (this app, static dist/)
                       ┌──────────────────────────────────┐
   SSE /api/live  ───▶ │ live.ts ──┐                      │
   (real telemetry)    │           ├─▶ scene: 8 structures │
   mock.ts        ───▶ │ events ───┘   particles, gauges  │
   (?mock=1/offline)   │   app.ts: renderer/bloom/orbit   │
                       └──────────────────────────────────┘
```

- **Runs on mock data by default** — the scene is fully alive without any
  backend: a fake event generator produces uploads, transcodes, and stats.
  The real SSE connector (milestone 6) carries the same event protocol, so
  swapping in live telemetry changes nothing visually.
- Color language: **cyan** data-in · **magenta** transcode ·
  **green** healthy · **amber** queued · **red** errors.
- No framework, no React — vanilla TypeScript, `three`, `postprocessing`,
  Vite. Output is a plain static `dist/` (deployed via gitDeploy).

## Status

| Milestone | State |
|---|---|
| 2 — scaffold: scene shell, lighting, bloom, orbit @ 60fps | ✅ |
| 3 — static diorama: 8 labeled structures, materials | ✅ |
| 4 — mock event stream: particles, furnace, tank, counters | ✅ |
| 5 — polish: idle ambience, error states, load sequence, cleaner body upgrade | ✅ |
| 6 — live SSE connector + server telemetry endpoint | ✅ |

Connection policy: the scene connects to the live stream on load and
shows a green **LIVE** badge. The stream URL defaults to the relative
`/api/live` (same-origin deploys); for static hosts that can't proxy —
live.personals3.tech on gitDeploy — bake the absolute URL in at build
time (the server sends `Access-Control-Allow-Origin: *` on this one
endpoint):

```bash
VITE_LIVE_URL=https://personals3.tech/api/live npm run build
``` If the socket drops or never connects,
the room dims, the badge pulses **RECONNECTING · MOCK DATA**, and the
mock feed keeps the scene alive while `live.ts` retries with exponential
backoff (1s → 30s cap, jittered). The moment the stream is back, mock
stops, the lights come back up, and cross-source furnace state is
cleared. `?mock=1` skips live entirely.

Polish notes: every structure carries a subtle phase-offset idle pulse
(the scene is never a still image); ground pads breathe; dust motes
drift; structures assemble in a staggered pop-in on first load (the
event feed politely waits for it); 5xx errors fire a red shockwave
across the floor while 4xx just flicker the API bands; failed
transcodes flash the furnace mouth red and flip its status dot; the
cleaner is now a proper sweeper drone — dome, bumper ring, headlight
eyes, spinning brushes, winking beacon mast — that leans into its turns.

The diorama: **Cloudflare Tunnel** (portal up high, beam aimed at the
core) → **Go API** (hex tower, breathing green bands) flanked by
**PostgreSQL** (vault cage + floating crystal), **Valkey** (amber ring
with racing beads — cache is motion), **FFmpeg worker** (furnace, idle
magenta ember + dark progress ring), **Storage** (translucent tank,
placeholder 42% fill), **Nginx · HLS** (emitter horn aimed outward), and
the **Cleaner** drone idling around the floor. Values that look alive but
static (tank level, furnace glow) bind to real telemetry in milestone 4 —
the hook points are marked `// m4:` in `src/diorama.ts`.

## Run it

With Node 20+ locally:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + bundle → dist/
npm run preview    # serve the production build
```

No Node on the machine (the homelab way — same as the dashboard):

```bash
docker run --rm -it -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/app -w /app -p 5173:5173 node:22-alpine \
  sh -c "npm install && npm run dev"
```

Useful URL flags: `?stats=1` shows the FPS meter (always on in dev builds).
`?nobloom=1` disables the bloom pass — the scene's lighting rule is
"identity through rim light and ground pads, drama through bloom", so
every structure must stay identifiable with bloom off; this flag is how
you check that. `?mock=1` forces the mock event stream (no live
connection attempts).

## Architecture (code)

```
src/
  main.ts       entry — App + Director + event feed
  app.ts        engine shell: renderer, camera, orbit, bloom, labels, loop
  scene.ts      environment + floor plan + particle routes → SceneControls
  diorama.ts    the 8 structures; reactive ones expose control handles
  director.ts   protocol events → scene motion (pure dispatch)
  events.ts     the typed event protocol (shared contract with the server)
  live.ts       SSE connector — backoff, up/down callbacks, frame validation
  mock.ts       fake-but-plausible event stream (fallback + ?mock=1)
  particles.ts  one InstancedMesh pool: route gliders + bursts, hard cap
  materials.ts  palette + luminance-compensated neon materials
  labels.ts     CSS2D name tags + holographic counter chips
  stats.ts      tiny FPS meter (?stats=1)
```

Event → effect map: **upload** = cyan particle Tunnel → API → Storage
(tank blips on arrival) · **download** = particle Storage → Nginx → out
into the fog · **transcode_start** = furnace ignites with heat shimmer,
progress arc fills · **transcode_done** = magenta burst (red if failed) ·
**error** = red flicker on the API bands · **request** = the Valkey ring
spins up · **stats** = tank level, req/min + disk + active-jobs counters,
API pulse rate, uptime in the HUD.

Hot-path traffic (smaller and subtler than the journeys, since it's
constant): every request fires a tiny amber **glint** API → Valkey ring
and back — the rate-limit round trip; metadata writes send a small
ice-blue pulse API → **Postgres** vault and the crystal brightens on
arrival (always for uploads/downloads/transcode lifecycle, 1-in-3 for
plain requests, so it reads consulted-often-not-always); and when stats
show disk usage *dropping*, the **cleaner** visibly earns it — parks its
patrol, surges its brushes, burns its beacon solid, and pulls a few
faint motes off the floor while the tank eases down in sync. Privacy is structural: the protocol
(`events.ts`) only has fields for type, size bucket, opaque job ids, and
timestamps — nothing user-identifying exists to render.

A note on the materials: bloom thresholds on Rec. 709 luminance, which is
~72% green — at equal intensity magenta would never bloom while cyan and
amber halo happily. `neonMaterial()` luminance-compensates every palette
color against a cyan anchor so the whole palette glows equally.

Idle visibility follows one rule: **identity through rim light and pads,
drama through bloom.** Every body material carries a faint fresnel rim in
its structure's identity color (`bodyMaterial()` — intensity 0.15, below
the bloom threshold so rims never halo), every structure sits on a softly
glowing ground pad in its color, and background racks get a dimmer
cool-grey rim so they read as atmosphere, not structures. The fog and
floor stay night-dark; verify with `?nobloom=1`.

Coming in later milestones: `events.ts` (the typed event protocol),
`mock.ts` (fake generator), `live.ts` (SSE + reconnect).

## Performance budget

Target: **60fps on Intel Iris Xe integrated graphics**, degrading
gracefully on mobile.

- Pixel ratio capped at 2 (integrated GPUs pay quadratically past that)
- Bloom via `postprocessing` with mipmap blur (cheapest decent bloom);
  antialias off — the composer owns the framebuffer
- Rendering **stops entirely** when the tab is hidden
- Milestone 4 adds: instanced particles with hard caps, no per-frame
  allocations in the hot loop
