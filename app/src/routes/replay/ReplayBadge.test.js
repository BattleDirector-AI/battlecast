/* The replay badge (#60): widgets.md rules 117 (when it shows), 118 (the badge), 119 (motion) and
 * 121 (presets). ADR 0039.
 *
 * Driven from race-close-battle.json with only `mode` changed, so the snapshot is otherwise a
 * real spec-v1 state. The component is loaded through a non-static specifier, so while it does
 * not exist each test fails with a message that names it.
 *
 * Motion is read from the root `data-motion` attribute (lib/motion.js). The test setup defaults
 * it to `reduced`. The motion block sets it to `full` and installs the same timer-backed
 * `animate()` stand-in as LowerThirdShell.test.js, because happy-dom has no Web Animations API. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import base from '../../../../spec/v1/fixtures/race-close-battle.json'

const MODULE = './ReplayBadge.svelte'
async function loadBadge() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/replay/ReplayBadge.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const withMode = (mode) => {
  const s = structuredClone(base)
  if (mode === undefined) delete s.mode
  else s.mode = mode
  return s
}
const badge = (c) => c.querySelector('[data-testid="replay-badge"]')

function setMotion(full) {
  document.documentElement.dataset.motion = full ? 'full' : 'reduced'
}

afterEach(() => {
  cleanup()
  setMotion(false)
})

describe('replay badge: when it shows (rule 117)', () => {
  for (const mode of ['replay', 'Replay', ' REPLAY ', '\treplay\n']) {
    it(`shows for mode ${JSON.stringify(mode)}`, async () => {
      const Badge = await loadBadge()
      const { container } = render(Badge, { mode: withMode(mode).mode })
      expect(badge(container), `no badge for ${JSON.stringify(mode)}`).not.toBeNull()
    })
  }

  for (const mode of ['race', 'qualifying', 'practice', 'results', 'replays', 'instant replay', '', '   ', 42, true, null, undefined, ['replay'], { mode: 'replay' }]) {
    it(`draws nothing for mode ${JSON.stringify(mode) ?? 'absent'}`, async () => {
      const Badge = await loadBadge()
      const { container } = render(Badge, { mode })
      expect(badge(container)).toBeNull()
      expect(container.querySelector('.lt3'), 'a shell is drawn outside a replay').toBeNull()
      expect(container.querySelector('[data-testid="replay-label"]')).toBeNull()
      // "No empty element": the component adds no element at all outside a replay.
      expect(container.children.length, 'an element is drawn outside a replay').toBe(0)
    })
  }
})

describe('replay badge: the card (rule 118)', () => {
  it('is a lower-third card in the shared shell, holding only the label REPLAY', async () => {
    const Badge = await loadBadge()
    const { container } = render(Badge, { mode: 'replay' })
    const el = badge(container)
    expect(el).not.toBeNull()
    const shell = el.closest('.lt3') ?? el.querySelector('.lt3')
    expect(shell, 'the badge is not in the lower-third shell').not.toBeNull()
    const label = container.querySelector('[data-testid="replay-label"]')
    expect(label?.textContent.trim()).toBe('REPLAY')
    expect(el.textContent.replace(/\s+/g, ' ').trim()).toBe('REPLAY')
  })

  it('follows mode from snapshot to snapshot', async () => {
    const Badge = await loadBadge()
    const { container, rerender } = render(Badge, { mode: 'race' })
    expect(badge(container)).toBeNull()
    await rerender({ mode: 'replay' })
    await tick()
    expect(badge(container)).not.toBeNull()
    await rerender({ mode: 'race' })
    await tick()
    expect(badge(container), 'reduced motion: the badge did not go away at once').toBeNull()
  })
})

// Same stand-in as LowerThirdShell.test.js: Svelte's non-zero-duration transitions call
// element.animate(), which happy-dom lacks.
function installAnimatePolyfill() {
  const Ctor = window.Element ?? Element
  const original = Ctor.prototype.animate
  Ctor.prototype.animate = function (_keyframes, options) {
    const duration = (options && options.duration) || 0
    const anim = {
      onfinish: null,
      effect: null,
      currentTime: 0,
      playState: 'running',
      _cancelled: false,
      _timer: null,
      cancel() {
        this._cancelled = true
        this.playState = 'idle'
        if (this._timer != null) clearTimeout(this._timer)
      },
    }
    anim._timer = setTimeout(() => {
      anim._timer = null
      anim.playState = 'finished'
      if (!anim._cancelled && typeof anim.onfinish === 'function') anim.onfinish()
    }, duration)
    return anim
  }
  return () => {
    Ctor.prototype.animate = original
  }
}

describe('replay badge: motion (rule 119)', () => {
  let restoreAnimate
  beforeEach(() => {
    setMotion(true)
    restoreAnimate = installAnimatePolyfill()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreAnimate()
  })

  it('wipes out when the replay ends, then draws nothing', async () => {
    const Badge = await loadBadge()
    const { container, rerender } = render(Badge, { mode: 'replay' })
    const shell = container.querySelector('.lt3')
    expect(shell, 'no shell to wipe').not.toBeNull()

    await rerender({ mode: 'race' })
    await vi.advanceTimersByTimeAsync(200)
    expect(container.querySelector('.lt3'), 'the badge cut out instead of wiping').toBe(shell)
    expect(shell.classList.contains('lt3--exit'), 'the wipe-out did not play').toBe(true)

    await vi.advanceTimersByTimeAsync(800)
    expect(container.querySelector('.lt3'), 'the badge stayed after its wipe-out').toBeNull()
  })

  it('shows again at once when the replay comes back during the wipe-out', async () => {
    const Badge = await loadBadge()
    const { container, rerender } = render(Badge, { mode: 'replay' })
    const shell = container.querySelector('.lt3')
    expect(shell).not.toBeNull()

    await rerender({ mode: 'race' })
    await vi.advanceTimersByTimeAsync(200)
    await rerender({ mode: 'replay' })
    await tick()
    const again = container.querySelector('.lt3')
    expect(again, 'the badge did not show again').not.toBeNull()
    expect(again.classList.contains('lt3--exit'), 'the badge stayed in its wipe-out').toBe(false)
  })
})

describe('replay badge: under each preset (rule 121)', () => {
  it('has no style of its own for a preset: the source has no data-theme selector', async () => {
    let source
    try {
      source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ReplayBadge.svelte'), 'utf8')
    } catch (err) {
      throw new Error(`could not read ReplayBadge.svelte: ${String(err?.message).split('\n')[0]}`, { cause: err })
    }
    expect(source).toMatch(/LowerThirdShell/)
    expect(source).not.toMatch(/data-theme/)
    expect(source, 'a --bc-size-* token is redeclared, which would hide /all text size').not.toMatch(/--bc-size-[\w-]+\s*:/)
  })
})
