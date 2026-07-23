import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  loadConfig,
  normalizeConfig,
  resolveWidgets,
  pickProducerSrc,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
} from './overlayConfig.js'
import { DEFAULT_SRC } from '../routes/tower/sseClient.js'
import lowerThird from '../routes/all/fixtures/profile-lower-third.json'
import towerOnly from '../routes/all/fixtures/profile-tower-only.json'

afterEach(() => vi.restoreAllMocks())

/** A fake fetch driven by a url->{ok?, body?, throw?} route map, recording calls. */
function makeFetch(routes) {
  const calls = []
  const fn = async (url) => {
    calls.push(url)
    const entry = routes[url]
    if (!entry) return { ok: false, status: 404, json: async () => ({}) }
    if (entry.throw) throw new Error('network down')
    return { ok: entry.ok !== false, status: entry.ok === false ? 404 : 200, json: async () => entry.body }
  }
  fn.calls = calls
  return fn
}

describe('loadConfig precedence — URL params > profile fetch > default', () => {
  it('returns the built-in default and does not fetch when no profile is given', async () => {
    const fetchImpl = makeFetch({})
    const config = await loadConfig('', { fetchImpl })

    expect(fetchImpl.calls).toHaveLength(0)
    expect(config.widgets.tower).toEqual(DEFAULT_CONFIG.widgets.tower)
    expect(config.widgets.battle).toEqual(DEFAULT_CONFIG.widgets.battle)
    expect(config.widgets.tower.visible).toBe(true)
    expect(config.widgets.battle.visible).toBe(true)
  })

  it('loads a named profile from the server endpoint and applies its geometry', async () => {
    const fetchImpl = makeFetch({ '/api/profiles/lower-third': { body: lowerThird } })
    const config = await loadConfig('?profile=lower-third', { fetchImpl })

    expect(fetchImpl.calls).toEqual(['/api/profiles/lower-third'])
    expect(config.widgets.tower).toMatchObject({ x: 40, y: 40, w: 420, h: 800 })
    expect(config.widgets.battle).toMatchObject({ x: 640, y: 820, w: 640, h: 200, visible: true })
  })

  it('falls back to the static /config/<name>.json when the server endpoint 404s', async () => {
    const fetchImpl = makeFetch({
      '/api/profiles/lower-third': { ok: false },
      '/config/lower-third.json': { body: lowerThird },
    })
    const config = await loadConfig('?profile=lower-third', { fetchImpl })

    expect(fetchImpl.calls).toEqual(['/api/profiles/lower-third', '/config/lower-third.json'])
    expect(config.widgets.tower).toMatchObject({ x: 40, y: 40 })
  })

  it('warns and keeps the default layout when a profile cannot be loaded at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = makeFetch({}) // every candidate 404s

    const config = await loadConfig('?profile=missing', { fetchImpl })

    expect(warn).toHaveBeenCalledOnce()
    expect(config.widgets.tower).toEqual(DEFAULT_CONFIG.widgets.tower)
  })

  it('lets an explicit ?hide= URL param override a profile that shows the widget', async () => {
    const fetchImpl = makeFetch({ '/api/profiles/lower-third': { body: lowerThird } })
    // The profile marks battle visible; the URL param must win.
    const config = await loadConfig('?profile=lower-third&hide=battle', { fetchImpl })

    expect(config.widgets.battle.visible).toBe(false)
    expect(config.widgets.tower.visible).toBe(true)
  })

  it('lets an explicit ?show= URL param override a profile that hides the widget', async () => {
    const fetchImpl = makeFetch({ '/api/profiles/tower-only': { body: towerOnly } })
    // tower-only hides battle; ?show=battle must win.
    const config = await loadConfig('?profile=tower-only&show=battle', { fetchImpl })

    expect(config.widgets.battle.visible).toBe(true)
  })

  it('survives a network exception on the fetch and falls back to default', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = makeFetch({ '/api/profiles/race': { throw: true } })
    const config = await loadConfig('?profile=race', { fetchImpl })

    expect(config.widgets.tower).toEqual(DEFAULT_CONFIG.widgets.tower)
  })
})

