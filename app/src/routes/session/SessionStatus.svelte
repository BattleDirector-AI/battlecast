<script module>
  // --- Flag resolution --------------------------------------------------------
  // `flag` is free-form per the spec ("commonly green/yellow/red/checkered/white/
  // none, but free-form — the producer owns the flag state and consumers tolerate
  // unknown values"). `none`/absent/blank means "no flag shown"; anything else we
  // don't recognize still renders (best-effort), just with a neutral swatch.
  const FLAG_META = {
    green: { label: 'GREEN FLAG', color: 'var(--bc-intensity-calm)' },
    yellow: { label: 'YELLOW FLAG', color: 'var(--bc-intensity-mid)' },
    red: { label: 'RED FLAG', color: 'var(--bc-live)' },
    white: { label: 'WHITE FLAG', color: '#F2F5F7' },
    checkered: { label: 'CHECKERED FLAG', color: null },
  }

  export function resolveFlag(flag) {
    if (flag == null) return null
    const key = String(flag).trim().toLowerCase()
    if (!key || key === 'none') return null
    const known = FLAG_META[key]
    if (known) return { key, ...known }
    // Unknown flag string: tolerate it, render a neutral chip with the raw label.
    return { key, label: `${key.toUpperCase()} FLAG`, color: 'var(--bc-text-3)' }
  }

  // --- Timed vs lap-limited auto-selection (#25 / #90 contract) ---------------
  // This is the ONLY judgment the widget makes; every other field is rendered
  // as-is. Mirrors spec/v1/SPEC.md "Timed vs lap-limited — automatic selection":
  //   1. `basis` set -> honor it.
  //   2. else `time_remaining` non-null -> clock.
  //   3. else `laps_remaining` / `total_laps` non-null -> lap counter.
  //   4. else -> hide the progress readout.
  // The widget carries no endurance-specific logic; the producer disambiguates
  // the "time-certain + N laps" case by setting `basis:"laps"` itself.
  export function selectProgressMode(session) {
    if (!session || typeof session !== 'object') return 'none'

    const basis = typeof session.basis === 'string' ? session.basis.trim().toLowerCase() : null
    if (basis === 'time') return 'time'
    if (basis === 'laps') return 'laps'

    const hasTime =
      session.time_remaining != null && !Number.isNaN(Number(session.time_remaining))
    if (hasTime) return 'time'

    const hasLaps =
      (session.laps_remaining != null && !Number.isNaN(Number(session.laps_remaining))) ||
      (session.total_laps != null && !Number.isNaN(Number(session.total_laps))) ||
      (session.current_lap != null && !Number.isNaN(Number(session.current_lap)))
    if (hasLaps) return 'laps'

    return 'none'
  }

  /** seconds -> 'M:SS' (or 'H:MM:SS' once an hour is crossed). */
  function fmtDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds)))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const ss = String(sec).padStart(2, '0')
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
    return `${m}:${ss}`
  }

  /** Session clock readout: 'M:SS' remaining, or 'M:SS / M:SS' when a total
   *  `session_length` (the progress denominator) is also known. */
  export function formatClock(timeRemaining, sessionLength) {
    if (timeRemaining == null || Number.isNaN(Number(timeRemaining))) return '—'
    const remaining = fmtDuration(timeRemaining)
    if (sessionLength == null || Number.isNaN(Number(sessionLength))) return remaining
    return `${remaining} / ${fmtDuration(sessionLength)}`
  }

  /** Lap-limited readout. Renders the PRODUCER-OWNED lap position verbatim — the
   *  widget never derives a lap number from `total_laps` − `laps_remaining`; that
   *  counting convention is the producer's (see spec/v1/SPEC.md 'session'). Shows
   *  'LAP X OF Y' when `current_lap` (X) and `total_laps` (Y) are known, 'LAP X'
   *  with only `current_lap`, else falls back to the raw laps the producer did
   *  send ('N LAPS REMAINING' / 'Y LAPS'), else a dash. */
  export function formatLaps(currentLap, totalLaps, lapsRemaining) {
    const cur =
      currentLap != null && !Number.isNaN(Number(currentLap)) ? Number(currentLap) : null
    const total =
      totalLaps != null && !Number.isNaN(Number(totalLaps)) ? Number(totalLaps) : null
    const remaining =
      lapsRemaining != null && !Number.isNaN(Number(lapsRemaining)) ? Number(lapsRemaining) : null

    if (cur != null && total != null) return `LAP ${cur} OF ${total}`
    if (cur != null) return `LAP ${cur}`
    if (remaining != null) return `${remaining} LAP${remaining === 1 ? '' : 'S'} REMAINING`
    if (total != null) return `${total} LAP${total === 1 ? '' : 'S'}`
    return '—'
  }
</script>

<script>
  // Dumb overlay, smart producer (docs/decisions/0002-lower-third-widgets.md): every
  // field here is producer-computed. `session` may be null/undefined/partial — this
  // component MUST tolerate that and never throw; when there is nothing at all worth
  // showing it renders nothing rather than an empty plate.
  let { session = null, mode = null } = $props()

  const flag = $derived(resolveFlag(session?.flag))
  const fcy = $derived(!!session?.full_course_yellow)
  const sc = $derived(!!session?.safety_car)
  const progressMode = $derived(selectProgressMode(session))
  const progressText = $derived(
    progressMode === 'time'
      ? formatClock(session?.time_remaining, session?.session_length)
      : progressMode === 'laps'
        ? formatLaps(session?.current_lap, session?.total_laps, session?.laps_remaining)
        : null,
  )
  const caution = $derived(fcy || sc)
  const hasContent = $derived(!!flag || fcy || sc || progressMode !== 'none')
