/* `/weather` is a transparent overlay route that renders the weather box (#208).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rule 87, ADR 0025. App reads
 * window.location.pathname at mount, so the path is set per test; the SSE feed is the shared
 * FakeEventSource double, and the companion server is absent (test-setup.js), so the page
 * runs on the defaults.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import App from './App.svelte'
import { FakeEventSource } from './lib/testing/fakeEventSource.js'
import fixture from '../../spec/v1/fixtures/race-weather.json'

let appEl
beforeEach(() => {
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.history.replaceState({}, '', '/weather')
})
afterEach(() => {
  cleanup()
  appEl.remove()
  window.history.replaceState({}, '', '/')
  document.documentElement.style.background = ''
  document.body.style.background = ''
  vi.unstubAllGlobals()
})

describe('App — /weather route', () => {
  it('is a transparent, full-bleed overlay route', async () => {
    render(App)
    await tick()
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).toBe('transparent')
    expect(document.body.style.background).toBe('transparent')
  })

  it('renders the weather box from the producer feed', async () => {
    const { container } = render(App)
    await tick()
    expect(FakeEventSource.last, '/weather opened no producer connection').toBeTruthy()

    FakeEventSource.last.emit('state', { data: JSON.stringify(fixture) })
    await tick()

    const box = container.querySelector('[data-testid="weather-box"]')
    expect(box, 'no weather box on /weather').not.toBeNull()
    expect(box.querySelector('[data-testid="weather-air-value"]').textContent.trim()).toBe('22°C')
    expect(box.querySelector('[data-testid="weather-conditions"]').textContent.trim()).toBe('Light rain')
  })
})
