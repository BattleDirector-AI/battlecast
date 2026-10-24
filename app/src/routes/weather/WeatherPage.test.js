/* Standalone `/weather` route (#208).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rule 87; overlay-config.md rules 22, 54; ADR 0025.
 * Drives the PAGE, because the unit comes from the loaded profile and the page is where that
 * is read. The SSE client is mocked so a test pushes snapshots at the page; timers are faked so
 * the live-reload poll can be run (as InfoPage.test.js does).
 *
 * The page is loaded through a non-static specifier so its absence fails each test with a
 * message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import fixture from '../../../../spec/v1/fixtures/race-weather.json'

const sse = vi.hoisted(() => ({ emit: null, connects: 0 }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.connects += 1
    sse.emit = onState
    return () => {}
  },
}))

const MODULE = './WeatherPage.svelte'
async function loadPage() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/weather/WeatherPage.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const value = (testid) => document.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() ?? null

function push(snapshot) {
  sse.emit(snapshot)
  flushSync()
}

async function mountPage({ profile = null, failing = false } = {}) {
  const Page = await loadPage()
  window.history.replaceState({}, '', profile || failing ? '/weather?profile=p' : '/weather')
  const fetchMock = vi.fn(async () =>
    profile
      ? { ok: true, status: 200, json: async () => structuredClone(profile) }
      : { ok: false, status: 404, json: async () => ({}) },
  )
  vi.stubGlobal('fetch', fetchMock)
  render(Page)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
  return fetchMock
}

beforeEach(() => {
  sse.emit = null
  sse.connects = 0
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('/weather standalone route (rule 87)', () => {
  it('connects to the producer and shows the weather in °C by default', async () => {
    await mountPage()
    expect(sse.emit, 'the page must connect to the producer feed').toBeTypeOf('function')
    expect(document.querySelector('[data-testid="weather-box"]'), 'nothing before the first snapshot').toBeNull()
    push(fixture)
    expect(value('weather-air-value')).toBe('22°C')
    expect(value('weather-track-value')).toBe('31°C')
    expect(value('weather-conditions')).toBe('Light rain')
  })

  it("reads the profile's weather tempUnit", async () => {
    await mountPage({ profile: { widgets: { weather: { tempUnit: 'f' } } } })
    push(fixture)
    expect(value('weather-air-value')).toBe('72°F')
  })

  it('uses °C when ?profile= names a profile that fails to load', async () => {
    const fetchMock = await mountPage({ failing: true })
    expect(fetchMock, 'the page must try to load the named profile').toHaveBeenCalled()
    push(fixture)
    expect(value('weather-air-value')).toBe('22°C')
  })

  it('uses °C when the profile holds an unknown unit', async () => {
    await mountPage({ profile: { widgets: { weather: { tempUnit: 'F' } } } })
    push(fixture)
    expect(value('weather-air-value')).toBe('22°C')
  })

  it('reloads the profile live: a unit changed in /config reaches a running /weather without a refresh', async () => {
    const profile = { widgets: { weather: { tempUnit: 'c' } } }
    const fetchMock = await mountPage({ profile })
    push(fixture)
    expect(value('weather-air-value')).toBe('22°C')
    const loadsBefore = fetchMock.mock.calls.length

    profile.widgets.weather.tempUnit = 'f'
    await vi.advanceTimersByTimeAsync(5000)
    for (let i = 0; i < 5; i++) await tick()
    flushSync()
    expect(fetchMock.mock.calls.length, 'the page must re-read its profile').toBeGreaterThan(loadsBefore)
    expect(value('weather-air-value')).toBe('72°F')
    expect(sse.connects, 'a config change must not reconnect the producer feed').toBe(1)
  })
})
