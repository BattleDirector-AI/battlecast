# Decision: `/config` reports producer feed status from its own live connection

**Issues:** #158 (found while reviewing #156) · **Milestone:** unassigned
**Status:** Accepted · **Date:** 2026-08-26

Gives the layout editor at `/config` a way to answer "is the race feed actually reaching this
machine?" Behavior: `.ai/spec/what/overlay-config.md` rules 25–29. Renderable from **spec v1
today** — no schema change, no new producer field, no new profile field.

## Context

`/config` is where a broadcaster sets the producer SSE URL, and it is the only page in the app
that never uses it. The editor's preview renders a bundled fixture
(`spec/v1/fixtures/race-close-battle.json`, augmented on a copy), so the page looks exactly the
same whether the producer is running, misconfigured, or absent. Three things compound that:

- **The URL field is unvalidated.** `setProducerSrc` writes the string into the config and
  `buildObsUrl` pastes it into the OBS URL. Nothing ever tries it.
- **The one status line on the page says "Connected."** It is set by `refreshFromServer()` and
  means the *companion server* — the thing that saves profiles and logos — answered
  `GET /api/profiles`. It has nothing to do with the race feed. Read on a page whose main job is
  pointing the overlay at a producer, a bare "Connected." is actively misleading.
- **Connection errors already exist and are discarded.** Every `sseClient.connect` accepts an
  `{ onError }` option; no caller in the app passes one. The information is produced and thrown
  away.

The failure this causes is diagnosis by elimination: the broadcaster loads `/all` in OBS, sees an
empty overlay, and has no way to tell a wrong URL from a producer that is not running from a
layout with everything hidden.

## Decision

`/config` opens **its own** `EventSource` against the producer URL currently in the editor, holds
it open for the life of the page, and renders a three-state readout next to the URL field:
connecting → connected → not connected. Editing the URL moves the connection to the new value.

### A held-open connection, not a "Test connection" button

A button reports one moment in the past. The question a broadcaster asks at five minutes to green
flag is not "did it work when I clicked" but "is it working **now**" — and the interesting case
is the feed that connects during setup and drops before the session. A button cannot show that; a
held connection shows it for free, because `EventSource` already surfaces the drop as an `error`
event. The connection also costs nothing to hold: the producer is streaming to the overlay
Browser Sources anyway, and `/config` is an operator page that is not on air.

### Transport state only — explicitly no stall detection

The readout tracks the **connection**, not the data. An open connection that has stopped
delivering `state` events still reads "connected".

This is deliberate. The overlay is a client with no control over the producer and no idea what
cadence to expect: `protocol-contract.md` rule 3 says consumers MUST NOT assume a fixed cadence,
and a legitimately paused sim, a replay, or a producer between sessions all look identical to a
hung one. Any timeout would be a number invented by the overlay, and the only honest thing it
could report is "no data for N seconds" — which the broadcaster already knows, because the
overlay in front of them is not moving. A false "feed stalled" on a page whose entire purpose is
telling the truth about the feed is worse than no signal at all.

Stall detection is also the wrong layer. If a producer can tell that it is stalled, it can say so
in the payload, and the overlay renders that field — *dumb overlay, smart producer*
(`system-overview.md` rule 3).

### The preview stays on the fixture

The connection is diagnostic; it never feeds the preview. Two reasons:

1. **The editor must show every widget populated.** Live snapshots put the lower-thirds between
   camera cuts, empty the battle box when no battle is active, and blank the HUD when there is no
   telemetry — the states the widgets are *supposed* to reach. A broadcaster cannot position a
   widget that is not drawing, and would have to wait for a race to happen to lay out the
   qualifying lower-third.
2. **Layout work needs a still target.** Drag and resize are pixel work against a scaled preview.
   Content that reflows at 2–10 Hz underneath the handles makes the geometry harder to judge, for
   no gain — the geometry does not depend on the data.

The consequence to accept: the preview is sample data, and "connected" tells the broadcaster the
feed is live without showing it. That is the whole claim being made.

### One SSE client, merged first

`connect()` is copy-pasted into four route folders (`tower`, `battle`, `racecontrol`, `onboard`)
and the copies have drifted:

| | tower | battle | racecontrol | onboard |
|---|---|---|---|---|
| Exports beyond `connect`/`resolveSrc` | `parseState`, `DEFAULT_SRC`, `SUPPORTED_SCHEMA_VERSION` | — | — | `resolveSpeedUnit` |
| Parse failure | `console.error` + `onError(err)` | `console.warn`, dropped | `console.warn`, dropped | `console.warn`, dropped |
| `resolveSrc` guard | `try`/`catch` | none | none | none |
| **`resolveSrc` signature** | **`(search)` — no default** | **`(search = window.location.search)`** | **same** | **same** |
| Default URL | exported constant | inline literal | inline literal | inline literal |
| Unit tests | yes (`sseClient.test.js`) | none | none | none |

Five of the nine render pages already import the tower's copy across a directory boundary
(`../tower/sseClient.js`), so the "one client per route" framing the file layout implies has
already been abandoned in practice — what remains is three unused, untested near-duplicates.

