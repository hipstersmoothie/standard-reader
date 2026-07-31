import { describe, expect, it } from "vitest";

import {
  ARCHIVE_ORDER_MAX_ENTRIES,
  archiveOrderKey,
  defaultArchiveOrder,
  parseArchiveOrderCookie,
  readArchiveOrderOverride,
  withArchiveOrderOverride,
} from "./archive-order";

const FITV =
  "at://did:plc:wt6bh5dtjdps7umi7yhidooi/site.standard.publication/3motlkh52yc2s";
const OTHER =
  "at://did:plc:3ybmffzonpn33xdibmdosuba/site.standard.publication/3mrqy5ecbfk2l";

describe("archiveOrderKey", () => {
  it("keeps only the parts that identify the publication", () => {
    expect(archiveOrderKey(FITV)).toBe(
      "did:plc:wt6bh5dtjdps7umi7yhidooi/3motlkh52yc2s",
    );
  });

  it("refuses anything that isn't a publication at-uri", () => {
    expect(archiveOrderKey("https://example.com")).toBeNull();
    expect(archiveOrderKey("at://did:plc:abc")).toBeNull();
    expect(archiveOrderKey("")).toBeNull();
  });
});

describe("defaultArchiveOrder", () => {
  it("leads with chapter one for a serial and the latest post otherwise", () => {
    expect(defaultArchiveOrder(true)).toBe("oldest");
    expect(defaultArchiveOrder(false)).toBe("newest");
  });
});

describe("the cookie", () => {
  it("round-trips one publication's override", () => {
    const cookie = withArchiveOrderOverride(null, FITV, "newest");
    expect(readArchiveOrderOverride(cookie, FITV)).toBe("newest");
  });

  it("says nothing about a publication the reader hasn't touched", () => {
    const cookie = withArchiveOrderOverride(null, FITV, "newest");
    expect(readArchiveOrderOverride(cookie, OTHER)).toBeNull();
  });

  it("holds overrides for several publications at once", () => {
    let cookie = withArchiveOrderOverride(null, FITV, "newest");
    cookie = withArchiveOrderOverride(cookie, OTHER, "oldest");
    expect(readArchiveOrderOverride(cookie, FITV)).toBe("newest");
    expect(readArchiveOrderOverride(cookie, OTHER)).toBe("oldest");
  });

  it("replaces rather than appends when the same publication is set again", () => {
    let cookie = withArchiveOrderOverride(null, FITV, "newest");
    cookie = withArchiveOrderOverride(cookie, FITV, "oldest");
    expect(readArchiveOrderOverride(cookie, FITV)).toBe("oldest");
    expect(parseArchiveOrderCookie(cookie).size).toBe(1);
  });

  it("drops the override touched longest ago once it is full", () => {
    let cookie = "";
    for (let i = 0; i <= ARCHIVE_ORDER_MAX_ENTRIES; i++) {
      cookie = withArchiveOrderOverride(
        cookie,
        `at://did:plc:pub${i}/site.standard.publication/rkey${i}`,
        "newest",
      );
    }
    const parsed = parseArchiveOrderCookie(cookie);
    expect(parsed.size).toBe(ARCHIVE_ORDER_MAX_ENTRIES);
    // The first one set is the one that fell off; the most recent survives.
    expect(parsed.has("did:plc:pub0/rkey0")).toBe(false);
    expect(
      parsed.has(
        `did:plc:pub${ARCHIVE_ORDER_MAX_ENTRIES}/rkey${ARCHIVE_ORDER_MAX_ENTRIES}`,
      ),
    ).toBe(true);
  });

  it("keeps the entries it can read when the cookie is partly garbage", () => {
    const good = withArchiveOrderOverride(null, FITV, "oldest");
    const parsed = parseArchiveOrderCookie(`bogus!${good}!=x!key=zzz`);
    expect(parsed.size).toBe(1);
    expect(readArchiveOrderOverride(`bogus!${good}`, FITV)).toBe("oldest");
  });

  it("reads an absent or empty cookie as no overrides", () => {
    expect(parseArchiveOrderCookie(null).size).toBe(0);
    expect(parseArchiveOrderCookie("").size).toBe(0);
    expect(readArchiveOrderOverride(undefined, FITV)).toBeNull();
  });
});
