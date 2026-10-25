/* Every typeface a theme preset uses is bundled (overlay-config.md rule 61, ADR 0026).
 *
 * OBS may have no internet connection, so a vintage face fetched from a font CDN would silently
 * fall back to Arial Narrow on air. This holds the delivery, not prose: each required face has an
 * `@font-face` in tokens/fonts.css whose source is a same-origin `/fonts/…` woff2 that exists in
 * `app/public` (copied verbatim into the built app), with the family's SIL OFL licence file beside
 * it, and each vintage preset's font tokens name a bundled family first. The CSS is read from disk
 * (a `?raw` CSS import is empty under vitest).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DESIGN = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(DESIGN, '..', '..', 'public')
const read = (f) => readFileSync(join(DESIGN, 'tokens', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const fontsCss = read('fonts.css')

/** The (family, style, weight) faces ADR 0026 bundles. */
const REQUIRED = [
  ...[600, 700, 800, 900].map((w) => ['Barlow Condensed', 'italic', w]),
  ...[600, 700].map((w) => ['Barlow Condensed', 'normal', w]),
  ...[800, 900].map((w) => ['Barlow', 'italic', w]),
  ...[500, 600, 700].map((w) => ['Oswald', 'normal', w]),
  ['VT323', 'normal', 400],
]
const FAMILIES = [...new Set(REQUIRED.map(([f]) => f))]

const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '')

/** Every @font-face in fonts.css as { family, style, min, max, display, srcs: [{ url, format }] }. */
const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const decl = (p) => m[1].match(new RegExp(`(?:^|;|\\s)${p}\\s*:\\s*([^;]+)`))?.[1].trim()
  const [min, max = min] = (decl('font-weight') ?? '400').split(/\s+/).map(Number)
  const srcs = [...(decl('src') ?? '').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)(?:\s*format\(\s*['"]?([\w-]+)['"]?\s*\))?/g)].map(
    (s) => ({ url: s[1], format: s[2] }),
  )
  return { family: unquote(decl('font-family') ?? ''), style: decl('font-style') ?? 'normal', min, max, display: decl('font-display'), srcs }
})

const facesOf = (family) => faces.filter((f) => f.family === family)

describe('bundled vintage typefaces (rule 61)', () => {
  it.each(REQUIRED)('%s %s %i has an @font-face', (family, style, weight) => {
    const hit = facesOf(family).find((f) => f.style === style && f.min <= weight && weight <= f.max)
    expect(hit, `no @font-face for ${family} ${style} ${weight} in tokens/fonts.css`).toBeTruthy()
  })

  it.each(FAMILIES)('%s loads only same-origin woff2 files that exist, with font-display swap', (family) => {
    const list = facesOf(family)
    expect(list.length, `no @font-face for ${family}`).toBeGreaterThan(0)
    for (const face of list) {
      expect(face.display, `${family} font-display`).toBe('swap')
      expect(face.srcs.length, `${family} has no url() source`).toBeGreaterThan(0)
      for (const { url, format } of face.srcs) {
        expect(url, `${family} source is not a same-origin /fonts/ path`).toMatch(/^\/fonts\/[\w./-]+\.woff2$/)
        expect(format, `${family} ${url} format`).toBe('woff2')
        expect(existsSync(join(PUBLIC, url)), `app/public${url} does not exist`).toBe(true)
      }
    }
  })

  it.each(FAMILIES)('%s ships its SIL Open Font License beside its files', (family) => {
    const dirs = new Set(facesOf(family).flatMap((f) => f.srcs.map((s) => dirname(join(PUBLIC, s.url)))))
    expect(dirs.size, `no font files for ${family}`).toBeGreaterThan(0)
    for (const dir of dirs) {
      const licence = join(dir, 'OFL.txt')
      expect(existsSync(licence), `${licence} missing`).toBe(true)
      expect(readFileSync(licence, 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i)
    }
  })

  it('fetches none of the vintage families from a remote font service', () => {
    for (const m of fontsCss.matchAll(/@import\s+url\(\s*['"]?([^'")]+)/g)) {
      for (const family of FAMILIES) {
        const asParam = `family=${family.replace(/ /g, '+')}`
        expect(m[1].includes(`${asParam}:`) || m[1].includes(`${asParam}&`) || m[1].endsWith(asParam), `${family} imported from ${m[1]}`).toBe(false)
      }
    }
    for (const face of faces) {
      for (const { url } of face.srcs) expect(url, `${face.family} from a remote URL`).not.toMatch(/^(https?:)?\/\//)
    }
  })
})

describe('each vintage preset names a bundled family first', () => {
  const css = ['typography.css', 'colors.css', 'effects.css'].map(read).join('\n')
  const block = (preset) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1].split(',').some((s) => s.trim().replace(/['"]/g, '') === `[data-theme=${preset}]`))
      .map((m) => m[2])
      .join(';')

  it.each(['vintage70', 'vintage80'])('%s font tokens', (preset) => {
    const body = block(preset)
    for (const token of ['--bc-font-display', '--bc-font-ui', '--bc-font-mono']) {
      const value = body.match(new RegExp(`${token}\\s*:\\s*([^;]+)`))?.[1]
      expect(value, `${preset} does not override ${token}`).toBeTruthy()
      const first = unquote(value.split(',')[0])
      expect(FAMILIES, `${preset} ${token} starts with ${first}`).toContain(first)
    }
  })

  it('modern names none of the vintage families, so a modern overlay never downloads them', () => {
    const root = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === ':root').map((m) => m[2]).join(';')
    for (const token of ['--bc-font-display', '--bc-font-ui', '--bc-font-mono']) {
      const value = root.match(new RegExp(`${token}\\s*:\\s*([^;]+)`))?.[1]
      expect(value, `guard: modern ${token}`).toBeTruthy()
      for (const family of FAMILIES) expect(value.split(',').map(unquote), `modern ${token}`).not.toContain(family)
    }
  })
})
