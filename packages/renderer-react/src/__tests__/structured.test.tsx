import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  offprintBlocks,
  structuredFormatBlocks,
} from "@standard-reader/renderer-core";
import { StandardDocumentRenderer } from "../render/document";
import type { StandardSiteDocument } from "../types";
import { offprint, offprintDoc } from "./fixtures";

describe("offprint rendering (shared structured vocabulary)", () => {
  it("renders text, heading and callout blocks", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={offprintDoc([
          offprint.heading("Off Heading", 2),
          offprint.text("Off body"),
          offprint.callout("Heads up", "⚠️"),
        ])}
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Off Heading");
    expect(container.querySelector("p")?.textContent).toBe("Off body");
    const callout = container.querySelector("aside[role='note']");
    expect(callout?.textContent).toContain("Heads up");
    expect(callout?.textContent).toContain("⚠️");
  });

  it("delegates offprint component blocks to the platform component", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={offprintDoc([
          offprint.component("at://did:plc:x/app.offprint.component/1"),
        ])}
        components={{
          offprint: {
            Component: ({ componentUri }) => <div data-cmp={componentUri} />,
          },
        }}
      />,
    );
    expect(
      container.querySelector<HTMLElement>("[data-cmp]")?.dataset.cmp,
    ).toBe("at://did:plc:x/app.offprint.component/1");
  });
});

describe("structured third-party formats", () => {
  it("parses and renders a ProseMirror (wss) rich-text document", () => {
    const doc: StandardSiteDocument = {
      content: {
        $type: "com.wss.content.rich-text",
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "prosemirror paragraph" }],
            },
          ],
        },
      },
    };
    // Sanity-check the parser recognizes the format, then the renderer.
    expect(structuredFormatBlocks(doc.content)).not.toBeNull();
    const { container } = render(<StandardDocumentRenderer document={doc} />);
    expect(container.textContent).toContain("prosemirror paragraph");
  });

  it("resolves the format from contentFormat when the payload has no $type", () => {
    const blocks = offprintBlocks({
      $type: "app.offprint.content",
      items: [offprint.text("via content format")],
    });
    expect(blocks).toHaveLength(1);
  });
});
