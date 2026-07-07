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
  vi.unstubAllGlobals()
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

  it('offers "hide when idle" only for widgets that support it', async () => {
    const { getByTestId, queryByTestId } = render(ConfigPage)
    await tick()
    // battle + logos support auto-hide; the tower (always meaningful) does not.
    expect(getByTestId('hide-idle-battle')).toBeTruthy()
    expect(getByTestId('hide-idle-logos')).toBeTruthy()
    expect(queryByTestId('hide-idle-tower')).toBeNull()
  })

  it('exposes trigger + dwell controls only for lower-third widgets', async () => {
    const { getByTestId, queryByTestId } = render(ConfigPage)
    await tick()
    // The driver lower-third gets the trigger knobs; geometry-only widgets do not.
    expect(getByTestId('trigger-driver')).toBeTruthy()
    expect(getByTestId('dwell-driver')).toBeTruthy()
    expect(queryByTestId('trigger-tower')).toBeNull()
    expect(queryByTestId('dwell-battle')).toBeNull()
  })

  it('exposes the class-display control only for the tower widget', async () => {
    const { getByTestId, queryByTestId } = render(ConfigPage)
    await tick()
    expect(getByTestId('class-display-tower')).toBeTruthy()
    expect(queryByTestId('class-display-battle')).toBeNull()
    expect(queryByTestId('class-display-driver')).toBeNull()
  })

  it('switching the tower class-display updates the live preview', async () => {
    const { container, getByTestId } = render(ConfigPage)
    await tick()
    const towerEl = () =>
      container.querySelector('[data-testid="widget-tower"] [data-testid="standings-tower"]')
    // Defaults to the inline layout.
    expect(getByTestId('class-display-tower').value).toBe('inline')
    expect(towerEl().getAttribute('data-class-display')).toBe('inline')

    await fireEvent.change(getByTestId('class-display-tower'), { target: { value: 'grouped' } })
    await tick()
    expect(getByTestId('class-display-tower').value).toBe('grouped')
    expect(towerEl().getAttribute('data-class-display')).toBe('grouped')
  })

  it('exposes the speed-unit checkbox only for the onboard widget', async () => {
    const { getByTestId, queryByTestId } = render(ConfigPage)
    await tick()
    expect(getByTestId('speed-mph-onboard')).toBeTruthy()
    expect(queryByTestId('speed-mph-tower')).toBeNull()
    expect(queryByTestId('speed-mph-battle')).toBeNull()
  })

  it('toggling the onboard speed-unit checkbox switches the live preview km/h <-> mph', async () => {
    const { container, getByTestId } = render(ConfigPage)
    await tick()
    const hudUnit = () =>
      container.querySelector('[data-testid="widget-onboard"] [data-testid="onboard-speed-unit"]')
    const hudSpeed = () =>
      container.querySelector('[data-testid="widget-onboard"] [data-testid="onboard-speed"]')

    // The preview renders the HUD (the editor sample carries telemetry) so the unit
    // choice is visible; defaults to km/h.
    expect(getByTestId('speed-mph-onboard').checked).toBe(false)
    expect(hudUnit().textContent).toBe('KM/H')
    expect(hudSpeed().textContent).toContain('247')

    await fireEvent.click(getByTestId('speed-mph-onboard'))
    await tick()
    expect(getByTestId('speed-mph-onboard').checked).toBe(true)
    expect(hudUnit().textContent).toBe('MPH')
    expect(hudSpeed().textContent).toContain('153') // 247 km/h -> 153 mph

    await fireEvent.click(getByTestId('speed-mph-onboard'))
    await tick()
    expect(getByTestId('speed-mph-onboard').checked).toBe(false)
    expect(hudUnit().textContent).toBe('KM/H')
  })

  it('exposes the driver-info + hand-off controls only for the onboard widget', async () => {
    const { getByTestId, queryByTestId } = render(ConfigPage)
    await tick()
    for (const field of ['name', 'number', 'class', 'make', 'model']) {
      expect(getByTestId(`driver-info-onboard-${field}`)).toBeTruthy()
      expect(queryByTestId(`driver-info-tower-${field}`)).toBeNull()
    }
    expect(getByTestId('wait-lower-third-onboard')).toBeTruthy()
    expect(queryByTestId('wait-lower-third-tower')).toBeNull()
  })

  it('toggling a driver-info field updates the on-board HUD preview', async () => {
    const { container, getByTestId } = render(ConfigPage)
    await tick()
    // make is off by default -> no car line in the preview HUD.
    expect(getByTestId('driver-info-onboard-make').checked).toBe(false)
    expect(container.querySelector('[data-testid="onboard-driver-car"]')).toBeNull()

    await fireEvent.click(getByTestId('driver-info-onboard-make'))
    await tick()
    expect(getByTestId('driver-info-onboard-make').checked).toBe(true)
    // The preview vehicle's make (Red Bull) now shows.
    expect(container.querySelector('[data-testid="onboard-driver-car"]').textContent).toContain(
      'Red Bull',
    )
  })

  it('defaults the hand-off (wait for lower-third) on, and toggles off', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()
    expect(getByTestId('wait-lower-third-onboard').checked).toBe(true)
    await fireEvent.click(getByTestId('wait-lower-third-onboard'))
    await tick()
    expect(getByTestId('wait-lower-third-onboard').checked).toBe(false)
  })

  it('switching the driver trigger to persistent disables the dwell input', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()
    expect(getByTestId('dwell-driver').disabled).toBe(false)

    await fireEvent.change(getByTestId('trigger-driver'), { target: { value: 'persistent' } })
    await tick()
    expect(getByTestId('trigger-driver').value).toBe('persistent')
    expect(getByTestId('dwell-driver').disabled).toBe(true)
  })

  it('editing the driver dwell seconds updates the config', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()
    await fireEvent.input(getByTestId('dwell-driver'), { target: { value: '9' } })
    await tick()
    expect(getByTestId('dwell-driver').value).toBe('9')
  })

  it('toggling "hide when idle" hides the battle box once it goes idle', async () => {
    // Preview uses a close-battle sample (active), so the box stays visible after
    // the toggle; the hide only takes effect on an idle snapshot (covered in AllView
    // tests). Here we assert the toggle wires through without error.
    const { container, getByTestId } = render(ConfigPage)
    await tick()
    await fireEvent.click(getByTestId('hide-idle-battle'))
    await tick()
    // Sample snapshot is an active battle, so the box remains in the preview.
    expect(container.querySelector('[data-testid="widget-battle"]')).not.toBeNull()
    expect(getByTestId('hide-idle-battle').checked).toBe(true)
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

  it('editing the canvas size (on change) resizes the preview stage without collapsing widgets', async () => {
    const { container, getByTestId } = render(ConfigPage)
    await tick()

    // Committed on `change`, not per-keystroke — a full value in one event.
    await fireEvent.change(getByTestId('canvas-w'), { target: { value: '1280' } })
    await fireEvent.change(getByTestId('canvas-h'), { target: { value: '720' } })
    await tick()

    // The preview's inner canvas is sized to the configured canvas.
    expect(getByTestId('preview-stage').firstElementChild.style.width).toBe('1280px')
    // Regression: a valid resize must NOT shrink widgets — the tower keeps its
    // width (the per-keystroke oninput bug collapsed everything to 320px/x0).
    const tower = container.querySelector('[data-testid="widget-tower"]')
    expect(tower.style.width).toBe('380px')
    expect(tower.style.left).toBe('24px')
  })

  it('ignores a blank canvas field instead of snapping to the minimum', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()
    await fireEvent.change(getByTestId('canvas-w'), { target: { value: '1280' } })
    await tick()
    // Clearing the field commits blank — must keep the last good width, not 320.
    await fireEvent.change(getByTestId('canvas-w'), { target: { value: '' } })
    await tick()
    expect(getByTestId('preview-stage').firstElementChild.style.width).toBe('1280px')
  })

  it('offers a preset canvas button', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()
    await fireEvent.click(getByTestId('canvas-720'))
    await tick()
    expect(getByTestId('canvas-w').value).toBe('1280')
    expect(getByTestId('canvas-h').value).toBe('720')
  })

  it('always shows the Load control, disabled when there are no profiles', async () => {
    const { getByTestId } = render(ConfigPage)
    await tick()
    const load = getByTestId('load')
    expect(load).toBeTruthy()
    expect(load.disabled).toBe(true) // no server / no saved profiles in this test
  })

  it('copies the OBS URL to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { getByTestId } = render(ConfigPage)
    await tick()

    await fireEvent.click(getByTestId('obs-url'))
    await tick()
    expect(writeText).toHaveBeenCalledWith(getByTestId('obs-url').textContent.trim())
    expect(getByTestId('copy-hint').textContent).toContain('Copied')
  })
})
