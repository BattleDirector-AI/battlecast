/* Battle box exit grace (widgets.md rules 37-39, ADR 0013).
 *
 * A producer that toggles a battle on and off at its threshold made the box flicker. Once a
 * battle has shown, this holds that last ACTIVE battle for `graceSeconds` after it goes
 * idle, so a battle that comes straight back never blinks out. Only the exit is delayed.
 *
 * The hold is presentation timing, keyed to the on-camera `subject.slot_id`: a camera cut,
 * caution, or leaving a racing mode ends it at once, so the box never shows one car's
 * numbers against another. The grace needs time, so it cannot be a stateless snapshot
 * predicate; instead each render page runs one of these and hands BOTH the battle box and
 * the `/all` auto-hide filter the same effective snapshot, so the two still agree.
 */

import { isActiveBattle, isRacingMode, isCaution } from '../routes/battle/BattleBox.svelte'

/**
 * @param {{ onExpire?: () => void }} [opts] `onExpire` fires when a grace runs out with no
 *   new snapshot, so the caller can re-render from the latest snapshot.
 */
export function createBattleGrace({ onExpire } = {}) {
  // The last snapshot whose battle was active, frozen: the numbers a hold shows.
  let lastActive = null
  // Non-null while a hold is running: the frozen snapshot being shown.
  let held = null
  let timer = null

  function endHold() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    held = null
  }

  return {
    /**
     * Feed the latest producer snapshot; returns the snapshot the battle box should render
     * from — the live one, or the frozen last active one while a hold runs.
     */
    resolve(snapshot, graceSeconds) {
      const slot = snapshot?.subject?.slot_id ?? null
      if (!isRacingMode(snapshot?.mode) || isCaution(snapshot?.session)) {
        endHold()
        lastActive = null
        return snapshot
      }
      if (isActiveBattle(snapshot?.relationship)) {
        endHold()
        lastActive = snapshot
        return snapshot
      }
      const grace = Number.isFinite(graceSeconds) ? graceSeconds : 0
      // The frozen battle over the LIVE snapshot: only the battle numbers are old.
      const frozen = () => ({
        ...snapshot,
        subject: lastActive.subject,
        relationship: lastActive.relationship,
        vehicles: lastActive.vehicles,
      })
      // Idle. A running hold for this same subject keeps going — repeated idle snapshots
      // never restart it. A grace lowered mid-hold takes effect from the next exit, except
      // that 0 (hold off) ends the running hold at once. A subject with no slot_id gets no
      // hold: there is nothing to key it to.
      if (held && held.subject?.slot_id === slot && grace > 0) {
        held = frozen()
        return held
      }
      endHold()
      if (lastActive && lastActive.subject?.slot_id === slot && slot !== null && grace > 0) {
        held = frozen()
        timer = setTimeout(() => {
          timer = null
          held = null
          lastActive = null
          onExpire?.()
        }, grace * 1000)
        return held
      }
      lastActive = null
      return snapshot
    },

    destroy() {
      endHold()
      lastActive = null
    },
  }
}
