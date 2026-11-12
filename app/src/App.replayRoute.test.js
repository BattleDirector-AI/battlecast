/* `/replay` is a transparent overlay route that renders the replay badge (#60).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 117 and 120, ADR 0039. App reads
 * window.location.pathname at mount, so the path is set per test. The SSE feed is the shared
 * FakeEventSource double, and the companion server is absent (test-setup.js), so the page runs
 * on the defaults. The replay snapshot is race-close-battle.json with only `mode` changed. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import App from './App.svelte'
import { FakeEventSource } from './lib/testing/fakeEventSource.js'
import base from '../../spec/v1/fixtures/race-close-battle.json'

const withMode = (mode) => ({ ...structuredClone(base), mode })

let appEl
beforeEach(() => {
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.history.replaceState({}, '', '/replay')
})
afterEach(() => {
  cleanup()
  appEl.remove()
  window.history.replaceState({}, '', '/')
  document.documentElement.style.background = ''
  document.body.style.background = ''
  vi.unstubAllGlobals()
})

describe('App — /replay route', () => {
  it('is a transparent, full-bleed overlay route', async () => {
    render(App)
    await tick()
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).toBe('transparent')
    expect(document.body.style.background).toBe('transparent')
  })

  it('renders the replay badge from the producer feed, only during a replay', async () => {
    const { container } = render(App)
    await tick()
    expect(FakeEventSource.last, '/replay opened no producer connection').toBeTruthy()

    FakeEventSource.last.emit('state', { data: JSON.stringify(withMode('race')) })
    await tick()
    expect(container.querySelector('[data-testid="replay-badge"]')).toBeNull()

    FakeEventSource.last.emit('state', { data: JSON.stringify(withMode('replay')) })
    await tick()
    const badge = container.querySelector('[data-testid="replay-badge"]')
    expect(badge, 'no replay badge on /replay').not.toBeNull()
    expect(badge.querySelector('[data-testid="replay-label"]').textContent.trim()).toBe('REPLAY')
  })
})
