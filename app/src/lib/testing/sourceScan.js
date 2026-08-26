/* The constructor half of the "one SSE client" guard, as a function (#164).
 *
 * Rules: `.ai/spec/how/renderer.md`, "One SSE client, in `lib/`, not per route".
 *
 * Inlining `new EventSource(...)` into a module needs no import at all, so every import-shaped
 * assertion in `sseClient.consolidation.test.js` stays green while a second client grows. That
 * makes this the guard's strongest check — and the reason it is a function rather than a loop
 * inside the suite: the real tree is clean whether the scan walks `src/routes/` or all of `src/`,
 * so only a synthetic tree can tell a widened scan from the narrow one it replaced.
 *
 * Lives under `lib/testing/` beside `fakeEventSource.js` — test scaffolding, never shipped. Not a
 * `*.test.js`, so vitest does not collect it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Walk a tree, yielding `[absolutePath, pathRelativeToRoot]` for every `.js`/`.svelte` file. */
function* sourceFiles(root, rel = '') {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
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

/* Exactly three exclusions, all of them modules that are *supposed* to name the transport:
 * the shared client, which is the one legitimate construction; any suite, which stubs the global
 * (that is the point); and the shared doubles, which stand in for the transport and describe it
 * in prose. `lib/sseClient.js` is matched as a whole path, not a suffix — a resurrected
 * `routes/tower/sseClient.js` is an offender, not a second shared client. */
const isExcluded = (path) =>
  path === 'lib/sseClient.js' || path.endsWith('.test.js') || path.startsWith('lib/testing/')

/* Bare, or qualified with one of exactly three names — `new window.EventSource(url)` is what gets
 * written when someone is being explicit about where the constructor comes from. This is a list,
 * not a rule: `top`, `frames`, `document.defaultView` and every other handle on the same object
 * are not in it. */
const CONSTRUCTS = /new\s+(?:(?:window|globalThis|self)\.)?EventSource\s*\(/

/**
 * Every module under `srcRoot` that builds an `EventSource` of its own, as sorted root-relative
 * paths. The match is raw text over the whole file, which cuts both ways: a literal
 * `new EventSource(...)` written in prose outside the exclusions is reported (loud, and it names
 * the file, so it is a documented caveat rather than a reason to parse), and anything the pattern
 * above does not spell out is not reported at all — an alias (`const E = EventSource`),
 * `Reflect.construct`, or a qualifier outside those three. Seeing the name beside `new` does not
 * mean this caught it. #168 tracks the same question for the import check.
 */
export function inlineEventSourceOffenders(srcRoot) {
  const offenders = []
  for (const [abs, path] of sourceFiles(srcRoot)) {
    if (isExcluded(path)) continue
    if (CONSTRUCTS.test(readFileSync(abs, 'utf8'))) offenders.push(path)
  }
  // Walk order is `readdirSync` order, which is neither sorted nor the same on every filesystem.
  return offenders.sort()
}
