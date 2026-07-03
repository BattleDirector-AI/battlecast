# Changelog

All notable changes to battlecast will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **One-command dev stack** — `make dev` runs the app, the reference mock producer,
  and the companion server together under one prefixed log (Ctrl+C stops all of
  them); `make help` lists every target, with `dev-app` / `dev-mock` / `dev-server`
  to run a piece on its own. Backed by a zero-dependency launcher
  (`scripts/dev.mjs`).
- **Config UI — the overlay editor at `/config` (#34, part 2 of 2)** — a WYSIWYG
  editor to arrange the overlay without touching code or CSS, completing epic #19.
  A live 1920×1080 preview (the real `/all` render) with **drag-to-move and
  resize handles** per widget; a panel to toggle visibility and set exact
  geometry/z-order; **logo management** (upload via the companion server, add/
  reorder/remove rotation images, set per-slot duration + order); a producer-URL
  field; and **named profiles** — save/load through the server, with a generated
  OBS Browser Source URL to copy. Degrades to client-only authoring (**export
  `config.json`**) when no server is running. Config **round-trips**: save a
  profile → reload it → an identical `/all` render (covered by a behavioral test).
- **Companion server — `battlecast serve` (#34, part 1 of 2)** — an optional,
  zero-dependency Node server (built-in `http`, Node ≥ 22, same stack as
  `producers/mock`) that serves the built overlay app with **SPA fallback** (so
  `/tower`, `/battle`, `/all`, `/logos`, `/config` all resolve) plus a small
  **config + asset API**: `GET/PUT/POST /api/profiles[/<name>]` persists layout
  profiles as `data/profiles/<name>.json`, and `GET/POST/DELETE /api/logos[/<file>]`
  + `GET /logos/<file>` store and serve uploaded logo images under `data/logos/`.
  This is the write/serve side of the overlay-config contract (counterpart to the
  #16 read side). Binds to `localhost` by default; uploads are validated (allowed
  image types only, ≤ 5 MiB, sanitized filenames) and profile names are restricted
  to prevent path traversal. Served logo assets carry `nosniff` + a locked-down CSP,
  so an uploaded SVG can't execute as active content (it still renders via `<img>`).
  The render path still works as a pure static deploy —
  the server is optional. The config-UI editor (`/config`) lands in the next part.
- **Logo / sponsor rotation widget (#33)** — a new widget that cycles a set of
  branding images on a per-slot timer with a fade, driven entirely by the overlay
  config's `logoRotation` block (`{ images, perSlotSeconds, order }`, where `order`
  is `sequential` or `shuffle`) — nothing is hardcoded. Matches rF2's native timed
  sponsor carousel (a gap in LMU). It has its own `/logos` Browser Source route and
  composes into `/all` as the `logos` widget. Renders an explicit idle state when no
  images are configured. Images load by URL (`/logos/<file>`), backed by the
  companion server or a static folder (#34).
- **Configurable `/all` layout (#16)** — the `/all` overlay now honors a per-profile
  layout config instead of a hardcoded side-by-side arrangement. A new
  `loadConfig()` loader (`app/src/lib/overlayConfig.js`) resolves the layout with
  precedence **explicit URL params → fetched profile JSON (`?profile=<name>` →
  `/api/profiles/<name>`, falling back to `/config/<name>.json`) → built-in
  default**, so existing `/all` users are unbroken. This is the read side of the
  overlay-config contract pinned by the #32 decision — the source of truth for the
  `configVersion: "1"` shape (per-widget `{visible, x, y, w, h, z}` geometry on a
  fixed 1920×1080 canvas, `logoRotation`, `producer`, `theme`) that #33 and #34
  build against. Widgets can be positioned, sized, hidden, and z-ordered; `?show=`/
  `?hide=` URL params toggle a widget without editing the profile.

### Fixed

- **Companion server no longer collides with rF2.** The default port moved from
  `5397` to **`7397`**. rFactor 2 runs its own control panel on `5397`, so on a real
  broadcast machine `battlecast serve` failed to bind it (`EACCES`) — the very
  reason the config UI often had no server to talk to. `7397` keeps the sim `_397`
  mnemonic (rF2 `5397`, LMU `6397`) but sits above both. Override with `--port` /
  `PORT` as before. (If you saved an OBS Browser Source URL with `:5397`, update the
  port.)
- **`/config` Save and logo upload now work in dev.** Vite dev now proxies `/api`
  and `/logos/` to the companion server, so the editor reaches the config/asset API
  on `localhost:5173` instead of leaving **Save** and **Upload** permanently
  disabled. Both controls now also carry a tooltip explaining they need the
  companion server (run `make dev`) when it isn't reachable. The bare `/logos`
  overlay route is unaffected — only `/logos/<file>` asset requests are proxied.
