# Decision: tower driver names — short by default, full names that widen the tower

**Issues:** #242 (raised while measuring #225) · **Milestone:** 0.14.0
**Status:** Accepted; its tower-only scope is superseded by
`0038-profile-wide-driver-name-style.md` (one style for every widget) · **Date:** 2026-10-18

The standings tower gets a per-tower **name style**: `short` (`E.JAC`, the default) or
`full` (`E. Jacobs`, never ellipsized, the tower widening to fit).

## Context

At ×1.00 on the default 380px tower, many driver names already truncate (`E. Jacob…`).
ADR 0015 measured the default columns at about 88px of name, and a fixed interval slot
(#225) would take more. A name cut off mid-word reads worse than a deliberate short form,
and broadcast towers (F1, WEC) already use a three-letter code for exactly this reason.

## Decision

1. **A tower setting, `nameStyle`, with two values.** `short` is the default; `full` is
   opt-in. The battle box, lower-thirds and on-board HUD are not touched: they have room for
   a name and keep the format they have.
2. **Short is built from `driver_name`:** the first word's initial, `.`, and the first three
   letters of the rest of the name, uppercase, no space (`Erik Jacobs` → `E.JAC`). "The rest"
   is what the full format already calls the surname, everything after the first word, with
   its spaces, hyphens and other punctuation removed: `Nyck de Vries` → `N.DEV`, `Jean-Eric
   Vergne` → `J.VER`. A one-word name gives its first three letters (`TSU`). The exact rule,
   including names that already contain `.` and empty names, is `widgets.md` rule 47.
3. **Short names never truncate.** The short form is five characters or fewer in nearly
   every case (a character such as `ß` that uppercases to two can add one), and the name cell
   is never narrower than the short name it holds, so it never ellipsizes.
4. **Full names are not ellipsized. The tower grows wider instead,** and only grows. Its
   minimum width is the larger of its configured width and a fit width: the widest full name
   in the whole class-filtered field, measured bold (the on-camera weight), plus the widest
   non-name row content seen since the last reset. The fit width only rises while the session
   `mode` and the tower's settings stay the same; it is recomputed when either changes. When
   the name font finishes loading, only the names are measured again. The
   tower keeps its left edge and grows to the right, past the configured width and, if it
   must, past the canvas edge, where the page cuts it off.
5. **No protocol change.** The overlay derives the short form from the `driver_name` it
   already receives, as it already derives `E. Jacobs`.

## Why this is not race analysis

*Dumb overlay, smart producer* forbids the overlay deriving race facts: class bests, gaps,
battle intensity, anything found by comparing cars. Abbreviating one car's own name string is
formatting, the same kind of thing as rendering `90.912` as `1:30.912`. It reads one field of
one car and compares nothing. The tower never uses the short form to decide anything.

## Why short is the default

- **A growing tower can spill past its Browser Source.** OBS crops a Browser Source at the
  size it was given. A full-name tower that grows on a long name can run off the right edge of
  the source, or over the widget beside it in `/all`, the first time a long name joins the
  field. That can happen mid-broadcast, and nothing warns the operator. The short tower never
  changes width.
- **The short form is what towers on air look like.** A three-letter code is the convention
  viewers already read.
- **The truncating tower stops being an option.** Neither style cuts names off. A broadcaster
  who wants full names accepts a tower that sizes itself.

## How full style meets the existing decisions

- **ADR 0003 (overflow) is unaffected.** It bounds the tower's *height*. Full style changes
  only width: names never wrap, so row height, the row budget, pinning and cycling are
  exactly as before. `tower-overflow.md` rule 1 still holds.
- **ADR 0015 (text size) rejected render-time widening.** Its reason was that `w` would stop
  meaning what the editor's drag box shows. Full style does widen at render time, and does so
  on purpose. The broadcaster chooses it, it only ever adds width, and `w` keeps a meaning: the
  tower's minimum width and its left edge. The editor does not change `w` when the style
  changes. A text-size preset still widens `w` as ADR 0015 describes, and in full style
  bigger text makes the names wider, so the tower may grow further on top of that.
- **ADR 0015 also rejected "fixed width, names truncate".** It rejected it for the text-size
  presets, where at ×1.30 it left about three letters. Short style is the deliberate version of
  that same three-letter result: the tower keeps a fixed width, and every name is a whole,
  readable code with nothing cut off.
- **The "all columns on" layout** (ADR 0015 notes it is cut off at ×1.00) is still clipped at
  the tower's edge in short style, finish chip first. In full style the tower grows until the
  whole row fits.

## Why the width only grows

A tower whose width changes while the race runs looks broken on air. A width sized to the
rows on screen would change constantly: on every camera cut (the on-camera pin swaps a
rendered row once the field cycles), when the bold on-camera highlight moves to a longer
name, on every page turn, and from one snapshot to the next as cells without a reserved
width change value (the interval, `STOP 2` against `PIT`). Two things remove all of that:

- **Measure the whole class-filtered field, bold.** Which rows are rendered, and which one is
  highlighted, then has no effect on the width.
- **Grow only, until a reset.** The cells that vary still vary, but a wider value can only
  push the width out once; it never pulls it back in. The tower settles within the first laps
  and then holds.

The alternative to grow-only is giving every cell a fixed reserved width, as rule 42a already
does for the gap cell. That would make the content width a constant, but it is a much larger
change: each metric cell would need its own worst-case width, some cells (the tire compound
label) are free text, and the interval's fixed slot is its own decision (#225). Grow-only
gets the same steady result without re-laying-out the row.

The resets are the moments a width change is expected anyway: the session `mode` changing
(qualifying to race), or the broadcaster changing the tower's settings. The protocol carries no session identity, so a new session in the *same*
mode (one race, then the next) looks like the same session continuing and is not a reset. A
car leaving the field does not shrink the width; the space it needed stays until the next
reset, so a retirement does not make the plate jump.

Font loading needs its own handling because of grow-only. The name face (Saira Condensed)
loads from the web with `display=swap`, and its fallback is much wider. A measurement taken
in the fallback would set a width that grow-only then keeps for the whole session. So names
are measured only once the face has loaded. The browser's check for that can still say yes
before the stylesheet has registered the family, so the first measurement may be in the
fallback; when a name-font face then loads, the tower re-measures the names in it.

That re-measure is deliberately not a reset. Faces load mid-session too: Google Fonts splits
a family by weight and unicode range, so the first name with a Cyrillic or Latin Extended
letter can pull in a new file mid-race. A full reset there would throw away the remembered
row width and every retired car's name, and the tower would narrow on air. So a font load
reacts only to the name font's own family, re-measures only the names (all of them seen
since the last reset, retired cars included) and keeps the remembered row width. The name
part may narrow when it does; that is the fallback measurement being corrected, which is
the point.

