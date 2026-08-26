# Decision: the standalone `/tower` slot height comes from the Browser Source viewport

**Issues:** #140 · **Epic:** #31 · **Milestone:** 0.11.0
**Status:** Accepted · **Date:** 2026-08-25

Extends `0003-tower-overflow-pinning-and-cycling.md`, which defined the row budget but left
open where `slotHeight` comes from on the route that has no configured slot. Behavior:
`.ai/spec/what/tower-overflow.md` rules 18–20. Renderable from **spec v1 today** — no schema
change, no new producer field.

## Context

ADR 0003 defines the budget as `floor((slotHeight - headerHeight) / rowHeight)`. Inside `/all`
that `slotHeight` is the tower widget's configured `h`. A Browser Source pointed straight at
`/tower` has no configured slot: `TowerPage.svelte` passes `slotHeight = null`, so with the
default `maxRows: "auto"` the budget is `Infinity` and the tower grows with the field — the
original #116 shape, on the one route 0003 did not cover. Cycling is inert in that state too,
since it requires a finite budget.

Two facts sharpened the decision:

- **OBS crops a Browser Source to its configured dimensions.** An over-tall `/tower` is clipped
  rather than visibly broken, so this is a quality-of-output problem, not a corruption one. That
  is what made "document it and close" a legitimate option rather than a cop-out.
- **A profile has never reached the standalone route.** #140's text asserts that "only an explicit
  integer `maxRows` in the profile bounds it today." That is wrong: `TowerPage.svelte` never calls
  `loadConfig` — only `AllPage`, `DriverPage`, `LogosPage`, and `QualifyingPage` do. There has been
  no path for any profile value to reach `/tower` at all, so there was no existing behavior to
  preserve, and `maxRows` was unreachable rather than merely unset.

## Decision

**The standalone route derives its slot height from its own viewport** — viewport height less the
route's safe-area inset top and bottom, floored at zero — and re-derives it when the viewport
changes size.

The Browser Source's own configured dimensions therefore play exactly the role `/all`'s configured
slot height plays. Overflow is a property of the *widget*, not of `/all`, so the whole of ADR 0003
applies identically on both routes rather than only on the composed one. A broadcaster sizes the
source in OBS and the tower fits it; there is no second, route-specific mental model to learn.

**A resize resets the cycling window.** ADR 0003 rule 11 holds window membership steady against the
live feed, deliberately, so the tower does not reshuffle on every snapshot. A resize is not the live
feed — it is an operator changing the layout, in the same class as the session-phase change that
already returns the window to page one. Re-fitting to a new budget while pretending the old window
still applies would mean showing a page sized for a source that no longer exists.

**The derived height is not configurable.** It is a property of the Browser Source, so nothing
overrides it but resizing the source — no profile field, no URL knob. Adding a `?rows=` escape hatch
would let a broadcaster ask for more rows than the source can show, which is precisely the clipped
tower this decision removes.

## Alternatives rejected

1. **Default the standalone route to a concrete integer `maxRows`.** Bounded and simple, but the two
   entry points would then bound the tower by two different mechanisms, and the integer is arbitrary
   — it has no relationship to the size the broadcaster actually made the source.
2. **Document it as intended and close.** Defensible on the crop argument above, and it keeps
   `/tower` a power-user layout carrying its own config. Rejected because it leaves ADR 0003's rule 1
   ("the tower never renders beyond its configured height") true on one route and false on the other,
   and because cycling — a shipped 0.8.0 feature — stays permanently unreachable from `/tower`.

## Consequences

- **Cycling becomes active by default on `/tower`.** `cycle.enabled` defaults to `true`, so a
  standalone tower that has always rendered a static, unbounded list will start paging once the
  field exceeds the source. This is the intended outcome, but it is a visible change for existing
  users and must be released as one.
- **A tiny source shows the header alone.** ADR 0003's `rowBudget < 1` case now reachable by sizing
  the Browser Source rather than by misconfiguring `h`. Unchanged behavior, newly reachable.
- **The safe-area inset becomes load-bearing arithmetic.** Deriving from a raw viewport height would
  overshoot by the inset on both edges and produce a tower taller than its source — the exact defect
  being fixed. Per ADR 0003's "measure, don't hardcode", the inset is read from `--bc-inset-safe`
  rather than assumed.

## Still open

- Whether the standalone route should load a config profile at all, so that `maxRows` and `cycle`
  become reachable there (spec rule 20). This is a **larger change than the budget fix** — it brings
  `overlay-config.md` rule 4's precedence chain to a route that has never had it, and puts the
  existing `?class=` / `?metrics=` knobs on top of a profile for the first time. Tracked separately
  from the viewport derivation.
