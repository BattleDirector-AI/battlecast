# Widgets

Behavioral rules for what each widget renders and when it shows. All widgets consume the same
`spec/v1` snapshot and obey *dumb overlay, smart producer* — they present producer-provided values,
never derive semantic facts. See `how/renderer.md` for how the routes are wired.

## Behavioral Rules

### Standings tower (`/tower`)

> **Overflow** (what happens when the field is larger than the slot can display — the CSS clamp, row
> budget, pinned rows, and the cycling window) is specified separately in `tower-overflow.md`.

1. Renders the running order: sort `vehicles[]` by `position` ascending. Highlights the `subject`
   driver's row (keyed by `slot_id`). Shows lap/gap timing per row (em-dash when timing is absent).
2. In a **lap-timed** session (qualifying/practice), the leader's cell shows their best (pole) lap —
   the benchmark every delta measures against — while the field shows deltas. In a race the leader
   reads "LEADER".
3. **Class display** (`classDisplay`): `inline` (one overall list, each row badged with its class
   position) or `grouped` (per-class sections in class-registry order, positions restarting within
   each class). Only the tower reads this knob. While class tags are hidden (rule 61) the tower
   renders the inline layout whatever the knob says. The standalone `/tower` route and the tower
   inside `/all` both read it from the loaded profile (rule 67).
4. A grouped-by-class tower MAY show a gap-to-class-leader by subtracting the class leader's
   `gap_to_leader` from a car's own — exact arithmetic on producer values, not a forbidden
   re-derivation.
5. In **inline** layout, each row carries a **class-rank badge** (e.g. `GTP 3/7`) computed from the
   full field's running order, so it stays stable regardless of the `?class=` filter (rule 10). In
   **grouped** layout the badge is omitted — class rank is conveyed structurally by the restarting
   position column and the group header's car count.
6. **Interval column** — renders per-vehicle `interval_ahead` (gap to the car immediately ahead)
   beside the gap-to-leader. Gated by `towerMetrics.interval` (default **on**). Because a
   class-relative interval is not re-derivable, `interval_ahead` is rendered verbatim even in a
   grouped tower.
7. **Race-strategy indicators** — config-gated per `towerMetrics` (each default **off**): `pit`
   (completed `pit_stops` count + an in-pit indicator when `in_pit`), `tire` (verbatim
   `tire_compound` label + a `tire_wear` bar over `[0,1]`), `fuel` (a neutral resource bar over
   `[0,1]`, fuel or hybrid energy). A broadcaster enables these for endurance density.
8. **Qualifying/practice suppression** — in lap-timed modes the tower suppresses `pit`, tire **wear**,
   and `fuel` **outright**, regardless of the `towerMetrics` toggles or what the producer sends;
   these are race features that don't belong on a lap board. Tire **compound**
   and the interval column stay. (This is the one place the dumb-overlay rule yields to a
   presentation decision.)
9. **Session-progress header** — the tower header renders the native "Session Info" readout (session
   countdown clock or `LAP X OF Y` counter) from the `session` object (protocol rule 16). This is a
   **tower** element, distinct from the Race Control widget (rule 20). Null when the producer sends no
   session progress → the header then shows just the `mode`.
10. **`?class=` filter** — narrows the rendered field to a single `vehicle_class` (case-insensitive).
    A filter that matches nothing is an **explicit** state distinct from "no snapshot at all"; the
    tower surfaces which and never blanks silently.
33. **Lapped cars, gap-to-leader (inline layout).** A non-leader row whose producer-sent
    `laps_behind_leader` is 1 or more shows the lap deficit in its gap cell instead of a time:
    `+1 LAP` for exactly one lap, `+N LAPS` for more (`+2 LAPS`). The lap deficit wins over
    `gap_to_leader` whatever that holds — a real time, null, or a `0` placeholder. A row whose
    `laps_behind_leader` is 0, null, absent, or not a finite number ≥ 1 renders its time gap
    exactly as rule 1 describes; a fractional value renders its whole part (`1.6` → `+1 LAP`).
    The leader row is unaffected (rule 2).
34. **Lapped cars, interval column.** The interval column (rule 6) applies the same treatment to
    `laps_behind_ahead`: 1 or more renders `+1 LAP` / `+N LAPS` in place of `interval_ahead`,
    otherwise the time renders verbatim. Like the interval itself it is the overall car ahead, so
    the grouped layout renders it identically to the inline one.
35. **Lapped cars, grouped layout.** In the grouped layout a non-class-leader row reads its
    producer-sent `laps_behind_class_leader`: 1 or more renders `+1 LAP` / `+N LAPS`; otherwise the
    row shows the gap-to-class-leader time of rule 4. The overall `laps_behind_leader` plays **no**
    part in the grouped gap cell — a class leader laps down overall still reads LEADER, and a car
    on its class lead lap still shows a time, however many laps down overall both are. The tower
    never derives a class lap deficit from the overall lap fields. Decision record:
    `docs/decisions/0012-lap-deficit-fields.md`.
40. **Lap-time flash.** When a car completes a lap, its gap cell shows the new lap time in place
    of its gap for **5 seconds**, then reverts to the gap. "Completed a lap" means: the car's
    `slot_id` was in the previous snapshot this tower rendered, and its `last_lap` is now a finite
    number > 0 that differs from the previous snapshot's value (including a previous null or absent
    value — the car's first completed lap). The tower compares one car's own field across
    snapshots; it never compares lap times between cars. No flash fires on the first snapshot after
    the tower mounts, for a car that was not in the previous snapshot, for a re-sent unchanged
    value, or when `last_lap` becomes null. The flash renders `last_lap` the way the lap-timed
    leader cell does (`1:31.950`), applies to every row including the leader's (whose `LEADER` or
    pole-lap cell it covers), in every mode and both layouts, and leaves the interval column and
    every other cell unchanged. A further lap completed during a flash shows the newer time and
    restarts the 5 seconds in place. It holds for the full 5 seconds whether or not more snapshots
    arrive.
41. **Flash tier from producer flags.** Each flash carries a tier taken from the car's producer-sent
    `notable` flags in the snapshot that fired it, by precedence: `session_best_lap` → **session
    best**, else `class_best_lap` → **class best**, else `personal_best_lap` → **personal best**,
    else **plain**. While it flashes, the gap cell carries `data-lap-flash` = `session-best` |
    `class-best` | `personal-best` | `none`, and carries no `data-lap-flash` otherwise. Session and class best are styled
    purple and personal best green; plain uses the normal gap styling. The tier stays fixed for the
    whole flash even if later snapshots change the flags. The tower never decides a tier by
    comparing lap times.
42. **The flash is a tower metric toggle.** `towerMetrics.lapFlash` (default **on**) gates rule 40;
    off, no row ever flashes. Decision record: `docs/decisions/0014-tower-lap-time-flash.md`.
42a. **The gap cell keeps its width.** The gap cell reserves room for an 8-character monospaced
    readout (`1:31.950`, `+205.000`, `+12 LAPS`) and never shrinks, so swapping a gap for a flashed
    lap time, `LEADER`, or a lap deficit does not move the name or the cells to its right.
42b. **The interval cell keeps its width.** When the interval column (rule 6) shows, its cell
    reserves the same 8-character slot as the gap cell (rule 42a), which scales with the gap's text
    size, never shrinks, and never wraps. `—`, `+0.400`, `+12.345`, `+105.000`, `+1 LAP` and `+12 LAPS`
    all render at one width, right-aligned, so a changing interval does not move the name or the
    cells to its right. Decision record: `docs/decisions/0019-tower-interval-fixed-width.md`.
43. **Cars involved in a local yellow.** A row whose producer-sent `yellow_involved` is exactly
    `true` carries a yellow edge on its trailing (right) side, opposite the class bar (which
    stays), and the row carries `data-yellow="true"`. Any other value — `false`, null, absent, the string
    `"true"`, `1` — marks nothing. The mark follows the latest snapshot with no hold: the row
    loses it as soon as a snapshot stops sending `true`. It applies in every mode and both
    layouts, combines with the on-camera highlight rather than replacing it, changes no cell's
    text, and has no config toggle. The tower reads only the car's own field — never
    `session.sector_flags`, speed, or position — to decide involvement. Decision record:
    `docs/decisions/0016-local-yellow-fields.md`.
45. **Finish status.** When the snapshot's `mode`, trimmed and case-insensitive, is `race` or
    `results`, a row whose producer-sent `finish_status` is exactly the integer `1`, `2`, or `3`
    carries one finish chip (`data-testid="row-finish"`) and the row carries `data-finish` =
    `finished`, `dnf`, or `dq` respectively. In every other mode — `qualifying`, `practice`,
    `grid`, `replay`, an unknown or absent mode — the tower shows no finish chip and no
    `data-finish`, whatever the field holds. The chip for `1` is a chequered-flag square with no
    text, `role="img"`, and accessible name `Finished` (`aria-label`); the chip for `2` reads `DNF`;
    the chip for `3` reads `DQ`. Any other value — `0`, null, absent, a string such as `"1"`, a
    boolean, a non-integer, an undefined code such as `4` — shows no chip and no `data-finish`.
    The chip is the row's last element, after every metric cell, and sits against the row's
    trailing edge so the chips line up down the tower whichever metric cells a row shows. The
    chip and the timing cells keep their width, and the driver name never truncates to make
    room. In short style (rule 47) a row that is wider than the tower even so is clipped at the
    tower's right edge (clipped, never wrapped onto a second line), and the chip, as the row's
    last element, is the first thing clipped. In
    full style (rule 48) the tower widens instead. The chip follows the
    latest snapshot with no hold, applies in both layouts, combines with the on-camera highlight
    and the local-yellow edge (rule 43), changes no other cell — the gap, interval, and position
    read exactly as without it — and has no config toggle. The tower reads only the car's own
    field: the chip shows under any `session.flag` or with no `session` at all, so a car that
    retires under green shows `DNF` at once. Decision record:
    `docs/decisions/0017-finish-status-field.md`.
