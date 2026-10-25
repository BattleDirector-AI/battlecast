<script>
  import { onMount } from 'svelte'
  import RaceControlStatus from './RaceControlStatus.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { loadConfig } from '../../lib/overlayConfig.js'
  import { applyMotion, resolveMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'

  // Standalone Race Control Browser Source. The widget reads no profile knobs, but the page
  // loads the profile named by `?profile=` for its motion mode and theme (overlay-config rules
  // 10 and 59), and re-reads it live (rule 22).
  let snapshot = $state(null)

  function applyConfig(config) {
    // Refine the motion mode from the resolved profile's `reducedMotion` (a `?motion=` URL
    // param still wins). App.svelte already set a URL/default baseline at boot.
    applyMotion(resolveMotion(window.location.search, { reducedMotion: config.reducedMotion }))
    applyTheme(resolveTheme(window.location.search, { preset: config.theme.preset }))
  }

  onMount(() => {
    let cancelled = false
    let stopWatch = () => {}
    let disconnect = () => {}
    loadConfig(window.location.search).then((config) => {
      // Unmounted before the profile arrived: apply nothing and start no reload poll.
      if (cancelled) return
      applyConfig(config)
      // The feed opens only once the profile has resolved and the motion mode is final, so a
      // reducedMotion profile's first entrance is already reduced (overlay-config rule 10).
      disconnect = connect(resolveSrc(), (next) => {
        snapshot = next
      })
      stopWatch = watchConfig(window.location.search, applyConfig, { initial: config })
    })
    return () => {
      cancelled = true
      stopWatch()
      disconnect()
    }
  })
</script>

<!-- RaceControlStatus renders nothing until there's session content (its own
     hasContent guard), so a single call handles both the pre-snapshot and
     empty-session cases. -->
<RaceControlStatus session={snapshot?.session ?? null} mode={snapshot?.mode ?? null} />
