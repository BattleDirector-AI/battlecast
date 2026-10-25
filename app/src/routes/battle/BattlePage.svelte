<script>
  import { onMount } from 'svelte'
  import BattleBox from './BattleBox.svelte'
  import { createBattleGrace } from '../../lib/battleGrace.js'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
  import { resolveMotion, applyMotion } from '../../lib/motion.js'
  import { loadConfig, DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)
  // Class-color overrides (rule 32, ADR 0010) come from the same saved profile /all
  // reads them from — resolved at mount and live-reloaded. The producer feed URL keeps resolving
  // from ?src= alone, unaffected.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))

  // Exit grace (widgets.md rules 37-38, ADR 0013), its length from the same profile.
  const graceSeconds = $derived(config.widgets.battle?.idleGraceSeconds)
  const grace = createBattleGrace({
    onExpire: () => {
      shown = grace.resolve(snapshot, graceSeconds)
    },
  })
  // Writable so a grace that runs out with no new snapshot can re-render from the latest.
  let shown = $derived(grace.resolve(snapshot, graceSeconds))

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
      disconnect()
      grace.destroy()
    }
  })
</script>

{#if shown}
  <BattleBox
    subject={shown.subject}
    relationship={shown.relationship}
    vehicles={shown.vehicles ?? []}
    mode={shown.mode ?? null}
    session={shown.session ?? null}
    classColors={config.theme.classColors}
    classTags={config.theme.classTags}
  />
{:else}
  <BattleBox subject={{}} relationship={{}} vehicles={[]} mode={null} classColors={config.theme.classColors} classTags={config.theme.classTags} />
{/if}
