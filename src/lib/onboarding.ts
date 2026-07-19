/**
 * "Onboarding completed" flag — set once the first-run onboarding wizard at
 * `/welcome` is finished or dismissed. Until it is set, a signed-in reader with
 * no follows is redirected into the wizard from the Home route.
 *
 * Persisted as `1` in the `standard-reader-onboarded` cookie (a fast-path for
 * SSR / guests). Signed-in users also store it on `user.onboarding_completed`
 * (`null` = never onboarded; `true` = done), which is the source of truth.
 */

export const ONBOARDING_COMPLETED_COOKIE = "standard-reader-onboarded";

export const ONBOARDING_COMPLETED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseOnboardingCompletedCookie(value: unknown): boolean {
  return value === "1";
}

export function onboardingCompletedToCookieValue(
  completed: boolean,
): "1" | "0" {
  return completed ? "1" : "0";
}

export function dbValueToOnboardingCompleted(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}

/**
 * How many of the people you follow the onboarding step shows. A first-run step
 * is a decision, not a directory — the rest are one tap away on `/friends`.
 */
export const ONBOARDING_FRIENDS_LIMIT = 6;
