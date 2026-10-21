// The usable entries of a snapshot's `vehicles` (protocol-contract.md rule 21): a `vehicles`
// that is not an array is empty, and an entry that is not an object (`null`, a number, a
// string, an array) is absent — as if it were not in the array, wherever it sits.

/** True for a usable `vehicles[]` entry: a plain object, not `null` or an array. */
export const isVehicleEntry = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** The usable entries of a bare `vehicles` value (for callers that hold the array, not a snapshot).
 *  Always returns a NEW array (never the input itself), so callers may sort it in place. */
export function validVehicleList(vehicles) {
  return Array.isArray(vehicles) ? vehicles.filter(isVehicleEntry) : []
}

/** The usable entries of `snapshot.vehicles`. Always a NEW array. */
export function validVehicles(snapshot) {
  return validVehicleList(snapshot?.vehicles)
}
