import { describe, expect, it } from "vitest";

import { standaloneImageParagraph } from "./standalone-image-paragraph";

const img = (properties: Record<string, unknown>) => ({
  type: "element",
  tagName: "img",
  properties,
  children: [],
});

const text = (value: string) => ({ type: "text", value });

describe("standaloneImageParagraph", () => {
  it("returns alt and title for a lone captioned image", () => {
    expect(
      standaloneImageParagraph({
        type: "element",
        tagName: "p",
        children: [img({ src: "u", alt: "Alt text", title: "Caption" })],
      }),
    ).toEqual({ alt: "Alt text", title: "Caption" });
  });

  it("ignores insignificant whitespace around the image", () => {
    expect(
      standaloneImageParagraph({
        children: [text("\n"), img({ src: "u", alt: "Alt" }), text("  ")],
      }),
    ).toEqual({ alt: "Alt", title: undefined });
  });

  it("returns null when real text sits alongside the image", () => {
    expect(
      standaloneImageParagraph({
        children: [text("see "), img({ src: "u", alt: "Alt" })],
      }),
    ).toBeNull();
  });

  it("returns null for two images in one paragraph", () => {
    expect(
      standaloneImageParagraph({
        children: [img({ src: "a" }), img({ src: "b" })],
      }),
    ).toBeNull();
  });

  it("returns null when another element accompanies the image", () => {
    expect(
      standaloneImageParagraph({
        children: [
          img({ src: "u" }),
          { type: "element", tagName: "a", properties: {}, children: [] },
        ],
      }),
    ).toBeNull();
  });

  it("returns null for a text-only paragraph", () => {
    expect(
      standaloneImageParagraph({ children: [text("just prose")] }),
    ).toBeNull();
  });

  it("returns null for a node with no children", () => {
    const empties: Array<Parameters<typeof standaloneImageParagraph>[0]> = [
      {},
      undefined,
      null,
    ];
    for (const node of empties) {
      expect(standaloneImageParagraph(node)).toBeNull();
    }
  });

  it("drops non-string alt/title values", () => {
    expect(
      standaloneImageParagraph({
        children: [img({ src: "u", alt: 42, title: true })],
      }),
    ).toEqual({ alt: undefined, title: undefined });
  });
});
