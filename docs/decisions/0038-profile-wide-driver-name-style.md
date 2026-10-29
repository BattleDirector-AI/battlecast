# Decision: one profile-wide driver name style, and no widget cuts a name

**Issues:** #426 (supersedes #413 and #416's name handling) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-29

Every widget that shows a driver's name shows it in one style chosen once per profile:
`short` (`E.JAC`) or `full` (`E. Jacobs`). In neither style is a name cut. Behaviour:
`what/overlay-config.md` rules 42–43, `what/widgets.md` rules 111–116. Mechanism:
`how/renderer.md`, "Driver names in every widget".

## Context

ADR 0018 gave the standings tower a name style and left the other widgets alone: they "have
room for a name and keep the format they have", the full form. That premise did not hold. The
battle box's focus name runs over its neighbours (#413), the neighbour names, both lower-thirds,
the on-board HUD, the race update card and the `/grid` and `/results` slides cut a long name with
an ellipsis, and on the qualifying lower-third a long name squeezes the `CLASS BEST` label onto
two lines (#416). Two fixes were drafted widget by widget: the battle box falling back to the
short form when the full form does not fit (#421), and the qualifying card trying full, then
short, then an ellipsis (#423). Both made the form a car's name takes depend on how much room
one widget happened to have, so the same driver could read `M. Verstappen` in one box and `M.VER`
in the next, or change form when the preset changed.

## Decision

The owner's decision (in chat, 2026-10-29): "switch to a global 'short or full name' config. all
widgets expand to support full names without ellipses when that is set. otherwise, when using
short names, make sure each widget can always display the first initial and the last 3 letters
(T.VAN)".

1. **One setting, `theme.nameStyle`, for the whole overlay.** Every widget that shows a name reads
   it: the tower, the battle box, the driver and qualifying lower-thirds, the HUD's identity strip,
   the race update card and the `/grid` and `/results` slides. It lives in `theme` beside
   `classTags` (ADR 0022), the other overlay-wide display setting every widget reads. The short and
   full forms are the ones ADR 0018 defined (`widgets.md` rules 47 and 48). "T.VAN" in the owner's
   words is rule 47's short form: the first initial, `.`, and three letters of the last name.
2. **No name is ever cut.** No ellipsis, no clip, no wrap, no swap to the other form, no smaller
   font. A widget whose configured width leaves a name less room than it needs grows wider
   instead, in either style.
3. **Short style reserves room for any short form.** Each widget slot that shows one car's name
   is never narrower than the reference code `W.WWW` (a capital `W`, `.`, three capital `W`s)
   rendered as the name renders. `W` is among the widest Latin capitals in every face the overlay
   uses, so a usual short form fits without the widget changing size from one car to the next. A
   short form wider than the reference, from rule 47's `ß` → `SS` lengthening (`J.ASSM`) or a
   wider letter in another script, still shows whole: the widget grows for it as it would in full
   style. The tower and the slides take no reference: their name column is already as wide as
   the widest name in the whole field.
4. **The default is `short`.** It is the tower's default today, so a profile without the setting
   keeps its tower exactly as it is, and short is the style in which widgets keep their set size.
5. **Growth is width only, and stays in view where it can.** A grown widget keeps its height. In
   `/all` it keeps its left edge and grows right, and where it would pass the canvas's right edge
   it shifts left by the overflow: the info panel's placement (ADR 0037), so a widget placed near
   the right edge (the race update card by default) shows its name instead of losing it to the
   canvas edge. The tower keeps its own growth rule (ADR 0018), unchanged.

## Migration

The tower-only `widgets.tower.nameStyle` becomes the profile-wide `theme.nameStyle`. A profile
that stores a valid `theme.nameStyle` uses it. One that does not, but stores a valid tower
`nameStyle`, uses the tower's value for the whole overlay; otherwise `short`. Normalized widgets
no longer carry `nameStyle`, so the next Save from `/config` stores the style once, in `theme`.
`configVersion` stays `"1"` (`overlay-config.md` rule 2): nothing fails to load, no geometry
changes, and a stored tower `full` keeps meaning full names, now everywhere. A broadcaster who had
`full` on the tower already saw full names in every other widget, so for them nothing changes but
the end of the ellipsis.

## Why short is the default

- **It is what every existing profile's tower already shows.** No stored value changes meaning,
  and the tower, the widget with the most names on screen, looks exactly as it did.
- **It keeps widgets at their set size.** A full-name widget can grow past its slot, over its
  neighbour in `/all` or off the Browser Source, the first time a long name comes on camera, and
  nothing warns the operator. In short style that happens only for a short form wider than
  `W.WWW`, which takes rule 47's `ß` lengthening or an unusually wide letter.
- **One look across the overlay.** With the setting profile-wide, a short tower beside a
  full-name lower-third is no longer possible.

## Consequences

- **Existing profiles change appearance outside the tower.** A profile without the setting now
  shows `E.JAC` in the battle box, both lower-thirds, the HUD, the race update card and the
  slides, where it showed `E. Jacobs`. A broadcaster who wants full names sets `full` once.
- **In full style widgets other than the tower change width on air.** The battle box, the
  lower-thirds, the HUD and the race update card follow the names they show with no hold: a camera
  cut to a long name widens them, and a cut to a short one narrows them back to their set width.
  The tower keeps its grow-only width (ADR 0018); it shows the whole field at once, so it can size
  to the field instead of to one car.
- **A grown widget overlaps its neighbours.** It draws over or under them by `z`, as the info
  panel does (ADR 0037). The overlay does not move other widgets; the stored geometry and the
  editor's drag box do not change.
- **The page still cuts what passes the canvas or the Browser Source.** A name wider than the
  whole canvas, or a standalone route narrower than one name, is cut at the right edge. No widget
  ellipsizes it even then.
- **The tower gains a short-style minimum width.** A tower set narrower than its rows up to the
  end of the name column grows to that width, so a very small `w` can no longer cut a short code.
  At any width the default layout uses, nothing changes.
- **The qualifying card's label stays on one line** (#416): the label, position and chip render
  whole and the card widens for the name, so a long name no longer makes the card taller.
- **The race update card's detail line and the HUD's make-and-model line still cut** with an
  ellipsis. They are not names.
- **Measuring needs a real browser.** Whether a widget's width holds its name depends on rendered
  glyph widths. Unit tests stub the measurements; a headless-Chromium check confirms the layout.
- This supersedes ADR 0018's decision 1 ("The battle box, lower-thirds and on-board HUD are not
  touched") and its scope: the name style is no longer a tower setting. ADR 0018's short and full
  forms, its tower growth rule and its reasons for a short default stand.

## Alternatives rejected

- **Per-widget fallback to the short form** (#421, #423). The form a name takes would depend on
  each widget's room, so one driver reads two ways at once on screen and changes form with the
  preset or the text size.
- **Cut with an ellipsis.** It loses the surname, the most identifying part, on exactly the names
  that are long, and the `overflow: hidden` it needs clips the name's glow, extrusion and outline.
- **A per-widget style.** It brings back a short tower beside a full lower-third, and seven
  controls where one does.
- **Full by default.** The look most widgets have today, but with growth it is the setting that
  can push widgets off the Browser Source unattended, and it would change every existing tower
  from short to full.
- **Shrinking the font to fit.** Rejected by ADR 0003 and ADR 0018: it degrades without warning and
  makes one driver's name a different size from the next.
- **Keeping the left edge and letting the canvas cut**, the tower's rule. At the race update
  card's default slot, 24 px from the right edge, a long name would be cut almost at once.
- **A fixed reserved width sized to the longest plausible short form** (`W.WSSSSSS` and the like).
  It would widen every widget for a case that almost never happens; growing for that case is
  cheaper and still never cuts.
