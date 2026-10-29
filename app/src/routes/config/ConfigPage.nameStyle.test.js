import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the driver name style once for the whole overlay (overlay-config.md rule
 * 43, ADR 0038): a two-option select in no widget row, with its own help copy (rules 16/19),
 * that re-renders every widget in the live preview and round-trips into the saved profile's
 * `theme.nameStyle` without touching geometry. The companion server is mocked "present" so the
 * Save path runs and the written config is inspectable. The preview's sample feed is
 * race-close-battle.json: Verstappen on camera (P2) between Hamilton and Leclerc. */
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

const select = (container) => container.querySelector('[data-testid="name-style"]')
const previewTower = (container) => container.querySelector('[data-testid="standings-tower"]')
const previewTowerNames = (container) =>
  Array.from(previewTower(container).querySelectorAll('[data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )
const previewText = (container, selector) =>
  container.querySelector(`[data-testid="preview-stage"] ${selector}`)?.textContent.trim()

describe('config editor: the overlay-wide driver name style (rule 43)', () => {
  it('has one "driver names" select, short then full, at the short default, in no widget row', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const el = select(container)
    expect(el, 'no overlay-wide name-style control').toBeTruthy()
    expect(el.tagName).toBe('SELECT')
    expect(Array.from(el.options).map((o) => o.value)).toEqual(['short', 'full'])
    expect(el.value).toBe('short')
    expect(el.closest('label')?.textContent).toMatch(/driver names/)
    expect(container.querySelectorAll('[data-testid="name-style"]')).toHaveLength(1)

    for (const key of WIDGET_KEYS) {
      expect(
        container.querySelector(`[data-testid="name-style-${key}"]`),
        `${key} still has a per-widget name-style control`,
      ).toBeNull()
    }
  })

  it('switches every previewed widget between short and full names', async () => {
    const { container } = render(ConfigPage)
    await settle()
    expect(previewTower(container)?.getAttribute('data-name-style')).toBe('short')
    expect(previewTowerNames(container)).toEqual(['HAM', 'VER', 'LEC', 'NOR'])
    expect(previewText(container, '.bc-battle__focus-name')).toBe('VER')
    expect(previewText(container, '.bc-battle__slot--ahead .bc-battle__slot-name')).toBe('HAM')
    expect(previewText(container, '.bc-battle__slot--behind .bc-battle__slot-name')).toBe('LEC')

    expect(select(container), 'no overlay-wide name-style control').toBeTruthy()
    await fireEvent.change(select(container), { target: { value: 'full' } })
    await settle()
    expect(previewTower(container).getAttribute('data-name-style')).toBe('full')
    expect(previewTowerNames(container)).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    expect(previewText(container, '.bc-battle__focus-name')).toBe('Verstappen')
    expect(previewText(container, '.bc-battle__slot--ahead .bc-battle__slot-name')).toBe('Hamilton')

    await fireEvent.change(select(container), { target: { value: 'short' } })
    await settle()
    expect(previewTowerNames(container)).toEqual(['HAM', 'VER', 'LEC', 'NOR'])
    expect(previewText(container, '.bc-battle__focus-name')).toBe('VER')
  })

  it("saves the choice into the profile's theme, on no widget, and changes no geometry or other theme setting", async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(select(container), 'no overlay-wide name-style control').toBeTruthy()
    await fireEvent.change(select(container), { target: { value: 'full' } })
    await tick()
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.theme.nameStyle).toBe('full')
    expect(saved.theme.classTags).toBe('auto')
    expect(saved.theme.preset).toBe('modern')
    for (const key of WIDGET_KEYS) expect(saved.widgets[key], key).not.toHaveProperty('nameStyle')
    // Unlike a text-size preset, the style never widens or moves a widget.
    expect(saved.widgets.tower.x).toBe(24)
    expect(saved.widgets.tower.w).toBe(400)
    expect(saved.widgets.battle.x).toBe(448)
    expect(saved.widgets.battle.w).toBe(440)
    expect(saved.widgets.updates.x).toBe(1376)
    expect(saved.widgets.updates.w).toBe(520)
  })

  it('explains the control in the UI', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(container.querySelector('[data-testid="help-name-style-text"]')).toBeNull()
    const btn = container.querySelector('[data-testid="help-name-style"]')
    expect(btn, 'no overlay-wide name-style help').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = container.querySelector('[data-testid="help-name-style-text"]')
    expect(pop, 'name-style help did not open').toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.nameStyle)
  })
})
