# Decision: class tags hide in a single-class session — a producer flag plus a broadcaster switch

**Issues:** #284 (producer side: BattleDirector-AI/battledirector#3636) · **Milestone:** 0.14.0
**Status:** Accepted · **Date:** 2026-10-21

In a single-class session battlecast hides its class tags: the class chips, the tower's
class-rank badge, and the class group headers. Two inputs decide it together: an optional
producer field, `session.multiclass`, and a broadcaster setting, `theme.classTags`
(`auto` / `show` / `hide`).

## Context

A broadcaster asked for the `DEFAULT` tag to go away when a session has no classes. battlecast
does not invent that label. BattleDirector normalizes an empty sim class to `"Default"`, and
battlecast renders a class chip's label verbatim (`widgets.md` rule 30), so a classless session
shows `DEFAULT` on every tower row, the battle box, both lower-thirds, the HUD, and the
grid/results headers. In a session where every car shares one class the tags carry no
information, whatever the label says.

## Decision

1. **The producer says whether the session is multi-class.** A new optional
   `session.multiclass` (boolean or null). `false` means single-class. `true`, null, or absent
   leaves the tags showing, so every existing producer renders exactly as it does today.
   BattleDirector already computes `is_multiclass`; the field just exposes it.
2. **The broadcaster can override it.** `theme.classTags`: `auto` (the default, follow the
   producer), `show`, or `hide`. This works with any producer, including one that never sends
   the field, and lets a broadcaster drop the tags from a multi-class session too.
3. **One answer for the whole overlay.** The setting lives under `theme` next to
   `theme.classColors`, not on each widget. A class tag means the same thing on every widget,
   and the producer's fact is session-wide. Per-widget switches would allow a tower without
   tags beside a battle box with them, and seven controls for one question.
4. **Hidden means gone, not blank.** The tower drops its `class` and `classpos` columns rather
   than leaving empty cells. The HUD's class field counts as having no value. The class bars
   (the coloured strips on row edges) stay: they carry no text, they are part of each row's
   design, and in a multi-class session a broadcaster who hid the tags keeps a colour cue.
5. **A grouped tower, the grid, and results render flat.** Without tags a group header has
   nothing to say: its only identity is the class chip. In a single-class session there is one
   group, the same list as the inline layout. With `hide` in a multi-class session, groups whose
   positions restart at 1 with no header between them would read as a broken running order. So
   the grouped tower renders the inline layout (overall positions, gap to the overall leader),
   and `/grid` and `/results` render one list in overall position order. That inline tower is
   an ordinary inline tower: its row budget, pinned rows and cycling window apply.
6. **A tag flip resets the full-style fit width.** A full-style tower only grows between resets
   (ADR 0018). Dropping the class columns makes every row narrower, so without a reset the tower
   would keep a width sized for columns it no longer has until the mode or a setting changed.
   Whether class tags show is therefore one of the reset triggers.

## Alternatives rejected

- **Special-casing the string `"Default"`.** It is one producer's convention, not part of the
  contract, and another producer may use `"Unknown"`, `""`, or a real series name.
- **Counting distinct classes in `vehicles[]`.** That is the overlay deriving a session fact,
  which *dumb overlay, smart producer* forbids. It would also flicker as cars join and leave,
  and could hide the tags of a multi-class race whose second class is momentarily absent.
- **Only the producer flag.** A broadcaster on a producer that never sends it would have no way
  to remove the tags.
- **Only the switch.** The broadcaster would have to remember to flip it per session; the
  producer already knows.
- **Group headers without a chip in the grouped layout.** A header reading only "12 cars" names
  nothing, and positions that restart under it still mislead.

## Consequences

- An additive `spec/v1` change: `schema.json`, `SPEC.md`, and fixtures move together and
  `schemaVersion` stays `"1"`. The reference mock producer emits the field.
- An additive config change: `configVersion` stays `"1"`, and a profile without the key
  renders `auto`.
- With `hide` on a multi-class field and `cycle.pinScope: 'class'`, the tower still pins each
  class's leaders, now with no tag saying why those rows are pinned.
- Behavior: `widgets.md` rules 60–64, `overlay-config.md` rules 47–48,
  `protocol-contract.md` rule 20.
