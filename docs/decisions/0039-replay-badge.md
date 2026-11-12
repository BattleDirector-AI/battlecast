# Decision: the replay badge reads `mode`, reuses the lower-third reveal, and sits top right

**Issue:** #60 (parity epic #31) · **Milestone:** 0.17.0
**Status:** Proposed · **Date:** 2026-11-11

Behaviour: `what/widgets.md` rules 117–121, `what/overlay-config.md` rules 70–71.
Mechanism: `how/renderer.md`.

## Context

Broadcast TV marks a replay with a small `REPLAY` tag, so viewers do not take old action for live
action. The native rF2 and LMU overlays have no such tag. The owner chose a full widget. It
shows in `/all` and on its own `/replay` route. The broadcaster places it in `/config`. It enters
and leaves with the standard reveal.

## Decisions

1. **The signal is the top-level `mode`, with the value `replay`.** `spec/v1` already lists
   `replay` as an example `mode` value. BattleDirector already sends `mode: "replay"` while a
   replay is on screen. So the contract does not change, and the overlay derives nothing: it
   reads one field (the core principle). The badge compares the value trimmed and with no case
   difference, as other `mode` rules do. Alternative rejected: a new boolean such as
   `session.replay`. It would say the same thing as `mode` and could disagree with it.
2. **The badge reuses the lower-third shell and its skewed bar-wipe.** The skewed bar-wipe is the
   standard entrance and exit for lower-thirds, the race update box and the info panel. Reuse
   gives the badge the same motion, the same reduced-motion behaviour, and the vintage looks of
   rule 107 with no new animation code. Alternative rejected: an instant tag with no motion, as
   the weather box has. A replay starts on a camera cut, which is exactly where the other cards
   wipe.
3. **The default place is the top right corner, under the race update box.** At `x: 1656`,
   `y: 168`, `w: 240`, `h: 56`, it overlaps no other default widget, hidden logos included, and
   its right edge aligns with the update box. The 24px gap under the update box holds the badge's
   handle label in `/config`, so the label overlaps no widget (overlay-config rule 65). TV replay
   tags usually sit in a top corner. The top left holds the tower.
4. **No look of its own under any preset.** The shell already has a defined look under `modern`,
   `vintage70` and `vintage80`. The tag is one word, so there is nothing more to style. A later
   pass can add a period mark, as ADR 0035 did for the weather box.
5. **No idle control.** The badge draws nothing outside a replay. So "Hide when idle" would do
   nothing, as for the weather box.
6. **The `/config` preview always shows the badge.** The preview sample is a race. Without this, the
   broadcaster could not see the badge to place it.

## Consequences

- A producer that never sends `mode: "replay"` never shows the badge. That is correct, not a fault,
  and the editor help says so.
- During a replay, the other widgets keep their behaviour. The battle box stays up, because
  `isRacingMode` counts every `mode` except `qualifying`, `practice`, `grid` and `results` as
  racing, `replay` included. This decision does not change that. Issue #447 covers it.
