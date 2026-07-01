<script>
  import StandingsTower from '../tower/StandingsTower.svelte'
  import BattleBox from '../battle/BattleBox.svelte'
  import { DEFAULT_CONFIG, OVERLAY_CANVAS, resolveWidgets } from '../../lib/overlayConfig.js'

  let { snapshot = null, config = DEFAULT_CONFIG } = $props()

  // Config-driven layout: each widget is absolutely placed on the 1920x1080
  // canvas per its {x, y, w, h, z}. Only widgets that are `visible` AND have a
  // component today are rendered — a hidden widget is absent from the DOM, not
  // just visually collapsed. `logos` is in the contract but has no component
  // until #33, so it is intentionally skipped here.
  const RENDERABLE = new Set(['tower', 'battle'])
  const widgets = $derived(resolveWidgets(config).filter((w) => w.visible && RENDERABLE.has(w.key)))
</script>

<div
  class="overlay-stage"
  data-testid="overlay-stage"
  style="width: {OVERLAY_CANVAS.w}px; height: {OVERLAY_CANVAS.h}px;"
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
</style>
