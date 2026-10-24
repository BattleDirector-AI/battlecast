<script>
  import { onMount } from 'svelte'
  import RaceUpdateBox from './RaceUpdateBox.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Standalone race update box Browser Source (widgets.md rule 75). Connects like every
  // render page (`?src=`, then the default) and reads the `updates` widget's dwell from the
  // profile named by `?profile=`; no profile, or one that fails to load, keeps the default.
  let snapshot = $state(null)
  let dwellSeconds = $state(DEFAULT_CONFIG.widgets.updates.dwellSeconds)

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    loadConfig(window.location.search).then((config) => {
      if (cancelled) return
      dwellSeconds = config.widgets.updates.dwellSeconds
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition. The producer
      // feed is left untouched (a config edit does not reconnect SSE).
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          dwellSeconds = nextConfig.widgets.updates.dwellSeconds
        },
        { initial: config },
      )
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

<div class="updates-page">
  <RaceUpdateBox {snapshot} {dwellSeconds} />
</div>

<style>
  .updates-page {
    padding: var(--bc-inset-safe);
  }
</style>
