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

| Env var           | Default | Meaning                                                             |
| ----------------- | ------- | ------------------------------------------------------------------- |
| `PORT`            | `8080`  | TCP port to listen on                                                |
| `INTERVAL_MS`     | `750`   | Interval between `state` events (≈1.3 Hz)                            |
| `SIM_DT_SECONDS`  | `2`     | Sim-seconds of race time advanced per tick (`simulate` mode only)   |
| `QUALI_SECONDS`   | `300`   | Duration of the **qualifying** phase, in sim-seconds (`simulate`)   |
| `GRID_SECONDS`    | `30`    | Duration of the **grid / pre-race** phase, in sim-seconds           |
| `RACE_SECONDS`    | `300`   | Duration of the **race** phase, in sim-seconds                      |
| `RESULTS_SECONDS` | `30`    | Duration of the **results** phase, in sim-seconds                   |

Phase durations are in **sim-seconds** (race time), not wall-clock. At the default
cadence (`SIM_DT_SECONDS=2` every `INTERVAL_MS=750`, ≈2.7 sim-s per real second) the
default session cycles in ~4 real minutes. A lap is ~92–107 sim-seconds at these
paces, so the ~300 s qualifying/race defaults give each car several flying/racing
laps; shorten them (e.g. `QUALI_SECONDS=60`) to cycle the phases faster during a
quick overlay test, at the cost of fewer completed laps per phase.

## Modes

### `simulate` (default) — a live session cycling through the broadcast phases

```sh
npm start
```

One shared 14-car, 3-class (GTP/LMP2/GT3) session, broadcast identically to every
connected client — open `/tower`, `/battle`, and `/all` at once and they all reflect
the same live session, the way separate OBS Browser Sources pointed at one real
producer would. Each car runs at a per-class base pace plus a per-car skill offset and
a slow random-walk pace fluctuation, so lap times, running order, gaps, and on-track
battles emerge and change continuously instead of replaying a handful of fixed
scenarios.

Rather than an endless green flag, the simulator **auto-cycles through a full session**
so a single live mock exercises the whole overlay set. It loops forever:

| Phase | `mode` | Classification (`position`) | Exercises |
| ----- | ------ | --------------------------- | --------- |
| **Qualifying** | `"qualifying"` | by **best lap** (cars without a lap yet sort last) | qualifying lower-third (#22) + driver lower-third (#21) + tower; `best_lap`/`last_lap`/`sector_times` populate and improve, and the class-best holder changes hands (a `notable.class_best_lap` false→true edge → the CLASS BEST flash / re-cut reveal) |
| **Grid / pre-race** | `"grid"` | **frozen to the qualifying result** (the starting grid) | the `/grid` starting-order slide (#24) — a real grid, not mid-race order |
| **Race** | `"race"` | by **distance** covered (the original rolling-race logic) | tower + battle box; emergent battles, class-best edges, the tightest-battle director |
| **Results** | `"results"` | **frozen to the final race order** | the `/results` end-of-session board (#23) |

Positions are always the **overall** running order (multi-class independent), as in a
real multi-class session. Each transition is logged to stdout, e.g.
`[mock] phase → grid (sim-clock 312s)`. Phase durations are configurable — see
[Configuration](#configuration).

The on-camera `subject` keeps cutting in **every** phase so the subject-driven
lower-thirds fire throughout: in the running phases (qualifying, race) it is chosen
like a broadcast director would — whichever battle is currently tightest — with
hysteresis so the cut doesn't change every tick; in the parked phases (grid, results)
it simply rotates through the field on a short cadence while the takeover board is up.

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
`validate-simulator` drives the phase machine with short durations so a bounded run
visits **every** phase, and asserts that each of qualifying / grid / race / results was
observed and validated (not just the race), and that qualifying surfaced a
`notable.class_best_lap` flag so the class-best edge is exercised.

## Requirements

Node.js >= 22. No runtime dependencies (uses Node's built-in `http` module).
