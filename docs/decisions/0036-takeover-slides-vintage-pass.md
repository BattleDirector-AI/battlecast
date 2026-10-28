# Decision: the takeover slides' vintage pass — a black board, and a look derived from the lists

**Issues:** #391 (epic #358; foundation #356; tower model #372) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-27

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens. This
record covers the pass for the two full-screen takeover slides, `/grid` and `/results`. One rule
per preset covers both, because the two slides share their board, header, group header and
numeral styling. Behaviour: `what/widgets.md` rules 105–106. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`.

## Context

- **No mock covers a takeover slide.** Both mocks show overlays keyed over video. The nearest
  thing on either is the standings list, so the slides take their list treatment from it and
  from the tower pass (ADR 0027).
- **The base look leaves a modern board.** A slide paints `--bc-board`, the slate studio
  background, which no preset overrides. Under both vintage presets the period text then sits
  on a modern slate.
- **The slides carry no state colour.** Neither slide has an on-camera row, a lap-time flash, a
  live mark, a position change or a battle intensity. The issue's question about the 70s red
  clashing with `--bc-live`, `--bc-down` and `--bc-intensity-hot` therefore has one risk only:
  red used as decoration where a viewer might read a meaning into it.
- **Type sizes.** The largest text on either slide is 22px (the title, names and position
  numerals). Labels are 12px and class chips 11px. A slide may not change a font size or face
  (overlay-config rule 60), so readability can only come from colour and shadow.

## Decision

1. **A black board under both presets.** The 1979 character generator keyed onto black, and the
   Olivetti timing page was black. The slide paints `--bc-plate-solid`, which both presets
   already define as `#000`, so the board comes from a token and no hex is added.
2. **70s header: the red underline bar.** The mock's standings block has a red bar under its
   heading. The slide's header gets the same 4px rule the tower header got (rule 89), drawn as an
   inset shadow so the header is no taller.
3. **70s subheads in the mock's teal.** The mock sets its subhead ("CURRENT STANDINGS") in teal.
   The slides' subheads are the group car count and the results column heads. They take
   `#35D4C8`, the mock's value (`--bc-teal` there). This is a fidelity choice, not a readability
   one: teal on black measures 11.4:1, a little below the 70s tertiary text's 14.35:1, and is
   still well readable at 12px italic. The value is a literal in each component for now. The
   info panel pass (#402) writes the same literal, and two PRs adding the same token would
   conflict, so a shared token replaces the literals in follow-up #411 once both have merged.
4. **Position numerals in the preset's white, both presets.** Both mocks set positions in white
   and names in the period colour. The tower pass did the same for 70s.
5. **70s class chips lean, as the tower's do.** The same skew, drop shadow and upright label as
   rule 89, so a class chip looks the same on the tower and on the slides.
6. **80s title on a Scoreboard plate.** The 80s mock's heading device is the red Scoreboard bar,
   and `--bc-header` is already that red under `vintage80`. The title gets a block in that red,
   made from a background plus a 6px spread shadow so no box changes size. The token is 94%
   opaque, so over the black board it renders `#CB131A`. On it the title is the preset's white,
   as the mock's Scoreboard label is: white measures 5.16:1 there, where the base lime measures
   4.39:1 and misses 4.5:1 at the title's 22px. The 6px spread stays clear of the filter chip,
   which sits 12px away. The plate has no hard black shadow, because a black shadow on a black
   board shows nothing.
7. **80s subheads in white.** The base tertiary text is tan, 10.9:1 on black. VT323's one-pixel
   strokes thin out at 12px, so the subheads take the preset's white (18.8:1), as the mock's
   "RACE · LAP 38" line does.
8. **No heavier shadow on either preset.** Nothing on the slides is large: the biggest type is
   22px, the size where ADR 0027 found the mocks' heavy extrusion and 2px outline smearing. Every
   text keeps the base small-text treatment.
9. **Red is the header rule only, under 70s.** No other element takes the accent, so red on a
   slide never means a state. The 80s plate is the header red, not the accent, and the 80s accent
   is lime.

## Alternatives rejected

- **Keeping the slate board.** It is the one modern element left on a fully period slide.
- **Overriding `--bc-board` in the preset token blocks.** That is the shared foundation's file
  and changes every consumer of the token. The slides are its only users today, but a scoped
  rule in the slide keeps the pass in its own files.
- **Larger titles to earn the heavier shadow.** A font size is geometry under rule 60.
- **The 70s rainbow stripe or the 80s yellow gap plates.** Both mark a single subject (the
  on-camera driver, a gap). A slide has no single subject, so the device would mean nothing.
- **Filled class tiles like the mocks' car-number tiles.** The tower kept its outlined chips, so
  the slides do too. Class colour still carries identity in every preset (rule 60).
- **A skewed 80s Scoreboard plate.** Skewing the title would slant the upright Oswald text, and
  the Olivetti page was upright.

## Consequences

- Both slides are complete under both presets.
- Tests read the vintage rules from each component's source, since `happy-dom` applies no CSS.
  The themed CSS is a closed set: every selector naming `data-theme` uses the exact quoted
  ancestor scope, each preset's declarations equal the list its rule names, and every selector
  names an element the slide renders.
- The 70s teal is a literal until #411 makes it a shared token.
