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
| 4 — mock event stream: particles, furnace, tank, counters | ⬜ |
| 5 — polish: idle ambience, error states, load sequence | ⬜ |
| 6 — live SSE connector + server telemetry endpoint | ⬜ |

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
you check that. `?mock=1` will force the mock event stream once
milestone 4 lands.

## Architecture (code)

```
src/
  main.ts       entry — mounts App
  app.ts        engine shell: renderer, camera, orbit, bloom, labels, loop
  scene.ts      environment + floor plan — composes the structures
  diorama.ts    the 8 structures, one builder each (m4 hook points marked)
  materials.ts  palette + luminance-compensated neon materials
  labels.ts     CSS2D name tags (DOM text — crisp, bloom-free)
  stats.ts      tiny FPS meter (?stats=1)
```

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
