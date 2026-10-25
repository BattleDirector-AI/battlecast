/* The weather box and the info panel's weather card inside `/all` (#208).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 82, 85, 87, 88; overlay-config.md rules 54,
 * 55, 57; ADR 0025. Drives AllView with race-weather.json and a normalized profile, under fake
 * timers (the info panel rotates).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import fixture from '../../../../spec/v1/fixtures/race-weather.json'

const CARD = 'AIR 22°C · TRACK 31°C · LIGHT RAIN'

let view
async function mount(props) {
  view = render(AllView, props)
  await tick()
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}
const slot = (key) => view.container.querySelector(`[data-testid="widget-${key}"]`)
const inSlot = (key, testid) => slot(key)?.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() ?? null
/** The info panel's lines over one cycle of `n`, from the one up now. */
function infoCycle(n) {
  const seen = [inSlot('info', 'info-line')]
  for (let i = 1; i < n; i++) {
    advance(8000)
    seen.push(inSlot('info', 'info-line'))
  }
  return seen
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/all — the weather widget (widgets rule 87, overlay-config rule 55)', () => {
  it('is placed by default at its default geometry and shows the weather in °C', async () => {
    await mount({ snapshot: fixture })
    expect(slot('weather'), 'no weather slot in the default /all layout').not.toBeNull()
    expect(slot('weather').style.left).toBe('900px')
    expect(slot('weather').style.top).toBe('80px')
    expect(slot('weather').style.width).toBe('360px')
    expect(slot('weather').style.height).toBe('44px')
    expect(slot('weather').style.zIndex).toBe('10')
    expect(inSlot('weather', 'weather-air-value')).toBe('22°C')
    expect(inSlot('weather', 'weather-track-value')).toBe('31°C')
    expect(inSlot('weather', 'weather-conditions')).toBe('Light rain')
  })

  it("reads the weather widget's own tempUnit, not another widget's", async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { weather: { tempUnit: 'f' } } }) })
    expect(inSlot('weather', 'weather-air-value')).toBe('72°F')
    await cleanup()
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { info: { tempUnit: 'f' } } }) })
    expect(inSlot('weather', 'weather-air-value'), 'the info widget’s unit does not reach the box').toBe('22°C')
  })

  it('is not mounted while not visible', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { weather: { visible: false } } }) })
    expect(slot('weather')).toBeNull()
    expect(view.container.querySelector('[data-testid="weather-box"]')).toBeNull()
  })

  it('keeps showing with hideWhenIdle set: the box has no idle predicate', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { weather: { hideWhenIdle: true } } }) })
    expect(inSlot('weather', 'weather-air-value')).toBe('22°C')
  })
})

describe('/all — the info panel’s weather card (widgets rules 82, 88; overlay-config rule 57)', () => {
  it('rotates the card after the lines when weatherCard is on, in the info widget’s unit', async () => {
    await mount({
      snapshot: fixture,
      config: normalizeConfig({ widgets: { info: { weatherCard: true, tempUnit: 'f' } } }),
    })
    expect(infoCycle(4)).toEqual([...fixture.info_lines, 'AIR 72°F · TRACK 88°F · LIGHT RAIN'])
  })

  it('leaves the card out by default: the weather shows once, in the weather box', async () => {
    await mount({ snapshot: fixture })
    const seen = infoCycle(4)
    expect(seen).not.toContain(CARD)
    expect(seen).toEqual([...fixture.info_lines, fixture.info_lines[0]])
    expect(inSlot('weather', 'weather-air-value'), 'the box shows it instead').toBe('22°C')
  })
})
