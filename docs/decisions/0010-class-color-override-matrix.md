# Decision: class-color overrides are freeform, keyed by exact class string — no curated/unregistered split

**Issues:** #197 (split from #59) · **Amends:** #0009's `#59` forward-reference · **Milestone:** unassigned
**Status:** Accepted · **Date:** 2026-09-18

Behavior: `.ai/spec/what/widgets.md` rule 32, `.ai/spec/what/overlay-config.md` rules 32-33.

## Context

#59 asked for a broadcaster-configurable per-class color override, surfaced as a matrix in `/config`.
The issue's own wording ("a league can set its own GTP/LMP2/GT3/etc. keys") reads as scoping the
matrix to `classMeta.js`'s five curated entries, optionally with a manual "add a class" affordance
for anything outside that set — mirroring the curated/unregistered split ADR 0009 already draws for
the *default* color.

Asked directly which of two shapes to build — (a) five fixed rows only, or (b) five fixed rows plus
a freeform "add a class" control — the project owner rejected keeping any curated/unregistered split
for color at all, in favor of one uniform mechanism: no seeded rows, freeform add for any class
string, with ADR 0009's deterministic algorithm as the fallback for every class alike.

## Decision

1. **The editor's Class Colors matrix has no seeded or fixed rows.** Every row is one the
   broadcaster explicitly added — a class-name field plus a color picker — for any string, not a
   set curated in advance. An empty override map renders no rows.
2. **`classColor()`'s curated exact-match shortcut is removed.** Today an exact match on one of the
   five `CLASS_META` keys returns that class's own CSS custom property (`var(--bc-class-gtp)`,
   etc.), bypassing the ADR-0009 algorithm entirely; every other class goes through the algorithm.
   That branch goes away: **every** class, curated or not, computes its default color through the
   same ADR-0009 deterministic algorithm. `resolveHueSaturationLightness` already reads a curated
   family root's hue/saturation back out of its own hex (so `"TCR Am"` shares plain `"TCR"`'s hue);
   the same lookup now also produces plain `"TCR"`'s own color, rather than a second, bypassing code
   path producing it.
3. **An override (`theme.classColors`) takes precedence over the deterministic default for an
   *exact* match** on the same normalized (trim, lowercase) class string used everywhere else
   (`classMeta`, rule 31/32). It does **not** cascade to a driver-category variant sharing the same
   family root: overriding `"tcr"` does not recolor `"tcr am"`. A broadcaster who wants that adds a
   separate `"tcr am"` entry. Cascading was considered and rejected (see below).

### The curated hex values survive the refactor exactly, verified

Removing the shortcut only changes anything observable if `hslToHex(hexToHsl(hex))` differs from the
original `hex` for one of the five curated colors. Checked directly — it round-trips losslessly for
all five (`#FF4D6D`, `#4D9BFF`, `#36D17A`, `#B98CFF`, `#FF9A3C`) — so an unmodified curated class
renders the identical hex it always has; only the mechanism producing it changes, not the pixel.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Five fixed rows only (mirrors `CLASS_META`) | Insufficient for a league whose classes aren't in the curated five — exactly the gap ADR 0009 already exists to cover for the *default* color; the override matrix would then be *less* capable than the automatic fallback it sits beside. |
| Five fixed rows + freeform "add a class" | Keeps two mental models and two code paths (curated exact-match vs. hashed default) for what is, to a broadcaster, one concept: "this class's color." Rejected by the project owner directly in favor of one uniform mechanism. |
| Override cascades to a family's variants (overriding `"tcr"` also recolors `"tcr am"`) | Surprising — a broadcaster adding one row would silently change a *different* class they didn't name. It also duplicates ADR 0009's own family-detection logic in a second, override-specific place. An override is a literal, explicit mapping; a broadcaster who wants a variant colored too adds its own row. |

## Consequences

- `classMeta.js`'s `CLASS_META` keeps its `short`/`name`/`order` fields (fallback label, tower
  grouped-layout ordering) — unaffected, out of scope here. Only its role in *color* resolution
  changes: `hex` is still read by `resolveHueSaturationLightness` (a curated family root's anchor
  hue), but no longer short-circuits `classColor()` on an exact match.
- The five `--bc-class-*` CSS custom properties in `colors.css` become unused by `classColor()`.
  Left in place as the documented "canonical" anchor colors `classMeta.js`'s duplicated `hex` values
  must stay in sync with (`classMeta.test.js` already asserts that sync) — removing them is a
  separate cleanup, not required by this decision.
- `classMeta.test.js`'s two assertions that `classColor('gt3')`/`classColor('GTP')` equal
  `var(--bc-class-gt3)`/`var(--bc-class-gtp)` state the *old* mechanism and are updated to assert
  the equivalent literal hex — same rendered color, new expected value.
- ADR 0009's Consequences section said feature #59 covers "a broadcaster mapping an arbitrary class
  string to a custom label + hex color" and that #59 "governs only the automatic default when no
  such mapping exists" (implying two separate paths). This decision folds the *default* into the
  same one-string-in, one-color-out shape the override uses, rather than leaving them as siblings.
  The **label** half of that old framing is not part of this decision or of #197 — `widgets.md` rule
  30 already settled that a class chip's label is always the producer's own string, never a
  registry/override label, and this decision does not revisit that.
- `theme.classColors` is unbounded (freeform key, any string) and additive/defaulted like every
  other config surface — an empty or missing map changes nothing about how any class renders.
