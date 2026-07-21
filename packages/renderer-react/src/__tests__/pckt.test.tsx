import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandardDocumentRenderer } from "../render/document";
import { pckt, pcktDoc } from "./fixtures";

describe("pckt rendering", () => {
  it("renders headings and paragraphs", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={pcktDoc([pckt.heading("Heading", 2), pckt.text("Body text")])}
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Heading");
    expect(container.querySelector("p")?.textContent).toBe("Body text");
  });

  it("renders bullet lists from nested inline content", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={pcktDoc([pckt.bulletList(["alpha", "beta", "gamma"])])}
      />,
    );
    const items = container.querySelectorAll("ul > li");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toBe("alpha");
  });

  it("renders code blocks", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={pcktDoc([pckt.code("print(1)", "python")])}
      />,
    );
    expect(container.querySelector("pre code")?.className).toBe(
      "language-python",
    );
  });

  it("delegates gallery blocks to the pckt platform component", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={pcktDoc([pckt.gallery("at://did:plc:x/gallery/1")])}
        components={{
          pckt: {
            Gallery: ({ ref }) => <div data-gallery={ref} />,
          },
        }}
      />,
    );
    expect(
      container.querySelector<HTMLElement>("[data-gallery]")?.dataset.gallery,
    ).toBe("at://did:plc:x/gallery/1");
  });

  it("renders nothing for an unsupported/empty document", () => {
    const { container } = render(
      <StandardDocumentRenderer document={pcktDoc([])} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
