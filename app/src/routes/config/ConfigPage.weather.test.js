import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the weather box and the info panel's weather card (overlay-config.md rules
 * 56-57, ADR 0025): a `weather` row with a °F checkbox carrying its own help, plate opacity and
 * text size, no trigger or hide-when-idle; and on the `info` row a weather-card checkbox and a
 * °F checkbox, each with help. The preview shows the box with sample weather. The companion
 * server is mocked "present" so the Save path runs and the written config is inspectable (as
 * ConfigPage.infoPanel.test.js does). */
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
})

async function mountEditor() {
  const view = render(ConfigPage)
  for (let i = 0; i < 5; i++) await tick()
  return view.container
}
const q = (container, testid) => container.querySelector(`[data-testid="${testid}"]`)

async function saved(container) {
  await fireEvent.click(q(container, 'save'))
  await tick()
  expect(api.saveProfile).toHaveBeenCalledTimes(1)
  return vi.mocked(api.saveProfile).mock.calls[0][1].widgets
}

async function openHelp(container, testid) {
  const btn = q(container, testid)
  expect(btn, `no ${testid}`).toBeTruthy()
  await fireEvent.click(btn)
  await tick()
  const pop = q(container, `${testid}-text`)
  expect(pop, `${testid} did not open`).toBeTruthy()
  return pop.textContent.trim()
}

describe('config editor: the weather row (rule 56)', () => {
  it('offers a °F checkbox, unchecked at the c default, plus plate opacity and text size', async () => {
    const container = await mountEditor()
    const box = q(container, 'temp-f-weather')
    expect(box, 'no °F control for weather').toBeTruthy()
    expect(box.type).toBe('checkbox')
    expect(box.checked).toBe(false)
    expect(q(container, 'plate-alpha-weather'), 'no plate-opacity control for weather').toBeTruthy()
    expect(q(container, 'text-scale-weather'), 'no text-size control for weather').toBeTruthy()
  })

  it('offers no lower-third trigger and no hide-when-idle control', async () => {
    const container = await mountEditor()
    expect(q(container, 'temp-f-weather'), 'no weather row').toBeTruthy()
    expect(q(container, 'trigger-weather')).toBeNull()
    expect(q(container, 'hide-idle-weather')).toBeNull()
  })

  it('explains the °F checkbox behind its own ⓘ', async () => {
    const container = await mountEditor()
    expect((await openHelp(container, 'help-temp-f-weather')).length).toBeGreaterThan(0)
  })

  it('saves f when checked and c when cleared, and the preview box follows', async () => {
    const container = await mountEditor()
    const box = q(container, 'temp-f-weather')
    expect(box, 'no °F control for weather').toBeTruthy()
    const slot = q(container, 'widget-weather')
    expect(slot, 'no weather widget in the preview').toBeTruthy()
    const value = () => slot.querySelector('[data-testid="weather-air-value"]')?.textContent.trim() ?? ''
    expect(value()).toMatch(/°C$/)

    await fireEvent.click(box)
    await tick()
    expect(value(), 'the preview converts at once').toMatch(/°F$/)
    expect((await saved(container)).weather.tempUnit).toBe('f')
  })

  it('writes c again when the box is cleared', async () => {
    const container = await mountEditor()
    const box = q(container, 'temp-f-weather')
    expect(box, 'no °F control for weather').toBeTruthy()
    await fireEvent.click(box)
    await tick()
    await fireEvent.click(box)
    await tick()
    expect(box.checked).toBe(false)
    expect((await saved(container)).weather.tempUnit).toBe('c')
  })

  it('shows the box with sample weather in the preview', async () => {
    const container = await mountEditor()
    const slot = q(container, 'widget-weather')
    expect(slot, 'no weather widget in the preview').toBeTruthy()
    expect(slot.querySelector('[data-testid="weather-box"]'), 'the preview shows no weather box').toBeTruthy()
    expect(slot.querySelector('[data-testid="weather-air-value"]').textContent.trim()).toMatch(/^-?\d+°C$/)
  })
})

