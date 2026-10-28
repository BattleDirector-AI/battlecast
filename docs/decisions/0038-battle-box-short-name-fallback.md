# Decision: a battle box name too wide for its slot shows its short form

**Issues:** #413 · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-28

The battle box shows three names, ahead, focus (the on-camera car) and behind, each in its own
slot of a fixed-width box (`what/widgets.md` rules 65, 68). Behaviour: `what/widgets.md` rule 108.
Mechanism: `how/renderer.md`, "Battle box short-name fallback".

## Context

The focus name was `white-space: nowrap` with nothing else to hold it, so a long on-camera name
grew past its slot and painted over both neighbours, under every preset. Under `vintage80` the
part outside the lime focus block was dark on black and vanished. The neighbour names were already
cut with an ellipsis, which also clipped their inherited preset text shadow to the name's box.

A first draft of rule 108 cut every name with an ellipsis. Review (#421, F1) found that the
`overflow: hidden` an ellipsis needs clips the on-camera name's glow and the 70s extrusion even on
short names. It also found that the cut eats the surname, the most identifying part, since the
full form is `F. Surname` (rule 48): `M. Alexander Feath…`.

## Decision

The owner's decision (in chat, 2026-10-28): "use our abbreviation scheme 'T. VAN' for both
names". Read as: every name in the box, the on-camera one and its neighbours, falls back to the
tower's short form (rule 47, `E.JAC`, `N.DEV`) when its full form does not fit its slot.

1. **Full form when it fits, short form when not.** Each slot decides for itself, and decides
   again when its name, its width or the full form's rendered width changes.
2. **Nothing is cut.** No ellipsis and no clip, so every glow, extrusion and outline is drawn in
   full. A short form is five glyphs at most (`E.JAC`), longer only when a kept letter
   uppercases to two (`ß` → `SS`, rule 47's `Jan Aßmann` → `J.ASSM`), short enough for every slot
   of the default 440px box.
3. **The box does not change.** Its width and its three tracks stay as they are; only the text
   inside a slot changes.

## Alternatives rejected

- **Cut with an ellipsis.** CSS only, but it needs `overflow: hidden`, which clips the name's
  glow and extrusion, and it loses the surname on exactly the names that are long.
- **Grow the box to fit**, as the info panel's header does (#414, ADR 0037). The name changes on
  every camera cut, so the box would change width on air with the subject; in `/all` it would need
  anchor and canvas-edge rules like ADR 0037's, and it would move the composition.
- **Widen the focus track inside the fixed box.** The neighbours would lose width and be cut or
  shortened more, and the slot widths would depend on the names.
- **Shrink the font to fit.** Needs the same measuring, and the on-camera name's size would vary
  from car to car, which reads as a different style per driver.
- **Drop the initial (surname only).** Needs a second long form beside rule 48's, and a long
  surname alone can still overflow, so it needs a fallback of its own.

## Consequences

- The short form's spacing follows rule 47 (`T.VAN`, no space), not the owner's `T. VAN` as
  typed: rule 47 is "our abbreviation scheme", and one short form across the overlay is the point.
- The choice depends on the rendered width, so it is measured in the browser, not computed from
  the string. A hidden measuring element always holds the full form, so the visible element
  switching forms never changes what is measured. Only a real browser confirms the widths; unit
  tests stub them.
- `fmtShortName` (`design/format.js`) is no longer the tower's alone.
- A slot set so narrow that even the short form does not fit (a very small battle `w` in `/all`)
  shows the short form across the slot's edge rather than cutting it.
