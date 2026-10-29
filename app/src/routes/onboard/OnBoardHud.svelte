<script module>
  // On-board HUD — the on-camera subject's LIVE inputs (throttle / brake / speed /
  // gear) from `subject.telemetry`, plus an optional, configurable driver/vehicle
  // identity strip (ON BOARD label + position / number / name / class / make / model).
  // The two parts render independently (widgets.md rules 54–58, ADR 0021). See
  // spec/v1/SPEC.md and docs/plans/0.6.0-onboard-hud.md.
  //
  // The telemetry re-renders every snapshot. The identity fields come from the
  // additive `vehicle` spec fields (car_number / make / model) plus driver_name /
  // vehicle_class, resolved against the on-camera subject. To avoid showing the
  // driver name twice, the HUD can hold off while the driver lower-third (#21) plays
  // its "now on camera" dwell and reveal once it wipes out, or hold only its identity
  // strip under a persistent card (the hand-off) — see the instance script.
  //
  // Dumb overlay, smart producer (docs/decisions/0002-lower-third-widgets.md): every
  // value is producer-owned. Inputs may be null/undefined/partial/garbage — these
  // helpers normalize defensively and never throw.
  import { fmtDriverName, positiveIntOrNull } from '../../design/format.js'
  import { resolveSubject } from '../driver/DriverLowerThird.svelte'

  /** Coerce to a finite number, else null. */
  function finiteOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  /** Clamp a [0,1] input (throttle/brake) into range, or null if not a number. */
  function clamp01(v) {
    const n = finiteOrNull(v)
    if (n == null) return null
    return Math.max(0, Math.min(1, n))
  }

  /**
   * Normalize a raw `subject.telemetry` object into the HUD's render model, or null
   * when there is nothing to show (absent object, or every field missing/garbage) so
   * the component can render nothing rather than an empty plate.
   */
  export function resolveTelemetry(telemetry) {
    if (telemetry == null || typeof telemetry !== 'object') return null
    const throttle = clamp01(telemetry.throttle)
    const brake = clamp01(telemetry.brake)
    const speed = finiteOrNull(telemetry.speed)
    const gearNum = finiteOrNull(telemetry.gear)
    const gear = gearNum == null ? null : Math.trunc(gearNum)
    const hasContent = throttle != null || brake != null || speed != null || gear != null
    if (!hasContent) return null
    return { throttle, brake, speed, gear }
  }

  /** Gear numeral -> broadcast label: 0 -> N (neutral), <0 -> R (reverse), else verbatim. */
  export function gearLabel(gear) {
    if (gear == null) return null
    if (gear === 0) return 'N'
    if (gear < 0) return 'R'
    return String(gear)
  }

  // The producer emits `speed` in canonical km/h (see spec/v1/SPEC.md
  // `subject.telemetry`); the HUD converts to the broadcaster-selected display unit.
  const KMH_TO_MPH = 0.621371

  /** Convert a canonical km/h speed to the display `unit` ('kmh' | 'mph'), or null. */
  export function convertSpeed(speedKmh, unit = 'kmh') {
    if (speedKmh == null) return null
    return unit === 'mph' ? speedKmh * KMH_TO_MPH : speedKmh
  }

  /** Speed (canonical km/h) -> rounded numeral string in the display `unit`, or null. */
  export function speedLabel(speedKmh, unit = 'kmh') {
    const v = convertSpeed(speedKmh, unit)
    if (v == null) return null
    return String(Math.round(v))
  }

  /** Display `unit` -> its readout label. */
  export function unitLabel(unit) {
    return unit === 'mph' ? 'MPH' : 'KM/H'
  }

  /**
   * Resolve the on-camera subject's driver/vehicle identity for the HUD, honoring the
   * per-widget `driverInfo` toggles ({ name, number, position, class, make, model }
   * booleans). `name` is the subject's name as rule 14b picks it; the rest are read off the
   * `vehicles[]` entry matched by `slot_id` — so a degraded subject (slot unresolved)
   * yields the name only (widgets.md rule 57). Returns only the
   * ENABLED and PRESENT fields, or null when there is nothing to show — so the caller
   * can omit the identity strip entirely. Never throws on partial/garbage data.
   * `showClass` is the overlay-wide class-tags answer (`classTagsShown`, rule 63): false makes
   * the class field count as having no value, so a class-only strip resolves to null.
   * `nameStyle` is the profile's `theme.nameStyle` (widgets.md rule 111); routes always pass it,
   * and the bare default is the full form the strip showed before the style was overlay-wide.
   */
  export function resolveIdentity(snapshot, widget = {}, showClass, nameStyle = 'full') {
    const info = widget && typeof widget.driverInfo === 'object' && widget.driverInfo ? widget.driverInfo : {}
    const subject = snapshot?.subject ?? null
    if (!subject || typeof subject !== 'object') return null
    // The same resolver as #21/#22, so the malformed-entry skip and the name pick
    // (widgets.md rules 14a/14b) cannot drift between the HUD and the lower-thirds.
    const { vehicle, name: rawName } = resolveSubject(snapshot)
    const out = {}
    if (info.name && rawName) out.name = fmtDriverName(rawName, nameStyle)
    const number = vehicle?.car_number
    if (info.number && number != null && String(number).trim()) out.number = String(number).trim()
    const position = positiveIntOrNull(vehicle?.position)
    if (info.position && position != null) out.position = position
    if (showClass && info.class && vehicle?.vehicle_class) out.class = String(vehicle.vehicle_class)
    if (info.make && vehicle?.make) out.make = String(vehicle.make)
    if (info.model && vehicle?.model) out.model = String(vehicle.model)

    const has = out.name || out.number || out.position || out.class || out.make || out.model
    return has ? out : null
  }
