import type { LeafletCodeBlock } from "#/lib/leaflet/types";

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  plaintext: "text",
  plain: "text",
};

/** Stable cache key for a leaflet code block (shared by server + client). */
export function codeBlockKey(
  block: Pick<LeafletCodeBlock, "language" | "plaintext">,
): string {
  return `${normalizeLanguage(block.language)}:${hashString(block.plaintext)}`;
}

export function normalizeLanguage(language: string | undefined): string {
  if (!language) return "text";
  const trimmed = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[trimmed] ?? trimmed;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ (value.codePointAt(index) ?? 0);
  }
  // `>>> 0` coerces the 32-bit signed hash to unsigned; Math.trunc would not.
  // eslint-disable-next-line unicorn/prefer-math-trunc
  return (hash >>> 0).toString(36);
}