describe('applyUrlOverrides — prototype-pollution safety', () => {
  afterEach(() => {
    delete Object.prototype.visible // defensive: keep a leak from bleeding across tests
  })

  it('ignores __proto__ / constructor keys in ?show= / ?hide= (no prototype pollution)', async () => {
    await loadConfig('?show=__proto__,constructor&hide=__proto__')
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'visible')).toBe(false)
    expect({}.visible).toBeUndefined()
  })

  it('still toggles real, own widget keys', async () => {
    const cfg = await loadConfig('?hide=tower')
    expect(cfg.widgets.tower.visible).toBe(false)
  })
})

describe('normalizeConfig — always yields a complete, well-typed contract', () => {
  it('coerces string coordinates and fills missing fields from the default', () => {
    const config = normalizeConfig({
      widgets: { tower: { x: '100', y: '200' } },
    })
    expect(config.widgets.tower.x).toBe(100)
    expect(config.widgets.tower.y).toBe(200)
    // Untouched geometry + visibility come from the default.
    expect(config.widgets.tower.w).toBe(DEFAULT_CONFIG.widgets.tower.w)
    expect(config.widgets.tower.visible).toBe(true)
    expect(config.configVersion).toBe(CONFIG_VERSION)
  })

  it('preserves an unknown widget key from a newer profile, defaulting it hidden', () => {
    const config = normalizeConfig({
      widgets: { trackmap: { x: 10, y: 10, w: 300, h: 300 } },
    })
    expect(config.widgets.trackmap).toMatchObject({ x: 10, y: 10, w: 300, h: 300, visible: false })
  })

  it('drops prototype-polluting widget keys from a crafted profile', () => {
    // JSON.parse makes __proto__ / constructor OWN keys (unlike an object literal, where
    // `__proto__:` would set the literal's prototype instead of adding a key).
    const widgets = JSON.parse(
      '{"__proto__":{"visible":true},"constructor":{"visible":true},"prototype":{"visible":true},"tower":{"x":5}}',
    )
    const config = normalizeConfig({ widgets })
    // The widgets object's prototype is untouched and no stray widget leaked in.
    expect(Object.getPrototypeOf(config.widgets)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(config.widgets, 'constructor')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(config.widgets, 'prototype')).toBe(false)
    // Real widgets still normalize; nothing pollutes the global prototype.
    expect(config.widgets.tower.x).toBe(5)
    expect({}.visible).toBeUndefined()
  })

  it('is safe on null / non-object input', () => {
    expect(normalizeConfig(null).widgets.tower.visible).toBe(true)
    expect(normalizeConfig('nope').widgets.battle.visible).toBe(true)
  })

  it('defaults reducedMotion to false and honors an explicit boolean', () => {
    // The overlay animates by default (OBS/CEF reports reduced-motion; see lib/motion.js).
    expect(normalizeConfig({}).reducedMotion).toBe(false)
    expect(normalizeConfig({ reducedMotion: true }).reducedMotion).toBe(true)
    // Non-boolean garbage falls back to false.
    expect(normalizeConfig({ reducedMotion: 'yes' }).reducedMotion).toBe(false)
    // Round-trips through a serialized profile.
    const rt = normalizeConfig(JSON.parse(JSON.stringify(normalizeConfig({ reducedMotion: true }))))
    expect(rt.reducedMotion).toBe(true)
  })

  it("preserves a profile's declared configVersion, including falsy values", () => {
    expect(normalizeConfig({ configVersion: '2' }).configVersion).toBe('2')
    // A falsy-but-present version must not be silently replaced by the default.
    expect(normalizeConfig({ configVersion: 0 }).configVersion).toBe('0')
    // Absent => default.
    expect(normalizeConfig({}).configVersion).toBe(CONFIG_VERSION)
  })

  it('fills a default 1920x1080 canvas and honors a profile-declared one', () => {
    expect(normalizeConfig({}).canvas).toEqual({ w: 1920, h: 1080 })
    expect(normalizeConfig({ canvas: { w: '1280', h: 720 } }).canvas).toEqual({ w: 1280, h: 720 })
  })

  it('clamps an absurdly small canvas to the minimum edge', () => {
    expect(normalizeConfig({ canvas: { w: 10, h: -5 } }).canvas).toEqual({ w: 320, h: 320 })
  })

  it('defaults hideWhenIdle to false and honors an explicit value', () => {
    expect(normalizeConfig({}).widgets.battle.hideWhenIdle).toBe(false)
    expect(normalizeConfig({ widgets: { battle: { hideWhenIdle: true } } }).widgets.battle.hideWhenIdle).toBe(true)
  })

  it('defaults plateAlpha to 0.82, clamps to [0,1], rejects garbage, on every widget (#117)', () => {
    const alpha = (v) => normalizeConfig({ widgets: { tower: { plateAlpha: v } } }).widgets.tower.plateAlpha
    expect(normalizeConfig({}).widgets.tower.plateAlpha).toBe(0.82) // default
    expect(alpha(0.4)).toBe(0.4)
    expect(alpha(1.5)).toBe(1) // clamped high
    expect(alpha(-1)).toBe(0) // clamped low
    expect(alpha('nope')).toBe(0.82) // garbage -> default
    expect(alpha(null)).toBe(0.82) // null -> default (NOT 0 / transparent)
    expect(alpha('')).toBe(0.82)
    expect(alpha(false)).toBe(0.82)
    // normalized onto every widget (like hideWhenIdle), for a uniform shape.
    const cfg = normalizeConfig({})
    for (const key of Object.keys(cfg.widgets)) {
      expect(cfg.widgets[key].plateAlpha).toBe(0.82)
    }
  })

  it('defaults the lower-third trigger knobs and honors explicit values', () => {
    // Defaults on every widget (mirrors hideWhenIdle); only lower-thirds read them.
    const d = normalizeConfig({}).widgets.driver
    expect(d.trigger).toBe('dwell')
    expect(d.dwellSeconds).toBe(6)
    expect(d.showOnConnect).toBe(true)

    const custom = normalizeConfig({
      widgets: { driver: { trigger: 'persistent', dwellSeconds: 10, showOnConnect: false } },
    }).widgets.driver
    expect(custom.trigger).toBe('persistent')
    expect(custom.dwellSeconds).toBe(10)
    expect(custom.showOnConnect).toBe(false)
  })

  it('rejects an invalid trigger / non-positive dwell, falling back to the defaults', () => {
    const w = normalizeConfig({
      widgets: { driver: { trigger: 'bogus', dwellSeconds: 0 } },
    }).widgets.driver
    expect(w.trigger).toBe('dwell')
    expect(w.dwellSeconds).toBe(6)
  })

  it('defaults the tower classDisplay to inline and honors an explicit value', () => {
    // Normalized onto every widget (mirrors the trigger knobs); only the tower reads it.
    expect(normalizeConfig({}).widgets.tower.classDisplay).toBe('inline')
    expect(
      normalizeConfig({ widgets: { tower: { classDisplay: 'grouped' } } }).widgets.tower
        .classDisplay,
    ).toBe('grouped')
  })

  it('rejects an invalid classDisplay, falling back to inline', () => {
    expect(
      normalizeConfig({ widgets: { tower: { classDisplay: 'bogus' } } }).widgets.tower
        .classDisplay,
    ).toBe('inline')
  })

  it('round-trips a grouped classDisplay through a serialized profile', () => {
    // A saved profile is JSON on disk — prove the knob survives the serialize/parse
    // + normalize cycle the config UI and loader put it through.
    const authored = normalizeConfig({
      name: 'multiclass',
      widgets: { tower: { classDisplay: 'grouped' } },
    })
    const roundTripped = normalizeConfig(JSON.parse(JSON.stringify(authored)))
    expect(roundTripped.widgets.tower.classDisplay).toBe('grouped')
  })

  it('defaults the onboard speedUnit to kmh and honors an explicit value', () => {
    // Normalized onto every widget (mirrors classDisplay); only the on-board HUD reads it.
    expect(normalizeConfig({}).widgets.onboard.speedUnit).toBe('kmh')
    expect(
      normalizeConfig({ widgets: { onboard: { speedUnit: 'mph' } } }).widgets.onboard.speedUnit,
    ).toBe('mph')
  })

  it('rejects an invalid speedUnit, falling back to kmh', () => {
    expect(
      normalizeConfig({ widgets: { onboard: { speedUnit: 'furlongs' } } }).widgets.onboard
        .speedUnit,
    ).toBe('kmh')
  })

  it('round-trips an mph speedUnit through a serialized profile', () => {
    const authored = normalizeConfig({
      name: 'imperial',
      widgets: { onboard: { speedUnit: 'mph' } },
    })
    const roundTripped = normalizeConfig(JSON.parse(JSON.stringify(authored)))
    expect(roundTripped.widgets.onboard.speedUnit).toBe('mph')
  })

  it('defaults the onboard driverInfo to name+number and waitForLowerThird on', () => {
    const w = normalizeConfig({}).widgets.onboard
    expect(w.driverInfo).toEqual({ name: true, number: true, class: false, make: false, model: false })
    expect(w.waitForLowerThird).toBe(true)
  })

  it('merges a partial driverInfo over the defaults and coerces garbage to booleans', () => {
    const w = normalizeConfig({
      widgets: { onboard: { driverInfo: { name: false, make: true, model: 'yes' } } },
    }).widgets.onboard
    // name overridden off, make on; model garbage -> falls back to default (false);
    // number/class keep their defaults.
    expect(w.driverInfo).toEqual({ name: false, number: true, class: false, make: true, model: false })
  })

  it('honors and round-trips waitForLowerThird=false and a full driverInfo', () => {
    const authored = normalizeConfig({
      widgets: {
        onboard: {
          waitForLowerThird: false,
          driverInfo: { name: true, number: true, class: true, make: true, model: true },
        },
      },
    })
    expect(authored.widgets.onboard.waitForLowerThird).toBe(false)
    const roundTripped = normalizeConfig(JSON.parse(JSON.stringify(authored)))
    expect(roundTripped.widgets.onboard.waitForLowerThird).toBe(false)
    expect(roundTripped.widgets.onboard.driverInfo).toEqual({
      name: true,
      number: true,
      class: true,
      make: true,
      model: true,
    })
  })
})

