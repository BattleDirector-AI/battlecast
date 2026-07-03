<script>
  import StandingsTower from '../tower/StandingsTower.svelte'
  import BattleBox from '../battle/BattleBox.svelte'
  import LogoRotation from '../logos/LogoRotation.svelte'
  import { DEFAULT_CONFIG, normalizeConfig, resolveWidgets } from '../../lib/overlayConfig.js'

  let { snapshot = null, config = DEFAULT_CONFIG } = $props()

  // Config-driven layout: each widget is absolutely placed on the configured
  // canvas per its {x, y, w, h, z}. Only widgets that are `visible` AND have a
  // component are rendered — a hidden widget is absent from the DOM, not just
  // visually collapsed.
  const normalized = $derived(normalizeConfig(config))
  const canvas = $derived(normalized.canvas)
  const RENDERABLE = new Set(['tower', 'battle', 'logos'])
  const widgets = $derived(resolveWidgets(normalized).filter((w) => w.visible && RENDERABLE.has(w.key)))
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
        <StandingsTower {snapshot} />
      {:else if w.key === 'battle'}
        <BattleBox
          subject={snapshot?.subject ?? {}}
          relationship={snapshot?.relationship ?? {}}
          vehicles={snapshot?.vehicles ?? []}
        />
      {:else if w.key === 'logos'}
        <LogoRotation rotation={normalized.logoRotation} />
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
</style>
