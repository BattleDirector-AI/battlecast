/* Tower table columns — widgets.md rules 49-53, how/renderer.md "Tower columns", ADR 0020.
 *
 * happy-dom does no layout and applies no component CSS, so the shared tracks themselves
 * (subgrid), the 72px chip cap, alignment within a cell and the zero-height sizer rows are a
 * headless-Chromium check. What the DOM carries, and what these tests assert:
 *   - the grid `[data-testid="tower-grid"]` with `data-columns` (the shown columns, in order)
 *     and an inline `grid-template-columns` of one track per column:
 *     `minmax(max-content, 1fr)` for `name` (no fixed floor, rule 53), `max-content` otherwise;
 *   - every rendered row, and every sizer row, has exactly one `data-col` cell per column, in
 *     that order, with empty cells (no text, no data-testid) where a car has nothing to show;
 *   - sizer rows `[data-testid="tower-sizer-row"]` for the class-filtered cars that are not
 *     rendered, carrying no data-testid on any cell.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'
import partial from '../../../../spec/v1/fixtures/race-tower-partial.json'
import finished from '../../../../spec/v1/fixtures/race-finish.json'
import qualifying from '../../../../spec/v1/fixtures/qualifying-sector-a.json'

afterEach(() => cleanup())

const grid = () => document.querySelector('[data-testid="tower-grid"]')
const columns = () => (grid()?.getAttribute('data-columns') ?? '').split(' ').filter(Boolean)
const template = () => grid()?.style.gridTemplateColumns ?? ''
const cellsOf = (row) => Array.from(row.children).filter((el) => el.hasAttribute('data-col'))
const colsOf = (row) => cellsOf(row).map((el) => el.getAttribute('data-col'))
const rows = () => Array.from(document.querySelectorAll('[data-testid="tower-row"]'))
const sizers = () => Array.from(document.querySelectorAll('[data-testid="tower-sizer-row"]'))
const cell = (row, col) => cellsOf(row).find((el) => el.getAttribute('data-col') === col)
const rowFor = (slot) => document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"]`)
const trackFor = (col) => (col === 'name' ? 'minmax(max-content, 1fr)' : 'max-content')
const expectedTemplate = (cols) => cols.map(trackFor).join(' ')

/** Every row's cells match the grid's columns, in order. */
function expectAligned(rowList) {
  const cols = columns()
  expect(cols.length, 'the grid lists no columns').toBeGreaterThan(0)
  for (const row of rowList) expect(colsOf(row), `row ${row.getAttribute('data-slot')}`).toEqual(cols)
}

describe('table columns — inline layout (rules 49, 53)', () => {
  it('lists the default columns and gives the grid one shared track per column', () => {
    render(StandingsTower, { snapshot: multiClass, metrics: { interval: true } })
    expect(columns()).toEqual(['pos', 'class', 'classpos', 'name', 'gap', 'interval'])
    // The name track's minimum is its content (no 4em floor); every other track is its content.
    expect(template()).toBe(
      'max-content max-content max-content minmax(max-content, 1fr) max-content max-content',
    )
  })

  it('gives every row the same cells in the same order', () => {
    render(StandingsTower, { snapshot: multiClass, metrics: { interval: true } })
    expect(rows().length).toBe(6)
    expectAligned(rows())
  })

  it('omits the interval column when the interval metric is off', () => {
    render(StandingsTower, { snapshot: multiClass, metrics: {} })
    expect(columns()).toEqual(['pos', 'class', 'classpos', 'name', 'gap'])
    expect(template()).toBe(expectedTemplate(columns()))
    expectAligned(rows())
  })

  it('puts the class chip and the class badge in their own cells', () => {
    render(StandingsTower, { snapshot: multiClass })
    const row = rowFor('car-8')
    expect(cell(row, 'class')?.textContent.trim()).toBe('LMP2')
    expect(cell(row, 'classpos')?.textContent.trim()).toBe('1/2')
    expect(cell(row, 'name')?.textContent.trim()).toBe('ROS')
    expect(cell(row, 'pos')?.textContent.trim()).toBe('4')
  })
})

