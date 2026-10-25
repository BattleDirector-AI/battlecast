<script>
  import { onMount } from 'svelte'
  import StandingsTower from './StandingsTower.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import {
    TOWER_METRICS_DEFAULTS,
    parseTowerMetricsParam,
    loadConfig,
    DEFAULT_CONFIG,
    normalizeConfig,
  } from '../../lib/overlayConfig.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'

  let snapshot = $state(null)

  // The standalone route reads the tower's OVERFLOW settings (`maxRows` / `cycle`), its
  // driver name style (`nameStyle`, overlay-config rule 42), its class layout
  // (`classDisplay`, widgets rule 67) and its metrics (`towerMetrics`, overlay-config
  // rule 49) from the same profile /all reads them from, so one profile configures the
  // tower on both routes (tower-overflow rule 20). `?class=` / `?metrics=` below keep the
  // per-Browser-Source precedence rule 13 gives them. config is always normalized, so
  // widgets.tower carries the full field set from the first render.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))
  const tower = $derived(config.widgets.tower)

  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= / ?show=
  // elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes). Resolved
  // once at mount — the tower is launched per class, not toggled live. Mirrors
  // GridPage / ResultsPage.
  const classFilter = params.get('class')

  // Richer-tower metrics knob for the standalone route: `?metrics=interval,pit,tire,fuel,lapflash`
  // (listed = on, rest off; case-insensitive). A list naming a known toggle is the whole
  // list; an absent, blank or all-unknown one falls back to the profile's metrics, and with
  // no profile to the default (overlay-config rule 49). Derived so the profile's metrics
  // replace the default once the profile loads.
  const metricsParam = parseTowerMetricsParam(params.get('metrics'))
  const metrics = $derived(metricsParam ?? tower?.towerMetrics ?? TOWER_METRICS_DEFAULTS)

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
    let stopWatch = () => {}
    let disconnect = () => {}

    // The first fit is direct: there is no burst to coalesce, and the tower must be
    // bounded on its very first render rather than a frame later.
    measureSlot()
    window.addEventListener('resize', fitSlot)

    // The profile carries the tower settings here; the feed still resolves from the
    // URL (`?src=`) as it always has, and opens once the profile has resolved.
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=`
      // URL param still wins). App.svelte already set a URL/default baseline at boot.
      applyMotion(resolveMotion(window.location.search, { reducedMotion: resolved.reducedMotion }))
      applyTheme(resolveTheme(window.location.search, { preset: resolved.theme.preset }))
      // The feed opens only once the profile has resolved and the motion mode is final, so a
      // reducedMotion profile's first entrance is already reduced (overlay-config rule 10).
      disconnect = connect(resolveSrc(window.location.search), (next) => {
        snapshot = next
      })
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition. The producer
      // feed is left untouched (a config edit does not reconnect SSE).
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          config = nextConfig
          applyMotion(
            resolveMotion(window.location.search, { reducedMotion: nextConfig.reducedMotion }),
          )
          applyTheme(resolveTheme(window.location.search, { preset: nextConfig.theme.preset }))
        },
        { initial: resolved },
      )
    })

    return () => {
      cancelled = true
      window.removeEventListener('resize', fitSlot)
      // Nothing may measure a torn-down page: drop any frame still queued.
      if (pendingFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame)
        pendingFrame = null
      }
      stopWatch()
      disconnect()
    }
  })
</script>

<div class="tower-page" bind:this={pageEl}>
  <StandingsTower
    {snapshot}
    {classFilter}
    classDisplay={tower?.classDisplay}
    {metrics}
    maxRows={tower?.maxRows}
    cycle={tower?.cycle}
    nameStyle={tower?.nameStyle}
    {slotHeight}
    maxHeight={slotHeight}
    classColors={config.theme.classColors}
    classTags={config.theme.classTags}
  />
</div>

<style>
  .tower-page {
    padding: var(--bc-inset-safe);
  }
</style>
