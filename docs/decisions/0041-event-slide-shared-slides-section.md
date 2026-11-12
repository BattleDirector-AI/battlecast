# Decision: the Event slide reads one shared `slides` profile section and the existing logo store

**Issue:** #463 (event slides epic #30) · **Milestone:** 0.18.0
**Status:** Proposed · **Date:** 2026-11-12

Behaviour: `what/widgets.md` rules 123–130, `what/overlay-config.md` rules 73–75.
Mechanism: `how/renderer.md`, `how/config-editor.md`.

## Context

Epic #30 ships four event slides in 0.18.0: Event (#463), Countdown (#464), Schedule (#465) and
Intro (#466). The owner decided that each slide is a full-screen slide on its own route, like
`/grid` and `/results`. The broadcaster types the content in `/config`, and the profile stores it.
The Event slide is the first. It shows the series name, the round, the track and the series logo.
The other three slides show the same series name and logo. The native rF2 overlay has an Event
slide with series and track information, and puts the series logo on its Event and Countdown
slides (`docs/research/native-overlays.md`).

## Decisions

1. **One shared `slides` section at the top level of the profile.** The section holds `series`,
   `round`, `track` and `logo`. The later slides add their own keys to the same section, for
   example the Countdown's start time (`slides.start`), the Schedule's rounds
   (`slides.schedule`) and the Intro's crew (`slides.crew`). They read `series` and `logo` from
   it, so the broadcaster types the series once.
   - Alternative rejected: a widget key such as `widgets.event`. A widget has geometry, a
     `visible` flag and the per-widget knobs, and `/all` composes it. The slide is a full-screen
     route and uses none of these. A widget key would also put a row in the editor's widget list
     and the preview.
   - Alternative rejected: one section per slide (`eventSlide`, `countdownSlide`). Each slide would
     store its own copy of the series name and logo, and the copies could disagree.
2. **The section is named `slides`, not `event`.** The producer's snapshot already has a
   top-level `event` object (`spec/v1`, `event.{name, round, track}`), and the `/config` preview
   builds a snapshot with that key. A profile `event` would share the field names `round` and
   `track` with it, with a different type for `round` (an integer in the protocol, text here).
   Code would read the wrong one, and a review of the "dumb overlay" rule would get harder. A
   rename after release needs a migration of saved profiles, so the name is settled now.
   - Alternative rejected: keep `event` and accept the collision.
3. **Each later slide gets its own `/config` section.** The Countdown, Schedule and Intro
   sections write their keys into the same `slides` section. The series name and the logo stay
   in the Event section of the editor. No later slide adds a second control for them.
4. **The section keeps keys that it does not know.** Normalization keeps every other key of
   `slides`. A profile that a later version saves (with the Countdown's start time, say) keeps
   that content when an older editor loads and saves it. This is the same forward compatibility
   that unknown widget keys have (overlay-config rule 6). The Countdown's spec adds the
   normalization of `start` to rule 73. That change is additive.
5. **The round is text, not a number.** The producer's `event.round` is an integer that battlecast
   shows as `ROUND 3`. A broadcaster types what the series calls it: `Round 3`, `Round 3 of 8`,
   `Finale`, `Race 2`. The slide shows the text as typed. Alternative rejected: an integer with a
   fixed `ROUND` prefix. It cannot hold a named round.
6. **The Event slide's round and track are independent of the Schedule.** The Schedule slide
   (#465) keeps its own list of rounds, each with its track, and its own next and done marker.
   The Schedule never sets or changes the Event slide's `round` or `track`, and the Event slide
   never reads the Schedule. So the next round can show differently on the two slides. Nothing
   keeps them in sync: the broadcaster must keep them the same. We accept this duplicate.
   - Alternative rejected: the Event slide reads its round and track from the Schedule's next
     row. It would change the shape of the Event content after it ships, which is a breaking
     change, and it ties a simple title card to a list the broadcaster may not fill.
7. **The slide does not read the producer's `event`.** The slide opens no producer connection, so
   it works before the producer runs, as `/logos` does. The producer's `event.name` is the name of
   the meeting (`Spa 6 Hours`), not the series. So it is a different field. A fallback to the
   producer would make the slide show different content when a producer connects.
8. **The series logo comes from the existing logo store.** The companion server already stores
   uploaded images in `data/logos/` and serves them at `/logos/<file>` (ADR 0001). The Event section
   lists those images and its upload posts to the same `POST /api/logos`. The profile stores the
   URL, as `logoRotation.images` does. So the static fallback of ADR 0001 works too: a committed
   `logos/` folder and a profile that names a URL. Alternative rejected: a new asset path for event
   images. It would need a second upload API and a second folder for the same kind of file.
9. **The upload in the Event section does not add the image to the logo rotation.** The rotation
   upload adds each image to `logoRotation`. A series logo is often not a sponsor logo, so the
   Event upload sets only `slides.logo`. The image is still in the store, so the broadcaster can
   add it to the rotation later.
10. **A deleted logo clears the series logo.** The Logo rotation section can delete an image from
    the server. The editor already removes a deleted image from `logoRotation`, so the profile does
    not name a missing file. It does the same for `slides.logo`: it sets the field to `''`.
11. **Empty content is a blank board, with no placeholder.** A slide with no content shows the
    board only. A placeholder text such as "Set the event in /config" would go on air if the
    broadcaster switched to the slide early. The editor help explains the blank board instead.
12. **No entrance of its own.** `/grid` and `/results` have no entrance. The OBS scene transition
    brings a full-screen slide on air. A second animation inside the slide would play under the
    scene transition.
13. **The look under each preset follows the other takeover slides** (ADR 0036). The board is
    solid black under both vintage presets. Under `vintage70` the series name gets the 4px red
    rule that the slide headers have. Under `vintage80` it sits on the red Scoreboard plate that
    the slide titles have.

## Consequences

- The `/config` preview does not show the slide, because the slide is not a widget. The help
  behind the Event heading says so, with the `/event` URL.
- The Countdown, Schedule and Intro slides extend the `slides` section and do not add a new
  top-level section for the series name or logo.
- A logo URL that does not load shows no image and no broken-image icon.
