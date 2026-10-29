/* Info panel logic — pure and DOM-free (widgets.md rules 76-80, 88; ADRs 0024, 0025).
 *
 * `eventHeader(event)` builds the header string from the producer's `event`; `infoLines`
 * builds the line list from `info_lines` and the profile's `lines`; `createInfoRotation` owns
 * which line is up and where the rotation stands when the list changes. The panel component
 * only times the line on screen. Everything here is the producer's or the broadcaster's text:
 * nothing looks at `vehicles[]` or `session`.
 */

/** The weather card's entry in the line list (rule 88). Its identity never depends on its
 *  text, so the rotation compares it as one fixed entry: new weather values change what the
 *  panel draws for it, never the list. */
export const WEATHER_CARD = Symbol('weather card')

/** A string with a non-whitespace character, trimmed; else null. */
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** The header (rule 76): round, name, track that hold, joined with ` · ` and uppercased, or
 *  null when no part holds. */
export function eventHeader(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null
  const parts = []
  const { round } = event
  if (typeof round === 'number' && Number.isInteger(round) && round >= 1) parts.push(`ROUND ${round}`)
  const name = text(event.name)
  if (name) parts.push(name)
  const track = text(event.track)
  if (track) parts.push(track)
  return parts.length ? parts.join(' · ').toUpperCase() : null
}

/** The line list (rule 77): the producer's valid lines, trimmed, then the configured lines;
 *  a line equal to an earlier one is dropped. */
export function infoLines(infoLinesField, configLines) {
  const out = []
  const add = (value) => {
    const line = text(value)
    if (line !== null && !out.includes(line)) out.push(line)
  }
  if (Array.isArray(infoLinesField)) infoLinesField.forEach(add)
  if (Array.isArray(configLines)) configLines.forEach(add)
  return out
}

const sameList = (a, b) => a.length === b.length && a.every((line, i) => line === b[i])

/**
 * The rotation's state (rules 79-80). `update(list)` takes the current line list; `advance()`
 * moves to the next line when the dwell ends. Both return what the dwell timer must do:
 * `'none'` (leave it), `'start'` (start a full dwell now) or `'stop'` (no dwell runs: no line,
 * or only one). `current()` is the line on screen, or null.
 */
export function createInfoRotation() {
  let list = []
  let index = -1

  const dwellAction = () => (list.length > 1 ? 'start' : 'stop')

  return {
    current: () => (index >= 0 ? list[index] : null),

    update(next) {
      const nextList = Array.isArray(next) ? next : []
      if (sameList(list, nextList)) return 'none'
      const prev = list
      const shown = index >= 0 ? prev[index] : null
      list = nextList.slice()
      if (list.length === 0) {
        index = -1
        return 'stop'
      }
      if (shown === null) {
        index = 0
        return dwellAction()
      }
      const at = list.indexOf(shown)
      if (at >= 0) {
        // Still listed: it stays, and a running dwell is not restarted (rule 80). A list that
        // grows from one line starts the dwell now; a list down to one line stops it (rule 79).
        index = at
        if (list.length < 2) return 'stop'
        return prev.length < 2 ? 'start' : 'none'
      }
      // Gone: the line at its index (the first, if the list is too short) replaces it at once.
      index = index < list.length ? index : 0
      return dwellAction()
    },

    advance() {
      if (list.length < 2) return 'stop'
      index = (index + 1) % list.length
      return 'start'
    },
  }
}

/**
 * The panel's place and width in canvas px (rule 78a): as wide as the wider of its slot and its
 * header's need (`null` with no header). It keeps the slot's left edge and takes on the left only
 * the width the canvas has no room for on the right, never past the canvas's left edge (or the
 * slot's own, when that is further left), so it always covers its slot.
 */
export function infoPanelSpan({ slotLeft: x, slotWidth: w, headerNeed, canvasWidth: c }) {
  const width = Math.max(w, headerNeed ?? 0)
  const pastRight = Math.max(0, x + width - Math.max(c, x + w))
  return { left: Math.max(Math.min(x, 0), x - pastRight), width }
}
