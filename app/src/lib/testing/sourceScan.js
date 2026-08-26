/* The source reading both halves of the "one SSE client" guard share (#164, #168).
 *
 * Rules: `.ai/spec/how/renderer.md`, "One SSE client, in `lib/`, not per route".
 *
 * Inlining a construction of the transport into a module needs no import at all, so every
 * import-shaped assertion in `sseClient.consolidation.test.js` stays green while a second client
 * grows. That makes the constructor scan the guard's strongest check — and the reason it is a
 * function rather than a loop inside the suite: the real tree is clean whether the scan walks
 * `src/routes/` or all of `src/`, so only a synthetic tree can tell a widened scan from the narrow
 * one it replaced.
 *
 * Both halves read source through `stripComments` first, which is what lets the constructor scan
 * exclude nothing but the shared client and the suites: a module that only *describes* the
 * transport in prose is no longer an offender, so `lib/testing/**` — a hole by construction, since
 * nothing stopped a double from being imported by a route and shipping exempt — needs no exemption.
 * Strings and regex literals are deliberately left alone, which is why `*.test.js` stays excluded:
 * a suite holds fixture source in string constants.
 *
 * Lives under `lib/testing/` beside `fakeEventSource.js` — test scaffolding, never shipped. Not a
 * `*.test.js`, so vitest does not collect it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Walk a tree, yielding `[absolutePath, pathRelativeToRoot]` for every `.js`/`.svelte` file.
 *
 * Directory entries are sorted as the walk goes, so the order is the same on every filesystem —
 * `readdirSync` order is filesystem-defined (NTFS and APFS index case-insensitively, ext4 with
 * `dir_index` returns hash order), which would leave the sorted output of the scan pinned only
 * where walk order happens to disagree with it.
 */
export function* sourceFiles(root, rel = '') {
  const entries = readdirSync(root, { withFileTypes: true })
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const entry of entries) {
    const abs = join(root, entry.name)
    // Built with `/` rather than `join` so the returned paths read the same on every platform.
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      yield* sourceFiles(abs, path)
      continue
    }
    if (/\.(js|svelte)$/.test(entry.name)) yield [abs, path]
  }
}

/* Scan forward from the opening delimiter at `start`, honouring backslash escapes, and return the
 * index just past `close` — or `-1` if it never closes (before a newline, when `sameLine`). A run
 * that never closes is not a string or a regex at all: the delimiter is emitted on its own and
 * scanning carries on. Without that, one stray apostrophe in markup — `don't`, or `</p>` reached
 * with a punctuator behind it — pairs with the next quote in the file and inverts the parity of
 * every string after it, which cuts both ways: a comment inside the runaway span survives
 * stripping (prose about the transport becomes an offender), and a URL literal that is no longer
 * a string has its `//` read as a comment, taking the construction beside it (a real one is
 * missed). Both are pinned. */
function scanDelimited(source, start, close, sameLine, charClass = false) {
  let inClass = false
  for (let i = start + 1; i < source.length; i += 1) {
    const c = source[i]
    if (c === '\\') {
      i += 1
      continue
    }
    if (sameLine && c === '\n') return -1
    if (charClass) {
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === close && !inClass) return i + 1
      continue
    }
    if (c === close) return i + 1
  }
  return -1
}

/* A `/` opens a regex literal only where a value may begin, and failing to recognise one is not
 * safe: the regex is then read as code, and the canonical URL matcher ends in `\/\/`, whose second
 * pair reads as a line comment and takes the rest of the line — the construction beside it
 * included. So the question is asked of both kinds of token that can precede a value, punctuators
 * and keywords, and erring towards "regex" is the harmless direction: a recognised regex is kept
 * verbatim and can spawn no comment at all.
 *
 * A `/` after anything else — an identifier, a literal, a closing bracket — is division, and the
 * slash is kept. Both lists are explicit; a keyword outside the second one leaves the same gap
 * that `return` did. */
const REGEX_MAY_FOLLOW = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>',
])

/* The other half of the same question. `return /^https?:\/\//.test(u) ? new EventSource(u) : null`
 * is real code the punctuator list alone cannot see: `n` is an identifier character, so the regex
 * reads as code and its `\/\/` strips the construction after it. */
const REGEX_MAY_FOLLOW_WORD = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
])

const WORD = /[A-Za-z0-9_$]/

/** The identifier immediately before the end of `out`, ignoring trailing whitespace. */
function trailingWord(out) {
  let end = out.length
  while (end > 0 && /\s/.test(out[end - 1])) end -= 1
  let start = end
  while (start > 0 && WORD.test(out[start - 1])) start -= 1
  return out.slice(start, end)
}

/** Whether a `/` reached with `prev` behind it opens a regex literal rather than dividing. */
function opensRegex(out, prev) {
  if (prev === '') return true
  if (REGEX_MAY_FOLLOW.has(prev)) return true
  if (!WORD.test(prev)) return false
  return REGEX_MAY_FOLLOW_WORD.has(trailingWord(out))
}

