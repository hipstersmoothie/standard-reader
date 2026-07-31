/**
 * Shared definitions for GFM- and Obsidian-style callouts (a.k.a. alerts /
 * admonitions). A callout is a blockquote whose first line is a type marker:
 *
 * ```
 * > [!NOTE]
 * > Body text.
 * ```
 *
 * Obsidian extends the syntax with a fold indicator and a custom title on the
 * marker line:
 *
 * ```
 * > [!warning]- Collapsed by default
 * > Body text.
 * ```
 *
 * The `-` / `+` after the marker makes the callout collapsible (`-` starts
 * closed, `+` starts open); anything after that on the line is a custom title.
 *
 * References:
 * - https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
 * - https://help.obsidian.md/callouts
 */

/** The visual families a callout can map to. Each drives a color + icon. */
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
 * Every recognized type keyword (GFM's five plus Obsidian's aliases) mapped to
 * its visual kind. GFM's `important` is purple in GitHub, so it maps to
 * `example`; `caution` is red, so it maps to `danger` — matching how those
 * alerts render on GitHub.
 */
const TYPE_TO_KIND: Record<string, CalloutKind> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "example",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "danger",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

export interface CalloutMarker {
  /** The normalized type keyword, e.g. `note` (always lowercase). */
  type: string;
  /** The visual kind the type maps to. */
  kind: CalloutKind;
  /** Whether the callout is collapsible (a `-`/`+` fold indicator was present). */
  collapsible: boolean;
  /** For a collapsible callout, whether it starts open (`+`) or closed (`-`). */
  defaultOpen: boolean;
  /** Author-supplied title, or the canonical label for the kind. */
  title: string;
  /** Length of the matched marker (marker + fold + title + trailing newline). */
  matchLength: number;
}

// [!TYPE] then an optional -/+ fold indicator, optional inline title, and the
// rest of that one line. Anchored to the start of the blockquote's text.
const MARKER_RE = /^[ \t]*\[!([A-Za-z][\w-]*)\]([-+]?)[ \t]*([^\n]*)(\n|$)/;

/** Resolve a type keyword to its visual kind (defaults to `note`). */
export function calloutKindForType(type: string): CalloutKind {
  return TYPE_TO_KIND[type.toLowerCase()] ?? "note";
}

/** Title-case a type keyword for the default header, e.g. `note` → `Note`. */
function titleCaseType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

export interface CalloutProps {
  kind: CalloutKind;
  title: string;
  /** `"open"`/`"closed"` when collapsible; `undefined` for a static callout. */
  fold?: "open" | "closed";
}

/**
 * Read callout metadata off a blockquote's hast properties. `remarkCallouts`
 * tags callout blockquotes with `className: callout` plus `data-callout-*`
 * attributes; an ordinary blockquote returns `null`.
 */
export function readCalloutProps(
  properties: Record<string, unknown> | undefined,
): CalloutProps | null {
  if (!properties) return null;
  const className = properties.className;
  const isCallout = Array.isArray(className)
    ? className.includes("callout")
    : className === "callout";
  if (!isCallout) return null;

  const kind =
    typeof properties.dataCalloutKind === "string"
      ? (properties.dataCalloutKind as CalloutKind)
      : "note";
  const title =
    typeof properties.dataCalloutTitle === "string"
      ? properties.dataCalloutTitle
      : "";
  const fold = properties.dataCalloutFold;
  return {
    kind,
    title,
    fold: fold === "open" || fold === "closed" ? fold : undefined,
  };
}

/**
 * Parse a callout marker from the start of a blockquote's leading text. Returns
 * `null` when the text does not open with `[!type]`, in which case the
 * blockquote should render as an ordinary quote.
 */
export function parseCalloutMarker(text: string): CalloutMarker | null {
  const match = MARKER_RE.exec(text);
  if (!match) return null;

  const type = match[1].toLowerCase();
  const fold = match[2];
  const rawTitle = match[3].trim();
  const kind = calloutKindForType(type);

  return {
    type,
    kind,
    collapsible: fold !== "",
    defaultOpen: fold !== "-",
    title: rawTitle || titleCaseType(type),
    matchLength: match[0].length,
  };
}
