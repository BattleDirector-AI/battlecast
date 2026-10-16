# Decision: lap-deficit fields for lapped cars

**Issues:** #203 · **Milestone:** 0.13.0
**Status:** Accepted · **Date:** 2026-10-16

How the contract says "this car is N laps down", and how the standings tower shows it.
Additive to spec v1 — `schemaVersion` stays `"1"`.

## Context

`gap_to_leader` and `interval_ahead` are seconds only. Nothing in spec v1 can say a car
is a lap or more down, so a producer facing a lapped car can only send a misleading time
or nothing. BattleDirector sent `0`, and the tower rendered it verbatim as `+0.000`
(#203). In the grouped layout, `classGap` clamps `own − lead` at 0, so a lapped car
collapsed to `+0.000` there too.

The overlay cannot work the deficit out itself without scanning `vehicles[]`, which the
dumb-overlay rule forbids. The fix is a contract addition.

## Decision

Three optional per-vehicle integers, each a producer fact:

| Field | Laps behind | Read by |
|---|---|---|
| `laps_behind_leader` | the overall leader | inline gap cell |
| `laps_behind_ahead` | the car directly ahead overall | interval column (both layouts) |
| `laps_behind_class_leader` | the vehicle's own class leader | grouped gap cell |

`0`, null, or absent means "same lap". At 1 or more the tower shows `+1 LAP` / `+N LAPS`
in place of the matching time.

A lapped car's `gap_to_leader` stays a **real time**, not null and never a `0`
placeholder. The grouped layout still subtracts times for cars on their class lead lap,
and in a multi-class race the class leader those times are measured from is often laps
down itself.

## Alternatives rejected

- **Subtract the overall fields for the grouped layout**
  (`own.laps_behind_leader − classLeader.laps_behind_leader`). No extra field, but each
  operand is a whole-lap floor of a distance gap, so the difference can be off by one
  lap. `gap_to_leader` subtraction is allowed because it is exact; this would not be.
- **Grouped layout shows the overall deficit.** A GT3 class leader would read `+3 LAPS`
  at the top of its own section — wrong for the one view built to compare within a class.
- **Producer sends `gap_to_leader: null` for lapped cars** (the issue's interim
  suggestion). Fine as a stopgap (the tower then shows `—`), but as the contract it
  leaves the grouped layout no time to subtract for any car whose class leader is
  lapped.

## Consequences

- Producers implement three fields. A producer that sends only `laps_behind_leader`
  gets a correct inline tower. Its grouped tower falls back to time subtraction (the
  class field is absent, so it is read as 0), which is correct for every car on its
  class lead lap.
- The reference mock producer emits all three and laps at least one backmarker in the
  race phase, so the dev stack shows the case.
- BattleDirector-side work: BattleDirector-AI/battledirector#3570.
