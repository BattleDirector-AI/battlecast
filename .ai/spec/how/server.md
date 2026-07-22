# Companion Server (server/)

Zero-dependency Node HTTP server (`battlecast serve`) — the write/serve side of overlay config.
Behavioral rules: `what/companion-server.md`.

## Module Map

| File | Key Symbols | Responsibility |
|---|---|---|
| `serve.js` | CLI entry | Parse `--host/--port/--data-dir/--dist-dir` (+ env), start the server. |
| `lib/createApp.js` | request router | Dispatch requests to profiles/logos/static handlers. |
| `lib/profiles.js` | — | List/read/write profile JSON under `data/profiles/`. |
| `lib/logos.js` | — | List/store/delete/serve logo images under `data/logos/`. |
| `lib/multipart.js` | — | Minimal multipart/form-data parser for uploads (no deps). |
| `lib/validation.js` | — | Filename/profile-name sanitization, image-type + size caps. |
| `lib/static.js` | — | Serve `app/dist` with SPA fallback. |
| `lib/respond.js` | — | Shared HTTP response helpers. |
| `data/profiles/`, `data/logos/` | — | On-disk persistence (file-per-profile; committed for static mode). |
| `test/*.test.js` | — | Node test-runner suites incl. `security.test.js` (traversal/upload abuse). |

## Data Flow

1. `serve.js` resolves options → `createApp.js` builds the router → listens (default
   `127.0.0.1:7397`).
2. `GET /api/profiles*` and `GET /api/logos` read from `data/`; `PUT/POST /api/profiles/<name>` and
   `POST /api/logos` write after `validation.js` checks; `DELETE /api/logos/<file>` removes.
3. `GET /logos/<file>` serves stored images; any unmatched path falls through `static.js` to the
   built app with SPA fallback.

## Key Abstractions

- **Split read from write.** Render pages only read; this server is the only writer. Because the
  render path is pure HTTP GET, the exact same pages work against a plain static host with committed
  `config/` + `logos/` — static degradation is designed in, not a fork.
- **Zero dependencies on purpose.** Pure Node built-ins (same stack as the mock producer) — hence
  the hand-rolled `multipart.js`. Keep new code dependency-free.
- **Security surface is explicit.** `validation.js` centralizes filename sanitization
  (`[a-z0-9._-]`, strip path components), the 5 MiB / image-type upload caps, and the
  `[A-Za-z0-9_-]{1,64}` profile-name rule. `security.test.js` guards it. Default localhost bind is
  the other half of the surface.

## Integration Points

| Consumer | Provider | Mechanism |
|---|---|---|
| `/config` UI | this server | write API (`PUT/POST/DELETE`). |
| Render pages | this server *or* static host | read API (`GET /api/…`, `GET /logos/…`) + SPA-served app. |
| OBS Browser Source | this server | `GET /all?profile=<name>&src=<producer>`. |

## Implementation Notes

- The server never touches the producer state feed — that stays a client-out SSE connection from the
  browser (`app/src/routes/*/sseClient.js`). Do not add a state-feed proxy here.
- Port `7397` deliberately sits above the sim `_397` family (rF2 :5397, LMU :6397) so it never
  collides with a sim on the same machine.
