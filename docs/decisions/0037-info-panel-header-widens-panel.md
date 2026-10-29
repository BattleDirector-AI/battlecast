# Decision: a long info panel header widens the panel instead of being cut

**Issues:** #414 · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-28

The info panel's header names the event: round, name and track, for example
`ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS` (`what/widgets.md` rule 76). Behaviour:
`what/widgets.md` rule 78a. Mechanism: `how/renderer.md`.

## Context

Since the panel shipped (#62, ADR 0024) the header has been cut with an ellipsis at the panel's
content width. No rule asked for that: rules 76–78 said what the header holds and that a long
*line* is cut, but not what a long header does, and the component chose the ellipsis. The
vintage pass (#389, ADR 0034) then wrote the cut into rule 102 and added a `max-width: 100%` cap
to `.bc-info__header` so the 80s header tag, which hugs its text, still ellipsized.

The header is the one fixed fact on the panel: it does not rotate, so a cut header stays cut for
the whole broadcast. A cut event name reads as an error.

## Decision

The owner's decision (in chat, 2026-10-28): a header too long for the panel's slot shows in full,
and the panel widens to fit it, in every preset including `modern`.

1. **The panel is as wide as the wider of its slot and its header.** A short header leaves the
   panel exactly as it was. The rotating line still cuts with an ellipsis at the panel's width,
   whatever that width is, so a long line never widens it: only the fixed header does.
2. **It widens to the right, and to the left only when the canvas runs out.** The panel fills its
   slot from the slot's left edge, as the line's text starts at the left, so the left edge stays
   put. But the default slot sits at the bottom right with 24 px to the canvas edge, so growing to
   the right alone would put most of a long header off the canvas, which is the cut this decision
   removes. The width the canvas has no room for on the right is added on the left instead. The
   panel always covers its whole slot, so a slot the broadcaster placed partly off the canvas
   keeps its right edge and the panel grows left from there.
3. **Neighbours are the broadcaster's.** A widened panel overlaps what it overlaps, by `z`, as
   any widget does. The overlay does not move other widgets or narrow the panel to avoid them.

## Alternatives rejected

- **Keep the left edge and let the page cut what passes the canvas**, as the tower does with a
  full-name field (`what/widgets.md` rule 48). It is the simpler mechanism (CSS alone), but at the
  default bottom-right slot it cuts a long header at the canvas edge after 24 px of growth, which
  is the cut the owner asked to remove.
- **Clamp the panel at its neighbours.** The overlay would have to know which widgets are drawing
  and where, and the panel's place would then depend on other widgets' state. The broadcaster
  already controls the layout, and sees the overlap in the preview.

## Consequences

- This supersedes the part of ADR 0034's decision 3 (the 80s header tag) that capped the tag at
  the panel's content width so a long header was still cut with an ellipsis. The rest of
  decision 3 (the face, colours, block and shadow) stands.
- Rule 102's "never wider than the panel's content width … cut off with an ellipsis" and the
  `max-width: 100%` cap from #402 are gone; the header has no `max-width`, `overflow` or
  `text-overflow` in any preset.
- A panel holding a long header can be a different width under each preset, since the header's
  face differs (`overlay-config.md` rule 60 names this exception).
- The width depends on the rendered text, so it is measured in the browser, not computed from
  the string. Only a real browser can confirm it; the unit tests cover the CSS and the placement
  arithmetic.
- A header wider than the whole canvas starts at the canvas's left edge and is cut by the page at
  the right. The header is never ellipsized, even then.
