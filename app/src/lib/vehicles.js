// The usable entries of a snapshot's `vehicles` (protocol-contract.md rule 21): a `vehicles`
// that is not an array is empty, and an entry that is not an object (`null`, a number, a
// string, an array) is absent — as if it were not in the array, wherever it sits.
// Always returns a NEW array (never `snapshot.vehicles` itself), so callers may sort it in place.
export function validVehicles(snapshot) {
  const vehicles = snapshot?.vehicles
  if (!Array.isArray(vehicles)) return []
  return vehicles.filter((v) => v && typeof v === 'object' && !Array.isArray(v))
}
