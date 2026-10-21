// /all shows one on-camera name everywhere — widgets.md rules 14b and 65. Driven from
// race-close-battle.json (subject car-1, P2) with the subject's name blanked and the matched
// vehicle's name set; the battle box's focus slot and the driver lower-third's name cell must
// read the same.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

const CFG = normalizeConfig({
  widgets: { battle: { visible: true }, driver: { visible: true, trigger: 'persistent' } },
})
const q = (el, sel) => el?.querySelector(sel)?.textContent.trim()

describe('/all — a blank subject.driver_name reads the same in the battle box and the driver lower-third', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('a name that is %s: both show the matched vehicle\'s name', async (_label, blank) => {
    const snap = structuredClone(closeBattle)
    snap.subject.driver_name = blank
    snap.vehicles.find((v) => v.slot_id === 'car-1').driver_name = 'Max Verstappen'
    const { container } = render(AllView, { snapshot: snap, config: CFG })
    await tick()

    const card = q(container, '[data-testid="driver-lt-name"]')
    expect(card).toContain('Verstappen')
    expect(q(container, '[data-testid="widget-battle"] .bc-battle__focus-name')).toBe(card)
  })
})