/**
 * `source` with its JavaScript comments removed and everything else — strings, template literals,
 * regex literals — left exactly as written.
 *
 * Stripping is what lets both halves of the guard be discussed in the files they guard. It must not
 * take the code beside a comment: dropping to end-of-line on the first `//` seen would swallow the
 * construction a semicolon after a URL string, and make the guard *easier* to pass than the raw
 * text match it replaces. `.svelte` **markup** comments (`<!-- -->`) are not JavaScript comment
 * syntax and are not stripped — a construction written in one is still an offender.
 */
export function stripComments(source) {
  let out = ''
  let prev = '' // last non-whitespace character kept, for the regex-or-division question
  let i = 0
  const keep = (text) => {
    out += text
    const trimmed = text.trimEnd()
    if (trimmed) prev = trimmed[trimmed.length - 1]
  }
  while (i < source.length) {
    const c = source[i]
    if (c === "'" || c === '"' || c === '`') {
      // A template literal may span lines; a quoted string may not.
      const end = scanDelimited(source, i, c, c !== '`')
      if (end === -1) {
        keep(c)
        i += 1
        continue
      }
      keep(source.slice(i, end))
      i = end
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      i = nl === -1 ? source.length : nl
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      // A space, not nothing: the tokens either side of a comment must not be joined into one.
      out += ' '
      // An opener that never closes consumes the two characters and no more. Running to EOF
      // instead would blank the rest of the file, and an opener can be reached by accident —
      // `return /[/*]/.test(s)` (a regex this cannot recognise, since `return` is a word and not
      // a punctuator) or a `.svelte` markup comment mentioning a glob. Both are valid files, and
      // both would hide every construction and every import below them.
      i = end === -1 ? i + 2 : end + 2
      continue
    }
    if (c === '/' && opensRegex(out, prev)) {
      const end = scanDelimited(source, i, '/', true, true)
      if (end !== -1) {
        keep(source.slice(i, end))
        i = end
        continue
      }
    }
    keep(c)
    i += 1
  }
  return out
}

/* Two exclusions, both of them modules that are *supposed* to name the transport in code: the
 * shared client, which is the one legitimate construction, and any suite, which stubs the global
 * (that is the point) and may hold fixture source in a string constant — strings are scanned, not
 * stripped. `lib/sseClient.js` is matched as a whole path, not a suffix — a resurrected
 * `routes/tower/sseClient.js` is an offender, not a second shared client. */
const isExcluded = (path) => path === 'lib/sseClient.js' || path.endsWith('.test.js')

/* Bare, or qualified with one of exactly three names — `new window.EventSource(url)` is what gets
 * written when someone is being explicit about where the constructor comes from. This is a list,
 * not a rule: `top`, `frames`, `document.defaultView` and every other handle on the same object
 * are not in it. */
const CONSTRUCTS = /new\s+(?:(?:window|globalThis|self)\.)?EventSource\s*\(/

/**
 * The root that was walked, and every module beneath it that builds an `EventSource` of its own as
 * sorted root-relative paths: `{ root, offenders }`.
 *
 * The root is part of the result because where the scan is aimed is the whole of the guard — a
 * caller that names a root of its own and asserts on that name passes just as happily when the scan
 * was handed a different one.
 *
 * Comments are stripped before matching, so prose about the transport is not an offender. What the
 * match still cannot see is worth knowing exactly, because it is text either way and the pattern is
 * an exhaustive list rather than a general rule: an alias (`const E = EventSource`),
 * `Reflect.construct`, or a qualifier outside those three all escape, as does a `.ts` or `.mjs`
 * module, which is never read. Seeing the name beside `new` does not mean this caught it.
 */
export function inlineEventSourceOffenders(srcRoot) {
  const offenders = []
  for (const [abs, path] of sourceFiles(srcRoot)) {
    if (isExcluded(path)) continue
    if (CONSTRUCTS.test(stripComments(readFileSync(abs, 'utf8')))) offenders.push(path)
  }
  // Sorted per directory is not the same as sorted paths: `feed/probe.js` is walked before
  // `feed.js`, while `.` sorts before `/`.
  return { root: srcRoot, offenders: offenders.sort() }
}

/**
 * Every module specifier `source` imports from, in the order written.
 *
 * Read through the same stripper, so a specifier named in a comment is not an import. Strings are
 * *not* stripped and this half excludes nothing at all, `*.test.js` included — its target is itself
 * a string literal, and telling a fixture's specifier from a real one needs a parse. That costs a
 * suite the assembly of any specifier it must name; excluding suites instead would exempt exactly
 * the files most likely to resurrect a client.
 */
export function importedSpecifiers(source) {
  return [...stripComments(source).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
}
