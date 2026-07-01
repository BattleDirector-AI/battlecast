/* Battlecast — multi-class registry (shared by standings/battle components).
 * Extensible: add an entry here + a --bc-class-<key> token in colors.css.
 * `order` defines class-mode grouping sequence and overall class-leader ranking. */

export const CLASS_META = {
  gtp: { key: 'gtp', short: 'GTP', name: 'HYPERCAR', cssVar: '--bc-class-gtp', order: 0 },
  lmp2: { key: 'lmp2', short: 'LMP2', name: 'PROTOTYPE', cssVar: '--bc-class-lmp2', order: 1 },
  gt3: { key: 'gt3', short: 'GT3', name: 'GT3', cssVar: '--bc-class-gt3', order: 2 },
  gt4: { key: 'gt4', short: 'GT4', name: 'GT4', cssVar: '--bc-class-gt4', order: 3 },
  tcr: { key: 'tcr', short: 'TCR', name: 'TOURING', cssVar: '--bc-class-tcr', order: 4 },
}

const FALLBACK = { key: 'cls', short: 'CLS', name: 'CLASS', cssVar: '--bc-text-2', order: 99 }

/** Normalize any class key (case-insensitive) to its metadata. */
export function classMeta(carClass) {
  if (!carClass) return FALLBACK
  return CLASS_META[String(carClass).toLowerCase()] || FALLBACK
}

/** CSS color reference for a class, e.g. 'var(--bc-class-gt3)'. */
export function classColor(carClass) {
  return `var(${classMeta(carClass).cssVar})`
}

/** Class keys in ramp order. */
export function classOrder() {
  return Object.values(CLASS_META).sort((a, b) => a.order - b.order).map((c) => c.key)
}
