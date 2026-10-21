import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* When a preview drag ends (overlay-config.md rule 41d): on release, on `pointercancel`, on a
 * text-size preset change, and when a profile load replaces the whole config. After it ends, a
 * further pointer step must change nothing, so the drag-start geometry and `textScaleOrigin`
 * (rule 41c) are never written back over what the preset change or the load produced. Driven
 * through real pointer events on the preview handles; the outcome is read from the config the
 * editor exports, not just from the x/w fields. */
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(),
  saveProfile: vi.fn(async () => ({ saved: true })),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(async () => true),
  deleteProfile: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import * as api from '../../lib/configApi.js'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const input = (c, field, key = 'tower') => c.querySelector(`[data-testid="${field}-${key}"]`)
const value = (c, field) => Number(input(c, field).value)

async function type(c, field, v) {
  await fireEvent.input(input(c, field), { target: { value: String(v) } })
  await fireEvent.change(input(c, field)) // a typed value applies on commit (rule 44)
  await tick()
}

async function pick(c, preset, key = 'tower') {
  await fireEvent.change(input(c, 'text-scale', key), { target: { value: preset } })
  await tick()
}

/** The preview's screen→canvas scale, so pointer offsets land on exact canvas pixels. */
function previewScale(c) {
  const m = /scale\(([\d.]+)\)/.exec(c.querySelector('.preview__canvas').style.transform)
  expect(m, 'preview canvas has no scale transform').toBeTruthy()
  return Number(m[1])
}

// Pointer steps, in canvas pixels from the press point (the press is always at 0, 0).
const down = (c) => fireEvent.pointerDown(moveHandle(c), { clientX: 0, clientY: 0 })
async function moveTo(c, dx, dy = 0) {
  const s = previewScale(c)
  await fireEvent.pointerMove(window, { clientX: dx * s, clientY: dy * s })
  await tick()
}
async function up() {
  await fireEvent.pointerUp(window, { clientX: 0, clientY: 0 })
  await tick()
}

const moveHandle = (c) => c.querySelector('[data-testid="handle-tower"]')

/** The config Export JSON writes — the stored result, not the field text. */
async function exported(c) {
  let text = null
  vi.stubGlobal(
    'Blob',
    class {
      constructor(parts) {
        text = String(parts[0])
      }
    },
  )
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:captured')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  await fireEvent.click(c.querySelector('[data-testid="export"]'))
  expect(text, 'Export wrote nothing').toBeTruthy()
  return JSON.parse(text)
}

/** The tower at x 1500, w 380, then `larger`: 494 wide, kept on canvas at x 1426,
 *  origin { x: 1500, w: 380 }. */
async function edgeTowerAtLarger(c) {
  await type(c, 'x', 1500)
  await type(c, 'w', 380)
  await pick(c, 'larger')
  expect(value(c, 'x')).toBe(1426)
  expect(value(c, 'w')).toBe(494)
}

async function mount() {
  const { container } = render(ConfigPage)
  await settle()
  return container
}

describe('a text-size preset change ends a live drag (rule 41d)', () => {
  it('large → normal → large while the pointer is held keeps the new origin; later steps move nothing', async () => {
    const c = await mount()
    await edgeTowerAtLarger(c)
    await down(c)
    await moveTo(c, -30) // x 1396; as one rule 41c edit the origin x is now 1396
    expect(value(c, 'x')).toBe(1396)

    // Pointer still held: the select keeps focus, so arrow keys can walk the presets.
    await pick(c, 'normal') // origin restored: x 1396, w 380
    await pick(c, 'large') // fresh origin { x: 1396, w: 380 }; w 437
    expect(value(c, 'x')).toBe(1396)
    expect(value(c, 'w')).toBe(437)

    // The drag ended at the preset change: these steps must not move the tower, nor write the
    // drag-start widget's origin ({ x: 1500, w: 380 } at `larger`) back over the new one.
    // Checked right after the step too, so re-copying the widget and dragging on does not pass.
    await moveTo(c, -40)
    expect(value(c, 'x')).toBe(1396)
    await moveTo(c, 0)
    await up()

    const tower = (await exported(c)).widgets.tower
    expect(tower.textScale).toBe('large')
    expect(tower.x).toBe(1396)
    expect(tower.w).toBe(437)
    expect(tower.textScaleOrigin).toEqual({ x: 1396, w: 380 })
  })

  it('changing another widget\'s preset also ends the drag of the tower', async () => {
    const c = await mount()
    await type(c, 'x', 600)
    await down(c)
    await moveTo(c, -20)
    expect(value(c, 'x')).toBe(580)

    await pick(c, 'large', 'battle')
    await moveTo(c, -50)
    await up()

    const cfg = await exported(c)
    expect(cfg.widgets.tower.x).toBe(580)
    expect(cfg.widgets.battle.textScale).toBe('large')
  })

  it('the next drag after the preset change works normally, from where the tower is then', async () => {
    const c = await mount()
    await edgeTowerAtLarger(c)
    await down(c)
    await moveTo(c, -30)
    await pick(c, 'large') // larger → large from the origin { x: 1396, w: 380 }: w 437
    await up()
    expect(value(c, 'x')).toBe(1396)

    await down(c)
    await moveTo(c, -26)
    await up()

    const tower = (await exported(c)).widgets.tower
    expect(tower.x).toBe(1370)
    expect(tower.w).toBe(437)
    expect(tower.textScaleOrigin).toEqual({ x: 1370, w: 380 })
  })
})

