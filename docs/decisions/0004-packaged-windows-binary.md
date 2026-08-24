# 0004 — Packaged Windows binary

**Status:** Accepted
**Date:** 2026-08-24

## Context

Through v0.8.0 the only way to run battlecast was to clone the repo, install Node 22,
`make install`, `make build`, and start `server/serve.js`. Every GitHub release
shipped source only — zero attached assets.

The audience is OBS broadcasters running rF2 / Le Mans Ultimate on Windows. For that
user a git clone and a toolchain install is not a setup step, it is the reason they
never try the tool. The native rF2/LMU overlay systems they are being asked to switch
from are already running inside a game they double-clicked.

A second, quieter barrier: even a correctly installed battlecast renders *nothing*
without a producer. A first-run experience of a blank browser source is
indistinguishable from a broken install.

## Decision

Ship a self-contained `battlecast.exe` as a release asset, built by
`bun build --compile --target=bun-windows-x64`.

1. **Bun is build-time only.** `server/` and `producers/mock/` stay zero-dependency
   Node. Nothing shipped imports Bun APIs. If the packager is ever replaced, the
   server does not change.
2. **The overlay app travels as an embedded asset map.** `packaging/embed-dist.mjs`
   turns `app/dist` into a generated module of URL path → base64;
   `lib/static.js` takes it as an optional second source, resolved *after* disk.
   `server/` therefore stays runnable under plain Node with no generated file
   present — the map is an argument, never an import.
3. **Data lives next to the executable.** A double-clicked binary must not scatter
   `profiles/` and `logos/` into whatever folder Explorer launched it from.
4. **`--demo` bundles the reference mock producer.** The app's built-in
   `DEFAULT_SRC` is already `http://localhost:8080/events`, so binding the mock
   there makes `/all` render a live race with no configuration at all. Demo mode is
   opt-in and never starts implicitly.
5. **The release workflow triggers on `release: published`, not on the tag push.**
   `RELEASING.md` pushes the tag *before* `gh release create`; a tag trigger would
   race ahead of the release it needs to upload to.

## Alternatives considered

- **Node SEA (`--experimental-sea-config` + postject).** No new toolchain, but it
  wants a single CJS script, needs a Windows runner or careful cross-work, and the
  asset story is `sea.getAsset` — which means rewriting the static handler around a
  packaging API. Comparable output size (~110 MB either way; that is the runtime).
- **`@yao-pkg/pkg`.** A maintained fork of an archived project. Rejected as a
  long-term dependency for a distribution path we want to still work in two years.
- **Portable zip + "install Node 22 first".** Ships sooner, but does not solve the
  problem — the toolchain install *is* the barrier.
- **Electron / Tauri wrapper.** A GUI shell around a server whose entire interface is
  already a browser page OBS renders. Cost without benefit.

## Consequences

- The binary is ~110 MB (Bun runtime baseline) and **unsigned** — SmartScreen warns
  on first run. Each release publishes `SHA256SUMS.txt` as the integrity signal. Code
  signing is a future purchase, not a code change.
- `producers/mock/server.js` now exports `runSimulateMode` / `runFixturesMode` and
  self-starts only under `require.main === module`. It also no longer reads
  `process.argv` at import time — argv belongs to whoever owns the process.
- Windows x64 only for now. `bun build --compile` cross-targets macOS and Linux from
  the same runner, so adding them is a matrix entry, not a redesign.
