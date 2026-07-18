# Decision: tower overflow — slot clamp, pinned rows, and field cycling

**Issues:** #116 · **Epic:** #31 · **Milestone:** TBD
**Status:** Proposed · **Date:** 2026-07-18

Specifies what the standings tower does when the field is larger than the configured
slot can display: how many rows fit, which cars keep a row, and how the rest of the
field is shown. Renderable from **spec v1 today** — no schema change, no new producer
field.

## Summary

The tower renders one row per car, so a large field grew the widget past its slot and
off the canvas entirely (#116). Two layers, deliberately separate:

1. **The clamp** (shipped, PR #118) — the tower can never exceed its configured `h`.
   A pure CSS bound, no selection logic. This is the safety net.
2. **Selection** (this decision) — of the rows that *do* fit, which cars get them:
   a set of **pinned** rows plus a **cycling window** over everyone else.

The clamp stays underneath selection permanently. Selection decides what's worth
showing; the clamp guarantees a widget can't escape its box no matter what selection
does or how the row budget is miscounted.

## Design principle — this is presentation, not analysis

Per `0002-lower-third-widgets.md`, battlecast **renders; it does not analyze the race.**
Cycling and pinning sit squarely on the allowed side of that line: the overlay's own
logic is "limited to presentation — noticing that a producer-provided value changed, and
timing/animating the display."

Every input here is already a producer-provided field:

- position ordering — already what the tower renders
- `subject.slot_id` — already the on-camera car
- class — already used by `classDisplay` / `?class=`

The overlay derives **no race fact**. It decides only *which already-provided rows to
draw, and when*. Consequently: **no spec change, no `schemaVersion` bump, no new field.**

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Scroll the overflow | An OBS overlay has no scrollbar and nobody to scroll it. Non-starter. |
| Auto-shrink rows/font to fit | Degrades to unreadable at large field sizes; the failure is silent and gets worse exactly when the race is most crowded. Viable only as a narrow, floored adjunct — not the mechanism. |
| Truncate to the leaders | Simple, but a director-driven broadcast frequently features a car well down the order; silently dropping it is the worst outcome. Becomes correct once it's *pinned truncation* — which is this proposal. |
| `?class=` filtering | Already exists and helps, but it's a manual per-Browser-Source choice, not a general answer to "more cars than rows". |

## Configuration

Additive and defaulted, so no `configVersion` bump — same pattern as `hideWhenIdle`.

```jsonc
"tower": {
  // ... existing geometry / classDisplay / driverInfo ...
  "maxRows": "auto",        // "auto" = derive from h; or an explicit integer cap
  "cycle": {
    "enabled": true,
    "perPageSeconds": 8,    // mirrors logoRotation.perSlotSeconds
    "pinTop": 3,            // 0 = none, 1 = leader, 3 = podium, N = top N
    "pinSubject": true      // keep the on-camera car on screen
  }
}
```

**`pinTop: N` rather than separate `alwaysShowLeader` / `alwaysShowPodium` flags.** One
integer covers leader (1), podium (3), and top-N without introducing two booleans that
can contradict each other, and it extends without new config keys.

**`pinSubject` defaults true.** In a director-driven product this is the highest-value
pin: when the battle box or on-board HUD is featuring a car running P14, having that car
silently cycle off the tower is precisely wrong. Costs one row of budget.

Defaults are chosen so existing profiles render identically until a field exceeds the
row budget — at which point today's behavior (overflow) was broken anyway.

## Row budget

```
rowBudget = floor((slotHeight - headerHeight) / rowHeight)
```

**Measure, don't hardcode.** `--bc-widget-header` (38px) and `--bc-row-standard` (44px)
are design tokens and a theme may override them; reading them back via measurement keeps
the budget honest. Hardcoding the numbers would silently desync from the tokens.

If `rowBudget < 1`, render the header only — never a negative or partial selection.

The clamp means an off-by-one here is a clipped row, not an off-canvas tower.

## Selection

Given the ordered field and a row budget:

1. **Pins** — take `pinTop` leaders, plus the subject car if `pinSubject` and it isn't
   already among them. **De-duplicate by `slot_id`** (never by driver name — two drivers
   can share one, per `0002`).
2. **Window** — the remaining budget cycles through the cars not pinned, in position
   order, `perPageSeconds` per page.
3. **Render** — pins first in position order, then the current window page in position
   order. Pins keep their true positions; the window is a moving slice, not a re-rank.

Degenerate cases:

- **Field fits the budget** → cycling is inert; render everyone, show no page indicator.
  Cycling must *disappear*, not "cycle" a single page.
- **Pins alone exceed the budget** → pins win, truncated at the budget from the top;
  the window gets nothing.
- **Field shrinks mid-cycle** (retirements, pit exits) → clamp the page index into range
  rather than rendering an empty page.
- **Subject changes mid-page** → the subject pin updates immediately; it's a camera cut,
  and the whole point is to follow it. Only the *window* is stability-locked, below.

## Page stability — the subtle part

The field reorders continuously. If window membership recomputed on every SSE tick, rows
would jitter constantly and unreadably.

**Rule: window membership is snapshotted when a page turns and held for the dwell.** The
per-row *data* (gap, tire, position) keeps updating live within the page; only the *set of
cars in the window* is frozen. A car that changes position mid-page stays in the window
and shows its new position — it does not jump pages until the next turn.

This is the same shape as the existing lower-third dwell: a producer value changing does
not itself retrigger the display.

Consequence to accept: a car can appear in two consecutive pages, or be skipped once, when
the order shifts across a turn. That is strictly preferable to a tower that reshuffles
every tick.

## Motion

Page turns must gate on the root `data-motion` attribute, **not** `prefers-reduced-motion`.
OBS/CEF reports reduced-motion, so a naive media-query implementation would hard-cut in
OBS — the exact bug fixed in 0.6.0 (see `lib/motion.js`). A page turn is a reveal like any
other and follows the established transition idiom.

## Scope

**In:** flat (`classDisplay: 'inline'`) towers — clamp, row budget, pins, cycling, page
indicator.

**Out — deferred:**

- **Grouped mode** (`classDisplay: 'grouped'`). Class headers consume row budget
  dynamically and cycling *within* class sections is a materially harder problem
  (per-class pages? a shared page cursor?). Grouped towers keep clamp-only behavior until
  this is designed on its own.
- **Auto-shrink** as a floored adjunct to buy a row or two before cycling engages.
- **Producer-driven selection** (a "featured cars" field). Would be a spec addition and
  should only happen if presentation-side selection proves insufficient.

## Open questions

1. **Page indicator** — dots, "2/3", or nothing? Costs vertical space if it takes a row;
   probably belongs in the header next to the session clock.
2. **Does `pinTop` mean overall or per class** in a multi-class field? Overall is simpler;
   per-class is arguably what an endurance broadcast wants, and interacts with the deferred
   grouped mode.
3. **Should cycling pause** during a caution/FCY, when viewers are scanning the order?
4. **`perPageSeconds` floor** — below ~4s the tower is unreadable; worth clamping the
   config rather than trusting the value.
