/* Every typeface a theme preset uses is bundled (overlay-config.md rule 61, ADRs 0026 and 0028).
 *
 * OBS may have no internet connection, so a face fetched from a font CDN would silently fall back
 * to Arial Narrow on air. This holds the delivery, not prose: each required face has an
 * `@font-face` in tokens/fonts.css whose source is a same-origin `/fonts/…` file that exists in
 * `app/public` (copied verbatim into the built app) in the format its family ships as, with the
 * family's SIL OFL licence file beside it; the modern faces cover the scripts rule 61 lists; each
 * preset's font tokens name a bundled family first; and no app source references a remote font
 * service. The CSS is read from disk (a `?raw` CSS import is empty under vitest).
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DESIGN = dirname(fileURLToPath(import.meta.url))
const APP = join(DESIGN, '..', '..')
const PUBLIC = join(APP, 'public')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (f) => stripComments(readFileSync(join(DESIGN, 'tokens', f), 'utf8'))
const fontsCss = read('fonts.css')

const MODERN = ['Saira Condensed', 'Saira', 'JetBrains Mono']

/** The (family, style, weight) faces ADRs 0026 and 0028 bundle. */
const MODERN_REQUIRED = MODERN.flatMap((family) => [400, 500, 600, 700].map((w) => [family, 'normal', w]))
const VINTAGE_REQUIRED = [
  ...[600, 700, 800, 900].map((w) => ['Barlow Condensed', 'italic', w]),
  ...[600, 700].map((w) => ['Barlow Condensed', 'normal', w]),
  ...[800, 900].map((w) => ['Barlow', 'italic', w]),
  ...[500, 600, 700].map((w) => ['Oswald', 'normal', w]),
  ['VT323', 'normal', 400],
]
const REQUIRED = [...MODERN_REQUIRED, ...VINTAGE_REQUIRED]
const VINTAGE = [...new Set(VINTAGE_REQUIRED.map(([f]) => f))]
const FAMILIES = [...MODERN, ...VINTAGE]

/** Saira Condensed ships as its original TTFs (its licence reserves the name "Saira", ADR 0028);
 *  every other family is Google Fonts' woff2. */
const FORMAT = (family) => (family === 'Saira Condensed' ? 'truetype' : 'woff2')
const EXT = { woff2: '.woff2', truetype: '.ttf' }
const MAGIC = { woff2: Buffer.from('wOF2'), truetype: Buffer.from([0, 1, 0, 0]) }
const SAIRA_CONDENSED_FILE = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' }
const FOLDER = { 'Saira Condensed': 'saira-condensed', Saira: 'saira', 'JetBrains Mono': 'jetbrains-mono' }

/** Each family's own OFL.txt, told apart by its copyright line (Saira Condensed's reserves "Saira"). */
const LICENCE = {
  'Saira Condensed': /Copyright 2016 The Saira Project Authors.*with reserved font name "Saira"/,
  Saira: /Copyright 2020 The Saira Project Authors/,
  'JetBrains Mono': /Copyright 2020 The JetBrains Mono Project Authors/,
  'Barlow Condensed': /The Barlow Project Authors/,
  Barlow: /The Barlow Project Authors/,
  Oswald: /The Oswald Project Authors/,
  VT323: /The VT323 Project Authors/,
}

/** The modern files, pinned (ADR 0028): Google Fonts' variable woff2 for Saira and JetBrains Mono
 *  with the unicode-range Google serves each subset under, and the four original google/fonts
 *  Saira Condensed TTFs, which take no unicode-range. A hash, not a name, is what proves a file is
 *  the unmodified original; updating a font is a deliberate edit here. */
