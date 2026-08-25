/**
 * Reading issue numbers out of a comic's post titles.
 *
 * A comic publication posts one page per document, and its titles almost always
 * carry the same three parts: the series, the issue, and which page of that
 * issue this is — `Fray In The Veil #2, Pg. 7`, `FITV #1 Cover`. The archive
 * therefore reads as dozens of near-identical rows, when what a reader actually
 * wants to browse is *issues*.
 *
 * This recovers the issue number so the publication page can group those pages
 * back into the issues they came from and show a shelf of covers.
 *
 * It is a naming convention, not a lexicon field, so it is treated as a guess:
 * a title that doesn't match yields null, and a publication whose titles mostly
 * don't match keeps the ordinary list rather than being forced into a shelf
 * built on bad parses.
 */

/**
 * `Series #12, Pg. 3` → series `Series`, number `12`, page label `Pg. 3`.
 *
 * The number must be preceded by `#` — the one part of the convention that is
 * near-universal in comics and unlikely to appear by accident. A bare number in
 * a title ("10 Things I Learned") is deliberately not matched.
 */
const ISSUE_TITLE =
  /^\s*(?<series>.*?)\s*#\s*(?<number>\d{1,5})\s*(?:[,:;—–-]\s*)?(?<page>.*?)\s*$/;

export interface ComicIssueTitle {
  /** The series name, `""` when the title opens with the number. */
  series: string;
  issueNumber: number;
  /** Whatever followed the number — `Cover`, `Pg. 3`, `""`. */
  pageLabel: string;
}

/** Parse a comic page's title, or null when it doesn't follow the convention. */
export function parseComicIssueTitle(
  title: string | null | undefined,
): ComicIssueTitle | null {
  if (!title) return null;
  const match = ISSUE_TITLE.exec(title);
  const number = match?.groups?.number;
  if (!number) return null;

  const issueNumber = Number.parseInt(number, 10);
  if (!Number.isFinite(issueNumber)) return null;

  return {
    series: match.groups?.series?.trim() ?? "",
    issueNumber,
    pageLabel: match.groups?.page?.trim() ?? "",
  };
}

/**
 * Whether a page label reads as a cover rather than an interior page.
 *
 * Used only to pick which page fronts an issue when its first document isn't
 * the obvious one; the first page in publication order is the default.
 */
export function isCoverPageLabel(pageLabel: string): boolean {
  const normalized = pageLabel.trim().toLowerCase();
  if (!normalized) return false;
  // "Inner cover" is the leaf behind the cover, not the cover.
  if (normalized.includes("inner")) return false;
  return normalized.includes("cover");
}

/**
 * The share of titles that must parse before grouping them into issues is
 * trustworthy. Below this the publication isn't following the convention and
 * the shelf would be built on noise.
 */
export const ISSUE_TITLE_MATCH_SHARE = 0.7;

/**
 * Whether a publication's titles follow the issue convention closely enough to
 * group by. A single stray post (an announcement, a one-off) shouldn't disable
 * the shelf, and a publication that merely happens to have one `#` in one title
 * shouldn't enable it.
 */
export function titlesLookLikeIssues(titles: Array<string>): boolean {
  if (titles.length === 0) return false;
  const parsed = titles.filter(
    (title) => parseComicIssueTitle(title) != null,
  ).length;
  return parsed / titles.length >= ISSUE_TITLE_MATCH_SHARE;
}
