import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* SPEC-FIRST (#197): encodes `.ai/spec/what/overlay-config.md` rules 32-33 — the /config editor's
 * Class Colors section is freeform (any class string, no seeded/curated rows), applies live to the
 * preview, and round-trips through save/reload. RED until the section exists.
 *
 * The companion server is mocked "present" so the Save path runs and the config that actually gets
 * written is inspectable — mirrors ConfigPage.plate.test.js. */
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
import { normalizeConfig } from '../../lib/overlayConfig.js'
import { resolveFallbackColor } from '../../design/classMeta.js'
import { FIELD_HELP } from '../../lib/configHelp.js'

// The editor holds a producer feed connection open for its status readout (#158);
// happy-dom has no EventSource. Stub the shared double so mounting is inert here.
beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** Settle onMount → serverAvailable → listProfiles → listLogos. */
async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

/** Drive the "add a class color" form: type a class name, pick a color, submit. */
async function addClassColor(container, className, hex) {
  const name = container.querySelector('[data-testid="class-color-new-name"]')
  expect(name, 'no class-color-new-name field to add through').toBeTruthy()
  const picker = container.querySelector('[data-testid="class-color-new-picker"]')
  expect(picker, 'no class-color-new-picker field to add through').toBeTruthy()
  const addBtn = container.querySelector('[data-testid="class-color-add"]')
  expect(addBtn, 'no class-color-add button to submit through').toBeTruthy()
  await fireEvent.input(name, { target: { value: className } })
  await fireEvent.input(picker, { target: { value: hex } })
  await fireEvent.click(addBtn)
  await tick()
}

describe('config editor: class color overrides — freeform, no seeded rows', () => {
  it('renders the Class Colors section with no rows and no fixed/curated list', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(container.querySelector('[data-testid="class-colors-section"]'), 'no Class Colors section').toBeTruthy()
    expect(container.querySelectorAll('[data-testid^="class-color-row-"]')).toHaveLength(0)
    // The add form itself accepts any typed string — it is not a picker over a fixed list.
    const name = container.querySelector('[data-testid="class-color-new-name"]')
    expect(name, 'no freeform class-name field').toBeTruthy()
    expect(name.tagName).toBe('INPUT')
    expect(name.type).toBe('text')
    const picker = container.querySelector('[data-testid="class-color-new-picker"]')
    expect(picker, 'no color picker').toBeTruthy()
    expect(picker.type).toBe('color')
  })

  it('adding a class none of the five curated classes cover produces a row', async () => {
    const { container } = render(ConfigPage)
    await settle()

    await addClassColor(container, 'GTE', '#abcdef')

    const row = container.querySelector('[data-testid="class-color-row-gte"]')
    expect(row, 'no row for the newly-added class').toBeTruthy()
    expect(row.textContent).toContain('GTE')
    const picker = container.querySelector('[data-testid="class-color-picker-gte"]')
    expect(picker.value).toBe('#abcdef')
  })

  it('recolors the live preview immediately — the fixture field is all class "F1"', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const classbar = () =>
      container.querySelector('[data-testid="widget-tower"] [data-testid="tower-row"] .row__classbar')
    const before = classbar().style.background
    // Before any override, F1 (not one of the five curated classes) already reads the
    // ADR-0009 deterministic default — pin that this test's baseline is real, not blank.
    expect(before).toBe(resolveFallbackColor('F1').hex)

    await addClassColor(container, 'F1', '#123456')

    expect(classbar().style.background).toBe('#123456')
    // A chip inside that same row picks it up too, not just the bar strip.
    const chip = container.querySelector('[data-testid="widget-tower"] [data-testid="tower-row"] .bc-class-chip')
    expect(chip.style.borderColor).toBe('#123456')
  })

  it('removing a row returns that class to its deterministic default in the preview', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await addClassColor(container, 'F1', '#123456')

    const classbar = () =>
      container.querySelector('[data-testid="widget-tower"] [data-testid="tower-row"] .row__classbar')
    expect(classbar().style.background).toBe('#123456')

    await fireEvent.click(container.querySelector('[data-testid="class-color-remove-f1"]'))
    await tick()

    expect(container.querySelector('[data-testid="class-color-row-f1"]')).toBeNull()
    expect(classbar().style.background).toBe(resolveFallbackColor('F1').hex)
  })

  it('editing an existing row\'s picker updates that class live, without adding a second row', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await addClassColor(container, 'F1', '#123456')

    const picker = container.querySelector('[data-testid="class-color-picker-f1"]')
    await fireEvent.input(picker, { target: { value: '#654321' } })
    await tick()

    expect(container.querySelectorAll('[data-testid^="class-color-row-"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-testid="widget-tower"] [data-testid="tower-row"] .row__classbar').style
        .background,
    ).toBe('#654321')
  })

  it('round-trips added overrides into the saved profile and back out on reload', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await addClassColor(container, 'F1', '#123456')
    await addClassColor(container, 'GTE', '#abcdef')

    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.theme.classColors).toEqual({ f1: '#123456', gte: '#abcdef' })

    const reloaded = normalizeConfig(JSON.parse(JSON.stringify(saved)))
    expect(reloaded.theme.classColors).toEqual({ f1: '#123456', gte: '#abcdef' })
  })

  it('has help copy for the class-color control, hidden until asked', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(container.querySelector('[data-testid="help-class-colors-text"]')).toBeNull()
    const btn = container.querySelector('[data-testid="help-class-colors"]')
    expect(btn, 'no help affordance for the Class Colors section').toBeTruthy()

    await fireEvent.click(btn)
    await tick()
    const pop = container.querySelector('[data-testid="help-class-colors-text"]')
    expect(pop, 'class-colors help did not open').toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.classColors)
  })
})
