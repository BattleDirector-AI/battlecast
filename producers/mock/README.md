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
npm start              # → node server.js simulate — a live, continuously evolving race
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

| Env var          | Default | Meaning                                            |
| ---------------- | ------- | --------------------------------------------------- |
| `PORT`           | `8080`  | TCP port to listen on                                |
| `INTERVAL_MS`    | `750`   | Interval between `state` events (≈1.3 Hz)            |
| `SIM_DT_SECONDS` | `2`     | Sim-seconds of race time advanced per tick (`simulate` mode only) |

## Modes

### `simulate` (default) — a live, continuously evolving race

```sh
npm start
```

One shared 14-car, 3-class (GTP/LMP2/GT3) race, broadcast identically to every
connected client — open `/tower`, `/battle`, and `/all` at once and they all reflect
the same live race, the way separate OBS Browser Sources pointed at one real producer
would. Each car runs at a per-class base pace plus a per-car skill offset and a slow
random-walk pace fluctuation, so running order, gaps, and on-track battles emerge and
change continuously instead of replaying a handful of fixed scenarios. The on-camera
`subject` is chosen like a broadcast director would — whichever battle is currently
tightest — with hysteresis so the cut doesn't change every tick.

**Prompt emit on camera cuts.** Per the spec's non-normative latency SHOULD
([`spec/v1/SPEC.md`](../../spec/v1/SPEC.md)), when the director cuts to a new
on-camera `subject` the server emits a `state` snapshot **promptly** (within one
sub-step, ≤ ~150 ms) instead of waiting for the next cadence tick, so battlecast's
subject-driven lower-thirds (#21/#22) fire crisply. It does this by sub-stepping the
simulator several times per `INTERVAL_MS` and broadcasting immediately on a subject
change; steady state still emits at ~`INTERVAL_MS`. The total sim-time advanced per
real second is unchanged, and the director's on-camera dwell is time-based, so the
cut frequency is unchanged — only the emit latency of a cut improves.

As the "smart" side of the dumb-overlay contract, the simulator also computes the
optional v1.x per-vehicle notability fields the overlay renders (it never derives them
itself): `notable.class_best_lap` / `session_best_lap` (the car holding the fastest
`best_lap` in its class / overall), `notable.personal_best_lap` (the car that just
improved its own best on this tick), plus `target_lap` (the class-best time to beat)
and `delta_to_target` (`best_lap` minus that target). All are optional and additive —
`schemaVersion` stays `"1"`. See `docs/decisions/0002-lower-third-widgets.md`.

Implementation: [`simulate.js`](simulate.js).

### `fixtures` — deterministic scenario replay

```sh
npm run start:fixtures    # → node server.js fixtures
```

The original behavior: each connection independently cycles through the fixtures in
[`spec/v1/fixtures/`](../../spec/v1/fixtures/) on a fixed interval:

- `race-close-battle.json` — Verstappen on camera, tight gap ahead, high battle intensity.
- `race-no-battle.json` — leader on camera in clear air, low battle intensity.
- `race-idle-battle.json` — a lone car with no adjacent traffic; the genuine idle case.
- `race-pre-class-best.json` — same race as below but BEFORE the on-camera subject
  (Alonso) sets a class best (`notable.class_best_lap: false`); paired with the next
  fixture to exercise #22's false→true class-best edge.
- `race-class-best.json` — multi-class race; the on-camera subject holds a class-best lap
  (`notable.class_best_lap: true`) with `target_lap` set — the v1.x notability fields.
- `qualifying-target.json` — a qualifying snapshot with `target_lap` / `delta_to_target`
  populated on every car and the class/session best flagged on the pole car.
- `qualifying-sector-a.json` — a qualifying subject with best/last/sector times but no
  `target_lap` (the target/delta-absent render case for #22).
- `qualifying-no-timing.json` — a qualifying subject whose vehicle carries no lap
  timing at all (#22's no-timing idle case).

Fixtures are the **source of truth** for the app's fixture-based behavioral tests (see
`CONTRIBUTING.md`) — use this mode when you want a known, reproducible scenario rather
than a live race.

## Validate

```sh
npm run validate-fixtures    # structurally checks the static fixtures
npm run validate-simulator   # steps the simulator for thousands of ticks and checks each snapshot
```

Both check against the same required-field contract in
[`spec/v1/schema.json`](../../spec/v1/schema.json) ([`validate.js`](validate.js)).

## Requirements

Node.js >= 22. No runtime dependencies (uses Node's built-in `http` module).
