# Decision: an `event` object, an `info_lines` list, and an info panel

**Issues:** #62 · **Milestone:** 0.15.0
**Status:** Accepted · **Date:** 2026-10-24

How the contract carries "which event is this" (the event name, the championship round, the
track) and a few lines of free text a broadcaster wants on screen, and how the overlay shows
them. Additive to spec v1, so `schemaVersion` stays `"1"`.

## Context

Le Mans Ultimate has a native information / commentary panel: round, event name and track,
plus a free-text line (`docs/research/native-overlays.md`). battlecast has nothing like it, and
spec v1 has no event metadata at all: `session` describes the live session (flag, clock,
laps), not the weekend it belongs to. The issue asked for optional event fields and an optional
free-text field, rendered verbatim, with absent fields degrading cleanly. The full-screen
event and schedule slides (#30) will need the same event fields.

A broadcaster's own lines (sponsor reads, social handles, "next race at 15:00") are static for a
whole broadcast and have nothing to do with the producer, so they belong in the profile.

## Decision

Two optional top-level fields and one widget.

- **`event` is a new top-level object, `{ name, round, track }`, not part of `session`.**
  `session` is the live session and changes every few seconds; the event is fixed for the
  weekend and spans several sessions. Keeping them apart lets #30's event slides read `event`
  without caring about session state. All three fields are optional and nullable.
- **`round` is a positive integer, rendered `ROUND n`.** It is the round number of a
  championship. A string would invite `"Round 3"`, `"R3"` and `"Final"`, which the overlay
  could only show verbatim and could not label consistently; a producer with a round that has a
  name (a finale, a non-championship race) puts it in `name`. Anything that is not an integer of
  at least 1 is treated as absent.
- **`info_lines` is a top-level array of strings, not a field inside `event`.** The lines are
  commentary, not event metadata: a producer can send lines with no event (a test session) or an
  event with no lines. The name says what they are (lines of information) and matches the
  widget; `commentary` suggests one string, and `caption` suggests subtitles. Each line is shown
  exactly as sent, trimmed; an entry that is not a string or is blank is skipped.
- **Broadcaster lines live in the profile and rotate with the producer's.** The `info` widget
  has a `lines` list (at most 10, each at most 120 characters, trimmed, blanks and duplicates
  dropped). The panel rotates through the producer's lines first, then the broadcaster's, so
  live producer text is never queued behind a sponsor read it has nothing to do with. A line
  equal to an earlier line shows once, so a producer and a profile that both carry a line do
  not repeat it.
- **One line at a time, on a dwell.** Each line stays up for the widget's `dwellSeconds`
  (default 8, valid 2–60, the race update box's range), then the next, wrapping at the end. A
  single line stays up for good.
- **A changed list keeps the line on screen when it can.** The list changes whenever the
  producer sends different lines or the broadcaster edits theirs. If the line on screen is still
  in the new list, it stays and keeps its dwell, and the rotation continues from its new place.
  If it is gone, the line that took its place shows at once (the first line when the list got
  shorter than that place). This keeps a re-sent identical list from restarting anything, keeps
  a line the producer adds from cutting off the line being read, and takes a line the producer
  withdrew (a correction) off screen at once.
- **A compact bottom strip that hides when it has nothing to show.** A header row built from the
  event (`ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS`, uppercased, absent parts and their
  separators left out) and a row for the current line. With no event fields it is one row, with
  no lines it is the header alone, and with neither it draws nothing. It is visible by default,
  so a producer that starts sending these fields gets a panel without a profile edit.
- **Placement: bottom right, above the logo slot.** The bottom left belongs to the driver and
  qualifying lower-thirds and the bottom centre to the on-board HUD. The default
  (`x 1200, y 816, w 696, h 72`, `z 9`) clears every default widget, including the logo slot at
  `y 900`, which is hidden by default but sits there as soon as a broadcaster turns it on.
- **Motion.** The panel enters and leaves with the lower-thirds' skewed bar-wipe, the house
  reveal. A line change crossfades inside the strip: the strip itself does not re-wipe for every
  line, which would draw the eye every eight seconds. Both are gated on `data-motion` like every
  other transition.
- **Its own route and an `/all` widget.** `/info` for a dedicated Browser Source, and an `info`
  widget in `/all` and `/config` like every other widget, with plate opacity and text size like
  the other plated widgets.
- **`/info` reloads its profile live, like `/all`.** The broadcaster's lines are config, so an
  edit saved in `/config` has to reach a standalone `/info` Browser Source without a refresh.
- **The editor preview's sample lines give way to the broadcaster's.** The preview shows sample
  producer lines only while the profile has no lines of its own, so a line the broadcaster adds
  shows in the preview at once instead of waiting behind three sample lines.

## Alternatives rejected

- **Event fields inside `session`.** Mixes weekend metadata into the live session state, and
  #30's slides would read a session object for a fact that does not change with the session.
- **One `commentary` string.** The broadcaster wants several lines on a cycle; one string would
  push the rotation into the producer and leave no room for the profile's lines.
- **Producer lines inside `event`.** A producer could not send commentary without an event.
- **A string `round`.** Inconsistent labels and no way to tell a round number from a name; see
  above.
- **Restarting the rotation on any list change.** A producer that re-orders or appends a line
  would cut off the line being read, and a list that flaps between two versions would never get
  past its first line.
- **Broadcaster lines first.** A live producer line ("Safety car deployed, lap 14") would wait
  behind every sponsor read.
- **Default placement at the bottom edge, over the logo slot.** Free while logos are hidden, but
  the two collide the moment a broadcaster turns the logo rotation on.
- **Re-wiping the whole strip on every line.** Too busy for something that changes every few
  seconds all broadcast long.

## Consequences

- BattleDirector has to emit `event` and `info_lines` before a live broadcast shows producer
  content. Until then a panel with no broadcaster lines draws nothing.
- The mock producer emits an `event` and a short `info_lines` list so the panel is exercised
  live.
- #30's event slides can reuse `event` as it is; a later field (a date, a country) is additive.
- The profile gains its first list of free text. It is bounded (10 lines of 120 characters) so a
  profile stays small and the editor stays usable.
