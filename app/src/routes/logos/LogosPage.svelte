<script>
  import { onMount } from 'svelte'
  import LogoRotation from './LogoRotation.svelte'
  import { watchConfig } from '../../lib/configWatch.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Standalone logo-rotation Browser Source. Unlike the tower/battle routes this
  // is not driven by the producer SSE feed — it renders purely from the overlay
  // config's `logoRotation` block (see #32 decision).
  let config = $state(DEFAULT_CONFIG)

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition.
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          config = nextConfig
        },
        { initial: resolved },
      )
    })
    return () => {
      cancelled = true
      stopWatch()
    }
  })
</script>

<div class="logos-page">
  <LogoRotation rotation={config.logoRotation} />
</div>

<style>
  .logos-page {
    width: 100vw;
    height: 100vh;
  }
</style>
