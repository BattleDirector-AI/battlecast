<script>
  import { onMount } from 'svelte'
  import ReplayBadge from './ReplayBadge.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { loadConfig } from '../../lib/overlayConfig.js'
  import { applyMotion, resolveMotion } from '../../lib/motion.js'
  import { resolveTheme, applyTheme } from '../../lib/theme.js'

  // Standalone replay badge Browser Source (widgets.md rule 120). Connects like every render
  // page (`?src=`, then the default) and loads the profile named by `?profile=` for motion and
  // the theme preset only. The profile is re-read live (overlay-config rule 22).
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

<div class="replay-page">
  <ReplayBadge mode={snapshot?.mode ?? null} />
</div>

<style>
  .replay-page {
    padding: var(--bc-inset-safe);
  }
</style>
