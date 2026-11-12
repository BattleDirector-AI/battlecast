# Decision: an opt-in setting hides the battle box during a replay

**Issues:** #447 · **Milestone:** 0.17.0
**Status:** Accepted · **Date:** 2026-11-12

What the battle box does while the producer's `mode` is `replay`. Presentation only. No
contract change.

## Context

The battle box treats every `mode` that is not `qualifying`, `practice`, `grid` or `results` as
a racing mode, so `replay` is a racing mode. During a replay the box stays up and shows the
live gaps of the car on camera now, next to the `REPLAY` badge (ADR 0039) and over footage of
an older moment. The owner asked for the box to hide during a replay, as an option.

## Decision

1. **A per-profile setting, off by default.** `widgets.battle.hideDuringReplay` (boolean,
   default `false`). A saved profile shows the same overlay as before. The broadcaster turns
   the setting on in the battle row of `/config`.
2. **A replay hides the box as caution does.** With the setting on, a replay makes the box
   render nothing and count as idle, and it ends a running exit grace at once (ADR 0013). The
   box has no entry or exit animation, so "leaves at once" is its normal exit.
3. **The end of a replay is a fresh start.** The box renders the current snapshot at once: the
   live battle, or the clear-air placeholder with no grace. The battle that was active before
   the replay is not held over the replay.
4. **`mode` is read as the replay badge reads it** (`isReplay`: trim, no case difference), so
   the badge and the hide always agree.

## Alternatives rejected

- **Hide by default, or make `replay` a non-racing mode.** That changes the overlay for every
  existing profile. The owner asked for an option.
- **Let a running exit grace finish during the replay.** The held numbers are older than the
  live ones and belong to no frame of the replay. Caution already ends the grace for the same
  reason.
- **Hold the last battle across the replay and show it after.** Its numbers are stale by the
  time the replay ends.
- **Show the clear-air placeholder during a replay.** It still covers the footage, which is
  what the owner wants to avoid.
- **A list of modes to hide in, or one setting for all widgets.** Only the battle box has this
  need now.

## Consequences

- The battle box's grace and its `/all` auto-hide decision read one more profile value, so the
  grace and the predicate take the setting with the snapshot (see `how/renderer.md`).
- In the `/config` preview the setting has no visible effect, because the preview sample is
  not a replay.
