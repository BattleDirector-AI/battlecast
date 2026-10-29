/* Where a widget grown past its slot sits on the canvas (widgets.md rule 115, ADR 0038).
 *
 * The info panel's formula (rule 78a, `infoPanelSpan` in infoPanel.js) with a natural left: a
 * widget keeps its natural left edge `L0` (its slot's `x`, or the centred left for the on-board
 * HUD) and grows right; the width the canvas has no room for on the right is taken on the left,
 * never past the canvas's left edge (or `L0` when that is already left of it). Pure and
 * DOM-free; AllView measures the widths. */

/** The grown widget's left edge in canvas px, for slot `x` / `w`, widget width `W` and canvas
 *  width `C`. A widget no wider than its slot keeps `naturalLeft`. */
export function grownLeft({ naturalLeft: l0, slotLeft: x, slotWidth: w, width, canvasWidth: c }) {
  if (!(width > w)) return l0
  return Math.max(Math.min(l0, 0), l0 - Math.max(0, l0 + width - Math.max(c, x + w)))
}
