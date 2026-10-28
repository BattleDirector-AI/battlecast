# Decision: the race update box's vintage pass — no red text in the 70s, a Scoreboard tag in the 80s

**Issues:** #388 (epic #358; foundation #356) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens. This
record covers the race update box's own pass. Behaviour: `what/widgets.md` rules 99–100.
Mechanism: `how/renderer.md`. The tower's pass (ADR 0027) is the model.

No mock shows a race update box. The design references are the lower-thirds in
`docs/design/vintage/vintage-70s-us.html` and `docs/design/vintage/vintage-80s-f1.html`, the
nearest graphic in each: a card that comes up over the picture with a name and a line or two
about it.

## Context

Checked in a prototype of the box under each preset at 1920×1080 scale, the base look leaves
three problems:

- **70s red on a number.** The box colours the value (the lap time or the penalty) in the
  accent colour. Under `vintage70` that is the ABC red, so a fastest lap reads as a red number.
  Red already means something elsewhere (`--bc-live`, `--bc-down`, `--bc-intensity-hot`), and a
  red lap time looks like a loss.
- **80s small type.** The label and the detail are 12px UI text. Under `vintage80` the UI face is
  VT323, a raster face that draws much smaller than its nominal size. At 1× the label (`GT3
  FASTEST LAP`, pale tan) is close to unreadable, and the detail is small and thin.
- **A glow on the accent bar.** The bar at the card's left edge sets its own glow, so it keeps a
  soft red or lime halo that the period look does not have.

The 70s italic was checked at the same sizes and reads well: the label is bold and tracked, and
Barlow keeps its shapes when it leans.

## Decision

1. **70s: the value is warm white, and red only draws the bar.** The lap time or penalty takes
   the preset's warm white (`--bc-text-2`), as the tower's position numerals do (ADR 0027). The
   only red in the box is the accent bar, a mark beside the text and never the colour of a
   word, so no part of the box can be read as live, a loss or a hot battle.
2. **80s: the label is a Scoreboard tag.** The 80s lower-third mock tops the name with a tag: a
   block of the Scoreboard header red with white display-face text and a hard black shadow
   (`ON CAMERA`). The label takes that form. Its text moves from VT323 to the display face
   (Oswald) in the preset's white on the header red, which fixes the readability problem and
   follows the mock. The label's box narrows to its text so the block hugs it, which is the
   text-sized-box exception of `overlay-config.md` rule 60 (a tag that hugs its label); no line
   moves and the card keeps its size. The block extends 2px past the label's line as a spread
   shadow. The red is the preset's header chrome (`--bc-header`), the colour of the
   tower's header in this preset, and every event type gets the same tag. It does not mark one
   kind of event, so it carries no meaning to confuse with live or a loss.
3. **80s: the detail is in the display face too.** The mock's line under the name is Oswald, not
   VT323. The detail keeps its colour and outline. VT323 stays on the value, a timing number,
   which is where the mock uses it.
4. **Both: the bar is flat and square, with a hard black drop shadow.** Its own glow goes, its
   corners square off as the plate's already do, and it takes a hard 2px black shadow, as the
   mock's red rule does. On the default plate the shadow barely shows, but `plateAlpha` can
   make the plate clear inside `/all`, and then the bar is keyed straight over the picture as
   in the mocks.
5. **No heavier text shadow.** The box sits on a near-opaque black plate by default, where the
   mocks' heavy extrusion and 2px outline add nothing you can see. At the box's 24px name they
   smear, as they did on the tower. The base small-text treatment stays on every line.
6. **The plate and its reveal belong to the shared shell.** The card renders inside the
   lower-thirds' shell (`LowerThirdShell.svelte`), which owns the plate, its frame, the bar-wipe
   and the shine. The box gives them no preset treatment of its own, so under each preset they
   look as they do on the lower-thirds. The lower-thirds' own pass decides that look
   (`what/widgets.md` rule 107: no shine sweep under either preset, and the wipe unchanged), and the
   box adds no transition change of its own.

## Alternatives rejected

- **A red value kept, with an outline to set it apart.** It is still a red number, and the
  meaning problem is about hue, not contrast.
- **A gold value (the preset's primary text).** Gold is the 70s name colour in the tower.
  Warm white keeps the value apart from the label's pale gold and matches the tower's numerals.
- **A bigger label size under `vintage80`.** It makes the card taller, and a preset changes no
  geometry (`overlay-config.md` rule 60). A change of face, with no change of size, is paint.
- **The label in Oswald without the tag.** It reads, but plain tan Oswald at 12px is weak on
  the plate, and the tag is the mock's own way of heading a lower-third.
- **The label tag in lime reverse video, as the tower's on-camera row.** In the tower, reverse
  video marks one row among many. The box has one card, and a lime tag next to a lime value
  would blur the two.
- **Restyling the shell for the box alone.** The plate is shared on purpose (rule 74). A box
  that looked different from the lower-thirds under the same preset would read as a different
  package.

## Consequences

- The race update box is complete under both presets with the shared shell's rule 107.
- Tests read the vintage rules from the component source, since `happy-dom` applies no CSS, as
  the tower's do.
