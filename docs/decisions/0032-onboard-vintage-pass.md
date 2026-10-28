# Decision: the on-board HUD's vintage pass — an underlined plate, reverse-video tags, segmented bars

**Issues:** #387, #403 (epic #358; foundation #356, tower model #372) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27 · Depends on #400 (overlay-config rule 60's second
exception: a box sized to its own text).

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens; the
tower's pass (ADR 0027) set the pattern for a widget's own pass. This record covers the on-board
HUD (`/onboard`): what each preset changes, and why. Behaviour: `what/widgets.md` rules 97–98.
Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`. Neither mock draws an on-board HUD, so the look is
taken from the parts that play the same role: each mock's on-camera lower-third (a name with a
tag and a position) and its battle box intensity meter (a segmented bar).

## Context

Rendering the HUD under the base look, with every identity field on and a live feed, showed:

- **80s: a red HUD.** The HUD's plate paints `--bc-header`, the header-bar token, and the 80s
  base look makes that the Scoreboard red. The whole HUD turned red. On it, the `ON BOARD` label
  (`--bc-live`), the brake fill (`--bc-live`) and a GTP class chip all lost their colour into the
  plate.
- **80s: an unreadable car number.** The number tile is lime with dark text, and the base
  outline draws black round the dark glyphs, which closes them into a blob.
- **70s: an unreadable car number.** Same cause on the red tile: dark text with a black
  extrusion on red.
- **70s: four reds.** The label and the brake are the live red, the number tile and the gear
  numeral the accent red. Issue #387 asks that the accent and `--bc-live` keep distinct meanings.
- **70s: `THROTTLE` runs into its bar (#403).** Barlow italic at the label size and tracking
  is wider than the 64px label column: the text ends at 72.75px, and the track starts at 72px.
- **Small type.** The labels are 12px: VT323 under `vintage80`, italic Barlow under `vintage70`.

## Decision

1. **70s: the plate is underlined.** The red rule under the on-camera name is the 1979 package's
   signature (the mock's lower-third, and the tower's on-camera row, rule 89). The whole HUD is
   the on-camera driver, so the rule runs along the bottom of the plate, inside its bottom
   padding, in every layout of rule 56: strip only, row only, or both. A rule under the
   identity strip only would vanish when the strip is held off or empty, and has no padding to
   sit in when the strip is alone.
2. **70s: the accent is the on-camera mark, the live red is a label and a fill.** The gear
   numeral leaves the accent for the speed's gold, so the accent marks only the car number tile
   and the plate rule. The `ON BOARD` label and the brake fill keep `--bc-live`, as overlay-config
   rule 60 keeps meaning colours. What separates them is shape, as in the tower (ADR 0027,
   decision 1): the accent is a tile and a full-width rule; the live red is a word and a fill
   inside a track.
3. **70s: skewed tiles with upright type in a face that has an upright cut.** The number tile
   and the class chip lean 8° with a hard drop shadow, like the mock's car-number tiles and the
   tower's class chip, and their type is upright, so the skew alone gives the lean. An upright
   style only renders upright when the face has an upright cut, and Barlow (`--bc-font-ui`, the
   chip's face) is bundled italic only, so `font-style: normal` alone would still render it
   italic and the chip would lean twice. The chip label therefore takes the preset's display
   face, Barlow Condensed, which is bundled upright at the chip's weight (700). The number tile
   is already in `--bc-font-mono`, also Barlow Condensed. Its numeral is white with no shadow;
   white on the accent red measures about 4.6:1. The mock counter-skews the tile's text instead,
   which needs an extra transform on the label for the same result. The tower's chip has the
   same italic-only defect in shipped code; that is its own issue.
4. **70s: the bar and readout labels in Barlow Condensed (#403).** A typeface is paint under
   rule 60, and the label column is fixed, so changing the face moves nothing. `THROTTLE` in
   Barlow Condensed italic 700, at the same size and tracking, measures 60.2px and fits its 64px
   column. The readout labels (`KM/H`, `GEAR`) take the same face so the row's labels match. All
   of them stay italic, as the package leans.
5. **80s: black plate, not the header colour.** The HUD uses the black widget plate token,
   `--bc-plate`. A literal black would ignore the widget's `plateAlpha`: `AllView` rescales the
   plate tokens per slot, and `--bc-plate` is one of them. The Scoreboard red is a header colour;
   the HUD has no header. The two tokens differ in opacity: `--bc-plate` is the widget's
   `plateAlpha` itself (0.82 by default), while `--bc-header`, which `modern` and `vintage70`
   paint, is `0.94 × plateAlpha / 0.82` (0.94 by default). So the 80s HUD is about 12 points
   more see-through at every setting. That is accepted: the 80s type carries its own black
   outline, `--bc-plate` is the widget plate the other widgets' panels paint, and a broadcaster
   who wants it denser raises `plateAlpha`.
6. **80s: the identity starts with the mock's tags.** The mock's on-camera lower-third opens with
   an `ON CAMERA` tag in the Scoreboard header red (`#D8141C`) with white text, butted against a
   white `P5` tile. The HUD's label is not a header: its colour is the live colour, a meaning
   colour that rule 60 keeps in every preset. So the label becomes a block of `--bc-live`, not
   the header red, and its position a white block, each 4px past its text, so with the strip's
   8px gap they meet edge to edge. Both take dark text: white on `--bc-live` measures about
   3:1, under what 12px type needs, and dark measures about 5.8:1. (The mock's white on
   `#D8141C` measures about 5.2:1, but that red is not the live colour.) Readable beats faithful.
   The blocks are drawn with a spread shadow, as the tower's lap flash is, so no item grows or
   moves.
