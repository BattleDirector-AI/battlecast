/* `/info` is a transparent overlay route that renders the info panel (#62).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rule 82, ADR 0024. App reads
 * window.location.pathname at mount, so the path is set per test; the SSE feed is the shared
 * FakeEventSource double, and the companion server is absent (test-setup.js), so the page
 * runs on the defaults.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import App from './App.svelte'
import { FakeEventSource } from './lib/testing/fakeEventSource.js'
import fixture from '../../spec/v1/fixtures/event-info.json'

let appEl
beforeEach(() => {
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.history.replaceState({}, '', '/info')
})
afterEach(() => {
  cleanup()
  appEl.remove()
  window.history.replaceState({}, '', '/')
  document.documentElement.style.background = ''
  document.body.style.background = ''
  vi.unstubAllGlobals()
})

describe('App — /info route', () => {
  it('is a transparent, full-bleed overlay route', async () => {
    render(App)
    await tick()
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).toBe('transparent')
    expect(document.body.style.background).toBe('transparent')
  })

  it('renders the info panel from the producer feed', async () => {
    const { container } = render(App)
    await tick()
    expect(FakeEventSource.last, '/info opened no producer connection').toBeTruthy()

    FakeEventSource.last.emit('state', { data: JSON.stringify(fixture) })
    await tick()

    const panel = container.querySelector('[data-testid="info-panel"]')
    expect(panel, 'no info panel on /info').not.toBeNull()
    expect(panel.querySelector('[data-testid="info-header"]').textContent.trim()).toBe(
      'ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS',
    )
    expect(panel.querySelector('[data-testid="info-line"]').textContent.trim()).toBe('Live from the Ardennes')
  })
})
