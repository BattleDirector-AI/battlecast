import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* SPEC-FIRST (#145): encodes `.ai/spec/what/overlay-config.md` rules 23-24 — the
 * /config editor exposes a plate-opacity control for each plate-rendering widget,
 * and withholding it from the others never rewrites their stored value. RED until
 * the editor surfaces the control.
 *
 * The companion server is mocked "present" so the Save path runs and the config
 * that actually gets written is inspectable. */
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
import * as api from '../../lib/configApi.js'
import { WIDGET_KEYS, normalizeConfig } from '../../lib/overlayConfig.js'

/** Rule 23's plate-rendering widgets: the six that paint one of the plate tokens
 *  (`--bc-plate` / `--bc-plate-dense` / `--bc-header`). `logos` composites its
 *  images straight over the video with no panel behind them. */
const PLATED = ['tower', 'battle', 'driver', 'qualifying', 'racecontrol', 'onboard']
const UNPLATED = WIDGET_KEYS.filter((key) => !PLATED.includes(key))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** Settle onMount → serverAvailable → listProfiles → listLogos. */
async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

describe('config editor: per-widget plate opacity', () => {
  it('gives every plate-rendering widget a 0-1 control at the 0.82 default, and no other widget one', async () => {
    const { container } = render(ConfigPage)
    await settle()

    for (const key of PLATED) {
      const input = container.querySelector(`[data-testid="plate-alpha-${key}"]`)
      expect(input, `no plate-opacity control for ${key}`).toBeTruthy()
      expect(input.type, `${key} control type`).toBe('range')
      expect(input.min, `${key} control min`).toBe('0')
      expect(input.max, `${key} control max`).toBe('1')
      expect(input.step, `${key} control step`).toBe('0.01')
      expect(Number(input.value), `${key} control value`).toBe(0.82)
      // The setting is readable as text, not inferred from a slider position.
      const readout = container.querySelector(`[data-testid="plate-alpha-value-${key}"]`)
      expect(readout, `no plate-opacity readout for ${key}`).toBeTruthy()
      expect(readout.textContent.trim(), `${key} readout`).toBe('0.82')
    }

    // Guards the classification itself: if a widget gains or loses a plate, this
    // list has to be revisited rather than silently drifting.
    expect(UNPLATED).toEqual(['logos'])
    for (const key of UNPLATED) {
      expect(
        container.querySelector(`[data-testid="plate-alpha-${key}"]`),
        `${key} paints no plate but got a control`,
      ).toBeNull()
      expect(container.querySelector(`[data-testid="plate-alpha-value-${key}"]`)).toBeNull()
    }
  })

  it('lowering the tower plate opacity dims the plate in the live preview and nothing else', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const slot = () => container.querySelector('[data-testid="widget-tower"]')
    const input = container.querySelector('[data-testid="plate-alpha-tower"]')
    expect(input, 'no plate-opacity control for tower').toBeTruthy()
    expect(slot().style.getPropertyValue('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 0.82)')

    await fireEvent.input(input, { target: { value: '0.4' } })
    await tick()

    expect(container.querySelector('[data-testid="plate-alpha-value-tower"]').textContent.trim()).toBe(
      '0.40',
    )
    // Rule 15: the three PLATE tokens move together (0.84·0.4/0.82 = 0.41;
    // 0.94·0.4/0.82 = 0.459) …
    expect(slot().style.getPropertyValue('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 0.4)')
    expect(slot().style.getPropertyValue('--bc-plate-dense')).toBe(
      'rgba(var(--bc-plate-dense-rgb), 0.41)',
    )
    expect(slot().style.getPropertyValue('--bc-header')).toBe('rgba(var(--bc-header-rgb), 0.459)')
    // … and nothing that draws text or a border is touched: this is deliberately
    // NOT element opacity, and the text/hairline tokens are left at their root values.
    expect(slot().style.opacity, 'plate opacity must not be element opacity').toBe('')
    expect(slot().style.getPropertyValue('--bc-text')).toBe('')
    expect(slot().style.getPropertyValue('--bc-hairline')).toBe('')
    // The tower still renders its running order at full strength.
    expect(slot().textContent).toContain('Verstappen')
    // A widget left alone keeps the default plate.
    expect(
      container.querySelector('[data-testid="widget-battle"]').style.getPropertyValue('--bc-plate'),
    ).toBe('rgba(var(--bc-plate-rgb), 0.82)')
  })

  it('round-trips the edited value into the saved profile', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const input = container.querySelector('[data-testid="plate-alpha-battle"]')
    expect(input, 'no plate-opacity control for battle').toBeTruthy()
    await fireEvent.input(input, { target: { value: '0.55' } })
    await tick()

    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.widgets.battle.plateAlpha).toBe(0.55)
    expect(saved.widgets.tower.plateAlpha).toBe(0.82)
    // Reloading that profile yields the saved plate, not the default.
    const reloaded = normalizeConfig(JSON.parse(JSON.stringify(saved)))
    expect(reloaded.widgets.battle.plateAlpha).toBe(0.55)
  })

  it('never rewrites the plate opacity of a widget it declines to show a control for', async () => {
    // Rule 24: a hand-authored `plateAlpha` on the un-plated widget survives a
    // load → edit → save cycle. Withholding the control is a UI decision, not a
    // config change.
    vi.mocked(api.listProfiles).mockResolvedValue(['busy-footage'])
    vi.mocked(api.getProfile).mockResolvedValue({
      configVersion: '1',
      name: 'busy-footage',
      widgets: { logos: { plateAlpha: 0.3 }, tower: { plateAlpha: 0.6 } },
    })

    const { container } = render(ConfigPage)
    await settle()

    await fireEvent.change(container.querySelector('[data-testid="load"]'), {
      target: { value: 'busy-footage' },
    })
    await settle()

    // The profile really loaded (guards this test's own setup, independent of the
    // control): the preview tower is already rendering the authored plate.
    expect(
      container.querySelector('[data-testid="widget-tower"]').style.getPropertyValue('--bc-plate'),
    ).toBe('rgba(var(--bc-plate-rgb), 0.6)')

    // The loaded value reaches the control the editor does show.
    const input = container.querySelector('[data-testid="plate-alpha-tower"]')
    expect(input, 'no plate-opacity control for tower').toBeTruthy()
    expect(Number(input.value)).toBe(0.6)
    expect(container.querySelector('[data-testid="plate-alpha-value-tower"]').textContent.trim()).toBe(
      '0.60',
    )

    await fireEvent.input(input, { target: { value: '0.7' } })
    await tick()
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.widgets.tower.plateAlpha).toBe(0.7)
    expect(saved.widgets.logos.plateAlpha, 'logos plate opacity was clobbered').toBe(0.3)
  })
})
