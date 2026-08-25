import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import ConfigPage from './ConfigPage.svelte'
import { WIDGET_KEYS, TOWER_METRIC_FIELDS, DRIVER_INFO_FIELDS } from '../../lib/overlayConfig.js'
import {
  WIDGET_HELP,
  FIELD_HELP,
  TOWER_METRIC_HELP,
  DRIVER_INFO_HELP,
} from '../../lib/configHelp.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('config editor: widget orientation', () => {
  it('names every widget and says what it puts on screen, without needing a click', () => {
    const { container } = render(ConfigPage)

    for (const key of WIDGET_KEYS) {
      const blurb = container.querySelector(`[data-testid="blurb-${key}"]`)
      expect(blurb, `${key} has no blurb`).toBeTruthy()
      // The human name and the on-stream description are both rendered text —
      // a broadcaster reading the panel sees them, no interaction required.
      expect(blurb.textContent).toContain(WIDGET_HELP[key].title)
      expect(blurb.textContent).toContain(WIDGET_HELP[key].summary)
    }
  })

  it('gives the tower a description that explains the leader cell, not just a label', () => {
    const { container } = render(ConfigPage)
    const text = container.querySelector('[data-testid="blurb-tower"]').textContent
    expect(text).toContain('Standings tower')
    expect(text.toLowerCase()).toContain('pole lap')
    expect(text).toContain('LEADER')
  })
})

describe('config editor: help popovers', () => {
  it('keeps help hidden until asked, then reveals the exact copy', async () => {
    const { container } = render(ConfigPage)

    // Nothing is showing before the ⓘ is used.
    expect(container.querySelector('[data-testid="help-max-rows-tower-text"]')).toBeNull()

    const btn = container.querySelector('[data-testid="help-max-rows-tower"]')
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('aria-expanded')).toBe('false')

    await fireEvent.click(btn)
    await tick()

    const pop = container.querySelector('[data-testid="help-max-rows-tower-text"]')
    expect(pop).toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.maxRows)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on Escape', async () => {
    const { container } = render(ConfigPage)
    const btn = container.querySelector('[data-testid="help-pin-scope-tower"]')

    await fireEvent.click(btn)
    await tick()
    expect(container.querySelector('[data-testid="help-pin-scope-tower-text"]')).toBeTruthy()

    await fireEvent.keyDown(document, { key: 'Escape' })
    await tick()
    expect(container.querySelector('[data-testid="help-pin-scope-tower-text"]')).toBeNull()
  })

  it('closes when the next click lands outside it', async () => {
    const { container } = render(ConfigPage)
    const btn = container.querySelector('[data-testid="help-pin-top-tower"]')

    await fireEvent.click(btn)
    await tick()
    expect(container.querySelector('[data-testid="help-pin-top-tower-text"]')).toBeTruthy()

    await fireEvent.click(document.body)
    await tick()
    expect(container.querySelector('[data-testid="help-pin-top-tower-text"]')).toBeNull()
  })

  it('toggles back off when the same ⓘ is clicked again', async () => {
    const { container } = render(ConfigPage)
    // A heading tip, deliberately: it has no <label> around it, so this exercises
    // the toggle alone (see the label-activation note below).
    const btn = container.querySelector('[data-testid="help-profile"]')

    await fireEvent.click(btn)
    await tick()
    expect(container.querySelector('[data-testid="help-profile-text"]')).toBeTruthy()

    await fireEvent.click(btn)
    await tick()
    expect(container.querySelector('[data-testid="help-profile-text"]')).toBeNull()
  })

  /* Most tips sit INSIDE a <label>, and a click anywhere in a label activates that
   * label's control — so asking what "Reduced motion" does must not switch it on.
   *
   * Per the HTML spec a label does NOT forward activation when the click target is
   * itself interactive content (our <button>), and Chromium honours that: verified
   * in a real browser against the built app, where the checkbox is unchanged.
   * happy-dom does not implement that rule and forwards anyway, so asserting on
   * `checkbox.checked` here would test the test environment, not the overlay.
   * Assert the mechanism that protects real browsers instead. */
  it('cancels the click so it never reaches the control it sits beside', async () => {
    const { container } = render(ConfigPage)

    for (const testid of ['help-reduced-motion', 'help-visible-tower', 'help-speed-mph-onboard']) {
      const btn = container.querySelector(`[data-testid="${testid}"]`)
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      btn.dispatchEvent(event)
      await tick()

      expect(event.defaultPrevented, `${testid} did not preventDefault`).toBe(true)
      expect(container.querySelector(`[data-testid="${testid}-text"]`), `${testid} did not open`).toBeTruthy()

      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }
  })

  /* SPEC-FIRST (#145): `what/overlay-config.md` rule 23 puts a plate-opacity control
   * in every plate-rendering widget row, so rule 16 requires it to be explained in
   * the UI. RED until the control (and its ⓘ) render. */
  it('explains the plate-opacity control on every widget that offers one', async () => {
    const { container } = render(ConfigPage)

    for (const key of ['tower', 'battle', 'driver', 'qualifying', 'racecontrol', 'onboard']) {
      expect(container.querySelector(`[data-testid="help-plate-alpha-${key}-text"]`)).toBeNull()

      const btn = container.querySelector(`[data-testid="help-plate-alpha-${key}"]`)
      expect(btn, `no plate-opacity help for ${key}`).toBeTruthy()

      await fireEvent.click(btn)
      await tick()
      const pop = container.querySelector(`[data-testid="help-plate-alpha-${key}-text"]`)
      expect(pop, `plate-opacity help for ${key} did not open`).toBeTruthy()
      expect(pop.textContent.trim()).toBe(FIELD_HELP.plateAlpha)

      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }

    // The copy has to say the thing rule 15 exists for, or it explains nothing.
    expect(FIELD_HELP.plateAlpha.toLowerCase()).toMatch(/panel|plate/)
    expect(FIELD_HELP.plateAlpha.toLowerCase()).toMatch(/full strength|stay|not affected/)
  })

  it('labels each ⓘ for screen readers with the control it explains', () => {
    const { container } = render(ConfigPage)
    const btn = container.querySelector('[data-testid="help-speed-mph-onboard"]')
    expect(btn.getAttribute('aria-label')).toBe('What does speed in mph do?')
  })
})

