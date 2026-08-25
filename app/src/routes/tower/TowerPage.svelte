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
  // MEASURED off the element's RESOLVED padding rather than off the `--bc-inset-safe`
  // token: a custom property reads back as its authored text, so a token in any unit but
  // px (`3rem`) would parse to a plausible, wrong number (3) and silently yield a tower
  // taller than its Browser Source (#152). `paddingTop`/`paddingBottom` are what the
  // engine actually applied, in px, whatever the token was authored in.
  let pageEl = $state(null)
  let slotHeight = $state(0)

  // Only reached when the padding is unreadable — no layout yet, or a style object that
  // resolves nothing. Matches `--bc-inset-safe`'s own value so an unmeasurable page still
  // renders the tower it would have at the design inset, bounded by the viewport.
  const INSET_FALLBACK_PX = 48

  // Top and bottom are read separately rather than one value doubled: the resolved
  // padding is per-edge, and nothing guarantees a theme keeps the two symmetric.
  function edgeInsetPx(style, side) {
    const px = parseFloat(style[side])
    return Number.isFinite(px) && px >= 0 ? px : INSET_FALLBACK_PX
  }

  function measureSlot() {
    if (typeof window === 'undefined') return
    let top = INSET_FALLBACK_PX
    let bottom = INSET_FALLBACK_PX
    if (pageEl && typeof getComputedStyle === 'function') {
      const style = getComputedStyle(pageEl)
      top = edgeInsetPx(style, 'paddingTop')
      bottom = edgeInsetPx(style, 'paddingBottom')
    }
    const height = window.innerHeight - top - bottom
    slotHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  }

  // Re-derived on every resize: a Browser Source can be resized while it runs, and the
  // tower re-fits to the new size (rule 19). A changed budget recreates the cycling
  // controller in StandingsTower, which returns the window to its first page, so a
  // dragged resize must not re-measure on every event: the first event of a burst
  // measures at once (a lone resize is never deferred) and opens a frame-long gate,
  // every further event inside that frame is dropped, and the frame's callback takes the
  // one catch-up measurement so the drag settles on the size it ended at.
  let pendingFrame = null
  let missedResize = false

  function fitSlot() {
    if (pendingFrame !== null) {
      missedResize = true
      return
    }
    measureSlot()
    if (typeof requestAnimationFrame !== 'function') return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null
      if (!missedResize) return
      missedResize = false
      fitSlot()
    })
  }

  onMount(() => {
    let cancelled = false

    // The first fit is direct: there is no burst to coalesce, and the tower must be
    // bounded on its very first render rather than a frame later.
    measureSlot()
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
      // Nothing may measure a torn-down page: drop any frame still queued.
      if (pendingFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame)
        pendingFrame = null
      }
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
