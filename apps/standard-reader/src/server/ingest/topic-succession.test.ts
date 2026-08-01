import { describe, expect, it } from "vitest";

import { clearsRetentionBar, findSuccessors } from "./topic-succession";
import type {
  ResolvedTopic,
  RetentionThresholds,
  StoredTopic,
  TopicShape,
} from "./topic-succession";

/** The production bar at the time of writing: 70% of each entry threshold. */
const BAR: RetentionThresholds = {
  minTags: 9.8,
  minPublications: 7,
  minAuthors: 3.5,
  maxTopAuthorShare: 0.6,
};

/** Comfortably above every threshold, so each test moves one axis at a time. */
function healthy(overrides: Partial<TopicShape> = {}): TopicShape {
  return {
    tagCount: 20,
    publicationCount: 40,
    authorCount: 30,
    topAuthorShare: 0.1,
    ...overrides,
  };
}

function resolved(
  slug: string,
  published: boolean,
  signature: Array<string>,
): ResolvedTopic {
  return { slug, published, signature };
}

function stored(slug: string, signatureTags: Array<string>): StoredTopic {
  return { slug, signatureTags };
}

const WEB = ["javascript", "react", "css", "frontend", "typescript"];
const MUSIC = ["vinyl", "jazz", "k-pop", "hip hop", "album"];

describe("clearsRetentionBar", () => {
  it("keeps a topic that is still comfortably substantial", () => {
    expect(clearsRetentionBar(healthy(), BAR)).toBe(true);
  });

  it("keeps a topic sitting between the entry bar and the retention bar", () => {
    // The whole point of hysteresis: 10 tags is below the entry floor of 14 but
    // above the retention floor, so a published topic that shrank stays up.
    expect(
      clearsRetentionBar(
        healthy({ tagCount: 10, publicationCount: 8, authorCount: 4 }),
        BAR,
      ),
    ).toBe(true);
  });

  it.each([
    ["tags", { tagCount: 9 }],
    ["publications", { publicationCount: 6 }],
    ["authors", { authorCount: 3 }],
  ])("drops a topic that fell below the %s floor", (_label, override) => {
    expect(clearsRetentionBar(healthy(override), BAR)).toBe(false);
  });

  it("drops a topic that became one operator's fleet", () => {
    // Concentration is the anti-fleet rule, so passing every count is not
    // enough — this is the shape the quality bar exists to exclude.
    expect(clearsRetentionBar(healthy({ topAuthorShare: 0.9 }), BAR)).toBe(
      false,
    );
  });

  it("treats each threshold as inclusive", () => {
    expect(
      clearsRetentionBar(
        healthy({ publicationCount: 7, authorCount: 3.5, topAuthorShare: 0.6 }),
        BAR,
      ),
    ).toBe(true);
  });
});

describe("findSuccessors", () => {
  it("points a dissolved topic at the one that absorbed it", () => {
    // `frontend` is gone from this sweep; Web Development carries its tags.
    const successors = findSuccessors(
      [resolved("web-development", true, WEB), resolved("music", true, MUSIC)],
      [stored("frontend", ["javascript", "react", "css"])],
      0.25,
    );

    expect(successors.get("frontend")).toBe("web-development");
  });

  it("uses the stored fingerprint when a topic has no cluster left", () => {
    // Nothing in `resolved` mentions `frontend`, so its last-known signature is
    // the only evidence of what it was.
    const successors = findSuccessors(
      [resolved("music", true, MUSIC)],
      [stored("frontend", ["javascript", "react", "css"])],
      0.25,
    );

    expect(successors.get("frontend")).toBeNull();
  });

  it("prefers a topic's fresh fingerprint over its stored one", () => {
    // It still has a cluster — it just missed the bar — and that cluster now
    // looks like music, whatever it used to be.
    const successors = findSuccessors(
      [
        resolved("music", true, MUSIC),
        resolved("web-development", true, WEB),
        resolved("drifted", false, ["vinyl", "jazz", "k-pop"]),
      ],
      [stored("drifted", ["javascript", "react", "css"])],
      0.25,
    );

    expect(successors.get("drifted")).toBe("music");
  });

  it("returns null rather than an unrelated topic below the floor", () => {
    const successors = findSuccessors(
      [resolved("music", true, MUSIC)],
      [stored("gone", ["kubernetes", "docker", "terraform"])],
      0.25,
    );

    expect(successors.has("gone")).toBe(true);
    expect(successors.get("gone")).toBeNull();
  });

  it("treats the similarity floor as inclusive", () => {
    // Exactly 0.25 Jaccard: 2 tags shared, 8 distinct across the two sets.
    const successors = findSuccessors(
      [resolved("target", true, ["a", "b", "c", "d", "e", "f", "g", "h"])],
      [stored("gone", ["a", "b"])],
      0.25,
    );

    expect(successors.get("gone")).toBe("target");
  });

  it("never nominates an unpublished topic as a successor", () => {
    // Redirecting to a topic that is itself gone would just move the 404.
    const successors = findSuccessors(
      [
        resolved("also-gone", false, ["javascript", "react", "css"]),
        resolved("music", true, MUSIC),
      ],
      [stored("frontend", ["javascript", "react", "css"])],
      0.25,
    );

    expect(successors.get("frontend")).toBeNull();
  });

  it("picks the closest of several plausible successors", () => {
    const successors = findSuccessors(
      [
        resolved("web-development", true, WEB),
        resolved("javascript-only", true, ["javascript", "react"]),
      ],
      [stored("frontend", ["javascript", "react"])],
      0.25,
    );

    expect(successors.get("frontend")).toBe("javascript-only");
  });

  it("breaks ties on slug so an unchanged sweep rewrites nothing", () => {
    const targets = [
      resolved("zebra", true, ["javascript", "react"]),
      resolved("alpha", true, ["javascript", "react"]),
    ];
    const gone = [stored("frontend", ["javascript", "react"])];

    expect(findSuccessors(targets, gone, 0.25).get("frontend")).toBe("alpha");
    expect(
      findSuccessors(targets.toReversed(), gone, 0.25).get("frontend"),
    ).toBe("alpha");
  });

  it("leaves published topics out entirely", () => {
    const successors = findSuccessors(
      [resolved("music", true, MUSIC)],
      [stored("music", MUSIC)],
      0.25,
    );

    expect(successors.has("music")).toBe(false);
  });

  it("records nothing when the sweep published nothing", () => {
    // Every topic is unpublished, so there is no target — better to leave the
    // existing pointers alone than to blank them all.
    expect(
      findSuccessors(
        [resolved("music", false, MUSIC)],
        [stored("frontend", WEB)],
        0.25,
      ).size,
    ).toBe(0);
  });
});
