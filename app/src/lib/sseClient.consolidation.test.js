/* Structural guard: there is exactly one SSE client, at `src/lib/sseClient.js`, and every page
 * that opens a feed goes through it (#158).
 *
 * Rules: `.ai/spec/how/renderer.md`, "One SSE client, in `lib/`, not per route".
 * Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
 *
 * Separate from `sseClient.test.js` (the client's behavior contract) because it imports nothing
 * under test, so it runs — and reports what is actually in the tree — whether or not the shared
 * client exists yet.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

// Vite rewrites `import.meta.url` to an http:// URL under Vitest, so anchor on the project root
// instead — `process.cwd()` is `app/` (where vite.config.js and the `test` block live).
const SRC = join(process.cwd(), 'src')
const ROUTES = join(SRC, 'routes')
const SHARED = join(SRC, 'lib', 'sseClient.js')

/** Every page that opens a producer feed, relative to `src/routes/`. */
const FEED_PAGES = [
  'all/AllPage.svelte',
  'battle/BattlePage.svelte',
  'driver/DriverPage.svelte',
  'grid/GridPage.svelte',
  'onboard/OnBoardHudPage.svelte',
  'qualifying/QualifyingPage.svelte',
  'racecontrol/RaceControlPage.svelte',
  'results/ResultsPage.svelte',
  'tower/TowerPage.svelte',
]

const routeDirs = readdirSync(ROUTES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

/** Walk a tree, yielding `[absolutePath, pathRelativeToRoot]` for every `.js`/`.svelte` file. */
function* sourceFiles(root, rel = '') {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, entry.name)
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      yield* sourceFiles(abs, path)
      continue
    }
    if (/\.(js|svelte)$/.test(entry.name)) yield [abs, path]
  }
}

/** The module specifiers a file imports from. */
const importsOf = (abs) =>
  [...readFileSync(abs, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

describe('the SSE client lives in exactly one place', () => {
  it('provides the shared client at src/lib/sseClient.js', () => {
    expect(existsSync(SHARED)).toBe(true)
  })

  it('leaves no per-route sseClient module behind', () => {
    // `sseClient*.js`, not `sseClient.js` — the tower's suite (`sseClient.test.js`) is superseded
    // by `lib/sseClient.test.js` and a leftover would only fail later at import.
    const leftovers = routeDirs.flatMap((r) =>
      readdirSync(join(ROUTES, r))
        .filter((f) => /^sseClient.*\.js$/.test(f))
        .map((f) => `src/routes/${r}/${f}`),
    )
    expect(leftovers).toEqual([])
  })

  it('has no module anywhere importing an SSE client other than the shared one', () => {
    // Covers both directions. The routes -> routes hop is the obvious one; `overlayConfig.js`
    // importing DEFAULT_SRC from `routes/tower/sseClient.js` is the lib/ -> routes/ one, which
    // also means deleting the tower copy is not a leaf operation.
    const offenders = []
    for (const [abs, path] of sourceFiles(SRC)) {
      for (const spec of importsOf(abs)) {
        if (!/sseClient\.js$/.test(spec)) continue
        // Resolve the specifier — `./sseClient.js` from lib/ IS the shared client.
        if (resolve(dirname(abs), spec) !== SHARED) offenders.push(`src/${path} imports ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('wires every page that opens a feed to the shared client', () => {
    // The absence checks above are satisfied by a rename: move the copies to `sse.js` and nothing
    // called `sseClient.js` is left in a route folder. This asserts the presence side — where each
    // page actually gets `connect` from — so a rename shows up as the page pointing somewhere else.
    const wiring = FEED_PAGES.map((page) => {
      const abs = join(ROUTES, page)
      if (!existsSync(abs)) return `${page} → missing page`
      const shared = importsOf(abs).some((spec) => resolve(dirname(abs), spec) === SHARED)
      return `${page} → ${shared ? 'src/lib/sseClient.js' : 'no import of the shared client'}`
    })
    expect(wiring).toEqual(FEED_PAGES.map((page) => `${page} → src/lib/sseClient.js`))
  })

  it('has no route opening an EventSource of its own', () => {
    // The other half of the rename escape hatch: inlining `new EventSource(...)` into a page needs
    // no import at all, so every import-shaped assertion above would still pass.
    const offenders = []
    for (const [abs, path] of sourceFiles(ROUTES)) {
      if (/\.test\.js$/.test(path)) continue // suites stub the global; that is the point
      if (/new\s+EventSource\s*\(/.test(readFileSync(abs, 'utf8'))) {
        offenders.push(`src/routes/${path}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
