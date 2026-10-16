/* Per-widget text size (overlay-config.md rule 39, ADR 0015).
 *
 * The base type sizes, mirrored from tokens/typography.css (px @ 1920x1080), so `/all` can
 * redeclare every one of them on a widget's slot at base × factor. A :root token can't be
 * scaled downward from a child with calc() against itself, so the slot redeclares the
 * literal values — the same per-slot technique as the plate opacity. AllView.textScale.test.js
 * reads typography.css and fails if this map drifts from it.
 */
export const TYPE_SIZE_TOKENS = Object.freeze({
  '--bc-size-name': 22,
  '--bc-size-name-compact': 17,
  '--bc-size-pos': 22,
  '--bc-size-pos-compact': 16,
  '--bc-size-gap': 16,
  '--bc-size-gap-compact': 13,
  '--bc-size-chip': 11,
  '--bc-size-chip-compact': 9,
  '--bc-size-label': 12,
  '--bc-size-label-compact': 10,
  '--bc-size-carnum': 13,
  '--bc-size-battle-pos': 23,
  '--bc-size-battle-name': 24,
})

const round2 = (x) => Math.round(x * 100) / 100

/** Inline CSS declaring every type-size token at base × factor; '' at ×1 (no override). */
export function textScaleVars(factor) {
  if (!Number.isFinite(factor) || factor === 1) return ''
  return Object.entries(TYPE_SIZE_TOKENS)
    .map(([name, px]) => `${name}: ${round2(px * factor)}px`)
    .join('; ')
}
