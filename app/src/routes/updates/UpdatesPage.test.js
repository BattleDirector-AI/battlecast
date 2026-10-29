/* Standalone `/updates` route (#27).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 71, 73, 75; overlay-config.md rule 50;
 * ADR 0023. Drives the PAGE, because the dwell comes from the loaded profile and the page is
 * where that is read. The SSE client is mocked so a test pushes snapshots at the page, and
 * timers are faked so the dwell is exact (as BattlePage.grace.test.js does).
 *
 * The page is loaded through a non-static specifier so its absence fails each test with a
 * message naming it, rather than failing the whole file at import time.
 *
 * Every URL carries `motion=reduced`: the page applies the resolved motion mode to the root on
 * load (overlay-config rule 10), which would otherwise replace the suite's reduced-motion
 * default with `full` and give the box its real exit transition, so these timing cases pin the
 * instant (duration 0) path.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import fixture from '../../../../spec/v1/fixtures/race-events.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const MODULE = './UpdatesPage.svelte'
async function loadPage() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/updates/UpdatesPage.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const withNew = () => ({
  ...structuredClone(fixture),
  race_events: [
    ...structuredClone(fixture.race_events),
    { id: 'ev-106', type: 'penalty', driver_name: 'Mike Conway', penalty: '+5s', detail: 'Track limits' },
  ],
})

const card = () => document.querySelector('[data-testid="race-update"]')
const part = (testid) => card()?.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() ?? null

function push(snapshot) {
  sse.emit(snapshot)
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

async function mountPage({ profile = null } = {}) {
  const Page = await loadPage()
  window.history.replaceState({}, '', profile ? '/updates?profile=p&motion=reduced' : '/updates?motion=reduced')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile
        ? { ok: true, status: 200, json: async () => profile }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(Page)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
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

describe('/updates standalone route (rule 75)', () => {
  it('connects to the producer, baselines the first snapshot, and shows a new event for the 8 s default', async () => {
    await mountPage()
    expect(sse.emit, 'the page must connect to the producer feed').toBeTypeOf('function')

    push(fixture) // baseline: the five listed events never show
    expect(card()).toBeNull()

    push(withNew())
    expect(card().getAttribute('data-event-id')).toBe('ev-106')
    expect(part('update-label')).toBe('PENALTY')
    expect(part('update-name')).toBe('M.CON')
    expect(part('update-value')).toBe('+5s')
    expect(part('update-detail')).toBe('Track limits')

    advance(7999)
    expect(card()).not.toBeNull()
    advance(1)
    expect(card(), 'nothing else is new, so the box hides').toBeNull()
  })

  it("reads the profile's updates dwellSeconds", async () => {
    await mountPage({ profile: { widgets: { updates: { dwellSeconds: 3 } } } })
    push(fixture)
    push(withNew())
    advance(2999)
    expect(card()).not.toBeNull()
    advance(1)
    expect(card()).toBeNull()
  })

  it('uses the 8 s default when ?profile= names a profile that fails to load', async () => {
    const Page = await loadPage()
    window.history.replaceState({}, '', '/updates?profile=p&motion=reduced')
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    render(Page)
    for (let i = 0; i < 5; i++) await tick()
    flushSync()
    expect(fetchMock, 'the page must try to load the named profile').toHaveBeenCalled()
    push(fixture)
    push(withNew())
    advance(7999)
    expect(card()).not.toBeNull()
    advance(1)
    expect(card()).toBeNull()
  })

  it('uses the 8 s default when the profile holds an out-of-range dwell', async () => {
    await mountPage({ profile: { widgets: { updates: { dwellSeconds: 90 } } } })
    push(fixture)
    push(withNew())
    advance(7999)
    expect(card()).not.toBeNull()
    advance(1)
    expect(card()).toBeNull()
  })
})
