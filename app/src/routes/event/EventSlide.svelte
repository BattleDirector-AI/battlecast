<script>
  // The Event slide (widgets.md rules 123–130, ADR 0041): a full-screen title card that shows the
  // profile's `slides` section — logo, series name, and the round · track meta line. It renders
  // profile data only; it never reads the producer's `event`. An empty field has no part, so an
  // empty section is a blank board. It has no entrance or exit of its own (rule 127).
  /** @type {{ slides: { series: string, round: string, track: string, logo: string } }} */
  let { slides } = $props()

  // A logo that fails to load is removed (rule 126). The flag is keyed on the URL, so a live
  // reload that gives a different URL tries again.
  let failedLogo = $state(null)
  const logo = $derived(slides?.logo && slides.logo !== failedLogo ? slides.logo : '')
  const series = $derived(slides?.series ?? '')
  const round = $derived(slides?.round ?? '')
  const track = $derived(slides?.track ?? '')
  // A space, U+00B7 MIDDLE DOT, a space (rule 124). A plain text node there would lose its
  // edge spaces to Svelte's whitespace trimming at the block boundaries.
  const SEPARATOR = ' · '
</script>

<div class="event" data-testid="event-slide">
  {#if logo}
    <img class="event__logo" data-testid="event-logo" src={logo} alt="" onerror={() => (failedLogo = logo)} />
  {/if}
  {#if series}
    <div class="event__series" data-testid="event-series">{series}</div>
  {/if}
  {#if round || track}
    <div class="event__meta" data-testid="event-meta">
      {#if round}<span class="event__round" data-testid="event-round">{round}</span>{/if}{#if round && track}{SEPARATOR}{/if}{#if track}<span class="event__track" data-testid="event-track">{track}</span>{/if}
    </div>
  {/if}
</div>

<style>
  /* Opaque studio board, as the other takeover slides: it fills the page. */
  .event {
    box-sizing: border-box;
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--bc-space-5);
    background: var(--bc-board);
    color: var(--bc-text);
    padding: var(--bc-inset-safe);
    font-family: var(--bc-font-ui);
    text-align: center;
    text-transform: uppercase;
  }

  /* Aspect kept, never enlarged past its own size. */
  .event__logo {
    display: block;
    max-height: 40vh;
    max-width: 60vw;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  /* The title size of /grid and /results. Long text wraps; nothing is cut. */
  .event__series {
    max-width: 100%;
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    letter-spacing: var(--bc-track-title);
    overflow-wrap: anywhere;
  }

  .event__meta {
    max-width: 100%;
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-3);
    overflow-wrap: anywhere;
  }

  /* Look presets (overlay-config rule 60, widgets.md rules 129–130). Paint only: no rule here
     sizes or positions a box. */
  :global([data-theme='vintage70']) .event,
  :global([data-theme='vintage80']) .event {
    background: var(--bc-plate-solid);
  }

  /* 70s: the red rule under the series name, and a teal meta line. */
  :global([data-theme='vintage70']) .event__series {
    box-shadow: inset 0 -4px 0 var(--bc-accent);
  }
  :global([data-theme='vintage70']) .event__meta {
    color: var(--bc-subhead);
  }

  /* 80s: the series name on the red Scoreboard plate, and a white meta line. */
  :global([data-theme='vintage80']) .event__series {
    background: var(--bc-header);
    box-shadow: 0 0 0 6px var(--bc-header);
    color: var(--bc-text-2);
  }
  :global([data-theme='vintage80']) .event__meta {
    color: var(--bc-text-2);
  }
</style>
