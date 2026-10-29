# Decision: the weather box's vintage pass — a red rule for the 70s, readable labels on the 80s red bar

**Issues:** #390 (epic #358; foundation #356) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens. This
record covers the weather box's own pass. Neither mock draws a weather readout, so the look is
derived from the period language of the parts they do draw. Behaviour: `what/widgets.md` rules
103–104. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`.

## Context

The weather box is one short row: an `AIR` label and value, a `TRACK` label and value, and the
conditions text. It copies Race Control's header-bar plate and by default sits directly under
it. Its labels are the smallest type it has (`--bc-size-label`, 12px); its values and conditions
are 16px (`--bc-size-gap`). It has no transition (rule 86) and shows no colour that carries
meaning.

Checked in a browser at 1× over dark and bright backgrounds, the base look leaves one real
problem and one missed chance:

- **80s labels.** The base look puts the box on the Scoreboard-red plate, with the labels in
  tan (`--bc-text-3`). Tan on that red is about 2.7:1, and VT323's raster letters are small for
  their font size, so at 12px `AIR` and `TRACK` were hard to read at 1×.
- **70s period mark.** The 70s base look is a plain black box with gold text. The mock's
  recurring mark, a red rule under a block of keyed text, is missing.

## Decision

1. **70s: a red rule along the bottom edge, inside the box.** The mock puts a red bar under the
   tower title, the session status and the lower-third name. The box draws a 4px rule in the
   accent colour along its bottom edge as an inset shadow, like the tower header (ADR 0027). An
   inset shadow takes no layout space, so the box keeps its size. The preset's plate shadow is
   kept in the same `box-shadow` list, so a later custom theme that gives plates a shadow still
   gets one.
2. **70s: numerals warm white, words gold.** In the mock every numeral is warm white and the
   headline words are gold. The temperatures turn warm white and the conditions turn gold, the
   reverse of the base look's colours. Labels keep the base `--bc-text-3`, as the mock's slot
   labels do.
3. **70s red vs the meaning reds.** The issue asks to keep the accent red apart from `--bc-live`,
   `--bc-down` and `--bc-intensity-hot`. The weather box shows none of those meanings, and the
   rule is the only red in it: no text in the box is red. A red bar under a box can't be read as
   "live" or "lost places", so nothing needs changing.
4. **80s: labels white, in the display face.** On the Channel 7 red bar the mock sets its
   labels in white (`status__lbl`), in the condensed caption face. The labels turn CG white
   (`--bc-text-2`) and switch from VT323 to the preset's display face (Oswald,
   `--bc-font-display`), at their usual 12px size and weight. This is the readability fix: white
   on the red is about 4.7:1, and Oswald's capitals at 12px read clearly at 1× where VT323's did
   not. It is the same treatment Race Control's 80s labels get in its own pass (ADR 0031), so
   the two boxes stacked at top centre match. No size changes, so `textScale` (overlay-config
   rule 39) scales the labels as before; the box height was measured equal under all three
   presets. That equal height depends on the box's inherited unitless `line-height: 1.15`: a
   12px Oswald label's line box then sits inside the 16px VT323 value's, but under `normal`
   Oswald's tall ascent and descent (1193/289 per 1000 em) would give the label a content area
   taller than the value and the 80s box would grow about 2px. So the box keeps that
   line-height, and neither the items nor the labels set their own. The box is sized to its
   text, so its width follows the typefaces (overlay-config rule 60).
5. **80s: values stay yellow-green, conditions stay white.** Yellow-green on the red is about
   4:1 and has the black outline. It is the Olivetti face's colour, and it keeps the numbers
   apart from the now-white labels.
6. **No heavier text shadow.** The issue allows the mocks' heavy extrusion or 2px outline on
   large type. The weather box has none: its largest text is 16px, the size the foundation found
   the heavy forms smear. Every part keeps the base small-text shadow or outline.
7. **70s italic at label size stays.** The labels are 12px Barlow italic 700 with wide tracking,
   on a black plate. On black the extrusion doesn't show, so the shadow can't smear them, and
   they read at 1×. The lean is the package's look, so the labels keep it.
8. **No transition change.** The box appears and disappears at once in every preset (rule 86),
   so the period's hard cut is already its behaviour.

## Alternatives rejected

- **80s Channel 7 bar in full:** the slanted `clip-path` ends and the 4px light and dark bevel
  stripes. A `clip-path` also clips the box's hard plate shadow and 1px edge. The bevel would
  have to be opaque stripes drawn over the plate, which `plateAlpha` can't fade, so at a low
  plate opacity two stripes would float with no bar between them.
- **Channel 7 caption yellow (`#FFD21E`) for the 80s values.** It is less readable on the red
  than the preset's yellow-green (about 3.6:1 against 4.0:1), and it isn't a token, so a custom
  theme couldn't change it.
- **Keeping VT323 for the labels and setting them at the value size (`--bc-size-gap`).** It
  also reads, but it changes a type size where a typeface change is enough, and it would leave
  the weather labels unlike Race Control's directly above. Re-declaring `--bc-size-label` in the
  box's scope instead would also hide `/all`'s per-slot `textScale` value.
- **Upper-casing the conditions, as in the mocks' CG text.** Rule 83 shows the producer's
  conditions case kept, and `text-transform` changes what reads on screen, not only the paint.
- **Dropping the plate for the mock's feathered backing.** Weather text over bright sky needs
  the plate, and `plateAlpha` already lets a broadcaster fade it (ADR 0027 decision 4, same
  reasoning).

## Consequences

- The weather box is complete under both presets.
- Tests read the vintage rules from the component source, since `happy-dom` applies no CSS, as
  the tower's do.
