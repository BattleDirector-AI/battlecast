// The battle box on a `vehicles[]` array holding non-object entries — widgets.md rule 59 (and
// rule 14a, which it follows). Driven from race-close-battle.json: subject car-1 Verstappen (P2,
// F1) with Hamilton ahead (P1) and Leclerc behind (P3).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

describe('rule 59 — non-object vehicles[] entries are skipped', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-1'],
  ])('renders the subject\'s class and the ahead/behind names when vehicles[] holds %s', (_label, junk) => {
    const { container } = render(BattleBox, {
      props: {
        subject: closeBattle.subject,
        relationship: closeBattle.relationship,
        vehicles: [junk, ...closeBattle.vehicles, junk],
        mode: closeBattle.mode,
      },
    })
    const text = container.textContent

    expect(text).toContain('Verstappen')
    expect(text).toContain('Hamilton')
    expect(text).toContain('Leclerc')
    expect(text).toContain('+0.4')
    expect(text).toContain('F1')
  })
})

describe('a producer sending vehicles as a non-array', () => {
  it.each([
    ['an object', {}],
    ['a string', 'car-1'],
    ['null', null],
  ])('renders the battle box without throwing when vehicles is %s', (_label, junk) => {
    const { container } = render(BattleBox, {
      props: {
        subject: closeBattle.subject,
        relationship: closeBattle.relationship,
        vehicles: junk,
        mode: closeBattle.mode,
      },
    })

    expect(container.textContent).toContain('CLOSING')
    expect(container.textContent).toContain('Verstappen')
    expect(container.textContent).toContain('+0.4')
    // Rendered as if vehicles were empty: no neighbours resolved, no class chip.
    const slot = (which) => container.querySelector(`.bc-battle__slot--${which} .bc-battle__slot-name`)
    expect(slot('ahead').textContent.trim()).toBe('—')
    expect(slot('behind').textContent.trim()).toBe('—')
    expect(container.querySelector('.bc-class-chip')).toBeNull()
  })
})