describe('table columns — strategy cells and empty cells (rule 49)', () => {
  const ALL = { interval: true, pit: true, tire: true, fuel: true }

  it('shows a strategy column when any car in the field carries its field, with empty cells for the rest', () => {
    // race-tower-partial: pit on car-44/car-16, tire on car-1, fuel on car-4.
    render(StandingsTower, { snapshot: partial, metrics: ALL })
    expect(columns()).toEqual(['pos', 'class', 'classpos', 'name', 'gap', 'interval', 'pit', 'tire', 'fuel'])
    expect(template()).toBe(expectedTemplate(columns()))
    expectAligned(rows())

    // car-1 has no pit data: its pit cell is present, empty, and carries no hook.
    const empty = cell(rowFor('car-1'), 'pit')
    expect(empty, 'car-1 has no pit cell').toBeTruthy()
    expect(empty.textContent.trim()).toBe('')
    expect(empty.hasAttribute('data-testid')).toBe(false)
    expect(empty.hasAttribute('title')).toBe(false)

    // car-44's filled pit cell keeps its hook.
    expect(cell(rowFor('car-44'), 'pit')?.getAttribute('data-testid')).toBe('row-pit')
  })

  it('omits a strategy column whose field no car in the field carries', () => {
    const noFuel = {
      ...partial,
      vehicles: partial.vehicles.map((v) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'fuel'))),
    }
    render(StandingsTower, { snapshot: noFuel, metrics: ALL })
    expect(columns()).not.toContain('fuel')
    expect(columns()).toContain('pit')
    expectAligned(rows())
  })

  it('shows the pit column from the first snapshot when every car sends pit_stops: 0', () => {
    const zeros = {
      ...multiClass,
      vehicles: multiClass.vehicles.map((v) => ({ ...v, pit_stops: 0, in_pit: false })),
    }
    render(StandingsTower, { snapshot: zeros, metrics: { interval: true, pit: true } })
    expect(columns()).toEqual(['pos', 'class', 'classpos', 'name', 'gap', 'interval', 'pit'])
    expect(template()).toBe(expectedTemplate(columns()))
    expectAligned(rows())
    // Nobody has stopped: every pit cell is present and empty, and no filled pit cell shows.
    for (const row of rows()) expect(cell(row, 'pit')?.textContent.trim(), row.getAttribute('data-slot')).toBe('')
    expect(document.querySelectorAll('[data-testid="row-pit"]').length).toBe(0)
  })

  it('omits the suppressed columns in a lap-timed mode (rule 8)', () => {
    const lapTimed = { ...partial, mode: 'qualifying' }
    render(StandingsTower, { snapshot: lapTimed, metrics: ALL })
    // pit and fuel are suppressed outright; tire stays because car-1 has a compound.
    expect(columns()).not.toContain('pit')
    expect(columns()).not.toContain('fuel')
    expect(columns()).toContain('tire')
    expectAligned(rows())
  })

  it('adds the finish column while the finish slot is reserved, with empty cells for cars without a chip', () => {
    render(StandingsTower, { snapshot: finished, metrics: { interval: true } })
    expect(columns().at(-1)).toBe('finish')
    expect(template()).toBe(expectedTemplate(columns()))
    expectAligned(rows())
    // car-77 (finish_status 0) has an empty finish cell.
    expect(cell(rowFor('car-77'), 'finish')?.textContent.trim()).toBe('')
  })

  it('has no finish column outside race and results', () => {
    render(StandingsTower, { snapshot: qualifying, metrics: { interval: true } })
    expect(columns()).toEqual(['pos', 'class', 'classpos', 'name', 'gap', 'interval'])
  })
})

