/* Battlecast — multi-class registry (shared by standings/battle components).
 * Extensible: add an entry here + a --bc-class-<key> token in colors.css (and its
 * `hex` twin here — see the note above CLASS_META).
 * `order` defines class-mode grouping sequence and overall class-leader ranking.
 *
 * A class OUTSIDE this registry (e.g. GTE) still gets a real color, not a flat
 * neutral one — see `resolveFallbackColor` below (rule 31,
 * docs/decisions/0009-class-color-palette-for-unregistered-classes.md). That path
 * is deterministic (hashed from the class name) and groups a base class with its
 * driver-category variants — "LMGT3" / "LMGT3 Am", "Hypercar" / "Hypercar Am" —
 * onto the same hue at different shades. A variant of a CURATED class (e.g. "TCR
 * Am") inherits that class's own hue/saturation the same way, rather than hashing
 * an unrelated one — see `resolveHueSaturationLightness`. */

// `hex` duplicates each class's actual color from colors.css so JS can compute a
// same-hue, different-shade variant (rule 31) without live DOM access to resolve
// a CSS custom property — happy-dom (this repo's test env) can't do that anyway.
// `classMeta.test.js` asserts these stay in sync with colors.css as plain text.
export const CLASS_META = {
  gtp: { key: 'gtp', short: 'GTP', name: 'HYPERCAR', cssVar: '--bc-class-gtp', hex: '#FF4D6D', order: 0 },
  lmp2: { key: 'lmp2', short: 'LMP2', name: 'PROTOTYPE', cssVar: '--bc-class-lmp2', hex: '#4D9BFF', order: 1 },
  gt3: { key: 'gt3', short: 'GT3', name: 'GT3', cssVar: '--bc-class-gt3', hex: '#36D17A', order: 2 },
  gt4: { key: 'gt4', short: 'GT4', name: 'GT4', cssVar: '--bc-class-gt4', hex: '#B98CFF', order: 3 },
  tcr: { key: 'tcr', short: 'TCR', name: 'TOURING', cssVar: '--bc-class-tcr', hex: '#FF9A3C', order: 4 },
}

const FALLBACK = { key: 'cls', short: 'CLS', name: 'CLASS', cssVar: '--bc-text-2', order: 99 }

/** A plain object used as a lookup table inherits `Object.prototype` — a producer
 *  sending `vehicle_class: "constructor"` (or "toString", "hasOwnProperty", ...)
 *  would otherwise silently return a built-in Function instead of `undefined`,
 *  corrupting everything downstream (`hashString` then throws trying to
 *  `charCodeAt` a function). `Object.hasOwn` restricts every lookup below to the
 *  table's own real entries — a producer's string is untrusted input like any
 *  other, and this is the one place several of them pass straight through a
 *  bracket access. */
