/* Race update box logic — pure and DOM-free (widgets.md rules 69-73, ADR 0023).
 *
 * `raceEventCard(entry)` reads one `race_events` entry into the card's exact strings, or
 * null for an entry rule 69 skips. `createRaceUpdateFeed` owns what the box remembers: the
 * seen ids, the baseline, the card that is up and the waiting queue. The box component only
 * times the card on screen. Events are the producer's facts: nothing here looks at
 * `vehicles[]` or compares snapshots.
 */
import { fmtName, fmtLapTime } from '../design/format.js'
import { presentName } from '../routes/driver/DriverLowerThird.svelte'

/** Most events that wait behind the card that is up (rule 73). */
export const RACE_UPDATE_QUEUE_MAX = 5

const LABELS = {
  fastest_lap: () => 'FASTEST LAP',
  leader_change: () => 'NEW LEADER',
  retirement: (e) => (e.finish_status === 3 ? 'DISQUALIFIED' : 'RETIRED'),
  penalty: () => 'PENALTY',
}

/** A string with a non-whitespace character, trimmed; else null. */
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** True when the field its type requires is readable (rule 69). */
function hasRequiredField(e) {
  switch (e.type) {
    case 'fastest_lap':
      return typeof e.lap_time === 'number' && Number.isFinite(e.lap_time) && e.lap_time > 0
    case 'retirement':
      return e.finish_status === 2 || e.finish_status === 3
    case 'penalty':
      return text(e.penalty) !== null
    default:
      return true
  }
}

/**
 * The card for one `race_events` entry: `{ id, type, label, name, driverName, value, detail }`
 * (`value` / `detail` null when the card has none), or null when the entry is not an
 * event (rule 69). `name` is the full form; `driverName` is the unformatted name, which the
 * box shows in the profile's name style (widgets.md rule 111).
 */
export function raceEventCard(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  if (typeof entry.id !== 'string' || !entry.id.trim()) return null
  if (typeof entry.type !== 'string' || !Object.prototype.hasOwnProperty.call(LABELS, entry.type)) return null
  const driver = presentName(entry.driver_name)
  if (!driver || !hasRequiredField(entry)) return null

  const cls = text(entry.vehicle_class)
  const label = LABELS[entry.type](entry)
  let value = null
  if (entry.type === 'fastest_lap') value = fmtLapTime(entry.lap_time)
  else if (entry.type === 'penalty') value = text(entry.penalty)

  return {
    id: entry.id,
    type: entry.type,
    label: cls ? `${cls.toUpperCase()} ${label}` : label,
    name: fmtName(driver),
    driverName: driver,
    value,
    detail: text(entry.detail),
  }
}

/** The events (cards) a snapshot lists, in array order; none for a non-array list. */
function cardsOf(snapshot) {
  const list = snapshot?.race_events
  if (!Array.isArray(list)) return []
  return list.map(raceEventCard).filter(Boolean)
}

/**
 * The race update box's memory (rules 71-73). `preview` (the /config editor) takes no
 * baseline. `push(snapshot)` reads a snapshot and returns the card that is up afterwards;
 * `advance()` ends the card that is up and returns the next one (or null, the box hides).
 */
export function createRaceUpdateFeed({ preview = false } = {}) {
  const seen = new Set()
  const waiting = []
  let baselined = !!preview
  let current = null

  return {
    get current() {
      return current
    },
    push(snapshot) {
      if (snapshot == null) return current
      const cards = cardsOf(snapshot)
      if (!baselined) {
        baselined = true
        for (const card of cards) seen.add(card.id)
        return current
      }
      for (const card of cards) {
        if (seen.has(card.id)) continue
        seen.add(card.id)
        if (current === null) {
          current = card
        } else {
          waiting.push(card)
          if (waiting.length > RACE_UPDATE_QUEUE_MAX) waiting.shift()
        }
      }
      return current
    },
    advance() {
      current = waiting.shift() ?? null
      return current
    },
  }
}
