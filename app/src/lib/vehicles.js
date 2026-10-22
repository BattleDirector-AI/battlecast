// The entries of a snapshot's `vehicles` (protocol-contract.md rule 21): a `vehicles` that is
// not an array is empty, and an entry that is not an object (`null`, a number, a string, an
// array) is absent — as if it were not in the array, wherever it sits. The field lists (tower,
// grid, results, battle-box neighbours) go further and keep only listable entries: an object
// with a usable slot_id and a finite position.

/** True for a usable `vehicles[]` entry: a plain object, not `null` or an array. */
export const isVehicleEntry = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** True for a usable `slot_id` value: a non-empty string (whitespace-only counts). */
export const isUsableSlotId = (id) => typeof id === 'string' && id !== ''

/** True when the entry is an object with a usable `slot_id`. */
export const hasSlotId = (v) => isVehicleEntry(v) && isUsableSlotId(v.slot_id)

/** True for a listable entry: a usable `slot_id` plus a usable `position` (a finite number). */
export const isListable = (v) => hasSlotId(v) && Number.isFinite(v.position)

/** The object entries of a bare `vehicles` value (for callers that hold the array, not a snapshot).
 *  Always returns a NEW array (never the input itself), so callers may sort it in place. */
export function validVehicleList(vehicles) {
  return Array.isArray(vehicles) ? vehicles.filter(isVehicleEntry) : []
}

/** The object entries of `snapshot.vehicles`. Always a NEW array. */
export function validVehicles(snapshot) {
  return validVehicleList(snapshot?.vehicles)
}

/** The listable entries of a bare `vehicles` value. Always a NEW array. */
export function listableVehicleList(vehicles) {
  const seen = new Set()
  return validVehicleList(vehicles).filter(
    (v) => isListable(v) && !seen.has(v.slot_id) && seen.add(v.slot_id),
  )
}

/** The car for a `slot_id` among entries sharing it: the first listable one, else the first
 *  entry with that slot_id (rule 21). `undefined` when no entry has it. */
export function carForSlot(vehicles, slotId) {
  const copies = validVehicleList(vehicles).filter((v) => hasSlotId(v) && v.slot_id === slotId)
  return copies.find(isListable) ?? copies[0]
}

/** The listable entries of `snapshot.vehicles`. Always a NEW array. */
export function listableVehicles(snapshot) {
  return listableVehicleList(snapshot?.vehicles)
}
