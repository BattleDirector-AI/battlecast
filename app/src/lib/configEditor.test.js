import { describe, it, expect } from 'vitest'
import {
  setWidgetVisible,
  setWidgetHideWhenIdle,
  setWidgetField,
  moveWidget,
  resizeWidget,
  setCanvas,
  addLogoImage,
  removeLogoImage,
  moveLogoImage,
  setLogoRotation,
  setProducerSrc,
  buildObsUrl,
} from './configEditor.js'
import { DEFAULT_CONFIG } from './overlayConfig.js'

describe('configEditor — widget geometry/visibility', () => {
  it('toggles a widget visibility without touching others', () => {
    const next = setWidgetVisible(DEFAULT_CONFIG, 'battle', false)
    expect(next.widgets.battle.visible).toBe(false)
    expect(next.widgets.tower.visible).toBe(true)
  })

  it('toggles a widget hideWhenIdle without disturbing geometry', () => {
    const next = setWidgetHideWhenIdle(DEFAULT_CONFIG, 'battle', true)
    expect(next.widgets.battle.hideWhenIdle).toBe(true)
    expect(next.widgets.battle).toMatchObject({ x: 428, w: 440 })
  })

  it('moves a widget and clamps it onto the 1920x1080 canvas', () => {
    const next = moveWidget(DEFAULT_CONFIG, 'tower', -50, 5000)
    expect(next.widgets.tower.x).toBe(0) // clamped to >= 0
    expect(next.widgets.tower.y).toBe(1080 - next.widgets.tower.h) // clamped within canvas
  })

  it('resizes with a sane minimum', () => {
    const next = resizeWidget(DEFAULT_CONFIG, 'tower', 1, 1)
    expect(next.widgets.tower.w).toBe(16)
    expect(next.widgets.tower.h).toBe(16)
  })

  it('sets z-order via setWidgetField', () => {
    const next = setWidgetField(DEFAULT_CONFIG, 'logos', 'z', 9)
    expect(next.widgets.logos.z).toBe(9)
  })

  it('returns config unchanged for an unknown widget key', () => {
    const next = setWidgetVisible(DEFAULT_CONFIG, 'nope', false)
    expect(next.widgets.nope).toBeUndefined()
  })
})

describe('configEditor — logo rotation', () => {
  it('adds images without duplicates and removes them', () => {
    let cfg = addLogoImage(DEFAULT_CONFIG, '/logos/a.png')
    cfg = addLogoImage(cfg, '/logos/b.png')
    cfg = addLogoImage(cfg, '/logos/a.png') // dup ignored
    expect(cfg.logoRotation.images).toEqual(['/logos/a.png', '/logos/b.png'])

    cfg = removeLogoImage(cfg, '/logos/a.png')
    expect(cfg.logoRotation.images).toEqual(['/logos/b.png'])
  })

  it('reorders images and no-ops at the edges', () => {
    let cfg = { ...DEFAULT_CONFIG, logoRotation: { images: ['a', 'b', 'c'], perSlotSeconds: 8, order: 'sequential' } }
    cfg = moveLogoImage(cfg, 0, 1)
    expect(cfg.logoRotation.images).toEqual(['b', 'a', 'c'])
    cfg = moveLogoImage(cfg, 0, -1) // already at top edge for index 0
    expect(cfg.logoRotation.images).toEqual(['b', 'a', 'c'])
  })

  it('patches perSlotSeconds and order', () => {
    const cfg = setLogoRotation(DEFAULT_CONFIG, { perSlotSeconds: 4, order: 'shuffle' })
    expect(cfg.logoRotation.perSlotSeconds).toBe(4)
    expect(cfg.logoRotation.order).toBe('shuffle')
  })
})

describe('configEditor — canvas', () => {
  it('resizes the canvas and clamps the value to the minimum edge', () => {
    expect(setCanvas(DEFAULT_CONFIG, { w: 1280, h: 720 }).canvas).toEqual({ w: 1280, h: 720 })
    expect(setCanvas(DEFAULT_CONFIG, { w: 10 }).canvas.w).toBe(320)
  })

  it('re-clamps widgets that no longer fit after the canvas shrinks', () => {
    // battle default sits at x:428 w:440 (right edge 868); a 640-wide canvas must
    // pull it back onto the canvas rather than leave it hanging off the edge.
    const next = setCanvas(DEFAULT_CONFIG, { w: 640, h: 480 })
    const b = next.widgets.battle
    expect(b.x + b.w).toBeLessThanOrEqual(640)
    expect(b.y + b.h).toBeLessThanOrEqual(480)
  })

  it('leaves the untouched dimension unchanged when patching one edge', () => {
    const next = setCanvas(DEFAULT_CONFIG, { h: 720 })
    expect(next.canvas.w).toBe(DEFAULT_CONFIG.canvas.w)
    expect(next.canvas.h).toBe(720)
  })

  it('treats a blank edge as "keep current", not zero', () => {
    // A cleared input commits '' — must not collapse the canvas to the minimum.
    const next = setCanvas(DEFAULT_CONFIG, { w: '' })
    expect(next.canvas.w).toBe(DEFAULT_CONFIG.canvas.w)
  })

  it('does not shrink widgets when the canvas stays large enough', () => {
    const next = setCanvas(DEFAULT_CONFIG, { w: 1280, h: 720 })
    expect(next.widgets.tower).toMatchObject({ x: 24, w: 380 })
  })
})

describe('configEditor — producer + OBS URL', () => {
  it('sets the producer src', () => {
    const cfg = setProducerSrc(DEFAULT_CONFIG, 'http://host:9/events')
    expect(cfg.producer.src).toBe('http://host:9/events')
  })

  it('builds an OBS URL with profile and producer params', () => {
    expect(buildObsUrl({ origin: 'http://localhost:5397', profileName: 'race', producerSrc: 'http://p:8/events' })).toBe(
      'http://localhost:5397/all?profile=race&src=http%3A%2F%2Fp%3A8%2Fevents',
    )
  })

  it('omits empty params', () => {
    expect(buildObsUrl({ origin: 'http://x', profileName: 'race' })).toBe('http://x/all?profile=race')
    expect(buildObsUrl({ profileName: '', producerSrc: '' })).toBe('/all')
  })
})
