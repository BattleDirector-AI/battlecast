/* The info panel inside `/all` (#62).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 76-79, 82; overlay-config.md rule 52;
 * ADR 0024. Drives AllView with event-info.json and a normalized profile, under fake timers.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import fixture from '../../../../spec/v1/fixtures/event-info.json'

const [L0, L1, L2] = fixture.info_lines
const HEADER = 'ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS'

let view
async function mount(props) {
  view = render(AllView, props)
  await tick()
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}
const slot = () => view.container.querySelector('[data-testid="widget-info"]')
const header = () => slot()?.querySelector('[data-testid="info-header"]')?.textContent.trim() ?? null
const line = () => slot()?.querySelector('[data-testid="info-line"]')?.textContent.trim() ?? null

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/all — the info widget (widgets rule 82, overlay-config rule 52)', () => {
  it('is placed by default at its default geometry and shows the header and rotating lines', async () => {
    await mount({ snapshot: fixture })
    expect(slot(), 'no info slot in the default /all layout').not.toBeNull()
    expect(slot().style.left).toBe('1200px')
    expect(slot().style.top).toBe('816px')
    expect(slot().style.width).toBe('696px')
    expect(slot().style.height).toBe('72px')
    expect(slot().style.zIndex).toBe('9')
    expect(header()).toBe(HEADER)
    expect(line()).toBe(L0)
    advance(8000)
    expect(line()).toBe(L1)
  })

  it("reads the info widget's own dwellSeconds and lines", async () => {
    await mount({
      snapshot: fixture,
      config: normalizeConfig({ widgets: { info: { dwellSeconds: 3, lines: ['Follow us @battlecast'] } } }),
    })
    expect(line()).toBe(L0)
    advance(3000)
    expect(line()).toBe(L1)
    advance(3000)
    expect(line()).toBe(L2)
    advance(3000)
    expect(line()).toBe('Follow us @battlecast')
  })

  it('is not mounted while not visible', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { info: { visible: false } } }) })
    expect(slot()).toBeNull()
    expect(view.container.querySelector('[data-testid="info-panel"]')).toBeNull()
  })

  it('keeps showing with hideWhenIdle set: the panel has no idle predicate', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { info: { hideWhenIdle: true } } }) })
    expect(slot()).not.toBeNull()
    expect(header()).toBe(HEADER)
  })

  it('keeps its slot but draws nothing when there is no event and no line', async () => {
    const empty = structuredClone(fixture)
    delete empty.event
    delete empty.info_lines
    await mount({ snapshot: empty })
    expect(slot(), 'the slot stays placed').not.toBeNull()
    expect(slot().querySelector('[data-testid="info-panel"]')).toBeNull()
    expect(slot().textContent.trim()).toBe('')
  })
})