describe('resolveWidgets — ordered render list', () => {
  it('sorts widgets by ascending z-order', () => {
    const order = resolveWidgets({
      widgets: {
        tower: { z: 5 },
        battle: { z: 1 },
        logos: { z: 3 },
        driver: { z: 4 },
        qualifying: { z: 6 },
        racecontrol: { z: 7 },
        onboard: { z: 8 },
      },
    }).map((w) => w.key)
    expect(order).toEqual(['battle', 'logos', 'driver', 'tower', 'qualifying', 'racecontrol', 'onboard'])
  })
})

describe('pickProducerSrc — producer feed resolution', () => {
  it('prefers an explicit ?src= over the profile producer', () => {
    const config = normalizeConfig({ producer: { src: 'http://profile:1/events' } })
    expect(pickProducerSrc('?src=http://url:9/events', config)).toBe('http://url:9/events')
  })

  it("uses the profile's producer.src when ?src= is absent", () => {
    const config = normalizeConfig({ producer: { src: 'http://profile:1/events' } })
    expect(pickProducerSrc('', config)).toBe('http://profile:1/events')
  })

  it('falls back to DEFAULT_SRC when neither is present', () => {
    const config = normalizeConfig({ producer: {} })
    expect(pickProducerSrc('', config)).toBe(DEFAULT_SRC)
  })
})

