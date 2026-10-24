<script>
  import { onMount } from 'svelte'
  import LogoRotation from './LogoRotation.svelte'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
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
      // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=`
      // URL param still wins). App.svelte already set a URL/default baseline at boot.
      applyMotion(resolveMotion(window.location.search, { reducedMotion: resolved.reducedMotion }))
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition.
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          config = nextConfig
          applyMotion(
            resolveMotion(window.location.search, { reducedMotion: nextConfig.reducedMotion }),
          )
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
