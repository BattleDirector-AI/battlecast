import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classColor, classMeta, resolveFallbackColor, CLASS_META } from './classMeta.js'

/* Rule 31 (docs/decisions/0009-class-color-palette-for-unregistered-classes.md):
 * a class outside the five-entry registry gets a deterministic color hashed from
 * its own name, grouping a base class with its driver-category variants onto the
 * same hue at a different shade — never a flat neutral color, and never actually
 * random (the same string must always resolve to the same color). A variant of a
 * CURATED class (e.g. "TCR Am") groups onto THAT class's own hue, not a hashed
 * unrelated one.
 *
 * Rule 32 / ADR 0010 (#197): `classColor`'s old exact-match `var(--bc-class-*)`
 * short-circuit for the five curated classes is gone — EVERY class, curated or
 * not, computes its default through this same deterministic algorithm. Verified
 * (ADR 0010) that hexToHsl→hslToHex round-trips losslessly for all five curated
 * hexes, so an unmodified curated class renders the identical color it always
 * has, as a literal hex now rather than a var() reference. */

describe('classMeta — curated classes get their default through the same deterministic algorithm (ADR 0010)', () => {
  it('an unmodified curated class resolves to its own established hex, not a var() reference', () => {
    expect(classColor('gt3')).toBe(CLASS_META.gt3.hex)
    expect(classColor('GTP')).toBe(CLASS_META.gtp.hex)
    expect(classColor('gt3')).toMatch(/^#[0-9A-F]{6}$/)
  })

  it("CLASS_META's duplicated hex values stay in sync with colors.css", () => {
    // classMeta.js keeps its own `hex` copy of each curated color (needed to
    // compute a variant's shade in plain JS — no live DOM to resolve a CSS custom
    // property against, and happy-dom couldn't resolve one anyway). This guards
    // against the two drifting apart silently.
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'tokens', 'colors.css')
    const css = readFileSync(cssPath, 'utf8')
    for (const { key, cssVar, hex } of Object.values(CLASS_META)) {
      const match = css.match(new RegExp(`${cssVar}:\\s*(#[0-9A-Fa-f]{6})`))
      expect(match, `${key} (${cssVar}) not found in colors.css`).not.toBeNull()
      expect(match[1].toUpperCase(), key).toBe(hex.toUpperCase())
    }
  })
})

describe('classMeta — a variant of a CURATED class shares that class\'s hue (not a hashed one)', () => {
  it('TCR and TCR Am share TCR\'s own hue, Am darker', () => {
    // Calling resolveFallbackColor('TCR') directly just to read TCR's own
    // hue/lightness math for comparison — classColor('TCR') itself is covered
    // separately below.
    const base = resolveFallbackColor('TCR')
    const am = resolveFallbackColor('TCR Am')
    expect(am.curatedKey).toBe('tcr')
    expect(am.hue).toBe(base.hue)
    expect(am.lightness).toBeLessThan(base.lightness)
  })

  it('GTP Pro shares GTP\'s own hue, brighter', () => {
    const base = resolveFallbackColor('GTP')
    const pro = resolveFallbackColor('GTP Pro')
    expect(pro.curatedKey).toBe('gtp')
    expect(pro.hue).toBe(base.hue)
    expect(pro.lightness).toBeGreaterThan(base.lightness)
  })

  it('classColor(\'TCR Am\') is a real color, not the flat neutral placeholder, and not plain TCR\'s color', () => {
    const tcr = classColor('TCR')
    const tcrAm = classColor('TCR Am')
    expect(tcr).toBe(CLASS_META.tcr.hex) // unmodified curated class: unchanged color
    expect(tcrAm).not.toBe('var(--bc-text-2)')
    expect(tcrAm).not.toBe(tcr) // a distinct shade, not identical to the base
  })

  it('a fully unregistered family (LMGT3) is NOT treated as a curated variant', () => {
    expect(resolveFallbackColor('LMGT3').curatedKey).toBeNull()
    expect(resolveFallbackColor('LMGT3 Am').curatedKey).toBeNull()
  })
})

