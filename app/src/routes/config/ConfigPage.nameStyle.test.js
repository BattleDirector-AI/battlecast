import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the tower's driver name style (overlay-config.md rule 43, ADR 0018): a
 * two-option select in the tower row only, with its own help copy (rules 16/19), that drives
 * the live preview and round-trips into the saved profile without touching geometry. The
 * companion server is mocked "present" so the Save path runs and the written config is
 * inspectable. */
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
import { WIDGET_KEYS } from '../../lib/overlayConfig.js'
import { FIELD_HELP } from '../../lib/configHelp.js'

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

const previewTower = (container) => container.querySelector('[data-testid="standings-tower"]')
const previewNames = (container) =>
  Array.from(previewTower(container).querySelectorAll('[data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )

describe('config editor: tower driver name style', () => {
  it('gives the tower row a "driver names" select, short then full, at the short default — and no other widget one', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const select = container.querySelector('[data-testid="name-style-tower"]')
    expect(select, 'no name-style control for tower').toBeTruthy()
    expect(select.tagName).toBe('SELECT')
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['short', 'full'])
    expect(select.value).toBe('short')
    expect(select.closest('label')?.textContent).toMatch(/driver names/)

    for (const key of WIDGET_KEYS.filter((k) => k !== 'tower')) {
      expect(
        container.querySelector(`[data-testid="name-style-${key}"]`),
        `${key} got a name-style control`,
      ).toBeNull()
    }
  })

  it('switches the live preview between short and full names', async () => {
    const { container } = render(ConfigPage)
    await settle()
    expect(previewTower(container)?.getAttribute('data-name-style')).toBe('short')
    expect(previewNames(container)).toContain('VER')

    const select = container.querySelector('[data-testid="name-style-tower"]')
    expect(select, 'no name-style control for tower').toBeTruthy()
    await fireEvent.change(select, { target: { value: 'full' } })
    await settle()
    expect(previewTower(container).getAttribute('data-name-style')).toBe('full')
    expect(previewNames(container)).toContain('Verstappen')
    expect(previewNames(container)).not.toContain('VER')

    await fireEvent.change(select, { target: { value: 'short' } })
    await settle()
    expect(previewTower(container).getAttribute('data-name-style')).toBe('short')
    expect(previewNames(container)).toContain('VER')
  })

  it('saves the choice into the profile and changes no geometry', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const select = container.querySelector('[data-testid="name-style-tower"]')
    expect(select, 'no name-style control for tower').toBeTruthy()
    await fireEvent.change(select, { target: { value: 'full' } })
    await tick()
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.widgets.tower.nameStyle).toBe('full')
    // Unlike a text-size preset, the style never widens or moves the widget.
    expect(saved.widgets.tower.x).toBe(24)
    expect(saved.widgets.tower.w).toBe(380)
  })

  it('explains the control in the UI', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(container.querySelector('[data-testid="help-name-style-tower-text"]')).toBeNull()
    const btn = container.querySelector('[data-testid="help-name-style-tower"]')
    expect(btn, 'no name-style help for tower').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = container.querySelector('[data-testid="help-name-style-tower-text"]')
    expect(pop, 'name-style help did not open').toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.nameStyle)
  })
})
