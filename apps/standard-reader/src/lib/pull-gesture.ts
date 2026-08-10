/**
 * Geometry and arming rules for the pull-to-refresh gesture, kept apart from the
 * hook so they can be exercised without a DOM.
 */

/**
 * The furthest the indicator will ever travel. Raw finger distance is damped
 * toward this asymptote, so the pull never hits a wall — it just gets heavier,
 * which is what the gesture feels like everywhere else on a phone.
 */
export const MAX_PULL = 120;

/** Damped distance at which letting go commits to a refresh. */
export const PULL_THRESHOLD = 64;

/**
 * How far the page stays held open while the refresh runs. Wide enough to clear
 * the 44px chip centred in it with room on either side, so the spinner reads as
 * sitting in a gap the page opened rather than wedged into it.
 */
export const PULL_REST = 68;

/**
 * Movement shorter than this is still ambiguous — it could become a scroll, a
 * horizontal swipe, or a tap — so the gesture stays unclaimed until it is past.
 */
export const PULL_SLOP = 8;

/**
 * A quick flick should refresh even if it never travelled the full threshold.
 * px/ms at release, paired with {@link FLICK_MIN_DISTANCE} so a stray twitch
 * can't trip it.
 */
export const FLICK_VELOCITY = 0.11;
export const FLICK_MIN_DISTANCE = 24;

/**
 * Rubber-banding: every pixel of finger travel buys a little less indicator
 * travel than the one before it, approaching {@link MAX_PULL} but never
 * reaching it.
 */
export function dampPull(rawDistance: number): number {
  if (rawDistance <= 0) return 0;
  return MAX_PULL * (1 - Math.exp(-rawDistance / MAX_PULL));
}

/** 0 → nothing pulled, 1 → far enough to let go. Clamped at 1. */
export function pullProgress(dampedDistance: number): number {
  return Math.min(1, Math.max(0, dampedDistance / PULL_THRESHOLD));
}

/**
 * Whether releasing here should refresh: either the pull crossed the threshold,
 * or it was a fast enough flick to mean the same thing.
 */
export function shouldCommitPull({
  dampedDistance,
  rawDistance,
  elapsedMs,
}: {
  dampedDistance: number;
  rawDistance: number;
  elapsedMs: number;
}): boolean {
  if (dampedDistance >= PULL_THRESHOLD) return true;
  if (elapsedMs <= 0) return false;
  const velocity = rawDistance / elapsedMs;
  return velocity > FLICK_VELOCITY && dampedDistance >= FLICK_MIN_DISTANCE;
}

/**
 * A downward drag only counts once it is clearly vertical. Horizontal-dominant
 * movement belongs to whatever the finger is actually on — a carousel, a
 * swipeable row, the comic reader's page turn.
 */
export function isVerticalPull(deltaX: number, deltaY: number): boolean {
  return deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX);
}
