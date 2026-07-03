# Decision: overlay config mechanism + asset persistence

**Issue:** #32 (spike, gates epic #19) · **Milestone:** 0.2.0
**Status:** Accepted · **Date:** 2026-07-01

Resolves the gating question for the overlay-configuration epic: where battlecast
stores layout/logo **config** and how it serves logo **image assets**. Confirms the
working recommendation in `docs/plans/0.2.0-overlay-config.md` (approach 3) and pins
the config contract that #16, #33, and #34 build against.

## Decision

Adopt **approach 3 — a light companion server** as the primary run mode, with the
**render path designed to also work as a pure static deploy (approach 1)**. The two
coexist by one principle:

> **Split read from write.** The OBS render page only ever *reads* config + image
> URLs over HTTP; the config UI is the only thing that *writes*. So the render path
> is identical whether those URLs are served by the companion server or by a plain
> static host with committed `config/` + `logos/` folders — static degradation is a
> property of the design, not a second code path.

Approach 2 (localStorage/IndexedDB) is **rejected**: the OBS Browser Source is a
separate browser context from the config UI, so per-origin client storage cannot hand
a profile + its images from the editor to the render page.

## Why (grounded in the current codebase)

1. **battlecast already needs an HTTP server with SPA fallback.** Routing is
   pathname-based (`/tower`, `/battle`, `/all` in `app/src/App.svelte`) with no
   per-route HTML. `vite dev`/`preview` rewrite unknown paths to `index.html`; a naive
   static drop (`python -m http.server`, bare CDN) 404s on `/all`. "Stateless static"
   already means "served by something that does SPA fallback" — so the step to a tiny
   Node host that also answers a few endpoints is small, not an identity shift.
2. **The repo already ships and runs a small Node HTTP server** — the mock producer
   (`producers/mock/server.js`, raw `http`, Node ≥22). The stack and contributor
   muscle memory exist; a `battlecast serve` of similar size is low-risk.
3. **Images are the forcing function.** Config is a few KB of JSON (any approach
   handles it); binary logo assets are not. Only a server gives the drag-drop
   **upload** UX that the research (`docs/research/native-overlays.md`) identifies as
   the #1 differentiation lever over rF2/LMU.
4. **Matches the universal convergence** — transparent overlay page + separate control
   panel + local HTTP server (rF2 `:5397`, LMU `:6397`). Lowest-surprise architecture
   and the natural home for #34's control-panel/config UI.
5. **The spec contract is untouched.** Config/assets are a battlecast-app concern,
   orthogonal to spec v1 (producer→battlecast state feed). No `spec/v1` change → the
   compliance harness stays green, honoring "no contract change in 0.2.0."

## The four decision points

### 1. Where config lives
- **Profiles are JSON files**, one per named profile, under a server data dir
  (`data/profiles/<name>.json`). File-per-profile, **no database** — inspectable,
  diffable, git-committable for the static path; matches rF2's file-based `config.json`
  ethos.
- A documented **config contract** (pinned here so #16/#33/#34 don't diverge) —
  shape below — carrying its own `configVersion`, independent of the spec's
  `schemaVersion` and the app release version.
- A single **`loadConfig()`** loader (mirroring the existing `resolveSrc()` in
  `app/src/routes/tower/sseClient.js`) resolves with precedence:
  **explicit URL params → fetched profile JSON → built-in default** (today's
  side-by-side `/all`). Nothing provided ⇒ default layout, so existing `/all` users
  are unbroken.

### 2. How the OBS render page loads a profile
- `/all?profile=<name>&src=<producerUrl>` — the render page reads `profile` from
  `location.search` (the exact `?src=` pattern already in `resolveSrc`), then
  `fetch()`es `/api/profiles/<name>` (server mode) or `/config/<name>.json` (static
  mode). **Same-origin ⇒ no CORS.**
- `?src=` keeps selecting the producer SSE feed; `profile` selects geometry/visibility/
  rotation. Fine-grained `?x,y,w,h`-style overrides may still layer on top as the
  highest-precedence source (#16's shareable-URL option).
- The render page **never touches client storage**, so it is immune to the OBS
  separate-context problem — the profile travels by URL + server fetch.

### 3. Where images are stored/served
- Logo/sponsor images are **files in a server-served dir** (`data/logos/`), exposed at
  a stable prefix (`/logos/<file>`). The config UI uploads via `POST /api/logos`
  (multipart), lists via `GET /api/logos`; the render page just loads
  `<img src="/logos/...">`.
- **Static fallback:** drop PNGs into a served `logos/` folder and reference them in
  the committed profile JSON — no upload, identical render. Mirrors rF2's served
  `images/team`, `images/car` model.

### 4. Deploy / run story
- **Recommended (server mode):** `battlecast serve` — one small Node process (built-in
  `http`, same stack as the mock producer) that serves (a) the built app with SPA
  fallback, (b) `/logos/*`, (c) `/api/profiles/*`, (d) the config UI at `/config`.
  **Binds to `localhost` by default** (research flags public exposure as a security
  footgun); optional `--host` for rF2-style remote/multi-client control. OBS points a
  Browser Source at `http://localhost:<port>/all?profile=<name>&src=<producer>`.
- **Fallback (pure static):** `vite build` → drop `dist/` on any SPA-fallback static
  host alongside committed `config/` + `logos/`; author profiles with the client-only
  config UI and commit the exported JSON. Full render fidelity, no in-UI upload.
- The **producer stays a separate server** as today; the companion server only serves
  battlecast + its config/assets, never the state feed (still client-out SSE per spec).

## Config contract (v1, to be finalized in #16/#34)

```jsonc
{
  "configVersion": "1",
  "name": "my-broadcast",
  "producer": { "src": "http://localhost:8080/events" },  // optional; ?src= overrides
  "widgets": {
    "tower":  { "visible": true,  "x": 24,  "y": 24,  "w": 360, "h": 720 },
    "battle": { "visible": true,  "x": 24,  "y": 780, "w": 640, "h": 180 },
    "logos":  { "visible": false, "x": 1600,"y": 900, "w": 280, "h": 120 }
  },
  "logoRotation": {
    "images": ["/logos/sponsor-a.png", "/logos/sponsor-b.png"],
    "perSlotSeconds": 8,
    "order": "sequential"        // sequential | shuffle
  },
  "theme": { /* design-token overrides, TBD with #34 */ }
}
```

Geometry is shown as absolute px against a 1920×1080 canvas (LMU's supported
resolution); the grid-vs-absolute-vs-%/safe-region choice is an **open item for #16**.

## Handoff to the gated issues
- **#16** (render side) — implement `loadConfig()` + apply geometry/visibility to
  `/all`; decide the final geometry model.
- **#33** (logo rotation) — consume `logoRotation` (image URLs + `perSlotSeconds`).
- **#34** (config UI + control panel) — the write side: upload/list/delete/reorder
  logos, save/load profiles; client-only export as the static fallback.

## Open items intentionally deferred (not blocking the gate)
- Final geometry model (absolute px vs grid vs %/safe-region).
- Upload validation (mime/size caps, filename sanitization) and profile-name rules.
- Whether the server is its own package (`server/`) or folded into `app/`.