46. **Driver name style.** The tower renders every row's driver name in the style its
    `nameStyle` setting selects (`overlay-config.md` rule 42): **short** (rule 47, the
    default) or **full** (rule 48). The style applies to every row in both layouts (inline and
    grouped), in every mode, and wherever the tower renders: the standalone `/tower` route and
    the tower inside `/all`, including the `/config` preview. The root element
    (`data-testid="standings-tower"`) carries `data-name-style` = `short` | `full`, the style
    it is rendering. Only the tower reads the setting. The battle box, the lower-thirds, the
    on-board HUD and the `/grid` and `/results` slides render names in their own format,
    whatever it holds. The name is derived from the car's own `driver_name` and nothing else. The tower never compares one
    car's name with another's, and the style changes no other cell, no row order and no
    highlight.
47. **Short names.** The short form is built from `driver_name` as follows:
    - A missing, null or non-string `driver_name`, or one that is empty or whitespace-only
      after trimming, gives an empty name cell; the row otherwise renders as usual.
    - Normalize the string to Unicode NFC, then trim it. All counting below is in Unicode code
      points, never UTF-16 units, so an astral character counts once and is never split.
    - Split it into words at whitespace. If that gives exactly one word and the word contains
      `.`, split that word at its first `.` instead. So `E.Jacobs`, and an already-short
      `E.JAC`, read as an initial and a last name.
    - From each word keep only its letters (`\p{L}`) and decimal digits (`\p{Nd}`), in any
      script. Everything else is dropped: hyphens, apostrophes, periods, brackets, combining
      marks (`\p{M}`) left over after NFC, and every other character. A word left with nothing
      is discarded.
    - No words left → empty name cell. One word → its first three kept code points. Two or
      more → the first kept code point of the first word (so `(Erik)` gives `E`), then `.`,
      then the first three kept code points of all the remaining words run together. Where
      fewer than three are available, all of them show.
    - Uppercase last, with locale-independent `toUpperCase`, and show the whole result with no
      space. The three code points are taken before uppercasing, so a character that
      uppercases to more than one (`ß` → `SS`) lengthens the result: a last name `Aßmann`
      gives `ASSM`. This is the one case where the code is longer than three letters.

    | `driver_name` | short |
    |---|---|
    | `Erik Jacobs` | `E.JAC` |
    | `erik jacobs` | `E.JAC` |
    | `Tsunoda` | `TSU` |
    | `Nyck de Vries` | `N.DEV` |
    | `Jean-Eric Vergne` | `J.VER` |
    | `Ana Le-Roux` | `A.LER` |
    | `Pato O'Ward` | `P.OWA` |
    | `Sébastien Buemi` | `S.BUE` |
    | `Kimi Räikkönen` | `K.RÄI` |
    | `Kimi Räikkönen` sent decomposed (`a`/`o` + U+0308) | `K.RÄI` |
    | `Виталий Петров` | `В.ПЕТ` |
    | `(Erik) Jacobs` | `E.JAC` |
    | `Jan Aßmann` | `J.ASSM` |
    | `Erik Li` | `E.LI` |
    | `Bo` | `BO` |
    | `E. Jacobs` | `E.JAC` |
    | `E.Jacobs` | `E.JAC` |
    | `E.JAC` | `E.JAC` |
    | `J.R. Hildebrand` | `J.HIL` |
    | `Tsunoda.` | `TSU` |
    | `D7` | `D7` |
    | `-` | *(empty)* |
    | `  ` (whitespace) | *(empty)* |

    The name cell is never narrower than the short name it holds and never ellipsizes it. When
    a row with every metric cell on still needs more width than the tower has, the row is
    clipped at the tower's right edge (rule 45).
48. **Full names, and the tower that fits them.** The full form is the trimmed name as the
    battle box shows it. A name containing `.` shows exactly as sent. A one-word name shows as
    is. Otherwise it is the first word's first character, `. `, and the remaining words joined
    by single spaces: `Erik Jacobs` → `E. Jacobs`, `Nyck de Vries` → `N. de Vries`. A missing,
    null, non-string, empty or whitespace-only `driver_name` gives an empty cell, as in rule 47.
    The tower does not ellipsize a full name; it **grows wider** to fit instead:
    - **Width.** The tower's minimum width is the larger of its configured width and its *fit
      width*. The configured width is the widget's `w` inside `/all` and the `--bc-tower-width`
      token on the standalone route. The fit width is the widest full-form name in the
      **class-filtered field**, every car that passes `?class=` (rule 10), rendered or not,
      measured in the row-name font at the on-camera row's weight, in the font style the name
      cell renders with (italic under `vintage70`), and including the letter spacing the name
      cell renders with, plus the widest non-name content (position, class
      bar and badge, gap, interval, metric cells, finish chip, and the row's own padding and
      gaps) of any row rendered since the last reset, plus the tower's own left and right
      border. The configured width already includes the border, so it is not added there.
    - **Font loading.** Names are measured only once the row-name font has loaded. Until then
      the tower computes no fit width and its minimum width is its configured width. When a
      font face of the row-name font's family finishes loading, the tower **re-measures the
      names only**: every full-form name it has measured since the last reset, including cars
      that have since left the field, is measured again in the loaded face, and the widest of
      those replaces the name part of the fit width. The remembered non-name width is kept as
      it is. The re-measured name part may come out narrower than before (a fallback face
      measures wider than the real one), and that narrower value stands; the minimum width
      still never falls below the configured width. A face of any other family finishing
      loading changes nothing. A font load is not a reset.
    - **A name font that fails to load.** When the row-name font fails to load, the tower
      stops waiting for it and measures the names in the face the browser falls back to,
      exactly as if the font had loaded; from then on it grows as usual. "Fails" means the
      tower's request for the measuring font is refused, or the browser reports a face of the
      row-name font's family failing to load. The tower does not request the font again
      after a failure. If a face of that family does finish loading later, that is an
      ordinary name-font load (above): the names are measured again in it.
    - **Grow only.** Between resets the fit width never decreases, except that a name-font load
      may correct the name part (above). A longer name joining the
      field, a driver swap to a longer name, or a wider cell value grows it at once. A car
      leaving the field, paging out of the cycling window, going off camera, or a cell value
      getting narrower changes nothing. Camera cuts, page turns and the on-camera highlight
      moving therefore never change the width.
    - **Reset.** The fit width is recomputed from scratch from the current snapshot when:
      - the tower mounts;
      - the session `mode` changes. `mode` is compared trimmed and case-insensitively, as in
        rule 45, against the mode of the last snapshot that carried one. A snapshot that is
        null, or whose `mode` is absent, null or empty after trimming, is skipped: it neither
        resets the width nor replaces the remembered mode. So a feed drop that comes back in
        the same mode is not a reset;
      - any of the tower's settings change: the class filter, `classDisplay`, `towerMetrics`,
        `maxRows`, `cycle`, `nameStyle`, the configured width, or (inside `/all`) the tower's
        `textScale`;
      - whether class tags show (rule 60) changes, from the setting or from a snapshot's
        `session.multiclass`;
      - the theme preset the tower renders in changes (`overlay-config.md` rule 59): the
        `data-theme` value of the tower's nearest ancestor that carries one, which is the
        document root on a render page and the preview stage in `/config`
        (`overlay-config.md` rule 62). When no ancestor carries one at mount (a render page
        writes the root attribute after the tower mounts), the tower watches the document
        root. The value is compared as written, and an absent attribute counts as `modern`:
        the root attribute appearing as `modern`, or the same value written again, is not a
        change; appearing as `vintage70` or `vintage80` is. The names are then measured in the new preset's row-name font,
        under the font-loading rules above: if that face has not loaded, the tower requests it
        and measures once it loads. Switching back to a face that loaded earlier measures at
        once.

      A new session in the same mode (one race, then the next) is **not** a reset: the
      protocol carries no session identity, so the tower cannot tell it apart from the same
      session continuing. A reset can shrink the tower, but never below its configured width.
    - **Placement.** The tower keeps its left edge and grows to the right. The header and the
      grouped-layout class headers span the same width. Inside `/all` the tower may extend
      past its slot's `w` and past the canvas edge; the overlay neither moves it nor shrinks
      its text to keep it inside. Anything past the canvas or the Browser Source edge is cut
      off by the page, trailing cells first (`overlay-config.md` rule 21).
    - **Height is untouched.** Names never wrap and the row height is the same as in short style. The tower's
      height bound, row budget, pins and cycling (`tower-overflow.md`) apply exactly as in
      short style.
    - **Short style sets no minimum width.** The tower renders at its configured width.

    Decision record: `docs/decisions/0018-tower-driver-name-style.md`.