</script>

<script>
  import ClassChip from '../../design/ClassChip.svelte'

  let {
    telemetry = null,
    mode = null,
    speedUnit = 'kmh',
    // Pre-resolved identity ({ name?, number?, position?, class?, make?, model? } or null) — the
    // caller resolves it via resolveIdentity() from the snapshot + the widget config.
    identity = null,
    // Hand-off inputs (only on `/all`). `driverWidget` is the driver lower-third's config while
    // that card is visible, else null (no gate: standalone `/onboard`, or the card hidden).
    // `cardShown` is whether the card is up right now: AllView runs the card's one show/hide
    // timer and hands the same flag to the card and here, so the two cannot drift (rule 24).
    // While the card is up and `waitForLowerThird` is on, the HUD holds itself (dwell) or its
    // identity strip (persistent) back.
    driverWidget = null,
    cardShown = false,
    waitForLowerThird = true,
    classColors = {},
    // The style `identity.name` was resolved in; short style reserves the reference short form
    // in the name slot (widgets.md rule 113).
    nameStyle = 'full',
  } = $props()

  const t = $derived(resolveTelemetry(telemetry))
  const gear = $derived(t ? gearLabel(t.gear) : null)
  const speed = $derived(t ? speedLabel(t.speed, speedUnit) : null)
  const unit = $derived(unitLabel(speedUnit))
  const carLine = $derived(identity ? [identity.make, identity.model].filter(Boolean).join(' ') : '')

  // What the hand-off holds follows the card's trigger mode now (rule 24): a `dwell` card
  // holds the whole HUD, telemetry or not; a `persistent` card holds only the identity
  // strip, since the card already shows the name, and the telemetry row keeps rendering.
  const held = $derived(!!driverWidget && waitForLowerThird !== false && cardShown)
  const persistentCard = $derived(driverWidget?.trigger === 'persistent')
  const suppressed = $derived(held && !persistentCard)
  const showIdentity = $derived(!!identity && !(held && persistentCard))
  // The identity strip and the telemetry row render independently (rule 56): the HUD
  // shows whenever either has content and the hand-off is not holding it.
  const visible = $derived((!!t || showIdentity) && !suppressed)
</script>

