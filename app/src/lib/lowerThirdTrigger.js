/* Subject-driven lower-third trigger — the stateful fire/dwell/hide engine shared
 * by the driver lower-third (#21) and the qualifying/sector lower-third (#22).
 *
 * A lower-third is the bottom-of-screen name-tag a broadcast shows for the driver
 * currently on camera. It does NOT render continuously: it FIRES on a camera cut
 * (a change of `subject`), holds for a dwell, then auto-hides. This module owns
 * exactly that presentation timing — it computes nothing about the race (per the
 * "dumb overlay, smart producer" principle in
 * docs/decisions/0002-lower-third-widgets.md); it only notices that the producer's
 * `subject` changed and times the display.
 *
 * It is a plain (rune-free) state machine so it is trivially unit-testable with
 * fake timers. A Svelte component bridges it to reactive state: pass an `onChange`
 * callback that writes a `$state` boolean, and call `sync()` from an `$effect`
 * whenever the subject / config changes. See DriverLowerThird.svelte.
 *
 * Trigger modes (Decision A):
 *  - `dwell` (default): on a subject change to an active subject, fire (show), then
 *    auto-hide after `dwellSeconds` even if the camera stays. A new change re-fires
 *    and resets the dwell IN PLACE (no hide→show flicker). Edge-triggered: an
 *    unchanged subject repeated every snapshot does NOT re-fire.
 *  - `persistent`: shown whenever the subject is active; hidden when not. No timer.
 *
 * On (re)connect (Decision B): the first `sync()` after construction fires once for
 * the current active subject (so opening the Browser Source shows the current
 * driver), gated by `showOnConnect` (default true).
 */

export const DEFAULT_DWELL_SECONDS = 6

/**
 * Create a lower-third trigger engine.
 *
 * @param {{ onChange?: (shown: boolean) => void }} [opts]
 *   `onChange` fires whenever the visible/`shown` state flips (so a component can
 *   mirror it into reactive `$state`).
 * @returns {{ sync: Function, stop: Function, readonly shown: boolean }}
 */
export function createLowerThirdTrigger({ onChange } = {}) {
  let shown = false
  // `prevKey` is the previous snapshot's edge-detection key (subject.slot_id).
  // `undefined` means "never synced yet" — distinct from a genuine `null` slot.
  let prevKey
  let started = false
  let timer = null

  function emit(next) {
    if (next === shown) return
    shown = next
    if (typeof onChange === 'function') onChange(shown)
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  /**
   * Feed the engine the current subject + config. Idempotent for an unchanged
   * subject (the dwell keeps running); call it on every producer snapshot.
   *
   * @param {object} state
   * @param {string|null} [state.subjectSlotId] - the on-camera `subject.slot_id`
   *   (the stable per-session identity key). `null` when there is no subject.
   *   Edge detection keys off this, never the driver name.
   * @param {boolean} [state.active] - whether the subject is renderable (valid or
   *   name-only/degraded). When false the subject is idle and the card hides.
   * @param {'dwell'|'persistent'} [state.trigger]
   * @param {number} [state.dwellSeconds]
   * @param {boolean} [state.showOnConnect]
   * @returns {boolean} the resulting `shown` state.
   */
  function sync({
    subjectSlotId = null,
    active = false,
    trigger = 'dwell',
    dwellSeconds = DEFAULT_DWELL_SECONDS,
    showOnConnect = true,
  } = {}) {
    const key = subjectSlotId ?? null
    const mode = trigger === 'persistent' ? 'persistent' : 'dwell'
    const dwell = Number(dwellSeconds) > 0 ? Number(dwellSeconds) : DEFAULT_DWELL_SECONDS

    if (mode === 'persistent') {
      // Level-triggered: shown iff the subject is active. No timer.
      clearTimer()
      prevKey = key
      started = true
      emit(active)
      return shown
    }

    // --- dwell mode: edge-triggered on a subject change (a camera cut). The card
    // hides when the subject's slot_id changes AND on any `active: false` (idle /
    // invalid) subject, regardless of slot change; persistent mode is level-only. ---

    // A subject-less baseline (e.g. the initial `null` snapshot the render pages
    // hold before any producer data) must NOT consume the connect gate: stay hidden
    // and leave `started`/`prevKey` unset so the first *active* subject becomes the
    // connect event and honors `showOnConnect`.
    if (!started && !active) {
      clearTimer()
      emit(false)
      return shown
    }

    const isFirst = !started
    const changed = key !== prevKey
    started = true
    prevKey = key

    // Cut to an idle/invalid subject: hide right away — even if the slot_id is
    // unchanged (e.g. the on-camera car's vehicle drops out of the field).
    if (!active) {
      clearTimer()
      emit(false)
      return shown
    }

    // Unchanged active subject repeated on a later snapshot: do nothing (leave the
    // dwell running / the card as-is). This is the edge trigger — `A → A` never
    // re-fires.
    if (!changed && !isFirst) return shown

    // On connect, only fire when opted in; the baseline key is already established.
    if (isFirst && !showOnConnect) return shown

    // Fire (or re-fire): show immediately and (re)arm the dwell. Emitting `true`
    // when already shown is a no-op, so a re-fire updates the card in place with no
    // hide→show flicker.
    clearTimer()
    emit(true)
    timer = setTimeout(() => {
      timer = null
      emit(false)
    }, dwell * 1000)
    return shown
  }

  return {
    sync,
    /** Cancel any pending dwell timer (call on component destroy). */
    stop() {
      clearTimer()
    },
    get shown() {
      return shown
    },
  }
}
