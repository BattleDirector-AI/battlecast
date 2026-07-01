<script>
  import StandingsTower from '../tower/StandingsTower.svelte'
  import BattleBox from '../battle/BattleBox.svelte'

  let { snapshot = null } = $props()
</script>

<div class="all-view" data-testid="all-view">
  <StandingsTower {snapshot} />
  <BattleBox
    subject={snapshot?.subject ?? {}}
    relationship={snapshot?.relationship ?? {}}
    vehicles={snapshot?.vehicles ?? []}
  />
</div>

<style>
  .all-view {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--bc-space-4);
  }
</style>
