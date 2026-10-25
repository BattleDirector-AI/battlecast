<script>
  import { onMount } from 'svelte'
  import WeatherBox from './WeatherBox.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
  import { applyMotion, resolveMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'

  // Standalone weather box Browser Source (widgets.md rule 87). Connects like every render
  // page (`?src=`, then the default) and reads the `weather` widget's `tempUnit` from the
  // profile named by `?profile=`; no profile, or one that fails to load, keeps °C. The profile
  // is re-read live (overlay-config rule 22), so a unit changed in /config arrives without a
  // refresh.
  let snapshot = $state(null)
  let tempUnit = $state(DEFAULT_CONFIG.widgets.weather.tempUnit)

  function applyConfig(config) {
    tempUnit = config.widgets.weather.tempUnit
    // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=` URL
    // param still wins). App.svelte already set a URL/default baseline at boot.
    applyMotion(resolveMotion(window.location.search, { reducedMotion: config.reducedMotion }))
    applyTheme(resolveTheme(window.location.search, { preset: config.theme.preset }))
  }

  onMount(() => {
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
      cancelled = true
      stopWatch()
      disconnect()
    }
  })
</script>

<div class="weather-page">
  <WeatherBox {snapshot} {tempUnit} />
</div>

<style>
  .weather-page {
    padding: var(--bc-inset-safe);
  }
</style>
