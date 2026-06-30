# battlecast mock producer

A reference HTTP + SSE **producer** for battlecast frontend development. It lets the
standings-tower and battle-box widgets be built and tested without a real
BattleDirector instance running.

It implements the producer side of [spec v1](../../spec/v1/SPEC.md): the producer is
the **server**; battlecast connects out to it as a **client** and listens for `state`
events.

## Run

```sh
cd producers/mock
npm start              # → node server.js
```

Then connect any SSE client to:

```
http://localhost:8080/events
```

Quick check with curl:

```sh
curl -N http://localhost:8080/events
```

You should see a stream of `event: state` frames, each with a complete spec-v1 JSON
snapshot in its `data:` field.

### Configuration

| Env var       | Default | Meaning                                  |
| ------------- | ------- | ---------------------------------------- |
| `PORT`        | `8080`  | TCP port to listen on                    |
| `INTERVAL_MS` | `750`   | Interval between `state` events (≈1.3 Hz) |

## What it emits

On each connection the server emits a `state` event immediately, then every
`INTERVAL_MS`, cycling through the fixtures in
[`spec/v1/fixtures/`](../../spec/v1/fixtures/):

- `race-close-battle.json` — Verstappen on camera, tight gap ahead, high battle intensity.
- `race-no-battle.json` — leader on camera in clear air, low battle intensity.

Fixtures are the **source of truth** for test data; the server only replays them.

## Validate fixtures

```sh
npm run validate-fixtures
```

Structurally checks each replayed fixture against the required-field contract in
[`spec/v1/schema.json`](../../spec/v1/schema.json).

## Requirements

Node.js >= 22. No runtime dependencies (uses Node's built-in `http` module).
