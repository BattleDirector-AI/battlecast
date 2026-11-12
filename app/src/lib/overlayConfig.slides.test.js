/* The profile's `slides` section (overlay-config.md rule 73, ADR 0041).
 *
 * `slides` is one top-level section, not a widget: series, round and track are text (trimmed, cut
 * to 80 characters, trimmed again; a non-string gives ''), logo is a URL string (trimmed; a
 * non-string gives ''), and every other key of an object `slides` is kept unchanged so a later
 * slide's content survives a load and a save. Each case feeds `normalizeConfig` a raw profile and
 * reads the normalized section.
 */
import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS } from './overlayConfig.js'

// The Countdown keys are part of the default since #464 (rule 73, steps 5 and 6).
const EMPTY = { series: '', round: '', track: '', logo: '', start: '', startedText: 'STARTING NOW' }
/** The normalized section; fails with a message that names the gap rather than a null deref. */
function sectionOf(cfg) {
  expect(cfg.slides, 'normalizeConfig gives no slides section').toBeTypeOf('object')
  expect(cfg.slides, 'normalizeConfig gives no slides section').not.toBeNull()
  return cfg.slides
}
const ev = (slides) => sectionOf(normalizeConfig({ slides }))

describe('slides section defaults (rule 73)', () => {
  it('the built-in default carries an empty slides section', () => {
    expect(DEFAULT_CONFIG.slides).toEqual(EMPTY)
  })

  it('a profile key named event is not the slides section (the producer has an event object)', () => {
    const cfg = normalizeConfig({ event: { name: 'Spa 6 Hours', round: 3, track: 'Spa', series: 'GT Cup' } })
    expect(sectionOf(cfg)).toEqual(EMPTY)
  })

  it('a profile with no slides gets the empty section', () => {
    expect(sectionOf(normalizeConfig({}))).toEqual(EMPTY)
    expect(sectionOf(normalizeConfig(undefined))).toEqual(EMPTY)
  })

  it('a slides value that is null, an array, a string or a number gives the default', () => {
    for (const bad of [null, [], ['Cup'], 'GT Cup', 3, true]) {
      expect(ev(bad), JSON.stringify(bad)).toEqual(EMPTY)
    }
  })
})

describe('slides text fields (rule 73, step 2)', () => {
  it('trims series, round and track', () => {
    expect(ev({ series: '  GT World Cup  ', round: ' Round 3 ', track: '\tSpa-Francorchamps\n' })).toEqual({
      ...EMPTY,
      series: 'GT World Cup',
      round: 'Round 3',
      track: 'Spa-Francorchamps',
    })
  })

  it('keeps whitespace and case inside the text', () => {
    expect(ev({ series: 'GT  World cup' }).series).toBe('GT  World cup')
  })

  it('cuts each text to its first 80 characters, then trims again', () => {
    const long = 'A'.repeat(79) + ' ' + 'B'.repeat(20)
    // 80 characters: 79 A's and the space; the trailing space is trimmed after the cut.
    expect(ev({ series: long }).series).toBe('A'.repeat(79))
    expect(ev({ track: 'T'.repeat(120) }).track).toBe('T'.repeat(80))
    expect(ev({ round: '  ' + 'R'.repeat(85) }).round).toBe('R'.repeat(80))
  })

  it('a value that is not a string gives an empty string', () => {
    const out = ev({ series: 42, round: 3, track: { name: 'Spa' } })
    expect(out.series).toBe('')
    expect(out.round).toBe('')
    expect(out.track).toBe('')
    expect(ev({ series: null, round: true, track: ['Spa'] })).toEqual(EMPTY)
  })

  it('a blank text gives an empty string', () => {
    expect(ev({ series: '   ', round: '\n', track: '' })).toEqual(EMPTY)
  })
})

describe('slides logo (rule 73, step 3)', () => {
  it('keeps a URL string, trimmed, without checking that it loads', () => {
    expect(ev({ logo: ' /logos/series.png ' }).logo).toBe('/logos/series.png')
    expect(ev({ logo: 'logos/static-host.png' }).logo).toBe('logos/static-host.png')
  })

  it('a value that is not a string gives an empty string', () => {
    for (const bad of [null, 7, true, ['/logos/a.png'], { url: '/logos/a.png' }]) {
      expect(ev({ logo: bad }).logo, JSON.stringify(bad)).toBe('')
    }
  })
})

describe('slides forward compatibility (rule 73, step 4)', () => {
  it('keeps every other key of slides with its value unchanged', () => {
    // `start` is a known key since #464 (step 5), so the unknown keys here are later slides' keys.
    const schedule = [{ round: 1, track: 'Spa' }]
    const out = ev({ series: 'GT Cup', schedule, crew: { host: 'A. Host' }, intro: 'x' })
    expect(out.intro).toBe('x')
    expect(out.schedule).toEqual(schedule)
    expect(out.crew).toEqual({ host: 'A. Host' })
    expect(out.series).toBe('GT Cup')
  })

  it('drops the prototype-polluting keys', () => {
    const raw = JSON.parse('{"slides":{"series":"GT Cup","__proto__":{"polluted":1},"constructor":"x","prototype":"y"}}')
    const out = sectionOf(normalizeConfig(raw))
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(out, 'prototype')).toBe(false)
    expect(out.polluted).toBeUndefined()
    expect(out.series).toBe('GT Cup')
  })
})

describe('slides is not a widget and changes nothing else (rule 73)', () => {
  it('adds no widget key and no per-widget event or slides knob', () => {
    const cfg = normalizeConfig({ slides: { series: 'GT Cup' } })
    expect(sectionOf(cfg).series).toBe('GT Cup')
    for (const name of ['event', 'slides']) {
      expect(WIDGET_KEYS).not.toContain(name)
      expect(cfg.widgets[name]).toBeUndefined()
      for (const key of WIDGET_KEYS) {
        expect(cfg.widgets[key][name], `${key} carries a ${name} knob`).toBeUndefined()
      }
    }
  })

  it('leaves the theme, logo rotation and geometry of the profile unchanged', () => {
    const raw = {
      slides: { series: 'GT Cup', logo: '/logos/series.png' },
      theme: { preset: 'vintage80' },
      logoRotation: { images: ['/logos/sponsor.png'] },
      widgets: { tower: { x: 40, w: 380 } },
    }
    const withEvent = normalizeConfig(raw)
    const without = normalizeConfig({ ...raw, slides: undefined })
    expect(sectionOf(withEvent).series).toBe('GT Cup')
    expect(withEvent.theme).toEqual(without.theme)
    expect(withEvent.logoRotation).toEqual(without.logoRotation)
    expect(withEvent.widgets).toEqual(without.widgets)
    expect(withEvent.configVersion).toBe('1')
  })
})
