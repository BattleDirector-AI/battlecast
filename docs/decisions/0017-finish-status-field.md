# Decision: a per-car finish-status code and a tower finish chip

**Issues:** #206 · **Milestone:** 0.14.0
**Status:** Accepted · **Date:** 2026-10-17

How the contract says "this car has taken the chequered flag" (or retired, or been
disqualified), and how the tower shows it. Additive to spec v1, so `schemaVersion` stays `"1"`.

## Context

When the leader takes the chequered flag, viewers want to see who has finished and who is still
on their last lap. A broadcaster asked for it (the battlecast Discord feature-request thread
"Additional Tower Info"). `session.flag: "checkered"` only says the session is ending. Who has
crossed the line since then is a per-car fact, and the overlay can't safely work it out.

What the sims expose (researched for this decision):

| | rFactor 2 | Le Mans Ultimate | iRacing |
|---|---|---|---|
| Per-car finish state | `mFinishStatus`: 0 none, 1 finished, 2 DNF, 3 DQ | same field and codes | none |
| When "finished" flips | when that car crosses the line | same (assumed, not verified separately) | derived from each car's own line crossing after the flag (CrewChief's method) |
| DNF / DQ | same field | same field | `ResultsPositions[].ReasonOutId` in the session info |

BattleDirector already carries a `FinishStatus` enum with the same four codes on every vehicle.
On rF2/LMU it copies `mFinishStatus`. Its iRacing rule marks every classified car finished the
moment the session ends, which is wrong for "took the flag" and has to change before it feeds
this field (battledirector#3595).

## Decision

One optional per-vehicle field, **`finish_status`**: an integer code, `0` running, `1` finished,
`2` DNF, `3` DQ.

- **An integer code, not a boolean or a string.** The codes are rF2/LMU's own and BattleDirector's
  own, so a producer passes them through instead of translating. A boolean `finished` was the
  issue's proposal. It was rejected because the sims' "non-zero" includes DNF and DQ, so a
  boolean invites a producer to send `true` for a retired car, and DNF/DQ would need a second
  field later.
- **Strict codes.** Only the integers 1, 2 and 3 mark a row. A string `"1"`, `true`, a non-integer,
  or an undefined code shows nothing, the same way the contract tolerates an unknown flag
  string without guessing what it means.
- **The tower shows one chip at the row's trailing end:** a chequered square for finished, `DNF`
  or `DQ` text for the others. It sits after every metric cell, so it never moves the gap or
  interval columns, and it changes no cell's text.
- **Race and results only, as an allow-list.** rF2 can set a finish state in non-race sessions
  too, and a qualifying board full of chequered chips would mean nothing. The tower shows the chip
  only when `mode` is `race` or `results` (trimmed, case-insensitive), so `replay` or a new mode
  shows nothing until a rule says otherwise.
- **Independent of the session flag.** Retirements happen under green, so a `DNF` shows as soon
  as the producer sends it, not only after the chequered flag.
- **No hold and no toggle.** Like the local-yellow mark (ADR 0016), the chip follows the
  snapshot. With no field sent, nothing renders.

## Alternatives rejected

- **`finished: boolean` plus a separate `retired` / `dq` field.** It covers the same states but
  in two fields that can contradict each other (`finished: true, retired: true`).
- **A string enum (`"finished"`, `"dnf"`, ...).** It reads better in a payload, but every
  producer would map the sims' integers to strings and back.
- **Inferring "finished" in the overlay** from `session.flag: "checkered"` plus each car's laps.
  The overlay doesn't know who crossed the line after the flag, and the dumb-overlay rule forbids
  the derivation anyway.
- **Dimming finished rows.** It is quieter but harder to read on a busy stream. It was offered,
  and the chip was chosen.
- **Showing the chip on `/results`.** The results slide is a separate route with its own layout.
  It is out of scope here.

## Consequences

- BattleDirector has to send the field before a live broadcast shows anything. On rF2/LMU that is a
  pass-through. On iRacing it needs per-car crossing logic first. Until then the tower renders
  exactly as before.
- The mock producer drops the chequered flag near the end of each race leg, marks each car
  finished as it next crosses the line, and retires one car, so every chip is exercised live.
  `validate-simulator.js` pins it.
- A future race-winner callout (#27) can build on the same field.