49. **Table columns.** The tower lays its rows out as a table. Every row has the same cells in
    the same order, one per **column**, and each column has one width shared by every row,
    so a column's cells line up down the whole tower. The columns, in order, are:
    - `pos`: the position. Always shown.
    - `class`: the class chip. Shown while class tags show (rule 61).
    - `classpos`: the class-rank badge (rule 5). Inline layout only, while class tags show
      (rule 61).
    - `name`: the driver name. Always shown.
    - `gap`: the gap cell (rules 1, 2, 33, 35, 40, 42a). Always shown.
    - `interval`: the interval (rules 6, 34, 42b). Shown when the interval metric is on.
    - `pit`, `tire`, `fuel`: the strategy cells (rule 7). Each is shown when its
      `towerMetrics` toggle is on, it is not suppressed in a lap-timed mode (rule 8), and at
      least one car in the class-filtered field (rule 10) carries the column's field with any
      non-null value: `pit_stops` or `in_pit` for `pit` (so `pit_stops: 0` counts), a
      `tire_compound` or, outside a lap-timed mode, a `tire_wear` for `tire`, and `fuel` for
      `fuel`. Presence is a function of the current snapshot alone, with no hold: a producer
      that sends a field from the first snapshot has its column from the first snapshot.
      What a car's strategy cell shows is unchanged by the column: the pit cell reads `PIT`
      while the car is in the pit and `STOP n` once it has completed `n ≥ 1` stops, and is
      otherwise empty, so a car with `pit_stops: 0` that is not in the pit has an empty pit
      cell.
    - `finish`: the finish slot (rule 45). Shown while the tower reserves the slot, that is,
      in `race` or `results` mode with at least one car showing a finish chip.

    A car with nothing to show in a column that is shown gets an **empty cell** there, so its
    later cells stay in line. The empty cell carries no text and none of the filled cell's
    hooks (`data-testid`, `title`). Each column is as wide as its widest entry (rule 50),
    except `name`, which also takes the width left over when the row has spare room, so the
    columns after it sit against the tower's right edge. The gap and interval columns keep
    their fixed 8-character slot (rules 42a, 42b), so their width never depends on values. The
    position, chip and badge cells start at the left of their column; the gap and interval
    read right-aligned in theirs. When the columns together need more width than the tower
    has, the rows are clipped at the tower's right edge (rule 45); in full name style the
    tower widens instead (rule 48). In a Browser Source engine too old for shared grid tracks
    (OBS before 31), every row still renders every cell, but each row sizes its own cells, so
    columns line up only where their contents match. Decision record:
    `docs/decisions/0020-tower-table-columns.md`.
50. **Which rows size the columns.** A column's width comes from every car in the
    class-filtered field, rendered or not: the cars the cycling window (`tower-overflow.md`)
    is not showing and the cars `maxRows` leaves out count the same as the rows on screen. So
    a page turn, a camera cut, or the on-camera highlight moving never changes a column's
    width. The widths follow the current snapshot, with no hold and no reset rules of their
    own: a column grows when a wider entry appears in the field (a car of a longer class
    joins, a pit count gains a digit) and narrows when the field's widest entry leaves or
    gets narrower. In full name style the tower's width is rule 48's minimum width, which only
    grows between resets, and the name column takes what the other columns leave.
51. **Grouped layout.** In the grouped layout the columns are shared across **all** groups,
    not computed per group, so the columns of every class block line up with each other.
    Each group's header (rule 3) spans the full row width and takes no part in the columns.
    The `classpos` column is absent (rule 5).
52. **A long class name is capped.** The class column is as wide as the widest class chip in
    the field, but no chip is wider than the compact class chip's cap, 72px, the same cap the
    chip has everywhere it renders compact. A class name too long for the cap
    shows its beginning, cut at the end with an ellipsis (`LMGT3 PRO…`), never clipped from
    both ends, never wrapped. The chip keeps its class colour, and the producer's whole
    string stays the chip's text in the DOM (rule 30), so only the visible label is cut.
53. **The name column has no fixed minimum.** The name column is never narrower than the
    widest name the field needs in the current name style (rules 47, 48), and has no other
    minimum: in short style it is as narrow as the widest short code in the field, not a
    fixed width, so short names leave their room to the other columns. This holds with or
    without a finish slot reserved.
89. **The tower under `vintage70`.** On top of the base look (`overlay-config.md` rule 60) the
    tower takes the 1970s network look. Everything this rule does not name renders the base
    look. Decision record: `docs/decisions/0027-tower-vintage-pass.md`.
    - **Header.** A solid red rule, 4px high and in the preset's accent colour, runs along the
      bottom edge of the header, inside it: the header is no taller.
    - **Position numerals.** Every row's position numeral is warm white (`--bc-text-2`), the
      on-camera row's included; driver names stay gold.
    - **Class chip.** Each row's class chip leans with the type: its box is skewed 8° (top edge
      to the right), with a hard 2px black drop shadow, and its label is upright type, so the
      skew alone gives it its lean. Its colours and text are unchanged.
    - **On-camera row.** The row has no fill. Its driver name is white (`--bc-oncam-text`) at
      the on-camera weight, and a solid red bar 4px high in the accent colour runs along the
      row's bottom edge, inside the row. Every other cell, the class bar and class chip
      included, renders as it does on any other row.
    - **Re-cut.** When the highlight moves to a new driver it appears at once: there is no
      shine sweep, at either motion setting.
90. **The tower under `vintage80`.** On top of the base look the tower takes the 1980s timing
    page look. Everything this rule does not name renders the base look. Decision record:
    `docs/decisions/0027-tower-vintage-pass.md`.
    - **On-camera row in reverse video.** The row is filled solid in the preset's accent colour
      (lime), with no shadow. All of its text (position, class position, name, gap or lap time,
      interval, the pit-stop count and its `STOP` label, the tire compound and the fuel cell)
      renders in the dark on-accent colour (`--bc-text-on-accent`) with no text shadow or
      outline. The class chip and the `DNF` and `DQ` chips each sit on a solid black block that
      extends 2px past their cell on every side, so they read exactly as on any other row,
      outline included. The chequered flag keeps its own white-and-black squares and edge, with
      a 2px black ring around it. The `PIT` chip keeps its own red fill and dark text. The class
      bar keeps its colour.
    - **Lap-time flash in reverse video.** While a lap time flashes (rule 41), its cell is a
      solid block of the flash colour with the time in the dark on-accent colour and no text
      shadow: purple for a session or class best, green for a personal best, and for a plain
      lap the preset's white (`--bc-text-2`), not its yellow-green, so a plain lap and a
      personal best cannot be confused. The block extends 2px past the cell on every side, and a
      1px black ring surrounds it, so it stands out on the plate and on the lime on-camera row
      alike; neither changes the cell's size, so no column moves.
    - **Re-cut.** When the highlight moves to a new driver it appears at once: there is no
      shine sweep, at either motion setting.

### Battle box (`/battle`)

11. Centers on the `subject`, showing `gap_ahead` / `gap_behind` and a `battle_intensity` meter.
12. **Idle behavior splits by cause.** Outside a racing mode (qualifying/practice/takeover) the
    battle box renders **nothing** at all. Within a racing mode but with no adjacent car to fight, it
    renders an **explicit placeholder** (e.g. "CLEAR AIR"). Both count as idle for `hideWhenIdle`.
36. **Caution hides the battle box.** While the producer-sent `session.full_course_yellow` or
    `session.safety_car` is `true`, the battle box renders **nothing**, exactly as outside a racing
    mode (rule 12), whatever `relationship` holds, and counts as idle for `hideWhenIdle`. A local
    `flag: "yellow"` alone does not hide it, and an absent `session` or absent/false caution fields
    leave the box to rules 11–12 and 37. When caution clears, the box renders the current snapshot
    at once.
37. **Exit grace.** When the battle goes from active (rule 11) to idle — both gaps null — while the
    subject's `slot_id` is unchanged, the box keeps rendering that **last active battle**: its gaps,
    ahead/behind names, and intensity frozen at the last snapshot where it was active, for
    `idleGraceSeconds` (default 5; `overlay-config.md` rule 36). It is not idle during the grace. If
    the battle becomes active again within the grace, the box renders the live numbers and the exit
    is cancelled; the next active → idle transition starts a fresh full grace. When the grace runs
    out the box renders the clear-air placeholder (rule 12). `idleGraceSeconds: 0` turns the hold
    off — the placeholder renders on the first idle snapshot.
37a. **Changing the grace length mid-hold.** Setting `idleGraceSeconds` to `0` while a hold is
    running ends it at once: the next snapshot renders the clear-air placeholder. Any other new
    value leaves the running hold on its original length and applies from the next exit.
37b. **A subject without a `slot_id` gets no hold.** The grace is keyed to `subject.slot_id`
    (rule 38), so when the subject has none, an active → idle transition renders the placeholder at
    once.
38. **The grace never outlives its subject.** A change of `subject.slot_id` ends any running grace
    at once: the box renders the new subject's own snapshot — its battle if active, the placeholder
    if not — and never shows the previous subject's frozen numbers against the new subject. Caution
    (rule 36) and leaving a racing mode (rule 12) likewise end the grace at once.
39. **Auto-hide follows the grace.** With `hideWhenIdle` on, the battle box stays rendered through
    the grace (rule 37) and drops out only when the grace runs out, the subject changes to an idle
    one (rule 38), or caution or a non-racing mode begins. Decision record:
    `docs/decisions/0013-battle-box-exit-grace.md`.
59. **Malformed `vehicles[]` entries are skipped.** The battle box treats a `vehicles[]` entry that
    is not an object — `null`, a number, a string, an array — or is an object without a usable
    `slot_id` as absent, as rule 14a does: it never matches the subject. An entry without a usable
    `slot_id` or without a usable `position` (`protocol-contract.md` rule 21) is also never named
    as the car ahead or behind. The box renders the subject's class chip and the ahead/behind
    names from the remaining entries; a subject whose own entry has a usable `slot_id` and no
    usable `position` still shows its class chip, and both neighbours render as `—`. Among entries
    sharing a `slot_id`, the subject's entry is the first listable one (`protocol-contract.md`
    rule 21). A `vehicles`
    that is not an array is treated as empty (`protocol-contract.md` rule 21): no class chip, and
    both neighbours render as `—`.
65. **The battle box's on-camera name.** The name in the focus slot, and in the idle placeholder's
    line (`CLEAR AIR — <name>`), is picked by rule 14b: `subject.driver_name` when present;
    otherwise the `driver_name` of the `vehicles[]` entry whose `slot_id` matches the subject's,
    when present; otherwise no name. A subject with no `slot_id` (absent or `null`) matches no
    entry, even one that also lacks a `slot_id`. The same entry gives the class chip (rule 30) and
    the position that rule 68 reads, so such a subject shows no class chip and both neighbours
    render as `—`. The name shows in the full form of rule 48. With no name, the focus slot is
    empty and the idle line reads `CLEAR AIR — ON-CAMERA CAR`; the battle still renders.
    Subject validity (rule 14) does not gate the box — rules 11–12 and 36–39 decide whether it
    renders. The ahead and behind slots' names are rule 68's; this rule supplies only the subject's
    position they read. During an exit grace (rule 37) the box renders the held battle's snapshot,
    so its name is the held snapshot's. Outside a hold, in `/all` the battle box, the driver
    lower-third and the HUD strip show the same name for the live snapshot.
