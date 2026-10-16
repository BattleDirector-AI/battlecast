import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` text-size preset (overlay-config.md rules 40-41, ADR 0015): a select of the
 * three presets on every text-rendering widget, with help copy; changing it rescales that
 * widget's width by the factor ratio so the bigger text keeps its proportions. The
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
import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
import { FIELD_HELP } from '../../lib/configHelp.js'

const TEXT_WIDGETS = ['tower', 'battle', 'driver', 'qualifying', 'racecontrol', 'onboard']

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

async function pick(container, key, preset) {
  const select = container.querySelector(`[data-testid="text-scale-${key}"]`)
  expect(select, `no text-size control for ${key}`).toBeTruthy()
  await fireEvent.change(select, { target: { value: preset } })
  await tick()
}

const widthInput = (container, key) => container.querySelector(`[data-testid="w-${key}"]`)

describe('config editor: per-widget text size', () => {
  it('gives every text-rendering widget a three-preset select at normal, and logos none', async () => {
    const { container } = render(ConfigPage)
    await settle()

    for (const key of TEXT_WIDGETS) {
      const select = container.querySelector(`[data-testid="text-scale-${key}"]`)
      expect(select, `no text-size control for ${key}`).toBeTruthy()
      expect(select.tagName).toBe('SELECT')
      expect([...select.options].map((o) => o.value)).toEqual(['normal', 'large', 'larger'])
      expect(select.value).toBe('normal')
    }
    expect(container.querySelector('[data-testid="text-scale-logos"]')).toBeNull()
  })

  it('rescales the tower width with the preset: 380 -> 437 -> 494 -> 380, x/y/h untouched', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const d = DEFAULT_CONFIG.widgets.tower
    expect(Number(widthInput(container, 'tower').value)).toBe(380)

    await pick(container, 'tower', 'large')
    expect(Number(widthInput(container, 'tower').value)).toBe(437)
    // The live preview slot follows the edited geometry.
    expect(container.querySelector('[data-testid="widget-tower"]').style.width).toBe('437px')

    await pick(container, 'tower', 'larger')
    expect(Number(widthInput(container, 'tower').value)).toBe(494)

    await pick(container, 'tower', 'normal')
    expect(Number(widthInput(container, 'tower').value)).toBe(380)

    for (const f of ['x', 'y', 'h']) {
      expect(Number(container.querySelector(`[data-testid="${f}-tower"]`).value), f).toBe(d[f])
    }
  })

  it('rescales only the widget whose preset changed', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const battleW = Number(widthInput(container, 'battle').value)
    await pick(container, 'tower', 'larger')
    expect(Number(widthInput(container, 'battle').value)).toBe(battleW)
  })

  it('round-trips the preset and the widened width into the saved profile', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await pick(container, 'tower', 'larger')
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.widgets.tower.textScale).toBe('larger')
    expect(saved.widgets.tower.w).toBe(494)
    expect(saved.widgets.battle.textScale).toBe('normal')
  })

  it('explains the control in the UI on every widget that offers it', async () => {
    const { container } = render(ConfigPage)
    await settle()

    for (const key of TEXT_WIDGETS) {
      const btn = container.querySelector(`[data-testid="help-text-scale-${key}"]`)
      expect(btn, `no text-size help for ${key}`).toBeTruthy()
      await fireEvent.click(btn)
      await tick()
      const pop = container.querySelector(`[data-testid="help-text-scale-${key}-text"]`)
      expect(pop, `text-size help for ${key} did not open`).toBeTruthy()
      expect(pop.textContent.trim()).toBe(FIELD_HELP.textScale)
      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }
    // The copy has to warn about the width change, or rule 41 surprises the broadcaster.
    expect(FIELD_HELP.textScale.toLowerCase()).toMatch(/wid/)
  })
})
