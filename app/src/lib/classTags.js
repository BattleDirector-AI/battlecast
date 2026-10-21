// Whether class tags show (widgets.md rule 60, overlay-config.md rule 47, ADR 0022): one answer
// for the whole overlay from the broadcaster's `theme.classTags` and the producer's
// `session.multiclass`. Never inferred from `vehicles[]`.

/** The `theme.classTags` values, in the editor's option order. */
export const CLASS_TAGS_VALUES = Object.freeze(['auto', 'show', 'hide'])

/** True when class tags show: `show` always, `hide` never, otherwise (`auto`) unless the
 *  producer says exactly `session.multiclass === false`. */
export function classTagsShown(setting, session) {
  if (setting === 'show') return true
  if (setting === 'hide') return false
  return session?.multiclass !== false
}
