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
| 2 — scaffold: scene shell, lighting, bloom, orbit @ 60fps | ✅ this commit |
| 3 — static diorama: 8 labeled structures, materials | ⬜ |
| 4 — mock event stream: particles, furnace, tank, counters | ⬜ |
| 5 — polish: idle ambience, error states, load sequence | ⬜ |
| 6 — live SSE connector + server telemetry endpoint | ⬜ |

The current scene shows **placeholder calibration shapes** (an emissive
icosahedron + three brand-color cubes) — they exist to verify bloom, tone
mapping, and the frame loop, and are replaced wholesale in milestone 3.

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
`?mock=1` will force the mock event stream once milestone 4 lands.

## Architecture (code)

```
src/
  main.ts    entry — mounts App
  app.ts     engine shell: renderer, camera, orbit, bloom composer, loop
  scene.ts   scene CONTENTS — the diorama lives here, engine stays put
  stats.ts   tiny FPS meter (?stats=1)
```

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
