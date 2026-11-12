/* Replay logic — pure and DOM-free (widgets.md rule 117; ADR 0039).
 *
 * The badge reads only the producer's top-level `mode`: nothing here looks at `vehicles[]` or
 * any other field.
 */

/** True only when `mode` is a string that is `replay` after trim, with no case difference. */
export function isReplay(mode) {
  return typeof mode === 'string' && mode.trim().toLowerCase() === 'replay'
}
