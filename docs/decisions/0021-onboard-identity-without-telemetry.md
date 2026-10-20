# Decision: the on-board HUD's identity strip shows position, an ON BOARD label, and renders without telemetry

**Issues:** #61 (partly shipped in 0.6.0 under #105) · **Milestone:** 0.14.0
**Status:** Accepted · **Date:** 2026-10-19

The on-board HUD's identity strip gains the car's position (`P4`) and an `ON BOARD` label, and
it renders on the on-camera subject alone, whether or not the producer sends live telemetry.

## Context

#61 asked for a persistent "on board" name tag: name, position, class. Most of it shipped in
0.6.0 as the HUD's identity strip (#105): name, number, class, make and model, each toggled by
`driverInfo`. Three things were missing:

- Position was never read, although it is on the same `vehicles[]` entry the strip already uses.
- Nothing said "on board".
- The strip only rode along with telemetry. The HUD as a whole rendered only when
  `subject.telemetry` had content, so a producer that sends a subject but no live inputs got no
  tag at all.

Everything needed is already in `spec/v1` (`subject` plus the resolved vehicle), so there is no
protocol change.

## Decision

1. **No new widget.** The tag is the HUD's existing identity strip, not a separate upper-third.
   A second widget would duplicate the subject resolution, the `driverInfo` toggles, and the #21
   hand-off the strip already has, and a broadcaster can already place the HUD anywhere on `/all`.
2. **Position is a `driverInfo` field, on by default.** It renders as `P` plus the vehicle's
   overall `position`, matching the driver lower-third (#21). Profiles saved before the field
   existed get it on, because it is what the issue asked for and it costs one short chip.
3. **The label belongs to the strip.** It shows only when the strip shows. A label with nothing
   after it, or on a telemetry-only HUD, would name a driver who is not shown.
4. **The strip and the telemetry row render independently.** The HUD renders whichever has
   content, and nothing when neither does. The hand-off with the driver lower-third still holds
   the whole HUD, so the name never shows twice. (Changed for a `persistent` card by the
   amendment below.)
5. **Team name is out of scope.** It needs a new optional protocol field.

The rules are `what/widgets.md` rules 21, 23, 24 and 54–58.

## Consequences

- A producer with no telemetry now gets an on-board tag in `/all` and on `/onboard`.
- Existing profiles show one more item (the position) after upgrade. A broadcaster who does not
  want it unticks "position" in `/config`.
- The HUD still has no "hide when idle" option: an idle HUD draws nothing already.
- With the driver lower-third on `persistent` and `waitForLowerThird` on, the HUD stays held off
  while the subject is valid, as before. That is the existing hand-off, unchanged here. The
  amendment below changes it.

## Amendment (#258)

A `persistent` driver lower-third never wipes out while the subject is valid, so holding the
whole HUD for it hid the telemetry row for the whole session. The hand-off now depends on the
card's trigger mode (`what/widgets.md` rule 24):

- **`persistent`:** only the identity strip is held back, because the card already shows the
  name. The telemetry row keeps rendering. The strip stays held for a degraded subject too,
  since the card shows the name for it; an invalid subject has neither card nor strip.
- **`dwell`:** unchanged. The whole HUD holds for the dwell and reveals when the card wipes out.
  The hold ends when the dwell does, and revealing the strip and the row together keeps the
  reveal one motion.

The hold follows the mode configured now and whether the card is up now, so a change of trigger
mode changes what is held at once. The HUD follows whatever the card is doing; what the card
itself does on a mode change is the lower-third's behaviour (rule 16), not the hand-off's.

Rejected:

- **Holding the whole HUD under `persistent` too** (the old behaviour). The telemetry row carries
  nothing the card shows, so hiding it all session costs the broadcaster the HUD for no gain.
- **Holding only the strip under `dwell` as well.** Nobody asked to change the dwell hand-off,
  and it would split the reveal into two motions.
- **Moving the telemetry row out of the card's way.** battlecast does not lay widgets out
  relative to each other; placement is the broadcaster's.

Consequences:

- Under a `persistent` card, the telemetry row and the card are on screen together. If the
  broadcaster places them in the same spot on `/all`, they overlap. That is accepted: the
  broadcaster places them, and battlecast moves neither.
- Under a `persistent` card with no telemetry, the HUD shows nothing, because the strip is its
  only content and the strip is held.
- Switching `persistent` → `dwell` while the card is up, with no camera cut, leaves the card up
  until the next cut (the trigger engine starts no dwell for an unchanged subject), so the whole
  HUD stays held until then. That card behaviour is tracked in #268.
- The `/config` help copy for `waitForLowerThird` describes what each mode holds.