`/config` needs a connection **and** a new lifecycle signal (`onOpen`) to distinguish connecting
from connected. Adding that to one of four copies deepens the drift; adding it to a fifth copy in
the config folder is worse. So the copies merge into `app/src/lib/sseClient.js` — `lib/`, not a
route folder, because `/config` is not an overlay route — **before** the new option is added.

The merge keeps the tower copy's **exports** — the only ones named, and the only ones under test —
and the tower's `try`/`catch` guard. It must **not** keep the tower's `resolveSrc` *signature*.

That row of the table is the one difference a caller reaches, and it is a trap. `BattlePage`,
`RaceControlPage`, and `OnBoardHudPage` all call `resolveSrc()` with **no argument** and rely on the
parameter default to read `window.location.search`. The tower's copy has no default — it is always
called as `resolveSrc(location.search)` — so a merge onto its signature turns those three calls into
`new URLSearchParams('')` and `?src=` silently stops working on `/battle`, `/racecontrol`, and
`/onboard`, in violation of `what/overlay-config.md` rule 13. `resolveSpeedUnit()` is called the same
way on `/onboard` and takes `?unit=mph` down with it.

**The merged `resolveSrc` and `resolveSpeedUnit` therefore keep the
`search = window.location.search` default**, which is a superset of both behaviors: every existing
call site — with an argument or without — keeps its current result. Tests must cover the no-argument
form specifically, because every current test passes an explicit string and would not notice.

`resolveSpeedUnit` is not connection logic — it is a URL-knob resolver like `pickProducerSrc` and
`parseTowerMetricsParam` — and moves to `lib/overlayConfig.js` with them rather than into the shared
client. Note that `overlayConfig.js` today imports `DEFAULT_SRC` **from the tower's copy**, so
deleting that file is not a leaf operation: the import moves to the shared client in the same step.

The merge must not carry over the tower's **parse-failure** behavior either. The tower's `connect`
calls `onError(err)` when a `state` payload fails to parse; the other three copies log and drop it.
Merged onto the tower's behavior, `/config` — which renders `onError` as "not connected" — would
report a dead feed the moment one malformed snapshot arrived on a connection that is open and
healthy, which `what/overlay-config.md` rule 26 forbids outright. **The merged client's `onError`
therefore fires for transport errors only:** the `EventSource`'s own `error` event. A parse failure
is logged and dropped, and delivery continues on the next good snapshot. No current caller passes
`onError`, so nothing regresses; the constraint exists because `/config` is the first caller that
will.

Given the signature rule and the `onError` rule above, the merge is behavior-preserving — the
remaining drift is in corners no caller reaches (no page passes `onError`;
`new URLSearchParams(string)` does not throw). It therefore lands as a `how/` update with **no new
`what/` rule**.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| "Test connection" button | Reports one moment in the past, and misses the drop-before-green-flag case that matters most. Costs a click to learn less. |
| Stall / no-data-for-N-seconds detection | The overlay cannot distinguish a hung producer from a paused sim, a replay, or a between-sessions idle (`protocol-contract.md` rule 3 — no assumed cadence). A false "stalled" on the page that exists to tell the truth about the feed is worse than silence. If the producer knows, it should say so in the payload. |
| Live preview when connected | Widgets legitimately go idle/blank on real data, so the broadcaster cannot position what is not drawing; and content reflowing at feed cadence makes drag/resize harder for no benefit. |
| Rename the `Connected.` line and ship no connection | Materially cheaper — a one-line copy change — and it does fix the misread the issue leads with (rule 29 on its own). But it leaves the page unable to answer the question that produced the issue: a correctly-worded server line still says nothing about the feed, so the broadcaster with an empty overlay is still diagnosing by elimination. The rename is kept; it is not sufficient on its own. |
| A sample/live preview toggle | A third state to spec, test, and document (rule 16 help copy, rule 19 coverage) to buy a view the broadcaster already has in OBS. |
| Validate the URL string instead of connecting | A syntactically valid URL pointed at nothing is the common failure. String validation would pass it. |
| Probe the endpoint with `fetch`, like `serverAvailable()` | An SSE endpoint is a stream, not a JSON document; a probe would either hang or need its own abort machinery, and it would still report only one moment. `EventSource` already models exactly this. |
| Add `onOpen` to the tower copy and import it from `/config` | Ships a config page depending on `routes/tower/`, and leaves three drifted copies plus the fifth-copy temptation. The merge is small and the reason to do it is now. |

## Consequences

- Every ConfigPage test suite now mounts a component that opens an `EventSource`; `happy-dom` has
  none, so they must stub it (as `App.test.js` already does). Expect to touch the existing config
  suites when this lands.
- The editor holds one connection per open `/config` tab. Two tabs are two connections — an
  operator-page cost, accepted.
- The status message set by `refreshFromServer()` is renamed. It is not a config field, so no
  profile migration and no `configVersion` bump.

## Still open

- Whether the render pages should surface feed status too (an "offline" treatment on `/all`).
  Deliberately out of scope: on-air pages composite over live video and a diagnostic badge is the
  last thing a broadcast wants burned in. If it happens it is its own decision.
