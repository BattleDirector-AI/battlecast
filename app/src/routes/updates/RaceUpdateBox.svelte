<script>
  import { onDestroy, untrack } from 'svelte'
  import LowerThirdShell from '../../lib/LowerThirdShell.svelte'
  import { createRaceUpdateFeed } from '../../lib/raceEvents.js'
  import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Race update box (#27; widgets.md rules 69-75, ADR 0023). The feed (lib/raceEvents.js)
  // decides which events are new and what waits; this component only times the card on
  // screen. `preview` (the /config editor) takes no baseline; it is read once at mount.
  const DEFAULT_DWELL = DEFAULT_CONFIG.widgets.updates.dwellSeconds
  let { snapshot = null, dwellSeconds = DEFAULT_DWELL, preview = false } = $props()

  const feed = createRaceUpdateFeed({ preview: untrack(() => preview) })
  let current = $state.raw(null)
  let timer = null

  function stopTimer() {
    if (timer != null) clearTimeout(timer)
    timer = null
  }

  // A card keeps the dwell it started with (rule 73), so the dwell is read here, once.
  function startTimer() {
    stopTimer()
    const d = untrack(() => dwellSeconds)
    const secs = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : DEFAULT_DWELL
    timer = setTimeout(() => {
      timer = null
      current = feed.advance()
      if (current) startTimer()
    }, secs * 1000)
  }

  // Each snapshot goes to the feed; a card that comes up from an empty box starts its dwell.
  // A card that is already up is untouched: queued events wait for its timer.
  $effect(() => {
    const next = feed.push(snapshot)
    if (next !== untrack(() => current)) {
      current = next
      startTimer()
    }
  })

  onDestroy(stopTimer)
</script>

{#if current}
  <!-- Keyed on the event id inside a stable anchor (as DriverLowerThird keys on the slot):
       a waiting card replacing the one on screen remounts the plate, so the old plays its
       wipe-out while the new one wipes in (rule 74). -->
  <div class="lt3-anchor">
    {#key current.id}
      <LowerThirdShell>
        <section
          class="bc-ru"
          data-testid="race-update"
          data-event-id={current.id}
          data-event-type={current.type}
          aria-label="Race update"
        >
          <span class="bc-ru__accent" aria-hidden="true"></span>
          <div class="bc-ru__body">
            <span class="bc-ru__label" data-testid="update-label">{current.label}</span>
            <div class="bc-ru__main">
              <span class="bc-ru__name" data-testid="update-name">{current.name}</span>
              {#if current.value != null}
                <span class="bc-ru__value" data-testid="update-value">{current.value}</span>
              {/if}
            </div>
            {#if current.detail != null}
              <span class="bc-ru__detail" data-testid="update-detail">{current.detail}</span>
            {/if}
          </div>
        </section>
      </LowerThirdShell>
    {/key}
  </div>
{/if}

<style>
  .lt3-anchor {
    position: relative;
  }

  .bc-ru {
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-3);
    padding: var(--bc-space-3) var(--bc-space-4);
    color: var(--bc-text);
  }

  .bc-ru__accent {
    flex: 0 0 auto;
    width: 4px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--bc-accent);
    box-shadow: 0 0 12px var(--bc-accent-glow);
  }

  .bc-ru__body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--bc-space-1);
    min-width: 0;
  }

  .bc-ru__label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .bc-ru__main {
    display: flex;
    align-items: baseline;
    gap: var(--bc-space-3);
    min-width: 0;
  }

  .bc-ru__name {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-battle-name);
    font-weight: var(--bc-weight-leader);
    color: var(--bc-oncam-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .bc-ru__value {
    flex: 0 0 auto;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-accent);
  }

  .bc-ru__detail {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    color: var(--bc-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The box's own vintage look (widgets rules 99–100, ADR 0033). Keyed on an ancestor's
     data-theme, so the /config preview stage gets it too. Paint only: the plate, frame and
     bar-wipe are the shell's, and no rule here sizes or moves a line (overlay-config rule 60). */
  :global([data-theme='vintage70']) .bc-ru__accent,
  :global([data-theme='vintage80']) .bc-ru__accent {
    border-radius: 0;
    box-shadow: 2px 2px 0 #000;
  }

  /* 70s: the accent bar is the box's only red. */
  :global([data-theme='vintage70']) .bc-ru__value {
    color: var(--bc-text-2);
  }

  /* 80s: the label on a header-red tag that hugs its text, painted outside its line box. */
  :global([data-theme='vintage80']) .bc-ru__label {
    align-self: flex-start;
    font-family: var(--bc-font-display);
    color: var(--bc-text-2);
    background: var(--bc-header);
    box-shadow: 0 0 0 2px var(--bc-header), 3px 3px 0 2px #000;
    text-shadow: none;
  }

  :global([data-theme='vintage80']) .bc-ru__detail {
    font-family: var(--bc-font-display);
  }
</style>
