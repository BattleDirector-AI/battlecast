import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* A preview drag follows the one pointer that started it (overlay-config.md rule 41e). The drag
 * listeners sit on `window` and so hear every pointer: another pointer's move must not steer the
 * drag, its release or cancel must not end it, and a press on a handle while a drag is live must
 * not start a second drag or restart the live one. Driven through real pointer events carrying a
 * `pointerId`; the outcome is read from the config Export JSON writes, and from the x/w fields
 * right after a step so a step that moves and a later step that moves back cannot both pass. */
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
  vi.restoreAllMocks()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const input = (c, field, key = 'tower') => c.querySelector(`[data-testid="${field}-${key}"]`)
const value = (c, field, key = 'tower') => Number(input(c, field, key).value)

async function type(c, field, v, key = 'tower') {
  await fireEvent.input(input(c, field, key), { target: { value: String(v) } })
  await fireEvent.change(input(c, field, key)) // a typed value applies on commit (rule 44)
  await tick()
}

/** The preview's screen→canvas scale, so pointer offsets land on exact canvas pixels. */
function previewScale(c) {
  const m = /scale\(([\d.]+)\)/.exec(c.querySelector('.preview__canvas').style.transform)
  expect(m, 'preview canvas has no scale transform').toBeTruthy()
  return Number(m[1])
}

function handle(c, testid) {
  const el = c.querySelector(`[data-testid="${testid}"]`)
  expect(el, `no ${testid} in the preview`).toBeTruthy()
  return el
}

// Two pointers, as two fingers or a mouse plus a pen would be. Positions are in canvas pixels.
const MOUSE = 1
const OTHER = 2

async function down(c, testid, pointerId, dx = 0, dy = 0) {
  const s = previewScale(c)
  await fireEvent.pointerDown(handle(c, testid), { pointerId, clientX: dx * s, clientY: dy * s })
  await tick()
}
async function moveTo(c, pointerId, dx, dy = 0) {
  const s = previewScale(c)
  await fireEvent.pointerMove(window, { buttons: 1, pointerId, clientX: dx * s, clientY: dy * s })
  await tick()
}
async function up(pointerId) {
  await fireEvent.pointerUp(window, { pointerId, clientX: 0, clientY: 0 })
  await tick()
}
async function cancel(pointerId) {
  await fireEvent.pointerCancel(window, { pointerId, clientX: 0, clientY: 0 })
  await tick()
}

/** The config Export JSON writes — the stored result, not the field text. */
async function exported(c) {
  let text = null
  vi.stubGlobal(
    'Blob',
    class {
      constructor(parts) {
        text = String(parts[0])
      }
    },
  )
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:captured')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  await fireEvent.click(c.querySelector('[data-testid="export"]'))
  expect(text, 'Export wrote nothing').toBeTruthy()
  return JSON.parse(text)
}

/** Tower at x 600, y 100; battle at x 900, y 500 — both clear of the canvas edges. */
async function mount() {
  const { container: c } = render(ConfigPage)
  await settle()
  await type(c, 'x', 600)
  await type(c, 'y', 100)
  await type(c, 'x', 900, 'battle')
  await type(c, 'y', 500, 'battle')
  return c
}

describe('another pointer does not steer a drag (rule 41e)', () => {
  it("a second pointer's movement leaves the dragged tower where the drag's own pointer put it", async () => {
    const c = await mount()
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)
    expect(value(c, 'x')).toBe(580)

    await moveTo(c, OTHER, -100, 40)
    expect(value(c, 'x'), "another pointer's move dragged the tower").toBe(580)
    expect(value(c, 'y'), "another pointer's move dragged the tower").toBe(100)

    await moveTo(c, MOUSE, -30) // placed from the drag start, as rule 41c says
    expect(value(c, 'x')).toBe(570)
    await up(MOUSE)

    const tower = (await exported(c)).widgets.tower
    expect(tower.x).toBe(570)
    expect(tower.y).toBe(100)
  })

  it("a second pointer's movement does not resize the tower during a resize drag", async () => {
    const c = await mount()
    const w0 = value(c, 'w')
    const h0 = value(c, 'h')
    await down(c, 'resize-tower', MOUSE)
    await moveTo(c, MOUSE, 10, 10)
    expect(value(c, 'w')).toBe(w0 + 10)

    await moveTo(c, OTHER, -60, -60)
    expect(value(c, 'w'), "another pointer's move resized the tower").toBe(w0 + 10)
    expect(value(c, 'h'), "another pointer's move resized the tower").toBe(h0 + 10)
    await up(MOUSE)

    const tower = (await exported(c)).widgets.tower
    expect(tower.w).toBe(w0 + 10)
    expect(tower.h).toBe(h0 + 10)
  })
})

describe("another pointer's release or cancel does not end a drag (rule 41e)", () => {
  it("a second pointer's pointerup leaves the drag live; the drag's own pointerup ends it", async () => {
    const c = await mount()
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)

    await up(OTHER)
    await moveTo(c, MOUSE, -30)
    expect(value(c, 'x'), "another pointer's pointerup ended the drag").toBe(570)

    await up(MOUSE)
    await moveTo(c, MOUSE, -60) // the drag has ended: this moves nothing (rule 41d)
    expect(value(c, 'x')).toBe(570)

    expect((await exported(c)).widgets.tower.x).toBe(570)
  })

  it("a second pointer's pointercancel leaves the drag live; the drag's own pointercancel ends it", async () => {
    const c = await mount()
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)

    await cancel(OTHER)
    await moveTo(c, MOUSE, -30)
    expect(value(c, 'x'), "another pointer's pointercancel ended the drag").toBe(570)

    await cancel(MOUSE)
    await moveTo(c, MOUSE, -60)
    expect(value(c, 'x')).toBe(570)

    expect((await exported(c)).widgets.tower.x).toBe(570)
  })
})