7. **80s: reverse video means no outline.** The car number tile and both tags drop the text
   outline; it is what closed the dark glyphs up.
8. **80s: the name is the preset's yellow-green.** The mock's lower-third name is a separate
   caption yellow, `#FFD21E`, which no preset token carries. The HUD takes the nearest preset
   colour, the yellow-green text colour, rather than adding a token for one name; the base look
   left it the CG white of `--bc-oncam-text`.
9. **Segmented bars in both presets.** Both mocks draw their one bar, the intensity meter, as
   segments: leaning 14° under the 70s (`skewX(-14deg)`), square blocks under the 80s. The
   throttle and brake tracks are cut the same way with a mask over the track: 10px segments with
   3px gaps on a `104deg` gradient (a 14° lean) under the 70s, 10px blocks with 2px gaps under
   the 80s. The fill still moves continuously and reads the same value; only its edge shows in
   steps. The fill colours stay, since throttle green and brake red carry meaning. The mask is
   declared prefixed and unprefixed: older OBS builds embed a Chromium that knows only
   `-webkit-mask-image`.
10. **Motion is unchanged.** The HUD has no entrance, exit or shine; its one motion is the bars'
    per-tick smoothing, which is data presentation like the tower's row reorder, which the tower
    kept. Rule 60's "transitions are the same" therefore holds without an exception.
11. **Small type stays as the base look sets it.** At the HUD's 12px, VT323 renders as crisp
    pixel capitals and the italic labels stay legible, checked at 1× in headless Chromium. A
    larger label size is a size change rule 60 forbids, so there was no size lever to pull and
    none was needed.
12. **No heavier shadow on large type.** The HUD's largest text, the 22px name and the 23px
    speed and gear, are the tower's name size, where the mocks' heavy extrusion and 2px outline
    smeared (ADR 0027). The base small-text treatment stays.
13. **No personal-best treatment.** The HUD shows no lap time, so the 80s personal-best flash
    question (ADR 0027, decision 3) does not arise here. The one green it shows is the throttle
    fill, `--bc-intensity-calm`, a blue-green well apart from the yellow-green text.

## Alternatives rejected

- **Keeping the 80s red plate and recolouring what sits on it.** The label, brake and class
  colours carry meaning and cannot move (rule 60); the plate can.
- **The header red and white text on the 80s label, as in the mock.** The label's colour is the
  live colour, which stays; white on that is about 3:1 at 12px.
- **Removing the 70s red from the label and the brake.** Both are meaning colours.
- **Dropping the skew from the 70s chip** to avoid the italic-only face. It loses the mock's
  skewed tiles and departs from the tower's chip.
- **Hard-snapping the bars under vintage.** A 10 Hz feed would make the bar jump; the smoothing
  is how the HUD shows a value between ticks, not an effect.
- **A rule under the identity strip.** See decision 1.
- **Re-tuning the label size per preset.** A size change (rule 60).

## Consequences

- The HUD is complete under both presets, and #403 is fixed by decision 4.
- Boxes in the HUD sized to their text, the plate and the chip included, follow rule 60's second
  exception (#400).
- Tests read the vintage rules from the component source (`OnBoardHud.vintage.test.js`), since
  `happy-dom` applies no CSS. They pin the complete themed declaration set per preset, check
  that the chip label's face has a bundled upright cut, and render the HUD from a fixture under
  each preset to check the content is the same.
