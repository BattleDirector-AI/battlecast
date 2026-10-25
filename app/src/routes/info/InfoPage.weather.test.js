/* Standalone `/info` and the weather card (#208).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 82, 88; overlay-config.md rules 54, 57;
 * ADR 0025. The page reads the `info` widget's `weatherCard` and `tempUnit` from the loaded
 * profile (off by default, °C). The SSE client is mocked and timers faked, as InfoPage.test.js
 * does.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import InfoPage from './InfoPage.svelte'
import fixture from '../../../../spec/v1/fixtures/race-weather.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

/** The producer sends only weather: no info lines, so the card (if any) is the only line. */
const weatherOnly = () => ({ ...structuredClone(fixture), info_lines: [] })
const line = () => document.querySelector('[data-testid="info-line"]')?.textContent.trim() ?? null

async function mountPage(profile) {
  window.history.replaceState({}, '', profile ? '/info?profile=p' : '/info')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile
        ? { ok: true, status: 200, json: async () => structuredClone(profile) }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(InfoPage)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
  sse.emit(weatherOnly())
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

describe('/info — the weather card from the profile (rules 82, 88)', () => {
  it('shows no card with no profile: the card is off by default', async () => {
    await mountPage(null)
    expect(line()).toBeNull()
    expect(document.querySelector('[data-testid="info-header"]'), 'the header still shows').not.toBeNull()
  })

  it("reads the profile's info weatherCard: on shows the card in °C", async () => {
    await mountPage({ widgets: { info: { weatherCard: true } } })
    expect(line()).toBe('AIR 22°C · TRACK 31°C · LIGHT RAIN')
  })

  it("reads the profile's info tempUnit", async () => {
    await mountPage({ widgets: { info: { weatherCard: true, tempUnit: 'f' } } })
    expect(line()).toBe('AIR 72°F · TRACK 88°F · LIGHT RAIN')
  })
})