describe('a profile load ends a live drag (rule 41d)', () => {
  const LOADED = {
    configVersion: '1',
    name: 'pit-wall',
    widgets: {
      tower: { visible: true, x: 100, y: 200, w: 437, h: 600, textScale: 'large', textScaleOrigin: { x: 100, w: 380 } },
    },
  }

  /** A getProfile that resolves only when the test says so — the async load "finishing". */
  function deferredProfile() {
    let resolve
    vi.mocked(api.getProfile).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    return (profile) => resolve(profile)
  }

  async function requestLoad(c) {
    await fireEvent.change(c.querySelector('[data-testid="load"]'), { target: { value: 'pit-wall' } })
    await tick()
  }

  async function mountWithProfile() {
    vi.mocked(api.listProfiles).mockResolvedValue(['pit-wall'])
    return mount()
  }

  function expectLoadedTower(tower) {
    expect(tower.x).toBe(100)
    expect(tower.y).toBe(200)
    expect(tower.w).toBe(437)
    expect(tower.h).toBe(600)
    expect(tower.textScale).toBe('large')
    expect(tower.textScaleOrigin).toEqual({ x: 100, w: 380 })
  }

  it('a load that finishes while the pointer is held: later steps never write the old geometry onto the loaded widget', async () => {
    const c = await mountWithProfile()
    const finish = deferredProfile()
    await edgeTowerAtLarger(c)
    await down(c)
    await moveTo(c, -30)
    expect(value(c, 'x')).toBe(1396)

    await requestLoad(c)
    finish(LOADED)
    await settle()
    expect(value(c, 'x')).toBe(100) // the load landed

    await moveTo(c, -40)
    await up()

    const cfg = await exported(c)
    expect(cfg.name).toBe('pit-wall')
    expectLoadedTower(cfg.widgets.tower)
  })

  it('a drag started after the load was requested ends when the profile arrives', async () => {
    const c = await mountWithProfile()
    const finish = deferredProfile()
    await edgeTowerAtLarger(c)
    await requestLoad(c) // still loading
    await down(c)
    await moveTo(c, -30)
    expect(value(c, 'x')).toBe(1396) // the drag is live before the profile arrives

    finish(LOADED)
    await settle()
    await moveTo(c, -40)
    await up()

    expectLoadedTower((await exported(c)).widgets.tower)
  })

  it('a load that fails replaces nothing and leaves the drag live', async () => {
    const c = await mountWithProfile()
    let fail
    vi.mocked(api.getProfile).mockImplementation(() => new Promise((_, reject) => (fail = reject)))
    await type(c, 'x', 600)
    await down(c)
    await moveTo(c, -20)
    await requestLoad(c)
    fail(new Error('server went away'))
    await settle()

    await moveTo(c, -50)
    await up()

    expect((await exported(c)).widgets.tower.x).toBe(550)
  })

  it('a load that finds no profile replaces nothing and leaves the drag live', async () => {
    const c = await mountWithProfile()
    const finish = deferredProfile()
    await type(c, 'x', 600)
    await down(c)
    await moveTo(c, -20)
    await requestLoad(c)
    finish(null)
    await settle()

    await moveTo(c, -50)
    await up()

    expect((await exported(c)).widgets.tower.x).toBe(550)
  })
})

