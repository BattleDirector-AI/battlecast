# Companion Server

The optional **`battlecast serve`** process — the recommended run mode. It serves the built overlay
app (with SPA fallback) and provides a small config + asset API so the `/config` UI can save layout
profiles and upload logo images. Implementation: `server/`; see `how/server.md`. Decision record:
`docs/decisions/0001-overlay-config-and-asset-persistence.md`.

## Behavioral Rules

### Role

1. The companion server is the **write/serve side** of the overlay-config contract; render pages
   only ever *read* config over HTTP. It is a separate concern from the state feed — it serves
   battlecast and its config/assets, and **never** carries the producer SSE feed (that stays a
   client-out connection to the producer per `spec/v1`).
2. It has **zero dependencies** (Node built-ins only, Node ≥ 22 — same stack as the mock producer).
3. It serves the built app with **SPA fallback**, so `/tower`, `/battle`, `/all`, `/onboard`,
   `/config`, etc. all resolve to the app rather than 404.

### API

4. Profiles: `GET /api/profiles` (list names), `GET /api/profiles/<name>` (fetch, 404 if absent),
   `PUT/POST /api/profiles/<name>` (save; 201 new / 200 update), `DELETE /api/profiles/<name>` (200
   on delete, 404 if absent). Persisted as `data/profiles/<name>.json` — file-per-profile, no
   database (inspectable, diffable, git-committable).
5. Logos: `GET /api/logos` (list `{name,url,size}`), `POST /api/logos` (upload, multipart or raw body
   + `?name=`), `DELETE /api/logos/<file>`, `GET /logos/<file>` (serve). Persisted as
   `data/logos/<file>`.

### Validation & safety

6. Uploads are validated: **allowed image types only, ≤ 5 MiB**, filenames sanitized to
   `[a-z0-9._-]` with any path components stripped. Profile names restricted to `[A-Za-z0-9_-]{1,64}`.
7. **Binds to `127.0.0.1` by default.** Exposing on `0.0.0.0` makes the config API (including logo
   upload/delete) network-reachable — only on a trusted LAN. Default port `7397` (chosen above the
   sim `_397` family — rF2 :5397, LMU :6397 — to avoid collision).

### Static fallback

8. The render path MUST also work with **no server**: build `app/dist` and serve it from any
   SPA-fallback static host alongside committed `config/` + `logos/` folders. Only in-UI upload is
   lost; the render path is identical. This is a design property, not a second code path.

### Embedded assets & the packaged binary

9. The static handler MAY be given an **embedded asset map** (URL path → bytes) in addition to a
   `distDir`. Resolution order is **disk first, then embedded**, for both the exact-file lookup and
   the SPA `index.html` fallback. A checkout with a real `app/dist` therefore behaves exactly as
   before; the map only fills in what disk cannot serve.
10. Embedded assets are subject to the same rules as disk assets: correct `Content-Type` by
    extension, `X-Content-Type-Options: nosniff`, extensionless paths falling back to `index.html`,
    and a real `404` for a missing path that has an extension. Path traversal cannot apply — lookups
    are exact keys in the map, never filesystem paths.
11. A **packaged single-file build** (`battlecast.exe`) exists so a broadcaster can run battlecast
    without installing Node or building the app. It bundles the server, the built overlay app as an
    embedded asset map, and the reference mock producer. It is a *packaging* of the same server —
    it MUST NOT introduce behavior the `node server/serve.js` path does not have.
12. The packaged build stores its data **next to the executable** (`<exe dir>/data`), not in the
    process working directory — a double-clicked binary must not scatter `profiles/` and `logos/`
    into whatever folder Explorer happened to launch it from. `--data-dir` still overrides.

### Demo mode

13. `--demo` starts the bundled reference mock producer on `127.0.0.1:8080` alongside the server, so
    a fresh install renders a live simulated race with no producer configured. `8080` is not
    incidental: it is the app's built-in `DEFAULT_SRC`, so `/all` resolves to the demo feed with no
    `?src=` parameter.
14. Demo mode is **additive and non-default**. Without `--demo` the binary serves only the overlay
    app and config API, and the overlay connects out to whatever producer `?src=` or the active
    profile names. The mock is never started implicitly.

## Configuration Surface

| Flag / env | Default | Purpose |
|---|---|---|
| `--host` / `HOST` | `127.0.0.1` | Interface to bind (`0.0.0.0` for remote access). |
| `--port` / `PORT` | `7397` | Listen port. |
| `--data-dir` / `DATA_DIR` | `./data` | Where `profiles/` and `logos/` live. |
| `--dist-dir` / `DIST_DIR` | `../app/dist` | Built app to serve. |
| `--demo` | off | Also start the bundled mock producer on `127.0.0.1:8080`. |

## Constraints

- Never route the producer state feed through this server; battlecast stays a client of the producer.
- Keep it zero-dependency (Node built-ins). Uphold the upload validation and default-localhost bind
  — they are the server's security surface.
- Config persistence is orthogonal to `spec/v1`; server changes must not touch the compliance harness.
- The packaged binary is a distribution concern only. Keep `server/` runnable under plain Node with
  no generated files present — the embedded asset map is an optional argument, never an import.
- Demo mode must not become the default, and the bundled mock must stay the unmodified reference
  producer from `producers/mock/` — not a packaging-specific fork.
