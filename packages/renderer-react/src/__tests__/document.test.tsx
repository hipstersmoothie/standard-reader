import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  hasFacetKind,
  segmentFacetedText,
  StandardDocumentRenderer,
} from "../index";
import { facet, LEAFLET_FACETS, leaflet } from "./fixtures";

describe("document-level behavior", () => {
  it("returns null for an unknown content format", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={{ content: { $type: "com.unknown.format", foo: 1 } }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when content has no format at all", () => {
    const { container } = render(
      <StandardDocumentRenderer document={{ content: { foo: 1 } }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("falls back to contentFormat when the payload has no $type", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={{
          contentFormat: "pub.leaflet.content",
          authorDid: "did:plc:x",
          content: {
            pages: [
              {
                $type: "pub.leaflet.pages.linearDocument",
                id: "p1",
                blocks: [leaflet.text("from content format")],
              },
            ],
          },
        }}
      />,
    );
    expect(container.querySelector("p")?.textContent).toBe(
      "from content format",
    );
  });
});

describe("facet helpers", () => {
  it("segments plaintext by byte-indexed facets", () => {
    const segments = segmentFacetedText("Hello bold world", [
      facet(6, 10, LEAFLET_FACETS.bold),
    ]);
    expect(segments.map((s) => s.text)).toEqual(["Hello ", "bold", " world"]);
    expect(hasFacetKind(segments[1]!.features, "bold")).toBe(true);
    expect(hasFacetKind(segments[0]!.features, "bold")).toBe(false);
  });

  it("returns a single plain segment when there are no facets", () => {
    const segments = segmentFacetedText("plain text", undefined);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.features).toHaveLength(0);
  });
});
