/* Info panel — header, line list, hiding, rotation, and a changed list (#62).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 76-80, ADR 0024. Drives the bare widget
 * (props `snapshot`, `dwellSeconds`, `lines`; how/renderer.md) with spec/v1 snapshots built
 * from event-info.json and asserts the rendered panel under fake timers. Runs under the global
 * reduced-motion default (test-setup.js), so a line replaces another at once with no
 * crossfade; the animated path is InfoPanel.motion.test.js.
 *
 * event-info.json carries event { name: "Spa 6 Hours", round: 3, track: "Spa-Francorchamps" }
 * and three info_lines: "Live from the Ardennes", "Race 2 starts at 15:00 CET", "Kevin Estre
 * leads the Porsche charge into the final hour".
 *
 * The component is loaded through a non-static specifier so its absence fails each test with
 * a message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import fixture from '../../../../spec/v1/fixtures/event-info.json'

const MODULE = './InfoPanel.svelte'
async function loadPanel() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/info/InfoPanel.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const [L0, L1, L2] = fixture.info_lines
const HEADER = 'ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS'

const clone = (o) => structuredClone(o)
/** The fixture with `info_lines` replaced (and `event` kept unless overridden). */
const withLines = (info_lines, extra = {}) => ({ ...clone(fixture), info_lines: clone(info_lines), ...extra })
/** The fixture with neither `event` nor `info_lines`: vehicles and session only. */
const bare = () => {
  const s = clone(fixture)
  delete s.event
  delete s.info_lines
  return s
}

