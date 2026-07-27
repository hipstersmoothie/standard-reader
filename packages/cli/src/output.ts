/** Terminal output: colours when the stream is a TTY, plain text when piped. */

import { summarizeIssues } from "@standard-reader/converter";
import type { ConversionIssue } from "@standard-reader/converter";

const useColor =
  process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

function wrap(code: string) {
  const open = `\u001B[${code}m`;
  return (value: string) => (useColor ? `${open}${value}\u001B[0m` : value);
}

export const style = {
  bold: wrap("1"),
  cyan: wrap("36"),
  dim: wrap("2"),
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
};

export function say(message = ""): void {
  process.stdout.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** `[3]`, `[3, 7]`, `[3, 7 +5 more]` — block indices without a wall of numbers. */
function blockList(indices: Array<number>): string {
  if (indices.length === 0) return "";
  const shown = indices.slice(0, 4).join(", ");
  const rest = indices.length - 4;
  return style.dim(
    ` (block${indices.length === 1 ? "" : "s"} ${shown}${rest > 0 ? ` +${rest} more` : ""})`,
  );
}

/**
 * Render an issue list as grouped lines.
 *
 * `unsupported` losses come first and are marked so they read as the decision
 * point they are: those are the blocks that will not exist after the write.
 */
export function renderIssues(
  issues: Array<ConversionIssue>,
  indent = "  ",
): Array<string> {
  return summarizeIssues(issues).map((entry) => {
    const badge =
      entry.severity === "unsupported"
        ? style.red("dropped ")
        : style.yellow("changed ");
    const count = entry.count > 1 ? style.dim(` ×${entry.count}`) : "";
    const fallback = entry.fallback
      ? `\n${indent}          ${style.dim(`→ ${entry.fallback}`)}`
      : "";
    return `${indent}${badge}${style.bold(entry.blockType)}${count}${blockList(entry.blockIndices)}\n${indent}          ${entry.message}${fallback}`;
  });
}

export function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
