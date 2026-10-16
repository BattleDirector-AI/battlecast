import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* A preview drag or resize at a bigger text preset is ONE edit (overlay-config.md rule 41c):
 * the remembered `normal` geometry (`textScaleOrigin`) is moved by comparing the widget with
 * where the drag began, not with the previous pointermove, so a drag that comes back to its
 * start leaves the origin as it was. Driven through real pointer events on the preview handles;
 * the outcome is read from the x/w inputs after returning the widget to `normal`. */
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(),
  saveProfile: vi.fn(async () => ({ saved: true })),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(async () => true),
  deleteProfile: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const input = (c, field) => c.querySelector(`[data-testid="${field}-tower"]`)
const value = (c, field) => Number(input(c, field).value)

async function type(c, field, v) {
  await fireEvent.input(input(c, field), { target: { value: String(v) } })
  await tick()
}

async function pick(c, preset) {
  await fireEvent.change(c.querySelector('[data-testid="text-scale-tower"]'), { target: { value: preset } })
  await tick()
}

/** The preview's screen→canvas scale, read from the canvas transform so the pointer offsets
 *  below land on exact canvas pixels whatever the editor's fit computes. */
function previewScale(c) {
  const m = /scale\(([\d.]+)\)/.exec(c.querySelector('.preview__canvas').style.transform)
  expect(m, 'preview canvas has no scale transform').toBeTruthy()
  return Number(m[1])
}

/** Press on `target`, move through each [dx, dy] (canvas pixels from the press point), then
 *  release — one drag, one pointermove per step. */
async function drag(c, target, steps) {
  const s = previewScale(c)
  await fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
  for (const [dx, dy] of steps) {
    await fireEvent.pointerMove(window, { clientX: dx * s, clientY: dy * s })
    await tick()
  }
  await fireEvent.pointerUp(window, { clientX: 0, clientY: 0 })
  await tick()
}

const moveHandle = (c) => c.querySelector('[data-testid="handle-tower"]')
const resizeHandle = (c) => c.querySelector('[data-testid="resize-tower"]')

/** The tower at x 1500, w 380, then `larger`: 494 wide, kept on canvas at x 1426. */
async function edgeTowerAtLarger() {
  const { container } = render(ConfigPage)
  await settle()
  await type(container, 'x', 1500)
  await type(container, 'w', 380)
  await pick(container, 'larger')
  expect(value(container, 'x')).toBe(1426)
  expect(value(container, 'w')).toBe(494)
  return container
}

describe('a preview drag at a bigger preset is one edit (rule 41c)', () => {
  it('dragging away and back in one drag keeps the origin: normal lands at x 1500', async () => {
    const c = await edgeTowerAtLarger()
    await drag(c, moveHandle(c), [[-10, 0], [-20, 0], [-10, 0], [0, 0]])
    expect(value(c, 'x')).toBe(1426)
    await pick(c, 'normal')
    expect(value(c, 'x')).toBe(1500)
    expect(value(c, 'w')).toBe(380)
  })

  it('away and back horizontally with a vertical move still keeps the origin x', async () => {
    const c = await edgeTowerAtLarger()
    const y0 = value(c, 'y')
    await drag(c, moveHandle(c), [[-30, 10], [0, 20]])
    expect(value(c, 'y')).toBe(y0 + 20)
    await pick(c, 'normal')
    expect(value(c, 'x')).toBe(1500)
    expect(value(c, 'y')).toBe(y0 + 20)
  })

  it('resizing narrower and back in one drag keeps the origin width', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    await type(c, 'x', 0)
    await type(c, 'w', 1600)
    await pick(c, 'larger') // 2080, capped at the 1920 canvas
    expect(value(c, 'w')).toBe(1920)
    await drag(c, resizeHandle(c), [[-12, 0], [-40, 0], [0, 0]])
    expect(value(c, 'w')).toBe(1920)
    await pick(c, 'normal')
    expect(value(c, 'w')).toBe(1600)
  })

  it('a drag that ends somewhere else moves the origin to where it ended', async () => {
    const c = await edgeTowerAtLarger()
    await drag(c, moveHandle(c), [[-12, 0], [-50, 0], [-30, 0]])
    expect(value(c, 'x')).toBe(1396)
    await pick(c, 'normal')
    expect(value(c, 'x')).toBe(1396)
  })

  it('two separate drags are two edits: away, release, back, release moves the origin to 1426', async () => {
    const c = await edgeTowerAtLarger()
    await drag(c, moveHandle(c), [[-12, 0]])
    await drag(c, moveHandle(c), [[12, 0]])
    expect(value(c, 'x')).toBe(1426)
    await pick(c, 'normal')
    expect(value(c, 'x')).toBe(1426)
  })
})