68. **Neighbour names.** The ahead slot shows the name of the car whose `position` is exactly
    the subject's position minus 1, and the behind slot the car at exactly the subject's position
    plus 1. A subject with no matching vehicle (rule 65's match) or no `position`, or a position with no car, leaves
    that slot at `—`. A neighbour's `driver_name` counts as present by the same test as rule 14b:
    a string with at least one non-whitespace character. A present name renders as the battle box
    renders every name (rule 48's full form); a missing one — `""`, a whitespace-only string,
    `null`, absent, a number, a boolean, an object or any other non-string — renders `—`. The
    empty cell rule 48 gives a missing name is the tower's; the battle box's slots show `—`. Each
    slot is judged on its own. The focus slot is outside this rule.

### Subject-driven lower-thirds (`/driver` #21, `/qualifying` #22)

A lower-third is the bottom-of-screen name-tag for the driver currently on camera. Both are
subject-driven and **fire on a camera cut** (a change of `subject.slot_id`), not continuously.
Full rules: `docs/decisions/0002-lower-third-widgets.md`.

13. **Visibility layering** (every gate must pass): `config.visible` → trigger (`dwell` |
    `persistent`) → subject validity / idle → render. `?show=`/`?hide=` override `visible`.
14. **Subject resolution:** *valid* = `slot_id` resolves to a `vehicles` entry; *degraded* =
    `driver_name` present (rule 14b) but `slot_id` unresolved (render name only for #21, treat as
    idle for #22); *invalid* = neither → idle. Keyed off `slot_id`, never `driver_name`.
14a. **Malformed `vehicles[]` entries are skipped.** An entry of `vehicles[]` that is not an object —
    `null`, a number, a string, an array — or is an object without a usable `slot_id`
    (`protocol-contract.md` rule 21) never matches a `slot_id` and never stops a
    subject-driven widget from rendering: resolution runs over the remaining entries exactly as if
    the malformed one were absent, wherever it sits in the array. A `position` plays no part in
    resolution, except that among entries sharing a `slot_id` the first listable one is the match
    (`protocol-contract.md` rule 21): an entry with a usable `slot_id` and no usable `position`
    resolves the subject, and rules 18 and 54 show no position and render the rest as normal. This holds for #21, #22, the
    on-board HUD's identity strip (rule 57), and the subject resolution `/all` runs on every
    snapshot. A `vehicles` that is not an array resolves nothing — the subject is degraded or
    invalid by rule 14 — as `protocol-contract.md` rule 21 states for every widget.
14b. **The subject's name.** A `driver_name` counts as present only when it is a string with at
    least one non-whitespace character; `""`, a whitespace-only string, `null`, absent, or a
    non-string all count as missing. The name a subject-driven widget (#21, #22, the HUD strip, the
    battle box's focus slot and idle line — rule 65) shows is `subject.driver_name` when present;
    otherwise, for a valid subject, the resolved vehicle's `driver_name` when present; otherwise no
    name. So:
    - A valid subject whose `subject.driver_name` and vehicle `driver_name` are both missing stays
      valid. #21 renders its position and class chip with an empty name; #22 renders its timing
      with an empty name; the HUD strip shows its other enabled fields and no name.
    - A subject whose `slot_id` is unresolved and whose `subject.driver_name` is missing is
      *invalid*: #21 and #22 are idle, the HUD has no strip, and in `/all` the driver lower-third
      has no card up, so the hand-off (rule 24) holds nothing back.
15. **Edge-triggered camera cut:** fire only when the new `slot_id` differs from the previous
    snapshot's, including `null→X`, `X→Y`, `X→null`. `A→A` does nothing; `A→null→A` re-fires.
16. **Trigger modes:** `dwell` (default) — fire on change, show for `dwellSeconds`, then auto-hide
    even if the camera stays; a new change resets the dwell **in place** (no hide→show flicker).
    `persistent` — show whenever the subject is valid or degraded (rule 14), no timer.
    A change of `trigger` takes effect at once, without waiting for a camera cut:
    - **`dwell` → `persistent`:** the card follows the `persistent` rule from the switch — it is
      up whenever the subject is valid or degraded, whether or not its dwell had already ended,
      and any running dwell timer stops.
    - **`persistent` → `dwell` with the card up:** the switch starts a fresh dwell. The card stays
      up, in place with no hide→show flicker, for one `dwellSeconds` counted from the switch,
      then auto-hides as any dwell does. After that the unchanged subject does not bring it back
      (rule 15); a camera cut during the fresh dwell resets it in place as above.
    - **`persistent` → `dwell` with the card down** (the widget treats the subject as idle —
      rules 14, 19): nothing fires; the card stays down until the next fire.

    A change of `trigger` is not a connect (rule 17): `showOnConnect` does not apply to it, so
    the fresh dwell starts even with `showOnConnect` off, and the switch neither consumes nor
    re-fires the connect fire — the next real camera cut fires as normal. A #22 class-best flash
    (rule 19) is always a dwell; a change of `trigger` does not touch it.
17. **On (re)connect:** fire once for the first subject that widget treats as active
    (`showOnConnect`, default true), then follow change detection. A subject the widget treats as
    idle does not use up the connect fire. #21 is active for a valid or degraded subject (rule 14),
    so a degraded subject fires its name-only card on connect. #22 is active only for a valid
    subject with timing while it is mode-eligible (rules 14 and 19), so a degraded subject does not
    fire on connect, and an overlay that connects during a race makes its connect fire on the
    first such subject once the session turns eligible. A class-best fire does NOT trigger on
    connect.
18. **#21 driver lower-third** renders identity: name, position (`P4`), class chip (while class
    tags show, rule 62). Fires on any subject change to a valid or degraded subject (rule 14), in
    all modes. Degrades to name-only when `slot_id` unresolved.
    The position renders as `P` plus the vehicle's `position` only when that is a positive integer;
    `0`, a negative or fractional number, a numeric string (`"3"`), null or absent show no position,
    and the rest of the card renders as normal.
19. **#22 qualifying/sector lower-third** renders timing: best/last lap, per-sector times, and
    target/delta when present. **Mode-gated** by `modes` (default `["qualifying","practice"]`).
    Independently, when the producer flags the subject's `notable.class_best_lap` true, it fires a
    class-best flash even in a race (`fireOnClassBest`, default true) — firing on the transition to
    true, never by scanning lap times. Idle when subject invalid, no timing at all, or mode-gated
    out with no class-best fire.

### Race Control (`/racecontrol`, session status #25)

20. Renders **only** flag / FCY / Safety-Car / sector-yellow status from the optional `session`
    object (`flag`, `full_course_yellow`, `safety_car`, `sector_flags` — rule 44). It does **NOT**
    render the timed/lap progress readout — that lives in the standings-tower header (rule 9).
    Renders whenever visible and there is flag/FCY/SC/sector-yellow content, in every mode. Not
    a lower-third and not class-aware — the trigger/`modes`/`classDisplay` knobs are inert for it.
    The standalone `/racecontrol` route loads the profile named by `?profile=` only for its
    motion mode and theme (`overlay-config.md` rules 10 and 59) and reloads it live.
44. **Sector yellows.** Each `session.sector_flags` entry that is the string `yellow` (trimmed,
    case-insensitive) is a local yellow in sector *index + 1*. When at least one sector is yellow,
    Race Control shows one chip (`data-testid="racecontrol-sector-yellow"`) reading `YELLOW`
    followed by each yellow sector as `S<n>` in ascending order, separated by spaces —
    `YELLOW S2`, `YELLOW S1 S3`. Any other entry (`green`, `none`, an unknown string, a
    non-string) is not a yellow, and an absent, null, or non-array `sector_flags` shows no chip.
    The chip alone is content: with no flag, FCY, or SC, Race Control still renders to show it.
    It sits beside, and is independent of, the `flag` readout — a `yellow` flag and a sector chip
    both show. Under a full-course yellow or a safety car the chip is not shown (the FCY/SC
    badges already cover the whole course). A sector yellow does not start the caution pulse,
    which stays FCY/SC only. Decision record: `docs/decisions/0016-local-yellow-fields.md`.
95. **Race Control under `vintage70`.** On top of the base look (`overlay-config.md` rule 60)
    the strip takes the 1970s network look. Everything this rule does not name renders the base
    look: the black plate, the italic type with its small-text extrusion, and every colour, the
    flag swatch colours and the chips' amber included. Decision record:
    `docs/decisions/0031-racecontrol-vintage-pass.md`.
    - **Red rule.** A solid red rule, 4px high and in the preset's accent colour, runs along the
      bottom edge of the strip, inside it: the strip is no taller. It shows under every flag, red
      included; the flag's meaning stays with its swatch and its label.
    - **Flag swatch.** The swatch leans with the type: it is skewed 8° (top edge to the right).
      Its colour, the chequered squares included, is unchanged.
    - **Chips.** The `FULL COURSE YELLOW`, `SAFETY CAR` and sector-yellow chips are not skewed:
      their italic type already leans. The `FULL COURSE YELLOW` chip's dark text has no
      extrusion, and the chip casts a hard 2px black drop shadow.
    - **Caution.** Under a full-course yellow or a safety car the amber ring pulses as under
      `modern`, at the same timing, but the strip has no soft amber glow around it. Reduced motion
      shows the same steady ring as under `modern`.
96. **Race Control under `vintage80`.** On top of the base look the strip takes the 1980s
    timing-page look. Everything this rule does not name renders the base look: the Scoreboard
    red plate with its hard black shadow, the thin black outline on text, and every colour.
    Decision record: `docs/decisions/0031-racecontrol-vintage-pass.md`.
    - **Typeface.** The flag label and every chip are set in the preset's display face (Oswald,
      `--bc-font-display`), not its timing-page face (VT323), at the same size and weight as
      under `modern`. The strip is a box sized to its own text (`overlay-config.md` rule 60), so
      its size follows the typeface; every set length (padding, gaps, swatch size) is unchanged.
    - **Flag swatch.** The swatch keeps its own colour, chequered squares and edge, with a 2px
      black ring around it, so a red flag's swatch shows on the red strip.
    - **Chips.** The `FULL COURSE YELLOW` chip's dark text has no outline.
    - **Caution.** As under `vintage70` (rule 95): the ring pulses as under `modern`, and the strip
      has no soft amber glow around it.

### On-board HUD (`/onboard`, #26)

The HUD is one plate with two parts: the **identity strip** on top (rules 23, 54–57) and the
**telemetry row** below (rule 21). Each part renders on its own content; neither needs the other.
Decision record: `docs/decisions/0021-onboard-identity-without-telemetry.md`.

21. The telemetry row renders the subject's live `subject.telemetry`: throttle/brake fill bars
    (clamped `[0,1]`), speed, and gear (`0`→`N`, `-1`→`R`). Reads telemetry every tick. When there
    is no telemetry content (no `subject.telemetry`, or every field missing or garbage — e.g. a
    parked car) the telemetry row is absent: no bars, no SPEED, no GEAR. The identity strip still
    renders if it has content (rule 56).
22. **Speed unit** (`speedUnit`, `kmh` default | `mph`; `?unit=mph` on the standalone route). The
    producer emits canonical km/h; the widget converts to mph deterministically when selected.
23. **Driver/vehicle identity** (`driverInfo`) — toggles `name` / `number` / `position` / `class` /
    `make` / `model` independently. `name`, `number`, and `position` are on by default; the rest
    are off. A saved `driverInfo` that lacks a field, or holds a non-boolean for it, takes that
    field's default — a saved `driverInfo` with no `position` shows the position. `/config`
    shows one checkbox per field in the onboard widget's "driver info shown" group, each with its
    own help copy (`overlay-config.md` rules 16, 19). The fields come from the subject and its
    resolved `vehicles[]` entry (rule 57).
24. **Hand-off** (`waitForLowerThird`, default true): in `/all`, while the driver lower-third (#21)
    is visible and its card is up, the HUD holds back part or all of itself so the driver's name
    never shows in both at once. What it holds depends on the card's trigger mode (rule 16):
    - **`dwell`:** the whole HUD — identity strip and telemetry row alike — holds off for the
      dwell, then reveals when the card wipes out. A re-fire (a camera cut) holds it again. This
      holds whether or not the snapshot carries `subject.telemetry`.
    - **`persistent`:** only the identity strip (and so its `ON BOARD` label, rule 55) holds off;
      the telemetry row keeps rendering live, per rule 21, for as long as the card is up. The card
      is up whenever the subject is valid or degraded (rule 14), so the strip stays held for both,
      and a camera cut changes the row to the new subject's telemetry with the strip still held.
      An invalid subject takes the card down; there is then no strip to hold (rule 57) and the HUD
      renders per rule 56. The HUD does not move the row out of the card's way — where the two
      sit on screen is the broadcaster's layout.

    The hold follows the mode configured now and whether the card is up now, so a change of
    `trigger` changes what is held at once. Switching `persistent` → `dwell` with the card up
    starts the card's fresh dwell (rule 16), so the whole HUD holds for that dwell and reveals
    when the card wipes out. With `waitForLowerThird` off, or the driver
    lower-third not `visible`, nothing is held. Only applies in `/all`; the standalone `/onboard`
    route has nothing to wait for. Decision record:
    `docs/decisions/0021-onboard-identity-without-telemetry.md` (amendment).

    Turning the hold off and on again leaves nothing stale: from the moment `waitForLowerThird`
    is on and the driver lower-third `visible` again, the hold matches the card as it is right
    then — held while the card is up, not while it is down — and holds what the card's mode says
    above (the whole HUD for `dwell`, only the identity strip for `persistent`). What the card
    itself did while the hold was off (fires, camera cuts, dwells ending, per rules 15–17) is what
    decides whether it is up. For example:
    - `waitForLowerThird` unticked during a `dwell` and ticked again before that dwell ends: the
      HUD is held for the rest of that same dwell, not a new one; ticked after it ends: nothing
      is held until the card next fires.
    - A camera cut while unticked: the card fires its dwell at the cut, so ticking again inside
      that dwell holds the HUD until it ends, measured from the cut. The same holds for an
      `A → invalid → A` sequence while unticked, which re-fires the card (rule 15).
    - The driver lower-third hidden and made `visible` again: the card comes back as on a
      (re)connect (rule 17). A `persistent` card is then up whenever the subject is valid or
      degraded, so the strip is held; a `dwell` card with `showOnConnect` on fires, so the whole
      HUD is held for a full `dwellSeconds`, and with it off nothing is held until the next cut.
54. **Identity strip content and order.** Left to right: the `ON BOARD` label (rule 55), position,
    car number, driver name, class chip (while class tags show, rule 63), then make and model as
    one line. Each enabled field shows only when it has a value. The name is the subject's name as
    rule 14b picks it (`subject.driver_name`, falling back to the vehicle's `driver_name`), in the
    HUD's name format; the others are read off the resolved vehicle.
    Position renders as `P` followed by the vehicle's overall `position` — `P4`. A `position` that
    is null, absent, or anything other than a positive integer shows no position, and the rest of
    the strip renders as normal.
55. **The ON BOARD label belongs to the strip.** The label reads `ON BOARD` and is the first item of
    the identity strip. It renders exactly when the strip renders — when at least one enabled
    `driverInfo` field has a value. With every field off, or no enabled field resolvable, there is
    no strip and no label; the label never renders on its own and never sits on the telemetry row.
    It is not a `driverInfo` field and has no toggle.
56. **What the HUD renders.** The HUD shows whatever of its two parts has content:

    | Identity content | Telemetry content | HUD renders |
    |---|---|---|
    | yes | yes | strip on top, telemetry row below |
    | yes | no | strip only |
    | no | yes | telemetry row only, no label |
    | no | no | nothing |

    "Nothing" is the HUD's idle state: no plate, no placeholder text. The hand-off (rule 24) can
    hold off any of the first three rows. Under a `dwell` card it holds the whole HUD; under a
    `persistent` card it holds only the strip, so the HUD renders as if it had no identity
    content — telemetry row only, or nothing.
57. **Subject resolution for the strip** follows rules 14–14b. A *valid* subject (`slot_id` resolves
    to a `vehicles[]` entry) shows every enabled field that has a value. A *degraded* subject
    (`driver_name` present per rule 14b, `slot_id` unresolved) shows the label and the name only — no position,
    number, class, or car, whatever the toggles say. An *invalid* subject (neither) has no strip.
    The vehicle is found by `slot_id`, never by `driver_name`.
58. **Idle and composition.** The HUD has no `hideWhenIdle` predicate: an idle HUD (rule 56) already
    draws nothing, so `/config` offers no "Hide when idle" for it and a saved `hideWhenIdle: true`
    on it changes nothing. In `/all`, its slot is placed whenever the widget is `visible`, even
    while the HUD is idle or held off, and the strip reads that widget's saved `driverInfo`. The
    standalone `/onboard` route uses the default `driverInfo` (name, number, position).
97. **The HUD under `vintage70`.** On top of the base look (`overlay-config.md` rule 60) the HUD
    takes the 1970s network look. Everything this rule does not name renders the base look, the
    italic lean of every label included. Decision record:
    `docs/decisions/0032-onboard-vintage-pass.md`.
    - **Plate.** A solid red rule, 4px high and in the preset's accent colour, runs along the
      bottom edge of the HUD's plate, inside it, whichever of the HUD's parts show (rule 56): the
      plate is no taller.
    - **Car number.** The number tile keeps its accent-red fill and leans with the type: its
      box is skewed 8° (top edge to the right), with a hard 2px black drop shadow, and its
      numeral is upright type, so the skew alone gives it its lean. The numeral is white
      (`--bc-oncam-text`), with no text shadow.
    - **Class chip.** Its box is skewed 8° (top edge to the right) with a hard 2px black drop
      shadow, and its label is upright type in the preset's display face (Barlow Condensed,
      which is bundled with an upright cut), so the skew alone gives it its lean. Its colours,
      text, type size and weight are unchanged.
    - **Bar and readout labels.** `THROTTLE`, `BRAKE`, the speed unit and `GEAR` are set in the
      preset's display face (Barlow Condensed), still italic, at the same size, weight and
      tracking, so each bar label fits its column and clears its bar.
    - **Gear.** The gear numeral is gold (`--bc-text`), like the speed, not the accent colour.
    - **Bars.** The throttle and brake bars have square ends, and each track, its fill
      included, is cut into segments 10px wide with 3px gaps (measured across the slant), the
      gaps leaning 14° from upright, top edge to the right. The fill colours are unchanged.
    - **Paint only.** The rule, tiles and segments add no size and move nothing, and the HUD
      moves as it does under `modern`, the bars' per-tick smoothing included, at either motion
      setting. Boxes sized to their text follow rule 60's second exception.
98. **The HUD under `vintage80`.** On top of the base look the HUD takes the 1980s timing page
    look. Everything this rule does not name renders the base look. Decision record:
    `docs/decisions/0032-onboard-vintage-pass.md`.
    - **Plate.** The HUD sits on the preset's black widget plate (`--bc-plate`), not the red
      Scoreboard header colour, with the preset's hard plate shadow. The plate's opacity is the
      widget's `plateAlpha` itself (0.82 by default), where `modern` and `vintage70` paint the
      HUD at the header opacity (0.94 at the default).
    - **ON BOARD label in reverse video.** The label is a solid block of the live colour
      (`--bc-live`) that extends 4px past the label on every side, with the text in the dark
      on-accent colour (`--bc-text-on-accent`) and no text shadow or outline.
    - **Position in reverse video.** The position (`P4`) is a solid block of the preset's
      white (`--bc-text-2`) that extends 4px past it on every side, with the text in the dark
      on-accent colour and no text shadow or outline. When both show, the label's block and
      the position's block meet edge to edge.
    - **Car number.** The tile keeps its lime fill and dark numeral, with no text shadow or
      outline.
    - **Driver name.** The name is the preset's yellow-green (`--bc-text`).
    - **Bars.** The throttle and brake bars have square ends, and each track, its fill
      included, is cut into upright blocks 10px wide with 2px gaps. The fill colours are
      unchanged.
    - **Paint only.** The blocks and segments add no size and move nothing, and the HUD moves
      as it does under `modern`, the bars' per-tick smoothing included, at either motion
      setting. Boxes sized to their text follow rule 60's second exception.

### Race update box (`/updates`, #27)

The race update box shows the producer's race events (fastest laps, leader changes, retirements,
penalties) one card at a time. It reads only the snapshot's `race_events`
(`protocol-contract.md` rule 22) and never derives an event from `vehicles[]` or from changes
between snapshots. Decision record: `docs/decisions/0023-race-update-box.md`.

69. **Which entries are events.** An absent, null, or non-array `race_events` holds no events.
    An entry of the array is an **event** only when all of these hold:
    - it is an object, and not an array;
    - its `id` is a string with at least one non-whitespace character;
    - its `type` is exactly one of `fastest_lap`, `leader_change`, `retirement`, `penalty`
      (compared as sent: case-sensitive, untrimmed);
    - its `driver_name` is present by the test of rule 14b;
    - for `fastest_lap`, `lap_time` is a finite number greater than 0; for `retirement`,
      `finish_status` is exactly the integer `2` or `3`; for `penalty`, `penalty` is a string
      with at least one non-whitespace character.

    Any other entry is skipped: it is never shown or queued, and it does not stop the box
    reading the entries around it. Optional fields never disqualify an entry: a
    `vehicle_class` or `detail` that is not a string with a non-whitespace character counts as
    absent, and the box does not read `slot_id`. Ids are compared as exact strings. Only an
    event's id is ever marked seen (rules 71–72): a skipped entry marks nothing, so the same id
    sent later as a valid event is a new event.
70. **The card.** The box shows one event at a time as a card (`data-testid="race-update"`)
    carrying `data-event-id` (the event's `id`) and `data-event-type` (its `type`). The card
    holds, in order:
    - **Label** (`data-testid="update-label"`): `FASTEST LAP` for `fastest_lap`, `NEW LEADER`
      for `leader_change`, `RETIRED` for a `retirement` whose `finish_status` is `2`,
      `DISQUALIFIED` for one whose `finish_status` is `3`, and `PENALTY` for `penalty`. A
      **class event**, one whose `vehicle_class` is a string with a non-whitespace character,
      puts that class first, trimmed and uppercased (locale-independent `toUpperCase`), then
      one space: `GT3 FASTEST LAP`, `LMGT3 PRO-AM NEW LEADER`, `GT3 RETIRED`. Any other event is
      overall and its label has no prefix. The prefix is part of the label, not a class tag:
      hiding class tags (rule 60) does not remove it.
    - **Name** (`data-testid="update-name"`): the event's `driver_name` in the full form of
      rule 48: `Kevin Estre` → `K. Estre`, `Estre` → `Estre`, `E.Jacobs` → `E.Jacobs`.
    - **Value** (`data-testid="update-value"`): for `fastest_lap`, `lap_time` formatted exactly
      as the tower's lap-time flash formats a lap (rule 40): `208.977` → `3:28.977`, `58.204`
      → `58.204`. For `penalty`, the `penalty` string trimmed and otherwise verbatim
      (`Drive-through`, `+5s`). A `leader_change` or `retirement` card has no value element.
    - **Detail** (`data-testid="update-detail"`): the `detail` string, trimmed and otherwise
      verbatim, when it has a non-whitespace character; otherwise the card has no detail
      element.

    The card shows nothing else from the event. While no card is up the box draws nothing: no
    plate, no placeholder.
71. **Events already listed when the box starts are never shown.** The first non-null snapshot
    the box receives after it mounts is its **baseline**: every event in it is marked seen and
    none is shown. That holds whatever the snapshot carries: with no `race_events` the baseline
    is empty, and every event in a later snapshot is new. So an OBS reload, a page refresh, or
    the widget being switched on in `/all` never replays an event the producer is still
    listing. The seen ids last as long as the box stays mounted: a feed that drops and resumes
    takes no new baseline, and an event first listed after it resumes is new. In the `/config`
    preview (`overlay-config.md` rule 51) there is no baseline: the first snapshot's events
    are new.
72. **Each event shows once.** After the baseline, the events in a snapshot whose id has not
    been seen are **new**. The box marks each one seen and takes them in array order: a new
    event shows at once when no card is up, and otherwise joins the end of the **waiting
    queue**. An id that has been seen never shows again: not when the producer re-sends it, not
    when it leaves `race_events` and comes back, and not when a second entry in the same
    snapshot repeats it.
73. **Dwell, queue, and hiding.** A card stays up for the box's dwell (`dwellSeconds`, default
    8; `overlay-config.md` rule 50), counted from when it appeared, whatever snapshots arrive in
    the meantime and whether or not its event is still listed. When the dwell ends, the first
    waiting event replaces it at once (rule 74), and its own full dwell counts from that swap;
    with nothing waiting, the box hides. At most **5** events wait behind the card that is up: when a sixth would join, the
    oldest waiting event is dropped. A dropped event is never shown and stays seen. A change of
    `dwellSeconds` applies from the next card; the card that is up keeps the dwell it started
    with. The box shows events in every `mode`; it has no mode gate, no trigger, and no
    show-on-connect.
74. **Reveal.** Each card enters and leaves with the lower-thirds' skewed bar-wipe (the shared
    lower-third shell). When a waiting card replaces the one on screen, the swap is two plates,
    not new text in the old one: at the same moment, the outgoing card's plate plays its
    wipe-out and the incoming card's plate plays its wipe-in, as a camera cut does on the
    driver lower-third. The incoming card is up, and its dwell is counting, from that moment.
    Under reduced motion (`overlay-config.md` rule 10) cards appear and disappear without the
    wipe.
75. **Routes and composition.** The standalone `/updates` route is a transparent overlay route.
    It connects to the producer the way every render page does (`?src=`, then the default), loads
    the profile named by `?profile=` and reads its `updates` widget's `dwellSeconds`, and uses
    8 when there is no profile or the profile fails to load. Inside `/all` the box is the
    `updates` widget: while `visible` it is mounted at its configured geometry and reads its own
    `dwellSeconds`; while not `visible` it is not mounted. The box has no idle predicate: with no
    card up it already draws nothing, so `/config` offers no "Hide when idle" for it and a saved
    `hideWhenIdle: true` on it changes nothing (as for the HUD, rule 58).

### Info panel (`/info`, #62)

The info panel is a compact strip: a header naming the event and a row of free text that
rotates one line at a time. It reads only the snapshot's `event`, `info_lines` and
`session.weather` (`protocol-contract.md` rules 23–24) and the broadcaster's own lines from its
profile entry (`overlay-config.md` rule 52). It derives nothing from `vehicles[]` or from any
other `session` field. It changes producer text only as rules 76–77 and 88 say: it trims every
part and line, uppercases the header and the weather card, and shows a repeated line once. Decision record: `docs/decisions/0024-info-panel.md`.

76. **The header.** An absent, null, or non-object `event` (an array is not an object) has no
    event fields. Of an object `event`, each field is a **part** only when it holds:
    - `round`: a number that is an integer of at least 1 (`3`, not `0`, `-1`, `2.5`, `"3"` or
      `true`). The part reads `ROUND ` followed by the number: `ROUND 3`.
    - `name`: a string with at least one non-whitespace character. The part is the string
      trimmed.
    - `track`: a string with at least one non-whitespace character. The part is the string
      trimmed.

    Any other value counts as absent and does not stop the other fields being read. The header
    (`data-testid="info-header"`) joins the parts that hold, in the order round, name, track,
    with ` · ` (a space, U+00B7 MIDDLE DOT, a space) between two parts and nowhere else, and
    uppercases the result with locale-independent `toUpperCase`: `{ round: 3, name: "Spa 6
    Hours", track: "Spa-Francorchamps" }` gives `ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS`;
    with only `name` and `track`, `SPA 6 HOURS · SPA-FRANCORCHAMPS`; with only `round`,
    `ROUND 3`. Whitespace inside a part is kept as sent. With no part, the panel has no header
    element.
77. **The line list.** The panel's **line list** is built in this order:
    1. the producer's lines: each entry of `info_lines` that is a string with at least one
       non-whitespace character, trimmed and otherwise verbatim (case kept), in array order.
       An absent, null, or non-array `info_lines` gives none, and any other entry (blank, a
       number, null, an object) is skipped without stopping the entries around it;
    2. then the broadcaster's lines: the `info` widget's `lines` (`overlay-config.md` rule
       52), in their stored order;
    3. then, last, the **weather card** (rule 88), when the `info` widget's `weatherCard` is on
       and the snapshot's weather has a part.

    A text line (a producer's or a broadcaster's) equal (exact string comparison, after
    trimming) to a text line earlier in the list is dropped, so a line the producer and the profile both carry, or that either repeats, appears
    once, at its first place. The broadcaster's lines do not depend on the producer: they are in
    the list while no snapshot has arrived, and while the snapshot carries no lines.
78. **Layout and hiding.** The panel (`data-testid="info-panel"`) holds, in order, the header
    (rule 76) and the line row, whose line element (`data-testid="info-line"`) shows the current
    line of the rotation (rule 79). With no header part it has the line row only; with an empty
    line list it has the header only and no line element; with neither it draws nothing at all:
    no panel element, no plate, no placeholder. The line row is one line high: a line too long
    for the panel's width is cut off with an ellipsis and never wraps or grows the panel. The
    panel shows in every `mode`; it has no mode gate, no trigger, and no class awareness.
79. **Rotation.** The line row shows one line of the line list at a time. When the list first
    has a line (at mount, or after it was empty), its first line shows. A line stays up for the
    panel's dwell (`dwellSeconds`, default 8; `overlay-config.md` rule 52), counted from when it
    appeared, and when the dwell ends the next line in the list replaces it, wrapping from the
    last line to the first. While the list holds exactly one line, that line stays up and no
    dwell runs, however long it has already been up; when the list grows from one line to more,
    the shown line's dwell starts at that moment, from zero. So a line alone from mount (0 s) that
    a second line joins at 3 s stays up until 11 s, and with `[A, B]` and `A` up
    from 0 s, a list that shrinks to `[A]` at 5 s and grows back to `[A, B]` at 6 s shows `B`
    at 14 s, not at 8 s. A change of `dwellSeconds` applies from the next line: the line that is up keeps the
    dwell it started with. A snapshot that gives the same line list, in the same order, changes
    nothing.
80. **A changed line list.** Whenever a snapshot or a config change gives a line list that
    differs from the current one (a line added, removed, edited, or moved):
    - if the line on screen is still in the new list, it stays up and its running dwell is not
      restarted; the rotation continues from its place in the new list, so the line after it in
      the new list comes next;
    - otherwise the line at the same place (index) in the new list replaces it at once and gets
      a full dwell (unless it is the only line, rule 79), and when the new list is too short to
      have that place, the new list's first line does. The place is the index, not the next line
      of the old list that survives: whatever line the new list holds at that index shows;
    - when the new list is empty, the line element goes (rule 78);
    - while the new list holds one line, no dwell runs (rule 79).

    Lines are compared by identity: a text line is its text, and the weather card is the card,
    whatever its text says (rule 88). So a snapshot whose only change is the weather's values
    gives the same line list, and the card entering or leaving the list is a change like any
    line's.

    So, with `[A, B, C]` and `B` up, a new list `[X, A, B, C]` keeps `B` up and `C` comes next;
    a new list `[A, C]` replaces `B` with `C` at once; and with `C` up, a new list `[A, B]`
    replaces it with `A` at once. With `[A, B, C, D]` and `B` up, a new list `[X, A, C, D]`
    replaces `B` with `A` (index 1), not with `C`.
81. **Motion.** The panel enters and leaves with the lower-thirds' skewed bar-wipe (the shared
    lower-third shell): it plays the wipe-in when it goes from drawing nothing to drawing
    something, and the wipe-out when it goes back to drawing nothing. A header or line change
    while it is up does not replay the wipe. When a line replaces another, the line row
    crossfades: the outgoing line fades out while the incoming line fades in, over 300 ms, so
    for that time the row holds both line elements. A weather card whose text changes while it
    is up (rule 88) is not a replacement: the line element shows the new text at once, with no
    crossfade. There is no crossfade, and no fade at all,
    when the line list goes from empty to a line or from a line to empty: the first line after
    an empty list appears at once, and the last line before one goes at once (when the panel
    itself appears or goes with it, the wipe covers it). Under reduced motion (`overlay-config.md`
    rule 10) the panel appears and disappears without the wipe, and a line replaces another at
    once, with no crossfade.
