# Decision: the standings tower's vintage pass — underline vs reverse video, and a theme switch is a reset

**Issues:** #372 (epic #358; foundation #356) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-25

The theme foundation (ADR 0026) gave every widget a base vintage look through shared tokens. This
record covers the standings tower's own pass: which parts of each mock it adopts, which it
leaves, and how a live preset switch reaches the full-name fit width. Behaviour:
`what/widgets.md` rules 48 and 89–90. Mechanism: `how/renderer.md`.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html`.

## Context

The foundation's base look left three tower problems, found by checking it in the live stack and
listed on epic #358:

- **70s on-camera contrast.** The base look fills the on-camera row with a red bar, and the
  tower colours that row's position numeral in the accent, which is now red. Both the numeral and
  the gold-on-red class chip lose contrast. The 70s mock has no fill at all: the on-camera name
  goes white and a red bar underlines the row.
- **80s personal best.** The lap-time flash colours text (rule 41). Under `vintage80` the
  primary text is yellow-green, so a plain-lap flash (primary text) and a personal-best flash
  (green) look almost the same.
- **The fit width on a theme switch.** A full-name tower measures names in the row-name font,
  and a preset changes that font. Today only a `loadingdone` for the name family re-measures.
  Switching back to a face that is already loaded (vintage70 → modern) fires no event, so the
  tower keeps widths measured in the other face. The measuring font also left out the font
  style, so under `vintage70` names were measured upright and rendered italic.

## Decision

1. **70s on-camera row: underline, no fill.** The red fill is replaced by the mock's red
   underline bar and the name turns white. Every row's position numeral turns warm white, as in
   the mock, so the on-camera numeral no longer takes the accent. This fixes the contrast
   problem by removing what caused it. The red
   now only marks the row with a bar. The red `PIT` chip and the `DQ` chip are text-sized chips,
   so they don't read as the same mark.
2. **80s on-camera row: reverse video.** The Olivetti page marked a line by inverting it. The
   row fills with the lime accent and all its text turns dark with no outline. The class chip
   and the finish chip can't be read on lime (class colours measure 1.5–2.5:1 against it), and
   class colour carries identity (rule 60), so each sits on a black block that recreates the
   plate behind it, as the mock's tiles carry their own ring. The `PIT` chip already has a
   solid red fill with dark text. The mock's hard plate shadow under the row is dropped: in a
   list it spills into the next row, where that row's zebra paints over it unevenly.
3. **80s lap flash: reverse video too, white for a plain lap.** The flash becomes a solid block
   of the flash colour with dark text, so the time reads on the lime row as well as off it. A
   plain lap uses the preset's white, not its yellow-green, which keeps it apart from the green
   personal best. The meaning colours (purple, green) are unchanged, as rule 60 requires; they
   just paint the block instead of the text. The block is a spread shadow with a 1px black ring
   outside it, so a white block still shows on the lime on-camera row, and the column does not
   move.
4. **Plates stay.** Both mocks key text straight over the picture with a feathered backing. The
   tower keeps its plate: the broadcaster's `plateAlpha` already controls it, a 20-row list over
   bright video needs it, and dropping it would make a profile setting do nothing under two
   presets.
5. **Hard cut on the re-cut.** The period look has no shine. Under both vintage presets the
   on-camera highlight moves at once, at either motion setting. This is the transition change
   overlay-config rule 60 allows a widget rule to make.
6. **A theme switch is a reset of the fit width, not a name-font load.** ADR 0026 framed it as a
   name-font load. That re-measures names only and keeps the widest non-name width, but the
   preset also swaps the numeral and label faces, so the non-name width changes too and a kept
   value can be too wide. A reset measures everything from the rows on screen. A render page
   writes the root attribute after the tower has mounted, so the tower watches the document root
   when no ancestor carries the attribute yet, and reads an absent attribute as `modern`. It forgets
   names of cars that have left, which every reset does, and a switch is a deliberate change
   by the broadcaster, like a settings change. The switch is watched on the nearest
   `data-theme` ancestor so the `/config` preview behaves like a render page.
7. **The measuring font carries the font style.** Under `vintage70` names render italic, so they
   are measured italic. A `normal` style is left out of the font string, so modern measurement is
   unchanged.

## Alternatives rejected

- **Keeping the 70s red fill and fixing contrast inside it** (white numeral, outlined chip). It
  departs from the mock, and the fill still competes with the red chips.
- **An 80s PB in a different hue.** Rule 60 keeps meaning colours the same in every preset.
- **Dropping the plate for the mock's feathered backing.** See decision 4. A later option if
  broadcasters ask; the period extras live in #361.
- **Heavier text shadow on names.** The mocks' heavy extrusion and 2px outline smeared at the
  tower's 22px name size in the foundation check. The base small-text treatment stays.
- **A per-theme `loadingdone` wait.** A face that already loaded fires no event, so it never
  arrives. That is the bug being fixed.

## Consequences

- The tower is complete under both presets; the remaining widgets follow epic #358.
- A full-name tower may change width when the preset changes, from the rows on screen.
- Tests read the vintage rules from the component source, since `happy-dom` applies no CSS, and
  drive the theme switch with a per-theme `getComputedStyle` stub.
