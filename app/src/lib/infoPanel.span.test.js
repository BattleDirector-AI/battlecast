/* The info panel's width and place when a long header widens it — widgets.md rule 78a,
 * ADR 0037, how/renderer.md "A long header widens the panel".
 *
 * happy-dom does no layout, so the header's measured need cannot be produced here; this file
 * pins the arithmetic the panel applies to it, in canvas px. The expected values are worked from
 * the rule's own words (keep the slot's left edge, add on the left only what the canvas has no
 * room for on the right, never past the canvas's left edge, always cover the slot), not from the
 * formula, so a wrong formula fails.
 */
import { describe, it, expect } from 'vitest'
import { infoPanelSpan } from './infoPanel.js'

// The default `info` slot (overlay-config rule 52) on the default 1920 px canvas.
const DEFAULT = { slotLeft: 1200, slotWidth: 696, canvasWidth: 1920 }

describe('width: the wider of the slot and the header need (rule 78a)', () => {
  it('a header that fits leaves the panel exactly in its slot', () => {
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 410 })).toEqual({ left: 1200, width: 696 })
  })

  it('a header exactly as wide as the slot does not move or widen it', () => {
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 696 })).toEqual({ left: 1200, width: 696 })
  })

  it('no header (null need) leaves the panel at its slot', () => {
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: null })).toEqual({ left: 1200, width: 696 })
  })

  it('a header wider than the slot makes the panel exactly as wide as the header needs', () => {
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 712 }).width).toBe(712)
  })
})

describe('place: keep the left edge, borrow on the left only at the canvas edge (rule 78a)', () => {
  it('while there is room on the right, the left edge stays on the slot', () => {
    // 1200 + 700 = 1900, inside the 1920 canvas.
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 700 })).toEqual({ left: 1200, width: 700 })
  })

  it('filling exactly to the canvas edge still keeps the left edge', () => {
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 720 })).toEqual({ left: 1200, width: 720 })
  })

  it('past the canvas edge, the right edge sits on the canvas edge and the rest goes left', () => {
    // 900 wide from 1200 would end at 2100: 180 px past 1920, so it starts 180 px left of the slot.
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 900 })).toEqual({ left: 1020, width: 900 })
  })

  it('never extends left past the canvas left edge; the excess runs off the right', () => {
    expect(infoPanelSpan({ ...DEFAULT, headerNeed: 2000 })).toEqual({ left: 0, width: 2000 })
  })

  it('a slot already past the canvas edge keeps its right edge and widens left only', () => {
    // Slot 1800..2496. 800 wide: 104 px more than the slot, all of it on the left.
    expect(infoPanelSpan({ slotLeft: 1800, slotWidth: 696, canvasWidth: 1920, headerNeed: 800 })).toEqual({
      left: 1696,
      width: 800,
    })
  })

  it('a slot already past the canvas edge with a short header stays put', () => {
    expect(infoPanelSpan({ slotLeft: 1800, slotWidth: 696, canvasWidth: 1920, headerNeed: 300 })).toEqual({
      left: 1800,
      width: 696,
    })
  })

  it('works on any canvas (a 1280 px profile canvas or an /info viewport)', () => {
    // Standalone /info at 1280: slot is the content box 48..1232; a 1250 px panel ends at 1298,
    // 18 px past 1280, so it starts at 30.
    expect(infoPanelSpan({ slotLeft: 48, slotWidth: 1184, canvasWidth: 1280, headerNeed: 1250 })).toEqual({
      left: 30,
      width: 1250,
    })
  })
})
