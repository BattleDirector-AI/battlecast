import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the overlay-wide theme preset (overlay-config.md rule 62, ADR 0026): one
 * three-option select, in no widget row, labelled for a broadcaster, with its own help copy. The
 * live preview renders the chosen preset (the preview stage carries `data-theme`) while the
 * editor's own root stays un-themed, the preview's content does not change (rule 60: look only),
 * and Save writes `theme.preset` without touching geometry or the other theme keys. The companion
 * server is mocked "present" so the Save path runs and the written config is inspectable. */
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
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const select = (c) => c.querySelector('[data-testid="theme-preset"]')
const stage = (c) => c.querySelector('[data-testid="preview-stage"]')
const previewTower = (c) => c.querySelector('[data-testid="preview-stage"] [data-testid="widget-tower"]')
const editorRootTheme = () => document.documentElement.dataset.theme

describe('config editor: theme preset', () => {
  it('offers one "theme" select — Modern / Vintage 70s / Vintage 80s — at modern, in no widget row', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const el = select(container)
    expect(el, 'no theme-preset control').toBeTruthy()
    expect(el.tagName).toBe('SELECT')
    expect(Array.from(el.options).map((o) => o.value)).toEqual(['modern', 'vintage70', 'vintage80'])
    expect(Array.from(el.options).map((o) => o.textContent.trim())).toEqual(['Modern', 'Vintage 70s', 'Vintage 80s'])
    expect(el.value).toBe('modern')
    expect(el.closest('label')?.textContent).toMatch(/theme/i)
    expect(container.querySelectorAll('[data-testid="theme-preset"]')).toHaveLength(1)
    expect(container.querySelectorAll('fieldset.widget-row').length, 'guard: widget rows render').toBeGreaterThan(0)
    expect(el.closest('fieldset.widget-row'), 'the control sits inside a widget row').toBeNull()
  })

  it('themes the preview stage, not the editor, and changes no preview content', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(stage(container), 'guard: the preview stage renders').toBeTruthy()
    expect(stage(container).dataset.theme, 'the preview starts in the modern look').toBe('modern')
    const tower = previewTower(container)
    expect(tower, 'guard: the preview tower renders').toBeTruthy()
    const towerText = tower.textContent
    const towerRows = tower.querySelectorAll('[data-testid="tower-row"]').length
    expect(towerRows, 'guard: the preview tower has rows').toBeGreaterThan(0)

    const el = select(container)
    expect(el, 'no theme-preset control').toBeTruthy()
    for (const value of ['vintage70', 'vintage80', 'modern']) {
      await fireEvent.change(el, { target: { value } })
      await settle()
      expect(stage(container).dataset.theme, `preview after choosing ${value}`).toBe(value)
      expect(['modern', undefined], `editor root after choosing ${value}`).toContain(editorRootTheme())
      // Look only: the same rows with the same text in every preset.
      expect(previewTower(container).querySelectorAll('[data-testid="tower-row"]')).toHaveLength(towerRows)
      expect(previewTower(container).textContent, `preview tower text under ${value}`).toBe(towerText)
    }
  })

  it('saves the choice into theme.preset and changes no geometry, class colors or class tags', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const el = select(container)
    expect(el, 'no theme-preset control').toBeTruthy()
    await fireEvent.change(el, { target: { value: 'vintage80' } })
    await tick()
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.theme.preset).toBe('vintage80')
    expect(saved.theme.classColors).toEqual({})
    expect(saved.theme.classTags).toBe('auto')
    expect(saved.widgets.tower.x).toBe(24)
    expect(saved.widgets.tower.w).toBe(400)
    for (const key of WIDGET_KEYS) expect(saved.widgets[key], key).not.toHaveProperty('preset')
  })

  it('shows the saved value of a loaded profile, in the select and on the preview', async () => {
    vi.mocked(api.listProfiles).mockResolvedValueOnce(['retro-night'])
    vi.mocked(api.getProfile).mockResolvedValueOnce({
      configVersion: '1',
      name: 'retro-night',
      theme: { preset: 'vintage70' },
      widgets: { tower: { x: 60 } },
    })
    const { container } = render(ConfigPage)
    await settle()
    await fireEvent.change(container.querySelector('[data-testid="load"]'), { target: { value: 'retro-night' } })
    await settle()

    // The profile really loaded (guards this test's own setup, independent of the control).
    expect(container.querySelector('[data-testid="widget-tower"]').style.left).toBe('60px')
    const el = select(container)
    expect(el, 'no theme-preset control').toBeTruthy()
    expect(el.value).toBe('vintage70')
    expect(stage(container).dataset.theme).toBe('vintage70')
    expect(['modern', undefined], 'a loaded vintage profile themed the editor root').toContain(editorRootTheme())
  })

  it('explains the control in the UI', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(typeof FIELD_HELP.themePreset, 'no FIELD_HELP.themePreset copy').toBe('string')
    expect(container.querySelector('[data-testid="help-theme-preset-text"]')).toBeNull()
    const btn = container.querySelector('[data-testid="help-theme-preset"]')
    expect(btn, 'no theme-preset help').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = container.querySelector('[data-testid="help-theme-preset-text"]')
    expect(pop, 'theme-preset help did not open').toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.themePreset)
  })
})
