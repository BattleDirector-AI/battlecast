/* Structural guard: there is exactly one SSE client, at `src/lib/sseClient.js`, and every page
 * that opens a feed goes through it (#158).
 *
 * Rules: `.ai/spec/how/renderer.md`, "One SSE client, in `lib/`, not per route".
 * Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
 *
 * Separate from `sseClient.test.js` (the client's behavior contract) because it imports no module
 * under test, so it runs — and reports what is actually in the tree — whether or not the shared
 * client exists yet.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import {
  importedSpecifiers,
  inlineEventSourceOffenders,
  sourceFiles,
} from './testing/sourceScan.js'

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

/* The tree walk and the specifier read both come from `testing/sourceScan.js`, which is the other
 * half of this guard: one source reader, so comment stripping and a filesystem-independent walk
 * order cannot land in only one of the two checks. */

/** The module specifiers a file imports from — comments stripped, strings not. */
const importsOf = (abs) => importedSpecifiers(readFileSync(abs, 'utf8'))

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
    // Where this walk is aimed is as load-bearing here as it is for the constructor scan below,
    // and it was as unpinned: `sourceFiles(ROUTES)`, or narrowing to `join(SRC, 'lib')`, left this
    // suite green while closing the check to one subtree — and the `lib/` -> `routes/` hop named
    // above is precisely what a one-subtree walk stops seeing. So the root is taken from the
    // scan's own result rather than named here, and what the walk reached is asserted.
    const { root } = inlineEventSourceOffenders(SRC)
    const walked = [...sourceFiles(root)]
    expect({
      scanning: relative(process.cwd(), root).split(sep).join('/'),
      reachedLib: walked.some(([, path]) => path.startsWith('lib/')),
      reachedRoutes: walked.some(([, path]) => path.startsWith('routes/')),
    }).toEqual({ scanning: 'src', reachedLib: true, reachedRoutes: true })

    const offenders = []
    for (const [abs, path] of walked) {
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

  it('aims the constructor scan at all of src/, and finds no module opening one of its own', () => {
    // The other half of the rename escape hatch: inlining an `EventSource` construction into a
    // page needs no import at all, so every import-shaped assertion above would still pass. The
    // scan lives in `testing/sourceScan.js`; `sourceScan.test.js` pins its exclusions and drives
    // it over trees where a wide root and a narrow one give different answers.
    //
    // The root is asserted on, because the argument is the whole of #164: aiming this at `ROUTES`
    // — already in scope above — restores precisely the blind spot the issue was filed for, and
    // worse, because the scanner's exclusions are `lib/`-rooted and go inert under a `routes/` root.
    //
    // The root asserted on is the one the *scan* reports walking, not one this file names beside
    // the call. Naming it twice only caught rebinding the variable: passing `ROUTES` to the scan
    // while the variable stayed `SRC` was a one-token edit that reverted #164 with all five of
    // these tests green.
    const scanned = inlineEventSourceOffenders(SRC)
    expect(
      scanned,
      'inlineEventSourceOffenders returns a bare array instead of { root, offenders }, so this ' +
        'assertion has no way to name the tree the scan actually walked',
    ).toMatchObject({ root: expect.any(String), offenders: expect.any(Array) })
    expect({
      scanning: relative(process.cwd(), scanned.root).split(sep).join('/'),
      offenders: scanned.offenders,
    }).toEqual({ scanning: 'src', offenders: [] })
  })
})
