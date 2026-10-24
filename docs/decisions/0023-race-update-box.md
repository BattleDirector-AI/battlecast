# Decision: a race-events list in the snapshot and a race update box

**Issues:** #27 · **Milestone:** 0.15.0
**Status:** Accepted · **Date:** 2026-10-24

How the contract says "something just happened in the race" (a fastest lap, a new leader, a
retirement, a penalty), and how the overlay shows it. Additive to spec v1, so `schemaVersion`
stays `"1"`.

## Context

rFactor 2 has a native Race Update Box that cycles recent events; Le Mans Ultimate has none
(`docs/research/native-overlays.md`). Broadcasters asked for one in the battlecast Discord
("Update/Info box"). ADR 0016 and ADR 0017 both pushed their callouts here: a local-yellow
callout and a race-winner callout belong in an event box, not in a status strip.

Spec v1 has no notion of an event. Every field is the state *now*. The issue left open whether
the overlay could work events out itself by comparing successive snapshots (a `position: 1`
that changed hands, a `best_lap` that dropped). That is exactly the derivation the dumb-overlay
rule forbids, and it fails in practice: the overlay misses snapshots, connects mid-race, and
cannot tell a penalty from a pit stop. The producer has the sim's own event feed and the
race-control messages, so the events are its facts.

## Decision

One optional top-level array, **`race_events`**, in every `state` snapshot: the producer's
recent events, oldest first, as a short rolling list. Each entry has a required unique, stable
string `id`, a `type`, the `driver_name`, an optional `slot_id`, an optional `vehicle_class`
(present = a class event), the field its type needs (`lap_time`, `finish_status`, `penalty`)
and an optional `detail` line.

- **A list in the snapshot, not an SSE event type.** Snapshots are complete and not deltas
  (protocol rules 2–3), so a consumer that drops a frame or connects late still has everything.
  A separate `event:` type would be the contract's first message a consumer must not miss.
  Keeping recent events in every snapshot costs a few hundred bytes and keeps the "latest
  snapshot is enough" property.
- **The `id` is what makes a repeating list show each event once.** The overlay remembers the
  ids it has seen and shows an id at most once. Ids are compared as exact strings, like
  `slot_id`.
- **The first snapshot after the box starts is a baseline.** Every event already listed is
  marked seen and none is shown. An OBS Browser Source reloads often (scene switches, a
  refresh, a crash), and replaying the last 30 seconds of events on every reload would be wrong
  on air. The cost: an event that happens in the instant before a reload is lost. The baseline is
  taken once per mount, not per reconnect, because a dropped feed that resumes should show what
  happened during the drop.
- **Four typed events, and the overlay writes the card.** `fastest_lap`, `leader_change`,
  `retirement`, `penalty`. The producer sends data, not prose: the overlay owns the label
  wording, the name format (the lower-thirds' full form) and the lap-time format (the tower's
  lap flash), so one broadcast reads the same everywhere. `detail` is the producer's escape hatch
  for a second line it wants verbatim.
- **Class events carry `vehicle_class`.** A string makes it the class's event and the label
  gains the class (`GT3 FASTEST LAP`); absent or null is overall. The producer decides which
  class events matter, so the overlay never asks "is this an overall or class best". An event
  that is both (the overall fastest lap is also its class's) is sent once, as the overall
  event: the overlay could only drop the duplicate by comparing entries, which is deriving.
- **Retirement reuses ADR 0017's codes.** `finish_status` `2` reads `RETIRED`, `3` reads
  `DISQUALIFIED`, so a producer that already sends the per-car code reuses it.
- **One card at a time, a fixed dwell, a small queue.** Each card shows for `dwellSeconds`
  (default 8, valid 2–60), events that arrive together queue behind it, and the box hides when
  the queue is empty. The queue holds at most 5, dropping the oldest waiting event, so a burst
  (a first-lap pile-up) cannot keep the box busy for minutes with stale news.
- **Its own route and an `/all` widget.** `/updates` for a dedicated Browser Source, and an
  `updates` widget in `/all` and `/config` like every other widget, visible by default (it draws
  nothing until a producer sends events). It reuses `dwellSeconds` with its own default and
  range rather than adding a knob, and it takes plate opacity and text size like the other
  card widgets.
- **The lower-thirds' reveal.** Cards use the shared skewed bar-wipe, gated on `data-motion` like
  every other transition.
- **Bad entries are skipped.** An entry the overlay cannot read (not an object, no id, an
  unknown type, a missing required field) is skipped and the rest render. An unknown type is how
  a later revision adds a type without breaking older overlays.

## Alternatives rejected

- **Deriving events in the overlay from successive snapshots.** Forbidden by the dumb-overlay
  rule and unreliable: missed snapshots, mid-race connects, and no way to see a penalty.
- **An `event: race_event` SSE message.** Lost for good if the consumer is not connected at
  that instant, and it breaks the rule that the latest snapshot is enough.
- **Producer-rendered text (`{ "text": "GT3 FASTEST LAP — R. Lietz 3:47.640" }`).** Simplest for
  the overlay, but every producer would invent its own wording and format, and the overlay could
  not style the parts.
- **Replaying events listed at connect.** Wrong on every OBS reload. A producer that wants an
  event seen after a reload can re-issue it with a new id.
- **Rotating through all recent events on a timer** (the issue's first sketch). It re-shows old
  news over and over; showing each event once and then hiding keeps the box quiet between
  events.
- **Position changes as a type.** In the issue's list, but a running race changes positions
  constantly; it needs a producer notion of "notable overtake" first. Out of scope for v1's four
  types; a later type can add it.

## Consequences

- BattleDirector has to emit `race_events` before a live broadcast shows anything. Until then
  the box draws nothing.
- The mock producer emits events in the race phase (fastest laps, a leader change, the retirement
  it already stages, a penalty) so the box is exercised live; `validate-simulator.js` pins it.
- The overlay keeps seen ids for the life of the page. With a short rolling list this stays
  small, and a page reload resets it.
- A producer that restarts and reuses ids loses events on an overlay that stayed connected. The
  contract asks producers to keep ids unique across restarts.
- Later types (local-yellow callout, race winner, notable overtake) are additive: new `type`
  strings and, if needed, new optional fields.