describe('config editor: the info row’s weather settings (rule 57)', () => {
  it('offers a weather card checkbox, unchecked by default, and a °F checkbox, each with help', async () => {
    const container = await mountEditor()
    const cardBox = q(container, 'weather-card-info')
    expect(cardBox, 'no weather card control on the info row').toBeTruthy()
    expect(cardBox.type).toBe('checkbox')
    expect(cardBox.checked).toBe(false)
    const unitBox = q(container, 'temp-f-info')
    expect(unitBox, 'no °F control on the info row').toBeTruthy()
    expect(unitBox.checked).toBe(false)
    expect((await openHelp(container, 'help-weather-card-info')).length).toBeGreaterThan(0)
    expect((await openHelp(container, 'help-temp-f-info')).length).toBeGreaterThan(0)
  })

  it('saves weatherCard true and tempUnit f, leaving the weather widget’s unit alone', async () => {
    const container = await mountEditor()
    expect(q(container, 'weather-card-info'), 'no weather card control on the info row').toBeTruthy()
    await fireEvent.click(q(container, 'weather-card-info'))
    await tick()
    await fireEvent.click(q(container, 'temp-f-info'))
    await tick()
    const widgets = await saved(container)
    expect(widgets.info.weatherCard).toBe(true)
    expect(widgets.info.tempUnit).toBe('f')
    expect(widgets.weather.tempUnit).toBe('c')
  })
})

describe('config editor: a first added line in the preview with the weather card on (rule 53)', () => {
  afterEach(() => vi.useRealTimers())

  /** Mount under fake timers, turn the info widget's weather card on, and return helpers. */
  async function withCardOn() {
    vi.useFakeTimers()
    const container = await mountEditor()
    const cardBox = q(container, 'weather-card-info')
    expect(cardBox, 'no weather card control on the info row').toBeTruthy()
    await fireEvent.click(cardBox) // the card joins the end of the preview's rotation
    await tick()
    const slot = q(container, 'widget-info')
    expect(slot, 'no info widget in the preview').toBeTruthy()
    const previewLine = () => slot.querySelector('[data-testid="info-line"]')?.textContent.trim() ?? null
    const advance = async (ms) => {
      vi.advanceTimersByTime(ms)
      await tick()
    }
    const add = async (text) => {
      await fireEvent.input(q(container, 'info-line-new'), { target: { value: text } })
      await fireEvent.click(q(container, 'info-line-add'))
      await tick()
    }
    const weatherBox = () => q(container, 'widget-weather')?.querySelector('[data-testid="weather-box"]') ?? null
    return { previewLine, advance, add, weatherBox }
  }

  it('keeps the sample card up for the rest of its dwell when a line is added under it, then shows the line', async () => {
    const { previewLine, advance, add, weatherBox } = await withCardOn()
    await advance(24000) // three sample lines, 8 s each: the card is up from 24 s
    expect(previewLine(), 'the sample weather card should be up').toMatch(/^AIR -?\d+°C/)

    await advance(3000) // t = 27 s
    await add('Follow us @battlecast') // the sample lines leave; the card stays listed
    expect(previewLine(), 'the card keeps its place').toMatch(/^AIR -?\d+°C/)
    expect(weatherBox(), 'the sample weather stays in the preview').not.toBeNull()
    await advance(4999) // t = 31.999 s
    expect(previewLine()).toMatch(/^AIR -?\d+°C/)
    await advance(1) // t = 32 s: the card's dwell, counted from 24 s
    expect(previewLine(), 'the new line follows the card').toBe('Follow us @battlecast')
  })

  it('shows a line added while a sample line is up at once', async () => {
    const { previewLine, advance, add, weatherBox } = await withCardOn()
    await advance(3000) // the first sample line is up
    expect(previewLine(), 'a sample line should be up').not.toMatch(/^AIR /)
    await add('Follow us @battlecast')
    expect(previewLine(), 'the broadcaster’s first line replaces the sample at once').toBe('Follow us @battlecast')
    expect(weatherBox(), 'the sample weather stays in the preview').not.toBeNull()
  })
})
