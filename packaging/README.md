# packaging/

Builds `battlecast.exe` — a self-contained Windows binary so a broadcaster can run
battlecast without installing Node or building the app.

```sh
make exe          # from the repo root
```

| File | Purpose |
|---|---|
| `embed-dist.mjs` | `app/dist` → `build/embedded-dist.generated.js` (URL path → base64). |
| `entry.js` | The binary's entry point: exe-relative data dir, embedded assets, `--demo`. |
| `build-exe.mjs` | Orchestrates app build → embed → `bun build --compile`. |
| `build/` | Generated output. Gitignored. |

## What ships inside

The compiled server, the built overlay app as an embedded asset map, and the
reference mock producer (`producers/mock/`) for `--demo`.

## Why Bun

Build-time only. Nothing shipped depends on it — `server/` and `producers/mock/`
remain zero-dependency Node. `bun build --compile --target=bun-windows-x64`
cross-compiles from Linux, so CI needs one Ubuntu runner instead of a Windows one.

## Running it

```
battlecast.exe                 serve on http://localhost:7397, no producer
battlecast.exe --demo          also run the simulated race producer on :8080
battlecast.exe --help          all options
```

Profiles and uploaded logos land in `data/` **next to the .exe**, so the binary and
its configuration move together.

## Releasing

`.github/workflows/release.yml` runs this on a `v*` tag and attaches
`battlecast-<version>-windows-x64.exe` plus `SHA256SUMS.txt` to the GitHub release.
The binary is unsigned — SmartScreen will warn on first run; the published checksum
is how a user verifies the download.
