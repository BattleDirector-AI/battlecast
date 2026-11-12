# Decision: the Countdown slide counts to a local date and time, and shows a starting line at zero

**Issue:** #464 (event slides epic #30) · **Milestone:** 0.18.0
**Status:** Proposed · **Date:** 2026-11-12

Behaviour: `what/widgets.md` rules 131–141, `what/overlay-config.md` rules 73 and 76.
Mechanism: `how/renderer.md`, `how/config-editor.md`.
Builds on: `0041-event-slide-shared-slides-section.md` (the shared `slides` section, the route
idiom, no entrance, one `/config` section per slide).

## Context

The Countdown slide is the second event slide. It shows the series logo, the series name and a
live countdown to a race start. The owner decided that the broadcaster types the start as a date
and a time in `/config`, not as a duration. Every Browser Source must count to the same moment. A
reload must not reset the count. A start in the past must never count. At zero, a "starting now"
line replaces the timer. The line stays while the start is in the past.

Four questions needed an answer: how to store the start, which clock and zone to use, how to show
the remaining time, and what shows at zero, after zero and with no start.

## Decisions

1. **The start is a local date and time with no zone: `slides.start` is `YYYY-MM-DDTHH:MM`.**
   The browser reads it in its own time zone. It is the exact value that
   `<input type="datetime-local">` gives with a step of 60 seconds, so the editor stores what the
   input gives, with no conversion.
   - The broadcaster thinks in the clock on the wall of the room with the stream PC. A race at
     20:00 is `…T20:00`, and that is what the slide counts to.
   - All Browser Sources on one PC use one zone, so they count to the same moment. A reload reads
     the same stored text and the same clock, so it does not reset the count.
   - Alternative rejected: a UTC instant (`…Z`, or a number of milliseconds). It is unambiguous
     across PCs, but the editor must then convert the typed time with the zone of the PC that runs
     `/config`. When the editor runs on a laptop in a different zone from the stream PC, the slide
     counts to a different hour than the broadcaster typed, with no sign of the error.
   - Alternative rejected: a duration (`15 minutes`). The owner ruled it out. A reload or a second
     source would restart it.
   - Consequence accepted: Browser Sources on PCs in different time zones count to different
     moments. One broadcast normally runs its sources on one PC, or on PCs in one zone.
   - Consequence accepted: a time that a daylight-saving change skips or repeats resolves as the
     browser's `Date` resolves it. We do not handle it further.
2. **Seconds, zones and other forms normalize to `''`.** Normalization keeps only the exact form
   and only a real calendar date and time (no 30 February). A value with a zone suffix, with
   seconds, with a space in place of `T`, or of another type gives `''`, which is "no start". A
   wrong start on air is worse than no timer, so normalization does not guess.
3. **The slide reads the clock at each change and never counts by itself.** The remaining time is
   always `start − Date.now()`. The slide schedules its next change at the next whole-second
   boundary of the remaining time and reads the clock again then. A local counter drifts, because
   browsers delay timers (OBS throttles hidden sources), and it would not follow a corrected PC
   clock.
4. **Whole seconds, rounded up.** The timer shows `ceil(remaining / 1000)` seconds. It shows `00:01`
   in the last second and reaches the starting line exactly at the start. Rounded down, the timer
   would show `00:00` for a full second before the start, and a viewer reads `00:00` as "started".
5. **The format grows with the time left.** `MM:SS` under an hour (`04:59`), `H:MM:SS` from one hour
   (`1:00:00`), and `D DAY H:MM:SS` or `D DAYS H:MM:SS` from one day (`2 DAYS 3:04:05`).
   - Most countdowns on air are under an hour, and `MM:SS` is the form a viewer knows from race
     broadcasts. A leading `0:` hour would only add noise.
   - Minutes keep two digits under an hour, so `09:59` to `10:00` does not change the width.
   - A start some days ahead (a stream that shows the slide during the week) still reads well.
     Hours past 24 (`50:00:00`) are hard to read.
   - Alternative rejected: always `HH:MM:SS`. It wastes two digits in the common case.
6. **At zero and after, a starting line replaces the timer and stays.** Its text is
   `slides.startedText`, default `STARTING NOW`. The slide does not hide the line, cycle it or
   return to the timer while the start is in the past. Only a new start removes it. The slide
   cannot see an OBS scene change, so the rule does not name one: a scene change or a source
   refresh with the start still past shows the line again. A start that is already past when the page
   loads shows the line at once. The timer never shows `00:00` and never a negative time.
   - Alternative rejected: count up after zero (`+01:23`). The owner decided that a start in the
     past never counts.
   - Alternative rejected: an empty clock at zero. The slide would look broken on air.
7. **A blank starting text gives the default.** Normalization turns a blank or non-string
   `startedText` into `STARTING NOW`. So the zero state always has a line, and a broadcaster who
   clears the field by mistake does not put a gap on air.
8. **No start is no clock.** With an empty `start` the slide shows its logo and series name and no
   timer, no starting line and no placeholder digits. As on the Event slide (ADR 0041, decision
   11), a placeholder would go on air.
9. **No label above the timer.** The slide shows no text such as `RACE STARTS IN`. The series name
   and the clock carry the meaning, and a fixed English label would need another editable field.
10. **The timer is large and uses tabular figures.** The timer is the main part of the slide. It
    uses the numeral face with tabular figures at three times the title size, so its width does not
    change from second to second. The starting line uses the display face at the same size, so the
    change at zero keeps the layout.

11. **A partly typed start does not commit, and a Clear button empties the start.** In Chrome a
    `datetime-local` input fires `change` after each field edit. While any field is empty its value
    is `''` and `validity.badInput` is true. The editor commits only when `badInput` is false. So
    a broadcaster who deletes the hour to type it again keeps the stored start. To remove the
    start, the broadcaster uses a **clear** button next to the input, or empties every field.
    - Alternative rejected: commit `''` on each `change`. One backspace would wipe the stored
      start, and the input would show empty fields.
    - Alternative rejected: no clear button. Clearing a `datetime-local` in Chrome means clearing
      each field one by one.
12. **The date is built with `setFullYear`.** `new Date(y, m, d, …)` reads the years 0 to 99 as
    1900 to 1999. Normalization keeps any four-digit year (`0026-…`), so the slide and the day
    check build the date with `setFullYear(y, m - 1, d)`, which takes the year as given.

## Consequences

- `slides` gains `start` (default `''`) and `startedText` (default `STARTING NOW`). Two existing
  tests that used a `…Z` value as an "unknown" `start` key change, because `start` is now known.
- The `/config` Countdown section has a date and time input, a clear button and a text input. It has no control
  for the series name or the logo. Those stay in the Event section (ADR 0041, decision 3).
- The look per preset follows the Event slide: a black board under both vintage presets, the red
  rule or the red plate on the series name, and the base look for the timer and the starting line.
