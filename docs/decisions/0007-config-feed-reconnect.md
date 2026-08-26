# Decision: `/config` separates a retrying feed from a stopped one, and offers a Reconnect

**Issues:** #160 (follow-up to #158) · **Milestone:** unassigned
**Status:** Accepted · **Date:** 2026-08-26

Extends `0006-config-producer-feed-status.md`, which gave `/config` a live three-state readout for
the race feed but assumed every failure was the same failure. Behavior:
`.ai/spec/what/overlay-config.md` rules 25 and 30. Renderable from **spec v1 today** — no schema
change, no new producer field, no new profile field, no `configVersion` bump.

## Context

0006's readout tells the broadcaster the feed is down. It does not tell them whether it will come
back, and on one common failure it is wrong to imply that it might.

`EventSource` reconnects on its own — but not in every failure, and the exception is the one a
broadcaster is most likely to hit. Measured in headless Chromium (Playwright 1.61, the same engine
OBS's Browser Source runs), watching `readyState` and the event sequence for 12–14 s per case:

| Case | What the browser does |
|---|---|
| Producer not running (connection refused) | Retries unaided, ~every 5 s, indefinitely. `readyState` stays `CONNECTING`; an `error` fires per attempt. |
| Connected, then the producer dies mid-stream | `error` → `CONNECTING` → reconnected ~3 s later. `open` and `state` fire again. |
| Host answers but does not deliver an event stream (404, `text/plain`) | **One `error`, `readyState` `CLOSED`, and it never tries again.** |

So the reassuring cases first: opening battlecast before the producer is fine, and a producer
restart mid-session heals itself. Neither needs a control, and a readout that said "not connected"
flatly during them would push the broadcaster to act when the correct action is to wait.

The third case never recovers. The obvious way into it is a URL pointed at the wrong port or path.
The sharper one is a **startup race**: a producer whose HTTP server binds its port *before* its
event route is live answers battlecast's first request with a 404, and the browser gives up
permanently. The producer then comes up perfectly and `/config` reads "not connected" forever, with
no recovery short of reloading the page. That is the same "battlecast opened first" scenario the
first case makes harmless, landing in the one bucket that is not.

A fourth path reaches the same dead end from inside the editor: a URL the browser refuses to
construct at all (`new EventSource('http://')` throws synchronously). 0006 already routes that to
the failed readout; there is no connection in existence, so nothing will ever retry it.

## Decision

Two changes, both on `/config`.

### 1. Four states, not three

0006's *disconnected* splits into *retrying* and *stopped*. Both render as "not connected" — that
is what is true on air — and the retrying one says so: `not connected — retrying…`.

The distinction is available for free at the moment the failure is reported, from the transport's
own state, so this costs no timer and 0006's flat ban on stall/timeout detection (rule 26) survives
intact. That ban is why the readout MUST NOT decay from *retrying* to *stopped* after some interval
of its own choosing: "it has been retrying a while, it is probably dead" is exactly the invented
number rule 26 exists to forbid, and it would be wrong — the refused-connection case retries
correctly and indefinitely, and healing the moment the producer starts is the desired behavior, not
a hang.

The state is recomputed from each failure rather than latched from the first, because the retrying
transport reports every failed attempt. A readout latched on the first `error` would be indelibly
stuck in whichever state the transport happened to be in seconds ago.

### 2. A Reconnect control, in both not-connected states

The control is rendered whenever the readout is *retrying* or *stopped*, and is absent while
*connecting* or *connected*. It closes the connection and opens a new one against the URL the
editor currently holds, immediately, and resets the readout to *connecting*.

**Why gate it on "not connected" rather than on "stopped".** Only *stopped* strictly needs it. But
a transport in the refused-connection case is not steadily *retrying*: it is cycling — attempt,
`error`, wait, attempt — and a control gated on the terminal state would appear and disappear
underneath the pointer as the browser worked, which reads as a broken page. Worse, it would make
the control's presence the answer to "which failure am I in?", so the broadcaster has to solve that
question before they know whether pressing anything helps. The readout's suffix already carries
that information in words. The button does not need to carry it in absence, and the cost of
offering it during a retry is one connection the operator chose to open.

**Why not just rely on the browser's retry.** For two of the three cases we would be right to. For
the third the browser has made a final decision that no amount of waiting reverses, and the only
existing escape is a page reload — which on an operator page in the middle of laying out an overlay
means losing unsaved edits. The startup race puts a correctly-configured, correctly-running setup
into that state.

**Why this is not the "Test connection" button 0006 rejected.** That one reports a verdict from a
moment in the past, which starts decaying the instant it is rendered, and it misses the
drop-before-green-flag case entirely. Reconnect renders no verdict at all. It re-arms a **live**
indicator: it changes nothing about what the readout means or how current it is, it only opens a
new connection when the old one has stopped, or when the operator would rather not wait out a retry
interval. The thing 0006 built is still the thing doing the reporting.

**Why immediate, and why it cancels a pending reopen.** 0006 debounces URL *changes* by 500 ms so a
typed URL costs one connection rather than one per keystroke. A press of a button is not a
keystroke and is not ambiguous; making the operator wait half a second for an explicit action they
took once would only read as lag. The natural sequence is "fix the URL, then reconnect", which
leaves a rule-27 reopen counting down when the reconnect fires — so the reconnect cancels it, and
that sequence costs one connection against the corrected URL rather than two.

### It writes nothing

Feed status is transient UI state, and so is the connection the control opens. `producer.src`, the
profile, the OBS Browser Source URL and `configVersion` are untouched. Reconnect *is* a control
though, not a readout, so `overlay-config` rule 16 applies where it did not apply to the readouts:
it needs a `configHelp.js` entry and an ⓘ.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Leave it at three states and rely on the browser's retry | Correct for two of the three measured failures and permanently wrong for the third, which is the one a startup race walks into from a working configuration. |
| Show the control only when the transport has stopped | The transport cycles between retrying and stopped-ish activity across attempts, so the control appears and vanishes on its own; and it makes the control's presence the diagnosis the broadcaster has to read before acting. |
| One "not connected" string plus a Reconnect control | Cheaper, and the control alone would unstick the dead case. But it tells the broadcaster to act during the two failures that fix themselves, and acting means a connection reset in the minutes before green flag. The distinction is free at the point of failure; spending nothing to avoid a false alarm is worth it. |
| A "Test connection" button | Rejected in 0006 and still rejected: a verdict from a moment in the past that decays as it renders. Reconnect re-arms the live readout instead of replacing it with a snapshot. |
| Time out *retrying* into *stopped* after N seconds | The invented number rule 26 forbids. The refused-connection case retries correctly and forever, and heals the instant the producer starts; declaring it dead first would be a lie the broadcaster acts on. |
| Reconnect automatically when the transport stops | Reimplements the browser's retry policy in the app, against the one failure the browser has deliberately decided is fatal — a permanent poll of a 404 with a cadence we would have to invent. It also removes the operator's ability to leave it alone. |
| Debounce the reconnect like a URL edit | Half a second of nothing in response to a deliberate button press reads as a broken button; the ambiguity a debounce exists to absorb (a burst of keystrokes) does not exist for a click. |
| Reload the page as the recovery path | The existing escape, and the reason this issue exists: it discards unsaved layout work on an operator page whose whole job is unsaved layout work. |

## Consequences

- **The shared test double has to model `readyState`, not just events.** `FakeEventSource`
  reproduces `open`/`error`/`state` but nothing of the transport's own state machine, which is
  exactly the distinction these rules turn on — so the one failure a broadcaster is most likely to
  hit is the one the 0006 suite cannot reach. The double gains `readyState`, the `CONNECTING`/
  `OPEN`/`CLOSED` constants, an `error` event that carries its `target` the way the browser's does,
  and named failure entry points for the two policies.
- The editor's `onError` needs the transport's state, not merely the fact of an error. The shared
  client's `connect(url, onState, { onOpen, onError })` signature is unchanged — a real `error`
  event already carries the `EventSource` as its `target` — but `onError` stops being a bare
  "something failed" signal for its one caller that renders it.
- Rule 19's help-coverage guard now covers a control that is only sometimes in the DOM. A coverage
  assertion that renders the page in its default state will not see it.
- Three widths of "not connected" text now occupy the same line of a fixed-width panel. The longest
  is the retrying one.

## Still open

- Whether a producer that answers with a non-stream response should be reported more specifically
  than *stopped* (e.g. "the address answered, but not with a race feed"). The transport does not
  hand the page a status code or a content type — `error` is opaque — so saying more would mean a
  separate probe, which is the `fetch` approach 0006 rejected. Left alone unless a broadcaster
  reports being unable to tell a wrong port from a wrong path.
