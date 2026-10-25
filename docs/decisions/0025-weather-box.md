# Decision: `session.weather`, a compact weather box, and a weather card in the info panel

**Issues:** #208 · **Milestone:** 0.15.0
**Status:** Accepted · **Date:** 2026-10-24

How the contract carries the weather, and the first two places the overlay shows it. Additive to
spec v1, so `schemaVersion` stays `"1"`.

## Context

Spec v1 has no weather. Broadcasters in the battlecast Discord ("Update/Info box") pointed at Paul
Glover's LMU/rF2 overlay, which has a compact weather box, a large weather-and-track-map
overlay, and an air/track temperature history. The issue proposed an optional `session.weather`
object (air and track temperature, conditions, rain and wetness, wind) and a phased overlay: the
compact box first, possibly also as a card in the info panel (#62), then history, then the big
overlay once the track map (#29) exists.

The owner chose to **start small**: the compact box as its own widget, and the same weather as
one card in the info panel's rotation. Nothing else.

## Decision

- **`session.weather` is an open object inside `session`.** Weather is live session state: it
  changes during the session and belongs next to the flag and the clock, not in `event` (ADR
  0024), which is fixed for the weekend. This revision defines three optional fields:
  - **`air_temp`** and **`track_temp`**: numbers in **°C**. One canonical unit keeps producers
    simple and matches `subject.telemetry.speed`, which is canonical km/h with the display unit
    a broadcaster choice.
  - **`conditions`**: a short producer string (`Clear`, `Light rain`) shown verbatim. Sims
    describe the sky differently, so a fixed enum would be the overlay inventing a mapping; the
    producer owns the wording.
  - A field that is absent, null or of the wrong type is skipped, and the box and the card show
    only the fields that hold. With none, the box draws nothing and the card is not in the
    rotation.
- **Temperature unit is a per-widget knob, `tempUnit` (`c` default, or `f`)**, normalized onto
  every widget like `speedUnit` and read by the weather box and the info panel. Values are shown
  in **whole degrees**: a broadcast graphic has no use for a tenth of a degree, and the
  producer's precision varies by sim.
- **A compact weather box, `weather`, with its own `/weather` route and a slot in `/all`.** One
  row: `AIR 22°C`, `TRACK 31°C`, and the conditions. It updates in place every snapshot and
  appears and disappears without a transition, like Race Control: it is a status readout, not a
  reveal. Its default place is top centre, directly under Race Control (`x 900, y 80, w 360,
  h 44`, `z 10`), the one free spot in the top band that is clear of every default widget.
- **A weather card in the info panel's rotation**, off by default (`weatherCard` on the `info`
  widget), for a broadcaster who runs the info panel and wants the weather in it instead of, or
  as well as, a separate box. It is off by default because the weather box is visible by
  default: with both on, `/all` shows the weather twice, and an info panel with no event and no
  lines becomes a weather-only strip. The card reads `AIR 22°C · TRACK 31°C · LIGHT RAIN` in
  the info widget's own unit.
  - **Its place** is last, after the producer's lines and the broadcaster's. Commentary and
    sponsor reads keep the order ADR 0024 gave them, and the card is a status readout that
    closes each cycle. In the `/config` preview the sample weather stays when the broadcaster
    adds a line (only the sample producer lines leave, ADR 0024), so the preview's weather box
    stays filled. With the card on, a line added while the sample card is up waits for the rest
    of the card's dwell, which is the card's stable identity (below) doing its job; a line added
    while a sample line is up shows at once.
  - **It has a stable identity in the line list.** Its text changes whenever a temperature
    moves a degree, and the info panel treats a line whose text changed as a different line
    (rule 80 of the widgets spec). If the card were an ordinary line, every temperature tick
    would count as a changed list and jump the rotation to the card's place. So the card is one
    entry whose identity does not depend on its text: new weather values update its text in
    place, without a crossfade and without touching the rotation or its dwell. Only the card
    entering or leaving the list (weather appearing or going, the toggle flipped) is a list
    change.
  - **It is never de-duplicated** against the text lines, and they are never de-duplicated
    against it: a producer line that happens to read the same as the card is a different
    thing.

## Out of scope

- **Weather history** (an air/track trend over the race). It needs either a producer-sent series
  or overlay-side buffering, which loses everything on an OBS reload. It is a later issue.
- **The large weather-and-track-map overlay.** It depends on the track map (#29).
- **Rain, track wetness and wind** (`rain`, `track_wetness`, `wind_speed`, `wind_direction`).
  The issue lists them; they are natural later additions to `session.weather`, as new optional
  fields with their own display rules. Leaving them out keeps the first box small.

## Alternatives rejected

- **A top-level `weather` object.** Weather changes with the session, and `session` already
  holds the live session state.
- **Producer-chosen units (`air_temp_f`, or a `unit` field).** Every consumer would need both
  paths; one canonical unit plus a display choice is the `speed` precedent.
- **A conditions enum with overlay icons.** The overlay would map each sim's vocabulary, which is
  deriving; verbatim text first, icons later if a producer sends a code for them.
- **The weather card as an ordinary text line.** Its text changes with the temperature, so it
  would jump or reset the rotation on every change (see above).
- **The weather card on by default.** With the box also on by default, every `/all` would
  show the weather twice out of the box, and an info panel that had nothing else to show would
  appear as a weather strip.
- **A reveal transition on the box.** It is a persistent readout whose values change constantly;
  a wipe on every appearance adds motion with no news in it.

## Consequences

- BattleDirector has to emit `session.weather` before a live broadcast shows anything.
- The mock producer emits slowly drifting temperatures and a conditions string so the box and
  the card are exercised live.
- A later field (wetness, wind) adds an item to the box and a part to the card, each skipped
  when absent.
