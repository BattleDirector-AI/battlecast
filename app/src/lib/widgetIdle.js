/* Per-widget "idle" predicates for config-gated auto-hide.
 *
 * The spec is a pure data feed — it never says "show widget X". Visibility is a
 * consumer concern: the broadcaster sets `visible` per widget, and can additionally
 * opt a *supporting* widget into `hideWhenIdle`, so it drops out of the render while
 * it has nothing meaningful to show (e.g. the battle box when the on-camera driver
 * is in clear air). A widget "supports" auto-hide iff it has a predicate here;
 * widgets without one (e.g. the standings tower, always meaningful) ignore the flag.
 *
 * The predicate reads the same snapshot/config the widget renders from, so the
 * decision can never disagree with what the widget would draw. */

import { isActiveBattle } from '../routes/battle/BattleBox.svelte'
import { isDriverSubjectIdle } from '../routes/driver/DriverLowerThird.svelte'

/** Valid (non-blank) rotation images — mirrors LogoRotation's own filtering. */
function validLogoImages(config) {
  const images = config?.logoRotation?.images
  return Array.isArray(images) ? images.filter((s) => typeof s === 'string' && s.trim()) : []
}

/** key -> (ctx: { snapshot, config }) => true when the widget has nothing to show. */
export const IDLE_PREDICATES = Object.freeze({
  battle: ({ snapshot }) => !isActiveBattle(snapshot?.relationship),
  logos: ({ config }) => validLogoImages(config).length === 0,
  // Driver lower-third is idle when there's no valid/degraded subject to show. This
  // keeps persistent-mode auto-hide and the config surfacing consistent; note the
  // dwell-mode fire/hide timing is handled IN the component, not by this stateless
  // predicate (AllView always mounts the slot when visible so dwell can run).
  driver: ({ snapshot }) => isDriverSubjectIdle(snapshot),
})

/** Whether a widget offers the "hide when idle" behavior (i.e. has a predicate). */
export function widgetSupportsAutoHide(key) {
  return Object.prototype.hasOwnProperty.call(IDLE_PREDICATES, key)
}

/** True when `key` supports auto-hide AND is currently idle for this snapshot/config.
 *  Widgets without a predicate are never idle (always render). */
export function isWidgetIdle(key, ctx) {
  const predicate = IDLE_PREDICATES[key]
  return predicate ? !!predicate(ctx) : false
}
