<script>
  import { onMount } from 'svelte'
  import StandingsTower from './StandingsTower.svelte'
  import { connect, resolveSrc } from './sseClient.js'
  import {
    TOWER_METRICS_DEFAULTS,
    parseTowerMetricsParam,
    loadConfig,
    DEFAULT_CONFIG,
    normalizeConfig,
  } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)

  // The standalone route reads the tower's OVERFLOW settings (`maxRows` / `cycle`) from
  // the same profile /all reads them from, so one profile configures the tower on both
  // routes (tower-overflow rule 20). `?class=` / `?metrics=` below keep the per-Browser-
  // Source precedence they already had. config is always normalized, so widgets.tower
  // carries the full field set from the first render.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))
  const tower = $derived(config.widgets.tower)

  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= / ?show=
  // elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes). Resolved
  // once at mount — the tower is launched per class, not toggled live. Mirrors
  // GridPage / ResultsPage.
  const classFilter = params.get('class')

  // Richer-tower metrics knob for the standalone route: `?metrics=interval,pit,tire,fuel`
  // (listed = on, rest off). Absent falls back to the same default as /all — interval on,
  // strategy cluster off. Mirrors the 0.6.0 `?unit=mph` standalone knob.
  const metrics = parseTowerMetricsParam(params.get('metrics')) ?? TOWER_METRICS_DEFAULTS

  // Tower overflow — where the slot comes from (tower-overflow rules 18–19, ADR 0005).
  // This route has no configured slot, so the Browser Source viewport IS the slot: its
  // height less the .tower-page safe-area inset at the top and the bottom. The inset is
  // MEASURED off the live token (`--bc-inset-safe`) rather than hardcoded, the same way
  // StandingsTower measures its header/row heights, so a theme override cannot desync it.
  let pageEl = $state(null)
  let slotHeight = $state(0)

  function insetPx() {
    if (!pageEl || typeof getComputedStyle !== 'function') return 48
    const px = parseFloat(getComputedStyle(pageEl).getPropertyValue('--bc-inset-safe'))
    return Number.isFinite(px) && px >= 0 ? px : 48
  }

  // Re-derived on every resize: a Browser Source can be resized while it runs, and the
  // tower re-fits to the new size (rule 19). A changed budget recreates the cycling
  // controller in StandingsTower, which returns the window to its first page.
  function fitSlot() {
    if (typeof window === 'undefined') return
    slotHeight = Math.max(0, window.innerHeight - 2 * insetPx())
  }

  onMount(() => {
    let cancelled = false

    fitSlot()
    window.addEventListener('resize', fitSlot)

    // The profile only carries overflow config here; the feed still resolves from the
    // URL (`?src=`) as it always has, and opens on mount rather than waiting on it.
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
    })

    const url = resolveSrc(window.location.search)
    const disconnect = connect(url, (next) => {
      snapshot = next
    })

    return () => {
      cancelled = true
      window.removeEventListener('resize', fitSlot)
      disconnect()
    }
  })
</script>

<div class="tower-page" bind:this={pageEl}>
  <StandingsTower
    {snapshot}
    {classFilter}
    {metrics}
    maxRows={tower?.maxRows}
    cycle={tower?.cycle}
    {slotHeight}
  />
</div>

<style>
  .tower-page {
    padding: var(--bc-inset-safe);
  }
</style>