const MODERN_FILES = {
  '/fonts/saira/saira-normal-400-700-vietnamese.woff2': {
    sha256: 'd8469320abd95ec3094a2397da23e14ad04d827eb41377a2dc6616bf55cb9a40',
    range: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  },
  '/fonts/saira/saira-normal-400-700-latin-ext.woff2': {
    sha256: 'cbdb7074cd38a4bf09bf34012dd3072bf34ccc6ad95a2ebf2ebf3eac9484edf1',
    range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
  },
  '/fonts/saira/saira-normal-400-700-latin.woff2': {
    sha256: '7eb811eb14b2ee22e3fba942b25c6cd062ff050bde10d29af1a4e16f99712e17',
    range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
  '/fonts/jetbrains-mono/jetbrains-mono-normal-400-700-cyrillic-ext.woff2': {
    sha256: '62213be8a78b42f1e29d1452d91e2f8b3e745572a9dd98d3941e39fa00b37d76',
    range: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
  },
  '/fonts/jetbrains-mono/jetbrains-mono-normal-400-700-cyrillic.woff2': {
    sha256: 'e17cfd15fb96909d64095015f958207063a0c07191da3512df7d560a781aebdf',
    range: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  },
  '/fonts/jetbrains-mono/jetbrains-mono-normal-400-700-greek.woff2': {
    sha256: '0a557721b1f8b36d3f3f84442689a71ca4a744300abcb46a1953f51bfc663b66',
    range: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF',
  },
  '/fonts/jetbrains-mono/jetbrains-mono-normal-400-700-vietnamese.woff2': {
    sha256: 'c89b9cc0bc6262bd4f8d8494b6961601f3aefa829d08c2e3635f4d501d3a47c2',
    range: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  },
  '/fonts/jetbrains-mono/jetbrains-mono-normal-400-700-latin-ext.woff2': {
    sha256: 'db5ff4db83e580426280e9337a58dc57d3a83784a1b03ad80914651594441d52',
    range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
  },
  '/fonts/jetbrains-mono/jetbrains-mono-normal-400-700-latin.woff2': {
    sha256: '83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be',
    range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
  '/fonts/saira-condensed/SairaCondensed-Regular.ttf': {
    sha256: '8f26edd9f227794818b66f936037dc35bd22674b287087d5d19a93d554d9a6f6',
    range: null,
  },
  '/fonts/saira-condensed/SairaCondensed-Medium.ttf': {
    sha256: 'a02d8fe45b8b7d952cb0dd341683b02ddc1b55dbd0ed89d9d438868be614b66f',
    range: null,
  },
  '/fonts/saira-condensed/SairaCondensed-SemiBold.ttf': {
    sha256: '30f8ed4d078211003a9715c80c51ce031bab5c9a17e8771182e4c4599205634b',
    range: null,
  },
  '/fonts/saira-condensed/SairaCondensed-Bold.ttf': {
    sha256: '560297e4bccfb8c6e643095e716b5ea2ea9d7289801ddd79ab901698ffb0dee6',
    range: null,
  },
}

const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '')

/** `U+0000-00FF, U+0131, U+4??` -> [[lo, hi], …]; null when the face sets no unicode-range. */
const parseRange = (v) =>
  v
    ? v.split(',').map((part) => {
        const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-')
        return [parseInt(lo.replace(/\?/g, '0'), 16), parseInt(hi.replace(/\?/g, 'F'), 16)]
      })
    : null

/** Every @font-face in fonts.css as { family, style, min, max, display, range, srcs: [{ url, format }] }. */
const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const decl = (p) => m[1].match(new RegExp(`(?:^|;|\\s)${p}\\s*:\\s*([^;]+)`))?.[1].trim()
  const [min, max = min] = (decl('font-weight') ?? '400').split(/\s+/).map(Number)
  const srcs = [...(decl('src') ?? '').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)(?:\s*format\(\s*['"]?([\w-]+)['"]?\s*\))?/g)].map(
    (s) => ({ url: s[1], format: s[2] }),
  )
  return {
    family: unquote(decl('font-family') ?? ''),
    style: decl('font-style') ?? 'normal',
    min,
    max,
    display: decl('font-display'),
    range: parseRange(decl('unicode-range')),
    srcs,
  }
})

const facesOf = (family) => faces.filter((f) => f.family === family)
const facesFor = (family, style, weight) => facesOf(family).filter((f) => f.style === style && f.min <= weight && weight <= f.max)
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`

/** Whether a TrueType file maps `cp` to a real glyph, read from its cmap (format 4 or 12). */
function ttfHasGlyph(buf, cp) {
  const tables = buf.readUInt16BE(4)
  let cmap = -1
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmap = buf.readUInt32BE(rec + 8)
  }
  if (cmap < 0) return false
  const subtables = buf.readUInt16BE(cmap + 2)
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + i * 8
    const platform = buf.readUInt16BE(rec)
    const encoding = buf.readUInt16BE(rec + 2)
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue
    const sub = cmap + buf.readUInt32BE(rec + 4)
    const format = buf.readUInt16BE(sub)
    if (format === 12) {
      const groups = buf.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12
        if (buf.readUInt32BE(at) <= cp && cp <= buf.readUInt32BE(at + 4)) return true
      }
    } else if (format === 4 && cp <= 0xffff) {
      const segs = buf.readUInt16BE(sub + 6) / 2
      const ends = sub + 14
      const starts = ends + segs * 2 + 2
      const deltas = starts + segs * 2
      const offsets = deltas + segs * 2
      for (let s = 0; s < segs; s++) {
        if (cp > buf.readUInt16BE(ends + s * 2)) continue
        const start = buf.readUInt16BE(starts + s * 2)
        if (cp < start) break
        const delta = buf.readInt16BE(deltas + s * 2)
        const rangeOffset = buf.readUInt16BE(offsets + s * 2)
        let glyph
        if (rangeOffset === 0) glyph = (cp + delta) & 0xffff
        else {
          const raw = buf.readUInt16BE(offsets + s * 2 + rangeOffset + (cp - start) * 2)
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
        }
        if (glyph !== 0) return true
        break
      }
    }
  }
  return false
}

describe('bundled typefaces (rule 61)', () => {
  it.each(REQUIRED)('%s %s %i has an @font-face', (family, style, weight) => {
    expect(facesFor(family, style, weight).length, `no @font-face for ${family} ${style} ${weight} in tokens/fonts.css`).toBeGreaterThan(0)
  })

  it.each(FAMILIES)('%s loads only same-origin files that exist, in its shipped format, with font-display swap', (family) => {
    const list = facesOf(family)
    const format = FORMAT(family)
    expect(list.length, `no @font-face for ${family}`).toBeGreaterThan(0)
    for (const face of list) {
      expect(face.display, `${family} font-display`).toBe('swap')
      expect(face.srcs.length, `${family} has no url() source`).toBeGreaterThan(0)
      for (const { url, format: declared } of face.srcs) {
        expect(url, `${family} source is not a same-origin /fonts/ path`).toMatch(/^\/fonts\/[\w./-]+$/)
        expect(url.endsWith(EXT[format]), `${family} ${url} is not a ${EXT[format]} file`).toBe(true)
        expect(declared, `${family} ${url} format`).toBe(format)
        const file = join(PUBLIC, url)
        expect(existsSync(file), `app/public${url} does not exist`).toBe(true)
        expect(readFileSync(file).subarray(0, 4).equals(MAGIC[format]), `app/public${url} is not a ${format} font file`).toBe(true)
      }
    }
  })

  it.each(FAMILIES)('%s ships its SIL Open Font License beside its files', (family) => {
    const dirs = new Set(facesOf(family).flatMap((f) => f.srcs.map((s) => dirname(join(PUBLIC, s.url)))))
    expect(dirs.size, `no font files for ${family}`).toBeGreaterThan(0)
    for (const dir of dirs) {
      const licence = join(dir, 'OFL.txt')
      expect(existsSync(licence), `${licence} missing`).toBe(true)
      const text = readFileSync(licence, 'utf8')
      expect(text, `${licence} is not the SIL OFL`).toMatch(/SIL OPEN FONT LICENSE/i)
      expect(text, `${licence} is not ${family}'s own licence`).toMatch(LICENCE[family])
    }
  })

  it.each(MODERN)('%s faces are exactly the pinned original files', (family) => {
    const used = new Set()
    for (const face of facesOf(family)) {
      for (const { url } of face.srcs) {
        const pinned = MODERN_FILES[url]
        expect(pinned, `${family} ${url} is not one of the pinned files`).toBeTruthy()
        used.add(url)
        const file = join(PUBLIC, url)
        expect(existsSync(file), `app/public${url} does not exist`).toBe(true)
        expect(createHash('sha256').update(readFileSync(file)).digest('hex'), `app/public${url} is not the original file`).toBe(pinned.sha256)
        expect(face.range, `${url} unicode-range`).toEqual(parseRange(pinned.range))
        if (url.endsWith('.woff2')) expect([face.min, face.max], `${url} is a variable file spanning 400–700`).toEqual([400, 700])
      }
    }
    const missing = Object.keys(MODERN_FILES).filter((u) => u.startsWith(`/fonts/${FOLDER[family]}/`) && !used.has(u))
    expect(missing, `${family} files with no @font-face`).toEqual([])
  })

  it.each([400, 500, 600, 700])('Saira Condensed %i is the original google/fonts TTF, whole', (weight) => {
    const list = facesFor('Saira Condensed', 'normal', weight)
    expect(list.length, `no @font-face for Saira Condensed ${weight}`).toBeGreaterThan(0)
    for (const face of list) {
      expect(face.range, `Saira Condensed ${weight} sets a unicode-range; the original file is not a subset`).toBeNull()
      for (const { url } of face.srcs) expect(basename(url)).toBe(`SairaCondensed-${SAIRA_CONDENSED_FILE[weight]}.ttf`)
    }
  })
})