describe('normalizeConfig — tower overflow maxRows + cycle (ADR 0003)', () => {
  it('DEFAULT_CONFIG ships the spec defaults on the tower', () => {
    const t = DEFAULT_CONFIG.widgets.tower
    expect(t.maxRows).toBe('auto')
    expect(t.cycle).toEqual({
      enabled: true,
      perPageSeconds: 8,
      pinTop: 3,
      pinScope: 'overall',
      pinSubject: true,
    })
  })

  it('fills maxRows + cycle from the default when a profile omits them', () => {
    const c = normalizeConfig({ widgets: { tower: { visible: true } } })
    expect(c.widgets.tower.maxRows).toBe('auto')
    expect(c.widgets.tower.cycle).toEqual({
      enabled: true,
      perPageSeconds: 8,
      pinTop: 3,
      pinScope: 'overall',
      pinSubject: true,
    })
  })

  it('normalizes maxRows: keeps "auto" and positive integers, floors floats, rejects garbage', () => {
    const scope = (v) => normalizeConfig({ widgets: { tower: { maxRows: v } } }).widgets.tower.maxRows
    expect(scope('auto')).toBe('auto')
    expect(scope(12)).toBe(12)
    expect(scope(12.9)).toBe(12) // floored
    expect(scope(0)).toBe('auto') // < 1 -> default
    expect(scope(-4)).toBe('auto')
    expect(scope('nope')).toBe('auto')
    expect(scope(null)).toBe('auto')
  })

  it('coerces a partial cycle object, keeping valid fields and defaulting the rest', () => {
    const c = normalizeConfig({
      widgets: { tower: { cycle: { enabled: false, pinScope: 'class' } } },
    })
    expect(c.widgets.tower.cycle).toEqual({
      enabled: false, // kept
      perPageSeconds: 8, // default
      pinTop: 3, // default
      pinScope: 'class', // kept
      pinSubject: true, // default
    })
  })

  it('rejects garbage cycle fields and a non-object cycle, falling back to defaults', () => {
    const c = normalizeConfig({
      widgets: {
        tower: { cycle: { enabled: 'yes', perPageSeconds: -3, pinTop: 'x', pinScope: 'bogus', pinSubject: 1 } },
      },
    })
    expect(c.widgets.tower.cycle).toEqual(CYCLE_DEFAULTS_SHAPE)
    // a non-object cycle is replaced wholesale by the defaults
    const c2 = normalizeConfig({ widgets: { tower: { cycle: 'nope' } } })
    expect(c2.widgets.tower.cycle).toEqual(CYCLE_DEFAULTS_SHAPE)
  })

  it('keeps a configured perPageSeconds as-is (the tower floors it at render time)', () => {
    const c = normalizeConfig({ widgets: { tower: { cycle: { perPageSeconds: 2 } } } })
    // config preserves the operator's value; the 4s readability floor is applied in
    // the widget via towerCycle.clampPerPageSeconds, not here.
    expect(c.widgets.tower.cycle.perPageSeconds).toBe(2)
  })

  it('normalizes maxRows + cycle onto every widget (uniform shape)', () => {
    const c = normalizeConfig({})
    for (const key of Object.keys(c.widgets)) {
      expect(c.widgets[key].maxRows).toBe('auto')
      expect(c.widgets[key].cycle).toEqual(CYCLE_DEFAULTS_SHAPE)
    }
  })
})

const CYCLE_DEFAULTS_SHAPE = {
  enabled: true,
  perPageSeconds: 8,
  pinTop: 3,
  pinScope: 'overall',
  pinSubject: true,
}
