import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import App from './App.svelte'

// The Vite scaffold styles `#app` as a centered, max-width, bordered column. Real
// routes must neutralize that or the overlay is offset/boxed-in (the "weirdly wide"
// /all bug). App reads window.location.pathname at mount, so set it per test.
function setPath(pathname) {
  window.history.replaceState({}, '', pathname)
}

let appEl
beforeEach(() => {
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
})
afterEach(() => {
  cleanup()
  appEl.remove()
  setPath('/')
})

describe('App — full-bleed vs scaffold layout', () => {
  it('neutralizes the #app constraint on a real route (/config)', async () => {
    setPath('/config')
    render(App)
    await tick()
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.margin).toBe('0px')
    expect(appEl.style.border).toContain('none')
  })

  it('makes overlay routes transparent AND full-bleed (/all)', async () => {
    setPath('/all')
    render(App)
    await tick()
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).toBe('transparent')
    expect(document.body.style.background).toBe('transparent')
  })

  it('leaves the scaffold landing page constrained (no #app override)', async () => {
    setPath('/')
    render(App)
    await tick()
    // The landing page keeps the scaffold column — we didn't touch #app.
    expect(appEl.style.maxWidth).toBe('')
    expect(appEl.style.margin).toBe('')
  })
})
