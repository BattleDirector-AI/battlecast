<script>
  import StandingsTower from '../tower/StandingsTower.svelte'
  import BattleBox from '../battle/BattleBox.svelte'
  import LogoRotation from '../logos/LogoRotation.svelte'
  import DriverLowerThird from '../driver/DriverLowerThird.svelte'
  import QualifyingLowerThird from '../qualifying/QualifyingLowerThird.svelte'
  import RaceControlStatus from '../racecontrol/RaceControlStatus.svelte'
  import OnBoardHud, { resolveIdentity } from '../onboard/OnBoardHud.svelte'
  import { resolveSubject } from '../driver/DriverLowerThird.svelte'
  import { DEFAULT_CONFIG, normalizeConfig, resolveWidgets } from '../../lib/overlayConfig.js'
  import { isWidgetIdle } from '../../lib/widgetIdle.js'

  // `preview` (the /config editor) disables the on-board HUD's lower-third hand-off so
  // the HUD is always visible for positioning/configuring — the hand-off is a runtime
  // timing behavior that a static single-frame preview can't meaningfully show.
  let { snapshot = null, config = DEFAULT_CONFIG, preview = false } = $props()

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= / ?show=
  // elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes). The tower
  // is the only widget that honors it today; mirrors GridPage / ResultsPage / the
  // standalone TowerPage.
  const classFilter =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('class')
      : null

  // Config-driven layout: each widget is absolutely placed on the configured
  // canvas per its {x, y, w, h, z}. Only widgets that are `visible` AND have a
  // component are rendered — a hidden widget is absent from the DOM, not just
  // visually collapsed. A widget that opted into `hideWhenIdle` also drops out
  // while it has nothing to show (e.g. the battle box in clear air).
  const normalized = $derived(normalizeConfig(config))
  const canvas = $derived(normalized.canvas)
  const RENDERABLE = new Set(['tower', 'battle', 'logos', 'driver', 'qualifying', 'racecontrol', 'onboard'])
  const widgets = $derived(
    resolveWidgets(normalized)
      .filter((w) => w.visible && RENDERABLE.has(w.key))
      .filter((w) => !(w.hideWhenIdle && isWidgetIdle(w.key, { snapshot, config: normalized }))),
  )

  // On-board HUD (#26) inputs, resolved once here since the HUD needs both the
  // subject and the field (for the additive vehicle identity fields), plus the
  // driver lower-third's config to time the hand-off.
  const onboardCfg = $derived(normalized.widgets.onboard)
  const driverCfg = $derived(normalized.widgets.driver)
  const onboardIdentity = $derived(resolveIdentity(snapshot, onboardCfg))
  const subjectSlotId = $derived(snapshot?.subject?.slot_id ?? null)
  // Mirror the driver lower-third's own "renderable subject" test so the HUD's
  // hand-off timing tracks it exactly.
  const subjectActive = $derived(resolveSubject(snapshot).state !== 'invalid')
  // Gate the HUD on the driver lower-third only when the broadcaster opted in
  // (`waitForLowerThird`) AND that card is actually enabled/visible; otherwise there
  // is nothing to wait for, so pass no gate (the HUD shows immediately).
  const onboardGate = $derived(
    !preview && onboardCfg?.waitForLowerThird && driverCfg?.visible ? driverCfg : null,
  )
</script>

<div
  class="overlay-stage"
  data-testid="overlay-stage"
  style="width: {canvas.w}px; height: {canvas.h}px;"
>
  {#each widgets as w (w.key)}
    <div
      class="widget-slot"
      data-testid="widget-{w.key}"
      data-widget={w.key}
      style="left: {w.x}px; top: {w.y}px; width: {w.w}px; height: {w.h}px; z-index: {w.z};"
    >
      {#if w.key === 'tower'}
        <StandingsTower
          {snapshot}
          {classFilter}
          classDisplay={normalized.widgets.tower?.classDisplay}
        />
      {:else if w.key === 'battle'}
        <BattleBox
          subject={snapshot?.subject ?? {}}
          relationship={snapshot?.relationship ?? {}}
          vehicles={snapshot?.vehicles ?? []}
          mode={snapshot?.mode ?? null}
        />
      {:else if w.key === 'logos'}
        <LogoRotation rotation={normalized.logoRotation} />
      {:else if w.key === 'driver'}
        <DriverLowerThird {snapshot} widget={w} />
      {:else if w.key === 'qualifying'}
        <QualifyingLowerThird {snapshot} widget={w} />
      {:else if w.key === 'racecontrol'}
        <RaceControlStatus session={snapshot?.session ?? null} mode={snapshot?.mode ?? null} />
      {:else if w.key === 'onboard'}
        <OnBoardHud
          telemetry={snapshot?.subject?.telemetry ?? null}
          mode={snapshot?.mode ?? null}
          speedUnit={onboardCfg?.speedUnit}
          identity={onboardIdentity}
          {subjectSlotId}
          {subjectActive}
          driverWidget={onboardGate}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  .overlay-stage {
    position: relative;
    transform-origin: top left;
    transform: scale(var(--bc-stage-scale, 1));
  }

  .widget-slot {
    position: absolute;
  }

  /* Make each widget fill its slot's configured width so what you size in the
     config editor is what renders — otherwise a widget keeps its intrinsic
     width and the editor's drag box no longer matches it. Height stays
     content-driven (widgets size to their content vertically). */
  .widget-slot > :global(*) {
    width: 100%;
    box-sizing: border-box;
  }

  /* The race control status pill and the on-board HUD are content-sized indicators,
     not plates that stretch to fill their slot. Keep their intrinsic (compact) width,
     and CENTRE them within the slot (rather than anchoring to the left edge) so they
     read as centred in their allotted box. The slot's width is just the placement box. */
  .widget-slot[data-widget='racecontrol'],
  .widget-slot[data-widget='onboard'] {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .widget-slot[data-widget='racecontrol'] > :global(*),
  .widget-slot[data-widget='onboard'] > :global(*) {
    width: auto;
  }
</style>
