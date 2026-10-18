# Decision: the tower's interval cell gets the gap cell's fixed width

**Issues:** #225 · **Milestone:** 0.14.0
**Status:** Accepted · **Date:** 2026-10-18

## Context

Rule 42a gives the gap cell a fixed slot for an 8-character readout. The interval cell was
content-sized, so `+0.400`, `+12.345` and `+1 LAP` changed its width as values ticked, and the
name and the strategy cells to its right moved with it.

Measured in headless Chromium for this decision (standalone tower, mock race at t=1200 s, 14 cars,
default columns, before short driver names). Name widths are min / median, with the number of
truncated names out of 14:

| interval cell | ×1.00 / 380px | ×1.15 / 437px | ×1.30 / 494px | holds still for |
|---|---|---|---|---|
| content-sized | 45 / 60, 2 | 69 / 89, 0 | 93 / 118, 0 | — |
| 8 characters (80px at ×1.00) | 44 / 46, 10 | 56 / 65, 3 | 78 / 90, 1 | every value |
| 7 characters (70px) | 44 / 52, 6 | 67 / 76, 1 | 90 / 103, 1 | 99.5% of readouts |
| 6 characters (61px) | 45 / 58, 3 | 69 / 87, 1 | 93 / 115, 0 | 60% of readouts |

No variant overflows a row. Readout lengths in a 2000 s mock race (14,000 readouts): `—` 7.1%,
6 characters 53.0%, 7 characters 39.4%, 8 characters 0.5%.

## Decision

**The interval cell takes the gap cell's 8-character slot** (rule 42b), sized off the gap type
token like rule 42a, with no shrinking and no wrapping.

The name cost in the table is what made this a question. The table was measured before short
driver names (ADR 0018) became the tower default. A short name is five characters (`E.JAC`), far
narrower than the 44–60px names measured above, so the default tower is expected to have room for
the full slot. That is an estimate, not a measurement. In full name
style the tower grows to fit the row instead (rule 48), so the slot costs width, not name.

## Alternatives rejected

- **7 characters.** It holds still for 99.5% of readouts but still moves for `+105.000` and
  `+12 LAPS`, which are exactly the readouts a viewer is watching when a car is far behind. It
  saves 10px that short names no longer need.
- **6 characters.** It moves for about 40% of readouts, so it barely fixes the issue.
- **Leave it content-sized.** The row keeps shifting with every tick.

## Consequences

- The interval column and the gap column read as one aligned pair down the tower.
- In full name style the grow-only width (rule 48) no longer has to absorb interval changes.
- A tower that shows full names with every column on is about 20px wider than before.
