/**
 * Reading a comic's structure out of its post titles.
 *
 * A comic publication posts one page per document, and its titles carry the
 * structure the lexicon has no field for: which part of the work this page
 * belongs to, and where in that part it sits. Two conventions cover almost all
 * of them:
 *
 *  - **numbered issues** — `Fray In The Veil #2, Pg. 7`, `FITV #1 Cover`. The
 *    `#` marks the issue; whatever follows names the page.
 *  - **named runs of pages** — `Prologue p.18`, `Chapter 2 — Page 7`, `Page 4`.
 *    There is no issue number at all; the pages are numbered straight through a
 *    named arc (or through the whole work, when the arc is unnamed).
 *
 * Either way the archive reads as dozens of near-identical rows, when what a
 * reader wants to browse is *parts*. This recovers the part so the publication
 * page can group those pages back together and show a shelf of covers.
 *
 * The same parsing is the evidence that a publication *is* a comic when its
 * publisher never declared one (see `#/lib/publication/serial`): posts that are
 * pages of art and titles that run in sequence is what a comic looks like from
 * the outside, and neither signal alone is enough to reroute a reader into the
 * page-flip reader.
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
 * `Prologue p.18` → arc `Prologue`, page `18`; `Page 4` → arc `""`, page `4`.
 *
 * The number must be introduced by a page marker (`p`, `pg`, `page`), for the
 * same reason the issue convention insists on `#`: a title that merely ends in a
 * number is prose ("Sonnet 18", "COMPVEMBER 2025"), and reading it as a page
 * would turn most blogs into comics.
 *
 * The arc is whatever came before the marker, and is empty for a comic that
 * numbers its pages straight through with no part names. Anything after the
 * number is kept out of the arc but otherwise ignored — `Prologue p.18 (end)`
 * is page 18 of the prologue.
 */
const PAGE_TITLE =
  /^\s*(?<arc>.*?)\s*(?:[,:;—–-]\s*)?\b(?:page|pgs?|p)\s*\.?\s*(?<number>\d{1,5})(?:\s*[(,:;—–-].*)?\s*$/i;

export interface ComicPageTitle {
  /** The named run these pages belong to, `""` when the title names none. */
  arc: string;
  pageNumber: number;
}

/**
 * Parse a page-numbered comic title, or null when it doesn't follow the
 * convention. Only consulted after {@link parseComicIssueTitle} declines, since
 * `FITV #2, Pg. 7` satisfies both and the issue number is the better grouping.
 */
export function parseComicPageTitle(
  title: string | null | undefined,
): ComicPageTitle | null {
  if (!title) return null;
  const match = PAGE_TITLE.exec(title);
  const number = match?.groups?.number;
  if (!number) return null;

  const pageNumber = Number.parseInt(number, 10);
  if (!Number.isFinite(pageNumber)) return null;

  return { arc: match.groups?.arc?.trim() ?? "", pageNumber };
}

/** Which part of a comic a page belongs to, however its titles are written. */
export interface ComicTitlePart {
  /**
   * Consecutive pages sharing this key are the same issue or arc. Opaque — it
   * exists to be compared, not shown.
   */
  key: string;
  /** What to print under the cover — `#2`, `Prologue`, `""` when unnamed. */
  label: string;
  /** The issue number, null when the title numbered pages instead of issues. */
  issueNumber: number | null;
  /** Whether this page is the part's cover rather than an interior page. */
  isCover: boolean;
}

/**
 * The part of the comic a title places its page in, under either convention, or
 * null when the title follows neither.
 *
 * Issues win over arcs when a title carries both: `Chapter 2 #4, Pg. 1` is page
 * 1 of issue 4, and grouping by the chapter would fold every issue in it into
 * one shelf entry.
 */
export function parseComicTitlePart(
  title: string | null | undefined,
): ComicTitlePart | null {
  const issue = parseComicIssueTitle(title);
  if (issue) {
    return {
      key: `#${issue.issueNumber}`,
      label: `#${issue.issueNumber}`,
      issueNumber: issue.issueNumber,
      isCover: isCoverPageLabel(issue.pageLabel),
    };
  }

  const page = parseComicPageTitle(title);
  if (!page) return null;
  return {
    // Arcs are named by hand across dozens of posts, so they are matched
    // case-insensitively — `Prologue P.1` and `Prologue p.2` are one arc.
    key: `arc:${page.arc.toLowerCase()}`,
    label: page.arc,
    issueNumber: null,
    // The page convention numbers every page, so a cover is never one of them;
    // the part's first page fronts it instead.
    isCover: false,
  };
}

/**
 * The share of titles that must parse before grouping them into parts is
 * trustworthy. Below this the publication isn't following either convention and
 * the shelf would be built on noise.
 */
export const COMIC_TITLE_MATCH_SHARE = 0.7;

/**
 * Whether a publication's titles run in sequence closely enough to group by. A
 * single stray post (an announcement, a one-off) shouldn't disable the shelf,
 * and a publication that merely happens to have one `#` in one title shouldn't
 * enable it.
 */
export function titlesLookLikeComicSequence(titles: Array<string>): boolean {
  if (titles.length === 0) return false;
  const parsed = titles.filter(
    (title) => parseComicTitlePart(title) != null,
  ).length;
  return parsed / titles.length >= COMIC_TITLE_MATCH_SHARE;
}
