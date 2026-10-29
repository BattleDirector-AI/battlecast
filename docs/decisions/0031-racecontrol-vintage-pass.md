# Decision: Race Control's vintage pass — a display face for the 80s labels, and no caution glow

**Issues:** #386 (epic #358; foundation #356) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens, and
the tower's pass (ADR 0027) set the model for a widget's own pass. This record covers Race
Control (`/racecontrol`, the flag / FCY / Safety-Car / sector-yellow strip): which parts of each
mock it adopts, which it leaves, and how it settles the readability points on epic #358.
Behaviour: `what/widgets.md` rules 95–96. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`. Both mocks show a session status bar at the top
centre. In the 70s mock it is the lap count in large gold italic, a red underline bar, and the
flag word coloured in the flag's colour. In the 80s mock it is a red "Scoreboard" parallelogram
with the lap count, joined to a solid green flag panel with dark text.

## Context

Race Control is a small content-sized strip: a 20px flag swatch and a label, plus chips that
appear only under a caution. All of its text is at the label size (12px). It shows no lap count,
which lives in the tower header (rule 20), so most of each mock's status bar has no counterpart
here. The base look, checked in a prototype under both presets on dark and bright backdrops, left
these problems:

- **The FCY chip smears.** It is dark text on solid amber. The inherited preset shadow (the 70s
  black extrusion, the 80s black outline) lands on dark glyphs and fills their counters, so
  `FULL COURSE YELLOW` is unreadable in both presets.
- **VT323 is too small at 12px.** Under `vintage80` every label is VT323, a bitmap face with a
  small cap height. At the strip's 12px label size it is the smallest text on the overlay and
  hard to read. The mock uses VT323 at 32px for its flag panel.
- **A red flag disappears on the 80s strip.** The strip's plate is the `--bc-header` token, the
  Scoreboard red under `vintage80`. A red flag's swatch (`--bc-live`) on that red has almost no
  contrast.
- **The caution glow.** The full-motion caution pulse blooms a soft 24px amber glow around the
  strip. Neither period look has a soft glow anywhere.

The 70s all-italic type reads well at 12px in the prototype (Barlow's heavy italic is the label
face), so it needs no change.

## Decision

1. **70s: the red underline bar becomes a 4px rule along the strip's foot.** It is the mock's
   status-bar rule and matches the tower header's 4px rule (rule 89), so the two read as one
   package. It is drawn as a background layer, not an inset box-shadow, because the caution pulse
   animates the strip's box-shadow and would wipe it. The rule shows under every flag. Under a red
   flag the red rule and the red swatch are side by side, but the rule is the strip's frame on
   every flag and the meaning is carried by the swatch and the words `RED FLAG`, so the two don't
   compete. The strip uses no other red: `--bc-down` and `--bc-intensity-hot` never appear in it,
   and `--bc-live` paints only the red flag's swatch.
2. **70s: the swatch leans; the chips don't.** The skewed swatch echoes the mock's skewed tiles
   and the tower's skewed class chip. The chips stay square, by choice. Their label is the
   italic UI face (Barlow, bundled only in italic), which already leans, and a skewed italic chip
   would lean twice. The tower's construction, an upright label in a skewed chip, would need the
   chips set in upright Barlow Condensed, the preset's display face. That would put two faces
   side by side in a one-line 12px strip, with the chips in a different face from the flag label
   next to them. The tower's chip is a class tile, the mock's skewed number tile; these chips
   are captions, like the flag label, so they keep its face and lean.
3. **Both: the FCY chip's dark text has no shadow.** It is the only dark-on-fill text in the
   strip. Under `vintage70` the chip casts the hard 2px black drop shadow the tower's class chip
   uses, so the solid block still has the period's hard shadow. Under `vintage80` the strip
   already casts the hard plate shadow, so the chip gets none of its own.
4. **80s: the labels are set in Oswald, the preset's display face.** Readable beats faithful.
   Oswald is the 80s mock's own caption face (its status bar's `SCOREBOARD` label and lap count),
   so the strip still comes from the mock. The prototype showed Oswald at 12px reading as clearly
   as the modern face. The size and weight stay, so the strip changes only by its text, which
   `overlay-config.md` rule 60 allows a box sized to its own text.
5. **80s: a black ring round the swatch.** A 2px black ring, like the tower's black blocks under
   its chips (rule 90), separates every swatch from the red plate. A red swatch now shows on the
   red strip, and the other flag colours gain a period hard edge.
6. **Both: no caution glow; the ring keeps its pulse.** The caution state is still marked the
   same way at the same timing: the amber ring pulses under full motion and holds steady under
   reduced motion. Only the soft bloom around the strip is dropped. The pulse carries the
   caution's urgency, so dropping it would change what the strip signals; the bloom is only
   modern polish.
7. **The plate stays.** Both mocks key the status text over the picture. The strip keeps its
   plate, black under `vintage70` and Scoreboard red under `vintage80` (the mock's own bar
   colour), because a 12px label over bright video needs it.
8. **No heavier shadow.** Everything in the strip is label-sized, so the base small-text
   treatment (ADR 0026) is the right one throughout. The strip has no large type for the
   heavier form.

## Alternatives rejected

- **80s: VT323 at a larger size.** A font size is a set length, which rule 60 keeps the same in
  every preset, and the size tokens are shared with every other label.
- **80s: the mock's solid flag panel** (the label on a block of the flag colour). A yellow-flag
  block would sit beside the amber FCY block and the two would merge. The panel would also need
  padding, which is geometry. The ringed swatch keeps the flag's colour as the first thing seen.
- **80s: the mock's parallelogram strip** (`clip-path`). Its slanted ends cut into the swatch at
  the strip's padding and into the caution ring drawn inside the strip's edge. (The mock keeps
  its hard shadow by moving it to a `filter: drop-shadow` on a parent; the swatch and ring
  clipping would remain.)
- **70s: the flag word in the flag's colour, as in the mock.** The swatch already carries the
  colour. A chequered flag has no single colour for its word, and a yellow flag's word would sit
  next to the preset's gold text and read as ordinary type.
- **Hard-cutting the caution** (no pulse under the vintage presets). The pulse is how the strip
  signals a caution, not decoration; see decision 6.

## Consequences

- Race Control is complete under both presets; the remaining widgets follow epic #358.
- The strip's size follows its typeface under each preset, as `overlay-config.md` rule 60 allows
  a box sized to its own text; no set length (padding, gaps, swatch size, font size) changes.
  Under `vintage80` the strip's width follows Oswald and sits closer to `modern` than the base
  look's VT323 did; its height is the same under every preset, since the text's line height is
  a set length inherited from the page. Depends on #399, which adds that exception
  to rule 60.
- Tests read the vintage rules from the component source, since `happy-dom` applies no CSS, and
  render the strip in each theme scope to check that the content is unchanged.
