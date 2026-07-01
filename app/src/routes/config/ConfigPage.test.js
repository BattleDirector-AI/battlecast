import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import ConfigPage from './ConfigPage.svelte'
import AllView from '../all/AllView.svelte'
import { DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'
import * as editor from '../../lib/configEditor.js'
import snapshot from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Capture what `/all` actually renders for each widget slot: geometry + logo. */
function renderedSlots(container) {
  return Array.from(container.querySelectorAll('[data-testid^="widget-"]')).map((el) => ({
    key: el.getAttribute('data-widget'),
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
    z: el.style.zIndex,
    logo: el.querySelector('[data-testid="logo-image"]')?.getAttribute('src') ?? null,
  }))
}

describe('config round-trip (the #34 acceptance)', () => {
  it('save → reload produces an identical /all render', () => {
    // Author a non-trivial layout with the same editor ops the UI uses.
    let cfg = normalizeConfig(DEFAULT_CONFIG)
    cfg = editor.setWidgetVisible(cfg, 'battle', false)
    // Resize before move so the target position isn't clamped by the old height.
    cfg = editor.resizeWidget(cfg, 'tower', 400, 700)
    cfg = editor.moveWidget(cfg, 'tower', 100, 200)
    cfg = editor.addLogoImage(cfg, '/logos/a.png')
    cfg = editor.addLogoImage(cfg, '/logos/b.png')
    cfg = editor.setWidgetVisible(cfg, 'logos', true)

    // "Save" is JSON persistence; "reload" is fetch + normalizeConfig.
    const reloaded = normalizeConfig(JSON.parse(JSON.stringify(cfg)))

    const authored = render(AllView, { snapshot, config: cfg })
    const before = renderedSlots(authored.container)
    cleanup()
    const restored = render(AllView, { snapshot, config: reloaded })
    const after = renderedSlots(restored.container)

    expect(after).toEqual(before)
    // Sanity: the authored layout is actually the non-default one we built.
    expect(before.find((s) => s.key === 'tower')).toMatchObject({ left: '100px', top: '200px' })
    expect(before.some((s) => s.key === 'battle')).toBe(false) // hidden
    expect(before.find((s) => s.key === 'logos')?.logo).toBe('/logos/a.png')
  })
})

describe('ConfigPage editor wiring', () => {
  it('hiding a widget removes it from the live preview', async () => {
    const { container, getByTestId } = render(ConfigPage)
    await tick()
    expect(container.querySelector('[data-testid="widget-battle"]')).not.toBeNull()

    await fireEvent.click(getByTestId('visible-battle'))
    await tick()
    expect(container.querySelector('[data-testid="widget-battle"]')).toBeNull()
  })

  it('editing a widget coordinate moves it in the preview', async () => {
    const { container, getByTestId } = render(ConfigPage)
    await tick()

    await fireEvent.input(getByTestId('x-tower'), { target: { value: '250' } })
    await tick()
    expect(container.querySelector('[data-testid="widget-tower"]').style.left).toBe('250px')
  })

  it('editing the producer src updates the OBS URL', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()

    await fireEvent.input(getByTestId('producer-src'), { target: { value: 'http://p:8/events' } })
    await tick()
    expect(getByTestId('obs-url').textContent).toContain('src=http%3A%2F%2Fp%3A8%2Fevents')
  })

  it('shows the empty rotation state until an image is added', async () => {
    const { getByTestId, queryByTestId } = render(ConfigPage)
    await tick()
    expect(getByTestId('rotation-empty')).toBeTruthy()
    // Enabling logos + a producer doesn't add images; rotation stays empty.
    expect(queryByTestId('remove-logo')).toBeNull()
  })
})
