<script>
  import { onMount } from 'svelte'
  import EventSlide from './EventSlide.svelte'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Standalone Event slide (widgets.md rules 123–127, ADR 0041). Like /logos it is not driven by
  // the producer feed — it renders purely from the profile's `slides` section, so it opens no
  // producer connection and shows the same slide with no producer running.
  let config = $state(DEFAULT_CONFIG)

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      // Refine the motion mode and the look preset from the resolved profile (a `?motion=` /
      // `?theme=` URL param still wins). App.svelte already set a URL/default baseline at boot.
      applyMotion(resolveMotion(window.location.search, { reducedMotion: resolved.reducedMotion }))
      applyTheme(resolveTheme(window.location.search, { preset: resolved.theme.preset }))
      // Live-reload (#115, overlay-config rule 22): apply a changed profile at once, no transition.
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          config = nextConfig
          applyMotion(
            resolveMotion(window.location.search, { reducedMotion: nextConfig.reducedMotion }),
          )
          applyTheme(resolveTheme(window.location.search, { preset: nextConfig.theme.preset }))
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

<div class="event-page">
  <EventSlide slides={config.slides} />
</div>

<style>
  .event-page {
    width: 100%;
    min-height: 100vh;
  }
</style>
