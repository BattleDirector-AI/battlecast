import { describe, it, expect } from 'vitest'
import { isWidgetIdle, widgetSupportsAutoHide } from './widgetIdle.js'
import closeBattle from '../../../spec/v1/fixtures/race-close-battle.json'
import idleBattle from '../../../spec/v1/fixtures/race-idle-battle.json'
import noSubject from '../../../spec/v1/fixtures/driver-no-subject.json'

describe('widgetIdle — which widgets support auto-hide', () => {
  it('reports support only for widgets with a predicate', () => {
    expect(widgetSupportsAutoHide('battle')).toBe(true)
    expect(widgetSupportsAutoHide('logos')).toBe(true)
    expect(widgetSupportsAutoHide('driver')).toBe(true)
    expect(widgetSupportsAutoHide('tower')).toBe(false)
    expect(widgetSupportsAutoHide('nope')).toBe(false)
  })
})

describe('widgetIdle — idle predicates', () => {
  it('battle is idle in clear air (no neighbors), active in a battle', () => {
    expect(isWidgetIdle('battle', { snapshot: idleBattle })).toBe(true)
    expect(isWidgetIdle('battle', { snapshot: closeBattle })).toBe(false)
  })

  it('logos is idle with no valid rotation images', () => {
    expect(isWidgetIdle('logos', { config: { logoRotation: { images: [] } } })).toBe(true)
    expect(isWidgetIdle('logos', { config: { logoRotation: { images: ['  ', ''] } } })).toBe(true)
    expect(isWidgetIdle('logos', { config: { logoRotation: { images: ['/logos/a.png'] } } })).toBe(false)
  })

  it('driver is idle with no valid subject, active with one on camera', () => {
    expect(isWidgetIdle('driver', { snapshot: noSubject })).toBe(true)
    expect(isWidgetIdle('driver', { snapshot: closeBattle })).toBe(false)
  })

  it('a widget without a predicate is never idle', () => {
    expect(isWidgetIdle('tower', { snapshot: idleBattle })).toBe(false)
  })
})
