/* /results — class tags in a single-class session (widgets.md rules 60, 64, ADR 0022). With the
 * tags hidden the slide drops its class group headers and numbers each row by its overall
 * position, not a class position. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import ResultsSlide from './ResultsSlide.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const withSession = (fixture, session) => ({ ...fixture, session })
const slide = (c) => c.querySelector('[data-testid="results-slide"]')
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const rowPositions = (c) =>
  Array.from(c.querySelectorAll('[data-testid="results-row"]')).map((el) =>
    el.querySelector('.row__pos').textContent.trim(),
  )
const rowNames = (c) =>
  Array.from(c.querySelectorAll('[data-testid="results-row"] [data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )

function expectFlat(container, positions) {
  expect(chips(container), 'a class chip still renders').toEqual([])
  expect(slide(container).textContent, 'a per-class car count still renders').not.toMatch(/\bcars\b/)
  expect(rowPositions(container)).toEqual(positions)
  for (const row of container.querySelectorAll('[data-testid="results-row"]')) {
    expect(row.querySelector('.row__classbar'), 'class bar dropped').not.toBeNull()
  }
}

describe('results slide class tags', () => {
  it('auto + multiclass false: no group header, no chip', () => {
    const { container } = render(ResultsSlide, { snapshot: singleClass, classTags: 'auto' })
    expectFlat(container, ['1', '2', '3', '4'])
    expect(slide(container).textContent).not.toMatch(/DEFAULT/i)
  })

  it('auto is the default when the slide is given no classTags', () => {
    const { container } = render(ResultsSlide, { snapshot: singleClass })
    expect(container.querySelectorAll('[data-testid="results-row"]')).toHaveLength(4)
    expect(chips(container)).toEqual([])
  })

  it('auto + multiclass absent: the class group header shows', () => {
    const { container } = render(ResultsSlide, { snapshot: withSession(singleClass, {}), classTags: 'auto' })
    expect(chips(container)).toEqual(['DEFAULT'])
    expect(slide(container).textContent).toMatch(/4 cars/)
  })

  it('show + multiclass false: the class group header shows', () => {
    const { container } = render(ResultsSlide, { snapshot: singleClass, classTags: 'show' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('hide + a multi-class session: overall positions in overall order, not class positions', () => {
    const { container } = render(ResultsSlide, { snapshot: multiClass, classTags: 'hide' })
    expectFlat(container, ['1', '2', '3', '4', '5', '6'])
    expect(rowNames(container)).toEqual(['Verstappen', 'Alonso', 'Hamilton', 'Rossi', 'Albon', 'Bourdais'])
    expect(slide(container).textContent).not.toMatch(/GTP|GT3|LMP2/)
  })

  it('hide + ?class= filter: the filtered cars at their overall positions, no filter chip', () => {
    const { container } = render(ResultsSlide, { snapshot: multiClass, classFilter: 'gt3', classTags: 'hide' })
    expect(container.querySelector('[data-testid="results-filter"] .bc-class-chip')).toBeNull()
    expectFlat(container, ['2', '5'])
    expect(rowNames(container)).toEqual(['Alonso', 'Albon'])
  })
})
