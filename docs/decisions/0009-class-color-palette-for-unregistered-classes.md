# Decision: unregistered classes get a deterministic palette color, grouped by name family

**Issues:** #192 (follow-up to #190 / PR #191) · **Milestone:** unassigned
**Status:** Accepted · **Date:** 2026-09-18

Behavior: `.ai/spec/what/widgets.md` rule 31. Extends #190's fix, which stopped an unregistered
class (outside the five-entry `classMeta.js` registry) from showing a meaningless "CLS" *label* by
always rendering the producer's real class string. That fix left the *color* for any such class
flat neutral gray. This decision replaces the neutral color with a deterministic, per-class-family
one.

## Context

A real broadcast surfaced two related complaints: unregistered classes showed a generic label
(#190, fixed), and — raised directly by the project owner in the same conversation — the color for
those classes should not be one flat gray either. The owner's own framing of the desired algorithm:

> choose a color palette; find classes with similar names (e.g. LMGT3 vs. LMGT3 Am); choose
> complementary colors for those classes; pick the next similar set; repeat.

Real endurance/GT series commonly split a class by driver category — Pro/Am, Gold/Silver/Bronze/
Platinum — e.g. WEC's "LMGT3" fields both an outright and an "LMGT3 Am" classification; IMSA
similarly splits Hypercar/GTP or GTD into Pro/Am-adjacent tiers. `classMeta.js`'s five curated
entries don't attempt to anticipate every such name, and can't — the whole point of #190/#192 is
that the registry will never be exhaustive.

## Decision

A class outside the five-entry registry gets a color computed by:

1. **Family split.** Normalize the class string (trim, lowercase) and check whether its trailing
   word or two-word phrase is a recognized driver-category modifier: `pro`, `am`,
   `pro-am`/`proam`/`pro am` (all three spellings equivalent), `gold`, `silver`, `bronze`,
   `platinum`. If so, the *family root* is everything before it (e.g. `"lmgt3 am"` → root
   `"lmgt3"`, modifier `"am"`; `"lmgt3 pro am"` → root `"lmgt3"`, modifier `"pro am"`); otherwise
   the whole string is its own family root with no modifier. If the modifier IS the entire string
   (nothing precedes it), it is not split — an empty family root is nonsensical.
2. **Hue from the family root.** If the family root itself matches one of the five *curated*
   classes (e.g. `"tcr"`, the root of `"TCR Am"`), its hue/saturation is read back from that
   class's own hand-picked color — a curated class's variant shares its exact hue, not a hashed
   approximation. Otherwise the root is hashed (a plain string hash, `djb2`) into a fixed 12-hue
   palette, independent of the five curated hues. Either way, the same root always lands on the
   same hue — deterministic, not actually random, so a class's color never changes across a reload
   or between broadcasts.
3. **Shade from the modifier.** The hue is fixed per family; the *lightness* varies by modifier —
   brighter for `pro`/`gold`/`platinum`, darker/muted for `am`/`silver`/`bronze`, a small step down
   for `pro-am`/`proam`, unchanged for no modifier. Two variants of the same family therefore read
   as the same color family at a different shade, not as two unrelated colors.
4. A genuinely **absent** `vehicle_class` (rather than merely one outside the registry) keeps the
   existing flat neutral placeholder color — there is no name to hash a family/hue from.

### "Complementary" means same-hue-different-shade, not opposite-hue

The owner's own wording ("complementary colors for those classes") was resolved, when asked
directly, to mean: siblings should read as *the same class family*, distinguished by shade, not as
two contrasting colors that happen to be assigned to the same base class. True color-wheel
complementary (near-opposite hues) was considered and rejected for exactly that reason — it would
make a Pro/Am pair look unrelated, defeating the reason to group them at all.

### A variant of a curated class must not hash an unrelated hue

An early draft only checked the *exact* class string against the curated registry, so `"TCR"`
correctly kept its curated orange but `"TCR Am"` — not an exact match — fell straight through to
the hashed palette and got an unrelated color (a caught-in-review bug: `"TCR Am"` rendered green,
`"GTP Pro"` rendered pink). That is precisely the "two unrelated colors" outcome this decision
exists to prevent, and on the five *most likely* names a broadcaster will actually see split.
`resolveHueSaturationLightness` now checks the family ROOT against the curated registry as well as
the full string, so a curated class's variant inherits its exact hue/saturation and only shifts
lightness, the same as an uncurated family does relative to its own hashed hue.

### Every spelling of a modifier must canonicalize the same way, including standalone

An early draft recognized `"pro-am"`/`"proam"`/`"pro am"` as equivalent only when trailing a base
class, and only by checking each spelling as a literal key into the same lightness-delta table —
so `"LMGT3 Pro Am"` (two trailing words) split into a fake root `"lmgt3 pro"` plus modifier
`"am"` instead of root `"lmgt3"` plus the compound modifier, and a class sent as a bare `"Pro Am"`,
`"Pro-Am"`, or `"ProAm"` with nothing in front of it produced three different colors instead of
one. Modifier spellings are now resolved through a single alias table (`MODIFIER_ALIASES`) checked
against the *whole string* first (catching a standalone modifier before any word-splitting can
misread it), then against trailing two-word and one-word phrases — so every recognized spelling
canonicalizes to the same modifier key everywhere it can appear.

### Family detection is a pure function of one string

Grouping by name similarity could instead be computed *relative to the actual set of classes
present in a given snapshot* (e.g., cluster whatever classes actually appear together). Rejected:
it would require passing the full field's distinct class list into every `ClassChip` call site —
the tower, both lower-thirds, the battle box, and the grid/results group headers all render chips
independently today, each a pure function of one `carClass` string. Making family detection
relative to session state would be a materially larger change for a marginal gain: the modifier-word
heuristic already gets the stated examples (LMGT3/LMGT3 Am, Hypercar/Hypercar Am) right without it.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| True complementary (opposite) hues for family variants | Rejected directly by the owner once asked — the goal is "reads as related," which same-hue/different-shade achieves and opposite hues do not. |
| Non-deterministic (actually random) color per render | A class's color must not change mid-broadcast or between reloads — confirmed directly. Hashing the class name is what makes it stable without needing to persist an assignment anywhere. |
| Cluster classes by similarity across the live field (session-relative) | Requires plumbing the full distinct-class list into every chip call site; the trailing-modifier-word heuristic is a pure function of one string and already covers the motivating cases. |
| Extend `CLASS_META` with more hardcoded entries (GTE, LMGT3, etc.) as they come up | Never exhaustive — the entire motivation for #190/#192 is that producer class names can't be fully anticipated. Doesn't preclude also adding more curated entries later; orthogonal. |

## Consequences

- `classMeta.js` gains a palette/hash/modifier-shade mechanism (`how/` detail, not restated here);
  `classMeta()`'s own behavior and the five curated entries' colors are unchanged. Each curated
  entry does gain a `hex` field alongside its existing `cssVar` — the actual color duplicated as a
  plain value, because computing a curated class's variant shade needs its real hue/saturation in
  JS, and there is no live DOM here to resolve a CSS custom property against (`classMeta.test.js`
  guards the two staying in sync with `colors.css`).
- No config surface change — this is a rendering default, like the five curated colors themselves,
  not a broadcaster-configurable value. The separate, already-tracked feature (#59) is a
  broadcaster mapping an arbitrary class string to a custom label + hex color; this decision governs
  only the automatic default when no such mapping exists.
  **Update (ADR 0010, #197):** the override half of #59 shipped scoped to color only (the label
  stays the producer's own string per rule 30, unaffected), and folds the *default* this decision
  describes into the same mechanism the override uses — see ADR 0010 for what changed and what
  didn't.
- Two classes with unrelated names can still hash to the same hue (12 slots, unbounded possible
  class names) — accepted as an ordinary hash-bucket collision; text labels (#190) remain the
  disambiguator, exactly as they would if a producer sent two curated classes with colors that
  happened to be visually similar.
- The recognized modifier list (`Pro`/`Am`/`Pro-Am`/`Gold`/`Silver`/`Bronze`/`Platinum`) is not
  exhaustive of every real series' naming — a modifier as a *prefix* (`"Am GT3"`), a numeric split
  (`"GT3 1"`/`"GT3 2"`), or a compound like `"Bronze Cup"` is not recognized and renders as its own
  unrelated family. Accepted for the same reason `CLASS_META` itself isn't exhaustive: this handles
  the motivating cases (trailing Pro/Am-style tiers) without trying to enumerate every naming
  convention in existence.
- The 12 generated hues sit within roughly 6-14° of each curated hue's own (e.g. palette hue 40 vs.
  TCR's ~29°). An unregistered class could therefore land close enough to a curated class's color to
  be mildly confusable at a glance on a real broadcast. Not corrected here — doing so would re-pin
  every exact-value test — but worth a look if it turns out to matter in practice.