describe('any other edit leaves a drag live (rule 41d)', () => {
  it('a typed x during a move drag is replaced by the next pointer step, placed from the drag start', async () => {
    const c = await mount()
    await type(c, 'x', 600)
    await down(c)
    await moveTo(c, -20)
    await type(c, 'x', 900) // the drag stays live
    expect(value(c, 'x')).toBe(900)
    await moveTo(c, -30)
    await up()

    expect((await exported(c)).widgets.tower.x).toBe(570)
  })
})

describe('pointercancel ends a drag exactly as pointerup does (rule 41d)', () => {
  async function cancel() {
    await fireEvent.pointerCancel(window, { clientX: 0, clientY: 0 })
    await tick()
  }

  it('keeps the last step\'s geometry and origin; later pointer movement changes nothing', async () => {
    const c = await mount()
    await edgeTowerAtLarger(c)
    await down(c)
    await moveTo(c, -30)
    await cancel()

    await moveTo(c, -40)
    expect(value(c, 'x')).toBe(1396) // right after the step, not only at the end
    await moveTo(c, 0)

    const tower = (await exported(c)).widgets.tower
    expect(tower.x).toBe(1396)
    expect(tower.textScaleOrigin).toEqual({ x: 1396, w: 380 })
  })

  it('a cancelled gesture and the next one are two edits: away, cancel, back moves the origin to 1426', async () => {
    const c = await mount()
    await edgeTowerAtLarger(c)
    await down(c)
    await moveTo(c, -12)
    await cancel()
    await moveTo(c, 5) // stray movement after the cancel: must not drag

    await down(c)
    await moveTo(c, 12)
    await up()

    const tower = (await exported(c)).widgets.tower
    expect(tower.x).toBe(1426)
    expect(tower.textScaleOrigin).toEqual({ x: 1426, w: 380 })
  })

  it('the window drag listeners live only while a drag is live, whatever ends it, and never outlive unmount', async () => {
    // Guards the how/ mechanism (config-editor.md: three listeners added per drag, removed by
    // endDrag and by unmount), not a rule 41d behaviour. A leaked window listener has no DOM
    // trace, so this counts live ones of each type. A version that only cleared `drag` at a
    // preset change or a load would leave all three behind, so both of those end a drag here too.
    const TYPES = ['pointermove', 'pointerup', 'pointercancel']
    const live = Object.fromEntries(TYPES.map((t) => [t, new Set()]))
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
      live[type]?.add(fn)
      return add(type, fn, opts)
    })
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, fn, opts) => {
      live[type]?.delete(fn)
      return remove(type, fn, opts)
    })
    const counts = () => Object.fromEntries(TYPES.map((t) => [t, live[t].size]))
    const ALL = { pointermove: 1, pointerup: 1, pointercancel: 1 }
    const NONE = { pointermove: 0, pointerup: 0, pointercancel: 0 }

    vi.mocked(api.listProfiles).mockResolvedValue(['pit-wall'])
    vi.mocked(api.getProfile).mockResolvedValue({
      configVersion: '1',
      name: 'pit-wall',
      widgets: { tower: { visible: true, x: 100, y: 200, w: 380, h: 600 } },
    })
    const { container: c, unmount } = render(ConfigPage)
    await settle()
    expect(counts(), 'drag listeners on window before any drag').toEqual(NONE)

    await down(c)
    expect(counts(), 'drag listeners missing from window during a drag').toEqual(ALL)
    await up()
    expect(counts(), 'drag listeners left on window after pointerup').toEqual(NONE)

    await down(c)
    await cancel()
    expect(counts(), 'drag listeners left on window after pointercancel').toEqual(NONE)

    await down(c)
    expect(counts()).toEqual(ALL)
    await pick(c, 'large')
    expect(counts(), 'drag listeners left on window after a preset change').toEqual(NONE)

    await down(c)
    expect(counts()).toEqual(ALL)
    await fireEvent.change(c.querySelector('[data-testid="load"]'), { target: { value: 'pit-wall' } })
    await settle()
    expect(value(c, 'x')).toBe(100) // the load landed
    expect(counts(), 'drag listeners left on window after a profile load').toEqual(NONE)

    await down(c)
    expect(counts()).toEqual(ALL)
    unmount()
    expect(counts(), 'drag listeners leaked past unmount mid-drag').toEqual(NONE)
  })
})
