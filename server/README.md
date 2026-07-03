# battlecast companion server

The optional **`battlecast serve`** process — the recommended way to run battlecast.
It serves the built overlay app (with SPA fallback so `/tower`, `/battle`, `/all`,
`/logos`, `/config` all resolve) and provides a tiny **config + asset API** so the
config UI can save layout profiles and upload logo images.

This is the **write/serve side** of the overlay-config contract; the render pages
only ever *read* config over HTTP (see [`docs/decisions/0001-…`](../docs/decisions/0001-overlay-config-and-asset-persistence.md)).
It has **zero dependencies** — pure Node built-ins, Node ≥ 22 (same stack as
`producers/mock`).

## Run

```sh
# from the repo root, after building the app (cd app && npm run build):
node server/serve.js
# → http://127.0.0.1:7397
```

Then point an OBS Browser Source at:

```
http://localhost:7397/all?profile=<name>&src=<producerUrl>
```

and open the config UI at `http://localhost:7397/config`.

### Options

| Flag / env         | Default          | Purpose                                            |
| ------------------ | ---------------- | -------------------------------------------------- |
| `--host` / `HOST`  | `127.0.0.1`      | Interface to bind. Use `0.0.0.0` for remote access. |
| `--port` / `PORT`  | `7397`           | Listen port. In the sim `_397` family (rF2 :5397, LMU :6397) but above both, so it doesn't collide with rF2 — which occupies :5397 on the same machine. |
| `--data-dir` / `DATA_DIR` | `./data`  | Where `profiles/` and `logos/` are stored.         |
| `--dist-dir` / `DIST_DIR` | `../app/dist` | Built app to serve.                           |

> Binds to `localhost` by default. Exposing it on `0.0.0.0` makes the config API
> (including logo upload/delete) reachable from the network — only do that on a
> trusted LAN.

## API

| Method + path              | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `GET /api/profiles`        | List saved profile names.                           |
| `GET /api/profiles/<name>` | Fetch a profile's JSON (404 if absent).             |
| `PUT/POST /api/profiles/<name>` | Save a profile (JSON body). 201 new, 200 update. |
| `GET /api/logos`           | List stored logos (`{ name, url, size }`).          |
| `POST /api/logos`          | Upload an image (`multipart/form-data`, or raw body + `?name=`). |
| `DELETE /api/logos/<file>` | Delete a stored logo.                               |
| `GET /logos/<file>`        | Serve a stored logo image.                          |

Profiles persist as `data/profiles/<name>.json`; images as `data/logos/<file>`.
Uploads are validated (allowed image types only, ≤ 5 MiB, filenames sanitized to
`[a-z0-9._-]` with any path components stripped). Profile names are restricted to
`[A-Za-z0-9_-]{1,64}`.

## Static fallback (no server)

The render pages also work from a plain static host: `cd app && npm run build`, then
serve `app/dist` with SPA fallback alongside committed `config/` + `logos/` folders.
You lose only in-UI upload — the render path is identical.