describe('classMeta — resolveFallbackColor groups variants onto the same hue (rule 31)', () => {
  it('gives a base class and its Am variant the same hue, Am darker', () => {
    const base = resolveFallbackColor('LMGT3')
    const am = resolveFallbackColor('LMGT3 Am')
    expect(am.hue).toBe(base.hue)
    expect(am.familyRoot).toBe('lmgt3')
    expect(am.lightness).toBeLessThan(base.lightness)
  })

  it('gives the Pro variant the same hue as the base, but brighter', () => {
    const base = resolveFallbackColor('LMGT3')
    const pro = resolveFallbackColor('LMGT3 Pro')
    expect(pro.hue).toBe(base.hue)
    expect(pro.lightness).toBeGreaterThan(base.lightness)
  })

  it('treats "Pro-Am" and "Pro Am" (hyphen vs. space) as the same shade of the same family', () => {
    // Same visible color either way — `modifier` itself legitimately differs
    // ('proam' vs 'pro am' as the matched spelling isn't recorded past aliasing),
    // the point is the resulting shade is identical.
    const hyphenated = resolveFallbackColor('LMGT3 Pro-Am')
    const spaced = resolveFallbackColor('LMGT3 Pro Am')
    expect(spaced.hex).toBe(hyphenated.hex)
    expect(spaced.hue).toBe(hyphenated.hue)
    expect(spaced.lightness).toBe(hyphenated.lightness)
    expect(hyphenated.familyRoot).toBe('lmgt3')
  })

  it('is exact-value pinned for a representative family, not just relationally checked', () => {
    // Pins the actual computed values (not just "am < base < pro") so a future
    // change to the palette/deltas is a visible, deliberate diff here.
    expect(resolveFallbackColor('LMGT3')).toEqual({
      hue: 10,
      saturation: 75,
      lightness: 62,
      familyRoot: 'lmgt3',
      modifier: null,
      curatedKey: null,
      hex: '#E76E55',
    })
    expect(resolveFallbackColor('LMGT3 Am').hex).toBe('#E04729')
  })

  it('a different family (Hypercar) gets a different hue than LMGT3', () => {
    const lmgt3 = resolveFallbackColor('LMGT3')
    const hypercar = resolveFallbackColor('Hypercar')
    expect(hypercar.hue).not.toBe(lmgt3.hue)
  })

  it('groups Hypercar and Hypercar Am the same way as the LMGT3 family', () => {
    const base = resolveFallbackColor('Hypercar')
    const am = resolveFallbackColor('Hypercar Am')
    expect(am.hue).toBe(base.hue)
    expect(am.lightness).toBeLessThan(base.lightness)
  })
})

describe('classMeta — a standalone modifier (no base class in front of it) is its own family', () => {
  it('treats "Pro Am", "Pro-Am", and "ProAm" as literal class names identically, all three spellings', () => {
    // These are recognized as a MODIFIER OF something when trailing a base class
    // (the block above), but a producer could also send one of these spellings as
    // a bare class name with nothing in front of it. All three must still collapse
    // onto the same color as each other, even though there's no base to shade
    // against here (this used to diverge: "Pro Am" split into a fake root "pro" +
    // modifier "am", while "Pro-Am"/"ProAm" did not split at all).
    const spaced = resolveFallbackColor('Pro Am')
    const hyphenated = resolveFallbackColor('Pro-Am')
    const solid = resolveFallbackColor('ProAm')
    expect(spaced.hex).toBe(hyphenated.hex)
    expect(solid.hex).toBe(hyphenated.hex)
    expect(hyphenated.familyRoot).toBe('proam')
    expect(hyphenated.modifier).toBeNull() // it's the family's own base shade, not a variant
  })
})

describe('classMeta — resolveFallbackColor is deterministic, not random', () => {
  it('returns the identical color for the same class string called twice', () => {
    expect(resolveFallbackColor('GTE')).toEqual(resolveFallbackColor('GTE'))
    expect(classColor('GTE')).toBe(classColor('GTE'))
  })

  it('is case-insensitive and trims whitespace', () => {
    const canonical = resolveFallbackColor('GTE')
    expect(resolveFallbackColor('gte')).toEqual(canonical)
    expect(resolveFallbackColor('  GTE  ')).toEqual(canonical)
  })
})

