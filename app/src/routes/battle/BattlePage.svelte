<script>
  import { onMount } from 'svelte'
  import BattleBox from './BattleBox.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { loadConfig, DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)
  // Class-color overrides (rule 32, ADR 0010) come from the same saved profile /all
  // reads them from — resolved once at mount. The producer feed URL keeps resolving
  // from ?src= alone, unaffected.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))

  onMount(() => {
    let cancelled = false
    loadConfig(window.location.search).then((resolved) => {
      if (!cancelled) config = resolved
    })

    const url = resolveSrc()
    const disconnect = connect(url, (next) => {
      snapshot = next
    })
    return () => {
      cancelled = true
      disconnect()
    }
  })
</script>

{#if snapshot}
  <BattleBox
    subject={snapshot.subject}
    relationship={snapshot.relationship}
    vehicles={snapshot.vehicles ?? []}
    mode={snapshot.mode ?? null}
    classColors={config.theme.classColors}
  />
{:else}
  <BattleBox subject={{}} relationship={{}} vehicles={[]} mode={null} classColors={config.theme.classColors} />
{/if}
