/* Standings tower — class tags in a single-class session (widgets.md rules 60-61,
 * overlay-config.md rule 47, protocol-contract.md rule 20, ADR 0022).
 *
 * Whether class tags show is `theme.classTags` (passed to the tower as `classTags`) resolved
 * against the producer's `session.multiclass`. `race-single-class.json` is a four-car field whose
 * every car is `vehicle_class: "Default"` with `session.multiclass: false`; the multi-class
 * fixtures carry three classes. The flag-absent cases strip `multiclass` from the single-class
 * fixture, so an overlay that decided single-class from `vehicles[]` (one distinct class, or the
 * string "Default") hides there and fails.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const METRICS = { interval: true }
const withSession = (fixture, session) => ({ ...fixture, session })
const withoutFlag = (fixture) => {
  const rest = { ...fixture.session }
  delete rest.multiclass
  return withSession(fixture, rest)
}

const tower = (c) => c.querySelector('[data-testid="standings-tower"]')
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const badges = (c) => Array.from(c.querySelectorAll('[data-testid="class-pos"]')).map((el) => el.textContent.trim())
const columns = (c) =>
  (c.querySelector('[data-testid="tower-grid"]')?.getAttribute('data-columns') ?? '').split(' ').filter(Boolean)
const names = (c) =>
  Array.from(c.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const positions = (c) =>
  Array.from(c.querySelectorAll('[data-testid="tower-row"] .row__pos')).map((el) => el.textContent.trim())
const gaps = (c) => Array.from(c.querySelectorAll('[data-testid="row-gap"]')).map((el) => el.textContent.trim())

function mount(snapshot, props = {}) {
  return render(StandingsTower, { snapshot, metrics: METRICS, ...props })
}

/** The tags-shown reading of the single-class field: four DEFAULT chips + four 'n/4' badges. */
function expectShown(container) {
  expect(columns(container)).toEqual(['pos', 'class', 'classpos', 'name', 'gap', 'interval'])
  expect(chips(container)).toEqual(['DEFAULT', 'DEFAULT', 'DEFAULT', 'DEFAULT'])
  expect(badges(container)).toEqual(['1/4', '2/4', '3/4', '4/4'])
}

function expectHidden(container) {
  expect(columns(container), 'class / classpos columns still present').toEqual(['pos', 'name', 'gap', 'interval'])
  expect(chips(container), 'a class chip still renders').toEqual([])
  expect(badges(container), 'a class-rank badge still renders').toEqual([])
  expect(tower(container).textContent).not.toMatch(/DEFAULT/i)
}

describe('tower class tags — auto follows session.multiclass (rule 60)', () => {
  it('hides the class chips and badges when the producer says single-class (false)', () => {
    const { container } = mount(singleClass, { classTags: 'auto' })
    expectHidden(container)
    // Nothing else changes: the running order, names and gaps read as before.
    expect(names(container)).toEqual(['S.ORT', 'E.JAC', 'L.BRA', 'T.OKA'])
    expect(positions(container)).toEqual(['1', '2', '3', '4'])
  })

  it('auto is the default when the tower is given no classTags', () => {
    const { container } = render(StandingsTower, { snapshot: singleClass, metrics: METRICS })
    expectHidden(container)
  })

  it('shows them when the producer says multi-class (true), even though every car shares a class', () => {
    const { container } = mount(withSession(singleClass, { multiclass: true }), { classTags: 'auto' })
    expectShown(container)
  })

  it('shows them when multiclass is absent — the overlay never infers single-class from vehicles[]', () => {
    const { container } = mount(withoutFlag(singleClass), { classTags: 'auto' })
    expectShown(container)
  })

  it('shows them when there is no session at all', () => {
    const noSession = { ...singleClass }
    delete noSession.session
    const { container } = mount(noSession, { classTags: 'auto' })
    expectShown(container)
  })

  it.each([
    ['null', null],
    ['the string "false"', 'false'],
    ['0', 0],
  ])('shows them when multiclass is %s (only exactly false hides)', (_label, value) => {
    const { container } = mount(withSession(singleClass, { multiclass: value }), { classTags: 'auto' })
    expectShown(container)
  })

  it('follows the latest snapshot with no hold', async () => {
    const { container, rerender } = mount(withSession(singleClass, { multiclass: true }), { classTags: 'auto' })
    expectShown(container)
    await rerender({ snapshot: singleClass, metrics: METRICS, classTags: 'auto' })
    expectHidden(container)
    await rerender({ snapshot: withoutFlag(singleClass), metrics: METRICS, classTags: 'auto' })
    expectShown(container)
  })
})

