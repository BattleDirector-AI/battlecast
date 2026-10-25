/* A shadow token that a style lists alongside another shadow must never be the bare keyword
 * `none` in any theme block (#362 review). `box-shadow: var(--bc-shadow-plate), 0 0 26px …`
 * with `none` is invalid at computed-value time, so the whole declaration drops — under
 * vintage70 that silently removed the battle box's intensity glow, a colour rule 60 keeps in
 * every preset. happy-dom resolves no custom properties, so this reads the CSS from disk.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOKENS = join(SRC, 'design', 'tokens')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** Shadow tokens some style puts in a comma list with another shadow. */
const listed = new Set()
for (const file of walk(SRC).filter((f) => ['.css', '.svelte'].includes(extname(f)))) {
  for (const m of strip(readFileSync(file, 'utf8')).matchAll(/(?:box|text)-shadow\s*:([^;}]+)/g)) {
    const parts = m[1].split(/,(?![^(]*\))/)
    if (parts.length < 2) continue
    for (const p of parts) for (const v of p.matchAll(/var\((--bc-shadow-[\w-]+)/g)) listed.add(v[1])
  }
}

describe('shadow tokens listed with another shadow are never `none` (#362 review)', () => {
  it('guard: the pulse glow lists --bc-shadow-plate', () => {
    expect([...listed]).toContain('--bc-shadow-plate')
  })

  it('no token block sets a listed shadow token to none', () => {
    const offenders = []
    for (const f of readdirSync(TOKENS).filter((f) => f.endsWith('.css'))) {
      const css = strip(readFileSync(join(TOKENS, f), 'utf8'))
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        for (const d of m[2].matchAll(/(--bc-shadow-[\w-]+)\s*:\s*([^;]+)/g)) {
          if (listed.has(d[1]) && d[2].trim() === 'none') offenders.push(`${f} ${m[1].trim()} ${d[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
