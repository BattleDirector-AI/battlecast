/* The chip-face resolver the vintage chip tests share, over the real token CSS (#412, #419).
 *
 * The tower, /grid and /results tests trust it to say "this face cannot render upright", so it
 * must say so for the face the bug shipped with (Barlow, bundled italic only) and not only agree
 * with the fix.
 */
import { describe, it, expect } from 'vitest'
import { chipFace } from './chipFace.js'

describe('chipFace', () => {
  it("vintage70's label face (Barlow) has no upright cut at the chip's weight", () => {
    expect(chipFace('vintage70', 'var(--bc-font-ui)')).toEqual({
      token: '--bc-font-ui',
      family: 'Barlow',
      weight: 700,
      upright: false,
    })
  })

  it("vintage70's display face (Barlow Condensed) has one", () => {
    expect(chipFace('vintage70', 'var(--bc-font-display)')).toEqual({
      token: '--bc-font-display',
      family: 'Barlow Condensed',
      weight: 700,
      upright: true,
    })
  })

  it('a weight the face is bundled at in italic only: not upright', () => {
    // Barlow Condensed ships italic 800 but no normal 800: the style, not just the weight, decides.
    expect(chipFace('vintage70', 'var(--bc-font-display)', 800).upright).toBe(false)
  })

  it('no font token named: not upright', () => {
    expect(chipFace('vintage70', undefined).upright).toBe(false)
    expect(chipFace('vintage70', "'Barlow Condensed'").upright).toBe(false)
  })
})
