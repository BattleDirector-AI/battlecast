<script>
  import { onMount } from 'svelte'
  import InfoPanel from './InfoPanel.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'

  // Standalone info panel Browser Source (widgets.md rule 82). Connects like every render
  // page (`?src=`, then the default) and reads the `info` widget's dwell and lines from the
  // profile named by `?profile=`; no profile, or one that fails to load, keeps the defaults.
  // The lines are broadcaster config, so the profile is re-read live as `/all` does
  // (overlay-config rule 22).
  let snapshot = $state(null)
  let dwellSeconds = $state(DEFAULT_CONFIG.widgets.info.dwellSeconds)
  let lines = $state.raw([])

  function applyConfig(config) {
    dwellSeconds = config.widgets.info.dwellSeconds
    lines = config.widgets.info.lines
    // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=` URL
    // param still wins). App.svelte already set a URL/default baseline at boot.
    applyMotion(resolveMotion(window.location.search, { reducedMotion: config.reducedMotion }))
  }

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    loadConfig(window.location.search).then((config) => {
      // Unmounted before the profile arrived: apply nothing and start no reload poll.
      if (cancelled) return
      applyConfig(config)
      stopWatch = watchConfig(window.location.search, applyConfig, { initial: config })
    })
    const disconnect = connect(resolveSrc(), (next) => {
      snapshot = next
    })
    return () => {
      cancelled = true
      stopWatch()
      disconnect()
    }
  })
</script>

<div class="info-page">
  <InfoPanel {snapshot} {dwellSeconds} {lines} />
</div>

<style>
  .info-page {
    padding: var(--bc-inset-safe);
  }
</style>
