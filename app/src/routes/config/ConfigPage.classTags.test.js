import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the overlay-wide class-tag setting (overlay-config.md rule 48, widgets.md
 * rule 60, ADR 0022): one three-option select, in no widget row, with its own help copy, that
 * drives the live preview and round-trips into the saved profile without touching geometry or
 * the class colors. The preview's sample snapshot carries no `session.multiclass`, so `auto`
 * shows the tags there and `hide` removes them. The companion server is mocked "present" so the
 * Save path runs and the written config is inspectable. */
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

const select = (c) => c.querySelector('[data-testid="class-tags"]')
const previewTowerRows = (c) =>
  c.querySelectorAll('[data-testid="preview-stage"] [data-testid="widget-tower"] [data-testid="tower-row"]').length
const previewTowerChips = (c) =>
  Array.from(c.querySelectorAll('[data-testid="preview-stage"] [data-testid="widget-tower"] .bc-class-chip'))

describe('config editor: class tags', () => {
  it('offers one "class tags" select, auto / show / hide, at the auto default — in no widget row', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const el = select(container)
    expect(el, 'no class-tags control').toBeTruthy()
    expect(el.tagName).toBe('SELECT')
    expect(Array.from(el.options).map((o) => o.value)).toEqual(['auto', 'show', 'hide'])
    expect(el.value).toBe('auto')
    expect(el.closest('label')?.textContent).toMatch(/class tags/i)
    expect(container.querySelectorAll('[data-testid="class-tags"]')).toHaveLength(1)
    // Overlay-wide: not inside any widget's editor row.
    expect(container.querySelectorAll('fieldset.widget-row').length, 'guard: widget rows render').toBeGreaterThan(0)
    expect(el.closest('fieldset.widget-row'), 'the control sits inside a widget row').toBeNull()
    for (const key of WIDGET_KEYS) {
      expect(container.querySelector(`[data-testid="class-tags-${key}"]`), `${key} got its own control`).toBeNull()
    }
  })

  it('drives the live preview: hide removes the tower’s class chips, auto brings them back', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const before = previewTowerChips(container).length
    const rows = previewTowerRows(container)
    expect(before, 'guard: the preview tower shows class chips at auto').toBeGreaterThan(0)
    expect(rows, 'guard: the preview tower renders rows').toBeGreaterThan(0)

    const el = select(container)
    expect(el, 'no class-tags control').toBeTruthy()
    await fireEvent.change(el, { target: { value: 'hide' } })
    await settle()
    expect(previewTowerRows(container), 'hiding the tags must not empty the tower').toBe(rows)
    expect(previewTowerChips(container)).toHaveLength(0)

    await fireEvent.change(el, { target: { value: 'auto' } })
    await settle()
    expect(previewTowerChips(container)).toHaveLength(before)
  })

  it('saves the choice into theme.classTags and changes no geometry or class colors', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const el = select(container)
    expect(el, 'no class-tags control').toBeTruthy()
    await fireEvent.change(el, { target: { value: 'hide' } })
    await tick()
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.theme.classTags).toBe('hide')
    expect(saved.theme.classColors).toEqual({})
    expect(saved.widgets.tower.x).toBe(24)
    expect(saved.widgets.tower.w).toBe(400)
    for (const key of WIDGET_KEYS) expect(saved.widgets[key], key).not.toHaveProperty('classTags')
  })

  it('shows the saved value of a loaded profile', async () => {
    vi.mocked(api.listProfiles).mockResolvedValueOnce(['single-class'])
    vi.mocked(api.getProfile).mockResolvedValueOnce({
      configVersion: '1',
      name: 'single-class',
      theme: { classTags: 'show' },
      widgets: { tower: { x: 60 } },
    })
    const { container } = render(ConfigPage)
    await settle()
    await fireEvent.change(container.querySelector('[data-testid="load"]'), { target: { value: 'single-class' } })
    await settle()

    // The profile really loaded (guards this test's own setup, independent of the control).
    expect(container.querySelector('[data-testid="widget-tower"]').style.left).toBe('60px')
    const el = select(container)
    expect(el, 'no class-tags control').toBeTruthy()
    expect(el.value).toBe('show')
  })

  it('explains the control in the UI', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(container.querySelector('[data-testid="help-class-tags-text"]')).toBeNull()
    const btn = container.querySelector('[data-testid="help-class-tags"]')
    expect(btn, 'no class-tags help').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = container.querySelector('[data-testid="help-class-tags-text"]')
    expect(pop, 'class-tags help did not open').toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.classTags)
  })
})
