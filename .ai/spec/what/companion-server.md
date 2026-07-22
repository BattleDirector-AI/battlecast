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

## Configuration Surface

| Flag / env | Default | Purpose |
|---|---|---|
| `--host` / `HOST` | `127.0.0.1` | Interface to bind (`0.0.0.0` for remote access). |
| `--port` / `PORT` | `7397` | Listen port. |
| `--data-dir` / `DATA_DIR` | `./data` | Where `profiles/` and `logos/` live. |
| `--dist-dir` / `DIST_DIR` | `../app/dist` | Built app to serve. |

## Constraints

- Never route the producer state feed through this server; battlecast stays a client of the producer.
- Keep it zero-dependency (Node built-ins). Uphold the upload validation and default-localhost bind
  — they are the server's security surface.
- Config persistence is orthogonal to `spec/v1`; server changes must not touch the compliance harness.