</script>

{#if hasContent}
<section
  class="bc-session"
  class:bc-session--caution={caution}
  data-testid="session-status"
  data-mode={mode ?? ''}
  aria-label="Session status"
>
  <header class="bc-session__header">
    <span class="bc-session__title">SESSION</span>
    {#if flag}
      <div class="bc-session__flag" data-testid="session-flag" data-flag={flag.key}>
        <span
          class="bc-session__swatch"
          data-flag={flag.key}
          style:background={flag.color ?? undefined}
        ></span>
        <span class="bc-session__flag-label">{flag.label}</span>
      </div>
    {/if}
  </header>

  <div class="bc-session__body">
    <div class="bc-session__badges">
      {#if fcy}
        <span class="bc-session__badge bc-session__badge--fcy" data-testid="session-fcy">
          FULL COURSE YELLOW
        </span>
      {/if}
      {#if sc}
        <span class="bc-session__badge bc-session__badge--sc" data-testid="session-sc">
          SAFETY CAR
        </span>
      {/if}
    </div>

    {#if progressMode !== 'none'}
      <div
        class="bc-session__readout"
        data-testid="session-progress"
        data-progress-mode={progressMode}
      >
        {progressText}
      </div>
    {/if}
  </div>
</section>
{/if}

<style>
  .bc-session {
    position: relative;
    width: 100%;
    box-sizing: border-box;
    background: var(--bc-plate-dense);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    overflow: hidden;
    color: var(--bc-text);
  }

  /* Cautionary ring, same construction as BattleBox's intensifying border: drawn on
     an ::after overlay ABOVE the header (z-index 3) so it wraps the whole plate
     rather than being clipped along the top edge by the header's opaque fill. */
  .bc-session--caution::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 3;
  }

  @media (prefers-reduced-motion: no-preference) {
    .bc-session--caution {
      animation: bc-session-pulse-glow var(--bc-dur-pulse) var(--bc-ease) infinite;
    }
    .bc-session--caution::after {
      animation: bc-session-pulse-ring var(--bc-dur-pulse) var(--bc-ease) infinite;
    }
  }

  /* Reduced motion: a steady amber ring (no pulse, no bloom) still marks the
     caution state without animation. */
  @media (prefers-reduced-motion: reduce) {
    .bc-session--caution::after {
      box-shadow: inset 0 0 0 2px rgba(255, 194, 71, 0.9);
    }
  }

  @keyframes bc-session-pulse-ring {
    0%,
    100% {
      box-shadow: inset 0 0 0 1.5px rgba(255, 194, 71, 0.3);
    }
    50% {
      box-shadow: inset 0 0 0 2px rgba(255, 194, 71, 0.95);
    }
  }

  @keyframes bc-session-pulse-glow {
    0%,
    100% {
      box-shadow: var(--bc-shadow-plate), 0 0 0 rgba(255, 194, 71, 0);
    }
    50% {
      box-shadow: var(--bc-shadow-plate), 0 0 24px rgba(255, 194, 71, 0.45);
    }
  }

  .bc-session__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bc-space-3);
    height: var(--bc-widget-header);
    padding: 0 var(--bc-space-3);
    background: var(--bc-header);
    border-bottom: 1px solid var(--bc-hairline);
  }

  .bc-session__title {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-title);
    text-transform: uppercase;
    color: var(--bc-text-2);
    white-space: nowrap;
  }

  .bc-session__flag {
    display: flex;
    align-items: center;
    gap: var(--bc-space-1);
    min-width: 0;
  }

  .bc-session__swatch {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
  }

  /* Checkered flag: no single fill color, so paint an actual checkerboard. */
  .bc-session__swatch[data-flag='checkered'] {
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #0b0e13 25%, transparent 25%, transparent 75%, #0b0e13 75%, #0b0e13),
      linear-gradient(45deg, #0b0e13 25%, #fff 25%, #fff 75%, #0b0e13 75%, #0b0e13);
    background-size: 6px 6px;
    background-position:
      0 0,
      3px 3px;
  }

  .bc-session__flag-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bc-session__body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bc-space-3);
    padding: var(--bc-space-3);
  }

  .bc-session__badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--bc-space-2);
    min-width: 0;
  }

  .bc-session__badge {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    white-space: nowrap;
    padding: 3px 8px;
    border-radius: var(--bc-radius-chip);
    border: 1px solid;
  }

  .bc-session__badge--fcy {
    color: var(--bc-text-on-accent);
    background: var(--bc-intensity-mid);
    border-color: var(--bc-intensity-mid);
  }

  .bc-session__badge--sc {
    color: var(--bc-intensity-mid);
    background: transparent;
    border-color: var(--bc-intensity-mid);
  }

  .bc-session__readout {
    flex: 0 0 auto;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-battle-name);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-text);
    white-space: nowrap;
  }
</style>
