# Decision: the info panel's vintage pass — a teal subhead and red rule for the 70s, a red Scoreboard header tag for the 80s

**Issues:** #389 (epic #358; foundation #356) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gives every widget a base vintage look through shared tokens, and
the tower's pass (ADR 0027) is the model for a widget's own pass. This record covers the info
panel's: what it takes from each period, and what it leaves on the base look. Behaviour:
`what/widgets.md` rules 101–102. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`. Neither mock has an info panel. Each look is taken
from the nearest element in its mock: the tower's title block in the 70s mock, and the
lower-third's caption tags and meta line in the 80s one. It also matches what the other widgets
on the same lower-third shell do.

## Context

The panel is a small header (the event: round, name, track, at the 12px label size) over one
rotating line of free text (at the 22px name size). Under the base look it already reads in both
presets. I rendered the base look and a prototype of this pass in headless Chrome, from the live
mock producer:

- **70s:** the all-italic Barlow header and line read clearly at both sizes with the base
  small-text extrusion. The header's pale gold sits close to the line's gold, so the two levels
  run together.
- **80s:** VT323 reads well at the 22px line size. At the 12px header size it is legible but
  small: the face sets small on its body, and with 0.18em tracking the header reads as loose
  pixels more than as a caption. Its tan colour also pulls it away from the period palette. On a
  black plate with white text and lime text, the panel carries no red. That makes it the only
  widget on the lower-third shell without the red Scoreboard mark that the driver and
  qualifying lower-thirds and the race update box share.

## Decision

1. **70s header: the teal subhead.** In the mock, the tower's "CURRENT STANDINGS" subhead is
   teal (`#35D4C8`) under a gold title. The info header is the same kind of line, a small caption
   over the main text, so it takes that teal. The line stays gold. The teal is a literal in the
   panel's scoped style. The takeover slides' pass (ADR 0036) writes the same literal for the
   same subhead, so there are several copies of one palette colour. A shared `vintage70` token
   is the better home. It is left for after both passes merge (#411), so that two PRs don't
   each add it.
2. **70s red rule along the bottom of the panel.** The mock ends every title block with a red
   rule: the tower title, the lap counter, the battle title and the lower-third name. The panel's
   title block is the whole panel, so the rule runs along its bottom edge. Like the tower's
   header rule, it is drawn as a 4px inset shadow, here over the 8px bottom padding. It is
   inside the wiped content, so it wipes in and out with the text.
3. **80s header: a red Scoreboard tag in Oswald.** The 80s mock's lower-third opens with a red
   tag with a white Oswald caption ("ON CAMERA"). The race update box's pass (ADR 0033) gives its
   label the same tag. The info header takes it too:
   - The face is Oswald, in the preset's white with no outline, on a `--bc-header` block that
     hugs the text.
   - The block extends 2px past the text, with a hard black shadow.
   - The block hugs the text as a flex item aligned to the start. Overlay-config rule 60
     allows a tag that hugs its label to paint at the size its text takes. Its cross size stays
     capped at the panel's content width, so a long header is still cut off with an ellipsis.
     The prototype confirmed this: in a 358px panel the header box was 326px wide, against a
     468px text width.
   - The 2px spread fills the 2px gap above the line and leaves the line's glyphs clear.
   - Oswald at 12px is a solid, readable caption where VT323 is not. The line stays VT323
     lime, the Olivetti page's own text.
   - Oswald is one of the preset's two faces, and rule 60 counts a typeface as paint.
   - The line height of 1.15 has no unit, so the header's line box is the same height in
     either face. The prototype measured the panel at 59.09px in every preset, with and without
     the tag, so the 72px slot budget the component documents is untouched.
4. **No heavier shadow.** The issue allows the mock's heavier text shadow on large type. The
   panel's largest type is the 22px line, the tower's name size, where the foundation check found
   the 4-step extrusion and the 2px VT323 outline smeared. The line stays on the base small-text
   treatment.
5. **No motion of its own.** The shell's vintage treatment is widgets rule 107: the bar-wipe is
   unchanged and there is no shine under either preset. The panel adds no transition of its own.
   Its 300ms line crossfade is unchanged.
6. **Plate stays.** As in ADR 0027 decision 4, the panel keeps the shell's plate. Under the base
   look the plate is square and unblurred, and the 80s plate has its hard shadow.
7. **Case kept.** CG pages of both periods were set in capitals, but the panel shows producer
   and broadcaster lines with their case kept (rule 77). Uppercasing the line would change its
   text and its width, so it is not a look change.

## The 70s red

Epic #358 flags that the 70s accent red shares a hue with `--bc-live`, `--bc-down` and
`--bc-intensity-hot`. The info panel draws none of those meanings: it has no live marker,
position change or battle intensity. The red rule is the panel's only red and, like the tower's
header rule, it reads as the period rule, not as a state.

## Alternatives rejected

- **A full-width red header band.** The header box stretches across the panel by default. A fill
  at that width reads as a bar across the whole panel, not as a caption tag.
- **An Oswald header with no tag.** It reads, but it leaves the panel as the one shell widget
  under `vintage80` with no red Scoreboard mark.
- **A larger VT323 header.** Rule 60 fixes geometry, and the 72px slot has about 1px spare at
  the `larger` text preset.
- **The 70s red rule between header and line.** The 2px gap cannot hold it, and widening the gap
  changes geometry.

## Consequences

- The info panel is complete under both presets.
- Under `vintage80`, the header's red block is as wide as its text, so it changes width with
  the event. A long header still ellipsizes at the panel's content width.
- Tests read the themed rules from the component source, since `happy-dom` applies no CSS. They
  reject any theme selector that is not one of the two prescribed spellings, and they pin the
  exact set of themed declarations, so an extra declaration fails.