82. **Routes and composition.** The standalone `/info` route is a transparent overlay route. It
    connects to the producer the way every render page does (`?src=`, then the default), loads
    the profile named by `?profile=` and reads its `info` widget's `dwellSeconds`, `lines`,
    `weatherCard` and `tempUnit`, and uses a dwell of 8, no broadcaster lines, the weather card
    off and °C when there is no profile or the profile fails to load. It reloads that profile live as `/all` does (`overlay-config.md` rule 22): an edit
    saved in `/config` to the `info` widget's `lines` or `dwellSeconds` reaches a running `/info`
    Browser Source without a refresh, as a changed line list (rule 80) or a dwell change (rule
    79). A live `lines` edit, on `/info` or in `/all`, changes the line on screen with rule 81's
    crossfade: `overlay-config.md` rule 22's "without transition" covers the layout and geometry,
    not the panel's line. Inside `/all` the panel is the `info` widget: while `visible` it is mounted at its
    configured geometry and reads its own `dwellSeconds`, `lines`, `weatherCard` and `tempUnit`;
    while not `visible` it is not mounted. The panel has no idle predicate: with nothing to show it already draws nothing,
    so `/config` offers no "Hide when idle" for it and a saved `hideWhenIdle: true` on it
    changes nothing (as for the HUD, rule 58, and the race update box, rule 75).
