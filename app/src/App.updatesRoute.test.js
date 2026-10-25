/* `/updates` is a transparent overlay route that renders the race update box (#27).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rule 75, ADR 0023. App reads
 * window.location.pathname at mount, so the path is set per test; the SSE feed is the shared
 * FakeEventSource double, and the companion server is absent (test-setup.js), so the page
 * runs on the default dwell.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import App from './App.svelte'
import { FakeEventSource } from './lib/testing/fakeEventSource.js'
import fixture from '../../spec/v1/fixtures/race-events.json'

let appEl
beforeEach(() => {
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.history.replaceState({}, '', '/updates')
})
afterEach(() => {
  cleanup()
  appEl.remove()
  window.history.replaceState({}, '', '/')
  document.documentElement.style.background = ''
  document.body.style.background = ''
  vi.unstubAllGlobals()
})

describe('App — /updates route', () => {
  it('is a transparent, full-bleed overlay route', async () => {
    render(App)
    await tick()
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).toBe('transparent')
    expect(document.body.style.background).toBe('transparent')
  })

  it('renders the race update box from the producer feed', async () => {
    const { container } = render(App)
    await tick()
    expect(FakeEventSource.last, '/updates opened no producer connection').toBeTruthy()

    FakeEventSource.last.emit('state', { data: JSON.stringify(fixture) }) // baseline
    await tick()
    const next = structuredClone(fixture)
    next.race_events.push({ id: 'ev-106', type: 'leader_change', driver_name: 'Kevin Estre' })
    FakeEventSource.last.emit('state', { data: JSON.stringify(next) })
    await tick()

    const card = container.querySelector('[data-testid="race-update"]')
    expect(card, 'no race update card on /updates').not.toBeNull()
    expect(card.querySelector('[data-testid="update-label"]').textContent.trim()).toBe('NEW LEADER')
    expect(card.querySelector('[data-testid="update-name"]').textContent.trim()).toBe('K. Estre')
  })
})