describe('tower class tags — show / hide override the producer (rule 60)', () => {
  it('show keeps the tags in a producer-declared single-class session', () => {
    const { container } = mount(singleClass, { classTags: 'show' })
    expectShown(container)
  })

  it('hide removes them in a producer-declared multi-class session', () => {
    const { container } = mount(multiClass, { classTags: 'hide' })
    expect(columns(container)).toEqual(['pos', 'name', 'gap', 'interval'])
    expect(chips(container)).toEqual([])
    expect(badges(container)).toEqual([])
    expect(tower(container).textContent).not.toMatch(/GTP|GT3|LMP2/)
  })

  it('hide removes them when the producer does not say', () => {
    const { container } = mount(withoutFlag(singleClass), { classTags: 'hide' })
    expectHidden(container)
  })
})

describe('tower class tags hidden — what else changes (rule 61)', () => {
  it('keeps every row’s class bar', () => {
    const { container } = mount(singleClass, { classTags: 'auto' })
    expect(chips(container), 'tags not hidden, so the bar check would prove nothing').toEqual([])
    const rows = container.querySelectorAll('[data-testid="tower-row"]')
    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row.querySelector('.row__classbar'), 'class bar dropped').not.toBeNull()
  })

  it('drops the header’s class-filter chip but the filter still narrows the field', () => {
    const { container } = mount(multiClass, { classTags: 'hide', classFilter: 'gt3' })
    expect(container.querySelector('[data-testid="tower-filter"] .bc-class-chip')).toBeNull()
    expect(chips(container)).toEqual([])
    expect(names(container)).toEqual(['ALO', 'ALB'])
  })

  it('a grouped tower renders the inline layout: one overall list, no group headers', () => {
    const { container } = mount(multiClass, { classTags: 'hide', classDisplay: 'grouped' })
    expect(tower(container).getAttribute('data-class-display')).toBe('inline')
    expect(container.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/\bcars\b/)
    // Overall running order and overall positions, not per-class blocks restarting at 1.
    expect(names(container)).toEqual(['VER', 'ALO', 'HAM', 'ROS', 'ALB', 'BOU'])
    expect(positions(container)).toEqual(['1', '2', '3', '4', '5', '6'])
    // The inline gap cell: only the overall leader reads LEADER (grouped gives each class one).
    expect(gaps(container).filter((g) => g === 'LEADER')).toHaveLength(1)
    expect(chips(container)).toEqual([])
    expect(columns(container)).toEqual(['pos', 'name', 'gap', 'interval'])
  })

  it('a grouped single-class tower under auto renders flat too, and regroups when the tags return', async () => {
    const { container, rerender } = mount(singleClass, { classTags: 'auto', classDisplay: 'grouped' })
    expect(tower(container).getAttribute('data-class-display')).toBe('inline')
    expect(container.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(positions(container)).toEqual(['1', '2', '3', '4'])

    await rerender({ snapshot: singleClass, metrics: METRICS, classTags: 'show', classDisplay: 'grouped' })
    expect(tower(container).getAttribute('data-class-display')).toBe('grouped')
    const groups = container.querySelectorAll('[data-testid="tower-group"]')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelector('.bc-class-chip').textContent.trim()).toBe('DEFAULT')
  })

  it('a grouped tower whose tags show keeps its groups (guard: grouping is not dropped wholesale)', () => {
    const { container } = mount(multiClass, { classTags: 'auto', classDisplay: 'grouped' })
    expect(tower(container).getAttribute('data-class-display')).toBe('grouped')
    expect(container.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(3)
  })
})