describe('table columns — the whole class-filtered field sizes the columns (rule 50)', () => {
  it('keeps a sizer row, with the same cells, for every car the overflow leaves out', () => {
    render(StandingsTower, { snapshot: multiClass, metrics: { interval: true }, maxRows: 3 })
    expect(rows().map((r) => r.getAttribute('data-slot'))).toEqual(['car-1', 'car-14', 'car-44'])
    const s = sizers()
    expect(s.map((r) => r.getAttribute('data-slot'))).toEqual(['car-8', 'car-23', 'car-31'])
    for (const row of s) expect(row.getAttribute('aria-hidden')).toBe('true')
    expectAligned(s)
    // The sizer cells carry the content that sizes the tracks: car-8's class chip.
    expect(cell(s[0], 'class')?.textContent.trim()).toBe('LMP2')
  })

  it("fills a sizer row's name and class-rank cells, in the current name style", () => {
    render(StandingsTower, { snapshot: multiClass, maxRows: 3 })
    const s = sizers()
    expect(s.map((r) => cell(r, 'name')?.textContent.trim())).toEqual(['ROS', 'ALB', 'BOU'])
    expect(s.map((r) => cell(r, 'classpos')?.textContent.trim())).toEqual(['1/2', '2/2', '2/2'])
    cleanup()

    const twoWord = {
      ...multiClass,
      vehicles: multiClass.vehicles.map((v) => (v.slot_id === 'car-8' ? { ...v, driver_name: 'Valentino Rossi' } : v)),
    }
    render(StandingsTower, { snapshot: twoWord, maxRows: 3, nameStyle: 'full' })
    expect(sizers().map((r) => cell(r, 'name')?.textContent.trim())).toEqual(['V. Rossi', 'Albon', 'Bourdais'])
  })

  it('puts no data-testid inside a sizer row, so rendered-row selectors are unaffected', () => {
    render(StandingsTower, { snapshot: multiClass, maxRows: 3 })
    expect(sizers().length, 'expected three sizer rows').toBe(3)
    for (const row of sizers()) expect(row.querySelectorAll('[data-testid]').length).toBe(0)
    expect(document.querySelectorAll('[data-testid="driver-name"]').length).toBe(3)
  })

  it('keeps sizer rows inside the grid', () => {
    render(StandingsTower, { snapshot: multiClass, maxRows: 3 })
    expect(sizers().length).toBe(3)
    for (const row of sizers()) expect(grid().contains(row)).toBe(true)
  })

  it('has sizer rows only for cars that pass the class filter', () => {
    render(StandingsTower, { snapshot: multiClass, maxRows: 1, classFilter: 'GTP' })
    expect(rows().map((r) => r.getAttribute('data-slot'))).toEqual(['car-1'])
    expect(sizers().map((r) => r.getAttribute('data-slot'))).toEqual(['car-44'])
  })

  it('has no sizer rows when every car is rendered', () => {
    render(StandingsTower, { snapshot: multiClass })
    expect(rows().length).toBe(6)
    expect(sizers().length).toBe(0)
    expect(grid(), 'the grid exists even with no sizer rows').toBeTruthy()
  })
})

describe('table columns — grouped layout (rule 51)', () => {
  it('shares one grid across every group, without the class badge column', () => {
    render(StandingsTower, { snapshot: multiClass, classDisplay: 'grouped', metrics: { interval: true } })
    expect(columns()).toEqual(['pos', 'class', 'name', 'gap', 'interval'])
    expect(template()).toBe(expectedTemplate(columns()))
    const groups = document.querySelectorAll('[data-testid="tower-group"]')
    expect(groups.length).toBe(3)
    for (const g of groups) expect(grid().contains(g), 'every group sits inside the one grid').toBe(true)
    expectAligned(rows())
  })

  it('keeps the group headers out of the columns', () => {
    render(StandingsTower, { snapshot: multiClass, classDisplay: 'grouped' })
    const heads = document.querySelectorAll('[data-testid="tower-group"] > header')
    expect(heads.length).toBe(3)
    expect(columns().length, 'the grid lists no columns').toBeGreaterThan(0)
    for (const head of heads) {
      expect(grid().contains(head), 'group headers sit in the grid').toBe(true)
      expect(head.querySelectorAll('[data-col]').length).toBe(0)
    }
  })
})

describe('table columns — full name style uses the same columns (rules 48, 49)', () => {
  it('lists the same columns and track list in full style', () => {
    render(StandingsTower, { snapshot: multiClass, metrics: { interval: true }, nameStyle: 'full' })
    expect(columns()).toEqual(['pos', 'class', 'classpos', 'name', 'gap', 'interval'])
    expect(template()).toBe(expectedTemplate(columns()))
    expectAligned(rows())
  })
})
