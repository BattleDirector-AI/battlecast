<script>
  import { onMount } from 'svelte'
  import InfoPanel from './InfoPanel.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'

  // Standalone info panel Browser Source (widgets.md rule 82). Connects like every render
  // page (`?src=`, then the default) and reads the `info` widget's dwell, lines, weather card
  // and unit from the profile named by `?profile=`; no profile, or one that fails to load,
  // keeps the defaults.
  // The lines are broadcaster config, so the profile is re-read live as `/all` does
  // (overlay-config rule 22).
  let snapshot = $state(null)
  let dwellSeconds = $state(DEFAULT_CONFIG.widgets.info.dwellSeconds)
  let lines = $state.raw([])
  let weatherCard = $state(DEFAULT_CONFIG.widgets.info.weatherCard)
  let tempUnit = $state(DEFAULT_CONFIG.widgets.info.tempUnit)

  function applyConfig(config) {
    dwellSeconds = config.widgets.info.dwellSeconds
    lines = config.widgets.info.lines
    weatherCard = config.widgets.info.weatherCard
    tempUnit = config.widgets.info.tempUnit
    // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=` URL
    // param still wins). App.svelte already set a URL/default baseline at boot.
    applyMotion(resolveMotion(window.location.search, { reducedMotion: config.reducedMotion }))
    applyTheme(resolveTheme(window.location.search, { preset: config.theme.preset }))
  }

  // The panel's slot is the page's content box and its canvas the viewport (widgets.md rule
  // 78a), re-read when the Browser Source is resized. The page box is observed too: a host can
  // size the page after mount without a window `resize` (headless Chrome does).
  let pageEl = $state(null)
  let slot = $state({ slotLeft: null, slotWidth: null, canvasWidth: null })
  function readSlot() {
    if (!pageEl) return
    const style = getComputedStyle(pageEl)
    const left = parseFloat(style.paddingLeft) || 0
    const right = parseFloat(style.paddingRight) || 0
    slot = { slotLeft: left, slotWidth: pageEl.clientWidth - left - right, canvasWidth: window.innerWidth }
  }
  onMount(() => {
    readSlot()
    window.addEventListener('resize', readSlot)
    const pageObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(readSlot)
    pageObserver?.observe(pageEl)
    let cancelled = false
    let stopWatch = () => {}
    let disconnect = () => {}
    loadConfig(window.location.search).then((config) => {
      // Unmounted before the profile arrived: apply nothing and start no reload poll.
      if (cancelled) return
      applyConfig(config)
      // The feed opens only once the profile has resolved and the motion mode is final, so a
      // reducedMotion profile's first entrance is already reduced (overlay-config rule 10).
      disconnect = connect(resolveSrc(), (next) => {
        snapshot = next
      })
      stopWatch = watchConfig(window.location.search, applyConfig, { initial: config })
    })
    return () => {
      window.removeEventListener('resize', readSlot)
      pageObserver?.disconnect()
      cancelled = true
      stopWatch()
      disconnect()
    }
  })
</script>

<div class="info-page" bind:this={pageEl}>
  <InfoPanel {snapshot} {dwellSeconds} {lines} {weatherCard} {tempUnit} {...slot} />
</div>

<style>
  .info-page {
    padding: var(--bc-inset-safe);
  }
</style>
