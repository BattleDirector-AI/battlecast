# Decision: battle box exit grace and caution hide

**Issues:** #204 · **Milestone:** 0.13.0
**Status:** Accepted · **Date:** 2026-10-16

What the battle box does when a battle flickers at the producer's threshold, and under
caution. Presentation timing only. No contract change.

## Context

The battle box has no distance threshold of its own. It is active whenever
`relationship.gap_ahead` or `gap_behind` is a number, and idle the moment both are null,
on the very next snapshot. A broadcaster reported the box "popping in and out" every
couple of seconds under FCY (#204). The producer was alternating between sending gaps
and nulling them as two cars hovered at its battle threshold, and the overlay mirrored
that faithfully.

The real fix is hysteresis at the source (BattleDirector-AI/battledirector#3571). The
overlay still needs to tolerate a chattering producer, because any producer can have
this bug.

## Decision

1. **Exit grace.** Once a battle has shown, it stays up for `idleGraceSeconds` (default
   5 s, `0` disables) after the battle goes idle, holding the last active numbers. If
   the battle returns within the grace, the exit is cancelled. Only the *exit* is
   delayed. Entry stays immediate, so a real battle never shows late.
2. **The grace is keyed to the subject.** A camera cut ends it at once. A held battle
   only ever shows numbers that belonged to the car now on camera, which is the
   staleness `isActiveBattle` exists to prevent.
3. **Caution hides the box.** Under `full_course_yellow` or `safety_car` nobody is
   racing for position, so the box renders nothing, the way it already does in
   qualifying. This alone would have avoided the reported case.
4. **Auto-hide agrees with the grace.** With `hideWhenIdle` on, `/all` keeps the box
   through the grace instead of dropping it on the first idle snapshot. Without this,
   the grace would be invisible to exactly the broadcasters who saw the flicker.

## Alternatives rejected

- **A producer-owned `relationship.battle_active` field**, separating "no car adjacent"
  from "not a battle worth showing". Arguably the cleaner contract, but a larger change.
  The grace fixes the symptom for every producer, including ones that never adopt a new
  field. It can be revisited if producers start needing the distinction.
- **An overlay distance threshold with hysteresis** (enter at X s, exit at 2X s). That
  decides what counts as a battle, which is race analysis and belongs to the producer.
- **Holding entry as well as exit** (debounce both ways). That delays every real battle
  to protect against a producer bug.

## Consequences

- A battle that genuinely ends stays on screen up to 5 s longer by default, showing its
  last numbers, frozen.
- The hold needs time, so the `/all` auto-hide decision for `battle` can no longer be a
  pure function of the snapshot (see `how/renderer.md`).
- The caution hide applies whether or not the broadcaster uses `hideWhenIdle`.