## Amendment (#244, #245)

The headless-Chromium check of the implementation found the minimum width about 3px short of
what the widest row needs. Canvas `measureText` ignores CSS `letter-spacing` (the page sets
0.18px, about 5px over a 29-character name), and the tower's 1px border on each side was not
in the formula. Both are now part of the fit width. Letter spacing is added as code points ×
the name cell's computed `letter-spacing` rather than by setting `ctx.letterSpacing`: the sum
behaves the same in every engine the overlay may run in, and it reads the one value the row
actually renders with. Rejected: a fixed safety margin, which hides the next missing term
instead of naming it.

A name font that fails to load (a self-hosted font with a bad path, which `fonts.css`
recommends for OBS) left `check()` false for the whole session, so a full-style tower never
grew. It now measures in the fallback face once the font's load is refused or a face of the
family reports an error, and stops waiting. There is no retry: a font that failed is unlikely
to load on a second request within the session, and a retry loop would keep a request
running for the life of the Browser Source. A later successful load of the family still
re-measures the names, so a font that recovers is used.

Accepted limit: a font request that stalls (never refused, never finished) still holds a
full-style tower at its configured width until the request settles. That is unlikely with a
local font server, and a timeout would need its own tuning, so there is none.

## Alternatives rejected

- **Full by default.** That is today's look, but with growth it is the setting that can break
  an OBS layout unattended. With truncation instead of growth, it is the problem this issue
  exists to fix.
- **Last word of the surname** (`Nyck de Vries` → `VRI`). This disagrees with how the full
  format already reads the surname (`N. de Vries`). Two rules for "surname" in one tower
  invite confusion. The particle-free reading is also a cultural guess the overlay should not
  make.
- **A producer-sent short code.** It would be a protocol addition, and it is not needed until
  codes collide (two `HAM`s). It can be added later as an optional field that wins over the
  derived form.
- **Shrinking the font to fit a full name.** ADR 0003 already rejected auto-shrink. It
  degrades without warning, exactly when the field is busiest.
- **Width from the rendered rows only.** It changes on camera cuts, page turns, highlight
  moves and cell values (see *Why the width only grows*). Measuring names that are not on
  screen is cheap with a canvas `measureText`, so off-screen names are no reason to accept that.
- **Fixed reserved width for every cell.** See *Why the width only grows*.

## Consequences

- **Every existing profile changes appearance.** A profile without `nameStyle` renders
  short names. This is deliberate: the config shape is additive and `configVersion` stays
  `"1"`, since no saved value changes meaning and nothing fails to load. A broadcaster who
  wants names back sets `full`, and gets a tower that grows rather than truncates.
- **In full style the tower can be wider than it needs to be.** After a long-named car
  retires, or a wide cell value passes, the room stays until the next session or settings
  change.
- **Back-to-back sessions in the same mode share a width.** A race followed by another race
  keeps the first field's width, because nothing in the protocol marks the new session. A
  mode change, a settings change, or a reload clears it.
- **In full style the width can still grow mid-session**, when a car with a longer name joins
  or a cell shows its widest value for the first time. Each such change only widens the tower.
- **Short codes can collide** (two drivers who both read `HAM`). The tower still keys every
  row by `slot_id`, so nothing breaks; viewers tell the two apart by position. A
  producer-sent code is the fix if it matters.