let view
async function mount(props) {
  const Panel = await loadPanel()
  view = render(Panel, { snapshot: null, dwellSeconds: 8, lines: [], ...props })
  await tick()
  flushSync()
}
async function update(props) {
  await view.rerender(props)
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

const panel = () => view.container.querySelector('[data-testid="info-panel"]')
const header = () => view.container.querySelector('[data-testid="info-header"]')?.textContent.trim() ?? null
function line() {
  const els = view.container.querySelectorAll('[data-testid="info-line"]')
  expect(els.length, 'reduced motion: at most one line element at a time').toBeLessThanOrEqual(1)
  return els[0]?.textContent.trim() ?? null
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('info panel — layout and hiding (rules 76-78)', () => {
  it('shows event-info.json as the header, then the first line', async () => {
    await mount({ snapshot: fixture })
    expect(panel(), 'no info panel').not.toBeNull()
    expect(header()).toBe(HEADER)
    expect(line()).toBe(L0)
    const h = panel().querySelector('[data-testid="info-header"]')
    const l = panel().querySelector('[data-testid="info-line"]')
    expect(h.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING, 'the header comes before the line').toBeTruthy()
  })

  it('has the line row only when the event has no part', async () => {
    await mount({ snapshot: withLines(fixture.info_lines, { event: { round: 0, name: '  ' } }) })
    expect(panel()).not.toBeNull()
    expect(header(), 'no header element without a part').toBeNull()
    expect(line()).toBe(L0)
  })

  it('has the header only, with no line element, when there are no lines', async () => {
    await mount({ snapshot: withLines(['', '   ', 7]) })
    expect(header()).toBe(HEADER)
    expect(view.container.querySelector('[data-testid="info-line"]')).toBeNull()
  })

  it('draws nothing at all with no event and no lines, whatever else the snapshot carries', async () => {
    await mount({ snapshot: bare() })
    expect(panel()).toBeNull()
    expect(view.container.querySelector('.lt3'), 'no plate').toBeNull()
    expect(view.container.textContent.trim()).toBe('')
  })

  it('draws nothing before the first snapshot when no lines are configured', async () => {
    await mount({ snapshot: null })
    expect(panel()).toBeNull()
    expect(view.container.textContent.trim()).toBe('')
  })

  it('shows the broadcaster’s lines before any snapshot has arrived', async () => {
    await mount({ snapshot: null, lines: ['Follow us @battlecast'] })
    expect(panel()).not.toBeNull()
    expect(header()).toBeNull()
    expect(line()).toBe('Follow us @battlecast')
  })

  it('shows in every mode', async () => {
    await mount({ snapshot: { ...clone(fixture), mode: 'replay' } })
    expect(header()).toBe(HEADER)
    expect(line()).toBe(L0)
    await update({ snapshot: { ...clone(fixture), mode: 'qualifying' } })
    expect(header()).toBe(HEADER)
  })

  it('follows a changed event at once, and loses the header when the event goes', async () => {
    await mount({ snapshot: fixture })
    await update({ snapshot: withLines(fixture.info_lines, { event: { round: 4, track: 'Monza' } }) })
    expect(header()).toBe('ROUND 4 · MONZA')
    await update({ snapshot: withLines(fixture.info_lines, { event: null }) })
    expect(header()).toBeNull()
    expect(line(), 'the line row stays').toBe(L0)
  })
})

describe('info panel — rotation (rules 77, 79)', () => {
  it('shows each line for the 8 s dwell in order and wraps; re-sent snapshots restart nothing', async () => {
    await mount({ snapshot: fixture })
    expect(line()).toBe(L0)
    advance(4000)
    await update({ snapshot: clone(fixture) }) // the same list again
    advance(3999)
    expect(line()).toBe(L0)
    advance(1)
    expect(line()).toBe(L1)
    advance(8000)
    expect(line()).toBe(L2)
    advance(8000)
    expect(line(), 'wraps from the last line to the first').toBe(L0)
    expect(header(), 'the header never rotates').toBe(HEADER)
  })

  it('rotates the producer’s lines first, then the broadcaster’s, showing a shared line once', async () => {
    await mount({ snapshot: withLines([L0, 'Follow us @battlecast']), lines: ['Follow us @battlecast', 'Sponsored by Example'] })
    expect(line()).toBe(L0)
    advance(8000)
    expect(line()).toBe('Follow us @battlecast')
    advance(8000)
    expect(line()).toBe('Sponsored by Example')
    advance(8000)
    expect(line(), 'the duplicate was dropped, so the cycle is three lines').toBe(L0)
  })

  it('reads its dwellSeconds', async () => {
    await mount({ snapshot: fixture, dwellSeconds: 3 })
    advance(2999)
    expect(line()).toBe(L0)
    advance(1)
    expect(line()).toBe(L1)
  })

  it('keeps a single line up with no dwell, and starts the dwell when a second line arrives', async () => {
    await mount({ snapshot: withLines(['Only line']) })
    advance(60000)
    expect(line()).toBe('Only line')
    await update({ snapshot: withLines(['Only line', 'Second line']) }) // t = 60 s
    advance(7999)
    expect(line(), 'the dwell starts when the list grows, not when the line appeared').toBe('Only line')
    advance(1)
    expect(line()).toBe('Second line')
  })

  it('starts the dwell from zero when a lone line is joined early (3 s), not from when it appeared', async () => {
    await mount({ snapshot: withLines(['Only line']) })
    advance(3000)
    await update({ snapshot: withLines(['Only line', 'Second line']) }) // t = 3 s
    advance(7999) // t = 10.999 s
    expect(line(), 'a timer running since 0 s would have advanced at 8 s').toBe('Only line')
    advance(1) // t = 11 s
    expect(line()).toBe('Second line')
  })

  it('stops the dwell while the list shrinks to one line, and restarts it from zero when it grows back', async () => {
    await mount({ snapshot: withLines(['A', 'B']) }) // A up, dwell from 0 s
    advance(5000)
    await update({ snapshot: withLines(['A']) }) // t = 5 s: one line, no dwell
    advance(1000)
    await update({ snapshot: withLines(['A', 'B']) }) // t = 6 s: the dwell starts now
    advance(2000) // t = 8 s
    expect(line(), 'the original 0 s dwell must not survive the one-line spell').toBe('A')
    advance(5999) // t = 13.999 s
    expect(line()).toBe('A')
    advance(1) // t = 14 s
    expect(line()).toBe('B')
  })

  it('applies a dwellSeconds change from the next line', async () => {
    await mount({ snapshot: fixture, dwellSeconds: 8 })
    advance(2000)
    await update({ dwellSeconds: 3 })
    advance(5999) // t = 7.999 s
    expect(line(), 'the line that is up keeps the dwell it started with').toBe(L0)
    advance(1) // t = 8 s
    expect(line()).toBe(L1)
    advance(2999) // t = 10.999 s
    expect(line()).toBe(L1)
    advance(1) // t = 11 s
    expect(line(), 'the next line runs on the new dwell').toBe(L2)
  })
})

describe('info panel — a changed line list (rule 80)', () => {
  const ABC = ['A', 'B', 'C']

  it('keeps the line on screen when it is still listed, without restarting its dwell', async () => {
    await mount({ snapshot: withLines(ABC) })
    advance(8000)
    expect(line()).toBe('B') // up since t = 8 s
    advance(2000)
    await update({ snapshot: withLines(['X', 'A', 'B', 'C']) }) // t = 10 s
    expect(line()).toBe('B')
    advance(5999) // t = 15.999 s
    expect(line()).toBe('B')
    advance(1) // t = 16 s: B's dwell, counted from 8 s
    expect(line(), 'the line after B in the new list comes next').toBe('C')
    advance(8000)
    expect(line(), 'the rotation continues through the new list').toBe('X')
  })

  it('replaces a removed line at once with the line now at its place, on a full dwell', async () => {
    await mount({ snapshot: withLines(ABC) })
    advance(8000)
    expect(line()).toBe('B')
    advance(2000)
    await update({ snapshot: withLines(['A', 'C']) }) // t = 10 s
    expect(line(), 'B was withdrawn, so C (now at index 1) shows at once').toBe('C')
    advance(7999) // t = 17.999 s
    expect(line()).toBe('C')
    advance(1) // t = 18 s
    expect(line()).toBe('A')
  })

  it('falls back to the first line when the new list is too short for the removed line’s place', async () => {
    await mount({ snapshot: withLines(ABC) })
    advance(16000)
    expect(line()).toBe('C')
    advance(1000)
    await update({ snapshot: withLines(['A', 'B']) }) // t = 17 s
    expect(line()).toBe('A')
    advance(7999)
    expect(line()).toBe('A')
    advance(1)
    expect(line()).toBe('B')
  })

  it('takes the line at the removed line’s index, not the next surviving line of the old list', async () => {
    await mount({ snapshot: withLines(['A', 'B', 'C', 'D']) })
    advance(8000)
    expect(line()).toBe('B')
    await update({ snapshot: withLines(['X', 'A', 'C', 'D']) })
    expect(line(), 'index 1 of the new list is A').toBe('A')
    advance(8000)
    expect(line(), 'the rotation continues from A').toBe('C')
  })

  it('runs no dwell for a replacing line that is the only line', async () => {
    await mount({ snapshot: withLines(['A', 'B']) })
    await update({ snapshot: withLines(['Z']) }) // A withdrawn: Z replaces it, alone
    expect(line()).toBe('Z')
    advance(3000)
    await update({ snapshot: withLines(['Z', 'Y']) }) // t = 3 s: Z's dwell starts now, from zero
    advance(7999) // t = 10.999 s
    expect(line(), 'a dwell started when Z replaced A would have ended at 8 s').toBe('Z')
    advance(1) // t = 11 s
    expect(line()).toBe('Y')
  })

  it('replaces an edited line at once (its old text is no longer listed)', async () => {
    await mount({ snapshot: withLines(ABC) })
    advance(8000)
    await update({ snapshot: withLines(['A', 'B (corrected)', 'C']) })
    expect(line()).toBe('B (corrected)')
  })

  it('drops the line element when the list empties, and starts from the first line when lines return', async () => {
    await mount({ snapshot: withLines(ABC) })
    advance(8000)
    await update({ snapshot: withLines([]) })
    expect(view.container.querySelector('[data-testid="info-line"]')).toBeNull()
    expect(header(), 'the header stays').toBe(HEADER)
    await update({ snapshot: withLines(['P', 'Q']) })
    expect(line()).toBe('P')
  })

  it('hides the whole panel when the list empties and there is no header', async () => {
    await mount({ snapshot: withLines(ABC, { event: null }) })
    expect(line()).toBe('A')
    await update({ snapshot: withLines([], { event: null }) })
    expect(panel()).toBeNull()
    expect(view.container.textContent.trim()).toBe('')
  })

  it('treats a change to the broadcaster’s lines the same way', async () => {
    await mount({ snapshot: bare(), lines: ['S1', 'S2', 'S3'] })
    advance(8000)
    expect(line()).toBe('S2')
    await update({ lines: ['S0', 'S2', 'S3'] })
    expect(line(), 'S2 is still listed, so it stays').toBe('S2')
    await update({ lines: ['S0', 'S3'] })
    expect(line(), 'S2 was removed, so S3 (now at index 1) shows at once').toBe('S3')
  })
})
