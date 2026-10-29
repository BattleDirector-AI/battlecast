/* /all — class tags in a single-class session across every widget (widgets.md rules 60-63,
 * overlay-config.md rule 47, protocol-contract.md rule 20, ADR 0022).
 *
 * One answer for the whole overlay: the profile's `theme.classTags` resolved against the
 * snapshot's `session.multiclass`. Each case checks every class-tag site /all composes — the
 * tower, the battle box, the driver lower-third, the on-board HUD and (in qualifying) the
 * qualifying lower-third — so an implementation that hides in one widget only fails here.
 * `race-single-class.json`: four "Default" cars, Jacobs (car-7) on camera in an active battle,
 * `session.multiclass: false`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const withSession = (fixture, session) => ({ ...fixture, session })
const noFlag = withSession(singleClass, { flag: 'green' })

/** Show the HUD's class field and drop the hand-off, so the strip renders beside the card. */
function profile(theme, { onboard = {}, tower = {} } = {}) {
  return {
    theme,
    widgets: {
      tower,
      onboard: {
        waitForLowerThird: false,
        driverInfo: { name: true, number: true, position: true, class: true, make: false, model: false },
        ...onboard,
      },
    },
  }
}

const slot = (c, key) => c.querySelector(`[data-testid="widget-${key}"]`)
const chipsIn = (c, key) =>
  Array.from(slot(c, key)?.querySelectorAll('.bc-class-chip') ?? []).map((el) => el.textContent.trim())

async function mount(snapshot, config) {
  const r = render(AllView, { snapshot, config })
  await tick()
  await tick()
  return r
}

const RACE_SITES = ['tower', 'battle', 'driver', 'onboard']

/** Every race-time class-tag site, checked together. The rest of each widget must still render. */
function expectRaceSites(container, shown) {
  expect(slot(container, 'tower').querySelectorAll('[data-testid="tower-row"]')).toHaveLength(4)
  expect(slot(container, 'battle').textContent).toContain('E.JAC')
  expect(slot(container, 'driver').querySelector('[data-testid="driver-lt-name"]')?.textContent.trim()).toBe(
    'E.JAC',
  )
  expect(slot(container, 'onboard').querySelector('[data-testid="onboard-driver-number"]')?.textContent.trim()).toBe(
    '07',
  )
  const expected = {
    tower: shown ? ['DEFAULT', 'DEFAULT', 'DEFAULT', 'DEFAULT'] : [],
    battle: shown ? ['DEFAULT'] : [],
    driver: shown ? ['DEFAULT'] : [],
    onboard: shown ? ['DEFAULT'] : [],
  }
  for (const key of RACE_SITES) expect(chipsIn(container, key), `${key} class chips`).toEqual(expected[key])
}

describe('/all class tags — the setting × the producer flag', () => {
  it('auto (no theme key) + multiclass false: no class tag on any widget', async () => {
    const { container } = await mount(singleClass, profile({}))
    expectRaceSites(container, false)
    expect(container.textContent).not.toMatch(/DEFAULT/i)
  })

  it('auto + multiclass absent: every widget shows its class tag', async () => {
    const { container } = await mount(noFlag, profile({ classTags: 'auto' }))
    expectRaceSites(container, true)
  })

  it('auto + multiclass true: every widget shows its class tag', async () => {
    const { container } = await mount(withSession(singleClass, { multiclass: true }), profile({ classTags: 'auto' }))
    expectRaceSites(container, true)
  })

  it('show + multiclass false: every widget shows its class tag', async () => {
    const { container } = await mount(singleClass, profile({ classTags: 'show' }))
    expectRaceSites(container, true)
  })

  it('hide + multiclass absent: no class tag on any widget', async () => {
    const { container } = await mount(noFlag, profile({ classTags: 'hide' }))
    expectRaceSites(container, false)
  })

  it('an invalid setting ("HIDE") normalizes to auto: with no flag the tags show', async () => {
    const { container } = await mount(noFlag, profile({ classTags: 'HIDE' }))
    expectRaceSites(container, true)
  })

  it('the qualifying lower-third follows the same answer', async () => {
    const qual = { ...singleClass, mode: 'qualifying' }
    const card = (c) => slot(c, 'qualifying').querySelector('[data-testid="qualifying-lower-third"]')

    const hidden = await mount(qual, profile({ classTags: 'auto' }))
    expect(card(hidden.container), 'the qualifying card did not fire').not.toBeNull()
    expect(chipsIn(hidden.container, 'qualifying')).toEqual([])
    cleanup()

    const shown = await mount(qual, profile({ classTags: 'show' }))
    expect(card(shown.container)).not.toBeNull()
    expect(chipsIn(shown.container, 'qualifying')).toEqual(['DEFAULT'])
  })
})

describe('/all class tags hidden — per-site detail', () => {
  it('a grouped tower renders flat (rule 61)', async () => {
    const { container } = await mount(multiClass, profile({ classTags: 'hide' }, { tower: { classDisplay: 'grouped' } }))
    const tower = slot(container, 'tower')
    expect(tower.querySelector('[data-testid="standings-tower"]').getAttribute('data-class-display')).toBe('inline')
    expect(tower.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(
      Array.from(tower.querySelectorAll('[data-testid="tower-row"]')).map((r) => r.getAttribute('data-position')),
    ).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('a HUD whose only enabled identity field is the class renders no strip and no ON BOARD label (rule 63)', async () => {
    const classOnly = { name: false, number: false, position: false, class: true, make: false, model: false }

    const shown = await mount(noFlag, profile({ classTags: 'auto' }, { onboard: { driverInfo: classOnly } }))
    expect(slot(shown.container, 'onboard').textContent, 'guard: the class-only strip shows with tags on').toContain(
      'ON BOARD',
    )
    cleanup()

    const hidden = await mount(singleClass, profile({ classTags: 'auto' }, { onboard: { driverInfo: classOnly } }))
    expect(slot(hidden.container, 'onboard').querySelector('[data-testid="onboard-identity"]')).toBeNull()
    expect(slot(hidden.container, 'onboard').textContent).not.toContain('ON BOARD')
  })

  it('a snapshot that flips multiclass shows or hides the tags at once, everywhere', async () => {
    const config = profile({ classTags: 'auto' })
    const { container, rerender } = await mount(withSession(singleClass, { multiclass: true }), config)
    expectRaceSites(container, true)
    await rerender({ snapshot: singleClass, config })
    await tick()
    expectRaceSites(container, false)
  })
})
