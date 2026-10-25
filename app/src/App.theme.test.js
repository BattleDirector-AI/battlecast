/* The `?theme=` URL knob and the boot baseline (overlay-config.md rule 59, ADR 0026).
 *
 * `/onboard` loads no profile, so the URL is the only way to give it a vintage look, and
 * `/racecontrol` without `?profile=` is in the same position: App's boot writes `<html data-theme>` from `?theme=` (trimmed, case-insensitive,
 * ignored unless it names a preset) or `modern`. The `/config` editor is not a render page — its
 * own root never takes a vintage theme, whatever `?theme=` says (rule 62 themes only its preview).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import App from './App.svelte'

let appEl
beforeEach(() => {
  delete document.documentElement.dataset.theme
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
  // The routes open an SSE feed; happy-dom has no EventSource and no network.
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
    },
  )
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
})
afterEach(() => {
  cleanup()
  appEl.remove()
  window.history.replaceState({}, '', '/')
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

async function boot(url) {
  window.history.replaceState({}, '', url)
  render(App)
  await tick()
  await tick()
  return document.documentElement.dataset.theme
}

describe('App boot — ?theme= on a route rendering without a profile (rule 59)', () => {
  it.each([
    ['/racecontrol?theme=vintage80', 'vintage80'],
    ['/racecontrol?theme=vintage70', 'vintage70'],
    ['/onboard?theme=vintage70', 'vintage70'],
    ['/onboard?theme=vintage80', 'vintage80'],
    ['/racecontrol?theme=modern', 'modern'],
  ])('%s renders data-theme=%s', async (url, expected) => {
    expect(await boot(url)).toBe(expected)
  })

  it.each([
    ['/racecontrol?theme=Vintage80', 'vintage80'],
    ['/onboard?theme=%20VINTAGE70%20', 'vintage70'],
  ])('reads %s trimmed and case-insensitively as %s', async (url, expected) => {
    expect(await boot(url)).toBe(expected)
  })

  it.each([
    ['no param', '/racecontrol'],
    ['an unknown look', '/racecontrol?theme=retro'],
    ['the bare family name', '/onboard?theme=vintage'],
    ['an empty value', '/onboard?theme='],
  ])('writes modern for %s', async (_label, url) => {
    expect(await boot(url)).toBe('modern')
  })
})

describe('App boot — the /config editor never takes a vintage theme on its root (rules 59, 62)', () => {
  it.each(['/config?theme=vintage70', '/config?theme=vintage80'])('%s leaves the root un-themed', async (url) => {
    const t = await boot(url)
    expect(['modern', undefined], `the editor root carries data-theme="${t}"`).toContain(t)
  })
})
