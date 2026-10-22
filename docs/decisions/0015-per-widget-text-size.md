# Decision: per-widget text size presets, with the editor widening the widget

**Issues:** #188 (follow-up to #186) · **Milestone:** 0.13.0
**Status:** Accepted · **Date:** 2026-10-16

A broadcaster-tunable text size, per widget, in `/config`.

## Context

#186 bumped the shared type sizes once. A broadcaster still has no way to go bigger for
one event, screen, or widget. The constraint is the standings tower: its row is
crammed, and the tower fills its configured width. The issue asked for the tower case
to be designed around, not assumed away.

Measured in headless Chromium for this decision (standalone tower, mock race, 14 rows,
380px, every `--bc-size-*` token scaled):

| scale | default columns (interval on) | all columns on |
|---|---|---|
| ×1.00 | fits, names 88px | cut off by 93px (already, today) |
| ×1.15 at 380px | cut off by 33px | cut off by 135px |
| ×1.30 at 380px | cut off by 75px | cut off by 177px |
| ×1.15 at 437px | fits, names 103px | cut off by 78px |
| ×1.30 at 494px | fits, names 128px | cut off by 63px |

Row height stays 44px at every scale, so the overflow row budget (ADR 0003) is
unaffected.

## Decision

1. **A three-step preset ladder** (`normal` ×1.00 / `large` ×1.15 / `larger` ×1.30),
   not a free slider. It is predictable, easy to name in a help popover, and
   bounded the way `plateAlpha` is.
2. **Per widget**, applied by redeclaring every `--bc-size-*` token on the widget's
   `/all` slot, the same per-slot override mechanism as `plateAlpha`. All widgets
   already size their text exclusively from these tokens.
3. **The editor widens the widget with its text.** Changing the preset rescales the
   widget's `w` by the factor ratio (380 → 437 → 494). Geometry stays the
   broadcaster's: rendering never overrides `w`, so the widening is a visible,
   saved, undoable edit in the preview, not a hidden render-time stretch.

## Alternatives rejected

- **Fixed width, names truncate.** At ×1.30 the default tower leaves about 39px of
  name, roughly three letters. The numbers survive, but the tower stops identifying
  anyone.
- **Render-time widening** (tower width = `w` × factor). `w` would stop meaning what
  the editor's drag box shows, and rule 9's absolute geometry would no longer hold.
- **Cap the tower at `large`.** That leaves the widget the reporter most wanted bigger
  short of the size they asked for.
- **One global multiplier.** The issue explicitly asks for per-widget tuning: the
  tower's tight columns and the battle box's focus name need different answers.

## Amendment (#215)

The first cut rescaled `w` by the ratio of the new factor to the old. Near the canvas edge
the keep-on-canvas clamp could move `x` or cap `w`, and that was not undone on going back to
`normal`; repeated rounding also drifted odd widths by a pixel. The editor now records the
widget's `normal` `x`/`w` (`textScaleOrigin`) when it leaves `normal`, computes every bigger
preset from that, and restores it exactly on return. Rejected: documenting the exception
(a round trip that doesn't round-trip), and refusing a preset that would not fit in place
(it blocks the most useful case, a widget against the right edge).

A preview drag calls the editor on every pointer step. Comparing each step with the previous
one meant a drag that left and came back to its start still rewrote the origin from the
clamped position (1500 became 1426), so the round trip broke again (#222). A drag is now one
edit, measured from where the pointer went down (rule 41c). Rejected: leaving it, on the
grounds that the broadcaster did move the widget, since the widget ends where it began and
nothing visible tells them the remembered position has changed.

## Amendment (#248)

The default tower is now 400px wide (ADR 0020), so the preset ladder for the default tower is
400 → 460 (`large`) → 520 (`larger`). The fit table above was measured at the old 380px
default, before table columns. ADR 0020 records the 400px measurements; the rule 41
arithmetic is unchanged.

## Consequences

- With every tower column on, the tower is already cut off at ×1.00 today, and it
  stays cut off at every preset. Widening that layout is a separate problem.
- Standalone routes ignore the preset (as they ignore `plateAlpha`). A standalone
  Browser Source can already be scaled in OBS.
- The editor's widening changes the canvas footprint, so a broadcaster may need to
  move a neighbouring widget.