describe('the modern faces cover the scripts rule 61 lists', () => {
  const ALL = { latin: 0x41, 'latin-ext': 0x141, vietnamese: 0x1ea0 } // A, Ł, Ạ
  const MONO_ONLY = { greek: 0x3a9, cyrillic: 0x416, 'cyrillic-ext': 0x4a2 } // Ω, Ж, Ң
  const cases = MODERN.flatMap((family) =>
    Object.entries(family === 'JetBrains Mono' ? { ...ALL, ...MONO_ONLY } : ALL).flatMap(([script, cp]) =>
      [400, 500, 600, 700].map((w) => [family, script, w, cp]),
    ),
  )

  it.each(cases)('%s renders %s at %i', (family, script, weight, cp) => {
    const covering = facesFor(family, 'normal', weight).filter((f) => !f.range || f.range.some(([lo, hi]) => lo <= cp && cp <= hi))
    expect(covering.length, `no ${family} ${weight} face covers ${hex(cp)} (${script})`).toBeGreaterThan(0)
    // A face with no unicode-range claims every character, so check the file really has the glyph.
    for (const face of covering.filter((f) => !f.range)) {
      for (const { url } of face.srcs) {
        const file = join(PUBLIC, url)
        expect(url.endsWith('.ttf'), `${family} ${url}: a whole-file face must be an original TTF`).toBe(true)
        expect(existsSync(file), `app/public${url} does not exist`).toBe(true)
        expect(ttfHasGlyph(readFileSync(file), cp), `app/public${url} has no glyph for ${hex(cp)}`).toBe(true)
      }
    }
  })
})

