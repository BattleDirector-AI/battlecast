/* The inline-`EventSource` scan, over a controlled tree (#164).
 *
 * Rules: `.ai/spec/how/renderer.md`, "One SSE client, in `lib/`, not per route".
 * Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
 *
 * The consolidation guard's strongest check is that no module builds an `EventSource` of its own —
 * the one escape hatch that needs no import, so every import-shaped assertion stays green while a
 * second client grows. #158 scoped that check to `src/routes/`, which leaves the direction the
 * import check already had to be widened for (`lib/overlayConfig.js` reaching into
 * `routes/tower/sseClient.js`) unwatched: an inlined `new EventSource(...)` in `src/lib/`, or in a
 * future `src/components/`, is invisible to it.
 *
 * Widening the scan cannot be pinned by pointing the guard at the real tree — the real tree is
 * clean either way, so a narrow scan and a wide one both report `[]`. So the scan becomes a
 * function, `inlineEventSourceOffenders(srcRoot)`, and this file drives it over synthetic trees
 * whose offenders sit exactly where the blind spots are. The last test then applies it to the real
 * `src/`, which is the guard that actually runs in CI.
 *
 * The scan is a raw-text match, so it cannot tell code from a comment (that is why
 * `lib/testing/**` is excluded — `fakeEventSource.js` documents the refusing double with a literal
 * construction in prose). This file is a `*.test.js`, so it is excluded too, and may write one.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// Vite rewrites `import.meta.url` to an http:// URL under Vitest, so anchor on the project root
// instead — `process.cwd()` is `app/` (where vite.config.js and the `test` block live).
const SRC = join(process.cwd(), 'src')
const SCANNER = join(SRC, 'lib', 'testing', 'sourceScan.js')

const MISSING =
  'src/lib/testing/sourceScan.js does not export inlineEventSourceOffenders — the constructor scan ' +
  'is still inline in sseClient.consolidation.test.js and rooted at src/routes/, so nothing under ' +
  'src/lib/ or src/components/ is scanned at all'

/* Loaded by path rather than by a static import so that an absent module fails each test with the
 * sentence above, instead of failing the whole file to collect with a module-resolution error. */
async function loadScan() {
  if (!existsSync(SCANNER)) return null
  const mod = await import(pathToFileURL(SCANNER).href)
  return mod.inlineEventSourceOffenders ?? null
}

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

const CONNECT = "export const connect = (url) => new EventSource(url)\n"

describe('the inline-EventSource scan', () => {
  it('flags a construction anywhere under src/, not only in a route', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/sseClient.js': CONNECT,
      'lib/feedProbe.js': CONNECT,
      // Negative control: names `EventSource` without constructing one. Deliberately does not
      // spell out an import of the shared client — the guard's *import* check is raw text over the
      // whole tree, `*.test.js` included, so a fixture (or a comment) written that way reads as
      // this file importing a second client and fails the guard it exists to strengthen. Same
      // blindness as the constructor scan; the exclusions are the only thing holding it off.
      'lib/overlayConfig.js': 'export const isFeed = (x) => x instanceof EventSource\n',
      'components/Ticker.svelte': `<script>\n${CONNECT}</script>\n`,
      'routes/tower/TowerPage.svelte': `<script>\n${CONNECT}</script>\n`,
      'routes/tower/notes.md': 'Call `new EventSource(url)` here and the guard should not care.\n',
    })

    expect(scan(root)).toEqual([
      'components/Ticker.svelte',
      'lib/feedProbe.js',
      'routes/tower/TowerPage.svelte',
    ])
  })

  it('excludes the shared client, the suites that stub the global, and the shared doubles', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    const root = tree({
      'lib/sseClient.js': CONNECT,
      'lib/testing/fakeEventSource.js': '/* `new EventSource("http://")` throws a SyntaxError. */\n',
      'lib/sseClient.test.js': CONNECT,
      'routes/config/ConfigPage.feedStatus.test.js': CONNECT,
    })

    expect(scan(root)).toEqual([])
  })

  it('reports the real src/ tree as carrying no second client', async () => {
    const scan = await loadScan()
    expect(scan, MISSING).toBeTypeOf('function')

    expect(
      scan(SRC),
      'a module outside the exclusions builds its own EventSource — route pages and /config must ' +
        'all go through src/lib/sseClient.js (a literal `new EventSource(...)` written in a comment ' +
        'trips this too; the scan is raw text)',
    ).toEqual([])
  })
})
