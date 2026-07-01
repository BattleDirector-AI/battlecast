# battlecast spec v1 compliance harness

A conformance test harness for **producer authors**. If you're building a
producer for battlecast — for any sim, not just BattleDirector — point this at
your running SSE endpoint to self-check that it conforms to
[spec v1](../SPEC.md) before wiring it up to a real broadcast.

It connects as an SSE client (exactly as battlecast itself does), samples your
`state` events, and validates each one against [`schema.json`](../schema.json)
— the single source of truth for field names, types, and required-ness — plus
the framing rules from `SPEC.md` (correct `event:` name, `text/event-stream`
content type, well-formed JSON `data:`).

## Run

```sh
cd spec/v1/compliance
npm install
npm run check -- <your-producer-sse-url>
```

For example, against the [reference mock producer](../../../producers/mock/):

```sh
cd producers/mock && npm start &
cd spec/v1/compliance && npm install && npm run check -- http://localhost:8080/events
```

Options:

```sh
npm run check -- <url> --samples 5 --timeout-ms 15000
```

| Flag             | Default | Meaning                                                |
| ---------------- | ------- | ------------------------------------------------------- |
| `--samples`       | `3`     | Number of `state` events to sample before reporting     |
| `--timeout-ms`     | `10000` | Max time to wait for enough samples before failing       |

Exit code is `0` and the report ends with `PASS` when every sampled `state`
event conforms; exit code is `1` and the report ends with `FAIL` otherwise,
with specific messages naming the offending field and event, e.g.:

```
  state event #1: FAIL
    - /relationship/battle_intensity must be <= 1
```

## Self-test

```sh
npm test
```

Spins up the reference mock producer and asserts the harness passes it, then
spins up a handful of deliberately non-compliant streams (missing required
field, out-of-range value, wrong SSE event name, malformed JSON) and asserts
the harness fails each with a clear, specific message. This is what keeps the
harness itself honest — see `test/bad-producer.js` and `test/self-test.js`.

## What's checked

- **Transport**: response `Content-Type` is `text/event-stream`, status `200`.
- **Framing**: at least one SSE frame is observed with `event: state`; other
  event names are otherwise ignored, since consumers only listen for `state`.
- **Payload**: each `state` frame's `data:` is well-formed JSON and validates
  against `schema.json` in full — required fields, types, nested object
  shapes (`vehicles[]`, `subject`, `relationship`), and numeric bounds
  (`position >= 1`, `battle_intensity` in `[0, 1]`).

What's intentionally **not** checked: emission cadence (SPEC.md defines no
required rate) and `schemaVersion`'s specific value (consumers are meant to
tolerate unrecognized versions and log a warning, not hard-fail — see
`SPEC.md` "Versioning policy"). `schemaVersion` still must be present and a
string, per `schema.json`.