describe('classMeta — a class named after an Object.prototype property does not crash', () => {
  // Every lookup table here (CLASS_META, MODIFIER_ALIASES, MODIFIER_LIGHTNESS_DELTA)
  // is a plain object, which inherits Object.prototype — a producer sending
  // `vehicle_class: "constructor"` (or "toString", "hasOwnProperty", "__proto__",
  // "valueOf") would otherwise get back a built-in Function instead of `undefined`
  // from a bare bracket lookup, corrupting everything downstream instead of being
  // treated like any other unrecognized class string.
  const dangerous = ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']

  it('resolves like any ordinary unrecognized class, without throwing', () => {
    for (const name of dangerous) {
      expect(() => resolveFallbackColor(name)).not.toThrow()
      const resolved = resolveFallbackColor(name)
      expect(resolved).not.toBeNull()
      expect(resolved.familyRoot).toBe(name.toLowerCase())
      expect(resolved.modifier).toBeNull()
      expect(resolved.hex).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('classColor and classMeta also treat it as an ordinary unrecognized class', () => {
    for (const name of dangerous) {
      expect(() => classColor(name)).not.toThrow()
      expect(classColor(name)).toMatch(/^#[0-9A-F]{6}$/)
      expect(classMeta(name)).toEqual(classMeta('SomeTotallyUnrelatedClass'))
    }
  })

  it('as a trailing word after a real class, it is treated as an ordinary (unrecognized) suffix', () => {
    // Not a recognized modifier, so no split — the whole string is its own family.
    const resolved = resolveFallbackColor('GT3 constructor')
    expect(resolved.familyRoot).toBe('gt3 constructor')
    expect(resolved.curatedKey).toBeNull()
  })
})

describe('classMeta — only a genuinely absent class stays neutral', () => {
  it('an unrecognized-but-real class does NOT get the neutral placeholder color', () => {
    expect(classColor('GTE')).not.toBe('var(--bc-text-2)')
    expect(resolveFallbackColor('GTE')).not.toBeNull()
  })

  it('a whitespace-only or absent class keeps the flat neutral color', () => {
    expect(classColor('   ')).toBe('var(--bc-text-2)')
    expect(classColor('')).toBe('var(--bc-text-2)')
    expect(classColor(undefined)).toBe('var(--bc-text-2)')
    expect(resolveFallbackColor('   ')).toBeNull()
  })
})

/* SPEC-FIRST (#197): `.ai/spec/what/widgets.md` rule 32 / ADR 0010 — a broadcaster override
 * (`theme.classColors`) takes precedence over the deterministic default for an EXACT normalized
 * class-string match, and does not cascade to a driver-category variant of the same family. RED
 * until `classColor` accepts and applies an overrides map. */
describe('classColor — broadcaster overrides take precedence (rule 32, ADR 0010)', () => {
  it('an override on a curated class replaces its established default', () => {
    expect(classColor('gtp', { gtp: '#123456' })).toBe('#123456')
    expect(classColor('gtp', { gtp: '#123456' })).not.toBe(CLASS_META.gtp.hex)
  })

  it('an override on a non-curated class replaces the hashed default', () => {
    expect(classColor('F1', { f1: '#abcdef' })).toBe('#abcdef')
  })

  it('the override key match is case-insensitive on the class string, matching classMeta\'s own normalization', () => {
    expect(classColor('GTP', { gtp: '#123456' })).toBe('#123456')
  })

  it('an override does NOT cascade to a driver-category variant of the same family', () => {
    // Overriding "tcr" must not recolor "tcr am" — that stays on rule 31's
    // family-shared-hue default unless it has its own entry. Asserts the override
    // on "tcr" itself in the SAME test (not just elsewhere in this file) so a
    // "wrong implementation" that ignores overrides entirely — which would also
    // leave "tcr am" untouched — cannot pass this test.
    const overrides = { tcr: '#123456' }
    expect(classColor('TCR', overrides)).toBe('#123456')
    const overriddenAm = classColor('TCR Am', overrides)
    expect(overriddenAm).not.toBe('#123456')
    expect(overriddenAm).toBe(resolveFallbackColor('TCR Am').hex)
  })

  it('an exact entry for the variant itself is honored', () => {
    expect(classColor('TCR Am', { 'tcr am': '#654321' })).toBe('#654321')
  })

  it('a class with no matching entry keeps resolving through the default, overrides present or not', () => {
    expect(classColor('gt3', { gtp: '#123456' })).toBe(CLASS_META.gt3.hex)
    expect(classColor('gt3', {})).toBe(CLASS_META.gt3.hex)
    expect(classColor('gt3', undefined)).toBe(CLASS_META.gt3.hex)
  })

  it('overrides never apply to a genuinely absent class — it keeps the flat neutral color', () => {
    expect(classColor(undefined, { gtp: '#123456' })).toBe('var(--bc-text-2)')
    expect(classColor('   ', { gtp: '#123456' })).toBe('var(--bc-text-2)')
  })
})
