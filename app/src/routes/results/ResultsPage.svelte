<script>
  import { onMount } from 'svelte'
  import ResultsSlide from './ResultsSlide.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'
  import { loadConfig, DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)
  // Class-color overrides (rule 32, ADR 0010) come from the same saved profile /all
  // reads them from — resolved at mount and live-reloaded, like the tower/lower-third standalone
  // routes. The producer feed URL keeps resolving from ?src= alone, unaffected.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= /
  // ?show= elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes).
  // Resolved once at mount — the board is launched per class, not toggled live.
  const classFilter =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('class')
      : null

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    let disconnect = () => {}
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=`
      // URL param still wins). App.svelte already set a URL/default baseline at boot.
      applyMotion(resolveMotion(window.location.search, { reducedMotion: resolved.reducedMotion }))
      applyTheme(resolveTheme(window.location.search, { preset: resolved.theme.preset }))
      // The feed opens only once the profile has resolved and the motion mode is final, so a
      // reducedMotion profile's first entrance is already reduced (overlay-config rule 10).
      disconnect = connect(resolveSrc(window.location.search), (next) => {
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

<div class="results-page">
  <ResultsSlide {snapshot} {classFilter} classColors={config.theme.classColors} classTags={config.theme.classTags} nameStyle={config.theme.nameStyle} />
</div>

<style>
  .results-page {
    width: 100%;
    min-height: 100vh;
  }
</style>
