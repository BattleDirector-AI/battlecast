<script>
  import { onMount } from 'svelte'
  import LogoRotation from './LogoRotation.svelte'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Standalone logo-rotation Browser Source. Unlike the tower/battle routes this
  // is not driven by the producer SSE feed — it renders purely from the overlay
  // config's `logoRotation` block (see #32 decision).
  let config = $state(DEFAULT_CONFIG)

  onMount(() => {
    let cancelled = false
    loadConfig(window.location.search).then((resolved) => {
      if (!cancelled) config = resolved
    })
    return () => {
      cancelled = true
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
