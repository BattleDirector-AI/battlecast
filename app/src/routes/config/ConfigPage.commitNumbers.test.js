import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` typed number fields apply on commit (overlay-config.md rules 44-44c): keystrokes
 * (`input` events) change nothing in the config, the preview or what Save writes; a commit
 * (`change` - Enter or blur) applies the value through its normal clamp and the field then
 * shows the stored value; a blank commit, a value normalization would replace with its default,
 * and Escape write nothing; arrow and spinner steps and sliders stay live. The
 * companion server is mocked "present" so Save runs and the written config is inspectable. */
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
  vi.useRealTimers()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

/* Every typed number field rule 44 lists: its test id, where its value lives in a saved
 * profile, its default, and a valid non-default value to commit. */
const FIELDS = [
  { id: 'x-tower', read: (c) => c.widgets.tower.x, initial: 24, next: 100 },
  { id: 'y-tower', read: (c) => c.widgets.tower.y, initial: 24, next: 50 },
  { id: 'w-tower', read: (c) => c.widgets.tower.w, initial: 380, next: 400 },
  { id: 'h-tower', read: (c) => c.widgets.tower.h, initial: 900, next: 800 },
  { id: 'z-tower', read: (c) => c.widgets.tower.z, initial: 1, next: 9 },
  { id: 'idle-grace-battle', read: (c) => c.widgets.battle.idleGraceSeconds, initial: 5, next: 8 },
  { id: 'dwell-driver', read: (c) => c.widgets.driver.dwellSeconds, initial: 6, next: 9 },
  { id: 'per-page-seconds-tower', read: (c) => c.widgets.tower.cycle.perPageSeconds, initial: 8, next: 12 },
  { id: 'pin-top-tower', read: (c) => c.widgets.tower.cycle.pinTop, initial: 3, next: 5 },
  { id: 'per-slot', read: (c) => c.logoRotation.perSlotSeconds, initial: 8, next: 12 },
  { id: 'canvas-w', read: (c) => c.canvas.w, initial: 1920, next: 1600 },
  { id: 'canvas-h', read: (c) => c.canvas.h, initial: 1080, next: 900 },
]

const field = (c, id) => {
  const el = c.querySelector(`[data-testid="${id}"]`)
  expect(el, `no ${id} field`).toBeTruthy()
  return el
}
const slot = (c) => c.querySelector('[data-testid="widget-tower"]')

/** Type `text` as a sequence of keystrokes - one `input` per prefix - without committing. */
async function typeKeys(el, text) {
  for (let i = 1; i <= text.length; i++) {
    await fireEvent.input(el, { target: { value: text.slice(0, i) } })
    await tick()
  }
}

async function commit(el) {
  await fireEvent.change(el)
  await tick()
}

/** Press Save and return the config it wrote. */
async function saved(c) {
  await fireEvent.click(c.querySelector('[data-testid="save"]'))
  await settle()
  const calls = vi.mocked(api.saveProfile).mock.calls
  expect(calls.length, 'Save wrote nothing').toBeGreaterThan(0)
  return calls[calls.length - 1][1]
}

describe('config editor: typed number fields apply on commit', () => {
  it.each(FIELDS)('$id: keystrokes write nothing; the commit applies the value', async (f) => {
    const { container } = render(ConfigPage)
    await settle()
    const el = field(container, f.id)

    // Fake timers, advanced well past any plausible debounce: a build that applies keystrokes
    // after a delay is still applying them before the commit, which rule 44 forbids.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await typeKeys(el, String(f.next))
    await vi.advanceTimersByTimeAsync(1000)
    vi.useRealTimers()
    expect(el.value, 'the field must show what is being typed').toBe(String(f.next))
    expect(f.read(await saved(container)), 'an uncommitted keystroke reached the config').toBe(f.initial)

    await commit(el)
    expect(f.read(await saved(container))).toBe(f.next)
    expect(el.value).toBe(String(f.next))
  })

  it('keystrokes in x/y/w/h leave the preview where it was until the commit', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const edits = [
      ['x-tower', '100', 'left'],
      ['y-tower', '50', 'top'],
      ['w-tower', '400', 'width'],
      ['h-tower', '800', 'height'],
    ]
    const before = { left: '24px', top: '24px', width: '380px', height: '900px' }
    for (const [prop, px] of Object.entries(before)) expect(slot(container).style[prop]).toBe(px)

    for (const [id, text, prop] of edits) {
      await typeKeys(field(container, id), text)
      expect(slot(container).style[prop], `${id} moved the preview before commit`).toBe(before[prop])
    }
    for (const [id, text, prop] of edits) {
      await commit(field(container, id))
      expect(slot(container).style[prop]).toBe(`${text}px`)
    }
  })

  it('typing w past 1900 and correcting it to 190 never moves x through the keep-on-canvas clamp', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const w = field(container, 'w-tower')
    const x = field(container, 'x-tower')

    // 1 -> 19 -> 190 -> 1900, then backspace to 190. A live 1900 would clamp x to 1920-1900 = 20.
    for (const text of ['1', '19', '190', '1900', '190']) {
      await fireEvent.input(w, { target: { value: text } })
      await tick()
      expect(x.value, `x moved while w read ${text}`).toBe('24')
      expect(slot(container).style.left, `preview x moved while w read ${text}`).toBe('24px')
    }
    await commit(w)

    const tower = (await saved(container)).widgets.tower
    expect(tower.w).toBe(190)
    expect(tower.x).toBe(24)
    expect(x.value).toBe('24')
    expect(slot(container).style.left).toBe('24px')
  })

  it.each(FIELDS)('$id: committing a blank field keeps the stored value and shows it again', async (f) => {
    const { container } = render(ConfigPage)
    await settle()
    const el = field(container, f.id)
    // Commit a non-default value first, so "kept" cannot be confused with "reset to default".
    await fireEvent.input(el, { target: { value: String(f.next) } })
    await commit(el)
    expect(f.read(await saved(container))).toBe(f.next)

    await fireEvent.input(el, { target: { value: '' } })
    await tick()
    await commit(el)

    const value = f.read(await saved(container))
    expect(value, 'a blank commit wrote 0').not.toBe(0)
    expect(value, 'a blank commit did not keep the stored value').toBe(f.next)
    expect(el.value, 'the field must show the stored value again').toBe(String(f.next))
  })

  it('an out-of-range commit applies the existing clamp, and the field shows the clamped value', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const cases = [
      // keep-on-canvas: x <= canvas.w - w = 1920 - 380
      { id: 'x-tower', typed: '5000', stored: 1540, read: (c) => c.widgets.tower.x },
      // exit grace is clamped to [0, 30] (rule 36)
      { id: 'idle-grace-battle', typed: '45', stored: 30, read: (c) => c.widgets.battle.idleGraceSeconds },
      // canvas edge minimum 320 (rule 9)
      { id: 'canvas-w', typed: '100', stored: 320, read: (c) => c.canvas.w },
      // pinTop is kept whole by rounding down (rule 12's normalization)
      { id: 'pin-top-tower', typed: '4.7', stored: 4, read: (c) => c.widgets.tower.cycle.pinTop },
    ]
    for (const k of cases) {
      const el = field(container, k.id)
      await typeKeys(el, k.typed)
      expect(el.value, `${k.id} was rewritten while typing`).toBe(k.typed)
      await commit(el)
      expect(k.read(await saved(container))).toBe(k.stored)
      expect(el.value, `${k.id} does not show the clamped value`).toBe(String(k.stored))
    }
  })

  it('a commit normalization would replace with the default is refused: the stored value is kept', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const cases = [
      // dwell and seconds per page must be above 0; pinTop must be at least 0
      { id: 'dwell-driver', next: 9, typed: '0', read: (c) => c.widgets.driver.dwellSeconds },
      { id: 'per-page-seconds-tower', next: 12, typed: '0', read: (c) => c.widgets.tower.cycle.perPageSeconds },
      { id: 'pin-top-tower', next: 5, typed: '-2', read: (c) => c.widgets.tower.cycle.pinTop },
    ]
    for (const k of cases) {
      const el = field(container, k.id)
      // Commit a non-default value first, so "kept" cannot pass as "reset to the default".
      await fireEvent.input(el, { target: { value: String(k.next) } })
      await commit(el)
      expect(k.read(await saved(container))).toBe(k.next)

      await typeKeys(el, k.typed)
      await commit(el)
      expect(k.read(await saved(container)), `${k.id} ${k.typed} was not refused`).toBe(k.next)
      expect(el.value, `${k.id} does not show the kept value`).toBe(String(k.next))
    }
  })

  it('Escape discards the uncommitted text, and leaving the field afterwards writes nothing', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const x = field(container, 'x-tower')

    await typeKeys(x, '250')
    await fireEvent.keyDown(x, { key: 'Escape' })
    await tick()
    expect(x.value, 'Escape did not restore the stored value').toBe('24')

    await commit(x)
    expect((await saved(container)).widgets.tower.x).toBe(24)
    expect(slot(container).style.left).toBe('24px')
  })

  it('an Up/Down arrow-key step applies at once with no change event, and typing after it does not', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const x = field(container, 'x-tower')

    // The sequence Firefox produces for a keyboard step: keydown, the browser steps the value
    // and fires `input`, keyup - and no `change` until blur.
    async function arrow(key, value) {
      await fireEvent.keyDown(x, { key })
      await fireEvent.input(x, { target: { value } })
      await fireEvent.keyUp(x, { key })
      await tick()
    }
    await arrow('ArrowUp', '25')
    expect(slot(container).style.left, 'ArrowUp step did not apply').toBe('25px')
    await arrow('ArrowUp', '26')
    expect(slot(container).style.left).toBe('26px')
    await arrow('ArrowDown', '25')
    expect(slot(container).style.left, 'ArrowDown step did not apply').toBe('25px')
    expect((await saved(container)).widgets.tower.x).toBe(25)

    // A typed digit right after a step is ordinary typing again: not applied until commit.
    await fireEvent.keyDown(x, { key: '0' })
    await fireEvent.input(x, { target: { value: '250' } })
    await fireEvent.keyUp(x, { key: '0' })
    await tick()
    expect(slot(container).style.left, 'a keystroke after a step applied without a commit').toBe('25px')
    await commit(x)
    expect(slot(container).style.left).toBe('250px')
  })

  it('a spinner click (input + change together) applies at once', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const x = field(container, 'x-tower')
    const dwell = field(container, 'dwell-driver')

    // A spinner click fires `input` then `change` for each step.
    for (const v of ['25', '26']) {
      await fireEvent.input(x, { target: { value: v } })
      await commit(x)
      expect(slot(container).style.left).toBe(`${v}px`)
    }
    await fireEvent.input(dwell, { target: { value: '7' } })
    await commit(dwell)
    expect((await saved(container)).widgets.driver.dwellSeconds).toBe(7)
  })

  it('the plate-opacity slider still applies on every input, with no commit', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const slider = field(container, 'plate-alpha-tower')
    expect(slider.type).toBe('range')

    await fireEvent.input(slider, { target: { value: '0.4' } })
    await tick()
    expect(container.querySelector('[data-testid="plate-alpha-value-tower"]').textContent.trim()).toBe('0.40')
    expect(slot(container).style.getPropertyValue('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 0.4)')
    expect((await saved(container)).widgets.tower.plateAlpha).toBe(0.4)
  })

  it('at a bigger text size, keystrokes in w never move x; the commit moves the origin once', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await fireEvent.change(field(container, 'text-scale-tower'), { target: { value: 'large' } })
    await tick()
    const w = field(container, 'w-tower')
    const x = field(container, 'x-tower')
    expect(w.value).toBe('437')

    for (const text of ['1', '19', '190', '1900', '500']) {
      await fireEvent.input(w, { target: { value: text } })
      await tick()
      expect(x.value, `x moved while w read ${text}`).toBe('24')
    }
    await commit(w)
    let tower = (await saved(container)).widgets.tower
    expect(tower.x).toBe(24)
    expect(tower.w).toBe(500)
    expect(tower.textScaleOrigin).toEqual({ x: 24, w: 435 }) // round(500 / 1.15)

    // Back to normal lands at the committed geometry, not at anything typed on the way.
    await fireEvent.change(field(container, 'text-scale-tower'), { target: { value: 'normal' } })
    await tick()
    tower = (await saved(container)).widgets.tower
    expect(tower.x).toBe(24)
    expect(tower.w).toBe(435)
  })

  it('Enter commits on its own keydown, with no change event; Shift+Enter too; not mid-IME', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const x = field(container, 'x-tower')
    const y = field(container, 'y-tower')
    const h = field(container, 'h-tower')

    await typeKeys(x, '100')
    expect(slot(container).style.left, 'x applied before Enter').toBe('24px')
    await fireEvent.keyDown(x, { key: 'Enter' })
    await tick()
    expect(slot(container).style.left, 'Enter did not commit x').toBe('100px')
    expect(x.value).toBe('100')

    await typeKeys(y, '50')
    await fireEvent.keyDown(y, { key: 'Enter', shiftKey: true })
    await tick()
    expect(slot(container).style.top, 'Shift+Enter did not commit y').toBe('50px')

    // An Enter that ends an IME composition belongs to the composition.
    await typeKeys(h, '800')
    await fireEvent.keyDown(h, { key: 'Enter', isComposing: true })
    await tick()
    expect(slot(container).style.height, 'an IME Enter committed h').toBe('900px')

    const tower = (await saved(container)).widgets.tower
    expect(tower.x).toBe(100)
    expect(tower.y).toBe(50)
    expect(tower.h).toBe(900)
  })

  it('Enter then change then blur is one commit: one rule 41a edit at a bigger text size', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await fireEvent.change(field(container, 'text-scale-tower'), { target: { value: 'large' } })
    await tick()
    const w = field(container, 'w-tower')
    const x = field(container, 'x-tower')

    await typeKeys(w, '500')
    expect(slot(container).style.width, 'w applied before Enter').toBe('437px')
    await fireEvent.keyDown(w, { key: 'Enter' })
    await commit(w)
    await fireEvent.blur(w)
    await tick()
    await typeKeys(x, '100')
    expect(slot(container).style.left, 'x applied before Enter').toBe('24px')
    await fireEvent.keyDown(x, { key: 'Enter' })
    await commit(x)
    await fireEvent.blur(x)
    await tick()

    let tower = (await saved(container)).widgets.tower
    expect(tower.w).toBe(500)
    expect(tower.x).toBe(100)
    expect(tower.textScaleOrigin).toEqual({ x: 100, w: 435 }) // round(500 / 1.15)
    expect(w.value).toBe('500')
    expect(x.value).toBe('100')

    await fireEvent.change(field(container, 'text-scale-tower'), { target: { value: 'normal' } })
    await tick()
    tower = (await saved(container)).widgets.tower
    expect(tower.x).toBe(100)
    expect(tower.w).toBe(435)
  })

  it('Enter on a blank or refused value keeps the stored value, like any other commit', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const dwell = field(container, 'dwell-driver')
    const x = field(container, 'x-tower')
    await fireEvent.input(dwell, { target: { value: '9' } })
    await commit(dwell)
    await fireEvent.input(x, { target: { value: '100' } })
    await commit(x)

    for (const [el, typed] of [
      [dwell, ''],
      [dwell, '0'],
      [x, ''],
    ]) {
      await fireEvent.input(el, { target: { value: typed } })
      await fireEvent.keyDown(el, { key: 'Enter' })
      await tick()
      expect(el.value, `Enter on '${typed}' did not show the stored value`).toBe(el === x ? '100' : '9')
    }
    const c = await saved(container)
    expect(c.widgets.driver.dwellSeconds, 'Enter on a blank or 0 dwell wrote it').toBe(9)
    expect(c.widgets.tower.x, 'Enter on a blank x wrote it').toBe(100)
  })
})
