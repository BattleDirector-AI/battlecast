# Decision: tower table columns, and a 400px default tower

**Issues:** #248 (from #244's Chromium check, after #225) · **Milestone:** 0.14.0
**Status:** Accepted · **Date:** 2026-10-19

The standings tower's cells line up as table columns shared by every row, the short-style
name loses its fixed floor, and the default tower is 400px wide instead of 380px.

## Context

Measured in headless Chromium (#248 comment), standalone tower, ×1.00, default metrics
(interval on), a field with nine class names:

| tower | GTP | LMP2 | GT3 | GT4 | TCR | LMGT3 | GTE-AM | HYPERCAR | LMGT3 PRO-AM |
|---|---|---|---|---|---|---|---|---|---|
| 380, today | +2.2 | −5.5 | −2.2 | −2.6 | −1.9 | −16.2 | −21.5 | −35.0 | −45.8 |
| 400, today | +22.2 | +14.5 | +17.8 | +17.4 | +18.1 | +3.8 | −1.5 | −15.0 | −25.8 |

The figures are px of slack at the row's right edge; negative means the interval's last digits
are clipped. With a finish slot reserved, the 400px row ranges from +23.5 (GT3) down to
−21.5 (PRO-AM).

Two causes:
- **The name floor.** The short-style name cell kept a 4em (88px) minimum, while a short code
  needs about 44 to 53px.
- **Per-row sizing.** Each row sized its own chip and badge, so one long class name pushed
  that row's later cells out of line with every other row.

## Decision

1. **Table columns** (`widgets.md` rules 49–53). Every row has one cell per column, with empty
   cells where a car has nothing to show. Each column is as wide as its widest entry in the
   **whole class-filtered field**, rendered or not, and that width is shared by every row and,
   in the grouped layout, by every group. The name column takes the leftover width and has no
   floor beyond the widest name it holds. A class chip is capped at 72px and cut at the end
   with an ellipsis.
2. **Built with CSS grid subgrid**, not measured: the rows list (or, grouped, the groups
   container) is one grid whose track list (`max-content` per column,
   `minmax(max-content, 1fr)` for the name) is set inline. Each row is a subgrid of it. The
   cars that cycling or `maxRows` leave off screen are present as zero-height, invisible
   **sizer rows**, so their content sizes the tracks (`how/renderer.md`).
3. **A 400px default tower**: the default `w`, the standalone `--bc-tower-width`, and the
   battle box moved to `x: 448` to keep its 24px gap (`overlay-config.md` rule 44).

## Why the whole field, and why no grow-only

Sizing columns to the rows on screen would move every column on a page turn or a camera cut,
which is the problem rule 48 solved for full names. Sizing to the whole class-filtered field
removes that. Rule 48 also needed **grow-only**, because the row content it measured changes
every snapshot (cell values, the bold highlight). Here the cells whose values change all the
time, the gap and the interval, already have fixed widths (rules 42a, 42b). The rest are
stable for a car: position, class, class rank, short name. So the columns follow the current
field, with no memory and no resets of their own. A column narrows only when the field's
widest entry leaves or changes, for example the only HYPERCAR car being removed from the
feed. CSS tracks have no memory, so grow-only would have meant measuring in JS. That
narrowing is rare enough not to need it.

In full name style rule 48 still decides the tower's width, grow-only as before. The name
track's `max-content` already covers the widest full name in the field, and rule 48's minimum
width keeps the tower wide enough for it and the other columns.

## Why subgrid

Shared tracks are exactly what a table needs, with no measuring and no feedback loop between
measured widths and layout. The alternatives:

- **Measure each column in JS and set px tracks.** This works in any engine and could be
  grow-only. But it measures cells that are themselves laid out in the tracks being measured,
  needs canvas text measurement for every off-screen cell type, and duplicates what the
  layout engine already computes.
- **CSS tables (`display: table`).** These share columns in every engine, but they cannot span
  a group header across the columns, so the grouped layout could not share columns across
  groups.
- **`display: contents` rows.** The cells join one grid, but the row box disappears, along
  with its background, zebra stripe, divider and on-camera highlight.

`subgrid` needs Chromium 117 or later: OBS 31's CEF has it and OBS 30's CEF 103 does not.
Where it is unsupported, the rows fall back to their own flex layout (every cell still
renders, just not aligned), rather than breaking. That is an accepted cost: alignment is a
quality improvement, and nothing becomes unreadable on the older engine.

## The 400px default

At 400px, with a short-name column that is no wider than its codes, every class up to LMGT3
fits with room to spare. Longer producer class names are capped at 72px. Under table
columns, a field that contains one widens the class column for every row, so a field with
HYPERCAR or PRO-AM can still clip at the right edge at 400px. That is visible, and the
broadcaster can fix it by widening the tower. A larger default (460px was measured) would
fit those too, but it costs canvas width for every broadcaster to cover names most fields do
not have.

Saved profiles keep their stored `w` (`overlay-config.md` rule 2), so the change reaches new
and partial profiles only. ADR 0015's preset ladder becomes 400 → 460 → 520.

## Alternatives rejected

- **Only drop the name floor** and keep per-row sizing. This fixes the common classes, but a
  long class name still knocks its own rows out of line.
- **Tighter row gaps or padding** (measured: a 6px gap buys about 10px). That is a smaller,
  separate tuning, and it does not align anything.
- **A smaller chip cap.** It cuts names that fit today (HYPERCAR is 61px) for a width the
  column model already shares sensibly.

## Consequences

- The class column is as wide as the field's longest chip. A single-class or short-class field
  is compact, and a field with a long class name pays that width on every row.
- Hidden sizer rows add one zero-height row per off-screen car to the DOM.
- A strategy column is present whenever the producer sends its field for any car, zeros
  included (`pit_stops: 0`), not only once a value would display. So a producer that sends
  the field from the start has a fixed column set from the first snapshot, and the first pit
  stop of the race does not shift every row's gap and interval.
- At bigger text presets the 72px chip cap shows fewer characters, because the cap does not
  scale with the chip's text.
- On OBS before 31, the columns stay unaligned.
