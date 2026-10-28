/* Whether a vintage class chip's label face can render upright (widgets.md rules 89, 97, 105).
 *
 * `font-style: normal` only renders upright when the face has an upright cut. ClassChip sets its
 * own face (`--bc-font-ui`), which under `vintage70` is Barlow, bundled italic only, so a chip
 * whose label must be upright names another face token. This resolves a themed `font-family`
 * value (`var(--bc-font-display)`) through `tokens/typography.css` to its first family and checks
 * `tokens/fonts.css` bundles a `font-style: normal` face of it at the chip's weight
 * (`--bc-weight-label`, the preset's own value when it sets one, else `:root`'s).
 *
 * The CSS is read from disk: a `?raw` CSS import is empty under vitest. Lives under
 * `lib/testing/` — test scaffolding, never shipped. Not a `*.test.js`, so vitest does not
 * collect it.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'tokens')
const css = (f) => readFileSync(join(TOKENS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** A custom property's value in the first block whose selector is exactly `selector`. */
function token(file, selector, name) {
  const block = css(file).split('}').find((b) => b.split('{')[0].trim() === selector) ?? ''
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1].trim()
}

/** Bundled faces: [family, style, [minWeight, maxWeight]]. */
const faces = () =>
  [...css('fonts.css').matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const get = (p) => new RegExp(`${p}:\\s*([^;]+);`).exec(body)?.[1].trim()
    const [lo, hi = lo] = get('font-weight').split(/\s+/).map(Number)
    return [get('font-family').replace(/['"]/g, ''), get('font-style'), [lo, hi]]
  })

/**
 * The chip label face a themed `font-family` value gives under `preset`, at `weightOverride` when given
 * (else the chip's weight token).
 * @returns {{ token?: string, family?: string, weight: number, upright: boolean }}
 */
export function chipFace(preset, fontFamily, weightOverride) {
  const scope = `[data-theme="${preset}"]`
  const name = /var\((--[\w-]+)\)/.exec(fontFamily ?? '')?.[1]
  const family = name && token('typography.css', scope, name)?.split(',')[0].replace(/['"]/g, '').trim()
  const weight = weightOverride ?? Number(
    token('typography.css', scope, '--bc-weight-label') ?? token('typography.css', ':root', '--bc-weight-label'),
  )
  const upright = faces().some(([f, style, [lo, hi]]) => f === family && style === 'normal' && lo <= weight && weight <= hi)
  return { token: name, family, weight, upright }
}
