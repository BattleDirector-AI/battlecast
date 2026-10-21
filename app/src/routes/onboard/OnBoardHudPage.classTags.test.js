// Hidden class tags on the standalone `/onboard` route (widgets.md rule 63, #293): the route
// resolves the class-tags answer itself, so a single-class session drops the class chip.
// The route loads no profile and `driverInfo.class` is off by default, so the default
// onboard config is replaced here with one that has the class field on.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'

vi.mock('../../lib/overlayConfig.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    DEFAULT_CONFIG: {
      ...mod.DEFAULT_CONFIG,
      widgets: {
        ...mod.DEFAULT_CONFIG.widgets,
        onboard: {
          ...mod.DEFAULT_CONFIG.widgets.onboard,
          driverInfo: { ...mod.DEFAULT_CONFIG.widgets.onboard.driverInfo, class: true },
        },
      },
    },
  }
})

import OnBoardHudPage from './OnBoardHudPage.svelte'
import { resolveIdentity } from './OnBoardHud.svelte'
import { classTagsShown } from '../../lib/classTags.js'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderWith(snapshot) {
  const view = render(OnBoardHudPage)
  FakeEventSource.last.emit('state', { data: JSON.stringify(snapshot) })
  await tick()
  return view
}

const chip = (c) => c.querySelector('[data-testid="onboard-driver-class"]')

describe('/onboard standalone route — class chip follows session.multiclass (rule 63)', () => {
  it('shows no class chip in a single-class session (race-single-class.json)', async () => {
    const { container } = await renderWith(singleClass)
    expect(container.querySelector('[data-testid="onboard-driver-name"]').textContent).toBe('E. Jacobs')
    expect(chip(container)).toBeNull()
  })

  it('shows the class chip when the producer says multiclass', async () => {
    const snap = { ...singleClass, session: { ...singleClass.session, multiclass: true } }
    const { container } = await renderWith(snap)
    expect(chip(container).textContent.trim()).toBe('DEFAULT')
  })

  it('shows the class chip when multiclass is absent (auto)', async () => {
    const session = { ...singleClass.session }
    delete session.multiclass
    const { container } = await renderWith({ ...singleClass, session })
    expect(chip(container).textContent.trim()).toBe('DEFAULT')
  })
})

describe('resolveIdentity showClass (theme.classTags drives it on /all)', () => {
  const cfg = { driverInfo: { name: true, class: true } }

  it('theme.classTags show keeps the class in a single-class session', () => {
    const shown = classTagsShown('show', singleClass.session)
    expect(resolveIdentity(singleClass, cfg, shown)).toEqual({ name: 'E. Jacobs', class: 'Default' })
  })

  it('theme.classTags auto drops the class in a single-class session', () => {
    const shown = classTagsShown('auto', singleClass.session)
    expect(resolveIdentity(singleClass, cfg, shown)).toEqual({ name: 'E. Jacobs' })
  })

  it('a class-only strip resolves to null when class tags are hidden', () => {
    expect(resolveIdentity(singleClass, { driverInfo: { class: true } }, false)).toBeNull()
  })
})
