/* The guard's source reading — the inline-`EventSource` scan and the specifier reader — over
 * controlled trees and controlled source (#164, #168).
 *
 * Rules: `.ai/spec/how/renderer.md`, "One SSE client, in `lib/`, not per route".
 * Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
 *
 * The consolidation guard's strongest check is that no module builds an `EventSource` of its own —
 * the one escape hatch that needs no import, so every import-shaped assertion stays green while a
 * second client grows. #158 scoped that check to `src/routes/`, which leaves the direction the
 * import check already had to be widened for (`lib/overlayConfig.js` reaching into
 * `routes/tower/sseClient.js`) unwatched: an inlined construction in `src/lib/`, or in a future
 * `src/components/`, is invisible to it.
 *
 * Widening the scan cannot be pinned by pointing the guard at the real tree — the real tree is
 * clean either way, so a narrow scan and a wide one both report no offenders. So the scan is a
 * function, and this file drives it over synthetic trees whose offenders sit exactly where the
 * blind spots are. The last test then applies it to the real `src/`, which is the guard that
 * actually runs in CI.
 *
 * #168 removes the reason the scan had to be told what to skip. Matching over raw text cannot tell
 * code from a comment, which is why `lib/testing/**` was excluded wholesale — the doubles and the
 * scanner's own header describe the transport in prose. Stripping comments first makes that
 * exclusion unnecessary, and every exclusion is a hole by construction: nothing stopped a future
 * `lib/testing/feedProbe.js` from being imported by a route and shipping exempt. Strings are
 * deliberately *not* stripped, which is why `*.test.js` stays excluded — a suite may hold fixture
 * source in a string constant, as this one does.
 *
 * The import check has the same blindness and excludes nothing at all, so this file must never
 * spell out an import specifier ending in the shared client's filename: written whole, in code or
 * in a comment, it reads as this file importing a second client. The fixtures below assemble it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// Vite rewrites `import.meta.url` to an http:// URL under Vitest, so anchor on the project root
// instead — `process.cwd()` is `app/` (where vite.config.js and the `test` block live).
const SRC = join(process.cwd(), 'src')
const SCANNER = join(SRC, 'lib', 'testing', 'sourceScan.js')
const CONSOLIDATION = join(SRC, 'lib', 'sseClient.consolidation.test.js')

const MISSING =
  'src/lib/testing/sourceScan.js does not export inlineEventSourceOffenders — the constructor scan ' +
  'is still inline in sseClient.consolidation.test.js and rooted at src/routes/, so nothing under ' +
  'src/lib/ or src/components/ is scanned at all'

/* Every assertion below is on the whole `{ root, offenders }` result, and every message says what
 * that assertion is holding the scan to. `SHAPELESS` is the half they all share: today the scan
 * returns a bare array, so the root it walked is reported nowhere. */
const SHAPELESS =
  'inlineEventSourceOffenders returns a bare array instead of { root, offenders }, so the root it ' +
  'walked is reported nowhere: the call site and the assertion each name a root of their own and ' +
  'only convention keeps them equal, which is why swapping SRC for ROUTES at the call site reverts ' +
  'the whole of #164 with the suite green'

/* Loaded by path rather than by a static import so that an absent module or export fails each test
 * with the sentence above, instead of failing the whole file to collect with a resolution error. */
async function loadModule() {
  if (!existsSync(SCANNER)) return {}
  return await import(pathToFileURL(SCANNER).href)
}

const loadScan = async () => (await loadModule()).inlineEventSourceOffenders ?? null

const roots = []
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true })
})

