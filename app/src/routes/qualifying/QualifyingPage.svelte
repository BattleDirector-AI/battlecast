<script>
  import { onMount } from 'svelte'
  import QualifyingLowerThird from './QualifyingLowerThird.svelte'
  import { connect } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'
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
    let stopWatch = () => {}

    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=`
      // URL param still wins). App.svelte already set a URL/default baseline at boot.
      applyMotion(resolveMotion(window.location.search, { reducedMotion: resolved.reducedMotion }))
      applyTheme(resolveTheme(window.location.search, { preset: resolved.theme.preset }))
      const src = pickProducerSrc(window.location.search, resolved)
      disconnect = connect(src, (next) => {
        snapshot = next
      })
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition. The producer
      // feed is left untouched (a config edit does not reconnect SSE).
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
      disconnect()
    }
  })
</script>

<div class="qualifying-page">
  <QualifyingLowerThird {snapshot} {widget} classColors={config.theme.classColors} classTags={config.theme.classTags} nameStyle={config.theme.nameStyle} />
</div>

<style>
  .qualifying-page {
    padding: var(--bc-inset-safe);
  }
</style>
