/**
 * Semantic haptic intents aligned with Apple Human Interface Guidelines.
 * Maps to web-haptics preset names; no-ops gracefully when unsupported.
 */

export type HapticIntent =
  | "selection"
  | "impactLight"
  | "impactMedium"
  | "impactHeavy"
  | "success"
  | "warning"
  | "error";

/** Maps semantic intents to web-haptics preset names. */
export const HAPTIC_PRESET_MAP: Record<
  HapticIntent,
  "selection" | "light" | "medium" | "heavy" | "success" | "warning" | "error"
> = {
  selection: "selection",
  impactLight: "light",
  impactMedium: "medium",
  impactHeavy: "heavy",
  success: "success",
  warning: "warning",
  error: "error",
};

let hapticsEnabled = true;

/**
 * Enable or disable haptic feedback globally.
 * @param enabled - Whether haptics should fire (default: true)
 */
export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

/**
 * Check if haptics are currently enabled.
 */
export function isHapticsEnabled(): boolean {
  return hapticsEnabled;
}
