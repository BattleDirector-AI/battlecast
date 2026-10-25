/* Weather logic — pure and DOM-free (widgets.md rules 83-84, 88; ADR 0025).
 *
 * `weatherParts(weather)` reads the producer's `session.weather` into the parts that hold;
 * `formatTemp` writes one temperature in the chosen unit; `weatherCardText` builds the info
 * panel's weather card. The values are the producer's readings: nothing here looks at
 * `vehicles[]` or any other field.
 */

/** A finite number; else null (a numeric string is not a temperature). */
const temp = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** A string with a non-whitespace character, trimmed; else null. */
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** The parts of `session.weather` that hold (rule 83): `{ air, track, conditions }`, each the
 *  °C number / trimmed string, or null. A weather that is not an object has no part. */
export function weatherParts(weather) {
  if (!weather || typeof weather !== 'object' || Array.isArray(weather)) {
    return { air: null, track: null, conditions: null }
  }
  return { air: temp(weather.air_temp), track: temp(weather.track_temp), conditions: text(weather.conditions) }
}

/** True when at least one part holds. */
export function hasWeather(parts) {
  return parts.air !== null || parts.track !== null || parts.conditions !== null
}

/** One temperature as shown (rule 84): `f` converts from °C, the result is rounded to a whole
 *  degree (`Math.round`), negative zero shows as 0, and the unit follows with no space. */
export function formatTemp(celsius, unit) {
  const fahrenheit = unit === 'f'
  const rounded = Math.round(fahrenheit ? (celsius * 9) / 5 + 32 : celsius)
  return `${rounded === 0 ? 0 : rounded}°${fahrenheit ? 'F' : 'C'}`
}

/** The info panel's weather card (rule 88): `AIR …`, `TRACK …` and the conditions that hold,
 *  joined with ` · ` and uppercased; null when no part holds. */
export function weatherCardText(weather, unit) {
  const { air, track, conditions } = weatherParts(weather)
  const parts = []
  if (air !== null) parts.push(`AIR ${formatTemp(air, unit)}`)
  if (track !== null) parts.push(`TRACK ${formatTemp(track, unit)}`)
  if (conditions !== null) parts.push(conditions)
  return parts.length ? parts.join(' · ').toUpperCase() : null
}
