/* Row-budget border drift guard (#320). happy-dom does no layout, so the 1px dividers the row
 * budget assumes cannot be measured. Read them from the component CSS instead (as
 * AllView.textScale.test.js does for typography.css): chrome = header + root borders (measured) with
 * the header divider cancelling the dropped last-row divider, row cost = row + 1.
 * A divider that changes width without the budget changing makes this go red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'StandingsTower.svelte'), 'utf8')
const css = src.slice(src.indexOf('<style'))
const FIX = 'update the `rowBudget` line in StandingsTower.svelte (computeRowBudget(slotHeight, header + borderY, row + 1)) with it'

/** Every declaration block of a `.selector { ... }` rule in the component CSS (a rule may recur,
 *  e.g. inside `@supports not (subgrid)`). */
function rules(selector) {
  const escaped = selector.replaceAll('.', String.raw`\.`)
  const re = new RegExp(String.raw`^\s*${escaped}\s*\{([^}]*)\}`, 'gm')
  const blocks = [...css.matchAll(re)].map((m) => m[1])
  expect(blocks.length, `${selector} rule not found in StandingsTower.svelte`).toBeGreaterThan(0)
  return blocks
}

describe('StandingsTower row budget — divider widths the budget assumes', () => {
  it('the header divider is a 1px border-bottom', () => {
    for (const block of rules('.tower__header')) {
      expect(block, `header divider changed: ${FIX}`).toMatch(/border-bottom:\s*1px solid/)
    }
  })
  it('a row divider is a 1px border-bottom, in every .row block', () => {
    const blocks = rules('.row')
    expect(blocks.length, 'the @supports not (subgrid) .row block is covered too').toBeGreaterThanOrEqual(2)
    expect(blocks.some((b) => /border-bottom:\s*1px solid/.test(b)), `row divider changed: ${FIX}`).toBe(true)
    for (const block of blocks) {
      expect(block, `row border-bottom widened: ${FIX}`).not.toMatch(/border-bottom:\s*(?!1px\b|none)\S/)
      expect(block, `row gained a top border: ${FIX}`).not.toMatch(/border-top/)
      expect(block, `row gained a border shorthand: ${FIX}`).not.toMatch(/(^|[;\s])border:/)
      expect(block, `row gained a margin: ${FIX}`).not.toMatch(/margin/)
    }
  })
  it('the last row drops its divider', () => {
    for (const block of rules('.row--last')) {
      expect(block, `last-row divider changed: ${FIX}`).toMatch(/border-bottom:\s*none/)
    }
  })
})
