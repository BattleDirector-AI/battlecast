/* Weather — which fields hold, the temperature format, and the info panel card's text.
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 83, 84, 88; protocol-contract.md rule 24;
 * ADR 0025. `weatherParts(weather)` returns `{ air, track, conditions }`; `formatTemp(celsius,
 * unit)` the shown value; `weatherCardText(weather, unit)` the card's text or null
 * (how/renderer.md). The rendered box is asserted in routes/weather/WeatherBox.test.js and the
 * card in routes/info/InfoPanel.weatherCard.test.js; this file pins the tables cheaply.
 *
 * The module is loaded through a non-static specifier so a missing module fails each test
 * with a message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect } from 'vitest'
import fixture from '../../../spec/v1/fixtures/race-weather.json'

const MODULE = './weather.js'
async function load(name) {
  let mod
  try {
    mod = await import(/* @vite-ignore */ MODULE)
  } catch (err) {
    throw new Error(`could not load app/src/lib/weather.js: ${String(err?.message).split('\n')[0]}`, {
      cause: err,
    })
  }
  expect(typeof mod[name], `weather.js must export ${name}`).toBe('function')
  return mod[name]
}
const weatherParts = async (w) => (await load('weatherParts'))(w)
const formatTemp = async (c, unit) => (await load('formatTemp'))(c, unit)
const weatherCardText = async (w, unit) => (await load('weatherCardText'))(w, unit)

describe('weatherParts — which fields hold (rule 83)', () => {
  it('reads race-weather.json: both temperatures as sent, conditions trimmed', async () => {
    expect(await weatherParts(structuredClone(fixture.session.weather))).toEqual({
      air: 22.4,
      track: 31.2,
      conditions: 'Light rain',
    })
  })

  it('keeps zero and negative temperatures, and the conditions’ case and inner text', async () => {
    expect(await weatherParts({ air_temp: 0, track_temp: -3.4, conditions: '  heavy  RAIN ' })).toEqual({
      air: 0,
      track: -3.4,
      conditions: 'heavy  RAIN',
    })
  })

  it.each([
    ['a numeric string', '22'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['true', true],
    ['null', null],
    ['an object', { c: 22 }],
  ])('treats a temperature that is %s as absent, still reading the others', async (_label, bad) => {
    expect(await weatherParts({ air_temp: bad, track_temp: 30, conditions: 'Clear' })).toEqual({
      air: null,
      track: 30,
      conditions: 'Clear',
    })
    expect(await weatherParts({ air_temp: 20, track_temp: bad })).toEqual({ air: 20, track: null, conditions: null })
  })

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['a number', 3],
    ['null', null],
  ])('treats conditions that are %s as absent', async (_label, bad) => {
    expect(await weatherParts({ air_temp: 20, conditions: bad })).toEqual({ air: 20, track: null, conditions: null })
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', 'Clear'],
    ['an array', [22, 31]],
    ['an empty object', {}],
  ])('has no part when weather is %s', async (_label, w) => {
    expect(await weatherParts(w)).toEqual({ air: null, track: null, conditions: null })
  })
})

describe('formatTemp — whole degrees in the chosen unit (rule 84)', () => {
  it.each([
    [22.4, 'c', '22°C'],
    [22.5, 'c', '23°C'],
    [-2.5, 'c', '-2°C'],
    [-3.4, 'c', '-3°C'],
    [-0.4, 'c', '0°C'],
    [0, 'c', '0°C'],
    [31.2, 'f', '88°F'],
    [22.4, 'f', '72°F'],
    [-17.8, 'f', '0°F'],
    [-40, 'f', '-40°F'],
    [100, 'f', '212°F'],
  ])('%j in %s → %s', async (celsius, unit, shown) => {
    expect(await formatTemp(celsius, unit)).toBe(shown)
  })
})

describe('weatherCardText — the info panel card (rule 88)', () => {
  it('joins AIR, TRACK and the conditions with " · ", uppercased, in °C', async () => {
    expect(await weatherCardText(structuredClone(fixture.session.weather), 'c')).toBe(
      'AIR 22°C · TRACK 31°C · LIGHT RAIN',
    )
  })

  it('uses the unit it is given', async () => {
    expect(await weatherCardText(structuredClone(fixture.session.weather), 'f')).toBe(
      'AIR 72°F · TRACK 88°F · LIGHT RAIN',
    )
  })

  it.each([
    ['track only, °F', { track_temp: 31.2 }, 'f', 'TRACK 88°F'],
    ['air only', { air_temp: 22.4 }, 'c', 'AIR 22°C'],
    ['conditions only', { conditions: ' Overcast ' }, 'c', 'OVERCAST'],
    ['air and conditions', { air_temp: 18, track_temp: 'hot', conditions: 'Clear' }, 'c', 'AIR 18°C · CLEAR'],
  ])('leaves out absent parts and their separators: %s', async (_label, w, unit, text) => {
    expect(await weatherCardText(w, unit)).toBe(text)
  })

  it('returns null when no part holds', async () => {
    expect(await weatherCardText({ air_temp: '22', conditions: ' ' }, 'c')).toBeNull()
    expect(await weatherCardText(null, 'c')).toBeNull()
  })
})
