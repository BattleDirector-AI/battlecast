# Decision: the battle box's vintage pass — the raster band, black header blocks, and labels in the display face

**Issues:** #384 (epic #358; foundation #356; model #372) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens, and
the tower's pass (ADR 0027) set the pattern for a widget's own pass. This record covers the
battle box: which parts of each mock it adopts, which it leaves, and how it settles the points
listed on #384. Behaviour: `what/widgets.md` rules 91–92. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`. Both mocks draw a battle box.

## Context

The base look left these battle-box problems, found by rendering `/battle` from the
`race-close-battle` fixture under each preset:

- **The focus name keeps its modern glow.** `BattleBox.svelte` gives the on-camera name
  `text-shadow: 0 0 12px var(--bc-accent-glow)`, which overrides the inherited vintage outline.
  Under `vintage70` that glow is red, the same red as the base look's accent, so the calm
  on-camera name looks like it is in the intensifying state.
- **80s: `CLOSING` is unreadable.** The intensifying title is `--bc-intensity-hot` (`#FF4536`)
  on the Scoreboard red header (`rgba(216, 20, 28, 0.94)`): about 1.5:1. The class chip, a
  class-coloured outline on that red, is weak too.
- **80s: VT323 at 12px.** The battle box's labels (the title, `AHEAD` / `FOCUS` / `BEHIND`,
  `INTENSITY`) are 12px. VT323 draws small for its em: at 12px its capitals are about 6px high
  at 1080p, and the labels are hard to read at 1:1. The mock sets the same labels at 26px.
- **70s: all-italic small type.** Barlow 700 italic at 12px with the base 3-step extrusion read
  well at 1:1. Nothing to fix.
- **70s: one red, several meanings.** The 70s accent (`#E3241B`) and the intensity colour
  (`#FF4536`) are both red.

Geometry is fixed (overlay-config rule 60, with its exception for a box sized to its own text,
#400), and the mocks' battle boxes are laid out
differently from ours (stacked slots, a gap plate per neighbour), so the pass takes their
paint, not their layout.

## Decision

1. **70s focus slot: the rainbow raster.** The 70s mock puts the focus slot on ABC's 1979
   rainbow raster, knocked back with a black layer, under a white name. The battle box does the
   same, with the mock's stripes, dim layer and hard drop shadow. The name loses the accent glow
   and takes the mock's heavy 4-step extrusion. ADR 0026 left the heavy form to large names in a
   widget's own scope; at 24px on a striped fill the extra step is what keeps the white name
   legible on the gold stripe. The tower marks its on-camera row with a red bar (ADR 0027); the
   battle box's focus slot is always the on-camera car, so it does not need that mark, and the
   mock uses the raster here, not the bar.
2. **70s red: a constant mark and a changing one.** The accent red is painted once, as the
   header's 4px rule (the mock's red rule under the title, the same rule the tower draws), and
   it is there in every state. The intensity red is what changes: it appears only when the box is
   intensifying, on the `CLOSING` title text, the pulsing ring and the meter's value and ramp.
   In the calm state the only red is the rule. In the intensifying state the ring and the rule
   meet along the header and `CLOSING` sits on the rule, so the two reds read as one red frame;
   the state is still plain, because the title changes its words and colour, the ring pulses and
   the meter fills. The accent is never text and never the ring. `--bc-live` and `--bc-down` do
   not appear in the battle box.
3. **80s header: black blocks on the Scoreboard red.** The red header is the base look and the
   80s package's signature, so it stays. The title and the class chip each sit on a solid black
   block, as the tower's 80s chips do on the lime row (ADR 0027): `CLOSING` in the intensity
   colour on black is about 6:1. The block is the title's own line box filled black plus a 2px
   spread shadow, so it reaches 2px past the line on every side, stays inside the 39px header
   (the line is 26px tall), and grows no box. The title's colour is unchanged in both states, as rule 60 requires of meaning colours.
4. **80s labels in the display face.** VT323 at 12px is hard to read, and the type size is the
   same in every preset (rule 60), so the labels change face, not size: every label in the box
   (the title, the slot labels, `INTENSITY`, the idle lines and the class chip) is set in Oswald,
   the 80s display face that the names already use, at its modern size, weight, tracking and
   case. Race Control (#396), the weather box (#404) and the lower-thirds (#401) do the same with
   their 80s labels. Oswald's capitals are taller for their em than VT323's, so the labels read
   at 1:1. The numbers (the gaps and the meter's value) stay in VT323, the timing-page face that
   makes the box look like a timing page, at 16px against the labels' 12px, and in brighter
   colours (lime and white, or an intensity colour) than the labels' tan and white: the data
   stays above its labels. The meter's label and value share a baseline in different faces, so
   the meter row is 1px shorter (the box is 198.4px tall, against 199.4px under `modern`); that is
   a box growing or shrinking by its typeface, which rule 60's text-sized exception allows (#400).
5. **80s focus slot: reverse video.** As on the tower's on-camera row (ADR 0027) and in the
   mock, the focus slot fills lime and its text turns dark with no outline or glow. Unlike the
   tower's row, it keeps the mock's hard 3px plate shadow: there is one focus slot, and nothing
   below it for the shadow to spill into.
6. **Meter: segments, square.** Both mocks draw the meter as discrete cells (10 skewed bars in
   the 70s, 12 LED cells in the 80s). The battle box masks its track into the same number of
   segments, skews the 70s track, and squares the corners. The fill's width is the value, as
   under `modern`, so the last lit segment can be lit in part; quantizing the fill would show a
   different value from the number beside it. The ramp colours are meaning colours and stay.
7. **No transition change.** The intensifying pulse is a state signal, not decoration (unlike the
   tower's re-cut shine), so it plays under both presets, and reduced motion still gives the
   steady ring.

## Alternatives rejected

- **A red underline under the 70s focus name**, to match the tower's on-camera bar. It puts the
  accent red next to the intensity red in the one widget about intensity, and the mock does not
  use it here.
- **A black 80s header** in place of the Scoreboard red. It fixes the contrast by dropping the
  preset's most recognisable element from this widget only.
- **Recolouring the 80s `CLOSING` title** (white, or yellow). Rule 60 keeps the intensity
  colour in every preset; the block keeps the colour and makes it readable.
- **Drawing the 80s labels larger** (a larger label size token, or `transform: scale(1.5)`).
  Rule 60 keeps text size the same in every preset, and a scale is drawn text size. A larger
  label in VT323 would also draw the labels bigger than the numbers they label.
- **Oswald for the numbers too.** The VT323 numerals are what makes the box a timing page, and
  at 16px they read.
- **The mocks' layouts** (stacked slots, arrow gap plates). Geometry is fixed by rule 60.

## Consequences

- The battle box is complete under both presets; the lower-thirds still carry their own glow
  (rule 60) until their passes.
- Under `vintage80` the box is 1px shorter than under `modern` (decision 4). This depends on
  rule 60's text-sized exception (#400).
- The 80s class chip in the header is set in Oswald; the tower's 80s chips are still VT323.
- Tests read the vintage rules from the component source, since `happy-dom` applies no CSS, as
  the tower's do.
