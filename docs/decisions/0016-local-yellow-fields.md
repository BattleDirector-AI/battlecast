# Decision: local-yellow fields, a tower mark and a Race Control sector chip

**Issues:** #205 · **Milestone:** 0.14.0
**Status:** Accepted · **Date:** 2026-10-16

How the contract says "sector 2 is under a local yellow, and these cars are involved", and
where the overlay shows it. Additive to spec v1, so `schemaVersion` stays `"1"`.

## Context

Spec v1 knows about yellows only at session level. `session.flag` is a free-form string that
may be `yellow`, and `session.full_course_yellow` is the whole-course caution. Nothing says
**which sector** is yellow or **which cars** are involved. A broadcaster asked for both (the
battlecast Discord feature-request threads "Additional Tower Info" and "Update/Info box"),
pointing at an LMU overlay that marks the involved cars in the timing tower.

Both facts belong to the producer. Who is stopped inside a yellow cannot be read off positions
or gaps, and the dumb-overlay rule forbids trying.

What the sims expose (researched for this decision):

| | rFactor 2 | Le Mans Ultimate | iRacing |
|---|---|---|---|
| Per-sector local yellow | yes, `mSectorFlag[3]` | yes, same struct | **no**; `SessionFlags` says a yellow is out, not where |
| Car involved in a yellow | no | no | no |
| Car's current sector | `mSector` | `mSector` | from `CarIdxLapDistPct` + `SplitTimeInfo` |

So on rF2/LMU `sector_flags` comes from `mSectorFlag`, but not as a straight copy: the producer
remaps it to lap order and translates `1` to `"yellow"`. rF2's own header is unsure whether index 0
is the first or last sector, and its `mSector` uses 0 = S3, 1 = S1, 2 = S2, so a naive copy could
show `YELLOW S1` while sector 3 is yellow; the order is confirmed on track in BattleDirector
(battledirector#3579). On iRacing the field is absent. `yellow_involved` is always a producer
heuristic. Existing tools (CrewChief, TinyPedal) flag a car stopped or crawling
in a yellow sector and not in the pits. That catches stopped cars, misses a car that spins and
drives on, and cannot separate the car that caused an incident from one caught in it.

## Decision

Two optional fields:

| Field | Shape | Read by |
|---|---|---|
| `vehicles[].yellow_involved` | boolean | tower: a yellow edge on the row (`widgets.md` rule 43) |
| `session.sector_flags` | array of strings, index 0 = sector 1 | Race Control: a `YELLOW S2` chip (rule 44) |

- **Tower mark: a yellow edge on the row's leading side**, beside the class bar. It was picked
  over a flag chip in the row (no room in an already tight row) and over a whole-row tint (which
  fights the on-camera highlight). The class bar stays, so class identity is not lost on a
  yellow car.
- **Sector yellows live in Race Control.** It already carries the flag, FCY and safety car, so
  `YELLOW S2` sits with the other flag states. The tower header was rejected because it already
  holds the session clock.
- **Only exactly `true` marks a row**, and only the string `yellow` marks a sector. Anything else
  is "not yellow", matching how the contract treats unknown flag strings: tolerate them, never
  guess.
- **No hold and no toggle.** The mark follows the producer snapshot by snapshot. A local yellow
  is the producer's live call, and holding it past the producer's own "cleared" would show a
  yellow that is no longer there. With no field sent, nothing renders, so a toggle would only
  hide data the producer chose to send.
- **The sector chip steps aside under FCY or a safety car.** The whole course is yellow then, and
  the FCY/SC badges already say so; listing every sector as well is noise. The tower mark stays
  under caution, because a car stopped at the incident is still worth pointing at.
- **No caution pulse for a sector yellow.** The pulse means "the whole field is neutralised". A
  local yellow is routine and shouldn't make the widget pulse.

## Alternatives rejected

- **A session-level list of involved `slot_id`s** (e.g. `session.yellow_cars`). It would keep
  all yellow data in one object, but the tower would have to cross-reference it per row, and it
  breaks the pattern every other per-car fact follows (`in_pit`, `notable`, `laps_behind_*` are
  all on the vehicle).
- **Per-vehicle `yellow_sector`** (which sector the car is involved in). It duplicates
  `sector_flags` and nothing renders it. The callout that would use it is out of scope (below).
- **Asking the producer for the car that *caused* the yellow.** No sim reports it, and a speed
  check cannot tell cause from consequence.
- **A `YELLOW — SECTOR 2, car X` callout.** It belongs with event callouts in the race update box
  (#27), not in a status strip. It is out of scope here.
- **Inferring involvement in the overlay.** The overlay has no per-car speed or track-surface
  data, and the dumb-overlay rule forbids the derivation anyway. The heuristic lives in the
  producer, which has the telemetry.

## Consequences

- BattleDirector has to send both fields before a live broadcast shows anything. Until then the
  tower and Race Control render exactly as before. On iRacing the Race Control chip never shows,
  since the sim has no sector flags.
- The tower mark is only as good as the producer's heuristic. The contract names it "involved",
  not "caused", so a broadcast never claims to know who caused an incident. It is defined as
  stopped or crawling, or off track, so a producer does not mark every car lifting through the
  sector.
- The mock producer emits both fields in the race phase and stages one local yellow around the
  GT3 backmarker's problem, so the paths are exercised live. `validate-simulator.js` pins it.
- A future callout (#27) can build on the same two fields without a contract change.
