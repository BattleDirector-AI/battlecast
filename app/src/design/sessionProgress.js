/* Session progress readout — the session-level clock or lap counter derived from
 * the spec-v1 `session` object. Native rF2/LMU keep this "Session Info" (session
 * countdown) distinct from the per-car timing tower and from the flag/FCY/SC
 * status indicators (see docs/research/native-overlays.md); battlecast renders it
 * in the standings tower header. The flag/FCY/SC indicators live in their own
 * status widget (RaceControlStatus.svelte).
 *
 * Dumb overlay, smart producer: every field is producer-computed and rendered
 * verbatim. The only judgment here is the timed-vs-lap auto-selection, mirrored
 * from spec/v1/SPEC.md 'session'. */

/**
 * Timed vs lap-limited auto-selection:
 *   1. `basis` set -> honor it.
 *   2. else `time_remaining` non-null -> clock.
 *   3. else `laps_remaining` / `total_laps` / `current_lap` non-null -> lap counter.
 *   4. else -> no progress readout.
 * The producer disambiguates the endurance "time-certain + N laps" case by setting
 * `basis:"laps"` itself; the consumer carries no endurance logic.
 */
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

/** Lap-limited readout. Renders the PRODUCER-OWNED lap position verbatim — never
 *  derives a lap number from `total_laps` − `laps_remaining`; that counting
 *  convention is the producer's (see spec/v1/SPEC.md 'session'). Shows 'LAP X OF Y'
 *  when `current_lap` (X) and `total_laps` (Y) are known, 'LAP X' with only
 *  `current_lap`, else falls back to the raw laps the producer did send
 *  ('N LAPS REMAINING' / 'Y LAPS'), else a dash. */
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

/** The session progress readout for the tower header — a compact remaining-time
 *  clock or a lap counter — or null when the session carries no progress (so the
 *  header shows just the mode). */
export function sessionProgressText(session) {
  const mode = selectProgressMode(session)
  if (mode === 'time') return formatClock(session?.time_remaining)
  if (mode === 'laps') return formatLaps(session?.current_lap, session?.total_laps, session?.laps_remaining)
  return null
}
