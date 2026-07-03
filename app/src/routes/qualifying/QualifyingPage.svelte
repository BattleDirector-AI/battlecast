<script>
  import { onMount } from 'svelte'
  import QualifyingLowerThird from './QualifyingLowerThird.svelte'
  import { connect } from '../tower/sseClient.js'
  import { loadConfig, pickProducerSrc, DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'

  // Standalone qualifying/sector lower-third Browser Source. Like /driver it is
  // driven by the producer SSE feed; the widget self-manages fire/dwell/hide from
  // the resolved config's `qualifying` block (trigger / dwellSeconds / showOnConnect
  // plus the #22 modes / fireOnClassBest gating).
  let config = $state(normalizeConfig(DEFAULT_CONFIG))
  let snapshot = $state(null)

  const widget = $derived(config.widgets.qualifying)

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

<div class="qualifying-page">
  <QualifyingLowerThird {snapshot} {widget} />
</div>

<style>
  .qualifying-page {
    padding: var(--bc-inset-safe);
  }
</style>