describe('no typeface comes from another origin', () => {
  it('no @font-face source is a remote URL', () => {
    for (const face of faces) {
      for (const { url } of face.srcs) expect(url, `${face.family} from a remote URL`).not.toMatch(/^(https?:)?\/\//)
    }
  })

  /** Every non-test source the app serves or bundles: index.html and src/**. */
  const sources = [join(APP, 'index.html')]
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(css|svelte|js|html)$/.test(e.name) && !/\.test\.js$/.test(e.name)) sources.push(p)
    }
  }
  walk(join(APP, 'src'))

  it.each(sources.map((p) => [p.slice(APP.length + 1).replace(/\\/g, '/'), p]))('%s loads no remote font or stylesheet', (_, path) => {
    const code = stripComments(readFileSync(path, 'utf8'))
    expect(code, 'references a Google Fonts host').not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(code, 'imports a stylesheet from another origin').not.toMatch(/@import\s+(url\(\s*)?['"]?(https?:)?\/\//)
    expect(code, 'links a stylesheet from another origin').not.toMatch(/<link\b[^>]*\bhref\s*=\s*['"]?(https?:)?\/\//i)
    // Also catches `new FontFace(name, 'url(https://…)')`, whose source is a CSS url() string.
    expect(code, 'a CSS url() points at another origin').not.toMatch(/url\(\s*['"]?(https?:)?\/\//)
  })
})

describe('each preset names a bundled family first', () => {
  const css = ['typography.css', 'colors.css', 'effects.css'].map(read).join('\n')
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const block = (preset) =>
    blocks
      .filter((m) => m[1].split(',').some((s) => s.trim().replace(/['"]/g, '') === `[data-theme=${preset}]`))
      .map((m) => m[2])
      .join(';')
  const root = blocks.filter((m) => m[1].trim() === ':root').map((m) => m[2]).join(';')
  const TOKENS = ['--bc-font-display', '--bc-font-ui', '--bc-font-mono']
  const tokenValue = (body, token) => body.match(new RegExp(`${token}\\s*:\\s*([^;]+)`))?.[1]

  it.each(['vintage70', 'vintage80'])('%s font tokens', (preset) => {
    const body = block(preset)
    for (const token of TOKENS) {
      const value = tokenValue(body, token)
      expect(value, `${preset} does not override ${token}`).toBeTruthy()
      const first = unquote(value.split(',')[0])
      expect(VINTAGE, `${preset} ${token} starts with ${first}`).toContain(first)
    }
  })

  it('modern font tokens', () => {
    for (const token of TOKENS) {
      const value = tokenValue(root, token)
      expect(value, `modern does not set ${token}`).toBeTruthy()
      const first = unquote(value.split(',')[0])
      expect(MODERN, `modern ${token} starts with ${first}`).toContain(first)
    }
  })

  it('modern names none of the vintage families, so a modern overlay never downloads them', () => {
    for (const token of TOKENS) {
      const value = tokenValue(root, token)
      expect(value, `guard: modern ${token}`).toBeTruthy()
      for (const family of VINTAGE) expect(value.split(',').map(unquote), `modern ${token}`).not.toContain(family)
    }
  })
})
