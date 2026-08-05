import { describe, expect, it } from "vitest";

import type { RepairCandidate } from "./repair-topics";
import { selectRepairTargets } from "./repair-topics";

/** The production threshold at the time of writing. */
const MAX_COVERAGE = 0.75;

function candidate(
  slug: string,
  tags: Array<string>,
  authorCount: number,
  name = slug,
): RepairCandidate {
  return {
    slug,
    name,
    tags,
    // Only the count is read here; the URIs never matter to the selection.
    publications: Array.from({ length: authorCount }, (_, index) => ({
      uri: `at://${slug}/${index}`,
      score: 1,
      matchedTagCount: 1,
    })),
    authorCount,
    topAuthorShare: 0.1,
    documentCount: authorCount * 3,
  };
}

const BOOKS = ["books", "reading", "fiction", "literature"];
const MUSIC = ["vinyl", "jazz", "k-pop", "hip hop"];

describe("selectRepairTargets", () => {
  it("restores a topic nothing live covers", () => {
    const { restore, rejected } = selectRepairTargets(
      [candidate("books-and-reading", BOOKS, 176)],
      [{ slug: "music", name: "Music", tags: MUSIC }],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["books-and-reading"]);
    expect(rejected).toEqual([]);
  });

  it("skips a topic a published one already covers", () => {
    const { restore, rejected } = selectRepairTargets(
      [candidate("books-and-reading", BOOKS, 176)],
      [
        {
          slug: "books-and-literature",
          name: "Books and Literature",
          tags: [...BOOKS, "poetry"],
        },
      ],
      MAX_COVERAGE,
    );

    expect(restore).toEqual([]);
    expect(rejected[0]).toMatchObject({
      reason: "duplicate-of-live-topic",
      coveredBy: "books-and-literature",
    });
  });

  it("keeps only the widest of two dead twins", () => {
    // The real pair: both qualify on their own, and restoring both would put
    // two Books topics on the site.
    const { restore, rejected } = selectRepairTargets(
      [
        candidate("books-and-reading-2", BOOKS, 94),
        candidate("books-and-reading", BOOKS, 176),
      ],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["books-and-reading"]);
    expect(rejected[0]).toMatchObject({
      reason: "duplicate-of-repaired-topic",
      coveredBy: "books-and-reading",
    });
  });

  it("keeps a narrower topic that is only partly inside a broader one", () => {
    // Containment is asymmetric on purpose. These two overlap on 4 of the
    // narrow one's 8 tags — half, so it is its own subject at a lower
    // altitude and both come back. The broad one is only 4/12 covered by it,
    // so it was never at risk either way.
    const broad = [
      ...BOOKS,
      "poetry",
      "essays",
      "publishing",
      "libraries",
      "book covers",
      "translation",
      "book clubs",
      "bookshops",
    ];
    const narrow = [...BOOKS, "sci-fi", "fantasy", "worldbuilding", "hugo"];
    const { restore } = selectRepairTargets(
      [candidate("broad", broad, 200), candidate("narrow", narrow, 20)],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["broad", "narrow"]);
  });

  it("drops a topic wholly swallowed by a broader one", () => {
    // The other side of the same rule: nothing here is its own subject.
    const broad = [...BOOKS, "poetry", "essays", "publishing", "libraries"];
    const inside = [...BOOKS];
    const { restore, rejected } = selectRepairTargets(
      [candidate("broad", broad, 200), candidate("inside", inside, 20)],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["broad"]);
    expect(rejected[0]).toMatchObject({
      reason: "duplicate-of-repaired-topic",
      coveredBy: "broad",
    });
  });

  it("is stable regardless of input order", () => {
    const rows = [
      candidate("a", BOOKS, 50),
      candidate("b", MUSIC, 50),
      candidate("c", BOOKS, 10),
    ];
    const forward = selectRepairTargets(rows, [], MAX_COVERAGE);
    const backward = selectRepairTargets(rows.toReversed(), [], MAX_COVERAGE);

    expect(forward.restore.map((topic) => topic.slug)).toEqual(
      backward.restore.map((topic) => topic.slug),
    );
  });

  it("breaks reach ties on slug so the dry run predicts the apply", () => {
    const { restore } = selectRepairTargets(
      [candidate("zebra", BOOKS, 40), candidate("alpha", BOOKS, 40)],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["alpha"]);
  });
});

describe("selectRepairTargets — display-name guard", () => {
  it("drops a candidate sharing a live topic's name", () => {
    // Tag overlap can sit under the threshold while the namer has already
    // said, twice, that these are the same subject.
    const { restore, rejected } = selectRepairTargets(
      [candidate("tv-and-streaming", BOOKS, 81, "TV and Streaming")],
      [{ slug: "tv-live", name: "tv and streaming", tags: MUSIC }],
      MAX_COVERAGE,
    );

    expect(restore).toEqual([]);
    expect(rejected[0]).toMatchObject({
      reason: "duplicate-name-of-live-topic",
      coveredBy: "tv-live",
    });
  });

  it("keeps only the widest of same-named candidates", () => {
    // The real trio: three "Live Music and Festivals" rows, none of which
    // covers another by tags.
    const { restore, rejected } = selectRepairTargets(
      [
        candidate(
          "live-music-3",
          ["gigs", "venues"],
          20,
          "Live Music and Festivals",
        ),
        candidate(
          "live-music-1",
          ["tour dates", "concerts"],
          125,
          "Live Music and Festivals",
        ),
        candidate(
          "live-music-2",
          ["festivals", "tickets"],
          60,
          "Live Music and Festivals",
        ),
      ],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["live-music-1"]);
    expect(rejected).toHaveLength(2);
    expect(
      rejected.every(
        (row) =>
          row.reason === "duplicate-name-of-repaired-topic" &&
          row.coveredBy === "live-music-1",
      ),
    ).toBe(true);
  });

  it("compares names ignoring case and surrounding space", () => {
    const { restore } = selectRepairTargets(
      [
        candidate("a", MUSIC, 50, "  Books and Reading "),
        candidate("b", BOOKS, 40, "books and reading"),
      ],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["a"]);
  });

  it("still restores distinct subjects that merely read alike", () => {
    const { restore } = selectRepairTargets(
      [
        candidate("a", BOOKS, 50, "Books and Reading"),
        candidate("b", MUSIC, 40, "Books and the Writing Life"),
      ],
      [],
      MAX_COVERAGE,
    );

    expect(restore.map((topic) => topic.slug)).toEqual(["a", "b"]);
  });
});
