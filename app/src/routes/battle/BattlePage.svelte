<script>
  import { onMount } from 'svelte'
  import BattleBox from './BattleBox.svelte'
  import { connect, resolveSrc } from './sseClient.js'

  let snapshot = $state(null)

  onMount(() => {
    const url = resolveSrc()
    const disconnect = connect(url, (next) => {
      snapshot = next
    })
    return disconnect
  })
</script>

{#if snapshot}
  <BattleBox
    subject={snapshot.subject}
    relationship={snapshot.relationship}
    vehicles={snapshot.vehicles ?? []}
  />
{:else}
  <BattleBox subject={{}} relationship={{}} vehicles={[]} />
{/if}