/** Write `{ 'lib/foo.js': 'source' }` into a throwaway directory and return it as the src root. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'bc-source-scan-'))
  roots.push(root)
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'))
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body, 'utf8')
  }
  return root
}

const CONNECT = 'export const connect = (url) => new EventSource(url)\n'

describe('the inline-EventSource scan', () => {
  it('flags a construction anywhere under src/, not only in a route', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/sseClient.js': CONNECT,
      'lib/feedProbe.js': CONNECT,
      // Negative control: names `EventSource` without constructing one.
      'lib/overlayConfig.js': 'export const isFeed = (x) => x instanceof EventSource\n',
      // `feed.js` beside `feed/` puts walk order and sorted order in conflict: the walker recurses
      // into `feed/` the moment it meets it, so `feed/probe.js` is *found* first, while `.` sorts
      // before `/` so `feed.js` must be *returned* first. Without the final sort this pair is the
      // wrong way round.
      'lib/feed.js': CONNECT,
      'lib/feed/probe.js': CONNECT,
      'components/Ticker.svelte': `<script>\n${CONNECT}</script>\n`,
      'routes/tower/TowerPage.svelte': `<script>\n${CONNECT}</script>\n`,
      // The exclusion is the whole path `lib/sseClient.js`, not any file so named. A per-route copy
      // is exactly what #158 deleted and what the sibling checks in `sseClient.consolidation.test.js`
      // forbid; matching it by suffix would hide an inlined constructor in the resurrected copy.
      'routes/tower/sseClient.js': CONNECT,
      'routes/tower/notes.md': 'Call `new EventSource(url)` here and the guard should not care.\n',
    })

    expect(scan(root), SHAPELESS).toEqual({
      root,
      offenders: [
        'components/Ticker.svelte',
        'lib/feed.js',
        'lib/feed/probe.js',
        'lib/feedProbe.js',
        'routes/tower/TowerPage.svelte',
        'routes/tower/sseClient.js',
      ],
    })
  })

  it('reads a construction however it is spelled, but only where the name is spelled out', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/spaced.js': 'export const c = (u) => new  EventSource (u)\n',
      'lib/windowFeed.js': 'export const c = (u) => new window.EventSource(u)\n',
      'lib/globalFeed.js': 'export const c = (u) => new globalThis.EventSource(u)\n',
      'lib/selfFeed.js': 'export const c = (u) => new self.EventSource(u)\n',
      // The other edge of a textual match, asserted as an absence so the caveat in
      // `how/renderer.md` is a fact about this code rather than a claim about it: a construction
      // that never spells `EventSource` next to `new` is not seen. Closing this needs a parse, not
      // a longer regex.
      'lib/aliased.js': 'const E = EventSource\nexport const c = (u) => new E(u)\n',
    })

    expect(scan(root), SHAPELESS).toEqual({
      root,
      offenders: ['lib/globalFeed.js', 'lib/selfFeed.js', 'lib/spaced.js', 'lib/windowFeed.js'],
    })
  })

  it('reads a construction from code and not from a comment, and does not lose the code around one', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/lineNote.js': '// Was `new EventSource(url)` before #158 moved it.\nexport const c = 1\n',
      'lib/blockNote.js': '/* Documents `new EventSource("http://")`, which throws. */\nexport const c = 1\n',
      'lib/trailingNote.js': 'export const c = 1 /* not `new EventSource(u)` any more */\n',
      // Everything below is live code sharing a line with something comment-shaped. Dropping to
      // end-of-line on the first `//` seen would swallow all three constructions and make the guard
      // *easier* to pass than the raw-text match it replaces — a URL literal is one `//` away.
      'lib/afterUrl.js': 'const u = "http://host/s"; export const c = () => new EventSource(u)\n',
      'lib/afterRegex.js': 'const p = /https:\\/\\//; export const c = (u) => new EventSource(u)\n',
      'lib/afterBlock.js': '/* opens the feed */ export const c = (u) => new EventSource(u)\n',
    })

    expect(
      scan(root),
      'the scan matches over raw text, so it cannot tell code from a comment: a construction ' +
        'written in prose is reported as an offender, which is what forced the wholesale ' +
        'lib/testing/** exclusion and what makes the guard unmentionable in the comment ' +
        'explaining it. Comments must be stripped before matching — and stripping them must not ' +
        'take the code beside them: a `//` inside a URL string or a regex literal is not a comment',
    ).toEqual({
      root,
      offenders: ['lib/afterBlock.js', 'lib/afterRegex.js', 'lib/afterUrl.js'],
    })
  })

  it('scans lib/testing/, where prose about the transport is not an offender but a live connection is', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      // The two files that forced the wholesale `lib/testing/**` exclusion: both name the
      // constructor only in prose, which comment-stripping now handles by itself.
      'lib/testing/fakeEventSource.js': '/* `new EventSource("http://")` throws a SyntaxError. */\n',
      'lib/testing/sourceScan.js': '/* Flags `new EventSource(...)` outside the shared client. */\n',
      // The hole that exclusion left open: test scaffolding is importable by a route, and a double
      // that opens a real connection ships exempt.
      'lib/testing/feedProbe.js': CONNECT,
    })

    expect(
      scan(root),
      'everything under lib/testing/ is excluded wholesale, so a double that opens a real ' +
        'connection is exempt from the guard — the exclusion exists only because raw-text ' +
        'matching cannot tell the prose in those doubles from code, and stripping comments ' +
        'retires it',
    ).toEqual({ root, offenders: ['lib/testing/feedProbe.js'] })
  })

  it('excludes the shared client and any suite, whose fixture source lives in strings it must not strip', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/sseClient.js': CONNECT,
      // A suite holds fixture source in a string constant — exactly what this file does — so
      // stripping strings as well as comments would blind the scan to a construction written in
      // code. Suites are excluded by name instead; strings stay scanned everywhere else.
      'lib/sseClient.test.js': `export const fixture = ${JSON.stringify(CONNECT)}\n`,
      'routes/config/ConfigPage.feedStatus.test.js': CONNECT,
      'lib/codegen.js': `export const template = ${JSON.stringify(CONNECT)}\n`,
    })

    expect(scan(root), SHAPELESS).toEqual({ root, offenders: ['lib/codegen.js'] })
  })

  it('reports the root it walked, so a caller cannot assert on a root the scan never saw', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/feedProbe.js': CONNECT,
      'routes/tower/TowerPage.svelte': `<script>\n${CONNECT}</script>\n`,
    })
    const routes = join(root, 'routes')

    // Aimed at `routes/`, the scan misses `lib/feedProbe.js` entirely — that is the blind spot #164
    // was filed for. The result has to say which tree produced it, or a caller can keep asserting
    // "src, and it was clean" about a walk that only ever saw `src/routes/`.
    expect(scan(routes), SHAPELESS).toEqual({
      root: routes,
      offenders: ['tower/TowerPage.svelte'],
    })
  })

  it('reports the real src/ tree as carrying no second client', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    expect(
      scan(SRC),
      'a module outside the exclusions builds its own EventSource — route pages and /config must ' +
        'all go through src/lib/sseClient.js (JavaScript comments are stripped before matching, ' +
        'but a `.svelte` markup comment is not, so a literal construction written in one trips ' +
        'this)',
    ).toEqual({ root: SRC, offenders: [] })
  })
})

