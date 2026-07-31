import { describe, expect, it } from "vitest";

import { convertDocumentContent } from "../convert.js";
import { summarizeIssues } from "../summary.js";
import {
  facet,
  leafletContent,
  lf,
  pcktFacet,
  pcktContent,
  pk,
} from "./fixtures.js";

describe("summarizeIssues", () => {
  it("collapses repeated issues and keeps the block indices", () => {
    const result = convertDocumentContent({
      content: pcktContent([
        pk.text("aaa", [facet(0, 3, pcktFacet("highlight"))]),
        pk.text("bbb", [facet(0, 3, pcktFacet("highlight"))]),
        pk.text("ccc", [facet(0, 3, pcktFacet("underline"))]),
      ]),
      target: "leaflet",
    });

    const summary = summarizeIssues(result.issues);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({
      blockIndices: [0, 1],
      count: 2,
      severity: "lossy",
    });
    expect(summary[0]?.message).toContain("highlight");
    expect(summary[1]?.blockIndices).toEqual([2]);
  });

  it("puts unsupported losses first, whatever their block order", () => {
    const result = convertDocumentContent({
      content: leafletContent([
        lf.math("x^2"),
        lf.poll("at://did:plc:a/pub.leaflet.poll/1"),
      ]),
      target: "pckt",
    });

    const summary = summarizeIssues(result.issues);
    expect(summary.map((entry) => entry.severity)).toEqual([
      "unsupported",
      "lossy",
    ]);
    expect(summary[0]?.blockType).toBe("leaflet.poll");
  });

  it("returns nothing for a clean conversion", () => {
    const result = convertDocumentContent({
      content: leafletContent([lf.text("Hello")]),
      target: "pckt",
    });
    expect(summarizeIssues(result.issues)).toEqual([]);
  });
});
