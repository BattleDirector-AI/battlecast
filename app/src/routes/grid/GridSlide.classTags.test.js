/* /grid — class tags in a single-class session (widgets.md rules 60, 64, ADR 0022). With the
 * tags hidden the slide drops its class group headers and renders one list in overall position
 * order. `race-single-class.json` says `session.multiclass: false` over four "Default" cars;
 * `grid-multiclass.json` says `true` over GTP / GT3 / LMP2. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import GridSlide from './GridSlide.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const withSession = (fixture, session) => ({ ...fixture, session })
const slide = (c) => c.querySelector('[data-testid="grid-slide"]')
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const cellPositions = (c) =>
  Array.from(c.querySelectorAll('[data-testid="grid-cell"]')).map((el) =>
    el.querySelector('.cell__pos').textContent.trim(),
  )
const cellNames = (c) =>
  Array.from(c.querySelectorAll('[data-testid="grid-cell"] [data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )

function expectFlat(container, positions) {
  expect(chips(container), 'a class chip still renders').toEqual([])
  expect(slide(container).textContent, 'a per-class car count still renders').not.toMatch(/\bcars\b/)
  expect(cellPositions(container)).toEqual(positions)
  for (const cell of container.querySelectorAll('[data-testid="grid-cell"]')) {
    expect(cell.querySelector('.cell__classbar'), 'class bar dropped').not.toBeNull()
  }
}

describe('grid slide class tags', () => {
  it('auto + multiclass false: no group header, no chip', () => {
    const { container } = render(GridSlide, { snapshot: singleClass, classTags: 'auto' })
    expectFlat(container, ['1', '2', '3', '4'])
    expect(slide(container).textContent).not.toMatch(/DEFAULT/i)
  })

  it('auto is the default when the slide is given no classTags', () => {
    const { container } = render(GridSlide, { snapshot: singleClass })
    expect(container.querySelectorAll('[data-testid="grid-cell"]')).toHaveLength(4)
    expect(chips(container)).toEqual([])
  })

  it('auto + multiclass absent: the class group header shows', () => {
    const { container } = render(GridSlide, { snapshot: withSession(singleClass, {}), classTags: 'auto' })
    expect(chips(container)).toEqual(['DEFAULT'])
    expect(slide(container).textContent).toMatch(/4 cars/)
  })

  it('show + multiclass false: the class group header shows', () => {
    const { container } = render(GridSlide, { snapshot: singleClass, classTags: 'show' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('hide + a multi-class session: one list in overall position order, no headers', () => {
    const { container } = render(GridSlide, { snapshot: multiClass, classTags: 'hide' })
    expectFlat(container, ['1', '2', '3', '4', '5', '6'])
    expect(cellNames(container)).toEqual(['Verstappen', 'Alonso', 'Hamilton', 'Rossi', 'Albon', 'Bourdais'])
    expect(slide(container).textContent).not.toMatch(/GTP|GT3|LMP2/)
  })

  it('hide + ?class= filter: the filtered cars, no filter chip', () => {
    const { container } = render(GridSlide, { snapshot: multiClass, classFilter: 'gt3', classTags: 'hide' })
    expect(container.querySelector('[data-testid="grid-filter"] .bc-class-chip')).toBeNull()
    expectFlat(container, ['2', '5'])
    expect(cellNames(container)).toEqual(['Alonso', 'Albon'])
  })
})
