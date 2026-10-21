/* Standalone routes — class tags read from the loaded profile (overlay-config.md rule 47,
 * widgets.md rule 60, ADR 0022). Every standalone route that loads a profile (/tower, /battle,
 * /driver, /qualifying, /grid, /results) reads `theme.classTags` from it and resolves it against
 * the snapshot's `session.multiclass`, exactly as /all does. Drives the PAGES, not the bare
 * widgets, because the page is where the setting is sourced. The SSE client is mocked so a test
 * pushes a fixture at the page; `fetch` serves the profile.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './tower/TowerPage.svelte'
import BattlePage from './battle/BattlePage.svelte'
import DriverPage from './driver/DriverPage.svelte'
import QualifyingPage from './qualifying/QualifyingPage.svelte'
import GridPage from './grid/GridPage.svelte'
import ResultsPage from './results/ResultsPage.svelte'
import singleClass from '../../../spec/v1/fixtures/race-single-class.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const noFlag = { ...singleClass, session: { flag: 'green' } }
const qual = (snap) => ({ ...snap, mode: 'qualifying' })

const count = (sel) => document.querySelectorAll(sel).length
const text = (sel) => document.querySelector(sel)?.textContent.trim()

/** [route, page, snapshot transform, chips shown, content probe]. The probe proves the page
 *  actually rendered its widget, so a hidden-tags case cannot pass on an empty page. */
const PAGES = [
  ['/tower', TowerPage, (s) => s, 4, () => expect(count('[data-testid="tower-row"]')).toBe(4)],
  ['/battle', BattlePage, (s) => s, 1, () => expect(document.body.textContent).toContain('Jacobs')],
  ['/driver', DriverPage, (s) => s, 1, () => expect(text('[data-testid="driver-lt-name"]')).toBe('E. Jacobs')],
  ['/qualifying', QualifyingPage, qual, 1, () => expect(text('[data-testid="qt-best"]')).toBe('1:38.320')],
  ['/grid', GridPage, (s) => s, 1, () => expect(count('[data-testid="grid-cell"]')).toBe(4)],
  ['/results', ResultsPage, (s) => s, 1, () => expect(count('[data-testid="results-row"]')).toBe(4)],
]

const chips = () => Array.from(document.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())

async function mountPage(path, Page, snapshot, profile) {
  window.innerHeight = 800
  window.history.replaceState({}, '', profile ? `${path}?profile=p` : path)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile
        ? { ok: true, status: 200, json: async () => profile }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(Page)
  await vi.waitFor(() => expect(sse.emit, 'the page never opened its state feed').toBeTypeOf('function'))
  // Let the profile load settle before the snapshot arrives.
  for (let i = 0; i < 5; i++) await tick()
  sse.emit(snapshot)
  flushSync()
  await tick()
}

const originalInnerHeight = window.innerHeight
beforeEach(() => {
  sse.emit = null
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.innerHeight = originalInnerHeight
  window.history.replaceState({}, '', '/')
})

describe.each(PAGES)('%s reads theme.classTags from the loaded profile', (path, Page, mode, chipCount, probe) => {
  const shownChips = Array(chipCount).fill('DEFAULT')

  it('no profile (auto) + multiclass absent: the class tags show (guard)', async () => {
    await mountPage(path, Page, mode(noFlag), null)
    probe()
    expect(chips()).toEqual(shownChips)
  })

  it('no profile (auto) + multiclass false: the class tags hide', async () => {
    await mountPage(path, Page, mode(singleClass), null)
    probe()
    expect(chips()).toEqual([])
    expect(document.body.textContent).not.toMatch(/DEFAULT/i)
  })

  it('profile hide + multiclass absent: the class tags hide', async () => {
    await mountPage(path, Page, mode(noFlag), { theme: { classTags: 'hide' } })
    probe()
    expect(chips()).toEqual([])
  })

  it('profile show + multiclass false: the class tags show', async () => {
    await mountPage(path, Page, mode(singleClass), { theme: { classTags: 'show' } })
    probe()
    expect(chips()).toEqual(shownChips)
  })
})
