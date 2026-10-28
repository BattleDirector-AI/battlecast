/* Every design token a component, stylesheet or module reads without a fallback is defined
 * somewhere. A `var(--bc-…)` that names no token is an invalid declaration, so the browser drops
 * it with no error: the /grid and /results class groups lost their gap that way (#409). */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Read from disk: Vitest hands a `?raw` stylesheet import back empty.
const SRC = join(import.meta.dirname, '..')
const SOURCES = Object.fromEntries(
  readdirSync(SRC, { recursive: true })
    .filter((rel) => /\.(svelte|css|js)$/.test(rel) && !/\.test\.js$/.test(rel))
    .map((rel) => [rel, readFileSync(join(SRC, rel), 'utf8')]),
)

// A name that appears only inside a comment neither defines nor reads a token.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')

describe('design token references', () => {
  const defined = new Set()
  for (const text of Object.values(SOURCES)) for (const m of code(text).matchAll(/(--bc-[\w-]+)\s*:/g)) defined.add(m[1])

  it('finds the sources and their tokens', () => {
    expect(Object.keys(SOURCES).some((f) => f.endsWith('.js')), 'modules are scanned').toBe(true)
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
    expect(defined.has('--bc-space-4')).toBe(true)
  })

  it('every var(--bc-…) with no fallback names a defined token', () => {
    const missing = []
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const m of code(text).matchAll(/var\(\s*(--bc-[\w-]+)\s*\)/g)) if (!defined.has(m[1])) missing.push(`${file}: ${m[1]}`)
    }
    expect(missing).toEqual([])
  })
})
