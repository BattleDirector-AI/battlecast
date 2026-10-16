# Decision: tower lap-time flash from `last_lap` change detection

**Issues:** #207 · **Epic:** #31 · **Milestone:** 0.13.0
**Status:** Accepted · **Date:** 2026-10-16

When a car completes a lap, its standings-tower gap cell briefly shows the new lap time
(the "flash" real timing towers do). Renderable from spec v1 today. No new field.

## Decision

1. **Trigger: a change in the car's own `last_lap`.** The tower compares one car's
   `last_lap` with the value it had in the previous snapshot, keyed by `slot_id`. It
   is the same kind of noticing ADR 0002 already allows the lower-thirds ("noticing
   that a producer-provided value changed, and timing the display"). The tower never
   compares one car's times with another's, so it derives no race fact.
2. **Tier from `notable`, never from lap times.** Session best > class best > personal
   best > plain, read from the producer flags in the snapshot that fired, and frozen
   for the flash so a `personal_best_lap` that is true for one tick still colours the
   whole flash.
3. **Fixed 5 s dwell**, with a `towerMetrics.lapFlash` toggle (default on) as the only
   knob. Broadcasters asked for the feature, and a toggle covers the ones who don't
   want it.

## Alternatives rejected

- **A producer lap counter or lap-completed event** (`laps_completed`). Robust to two
  identical consecutive lap times, but it is a contract change for a case that rounds
  to never at millisecond resolution. Change detection works with every producer today.
- **Default off.** Existing profiles would look identical, but the feature exists
  because broadcasters asked for it. Rule 2's "existing profiles keep working
  unchanged" is about not breaking a profile, and a flash breaks nothing.
- **A configurable dwell.** Not asked for. It can be added as a defaulted knob later
  without breaking anything.

## Consequences

- Two consecutive laps with exactly the same `last_lap` (to the producer's precision)
  do not flash the second time.
- A producer that rewrites `last_lap` for reasons other than a completed lap (e.g. a
  correction) triggers a flash. That is the producer's call to make.
- The tower now keeps per-car state between snapshots: the previous `last_lap` and any
  running flash.
