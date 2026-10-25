/* Weather box — the parts, the unit, hiding, in-place updates, and no transition (#208).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 83-86, ADR 0025. Drives the bare widget
 * (props `snapshot`, `tempUnit`; how/renderer.md) with spec/v1 snapshots built from
 * race-weather.json (session.weather { air_temp: 22.4, track_temp: 31.2, conditions: "Light
 * rain" }) and asserts the rendered box.
 *
 * The component is loaded through a non-static specifier so its absence fails each test with
 * a message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import fixture from '../../../../spec/v1/fixtures/race-weather.json'

const MODULE = './WeatherBox.svelte'
async function loadBox() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/weather/WeatherBox.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

/** race-weather.json with `session.weather` replaced (undefined deletes it). */
function withWeather(weather) {
  const s = structuredClone(fixture)
  if (weather === undefined) delete s.session.weather
  else s.session.weather = weather
  return s
}

let view
async function mount(props) {
  const Box = await loadBox()
  view = render(Box, { snapshot: null, tempUnit: 'c', ...props })
  await tick()
  flushSync()
}
async function update(props) {
  await view.rerender(props)
  flushSync()
}

const q = (testid) => view.container.querySelector(`[data-testid="${testid}"]`)
const text = (testid) => q(testid)?.textContent.trim() ?? null

afterEach(() => {
  cleanup()
  document.documentElement.dataset.motion = 'reduced'
})

describe('weather box — the parts (rules 83-85)', () => {
  it('shows race-weather.json as AIR 22°C, TRACK 31°C and the conditions, in that order', async () => {
    await mount({ snapshot: fixture })
    const box = q('weather-box')
    expect(box, 'no weather box').not.toBeNull()
    expect(text('weather-air-value')).toBe('22°C')
    expect(text('weather-track-value')).toBe('31°C')
    expect(text('weather-conditions')).toBe('Light rain')
    expect(q('weather-air').textContent).toContain('AIR')
    expect(q('weather-track').textContent).toContain('TRACK')
    expect(q('weather-air').textContent, 'the air item is AIR and its value only').not.toContain('TRACK')

    const items = [...box.querySelectorAll('[data-testid="weather-air"], [data-testid="weather-track"], [data-testid="weather-conditions"]')]
    expect(items.map((el) => el.dataset.testid)).toEqual(['weather-air', 'weather-track', 'weather-conditions'])
  })

  it('shows °F when tempUnit is f, rounded to whole degrees', async () => {
    await mount({ snapshot: fixture, tempUnit: 'f' })
    expect(text('weather-air-value')).toBe('72°F')
    expect(text('weather-track-value')).toBe('88°F')
    expect(text('weather-conditions'), 'conditions are not converted').toBe('Light rain')
  })

  it('leaves out a part that does not hold, with no empty label', async () => {
    await mount({ snapshot: withWeather({ air_temp: 'warm', track_temp: -3.4, conditions: '  ' }) })
    expect(q('weather-box')).not.toBeNull()
    expect(q('weather-air'), 'no air item for a non-numeric air_temp').toBeNull()
    expect(q('weather-conditions'), 'no conditions item for blank conditions').toBeNull()
    expect(text('weather-track-value')).toBe('-3°C')
    expect(q('weather-box').textContent).not.toContain('AIR')
  })

  it('shows conditions alone, trimmed and verbatim', async () => {
    await mount({ snapshot: withWeather({ conditions: '  heavy  RAIN ' }) })
    expect(text('weather-conditions')).toBe('heavy  RAIN')
    expect(q('weather-air')).toBeNull()
    expect(q('weather-track')).toBeNull()
  })

  it.each([
    ['no session.weather', withWeather(undefined)],
    ['session.weather null', withWeather(null)],
    ['a weather with no valid part', withWeather({ air_temp: null, track_temp: '30', conditions: '' })],
    ['a string weather', withWeather('Clear')],
    ['no session at all', (() => {
      const s = structuredClone(fixture)
      delete s.session
      return s
    })()],
  ])('draws nothing at all with %s', async (_label, snapshot) => {
    await mount({ snapshot })
    expect(q('weather-box')).toBeNull()
    expect(view.container.textContent.trim()).toBe('')
  })

  it('draws nothing before the first snapshot', async () => {
    await mount({ snapshot: null })
    expect(q('weather-box')).toBeNull()
  })

  it('shows in every mode', async () => {
    await mount({ snapshot: { ...structuredClone(fixture), mode: 'qualifying' } })
    expect(text('weather-air-value')).toBe('22°C')
    await update({ snapshot: { ...structuredClone(fixture), mode: 'replay' } })
    expect(text('weather-air-value')).toBe('22°C')
  })
})

describe('weather box — updates and motion (rule 86)', () => {
  it('updates values in place, adds and drops parts, and follows a tempUnit change', async () => {
    await mount({ snapshot: fixture })
    const box = q('weather-box')
    await update({ snapshot: withWeather({ air_temp: 23.6, track_temp: 33.1, conditions: 'Clear' }) })
    expect(q('weather-box'), 'the same box element, updated in place').toBe(box)
    expect(text('weather-air-value')).toBe('24°C')
    expect(text('weather-track-value')).toBe('33°C')
    expect(text('weather-conditions')).toBe('Clear')

    await update({ snapshot: withWeather({ air_temp: 23.6 }) })
    expect(q('weather-track')).toBeNull()
    expect(q('weather-conditions')).toBeNull()

    await update({ tempUnit: 'f' })
    expect(text('weather-air-value')).toBe('74°F')
  })

  it('appears and disappears at once under full motion, with no lingering plate', async () => {
    document.documentElement.dataset.motion = 'full'
    await mount({ snapshot: withWeather(undefined) })
    expect(q('weather-box')).toBeNull()
    await update({ snapshot: fixture })
    expect(q('weather-box'), 'appears at once').not.toBeNull()
    await update({ snapshot: withWeather(undefined) })
    expect(q('weather-box'), 'disappears at once').toBeNull()
    expect(view.container.textContent.trim()).toBe('')
    expect(view.container.querySelector('.lt3'), 'no lower-third shell').toBeNull()
  })
})
