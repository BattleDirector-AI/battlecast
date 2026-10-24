/* Standalone `/info` route (#62).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 79, 82; overlay-config.md rule 52;
 * ADR 0024. Drives the PAGE, because the dwell and the broadcaster's lines come from the
 * loaded profile and the page is where that is read. The SSE client is mocked so a test
 * pushes snapshots at the page, and timers are faked so the dwell is exact (as
 * UpdatesPage.test.js does).
 *
 * The page is loaded through a non-static specifier so its absence fails each test with a
 * message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import fixture from '../../../../spec/v1/fixtures/event-info.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const MODULE = './InfoPage.svelte'
async function loadPage() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/info/InfoPage.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const [L0, L1, L2] = fixture.info_lines
const header = () => document.querySelector('[data-testid="info-header"]')?.textContent.trim() ?? null
const line = () => document.querySelector('[data-testid="info-line"]')?.textContent.trim() ?? null

function push(snapshot) {
  sse.emit(snapshot)
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

async function mountPage({ profile = null, failing = false } = {}) {
  const Page = await loadPage()
  window.history.replaceState({}, '', profile || failing ? '/info?profile=p' : '/info')
  const fetchMock = vi.fn(async () =>
    profile ? { ok: true, status: 200, json: async () => profile } : { ok: false, status: 404, json: async () => ({}) },
  )
  vi.stubGlobal('fetch', fetchMock)
  render(Page)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
  return fetchMock
}

beforeEach(() => {
  sse.emit = null
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('/info standalone route (rule 82)', () => {
  it('connects to the producer and shows the header and rotating lines on the 8 s default', async () => {
    await mountPage()
    expect(sse.emit, 'the page must connect to the producer feed').toBeTypeOf('function')
    expect(document.querySelector('[data-testid="info-panel"]'), 'nothing before the first snapshot').toBeNull()

    push(fixture)
    expect(header()).toBe('ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS')
    expect(line()).toBe(L0)
    advance(7999)
    expect(line()).toBe(L0)
    advance(1)
    expect(line()).toBe(L1)
  })

  it("reads the profile's info dwellSeconds and lines, rotating them after the producer's", async () => {
    await mountPage({ profile: { widgets: { info: { dwellSeconds: 3, lines: ['Follow us @battlecast'] } } } })
    expect(line(), 'the profile line shows before any snapshot').toBe('Follow us @battlecast')
    expect(header()).toBeNull()

    // The producer's lines go in front of it; the profile line is still listed, so it stays
    // up (rule 80), and its 3 s dwell starts now that the list has more than one line (rule 79).
    push(fixture)
    expect(header()).toBe('ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS')
    expect(line()).toBe('Follow us @battlecast')
    advance(2999)
    expect(line()).toBe('Follow us @battlecast')
    advance(1)
    expect(line(), 'wraps to the first producer line').toBe(L0)
    advance(3000)
    expect(line()).toBe(L1)
    advance(3000)
    expect(line()).toBe(L2)
    advance(3000)
    expect(line(), 'the profile line follows the producer lines').toBe('Follow us @battlecast')
  })

  it('uses the 8 s default and no broadcaster lines when ?profile= names a profile that fails to load', async () => {
    const fetchMock = await mountPage({ failing: true })
    expect(fetchMock, 'the page must try to load the named profile').toHaveBeenCalled()
    push({ ...structuredClone(fixture), info_lines: ['Only line', 'Second line'] })
    advance(7999)
    expect(line()).toBe('Only line')
    advance(1)
    expect(line()).toBe('Second line')
    advance(8000)
    expect(line(), 'no profile lines join the rotation').toBe('Only line')
  })

  it('reloads the profile live: a lines edit saved in /config reaches a running /info without a refresh', async () => {
    const profile = { widgets: { info: { lines: ['Follow us @battlecast'] } } }
    const fetchMock = await mountPage({ profile })
    push(fixture)
    expect(line(), 'the profile line, still listed, stays up').toBe('Follow us @battlecast')
    const loadsBefore = fetchMock.mock.calls.length

    // The broadcaster replaces their line in /config and saves; the page polls its profile on
    // the same 5 s interval /all uses (overlay-config rule 22).
    profile.widgets.info.lines = ['Sponsored by Example']
    await vi.advanceTimersByTimeAsync(5000)
    for (let i = 0; i < 5; i++) await tick()
    flushSync()
    expect(fetchMock.mock.calls.length, 'the page must re-read its profile').toBeGreaterThan(loadsBefore)
    expect(line(), 'the removed line is replaced at once by the line at its place (rule 80)').toBe(
      'Sponsored by Example',
    )
  })

  it('uses the 8 s default when the profile holds an out-of-range dwell', async () => {
    await mountPage({ profile: { widgets: { info: { dwellSeconds: 90 } } } })
    push(fixture)
    advance(7999)
    expect(line()).toBe(L0)
    advance(1)
    expect(line()).toBe(L1)
  })
})
