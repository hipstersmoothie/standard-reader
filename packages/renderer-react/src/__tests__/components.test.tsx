import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { defaultComponents, mergeComponents } from "../index";
import { StandardDocumentRenderer } from "../render/document";
import { leaflet, leafletDoc } from "./fixtures";

const CustomParagraph = () => <p>custom</p>;

describe("component customization", () => {
  it("merges partial overrides over defaults, leaving the rest intact", () => {
    const merged = mergeComponents({ shared: { Paragraph: CustomParagraph } });
    expect(merged.shared.Paragraph).toBe(CustomParagraph);
    // Untouched components stay the defaults.
    expect(merged.shared.Heading).toBe(defaultComponents.shared.Heading);
    expect(merged.leaflet.Poll).toBe(defaultComponents.leaflet.Poll);
  });

  it("returns the defaults unchanged when no overrides are given", () => {
    expect(mergeComponents()).toBe(defaultComponents);
  });

  it("uses an overridden shared Root to wrap the body", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([leaflet.text("hi")])}
        components={{
          shared: {
            Root: ({ children }) => (
              <article className="prose">{children}</article>
            ),
          },
        }}
      />,
    );
    expect(container.querySelector("article.prose")).not.toBeNull();
    expect(container.querySelector("div[dir='auto']")).toBeNull();
  });

  it("lets a custom Heading component control tag and attributes", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([leaflet.header("Styled", 3)])}
        components={{
          shared: {
            Heading: ({ level, children }) => (
              <p data-heading="" data-level={level}>
                {children}
              </p>
            ),
          },
        }}
      />,
    );
    const heading = container.querySelector<HTMLElement>("[data-heading]");
    expect(heading?.dataset.level).toBe("3");
    expect(heading?.textContent).toBe("Styled");
  });

  it("renders data-backed platform blocks as nothing by default", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([
          leaflet.standardSitePublication(
            "at://did:plc:x/site.standard.publication/1",
          ),
        ])}
      />,
    );
    // The default StandardSitePublication renders null → empty Root.
    expect(container.querySelector("div[dir='auto']")?.textContent).toBe("");
  });
});
