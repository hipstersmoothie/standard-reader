import { describe, expect, it } from "vitest";

import type { ArticleCardLabel } from "#/integrations/tanstack-query/api-shapes";

import type { LabelableCard } from "./label-subjects";
import {
  attachLabelsFromMap,
  hiddenUrisFromLabels,
  isCardHidden,
  isRenderableLabelSubject,
  labelSubjects,
  mergeLabels,
} from "./label-subjects";

const DOC = "at://did:plc:author/site.standard.document/abc";
const AUTHOR = "did:plc:author";
const PUB_SEARCH = "did:plc:aywbh7hovtsqpv2pzkldmqdv";

function label(
  src: string,
  val: string,
  visibility: ArticleCardLabel["visibility"] = "warn",
): ArticleCardLabel {
  return { src, val, visibility };
}

describe("labelSubjects", () => {
  it("collects both the document URI and the author DID", () => {
    expect(labelSubjects([{ uri: DOC, did: AUTHOR }])).toEqual([DOC, AUTHOR]);
  });

  it("omits the DID when a card has none", () => {
    expect(labelSubjects([{ uri: DOC }, { uri: DOC, did: null }])).toEqual([
      DOC,
      DOC,
    ]);
  });
});

describe("mergeLabels", () => {
  it("keeps labels from both sides", () => {
    const merged = mergeLabels(
      [label("did:web:claudeslop", "ai-writing")],
      [label(PUB_SEARCH, "bulk-generated")],
    );
    expect(merged).toHaveLength(2);
  });

  it("dedupes a (src, val) present on both the document and the account", () => {
    const merged = mergeLabels(
      [label(PUB_SEARCH, "bulk-generated", "hide")],
      [label(PUB_SEARCH, "bulk-generated", "warn")],
    );
    // The document-side entry wins, so the card is not badged twice.
    expect(merged).toEqual([label(PUB_SEARCH, "bulk-generated", "hide")]);
  });

  it("returns the other side when one is empty", () => {
    const only = [label(PUB_SEARCH, "bulk-generated")];
    const none = undefined;
    expect(mergeLabels([], only)).toBe(only);
    expect(mergeLabels(only, none)).toBe(only);
    expect(mergeLabels(none, none)).toBeUndefined();
  });
});

describe("attachLabelsFromMap", () => {
  it("attaches a label applied to the author's account, not the document", () => {
    // The case that matters for network labelers: nothing labels the document,
    // yet the card must still surface the publisher's label.
    const byUri = new Map([[AUTHOR, [label(PUB_SEARCH, "bulk-generated")]]]);
    const cards: Array<LabelableCard> = [{ uri: DOC, did: AUTHOR }];
    const [card] = attachLabelsFromMap(cards, byUri);
    expect(card?.labels).toEqual([label(PUB_SEARCH, "bulk-generated")]);
  });

  it("combines document and account labels on one card", () => {
    const byUri = new Map([
      [DOC, [label("did:web:claudeslop", "ai-writing")]],
      [AUTHOR, [label(PUB_SEARCH, "bulk-generated")]],
    ]);
    const cards: Array<LabelableCard> = [{ uri: DOC, did: AUTHOR }];
    const [card] = attachLabelsFromMap(cards, byUri);
    expect(card?.labels).toHaveLength(2);
  });

  it("leaves cards untouched when nothing is labeled", () => {
    const cards = [{ uri: DOC, did: AUTHOR }];
    expect(attachLabelsFromMap(cards, new Map())).toBe(cards);
  });
});

describe("isCardHidden", () => {
  it("hides a card whose author is hidden, even when the document is not", () => {
    expect(isCardHidden({ uri: DOC, did: AUTHOR }, new Set([AUTHOR]))).toBe(
      true,
    );
  });

  it("hides a card whose document is hidden", () => {
    expect(isCardHidden({ uri: DOC, did: AUTHOR }, new Set([DOC]))).toBe(true);
  });

  it("keeps a card when neither subject is hidden", () => {
    expect(isCardHidden({ uri: DOC, did: AUTHOR }, new Set(["other"]))).toBe(
      false,
    );
  });
});

describe("hiddenUrisFromLabels", () => {
  it("collects only subjects with a hide-visibility label", () => {
    const byUri = new Map([
      [DOC, [label("src", "a", "warn")]],
      [AUTHOR, [label("src", "b", "hide")]],
    ]);
    expect(hiddenUrisFromLabels(byUri)).toEqual(new Set([AUTHOR]));
  });
});

describe("isRenderableLabelSubject", () => {
  it("keeps account DIDs — profiles, publication headers, bylines", () => {
    expect(isRenderableLabelSubject("did:plc:abc123")).toBe(true);
    expect(isRenderableLabelSubject("did:web:example.com")).toBe(true);
  });

  it("keeps standard.site documents — article cards and article pages", () => {
    expect(
      isRenderableLabelSubject("at://did:plc:abc/site.standard.document/xyz"),
    ).toBe(true);
  });

  it("drops Bluesky posts, which have no surface here", () => {
    // 62% of what labelers emit; mirroring it was pure dead weight.
    expect(
      isRenderableLabelSubject("at://did:plc:abc/app.bsky.feed.post/xyz"),
    ).toBe(false);
  });

  it("drops other record types we never render", () => {
    expect(
      isRenderableLabelSubject("at://did:plc:abc/app.bsky.actor.profile/self"),
    ).toBe(false);
    expect(
      isRenderableLabelSubject("at://did:plc:abc/app.bsky.graph.list/xyz"),
    ).toBe(false);
  });
});
