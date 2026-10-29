# Decision: the lower-thirds' vintage pass — a caption face for 80s labels, and block flashes

**Issues:** #385 (epic #358; foundation #356) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens, and
the tower's pass (ADR 0027) set the pattern for a widget's own pass. This record covers both
subject-driven lower-thirds, the driver card (#21) and the qualifying card (#22), which share a
shell and a layout: which parts of each mock they adopt, and how they settle the points epic #358
left for this pass. Behaviour: `what/widgets.md` rules 93–94. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`. Both mocks show a driver lower-third; neither shows a
timing card, so #22 takes the same treatment as #21 wherever the two share an element.

## Context

Checking the base look on both cards over a dark and a bright scene, at 1920×1080, found:

- **80s small labels.** VT323 at the cards' 12px label size, with 0.18em tracking, is hard to
  read (`ON CAMERA`, `TIMING`, `BEST`, `S1`). The timing values (VT323 at 16px) and the position
  (22px) read well.
- **70s small type.** The all-italic package with the 3-step extrusion reads well at 12px, on
  dark and bright video alike.
- **Own glow.** #21's name and #22's `BEST` time set `text-shadow: 0 0 12px
  var(--bc-accent-glow)`, which overrides the preset's inherited shadow, so under the presets they
  carry a red or lime haze instead of the period extrusion or outline. Both accent bars glow too.
  #22's name sets no shadow and already takes the base treatment.
- **70s red.** The accent is the ABC red, so the position `P4` turns red, and #22's class-best
  flash (its accent bar and label in `--bc-intensity-hot`, a warm red) looks almost the same as a
  plain card's red accent bar.
- **80s green.** #22 colours a delta ahead of target in `--bc-up` green. Under `vintage80` every
  value is yellow-green, so an ahead delta and a behind delta are hard to tell apart: the same
  problem ADR 0027 settled for the tower's personal-best flash.

## Decision

1. **80s labels use the caption face.** Every label on both cards renders in the preset's
   display face, Oswald, at its `modern` size, weight and tracking. The 80s mock sets the
   lower-third's `ON CAMERA` tag and its caption lines in Oswald, so this is the mock's own
   choice for a lower-third. The font size, weight and tracking stay, but the face is larger
   than VT323 at the same size, so each label's box grows (`TARGET` at 12px is about 49×17 in
   Oswald against 42×12 in VT323, and 58×19 in modern Saira) and #22's card, which stacks a label
   over a value in every cell, is about 5px taller than the base look makes it, still shorter
   than under `modern`. That is overlay-config rule 60's text-sized box: a box sized to its own
   text paints at the size its text takes in the preset's typeface, while every set length stays.
   Values stay in VT323: the timing page is the raster face, and at 16px and above it reads. The
   bundled Oswald covers Latin only, so the `Δ` label renders in the family's next available face
   (Arial Narrow where it is installed, else the generic sans-serif).
2. **70s small type is unchanged.** Labels and values keep the italic type and the base
   extrusion. They read at their sizes, so nothing is changed for its own sake.
3. **The heavy shadow goes on #21's name only.** #21's name is 24px and the card's headline. The
   mock's heavy treatment (the 4-step extrusion for the 70s, the 2px outline for the 80s) holds at
   that size in Barlow Condensed and Oswald, and replaces the glow. #22's name is 17px and sits in
   a line of labels and chips, so it keeps the base treatment, as the tower's 22px names do (ADR
   0027). #22's `BEST` time loses its glow for the base treatment.
4. **70s: the mock's red bar under the card.** A 4px accent rule runs along the card's bottom
   edge as an inset shadow, as the tower's header and on-camera row draw theirs. The accent bar on
   the left stays (it marks the on-camera driver in every preset) but loses its glow for a hard
   drop shadow, and turns square. The 70s name turns gold, as the mock's lower-third keys it; the
   tower's white on-camera name marks one row among many, which a lower-third does not need.
5. **70s: the position is warm white,** as the tower's numerals are under rule 89. A red `P4`
   next to a red bar reads as a second mark, and red text also means a loss of position or live.
6. **The class-best label is a block of the flash colour, under both presets.** The flash keeps
   its colour (rule 60), and a block is a shape no plain card has, so a flash cannot be read as a
   plain card even where the hues are close (the 70s accent red and the flash's warm red). It is
   the reverse-video treatment the tower's 80s lap flash uses. The flash's accent bar keeps the
   flash colour too.
7. **80s: the ahead delta is a green block.** As the tower's personal best: the meaning colour is
   unchanged and paints a block instead of text, with dark text and a black ring, so it reads
   against the yellow-green of every other value. A behind delta is an ordinary value.
8. **80s: `ON CAMERA` is the mock's red tag.** CG white on the header red, with the mock's hard
   drop shadow. The block and its shadow are spread shadows, so no box changes size, and the
   label keeps its place in the line. #22's `TIMING` label is not a tag: a red tag there would sit
   beside the flash's red `CLASS BEST` block and blur the one cue that marks the flash.
9. **Plates stay.** Both mocks key the lower-third straight over the picture with a feathered
   backing (the 70s mock over a rainbow raster). The cards keep the shared shell's plate: the
   shell is shared with the race update box and the info panel, the broadcaster's plate setting
   would do nothing under two presets, and a timing card over bright video needs it.
10. **The shell is not this pass's.** The cards' plate and their skewed bar-wipe belong to the
    shared shell, which the race update box, the info panel and the logo rotation also use. The
    plate is the shell's base-look plate (decision 9); its motion is `what/widgets.md` rule 107:
    the wipe plays unchanged and the shine bar does not render. The cards' own rules only point at
    these, and style nothing inside the shell, so no dwell or hand-off timing moves.
11. **The class chip is the base chip.** The tower skews its 70s chip; the lower-thirds' compact
    chip is the shared `ClassChip`, and a lean there would reach every widget that uses it.

## Alternatives rejected

- **Dropping the shine from each widget's own style.** The bar belongs to the shell; reaching
  into it from each widget would give the shell's users several copies of one rule.
- **Larger 80s labels.** A bigger `font-size` changes a set length, which rule 60 keeps; a face
  change only resizes boxes that size to their text.
- **Dropping the 70s left accent bar for the underline alone.** The bar's 4px still takes its
  place in the row, so the card would gain an empty indent; and the bar is the on-camera mark in
  every preset.
- **A different hue for the 70s flash.** Rule 60 keeps meaning colours the same in every preset.
- **The mock's car-number line (`25-Danny Okada`).** It is content: the cards show what they show
  under `modern`.
- **The heavy shadow on every name.** #22's 17px name smears with it, as the tower's names did.

## Consequences

- Both lower-thirds are complete under both presets.
- The cards' motion under the presets follows the shell's rule (107), not this record.
- Tests read the vintage rules from each component's source, since `happy-dom` applies no CSS, as
  the tower's do (ADR 0027).
