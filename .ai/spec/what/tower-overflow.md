# Tower Overflow — Pinned Rows & Cycling

When the field is larger than the standings tower's configured height can display, the tower shows a
selection of the field rather than overflowing its box. These rules define that selection and how it
cycles. Renderable from `spec/v1` today — no new producer field.

## Behavioral Rules

### Bounds & capacity

1. The tower never renders beyond its configured height. A field too large for the slot is shown as a
   selection of rows, never by growing the widget past its box.
2. The tower fills its slot with as many whole rows as fit beneath the header. If not even one row
   fits, it renders the header alone — never a partial or overflowing row.

### What gets a row

3. The visible rows are **pinned rows** plus a **cycling window** over everyone else.
4. **Pinned rows** always keep a row while the rest of the field cycles. The broadcaster chooses the
   pins: the top N of the field, or the top N of each class, and — independently — the on-camera
   (`subject`) car. Pins are identified by stable car identity (`slot_id`), never by driver name, and
   a car that qualifies two ways (e.g. a class leader who is also on camera) takes a single row.
5. The **cycling window** is the remaining capacity, cycling through the cars that are not pinned, in
   running order, dwelling a configured time on each page before advancing.
6. Rows render pins first in running order, then the current window page in running order. Pins keep
   their true positions; the window is a moving slice of the field, not a re-ranking.

### When selection is unnecessary or over-subscribed

7. When the whole field fits, there is no cycling — every car shows and the window never turns.
8. When the pins alone do not fit, the pins win: they fill the tower from the top and the window shows
   nothing.
9. When the field shrinks mid-cycle (retirements, pit exits), the tower never shows an empty page; the
   current page stays within the smaller field.
10. When the camera cuts to a different car, its pin updates immediately — following the cut is the
    point. Only the cycling window is held steady (rule 11).

### Stability under a live feed

11. The set of cars in the window is fixed when a page appears and held until the page turns; only a
    turn changes which cars are in the window. Each row's live data (position, gap, tire, fuel) keeps
    updating within the page, and a car that changes position mid-page keeps its place in the page and
    shows its new position rather than jumping pages. A car may therefore appear on two consecutive
    pages, or be skipped once, when the order shifts across a turn — accepted in exchange for a tower
    that does not reshuffle on every update.

### Cadence & motion

12. The tower shows no page indicator — no dots, no "page 2 of 3".
13. Cycling keeps a constant cadence and does not pause under caution or a full-course yellow; a
    stopped tower is indistinguishable from a frozen overlay, and the flag state is shown elsewhere.
14. The per-page dwell has a minimum below which the tower would be unreadable; a shorter configured
    value is raised to that minimum.
15. A page turn is a motion reveal and obeys the overlay's motion policy (`what/overlay-config.md`),
    not the render host's reduced-motion setting.

### Idle & session changes

16. Cycling never makes the tower "idle": the standings tower is always meaningful, so `hideWhenIdle`
    does not apply to it and a populated window page is not an idle state.
17. On a change of session phase (`mode` — e.g. qualifying → race) the window returns to its first
    page; the cycling position does not carry across the transition.

## Scope

These rules apply to the **flat** standings tower (a single running-order list). A class-grouped
tower is outside their scope and is bounded only by rule 1.

## Constraints

- Selection is presentation, not analysis: its only inputs are the producer-provided running order,
  the on-camera `subject`, and vehicle class. The tower derives no race fact and does not re-rank.
- Pins de-duplicate by `slot_id`, never by driver name.
