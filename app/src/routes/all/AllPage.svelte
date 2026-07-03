<script>
  import { onMount } from 'svelte'
  import AllView from './AllView.svelte'
  import { connect } from '../tower/sseClient.js'
  import { loadConfig, pickProducerSrc, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  let config = $state(DEFAULT_CONFIG)
  let snapshot = $state(null)
  let stageScale = $state(1)

  // Scale the configured canvas uniformly to fit the Browser Source viewport, so
  // the layout holds its proportions at any output size.
  function fitStage() {
    if (typeof window === 'undefined') return
    const { w, h } = config.canvas ?? { w: 1920, h: 1080 }
    const s = Math.min(window.innerWidth / w, window.innerHeight / h)
    stageScale = Number.isFinite(s) && s > 0 ? s : 1
  }

  onMount(() => {
    let cancelled = false
    let disconnect = () => {}

    fitStage()
    window.addEventListener('resize', fitStage)

    // Resolve the layout (URL params -> profile fetch -> default) before opening
    // the SSE feed, then honor the profile's producer unless ?src= overrides.
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      fitStage() // re-fit: the resolved profile may set a different canvas size
      const src = pickProducerSrc(window.location.search, resolved)
      disconnect = connect(src, (next) => {
        snapshot = next
      })
    })

    return () => {
      cancelled = true
      window.removeEventListener('resize', fitStage)
      disconnect()
    }
  })
</script>

<div class="all-page" style="--bc-stage-scale: {stageScale};">
  <AllView {snapshot} {config} />
</div>

<style>
  .all-page {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>
