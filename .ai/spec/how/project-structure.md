# Project Structure

## Module Map

| File/Directory | Key Symbols | Responsibility |
|---|---|---|
| `app/` | Vite + Svelte 5 | The renderer. Overlay pages, `/config` editor, design system, tests. |
| `spec/v1/` | `SPEC.md`, `schema.json`, `fixtures/` | The producer↔battlecast protocol contract (shipped deliverable). |
| `spec/v1/compliance/` | `check.js` | Harness letting third-party producer authors self-check their SSE endpoint. |
| `producers/mock/` | `server.js`, `simulate.js` | Reference SSE producer that replays/simulates fixtures — the dev feed. |
| `server/` | `serve.js`, `lib/` | Companion config/asset server (`battlecast serve`). Zero-dependency Node. |
| `packaging/` | `build-exe.mjs`, `embed-dist.mjs`, `entry.js` | Single-file Windows binary (`battlecast.exe`): embed `app/dist` as an asset map, compile server + mock. Distribution only — kept outside `server/` so the server stays plain-Node runnable. See `how/server.md`. |
| `scripts/dev.mjs` | — | Dev-stack launcher used by `make dev` (app + mock + server under one log). |
| `.github/workflows/release.yml` | — | On a `v*` tag: build the app, compile the exe, attach it + `SHA256SUMS.txt` to the release. |
| `docs/decisions/` | `0001`–`0004` | Accepted ADRs: config/asset persistence, lower-third widgets, tower overflow pinning/cycling, packaged Windows binary. |
| `docs/plans/`, `docs/research/` | — | Per-version plans and background research (e.g. native-overlays study). |
| `Makefile` | `dev`, `build`, `test`, `lint` | Task entrypoints; recipes only shell out to `node`/`npm` (cross-platform). |

## Key Entry Points

- **Renderer route dispatch:** `app/src/App.svelte` — selects a page component by
  `window.location.pathname` (OBS launches Browser Sources by URL; no in-app navigation). Also
  applies full-bleed / transparent-background / motion setup on mount.
- **App bootstrap:** `app/src/main.js` mounts `App.svelte`.
- **SSE ingest:** `app/src/lib/sseClient.js` — the one SSE client: `connect()` opens the
  `EventSource` and delivers parsed snapshots. It is shared, not per route (`how/renderer.md`).
- **Config resolution:** `app/src/lib/overlayConfig.js` — `loadConfig()` / `normalizeConfig()`.
- **Config editor:** `app/src/routes/config/ConfigPage.svelte` — the only writer of the config
  contract (see `how/config-editor.md`).
- **Server:** `server/serve.js` → `server/lib/createApp.js` (request router).
- **Packaged binary:** `packaging/entry.js` — same server, data dir next to the exe, embedded
  assets, optional `--demo` mock producer.
- **Mock producer:** `producers/mock/server.js` (`simulate` subcommand) — the default dev feed on
  `:8080/events`.

## Naming Conventions

- **Routes** live under `app/src/routes/<name>/`, one directory per URL path. A directory holds
  `<Name>Page.svelte` (route shell — wiring, config, SSE) and the presentational widget
  component(s). A route never carries its own SSE client: the feed comes from the shared
  `app/src/lib/sseClient.js` (`how/renderer.md`, "One SSE client, in `lib/`, not per route").
- **Shared logic** is in `app/src/lib/` (config, motion, idle predicates, lower-third trigger,
  shells). Cross-widget **design** primitives and tokens are in `app/src/design/`.
- **Tests** are co-located as `*.test.js` next to the unit they cover. Behavioral tests are driven
  by fixtures (see `how/protocol-and-testing.md`); some carry a descriptive middle segment
  (`*.motion.test.js`, `*.shine.test.js`, `*.upload.test.js`).
- **Fixtures** are complete `spec/v1` `state` payloads: shared ones in `spec/v1/fixtures/`,
  route-local layout profiles in `app/src/routes/<name>/fixtures/`.
- **Widget keys** (`tower`, `battle`, `logos`, `driver`, `qualifying`, `racecontrol`, `onboard`)
  are the shared vocabulary across routes, config, and idle predicates — derived from
  `DEFAULT_CONFIG.widgets`, never hardcoded as a parallel list.
