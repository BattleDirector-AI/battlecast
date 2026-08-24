<script>
  /* An ⓘ affordance that reveals a sentence of help next to a config control.
   *
   * Deliberately a real <button> with a click-to-open popover rather than a native
   * `title=` tooltip: `title` has a ~1s hover delay, cannot be styled or wrapped,
   * is invisible on touch, and — the reason that matters most here — gives no
   * visual signal that help exists at all. Broadcasters have to be able to SEE
   * that a knob is explained.
   *
   * Closes on Escape or a click outside, so several of these on one dense panel
   * never stack up on screen. */

  let { text, label, testid = null } = $props()

  let open = $state(false)
  let root = $state(null)
  let pop = $state(null)
  // Most of these tips live in the editor's narrow right-hand panel, so a popover
  // anchored left would run off the window. Measure once on open and anchor right
  // instead when it would spill.
  let flip = $state(false)

  $effect(() => {
    if (!open || !pop) {
      flip = false
      return
    }
    const margin = 8
    const { right } = pop.getBoundingClientRect()
    if (right > window.innerWidth - margin) flip = true
  })

  /* Most of these tips sit INSIDE a <label> next to the control they explain, and
   * a click anywhere in a label activates that label's control. Without
   * preventDefault, asking what "Reduced motion" does would also switch reduced
   * motion on. stopPropagation then keeps the document handler below from seeing
   * the very click that opened the popover. */
  function toggle(event) {
    event.preventDefault()
    event.stopPropagation()
    open = !open
  }

  function onDocumentClick(event) {
    if (open && root && !root.contains(event.target)) open = false
  }

  function onDocumentKeydown(event) {
    if (event.key === 'Escape' && open) open = false
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onDocumentKeydown} />

<span class="helptip" bind:this={root}>
  <button
    type="button"
    class="helptip__btn"
    class:helptip__btn--open={open}
    aria-expanded={open}
    aria-label="What does {label} do?"
    data-testid={testid}
    onclick={(event) => toggle(event)}
  >
    i
  </button>
  {#if open}
    <span
      bind:this={pop}
      class="helptip__pop"
      class:helptip__pop--flip={flip}
      role="tooltip"
      data-testid={testid ? `${testid}-text` : null}
    >
      {text}
    </span>
  {/if}
</span>

<style>
  .helptip {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
    margin-left: 0.35rem;
  }
  .helptip__btn {
    width: 1.05rem;
    height: 1.05rem;
    padding: 0;
    border-radius: 50%;
    border: 1px solid #3a4354;
    background: transparent;
    color: #9aa7ba;
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-size: 0.72rem;
    line-height: 1;
    cursor: help;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .helptip__btn:hover,
  .helptip__btn:focus-visible {
    border-color: #2ed9a6;
    color: #2ed9a6;
  }
  .helptip__btn--open {
    border-color: #2ed9a6;
    background: rgba(46, 217, 166, 0.12);
    color: #2ed9a6;
  }
  .helptip__pop {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    z-index: 20;
    width: max-content;
    /* The editor's right-hand panel is 380px; stay inside it and wrap. */
    max-width: 20rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid #2a3140;
    border-radius: 4px;
    background: #1b2029;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    color: #cbd5e3;
    font-size: 0.76rem;
    font-weight: 400;
    line-height: 1.45;
    letter-spacing: normal;
    text-transform: none;
    white-space: normal;
  }
  /* Anchored right when a left-anchored popover would run past the window edge. */
  .helptip__pop--flip {
    left: auto;
    right: 0;
  }
</style>