{#if visible}
<section
  class="bc-onboard"
  data-testid="onboard-hud"
  data-mode={mode ?? ''}
  aria-label="On-board HUD"
>
  {#if showIdentity}
    <div class="bc-onboard__identity" class:bc-onboard__identity--solo={!t} data-testid="onboard-identity">
      <span class="bc-onboard__label" data-testid="onboard-label">ON BOARD</span>
      {#if identity.position != null}
        <span class="bc-onboard__position" data-testid="onboard-driver-position">P{identity.position}</span>
      {/if}
      {#if identity.number}
        <span class="bc-onboard__number" data-testid="onboard-driver-number">{identity.number}</span>
      {/if}
      {#if identity.name}
        <span class="bc-onboard__driver" class:bc-name-ref={nameStyle === 'short'} data-testid="onboard-driver-name"
          >{identity.name}</span
        >
      {/if}
      {#if identity.class}
        <span class="bc-onboard__class" data-testid="onboard-driver-class">
          <ClassChip carClass={identity.class} size="compact" {classColors} />
        </span>
      {/if}
      {#if carLine}
        <span class="bc-onboard__car" data-testid="onboard-driver-car"
          ><span class="bc-onboard__car-text">{carLine}</span></span
        >
      {/if}
    </div>
  {/if}

  {#if t}
  <div class="bc-onboard__telemetry">
    <div class="bc-onboard__bars">
      {#if t.throttle != null}
        <div class="bc-onboard__bar" data-testid="onboard-throttle">
          <span class="bc-onboard__bar-label">THROTTLE</span>
          <div class="bc-onboard__track">
            <div
              class="bc-onboard__fill bc-onboard__fill--throttle"
              data-testid="onboard-throttle-fill"
              style:width={`${t.throttle * 100}%`}
            ></div>
          </div>
        </div>
      {/if}
      {#if t.brake != null}
        <div class="bc-onboard__bar" data-testid="onboard-brake">
          <span class="bc-onboard__bar-label">BRAKE</span>
          <div class="bc-onboard__track">
            <div
              class="bc-onboard__fill bc-onboard__fill--brake"
              data-testid="onboard-brake-fill"
              style:width={`${t.brake * 100}%`}
            ></div>
          </div>
        </div>
      {/if}
    </div>

    <div class="bc-onboard__readouts">
      {#if speed != null}
        <div class="bc-onboard__readout" data-testid="onboard-speed">
          <span class="bc-onboard__value bc-onboard__value--speed">{speed}</span>
          <span class="bc-onboard__readout-label" data-testid="onboard-speed-unit">{unit}</span>
        </div>
      {/if}
      {#if gear != null}
        <div class="bc-onboard__readout" data-testid="onboard-gear">
          <span class="bc-onboard__value bc-onboard__value--gear">{gear}</span>
          <span class="bc-onboard__readout-label">GEAR</span>
        </div>
      {/if}
    </div>
  </div>
  {/if}
</section>
{/if}

<style>
  /* A compact over-camera HUD: an optional driver/vehicle identity strip on top, and
     the throttle/brake bars + SPEED/GEAR readouts below. Smoked-glass plate like the
     other widgets. */
  .bc-onboard {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--bc-space-2);
    width: fit-content;
    max-width: 100%;
    /* Never narrower than the strip's whole items, the name above all, which beats the
       max-width (widgets.md rules 112, 114); the make-and-model line adds nothing to it. */
    min-width: min-content;
    box-sizing: border-box;
    padding: var(--bc-space-2) var(--bc-space-3);
    background: var(--bc-header);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    color: var(--bc-text);
  }

  /* Identity strip: ON BOARD [Pn] [number] NAME [class] make model — sits above the
     telemetry row, divided from it by a hairline. */
  .bc-onboard__identity {
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    padding-bottom: var(--bc-space-1);
    border-bottom: 1px solid var(--bc-divider);
  }

  /* Strip only (no telemetry row below): no divider. */
  .bc-onboard__identity--solo {
    padding-bottom: 0;
    border-bottom: none;
  }

  .bc-onboard__label {
    flex: 0 0 auto;
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-live);
    line-height: 1;
    white-space: nowrap;
  }

  .bc-onboard__position {
    flex: 0 0 auto;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--bc-text);
  }

  .bc-onboard__number {
    flex: 0 0 auto;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--bc-text-on-accent);
    background: var(--bc-accent);
    border-radius: var(--bc-radius-chip);
    padding: 2px 6px;
  }

  .bc-onboard__driver {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    color: var(--bc-oncam-text);
    white-space: nowrap;
  }

  .bc-onboard__class {
    flex: 0 0 auto;
    display: inline-flex;
  }

  /* The make-and-model line is not a name: it is cut at the HUD's width and never widens it.
     A one-track grid of minmax(0, max-content) gives it no min-content width (so the HUD's
     min-width ignores it) while its max-content still sizes a HUD that has room; the text
     inside is clipped with the line's ellipsis. The strip's gap before it is moved inside the
     line (a negative margin, then the text's padding), so a line squeezed to nothing leaves no
     empty gap behind. */
  .bc-onboard__car {
    flex: 0 1 auto;
    min-width: 0;
    margin-left: calc(-1 * var(--bc-space-2));
    display: grid;
    grid-template-columns: minmax(0, max-content);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bc-onboard__car-text {
    padding-left: var(--bc-space-2);
    overflow: hidden;
    text-overflow: inherit;
  }

  /* Telemetry row: bars on the left, SPEED / GEAR readouts on the right. */
  .bc-onboard__telemetry {
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-4);
  }

  /* One grid for both rows, so the label column is as wide as the widest label (at least
     64px, the label's min-width) and both tracks start at the same x. A fixed column let
     THROTTLE run into its track once the face or textScale made it wider (#430). The floor
     sits on the label, not the column, so the label's real width counts in the HUD's
     min-content and a narrow slot cannot squeeze the column under it; the track keeps 108px. */
  .bc-onboard__bars {
    display: grid;
    grid-template-columns: max-content minmax(108px, 1fr);
    align-content: center;
    align-items: center;
    gap: var(--bc-space-2);
  }

  .bc-onboard__bar {
    display: contents;
  }

  .bc-onboard__bar-label {
    min-width: 64px;
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    line-height: 1;
  }

  .bc-onboard__track {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }

  .bc-onboard__fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 4px;
  }

  /* The HUD re-renders every tick; smooth the bar between frames under full motion, and
     snap instantly under reduced motion. Gated on the root `data-motion` attribute (see
     lib/motion.js), not the OS `prefers-reduced-motion` media query, so the smoothing
     still applies in OBS (whose CEF reports `reduce`); `data-motion="reduced"` opts out. */
  :global(:root:not([data-motion='reduced'])) .bc-onboard__fill {
    transition: width var(--bc-dur-reorder) var(--bc-ease);
  }

  .bc-onboard__fill--throttle {
    background: var(--bc-intensity-calm);
  }

  .bc-onboard__fill--brake {
    background: var(--bc-live);
  }

  .bc-onboard__readouts {
    display: flex;
    align-items: center;
    gap: var(--bc-space-4);
    padding-left: var(--bc-space-3);
    border-left: 1px solid var(--bc-divider);
  }

  .bc-onboard__readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 48px;
  }

  .bc-onboard__value {
    font-family: var(--bc-font-mono);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--bc-text);
  }

  .bc-onboard__value--speed {
    font-size: var(--bc-size-battle-pos);
  }

  .bc-onboard__value--gear {
    font-size: var(--bc-size-battle-pos);
    color: var(--bc-accent);
  }

  .bc-onboard__readout-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    line-height: 1;
  }

  /* The HUD's own vintage look (widgets rules 97–98, ADR 0032). Keyed on an ancestor's
     data-theme, so the /config preview stage gets it too. Paint only: no rule here sizes or
     positions a box, and none touches the fill's width or transition (overlay-config rule 60). */
  :global([data-theme='vintage70']) .bc-onboard__track,
  :global([data-theme='vintage70']) .bc-onboard__fill,
  :global([data-theme='vintage80']) .bc-onboard__track,
  :global([data-theme='vintage80']) .bc-onboard__fill {
    border-radius: 0;
  }

  /* 70s: a red rule along the plate's bottom, skewed tiles with upright type, gold gear, and
     bars cut into leaning segments. The mask on the track clips the fill inside it. */
  :global([data-theme='vintage70']) .bc-onboard {
    box-shadow: inset 0 -4px 0 var(--bc-accent);
  }
  :global([data-theme='vintage70']) .bc-onboard__number {
    color: var(--bc-oncam-text);
    text-shadow: none;
    font-style: normal;
    transform: skewX(-8deg);
    filter: drop-shadow(2px 2px 0 #000);
  }
  :global([data-theme='vintage70']) .bc-onboard__class {
    transform: skewX(-8deg);
    filter: drop-shadow(2px 2px 0 #000);
  }
  /* ClassChip's own face (Barlow) is bundled italic only; Barlow Condensed has an upright cut. */
  :global([data-theme='vintage70']) .bc-onboard__class :global(.bc-class-chip) {
    font-family: var(--bc-font-display);
    font-style: normal;
  }
  /* Barlow Condensed so THROTTLE fits its 64px column (#403); still italic. */
  :global([data-theme='vintage70']) .bc-onboard__bar-label,
  :global([data-theme='vintage70']) .bc-onboard__readout-label {
    font-family: var(--bc-font-display);
  }
  :global([data-theme='vintage70']) .bc-onboard__value--gear {
    color: var(--bc-text);
  }
  :global([data-theme='vintage70']) .bc-onboard__track {
    -webkit-mask-image: repeating-linear-gradient(104deg, #000 0 10px, transparent 10px 13px);
    mask-image: repeating-linear-gradient(104deg, #000 0 10px, transparent 10px 13px);
  }

  /* 80s: the black widget plate (scaled by plateAlpha), reverse-video tags whose 4px spreads
     meet across the strip's gap, no outline on dark glyphs, and bars cut into upright blocks. */
  :global([data-theme='vintage80']) .bc-onboard {
    background: var(--bc-plate);
  }
  :global([data-theme='vintage80']) .bc-onboard__label {
    background: var(--bc-live);
    box-shadow: 0 0 0 4px var(--bc-live);
    color: var(--bc-text-on-accent);
    text-shadow: none;
  }
  :global([data-theme='vintage80']) .bc-onboard__position {
    background: var(--bc-text-2);
    box-shadow: 0 0 0 4px var(--bc-text-2);
    color: var(--bc-text-on-accent);
    text-shadow: none;
  }
  :global([data-theme='vintage80']) .bc-onboard__number {
    text-shadow: none;
  }
  :global([data-theme='vintage80']) .bc-onboard__driver {
    color: var(--bc-text);
  }
  :global([data-theme='vintage80']) .bc-onboard__track {
    -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 12px);
    mask-image: repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 12px);
  }
</style>
