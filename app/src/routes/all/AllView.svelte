<script>
  import StandingsTower from '../tower/StandingsTower.svelte'
  import BattleBox from '../battle/BattleBox.svelte'
  import LogoRotation from '../logos/LogoRotation.svelte'
  import DriverLowerThird from '../driver/DriverLowerThird.svelte'
  import QualifyingLowerThird from '../qualifying/QualifyingLowerThird.svelte'
  import RaceControlStatus from '../racecontrol/RaceControlStatus.svelte'
  import { DEFAULT_CONFIG, normalizeConfig, resolveWidgets } from '../../lib/overlayConfig.js'
  import { isWidgetIdle } from '../../lib/widgetIdle.js'

  let { snapshot = null, config = DEFAULT_CONFIG } = $props()

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
  const RENDERABLE = new Set(['tower', 'battle', 'logos', 'driver', 'qualifying', 'racecontrol'])
  const widgets = $derived(
    resolveWidgets(normalized)
      .filter((w) => w.visible && RENDERABLE.has(w.key))
      .filter((w) => !(w.hideWhenIdle && isWidgetIdle(w.key, { snapshot, config: normalized }))),
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

  /* The race control status pill is a content-sized indicator, not a plate that
     should stretch to a slot — let it keep its intrinsic (compact) width, anchored
     at the slot's left edge. Its slot width is just the editor drag box. */
  .widget-slot[data-widget='racecontrol'] > :global(*) {
    width: auto;
  }
</style>
