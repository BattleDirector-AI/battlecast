<script>
  import LowerThirdShell from '../../lib/LowerThirdShell.svelte'
  import { isReplay } from '../../lib/replay.js'

  // Replay badge (#60, widgets.md rules 117-121, ADR 0039): a `REPLAY` tag in the shared
  // lower-third shell while the producer's `mode` is `replay`. The shell's in/out transitions
  // give the bar-wipe (and the reduced-motion fade-in and instant exit). Outside a replay it
  // draws nothing.
  let { mode = null } = $props()
</script>

{#if isReplay(mode)}
  <div class="lt3-anchor">
    <LowerThirdShell>
      <section class="bc-rp" data-testid="replay-badge" aria-label="Replay">
        <span class="bc-rp__label" data-testid="replay-label">REPLAY</span>
      </section>
    </LowerThirdShell>
  </div>
{/if}

<style>
  /* LowerThirdShell's `.lt3` is absolute against this anchor; the badge has one plate, so it
     sits in normal flow and the anchor takes its height. */
  .lt3-anchor {
    position: relative;
  }
  /* .lt3.lt3: outranks LowerThirdShell's own `.lt3 { position: absolute }` whatever the
     order the two stylesheets land in the bundle. */
  .lt3-anchor > :global(.lt3.lt3) {
    position: relative;
  }

  .bc-rp {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--bc-space-3) var(--bc-space-4);
    color: var(--bc-text);
  }

  .bc-rp__label {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-battle-name);
    font-weight: var(--bc-weight-leader);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    white-space: nowrap;
  }
</style>
