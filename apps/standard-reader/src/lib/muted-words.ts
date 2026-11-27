/**
 * Muted words — pure logic, no database import (mirrors `lib/mutes.ts`).
 *
 * A muted word hides an article whose **title or description** contains it, and
 * a publication whose **name or description** does. Article bodies are never
 * matched: the point is to hide things that are *about* the word, not every
 * piece that mentions it in passing.
 *
 * Matching is case-insensitive and whole-word: `president` hides "Ranking every
 * president" but not "presidential" or "vicepresident". Two affordances on top:
 *
 *  - A phrase (`white house`) matches its words with any run of whitespace
 *    between them.
 *  - A trailing `*` (`elect*`) turns the end of the word into a prefix match, so
 *    one entry can cover "election", "elections", and "electoral".
 *
 * The same rule is compiled twice — to a Postgres ARE (applied in SQL on
 * paginated feeds, where post-filtering a page would drop rows after `LIMIT`)
 * and to a JS `RegExp` (applied to rails and other already-fetched card lists).
 * The two are built from the same tokens here so they can't drift apart.
 */

/**
 * Upper bound on how many words one reader can mute.
 *
 * Bounds the per-row cost of the SQL filter: Postgres evaluates the folded
 * alternation at roughly 0.5µs per row per word on prod data, so 50 words is
 * ~25µs on each row a feed's index scan visits (Trending's 4-day window walks
 * ~22k). Raise it only alongside a cheaper matcher — see `TODO.md`.
 */
export const MAX_MUTED_WORDS = 50;

/** Upper bound on one muted word or phrase, in characters. */
export const MAX_MUTED_WORD_LENGTH = 64;

/**
 * Scripts written without spaces between words (or, for Hangul, with particles
 * glued onto nouns). A word-boundary assertion next to one of these characters
 * would almost never match, so those edges fall back to a substring match.
 */
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** A "word character" in the sense Postgres's `\m` / `\M` use. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Something worth matching on: at least one letter or digit. */
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Canonical form of a muted word: NFKC, lowercased, whitespace collapsed,
 * trimmed. Stored in this form, so "Politics" and " politics " are one entry.
 * Returns null for anything that can't be muted (empty, too long, or with no
 * letter or digit in it — a bare `*` would hide everything).
 */
export function normalizeMutedWord(raw: string): string | null {
  const word = raw
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/\s+/gu, " ")
    // Control characters: never meaningful in a title, and U+001F is the
    // field separator feed SQL matches across (see `notMutedByViewer`).
    .replaceAll(/\p{Cc}/gu, "")
    .replaceAll(/ {2,}/gu, " ")
    .trim();
  if (word.length === 0 || word.length > MAX_MUTED_WORD_LENGTH) return null;
  // Only one trailing `*` means anything; collapse `elect**` to `elect*`.
  const collapsed = word.replace(/\*+$/u, "*");
  const stem = collapsed.endsWith("*")
    ? collapsed.slice(0, -1).trimEnd()
    : collapsed;
  if (!HAS_WORD_CHAR.test(stem)) return null;
  return stem === collapsed ? stem : `${stem}*`;
}

interface MutedWordParts {
  tokens: Array<string>;
  boundaryStart: boolean;
  boundaryEnd: boolean;
}

/** Split a normalized word into the pieces both regex flavours are built from. */
function mutedWordParts(word: string): MutedWordParts {
  const prefix = word.endsWith("*");
  const stem = prefix ? word.slice(0, -1) : word;
  const tokens = stem.split(" ").filter(Boolean);
  const first = stem.at(0) ?? "";
  const last = stem.at(-1) ?? "";
  const boundaryAt = (char: string) =>
    WORD_CHAR.test(char) && !UNSPACED_SCRIPT.test(char);
  return {
    tokens,
    boundaryStart: boundaryAt(first),
    boundaryEnd: !prefix && boundaryAt(last),
  };
}

/**
 * Escape every regex metacharacter. Only punctuation is escaped: in a Postgres
 * ARE a backslash before a letter or digit is itself an escape (`\m`, `\d`), so
 * the escape set must never touch word characters. It is also exactly the set
 * a `u`-flag JS regex accepts as identity escapes (`\-` would be a syntax
 * error there), so one escaper serves both flavours.
 */
function escapeRegex(token: string): string {
  return token.replaceAll(/[\\^$.|?*+()[\]{}/]/gu, String.raw`\$&`);
}

/**
 * The Postgres ARE for one muted word, matched case-insensitively with `~*`.
 * `\m` / `\M` are ARE's start- and end-of-word assertions. Stored alongside the
 * word (`muted_words.pattern`) so feed SQL can `string_agg` a reader's words
 * into one alternation without re-deriving them.
 */
export function mutedWordPostgresPattern(word: string): string {
  const { tokens, boundaryStart, boundaryEnd } = mutedWordParts(word);
  const body = tokens.map((token) => escapeRegex(token)).join(String.raw`\s+`);
  return `${boundaryStart ? String.raw`\m` : ""}${body}${boundaryEnd ? String.raw`\M` : ""}`;
}

/** The JS equivalent of {@link mutedWordPostgresPattern}, without flags. */
function mutedWordJsSource(word: string): string {
  const { tokens, boundaryStart, boundaryEnd } = mutedWordParts(word);
  const body = tokens.map((token) => escapeRegex(token)).join(String.raw`\s+`);
  return `${boundaryStart ? String.raw`(?<![\p{L}\p{N}_])` : ""}${body}${boundaryEnd ? String.raw`(?![\p{L}\p{N}_])` : ""}`;
}

/**
 * One case-insensitive matcher for a reader's whole word list, or null when the
 * list is empty (so callers can skip the pass entirely).
 */
export function compileMutedWordMatcher(
  words: ReadonlyArray<string>,
): RegExp | null {
  const sources = words.filter(Boolean).map((word) => mutedWordJsSource(word));
  if (sources.length === 0) return null;
  return new RegExp(sources.map((s) => `(?:${s})`).join("|"), "iu");
}

/** Whether any of `texts` contains a muted word. */
export function textMatchesMutedWords(
  matcher: RegExp | null,
  ...texts: Array<string | null | undefined>
): boolean {
  if (!matcher) return false;
  return texts.some(
    (text) => text != null && text !== "" && matcher.test(text),
  );
}

/**
 * The text a card is judged by: an article's title + description, or a
 * publication's name + description. A card carries one or the other.
 */
export interface MutedWordCard {
  title?: string | null;
  name?: string | null;
  description?: string | null;
}

/** Whether a card's own title/name or description contains a muted word. */
export function cardMatchesMutedWords(
  card: MutedWordCard,
  matcher: RegExp | null,
): boolean {
  return textMatchesMutedWords(
    matcher,
    card.title,
    card.name,
    card.description,
  );
}