describe('the source reading both halves of the guard share', () => {
  it('walks the tree once, in an order no filesystem gets a vote in', async () => {
    const { sourceFiles } = await loadModule()
    expect(
      sourceFiles,
      'src/lib/testing/sourceScan.js does not export sourceFiles — the walker is duplicated ' +
        'byte-for-byte in sseClient.consolidation.test.js, so the two halves of the guard can ' +
        'drift apart silently',
    ).toBeTypeOf('function')

    // `Zeta.js`/`alpha.js` disagree between `readdirSync` order and sorted order on the filesystems
    // we develop on (NTFS and APFS index case-insensitively, so `Zeta.js` comes back last) and on
    // ext4 with `dir_index`, which returns hash order. Only sorting inside the walker makes this
    // one answer everywhere — and `feed/probe.js` before `feed.js` is what keeps the *final* sort
    // in `inlineEventSourceOffenders` a pin rather than a coincidence.
    const root = tree({
      'lib/Zeta.js': CONNECT,
      'lib/alpha.js': CONNECT,
      'lib/feed.js': CONNECT,
      'lib/feed/probe.js': CONNECT,
      'lib/notes.md': 'not source\n',
    })

    expect(
      [...sourceFiles(root)].map(([, path]) => path),
      'the walk order depends on readdirSync, which is filesystem-defined: the sorted output of ' +
        'inlineEventSourceOffenders is then pinned only where walk order happens to disagree with ' +
        'it, and that pin can stop firing on a different filesystem without anyone noticing',
    ).toEqual(['lib/Zeta.js', 'lib/alpha.js', 'lib/feed/probe.js', 'lib/feed.js'])
  })

  it('reads import specifiers from code, not from comments, and not from a specifier it only strips to', async () => {
    const { importedSpecifiers } = await loadModule()
    expect(
      importedSpecifiers,
      'src/lib/testing/sourceScan.js does not export importedSpecifiers — the import half of the ' +
        'guard is a raw-text match inline in sseClient.consolidation.test.js, so it reads a ' +
        'specifier named in a comment as an import and cannot be driven over source of its own',
    ).toBeTypeOf('function')

    // Assembled, never spelled out: written whole, these would be read as this file importing a
    // second client by the very check under test. That is the standing cost of the import check
    // excluding nothing, and it is the right trade — excluding suites would exempt the files most
    // likely to resurrect a client.
    const SHARED = './sse' + 'Client.js'
    const TOWER = '../routes/tower/sse' + 'Client.js'

    const source =
      `import { connect } from '${SHARED}'\n` +
      `// Never write \`from '${TOWER}'\` — #158 deleted that copy.\n` +
      `/* Nor \`from '${TOWER}'\` in a block comment. */\n` +
      `export const fixture = "import { connect } from '${TOWER}'"\n` +
      'export const c = connect\n'

    // The string constant is still read. The check matches specifier text, and telling a fixture's
    // specifier from a real one needs a parse; leaving strings in keeps the check unsidesteppable
    // and costs a suite the two-token assembly above.
    expect(
      importedSpecifiers(source),
      'a specifier named in a comment is read as an import, so the guard cannot be discussed in ' +
        'the file it guards — that is the false positive #164 hit twice and worked around',
    ).toEqual([SHARED, TOWER])
  })

  it('leaves the consolidation suite with no source reader of its own', () => {
    const source = readFileSync(CONSOLIDATION, 'utf8')

    expect(
      {
        definesItsOwnWalker: /function\s*\*/.test(source),
        usesTheSharedWalker: source.includes('sourceFiles'),
        usesTheSharedSpecifierReader: source.includes('importedSpecifiers'),
      },
      'sseClient.consolidation.test.js carries its own copy of the tree walker and its own raw-text ' +
        'import match: two source readers for one guard, so a fix to either half — comment ' +
        'stripping, sorted walk order — lands in only one of them',
    ).toEqual({
      definesItsOwnWalker: false,
      usesTheSharedWalker: true,
      usesTheSharedSpecifierReader: true,
    })
  })
})
