/* Lap-time flash follow-ups (#214): widgets.md rules 40, 42, 42a.
 *
 * Part 1 drives the tower through snapshot/metrics props with fake timers (the edges the
 * #212 review found untested). Part 2 is a CSS-contract check on the component source:
 * happy-dom does no layout, so rule 42a's "the gap cell keeps its width" can only be pinned
 * on the stylesheet here.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import source from './StandingsTower.svelte?raw'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'

const ON = { interval: true, lapFlash: true }
const OFF = { interval: true, lapFlash: false }
const clone = (o) => JSON.parse(JSON.stringify(o))
function snap(patches = {}) {
  const s = clone(towerMetrics)
  for (const v of s.vehicles) Object.assign(v, patches[v.slot_id] ?? {})
  return s
}
const gapEl = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"] [data-testid="row-gap"]`)
const gap = (slot) => gapEl(slot)?.textContent.trim()
const tier = (slot) => gapEl(slot)?.getAttribute('data-lap-flash') ?? null

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('lap-time flash edges (rules 40, 42)', () => {
  it('mounted with no snapshot, the first real snapshot does not flash', async () => {
    const r = render(StandingsTower, { snapshot: null, metrics: ON })
    flushSync()
    await r.rerender({ snapshot: snap(), metrics: ON })
    flushSync()
    for (const slot of ['car-44', 'car-1', 'car-16', 'car-4']) expect(tier(slot), slot).toBeNull()
    expect(gap('car-1')).toBe('+0.400')
  })

  it('turning the toggle off mid-flash clears the flash at once', async () => {
    const r = render(StandingsTower, { snapshot: snap(), metrics: ON })
    flushSync()
    await r.rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }), metrics: ON })
    flushSync()
    expect(gap('car-1')).toBe('1:31.950')

    await r.rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }), metrics: OFF })
    flushSync()
    expect(gap('car-1')).toBe('+0.400')
    expect(tier('car-1')).toBeNull()
  })

  it('a lap completed while the toggle is off does not flash when it is turned back on', async () => {
    // Start ON so a baseline exists; the lap then lands while OFF.
    const r = render(StandingsTower, { snapshot: snap(), metrics: ON })
    flushSync()
    await r.rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }), metrics: OFF })
    flushSync()
    await r.rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }), metrics: ON })
    flushSync()
    expect(gap('car-1')).toBe('+0.400')
    expect(tier('car-1')).toBeNull()
  })

  it('unmounting mid-flash leaves no pending timer', async () => {
    const r = render(StandingsTower, { snapshot: snap(), metrics: ON })
    flushSync()
    await r.rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }), metrics: ON })
    flushSync()
    r.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

/** The declarations of every top-level rule whose selector list includes `selector`. */
function rulesFor(selector) {
  const css = source.slice(source.indexOf('<style>'))
  const out = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
    if (selectors.includes(selector)) out.push(m[2])
  }
  return out.join(';')
}
const decl = (body, prop) => body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim()

describe('the gap cell keeps its width (rule 42a)', () => {
  const base = rulesFor('.row__gap')

  it('reserves a minimum width on the base gap cell and never shrinks', () => {
    expect(decl(base, 'min-width'), '.row__gap has no min-width').toBeTruthy()
    const flex = decl(base, 'flex')
    const shrink = decl(base, 'flex-shrink')
    expect(shrink === '0' || /^\S+\s+0(\s|$)/.test(flex ?? ''), `.row__gap may shrink (flex: ${flex}, flex-shrink: ${shrink})`).toBe(true)
  })

  it('sizes that width off the gap type token, not the element font, so every variant is the same width', () => {
    // `ch`/`em`/`ex` resolve against each variant's own font — the LEADER label uses a
    // different family and size — which would make a flash change the cell width.
    expect(decl(base, 'min-width')).not.toMatch(/\d(ch|em|ex)\b/)
    expect(decl(base, 'min-width')).toContain('--bc-size-gap')
  })

  it.each(['.row__gap--leader', '.row__gap--leadlap', '.row__gap--flash'])(
    '%s does not override the width',
    (variant) => {
      const body = rulesFor(variant)
      for (const prop of ['min-width', 'width', 'max-width', 'flex', 'flex-shrink', 'flex-basis']) {
        expect(decl(body, prop), `${variant} sets ${prop}`).toBeUndefined()
      }
    },
  )
})
