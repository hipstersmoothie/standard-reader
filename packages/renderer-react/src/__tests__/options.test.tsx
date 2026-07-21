import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandardDocumentRenderer } from "../render/document";
import { leaflet, leafletDoc } from "./fixtures";

describe("rendering options", () => {
  it("marks the first paragraph with dropCap when enabled", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([
          leaflet.image("cid1", "hero"),
          leaflet.text("First paragraph"),
          leaflet.text("Second paragraph"),
        ])}
        options={{ dropCap: true }}
      />,
    );
    const dropCapped = container.querySelectorAll("p[data-drop-cap]");
    expect(dropCapped).toHaveLength(1);
    expect(dropCapped[0]?.textContent).toBe("First paragraph");
  });

  it("does not drop-cap when the option is off", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([leaflet.text("Para")])}
      />,
    );
    expect(container.querySelector("p[data-drop-cap]")).toBeNull();
  });

  it("skips a leading image when skipLeadingImage is set", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([
          leaflet.image("cid1", "hero"),
          leaflet.text("Body"),
        ])}
        options={{ skipLeadingImage: true }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Body");
  });

  it("drops a leading heading that duplicates the description", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc(
          [leaflet.header("My Title", 1), leaflet.text("Body")],
          {
            description: "My Title",
          },
        )}
      />,
    );
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Body");
  });

  it("keeps a leading heading that does not match the description", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={leafletDoc([leaflet.header("Different", 1)], {
          description: "My Title",
        })}
      />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Different");
  });
});