describe('config editor: help explains the behaviors that read as bugs', () => {
  it('tells the broadcaster why pit/tire/fuel vanish in qualifying', async () => {
    const { container } = render(ConfigPage)

    for (const field of TOWER_METRIC_FIELDS) {
      const btn = container.querySelector(`[data-testid="help-tower-metric-tower-${field}"]`)
      expect(btn, `no help for tower metric ${field}`).toBeTruthy()

      await fireEvent.click(btn)
      await tick()
      const pop = container.querySelector(`[data-testid="help-tower-metric-tower-${field}-text"]`)
      expect(pop.textContent.trim()).toBe(TOWER_METRIC_HELP[field])
      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }

    // The three suppressed-in-qualifying readouts must say so.
    for (const field of ['pit', 'tire', 'fuel']) {
      expect(TOWER_METRIC_HELP[field].toLowerCase()).toContain('qualifying and practice')
    }
  })

  it('explains each on-board identity toggle', async () => {
    const { container } = render(ConfigPage)
    for (const field of DRIVER_INFO_FIELDS) {
      const btn = container.querySelector(`[data-testid="help-driver-info-onboard-${field}"]`)
      expect(btn, `no help for driver info ${field}`).toBeTruthy()

      await fireEvent.click(btn)
      await tick()
      const pop = container.querySelector(`[data-testid="help-driver-info-onboard-${field}-text"]`)
      expect(pop.textContent.trim()).toBe(DRIVER_INFO_HELP[field])
      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }
  })
})

describe('config editor: help coverage cannot drift', () => {
  /* The guard that makes this maintainable: adding a control to the editor without
   * help copy fails here, rather than shipping an unexplained knob. */
  it('gives every widget control an ⓘ', () => {
    const { container } = render(ConfigPage)
    const undocumented = []

    for (const label of container.querySelectorAll('fieldset.widget-row label')) {
      if (!label.querySelector('input, select')) continue
      // A control counts as covered when its tip is inside the label, or sits
      // immediately beside it in the same <legend> (the visibility checkbox) or
      // grouped <fieldset> legend (the mode checkboxes share one tip).
      const covered =
        label.querySelector('[data-testid^="help-"]') ||
        label.closest('legend')?.querySelector('[data-testid^="help-"]') ||
        label.closest('fieldset.modes-row')?.querySelector('legend [data-testid^="help-"]')
      if (!covered) {
        undocumented.push(label.textContent.trim().split('\n')[0].trim())
      }
    }

    expect(undocumented, `controls with no help: ${undocumented.join(', ')}`).toEqual([])
  })

  it('gives every global settings section an ⓘ', () => {
    const { container } = render(ConfigPage)
    const expected = [
      'help-profile',
      'help-canvas',
      'help-reduced-motion',
      'help-logos',
      'help-per-slot',
      'help-logo-order',
      'help-producer',
      'help-obs-url',
    ]
    for (const testid of expected) {
      expect(container.querySelector(`[data-testid="${testid}"]`), `missing ${testid}`).toBeTruthy()
    }
  })

  it('renders help for the shared geometry fields on every widget', () => {
    const { container } = render(ConfigPage)
    for (const key of WIDGET_KEYS) {
      for (const field of ['x', 'y', 'w', 'h', 'z']) {
        expect(
          container.querySelector(`[data-testid="help-${field}-${key}"]`),
          `missing help-${field}-${key}`,
        ).toBeTruthy()
      }
    }
  })
})
