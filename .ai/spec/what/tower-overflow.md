# Tower Overflow — Clamp, Row Budget, Pinned Rows & Cycling

What the standings tower does when the field is larger than the configured slot can display: how
many rows fit, which cars keep a row, and how the rest of the field is shown. **Renderable from
`spec/v1` today — no schema change, no new producer field.** Decision record:
`docs/decisions/0003-tower-overflow-pinning-and-cycling.md` (Accepted). Milestone 0.8.0 (#116).

Implementation target: `app/src/routes/tower/towerCycle.js` (selection/stability logic) consumed by
`StandingsTower.svelte`; see `how/renderer.md`.

## Behavioral Rules

### Two layers

1. Overflow is handled in **two deliberately separate layers**: the **clamp** (a pure CSS bound — the
   tower can never exceed its configured `h`; already shipped, PR #118) and **selection** (of the
   rows that fit, which cars get them: pinned rows plus a cycling window). The clamp stays underneath
   selection permanently — it guarantees the widget cannot escape its box no matter what selection
   does or how the row budget is miscounted.
2. This is **presentation, not analysis** (per `docs/decisions/0002-lower-third-widgets.md`). Every
   input is already producer-provided (position ordering, `subject.slot_id`, class). The overlay
   derives no race fact; it decides only *which already-provided rows to draw, and when*.
   Consequently: no spec change, no `schemaVersion` bump, no new field.

### Row budget

3. The row budget is `floor((slotHeight − headerHeight) / rowHeight)`, **measured** from the live
   `--bc-widget-header` (38px default) and `--bc-row-standard` (44px default) design tokens — read
   back by measurement, never hardcoded, so a theme override cannot silently desync it.
4. If the row budget is `< 1`, render the **header only** — never a negative or partial selection.
5. The clamp bounds the result: an off-by-one in the budget is a clipped row, not an off-canvas
   tower.

### Selection

6. **Pins** — take `pinTop` leaders (of the whole field when `pinScope: 'overall'`, of each class
   when `'class'`), plus the subject car when `pinSubject` and it is not already pinned. **De-duplicate
   by `slot_id`**, never by driver name (two drivers can share a name, per ADR 0002).
7. **Window** — the remaining budget (`budget − pins`) cycles through the cars **not** pinned, in
   position order, `perPageSeconds` per page.
8. **Render order** — pins first in position order, then the current window page in position order.
   Pins keep their true positions; the window is a moving slice, not a re-rank.

### Degenerate cases

9. **Field fits the budget** → cycling is **inert**: render everyone, no page turns. Cycling must
   *disappear*, not "cycle" a single page.
10. **Pins alone exceed the budget** → pins win, truncated at the budget from the top; the window
    gets nothing.
11. **Field shrinks mid-cycle** (retirements, pit exits) → clamp the page index into range rather
    than rendering an empty page.
12. **Subject changes mid-page** → the subject pin updates immediately (it is a camera cut; following
    it is the point). Only the *window* is stability-locked (rule 13).

### Page stability

13. **Window membership is snapshotted when a page turns and held for the dwell.** The per-row *data*
    (gap, tire, position) keeps updating live within the page; only the *set of cars* in the window is
    frozen. A car that changes position mid-page stays in the window and shows its new position — it
    does not jump pages until the next turn. Accepted consequence: a car may appear in two consecutive
    pages, or be skipped once, when the order shifts across a turn — strictly preferable to a tower
    that reshuffles every tick. (Same shape as the lower-third dwell: a changing producer value does
    not itself retrigger the display.)

### Cadence & motion

14. **No page indicator** — no dots, no "2 of 3". It is absent from every reference implementation
    (LMU Autocycle, rF2), costs budget in a widget defined by not having enough of it, and answers a
    question viewers are not asking; orientation comes from the class label in the header.
15. **Cycling does not pause under caution/FCY.** A stopped tower is indistinguishable from a frozen
    overlay; the flag state is already carried by the Race Control widget. Cadence stays constant;
    only the data changes.
16. **`perPageSeconds` is floored at 4s** — clamped rather than trusted, since a misconfigured 1s
    renders the tower unreadable.
17. **Page turns gate on the root `data-motion` attribute, not `prefers-reduced-motion`** — OBS/CEF
    reports reduced-motion, so a media-query implementation would hard-cut in OBS (the 0.6.0 bug). A
    page turn is a reveal like any other and follows the established transition idiom.

### Scope

18. **In scope: flat (`classDisplay: 'inline'`) towers.** Grouped (`classDisplay: 'grouped'`) towers
    stay **clamp-only** — class headers consume row budget dynamically and cycling within class
    sections is a materially harder problem, deferred. `pinScope: 'class'` is independent of
    `classDisplay`, so per-class pinning does not drag grouped mode back into scope.

### Open items resolved here [PROPOSED — confirm on spec approval]

19. **`hideWhenIdle` × cycling:** the tower has no idle predicate and is always meaningful, so
    `hideWhenIdle` does not apply to it; a window page carrying cars is never "idle". Cycling
    introduces no idle behavior. *(Resolves ADR 0003 "Still open" #1.)*
20. **Window cursor on session-phase change:** reset the window to page 1 when `mode` changes (e.g.
    qualifying → race) — a fresh session context; the cursor does not carry across the transition.
    *(Resolves ADR 0003 "Still open" #2.)*

## Configuration Surface

Additive and defaulted — no `configVersion` bump (same pattern as `hideWhenIdle`). Existing profiles
render identically until a field exceeds the row budget, at which point the prior behavior (overflow
off-canvas) was already broken. Only the standings tower reads these.

```jsonc
"tower": {
  "maxRows": "auto",         // "auto" = derive from h (row budget); or an explicit integer cap
  "cycle": {
    "enabled": true,
    "perPageSeconds": 8,     // seconds per window page; floored at 4 (clamp, don't trust)
    "pinTop": 3,             // 0 none | 1 leader | 3 podium | N top-N
    "pinScope": "overall",   // "overall" = top N of the field | "class" = top N of EACH class
    "pinSubject": true       // keep the on-camera car on screen
  }
}
```

## Constraints

- Presentation only: never derive a race fact; the only inputs are producer-provided position,
  `subject.slot_id`, and class. De-duplicate pins by `slot_id`.
- The clamp stays under selection permanently; selection must never be trusted to bound geometry.
- Flat towers only. Grouped towers remain clamp-only until grouped-mode cycling is designed.
- `happy-dom` does no layout, so the *measured* row budget and clamp interaction are verified in a
  real browser (as the #118 clamp was); the pure selection/stability logic is unit-tested in
  `towerCycle.test.js`.

## Planned Changes

- `[PLANNED]` Grouped-mode (`classDisplay: 'grouped'`) cycling — per-class pages / shared cursor.
- `[PLANNED]` Auto-shrink as a floored adjunct to buy a row or two before cycling engages.
- `[PLANNED]` Producer-driven selection (a "featured cars" field) — a spec addition, only if
  presentation-side selection proves insufficient.