describe('a touch drags like any other pointer until the browser cancels it (rule 41e)', () => {
  it('a touch press drags the tower; the cancel ends the drag at the last step', async () => {
    const c = await mount()
    const TOUCH = 7
    await fireEvent.pointerDown(handle(c, 'handle-tower'), {
      pointerId: TOUCH,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
    })
    await tick()
    const s = previewScale(c)
    await fireEvent.pointerMove(window, { buttons: 1, pointerId: TOUCH, pointerType: 'touch', clientX: -20 * s, clientY: 0 })
    await tick()
    expect(value(c, 'x'), 'a touch press did not start a drag').toBe(580)

    // The browser claims the gesture for scrolling and cancels the pointer.
    await fireEvent.pointerCancel(window, { pointerId: TOUCH, pointerType: 'touch', clientX: 0, clientY: 0 })
    await tick()
    expect(value(c, 'x')).toBe(580)
    await fireEvent.pointerMove(window, { buttons: 1, pointerId: TOUCH, pointerType: 'touch', clientX: -60 * s, clientY: 0 })
    await tick()
    expect(value(c, 'x'), 'movement after the cancel still dragged').toBe(580)

    expect((await exported(c)).widgets.tower.x).toBe(580)
  })
})

describe('a press on a handle while a drag is live is ignored (rule 41e)', () => {
  it("another pointer pressing the battle box's handle neither drags the battle box nor stops the tower drag", async () => {
    const c = await mount()
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)
    expect(value(c, 'x')).toBe(580)

    await down(c, 'handle-battle', OTHER, 300, 400)
    await moveTo(c, OTHER, 250, 350)
    expect(value(c, 'x', 'battle'), 'the press on the battle handle started a drag').toBe(900)
    expect(value(c, 'y', 'battle'), 'the press on the battle handle started a drag').toBe(500)
    expect(value(c, 'x'), "the second pointer's move dragged the tower").toBe(580)

    await moveTo(c, MOUSE, -30) // the tower drag is still live, from its own start
    expect(value(c, 'x')).toBe(570)
    await up(MOUSE)

    // The drag has ended, and the second pointer — down since before it ended — drives nothing.
    await moveTo(c, OTHER, 200, 300)
    expect(value(c, 'x', 'battle')).toBe(900)
    expect(value(c, 'x')).toBe(570)
    await up(OTHER)

    // A fresh press is what starts the next drag.
    await down(c, 'handle-battle', OTHER, 300, 400)
    await moveTo(c, OTHER, 290, 400)
    await up(OTHER)

    const cfg = await exported(c)
    expect(cfg.widgets.tower.x).toBe(570)
    expect(cfg.widgets.tower.y).toBe(100)
    expect(cfg.widgets.battle.x).toBe(890)
    expect(cfg.widgets.battle.y).toBe(500)
  })

  it("a press on the tower's own resize handle mid-move, by the dragging pointer, does not turn the move into a resize", async () => {
    const c = await mount()
    const w0 = value(c, 'w')
    const h0 = value(c, 'h')
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)

    await down(c, 'resize-tower', MOUSE, -20)
    await moveTo(c, MOUSE, -30, 15)
    expect(value(c, 'w'), 'the press restarted the drag as a resize').toBe(w0)
    expect(value(c, 'h'), 'the press restarted the drag as a resize').toBe(h0)
    expect(value(c, 'x'), 'the move drag did not keep placing the tower from its start').toBe(570)
    expect(value(c, 'y')).toBe(115)
    await up(MOUSE)

    const tower = (await exported(c)).widgets.tower
    expect(tower.x).toBe(570)
    expect(tower.y).toBe(115)
    expect(tower.w).toBe(w0)
    expect(tower.h).toBe(h0)
  })
})

describe('a drag whose end event never arrives does not stick (issue 292)', () => {
  it('a move with no button held ends the drag, so a press on another handle drags that widget', async () => {
    const c = await mount()
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)
    expect(value(c, 'x')).toBe(580)

    // The release happened off-window: no pointerup arrives, the next move reports no buttons.
    await fireEvent.pointerMove(window, { pointerId: MOUSE, buttons: 0, clientX: 0, clientY: 0 })
    await tick()
    expect(value(c, 'x'), 'the unpressed move still placed the tower').toBe(580)

    await down(c, 'handle-battle', MOUSE)
    await moveTo(c, MOUSE, 30, 10)
    expect(value(c, 'x', 'battle')).toBe(930)
    expect(value(c, 'y', 'battle')).toBe(510)
    expect(value(c, 'x'), 'the old drag kept steering the tower').toBe(580)
    await up(MOUSE)

    const { tower, battle } = (await exported(c)).widgets
    expect([tower.x, battle.x, battle.y]).toEqual([580, 930, 510])
  })

  it('the window losing focus ends the drag, so a press on another handle drags that widget', async () => {
    const c = await mount()
    await down(c, 'handle-tower', MOUSE)
    await moveTo(c, MOUSE, -20)
    expect(value(c, 'x')).toBe(580)

    await fireEvent(window, new Event('blur'))
    await tick()

    await down(c, 'handle-battle', MOUSE)
    await moveTo(c, MOUSE, 30, 10)
    expect(value(c, 'x', 'battle')).toBe(930)
    expect(value(c, 'y', 'battle')).toBe(510)
    expect(value(c, 'x'), 'the old drag kept steering the tower').toBe(580)
    await up(MOUSE)

    const { tower, battle } = (await exported(c)).widgets
    expect([tower.x, battle.x, battle.y]).toEqual([580, 930, 510])
  })
})
