<script>
  import { onMount } from 'svelte'
  import RaceUpdateBox from './RaceUpdateBox.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'
  import { loadConfig, DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Standalone race update box Browser Source (widgets.md rule 75). Connects like every
  // render page (`?src=`, then the default) and reads the `updates` widget's dwell and the
  // overlay-wide driver name style from the profile named by `?profile=`; no profile, or one
  // that fails to load, keeps the defaults.
  let snapshot = $state(null)
  let dwellSeconds = $state(DEFAULT_CONFIG.widgets.updates.dwellSeconds)
  let nameStyle = $state(DEFAULT_CONFIG.theme.nameStyle)

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    let disconnect = () => {}
    loadConfig(window.location.search).then((config) => {
      if (cancelled) return
      dwellSeconds = config.widgets.updates.dwellSeconds
      nameStyle = config.theme.nameStyle
      // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=`
      // URL param still wins). App.svelte already set a URL/default baseline at boot.
      applyMotion(resolveMotion(window.location.search, { reducedMotion: config.reducedMotion }))
      applyTheme(resolveTheme(window.location.search, { preset: config.theme.preset }))
      // The feed opens only once the profile has resolved and the motion mode is final, so a
      // reducedMotion profile's first entrance is already reduced (overlay-config rule 10).
      disconnect = connect(resolveSrc(), (next) => {
        snapshot = next
      })
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition. The producer
      // feed is left untouched (a config edit does not reconnect SSE).
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          dwellSeconds = nextConfig.widgets.updates.dwellSeconds
          nameStyle = nextConfig.theme.nameStyle
          applyMotion(
            resolveMotion(window.location.search, { reducedMotion: nextConfig.reducedMotion }),
          )
          applyTheme(resolveTheme(window.location.search, { preset: nextConfig.theme.preset }))
        },
        { initial: config },
      )
    })
    return () => {
      cancelled = true
      stopWatch()
      disconnect()
    }
  })
</script>

<div class="updates-page">
  <RaceUpdateBox {snapshot} {dwellSeconds} {nameStyle} />
</div>

<style>
  .updates-page {
    padding: var(--bc-inset-safe);
  }
</style>
