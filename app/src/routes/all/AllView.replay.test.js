/* The replay badge inside `/all` (#60): widgets.md rule 120, overlay-config.md rule 70. ADR 0039.
 * Drives AllView with race-close-battle.json, with only `mode` changed, and a normalized profile. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import base from '../../../../spec/v1/fixtures/race-close-battle.json'

const withMode = (mode) => ({ ...structuredClone(base), mode })

let view
async function mount(props) {
  view = render(AllView, props)
  await tick()
  flushSync()
}
const slot = (key) => view.container.querySelector(`[data-testid="widget-${key}"]`)
const badgeIn = (key) => slot(key)?.querySelector('[data-testid="replay-badge"]') ?? null

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/all — the replay widget (widgets rule 120, overlay-config rule 70)', () => {
  it('is placed by default at its default geometry and shows REPLAY during a replay', async () => {
    await mount({ snapshot: withMode('replay') })
    expect(slot('replay'), 'no replay slot in the default /all layout').not.toBeNull()
    expect(slot('replay').style.left).toBe('1656px')
    expect(slot('replay').style.top).toBe('168px')
    expect(slot('replay').style.width).toBe('240px')
    expect(slot('replay').style.height).toBe('56px')
    expect(slot('replay').style.zIndex).toBe('11')
    expect(badgeIn('replay')?.textContent.trim()).toBe('REPLAY')
  })

  it('draws nothing in its slot outside a replay', async () => {
    await mount({ snapshot: withMode('race') })
    expect(slot('replay'), 'no replay slot in the default /all layout').not.toBeNull()
    expect(badgeIn('replay')).toBeNull()
  })

  it('follows mode from snapshot to snapshot', async () => {
    await mount({ snapshot: withMode('race') })
    expect(slot('replay')).not.toBeNull()
    await view.rerender({ snapshot: withMode(' Replay ') })
    flushSync()
    expect(badgeIn('replay'), 'no badge once the replay starts').not.toBeNull()
    await view.rerender({ snapshot: withMode('race') })
    flushSync()
    expect(badgeIn('replay'), 'the badge stayed after the replay').toBeNull()
  })

  it('reads its own geometry from the profile', async () => {
    await mount({
      snapshot: withMode('replay'),
      config: normalizeConfig({ widgets: { replay: { x: 40, y: 600, w: 200, h: 50, z: 30 } } }),
    })
    expect(slot('replay').style.left).toBe('40px')
    expect(slot('replay').style.top).toBe('600px')
    expect(slot('replay').style.width).toBe('200px')
    expect(slot('replay').style.zIndex).toBe('30')
    expect(badgeIn('replay')).not.toBeNull()
  })

  it('is not mounted while not visible', async () => {
    await mount({ snapshot: withMode('replay') })
    expect(slot('replay'), 'no replay slot while visible').not.toBeNull()
    await view.rerender({
      snapshot: withMode('replay'),
      config: normalizeConfig({ widgets: { replay: { visible: false } } }),
    })
    flushSync()
    expect(slot('replay')).toBeNull()
    expect(view.container.querySelector('[data-testid="replay-badge"]')).toBeNull()
  })

  it('a saved hideWhenIdle: true changes nothing', async () => {
    await mount({
      snapshot: withMode('replay'),
      config: normalizeConfig({ widgets: { replay: { hideWhenIdle: true } } }),
    })
    expect(badgeIn('replay'), 'hideWhenIdle hid the badge during a replay').not.toBeNull()
  })
})
