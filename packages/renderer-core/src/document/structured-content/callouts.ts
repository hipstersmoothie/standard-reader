/**
 * GFM- and Obsidian-style callouts (alerts / admonitions).
 *
 * A callout is a blockquote whose first line is a type marker:
 *
 * ```
 * > [!NOTE]
 * > Body text.
 * ```
 *
 * Obsidian extends it with a fold indicator and a custom title on the marker
 * line — `> [!warning]- Collapsed by default` — where `-` starts closed and `+`
 * starts open.
 *
 * The type keyword is normalized to a small set of visual kinds here rather
 * than in each renderer, so every consumer styles the same twenty-odd aliases
 * the same way.
 *
 * @see https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
 * @see https://help.obsidian.md/callouts
 */

/** The visual families a callout type can map to; each drives a colour + icon. */
export type CalloutKind =
  | "note"
  | "abstract"
  | "info"
  | "todo"
  | "tip"
  | "success"
  | "question"
  | "warning"
  | "failure"
  | "danger"
  | "bug"
  | "example"
  | "quote";

/**
 * Every recognized keyword (GFM's five plus Obsidian's aliases) mapped to its
 * kind. GFM's `important` renders purple on GitHub, so it maps to `example`;
 * `caution` renders red, so it maps to `danger`.
 */
const TYPE_TO_KIND: Record<string, CalloutKind> = {
  abstract: "abstract",
  attention: "warning",
  bug: "bug",
  caution: "danger",
  check: "success",
  cite: "quote",
  danger: "danger",
  done: "success",
  error: "danger",
  example: "example",
  fail: "failure",
  failure: "failure",
  faq: "question",
  help: "question",
  hint: "tip",
  important: "example",
  info: "info",
  missing: "failure",
  note: "note",
  question: "question",
  quote: "quote",
  success: "success",
  summary: "abstract",
  tip: "tip",
  tldr: "abstract",
  todo: "todo",
  warning: "warning",
};

/** Resolve a type keyword to its visual kind (defaults to `note`). */
export function calloutKindForType(type: string): CalloutKind {
  return TYPE_TO_KIND[type.toLowerCase()] ?? "note";
}

export interface CalloutMarker {
  /** The normalized type keyword, always lowercase (e.g. `note`). */
  type: string;
  kind: CalloutKind;
  /** Author-supplied title from the marker line, when there was one. */
  title?: string;
  /** Set only when a `-`/`+` fold indicator made the callout collapsible. */
  fold?: "open" | "closed";
  /** Length of the matched marker, for slicing it off the body. */
  matchLength: number;
}

// `[!TYPE]`, an optional -/+ fold indicator, an optional inline title, and the
// rest of that one line. Anchored to the start of the blockquote's text.
const MARKER = /^[ \t]*\[!([A-Za-z][\w-]*)\]([+-]?)[ \t]*([^\n]*)(\n|$)/;

/**
 * Read a callout marker off the start of a blockquote's leading text, or null
 * when the blockquote is an ordinary quote.
 */
export function parseCalloutMarker(text: string): CalloutMarker | null {
  const match = MARKER.exec(text);
  if (!match) return null;
  const [matched, rawType = "", foldFlag = "", rawTitle = ""] = match;
  const type = rawType.toLowerCase();
  const title = rawTitle.trim();
  return {
    kind: calloutKindForType(type),
    matchLength: matched.length,
    type,
    ...(title ? { title } : {}),
    ...(foldFlag ? { fold: foldFlag === "+" ? "open" : "closed" } : {}),
  };
}
