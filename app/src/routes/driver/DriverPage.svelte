<script>
  import { onMount } from 'svelte'
  import DriverLowerThird from './DriverLowerThird.svelte'
  import { connect } from '../tower/sseClient.js'
  import { loadConfig, pickProducerSrc, DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'

  // Standalone driver lower-third Browser Source. Like /tower and /all it is driven
  // by the producer SSE feed; the widget self-manages fire/dwell/hide from the
  // resolved config's `driver` block (trigger / dwellSeconds / showOnConnect).
  // config is always a normalized config (initial default, then loadConfig's
  // normalized result), so its widgets carry the full field set.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))
  let snapshot = $state(null)

  const widget = $derived(config.widgets.driver)

  onMount(() => {
    let cancelled = false
    let disconnect = () => {}

    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      const src = pickProducerSrc(window.location.search, resolved)
      disconnect = connect(src, (next) => {
        snapshot = next
      })
    })

    return () => {
      cancelled = true
      disconnect()
    }
  })
</script>

<div class="driver-page">
  <DriverLowerThird {snapshot} {widget} />
</div>

<style>
  .driver-page {
    padding: var(--bc-inset-safe);
  }
</style>
