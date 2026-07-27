/**
 * When to convert without asking, when to ask, and when to leave well alone.
 *
 * Split out from the command so the rules can be tested without a terminal or a
 * PDS. The defaults are deliberately conservative in the direction of *not*
 * overwriting: a record whose conversion would drop content is skipped unless
 * someone actually says otherwise.
 */

import type { ConversionResult } from "@standard-reader/converter";

export interface Policy {
  /** Ask about each record with warnings. Requires a TTY. */
  interactive: boolean;
  /** Convert even records where blocks are dropped entirely. */
  force: boolean;
  /** Treat any change at all — not just dropped blocks — as worth stopping for. */
  strict: boolean;
}

export type AutoDecision = "convert" | "skip" | "ask";

export function hasUnsupported(result: ConversionResult): boolean {
  return result.issues.some((issue) => issue.severity === "unsupported");
}

/**
 * What to do with one converted record before any human is consulted.
 *
 * `ask` is only ever returned when the caller said it could prompt; otherwise
 * the answer is already final.
 */
export function autoDecide(
  result: ConversionResult,
  policy: Policy,
): AutoDecision {
  // Nothing to write — either already in the target format or unconvertible.
  if (!result.content || result.unchanged) return "skip";
  if (policy.force) return "convert";
  if (result.issues.length === 0) return "convert";
  if (policy.interactive) return "ask";
  if (hasUnsupported(result)) return "skip";
  return policy.strict ? "skip" : "convert";
}
