/* Battle box — class tags in a single-class session (widgets.md rules 60, 62, ADR 0022).
 * The box reads `session.multiclass` from the `session` it already receives and the broadcaster
 * setting as `classTags`. `race-single-class.json` puts Jacobs (car-7, class "Default") on camera
 * in an active battle with `session.multiclass: false`. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import classBest from '../../../../spec/v1/fixtures/race-class-best.json'

afterEach(() => cleanup())

function renderBox(fixture, { session = fixture.session, classTags } = {}) {
  const props = {
    subject: fixture.subject,
    relationship: fixture.relationship,
    vehicles: fixture.vehicles,
    mode: fixture.mode,
    session: session ?? null,
  }
  if (classTags !== undefined) props.classTags = classTags
  return render(BattleBox, { props })
}

const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())

/** The box still renders its battle: subject name and both gaps. */
function expectBattle(container) {
  expect(container.textContent).toContain('Jacobs')
  expect(container.textContent).toContain('+0.6')
  expect(container.textContent).toContain('+1.1')
}

describe('battle box class chip', () => {
  it('auto + multiclass false: no class chip, the battle otherwise unchanged', () => {
    const { container } = renderBox(singleClass, { classTags: 'auto' })
    expectBattle(container)
    expect(chips(container)).toEqual([])
    expect(container.textContent).not.toMatch(/DEFAULT/i)
  })

  it('auto is the default when the box is given no classTags', () => {
    const { container } = renderBox(singleClass)
    expectBattle(container)
    expect(chips(container)).toEqual([])
  })

  it('auto + multiclass absent: the chip shows', () => {
    const { container } = renderBox(singleClass, { session: { flag: 'green' }, classTags: 'auto' })
    expectBattle(container)
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('auto + multiclass true: the chip shows', () => {
    const { container } = renderBox(singleClass, { session: { multiclass: true }, classTags: 'auto' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('show + multiclass false: the chip shows', () => {
    const { container } = renderBox(singleClass, { classTags: 'show' })
    expectBattle(container)
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('hide + a multi-class field with no flag: no chip', () => {
    // race-class-best: Alonso (GT3) on camera, gap behind 4.2, no session object.
    const { container } = renderBox(classBest, { classTags: 'hide' })
    expect(container.textContent).toContain('Alonso')
    expect(chips(container)).toEqual([])
    expect(container.textContent).not.toMatch(/GT3/)
  })
})
