# battlecast

**Protocol-first broadcast overlay renderer for sim racing.**

battlecast renders broadcast graphics — a **standings tower** and a **battle box** —
as [OBS](https://obsproject.com/) Browser Sources, driven by a live race-state feed.

## Producer-agnostic by design

battlecast does not talk to any one sim or tool directly. Instead, a **producer**
application runs an HTTP + [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
server that exposes race state, and battlecast connects out to that producer as a
**client** and renders the graphics.

```
  ┌────────────┐   HTTP + SSE    ┌──────────────┐   Browser Source   ┌─────┐
  │  Producer  │ ──────────────▶ │  battlecast  │ ─────────────────▶ │ OBS │
  │  (server)  │   state events  │   (client)   │   /tower /battle   │     │
  └────────────┘                 └──────────────┘                    └─────┘
```

[BattleDirector](https://github.com/BattleDirector-AI/battledirector) is the
**reference producer**, but it is not a requirement. Any tool — for any sim — that
implements the [spec v1 contract](spec/v1/SPEC.md) can drive battlecast. A
[compliance harness](spec/v1/compliance/) lets third-party producer authors
self-check their SSE endpoint against the spec.

## The contract

The producer ↔ battlecast contract is defined in [`spec/v1/SPEC.md`](spec/v1/SPEC.md),
with the state payload schema in [`spec/v1/schema.json`](spec/v1/schema.json). The
`schemaVersion` is versioned independently of the battlecast app release version.

## v1 scope

v1 deliberately ships exactly **two widgets**:

- **Standings tower** (`/tower`) — driver standings, on-camera driver highlighted.
- **Battle box** (`/battle`) — the on-camera driver's battle context (gaps ahead/behind, intensity).

v1 is **not** a general-purpose overlay platform — just these two widgets, fed by a
contract any producer can implement.

## Development

```sh
make install   # install app dependencies (server + mock are zero-dependency)
make dev       # run the whole stack under one prefixed log
```

`make dev` starts three processes and streams their output together:

| Process  | URL                             | What it is                              |
| -------- | ------------------------------- | --------------------------------------- |
| `app`    | http://localhost:5173           | Vite dev server — overlays and `/config`|
| `mock`   | http://localhost:8080/events    | Reference SSE producer (simulated race) |
| `server` | http://127.0.0.1:7397           | Companion config/asset API              |

Vite proxies `/api` and `/logos/` to the companion server, so the `/config`
editor's **Save** and logo **upload** work in dev (they need the server; without
it they stay disabled and you can still **Export JSON**). `make help` lists all
targets, including `dev-app` / `dev-mock` / `dev-server` to run a piece on its own.

## Layout

| Path                 | Purpose                                                        |
| -------------------- | ------------------------------------------------------------- |
| `app/`               | Vite + Svelte frontend (the renderer).                        |
| `spec/v1/`           | The v1 protocol: `SPEC.md`, `schema.json`, fixtures.          |
| `spec/v1/compliance/`| Compliance harness for third-party producers.                 |
| `producers/mock/`    | Reference mock producer that replays fixtures over SSE.       |
| `server/`            | Companion server (`battlecast serve`) — static app + config API. |
| `scripts/dev.mjs`    | Dev-stack launcher used by `make dev`.                        |

## License

[MIT](LICENSE).
