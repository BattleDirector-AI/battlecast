<script>
  import { onMount } from 'svelte'
  import BattleBox from './BattleBox.svelte'
  import { createBattleGrace } from '../../lib/battleGrace.js'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { watchConfig } from '../../lib/configWatch.js'
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
    loadConfig(window.location.search).then((resolved) => {
      if (cancelled) return
      config = resolved
      // Live-reload (#115, overlay-config rule 22): re-read the profile on an interval and
      // apply a change without a manual refresh — immediately, no transition. The producer
      // feed is left untouched (a config edit does not reconnect SSE).
      stopWatch = watchConfig(
        window.location.search,
        (nextConfig) => {
          config = nextConfig
        },
        { initial: resolved },
      )
    })

    const url = resolveSrc()
    const disconnect = connect(url, (next) => {
      snapshot = next
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