88. **The weather card.** While the `info` widget's `weatherCard` is on (`overlay-config.md` rule
    57, default off) and the snapshot's weather has at least one part (rule 83), the line list
    holds one **weather card**, at the place rule 77 gives it. Its text joins, in this order,
    `AIR ` and the air temperature, `TRACK ` and the track temperature (each as rule 84 formats
    it, in the `info` widget's `tempUnit`), and the conditions, leaving out the parts that do not
    hold, with ` · ` between two parts and nowhere else, and uppercases the result
    (locale-independent `toUpperCase`): `{ air_temp: 22.4, track_temp: 31.2, conditions: "Light
    rain" }` gives `AIR 22°C · TRACK 31°C · LIGHT RAIN`, and with only `track_temp` in `f`,
    `TRACK 88°F`. The card is one entry whose identity does not depend on its text:
    - new weather values, or a new `tempUnit`, change the card's text and nothing else: the
      line list is the same list (rules 79–80), so the rotation keeps its place and its running
      dwell, and while the card is up its line element shows the new text at once, with no
      crossfade (rule 81);
    - the card is never dropped as a duplicate of a text line, and no text line is dropped as a
      duplicate of the card, even when their texts are equal;
    - the card entering the list (weather arriving, `weatherCard` switched on) or leaving it
      (the weather losing its last part, `weatherCard` switched off) is a changed line list
      (rule 80).

    While `weatherCard` is off, or the weather has no part, there is no card and the line list
    is exactly rule 77's text lines.

### Weather box (`/weather`, #208)

The weather box is a compact one-row readout of the producer's weather: air temperature, track
temperature and conditions. It reads only the snapshot's `session.weather`
(`protocol-contract.md` rule 24) and its own `tempUnit` (`overlay-config.md` rule 54), and
derives nothing from `vehicles[]` or any other field. Decision record:
`docs/decisions/0025-weather-box.md`.

83. **Which weather fields hold.** An absent, null, or non-object `session`, or an absent, null,
    or non-object `session.weather` (an array is not an object), has no weather. Of an object
    `session.weather`, each field is a **part** only when it holds:
    - `air_temp`: a number that is finite (`22.4`, `-3`, `0`; not `"22"`, `NaN`, `true` or
      `null`);
    - `track_temp`: the same test;
    - `conditions`: a string with at least one non-whitespace character; the part is the string
      trimmed and otherwise verbatim (case kept).

    Any other value counts as absent and does not stop the other fields being read. Fields this
    revision does not define are ignored.
84. **Temperatures.** A temperature part is shown in the widget's `tempUnit`: `c` shows the °C
    value as sent; `f` shows it converted, °C × 9 / 5 + 32. The shown number is then rounded to
    a whole degree, a half rounding up (JavaScript `Math.round`: `22.5` → `23`, `-2.5` → `-2`),
    and a result of negative zero shows as `0`. It is written as the number, then `°C` or `°F`
    (U+00B0 DEGREE SIGN, then the letter), with no space: `22.4` → `22°C`; in `f`, `31.2` →
    `88°F` and `-17.8` → `0°F`; a negative value keeps its hyphen-minus: `-3.4` → `-3°C`.
85. **The box.** The box (`data-testid="weather-box"`) holds one item per part, in the order air,
    track, conditions, and nothing for a part that does not hold:
    - air: `data-testid="weather-air"`, holding a label reading `AIR` and the value
      (`data-testid="weather-air-value"`, rule 84);
    - track: `data-testid="weather-track"`, holding a label reading `TRACK` and the value
      (`data-testid="weather-track-value"`);
    - conditions: `data-testid="weather-conditions"`, reading the conditions part.

    With no part the box draws nothing at all: no box element, no plate, no placeholder. The
    box is one row: conditions too long for the width are cut off with an ellipsis and never
    wrap or grow the box. It shows in every `mode`; it has no mode gate, no trigger, and no
    class awareness.
86. **Updates and motion.** Each snapshot's weather applies at once: a changed value, a part
    appearing or going, or a `tempUnit` change shows in place on the next render. The box
    appears and disappears at once, with no transition, in both motion modes
    (`overlay-config.md` rule 10), as Race Control does.
87. **Routes and composition.** The standalone `/weather` route is a transparent overlay route.
    It connects to the producer the way every render page does (`?src=`, then the default), loads
    the profile named by `?profile=` and reads its `weather` widget's `tempUnit`, and uses `c`
    when there is no profile or the profile fails to load. It reloads that profile live
    (`overlay-config.md` rule 22), so a unit changed in `/config` reaches a running `/weather`
    Browser Source without a refresh. Inside `/all` the box is the `weather` widget: while
    `visible` it is mounted at its configured geometry and reads its own `tempUnit`; while not
    `visible` it is not mounted. The box has no idle predicate: with no weather it already draws
    nothing, so `/config` offers no "Hide when idle" for it and a saved `hideWhenIdle: true` on
    it changes nothing.

### Composite & takeover routes

25. **`/all`** composes configured widgets onto the fixed canvas by `z` order (see
    `what/overlay-config.md`); each widget still applies its own visibility/idle logic, and the
    `?class=` field filter (rule 10) applies across the composed field.
26. **`/logos`** cycles sponsor logos (`logoRotation`: images, `perSlotSeconds`, `order`).
27. **`/grid`** (pre-race starting grid) and **`/results`** (final classification) are full-screen
    **opaque takeover** slides — full-bleed but NOT transparent overlay routes. While class tags
    show (rule 64) they group the field by class in class-registry order (the same sequence the
    grouped tower uses), order each group by `position`, and `/results` restarts class positions
    within each group (like the grouped tower). Both honor the `?class=` filter. `/grid` shows the
    overall position in a staggered two-column rake.

### Field filter & auto-hide

28. **`?class=`** is a **cross-route** field filter, not a per-widget knob: `/tower`, `/all`,
    `/grid`, and `/results` all read it from the URL and narrow the rendered field to that class.
    Class-rank badges are still computed from the full field, so a filtered view keeps correct
    `n/total` ranks.
29. A *supporting* widget can be opted into `hideWhenIdle` (default off) to drop out of the render
    while it has nothing meaningful to show. Supporting widgets are those with an idle predicate:
    `battle` (clear air / non-racing mode), `logos` (no valid images), `driver` and `qualifying`
    (no valid subject / no timing). The tower has no predicate — always meaningful, ignores the flag.
    The predicate reads the same snapshot/config the widget renders from, so auto-hide can never
    disagree with what the widget would draw.

### Class badges

30. **A class chip's label is the producer's own `vehicle_class` string, verbatim — never a generic
    placeholder.** The class registry (`classMeta.js`) curates a distinct color for a small set of
    known classes; it does not gate what text renders. A class outside that registry still shows
    exactly what the producer sent, rather than degrading to a meaningless placeholder that
    discards the producer's data. Applies everywhere a class chip renders: the tower (rules 3, 5),
    the driver lower-third's class chip (rule 18), the battle box's class chip (rule 65), and the grid/results group headers (rule 27).
    Rule 31 governs that class's *color*. Rules 60–64 say when class tags are hidden.
31. **A class outside the curated registry gets a deterministic color hashed from its own name, not
    a flat neutral one** — the same class string always resolves to the same color across reloads,
    from a palette independent of the five curated classes' colors. A class that is a
    driver-category **variant** of another — its name ending in a recognized trailing word or
    phrase (`Pro`, `Am`, `Pro-Am`/`ProAm`/`Pro Am`, `Gold`, `Silver`, `Bronze`, `Platinum`) — shares
    its base class's hue at a different **shade**: brighter for the higher tier
    (`Pro`/`Gold`/`Platinum`), darker/muted for the lower (`Am`/`Silver`/`Bronze`), so `"LMGT3"` and
    `"LMGT3 Am"` read as the same family rather than two unrelated colors. This applies **even when
    the base class is one of the five curated ones** — `"TCR Am"` shares curated TCR's own hue,
    shaded, rather than hashing an unrelated palette color; only an *exact* match on a curated key
    (no trailing modifier) renders that class's literal curated color unchanged. A class with no
    recognized trailing word, or whose entire name IS one (with nothing in front of it — a bare
    `"Am"` or `"Pro-Am"` sent as a class name by itself), is its own family with no shade
    adjustment, canonicalized so every spelling of the same phrase still resolves identically.
    Family detection needs only the one class string — it does not require knowing every other
    class present in the field. A genuinely
    **absent** `vehicle_class` (not merely one outside the registry) keeps the flat neutral
    placeholder color, since there is no name to derive a family/hue from. Decision record:
    `docs/decisions/0009-class-color-palette-for-unregistered-classes.md`.
32. **A broadcaster can override any class's color**, via `theme.classColors`
    (`overlay-config.md` rules 32-33) — a freeform map, not limited to the five curated classes or
    to any other fixed set. The map is keyed the same way rule 31 normalizes a class string (trim,
    lowercase); when a class's normalized string has an entry, that entry's color replaces rule 31's
    result for that **exact** string only — it does not cascade to a driver-category variant
    sharing the same family root (an override on `"tcr"` does not recolor `"tcr am"`; a broadcaster
    who wants that adds a separate `"tcr am"` entry). A class with no matching entry keeps resolving
    through rule 31 unchanged, including a curated class's own established color. Applies everywhere
    rule 30/31 apply — every class-chip and class-bar render site. Decision record:
    `docs/decisions/0010-class-color-override-matrix.md`.

### Class tags in a single-class session

60. **Whether class tags show.** A *class tag* is any class chip (rule 30), wherever it renders,
    the tower's class-rank badge (rule 5), and the class group headers of the grouped tower and
    the `/grid` and `/results` slides. Whether class tags show is one answer for the whole
    overlay, from the broadcaster's `theme.classTags` (`overlay-config.md` rule 47) and the
    producer's `session.multiclass` (`protocol-contract.md` rule 20):

    | `theme.classTags` | `session.multiclass` | Class tags |
    |---|---|---|
    | `show` | anything | shown |
    | `hide` | anything | hidden |
    | `auto` | exactly `false` | hidden |
    | `auto` | `true`, null, absent, no `session`, or any non-boolean (`"false"`, `0`) | shown |

    The answer follows the latest snapshot and the current config, with no hold: a snapshot that
    changes `multiclass` shows or hides the tags at once. The overlay never decides it from
    `vehicles[]`, neither by counting distinct `vehicle_class` values nor by the class string
    (`"Default"` or any other), so a field whose cars all share one class keeps its tags while
    the producer does not say single-class. It applies on every route and in every mode: inside
    `/all` (the `/config` preview included) and on the standalone routes. Beyond what rules
    61–64 name, hiding changes nothing: not a car's data, the `?class=` filter (rule 28), which
    still narrows the field, or when a widget fires, shows, or idles.
    Each tower row, grid cell, and results row keeps its class bar, coloured by rules 31–32.
    Race Control renders no class tag and is unaffected. Decision record:
    `docs/decisions/0022-single-class-tags.md`.
61. **Hidden class tags in the tower.** The tower renders no class chip and no class-rank badge:
    the `class` and `classpos` columns (rule 49) are absent, so each row reads position, name,
    gap, then the cells rule 49 shows after the gap. The header's class-filter chip is not
    shown either. A tower whose `classDisplay` is `grouped` renders the inline layout instead:
    one list in overall `position` order with no group headers, numbered by overall position,
    with the inline gap cell (rules 1, 2, 33), and the root's `data-class-display` reads
    `inline`, the layout it renders. The tower-overflow rules (`tower-overflow.md`) then apply
    as they do to any inline tower, with pinned rows following `cycle.pinScope` unchanged. When
    the tags show again, the tower renders its configured layout. A change in whether the tags
    show resets the full-style fit width (rule 48), so a full-style tower that loses its class
    columns shrinks to its new fit.
62. **Hidden class tags on the battle box and the lower-thirds.** The battle box, the driver
    lower-third (#21), and the qualifying lower-third (#22) render no class chip. Everything else
    on them renders exactly as with the tags shown. A card already on screen, including a #22
    class-best flash, gains or loses its chip with the latest answer (rule 60); that never
    fires, re-fires, or ends a card.
63. **Hidden class tags on the on-board HUD.** The identity strip renders no class chip, even with
    `driverInfo.class` on. The class field then counts as having no value for rules 55–56, so a
    strip whose only enabled field with a value is the class renders no strip and no `ON BOARD`
    label.
64. **Hidden class tags on `/grid` and `/results`.** The slide renders the field as one list in
    overall `position` order, with no class group headers (no class chip and no per-class car
    count) and no class-filter chip in its header. `/grid` keeps its staggered two-column rake,
    each cell showing the car's overall position. `/results` numbers each row by its overall
    `position` instead of a class position. With a `?class=` filter, the list is the filtered
    cars in that order.
66. **Malformed `vehicles` in the field lists.** The standings tower (standalone `/tower` and the
    tower `/all` composes), `/grid`, and `/results` apply `protocol-contract.md` rule 21. A
    `vehicles[]` entry that is not an object, or is an object without a usable `slot_id` or
    `position`, is not a row, and it is not counted in a class rank
    or total, a class group's car count, or the tower's column sizing; the rows, their order,
    their positions, and those numbers are exactly those of the array without it. Two such
    entries render no row and never stop the tower rendering. A `position` of `0` or `2.5` is
    usable: that entry is a row, sorted by its number. A `vehicles`
    that is not an array, or whose every entry is absent, is an empty field: the tower and
    the slides show the same placeholder `vehicles: []` shows ("Waiting for state…"), not "No
    cars in this class". `/all` renders every configured widget on a snapshot carrying such an entry.

67. **Class display on both entry points.** The standalone `/tower` route and the tower inside
    `/all` render the same `classDisplay` from the loaded profile. A profile whose tower says
    `grouped` gives the grouped layout (rules 3, 5) and `data-class-display` reads `grouped`; a
    profile that says `inline`, says nothing, or has not loaded yet gives the one overall list and
    `data-class-display` reads `inline`. `?class=` narrows the grouped field on `/tower` as it does
    in `/all`. There is no URL knob for the layout.

## Constraints

- No widget may derive a semantic fact by scanning `vehicles[]`; it reads the producer-set field
  (`notable`, `target_lap`, `gap_to_leader`, `interval_ahead`, the `laps_behind_*` lap deficits,
  `battle_intensity`). The only
  permitted arithmetic is exact math on producer-authored values (e.g. gap-to-class-leader
  subtraction). A class-relative *interval* is explicitly NOT re-derivable — render `interval_ahead`
  verbatim.
- Every widget must render (or cleanly idle) when its optional fields are absent.
- The qualifying/practice race-strategy suppression (rule 8) is a deliberate presentation override
  and takes precedence over both the `towerMetrics` toggles and producer-sent data.