function ownLookup(table, key) {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/** Normalize any class key (case-insensitive) to its metadata. */
export function classMeta(carClass) {
  if (!carClass) return FALLBACK
  return ownLookup(CLASS_META, String(carClass).toLowerCase()) || FALLBACK
}

// ---- Fallback palette for a class outside the curated registry (rule 31) ---
//
// Twelve hues, independent of the five curated classes' hand-picked colors, at a
// saturation/lightness in the same vivid-over-video register those use. Evenly
// spaced so an arbitrary number of distinct producer class names spread out
// rather than clustering. (Some hash collisions across unrelated class names are
// expected and accepted at this palette size — see ADR 0009's Consequences.)
const PALETTE_HUES = [10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340]
const PALETTE_SATURATION = 75
const BASE_LIGHTNESS = 62

// Every recognized spelling of a driver-category modifier maps to ONE canonical
// key, so "pro-am", "proam", and "pro am" always produce the identical shade —
// whether trailing a base class ("LMGT3 Pro-Am") or standing alone as a class
// name by itself ("Pro-Am"). Lightness deltas (keyed by the CANONICAL form only)
// keep a variant's hue identical to its family while shifting its shade: brighter
// for the more experienced tier, darker/muted for the less experienced one.
const MODIFIER_ALIASES = {
  pro: 'pro',
  am: 'am',
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  platinum: 'platinum',
  proam: 'proam',
  'pro-am': 'proam',
  'pro am': 'proam',
}
const MODIFIER_LIGHTNESS_DELTA = {
  platinum: 10,
  gold: 10,
  pro: 8,
  proam: -2,
  silver: -8,
  bronze: -10,
  am: -10,
}

/** Plain string hash (djb2a — the XOR-combine variant), unsigned — deterministic,
 *  not cryptographic. */
function hashString(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return hash >>> 0
}

function hslToHex(h, s, l) {
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = light - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/** Inverse of `hslToHex` — needed to read a curated class's OWN hue/saturation/
 *  lightness back out of its hand-picked hex, so a variant of a curated class can
 *  shift lightness only and land on the exact same hue, not an approximation. */
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

/** Split a normalized (trimmed, lowercased) class string into its family root and
 *  canonical modifier, or `{ familyRoot: normalized, modifier: null }` when
 *  nothing recognized applies. Three cases, checked in order:
 *  1. The WHOLE string is itself a recognized modifier/phrase ("Pro-Am", "ProAm",
 *     "Pro Am", "Am", ...) with nothing in front of it — it is its own family,
 *     canonicalized so every spelling of the same phrase converges (there is no
 *     root to shade against, so `modifier` is `null` here even though the string
 *     matched one — it's the family's own base shade, not a variant of anything).
 *  2. A trailing TWO-word phrase ("... Pro Am") is a recognized compound.
 *  3. A trailing ONE word ("... Am", "... Pro-Am", "... ProAm") is recognized.
 *  Checked whole-string first specifically so a standalone phrase is never
 *  mistaken for a one-word suffix of an accidental one-word "root" (e.g. "Pro
 *  Am" alone must not become root "pro" + modifier "am"). */
function splitClassFamily(normalized) {
  const wholeAlias = ownLookup(MODIFIER_ALIASES, normalized)
  if (wholeAlias) return { familyRoot: wholeAlias, modifier: null }

  const words = normalized.split(/\s+/)
  if (words.length > 2) {
    const aliasTwo = ownLookup(MODIFIER_ALIASES, words.slice(-2).join(' '))
    if (aliasTwo) return { familyRoot: words.slice(0, -2).join(' '), modifier: aliasTwo }
  }
  if (words.length > 1) {
    const aliasOne = ownLookup(MODIFIER_ALIASES, words[words.length - 1])
    if (aliasOne) return { familyRoot: words.slice(0, -1).join(' '), modifier: aliasOne }
  }
  return { familyRoot: normalized, modifier: null }
}

/** The base hue/saturation/lightness for a family root: a CURATED class's own
 *  values (read back from its hex) when the root matches one of the five, or a
 *  hashed palette slot otherwise. `curatedKey` is set only in the first case, so
 *  callers can tell a curated-family variant from a fully-hashed one. */
function resolveHueSaturationLightness(familyRoot) {
  const known = ownLookup(CLASS_META, familyRoot)
  if (known) {
    const { h, s, l } = hexToHsl(known.hex)
    return { hue: h, saturation: s, lightness: l, curatedKey: known.key }
  }
  const hue = PALETTE_HUES[hashString(familyRoot) % PALETTE_HUES.length]
  return { hue, saturation: PALETTE_SATURATION, lightness: BASE_LIGHTNESS, curatedKey: null }
}

/** Deterministically resolve a color for a class that ISN'T an exact curated-key
 *  match (rule 31) — same hue for every variant of the same family (a curated
 *  class's own hue when the family root IS one, e.g. "TCR Am"; a hashed palette
 *  hue otherwise), shaded by the recognized modifier. Returns `null` for a class
 *  with no real name (nothing to derive a family from), so the caller falls back
 *  to the neutral placeholder. Exported (not just used internally by
 *  `classColor`) so callers/tests can assert on the hue/lightness/family
 *  directly rather than parsing a hex string. */
export function resolveFallbackColor(carClass) {
  const trimmed = carClass != null ? String(carClass).trim() : ''
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase()
  const { familyRoot, modifier } = splitClassFamily(normalized)
  const { hue, saturation, lightness: baseLightness, curatedKey } =
    resolveHueSaturationLightness(familyRoot)
  const delta = modifier ? ownLookup(MODIFIER_LIGHTNESS_DELTA, modifier) : 0
  const lightness = Math.min(85, Math.max(30, baseLightness + delta))
  return {
    hue,
    saturation,
    lightness,
    familyRoot,
    modifier,
    curatedKey,
    hex: hslToHex(hue, saturation, lightness),
  }
}

/** CSS color for a class: a broadcaster's `theme.classColors` override for an
 *  EXACT (trim, lowercase) match (rule 32, ADR 0010) takes precedence over
 *  everything else and does not cascade to a driver-category variant of the
 *  same family; otherwise the flat neutral placeholder for no class at all, or
 *  the deterministic algorithm (rule 31) for every other class alike —
 *  including the five previously-curated ones, which land on the exact same
 *  hex they always have (verified lossless in ADR 0010) since there is no
 *  longer a separate exact-match `var()` short-circuit for them. `overrides`
 *  is the already-normalized `theme.classColors` map (or omitted/`{}`). */
export function classColor(carClass, overrides) {
  const trimmed = carClass != null ? String(carClass).trim() : ''
  if (!trimmed) return `var(${FALLBACK.cssVar})`
  const key = trimmed.toLowerCase()
  const override = overrides && typeof overrides === 'object' ? ownLookup(overrides, key) : undefined
  if (override) return override
  const resolved = resolveFallbackColor(carClass)
  return resolved ? resolved.hex : `var(${FALLBACK.cssVar})`
}

/** Class keys in ramp order. */
export function classOrder() {
  return Object.values(CLASS_META).sort((a, b) => a.order - b.order).map((c) => c.key)
}
